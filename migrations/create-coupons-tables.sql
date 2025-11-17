-- Migration: Create coupons and coupon_usage tables
-- Date: 2024-11-17

-- Create coupons table
CREATE TABLE IF NOT EXISTS coupons (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE COMMENT 'Unique coupon code',
  discount_type ENUM('percentage', 'fixed') NOT NULL DEFAULT 'percentage' COMMENT 'Type of discount',
  discount_value DECIMAL(10, 2) NOT NULL COMMENT 'Discount value',
  max_discount DECIMAL(10, 2) NULL COMMENT 'Maximum discount amount for percentage type',
  min_booking_amount DECIMAL(10, 2) DEFAULT 0 COMMENT 'Minimum booking amount required',
  usage_limit INT NULL COMMENT 'Total usage limit (null = unlimited)',
  used_count INT NOT NULL DEFAULT 0 COMMENT 'Number of times used',
  valid_from DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Valid from date',
  valid_until DATETIME NOT NULL COMMENT 'Expiry date',
  status ENUM('active', 'inactive', 'expired') NOT NULL DEFAULT 'active' COMMENT 'Coupon status',
  description TEXT NULL COMMENT 'Coupon description',
  created_by BIGINT UNSIGNED NULL COMMENT 'Admin user ID',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_code (code),
  INDEX idx_status (status),
  INDEX idx_valid_dates (valid_from, valid_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create coupon_usage table
CREATE TABLE IF NOT EXISTS coupon_usage (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  coupon_id BIGINT UNSIGNED NOT NULL COMMENT 'Reference to coupon',
  user_id BIGINT UNSIGNED NULL COMMENT 'User who used coupon',
  booking_id BIGINT UNSIGNED NOT NULL COMMENT 'Booking where coupon was applied',
  original_amount DECIMAL(10, 2) NOT NULL COMMENT 'Original amount',
  discount_amount DECIMAL(10, 2) NOT NULL COMMENT 'Discount applied',
  final_amount DECIMAL(10, 2) NOT NULL COMMENT 'Final amount after discount',
  used_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'Usage timestamp',
  INDEX idx_coupon_id (coupon_id),
  INDEX idx_user_id (user_id),
  INDEX idx_booking_id (booking_id),
  FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample coupons
INSERT INTO coupons (code, discount_type, discount_value, max_discount, min_booking_amount, valid_from, valid_until, status, description) VALUES
('FLYOLA50', 'percentage', 10.00, 500.00, 1000.00, NOW(), DATE_ADD(NOW(), INTERVAL 6 MONTH), 'active', '10% off on bookings above ₹1000'),
('WELCOME100', 'fixed', 100.00, NULL, 500.00, NOW(), DATE_ADD(NOW(), INTERVAL 3 MONTH), 'active', 'Flat ₹100 off on first booking'),
('SUMMER2024', 'percentage', 15.00, 1000.00, 2000.00, NOW(), DATE_ADD(NOW(), INTERVAL 3 MONTH), 'active', '15% off on summer bookings');
