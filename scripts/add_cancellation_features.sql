-- Add cancellation fields to bookings table
ALTER TABLE bookings 
ADD COLUMN cancellationReason TEXT NULL,
ADD COLUMN cancelledAt DATETIME NULL,
ADD COLUMN refundAmount DECIMAL(10,2) NULL,
ADD COLUMN cancellationCharges DECIMAL(10,2) NULL;

-- Update booking status enum to include SUCCESS
ALTER TABLE bookings 
MODIFY COLUMN bookingStatus ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'SUCCESS') DEFAULT 'PENDING';

-- Create refunds table
CREATE TABLE IF NOT EXISTS refunds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  user_id INT NOT NULL,
  original_amount DECIMAL(10,2) NOT NULL,
  refund_amount DECIMAL(10,2) NOT NULL,
  cancellation_charges DECIMAL(10,2) NOT NULL DEFAULT 0,
  refund_status ENUM('PENDING', 'APPROVED', 'REJECTED', 'PROCESSED', 'NOT_APPLICABLE') NOT NULL DEFAULT 'PENDING',
  refund_reason TEXT NULL,
  hours_before_departure INT NULL,
  admin_notes TEXT NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  processed_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL,
  
  INDEX idx_refunds_booking_id (booking_id),
  INDEX idx_refunds_user_id (user_id),
  INDEX idx_refunds_status (refund_status)
);

-- Add refund_amount column to payments table if it doesn't exist
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10,2) NULL DEFAULT 0;