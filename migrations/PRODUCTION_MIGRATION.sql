-- ========================================
-- PRODUCTION MIGRATION: Guest Booking Support
-- ========================================
-- Date: 2025-02-21
-- Description: Enables guest bookings (booking without login) with booking-first flow
-- 
-- IMPORTANT: This migration is IDEMPOTENT - safe to run multiple times
-- It will only add columns that don't exist and modify existing ones
-- ========================================

-- Replace 'your_database_name' with your actual production database name
-- USE your_database_name;

-- ========================================
-- STEP 1: Add new columns for guest booking support
-- ========================================

-- Add guest booking fields to bookings table
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS guest_booking BOOLEAN DEFAULT FALSE COMMENT 'True if booking made without login';

ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS guest_email VARCHAR(255) COMMENT 'Email for guest bookings';

ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS guest_phone VARCHAR(20) COMMENT 'Phone for guest bookings';

ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS booking_expires_at TIMESTAMP NULL COMMENT 'Expiry time for pending bookings (15 min)';

-- Add status column to booked_seats
ALTER TABLE booked_seats 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'CONFIRMED' COMMENT 'HOLD, CONFIRMED, or RELEASED';

-- Add guest booking fields to helicopter_bookings table
ALTER TABLE helicopter_bookings 
ADD COLUMN IF NOT EXISTS guest_booking BOOLEAN DEFAULT FALSE COMMENT 'True if booking made without login';

ALTER TABLE helicopter_bookings 
ADD COLUMN IF NOT EXISTS guest_email VARCHAR(255) COMMENT 'Email for guest bookings';

ALTER TABLE helicopter_bookings 
ADD COLUMN IF NOT EXISTS guest_phone VARCHAR(20) COMMENT 'Phone for guest bookings';

ALTER TABLE helicopter_bookings 
ADD COLUMN IF NOT EXISTS booking_expires_at TIMESTAMP NULL COMMENT 'Expiry time for pending bookings (15 min)';

-- Add status column to helicopter_booked_seats
ALTER TABLE helicopter_booked_seats 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'CONFIRMED' COMMENT 'HOLD, CONFIRMED, or RELEASED';

-- ========================================
-- STEP 2: Modify columns to allow NULL (CRITICAL for guest bookings)
-- ========================================

-- Allow NULL for bookedUserId in bookings (guest bookings have no user)
ALTER TABLE bookings 
MODIFY COLUMN bookedUserId BIGINT UNSIGNED NULL COMMENT 'NULL for guest bookings, user ID for logged-in users';

-- Allow NULL for bookedUserId in helicopter_bookings
ALTER TABLE helicopter_bookings 
MODIFY COLUMN bookedUserId BIGINT UNSIGNED NULL COMMENT 'NULL for guest bookings, user ID for logged-in users';

-- Allow NULL for payment_id (filled after payment succeeds)
ALTER TABLE payments 
MODIFY COLUMN payment_id VARCHAR(255) NULL COMMENT 'NULL until payment completes';

-- Allow NULL for user_id in payments (guest bookings have no user)
ALTER TABLE payments 
MODIFY COLUMN user_id BIGINT UNSIGNED NULL COMMENT 'NULL for guest bookings';

-- Allow NULL for user_id in helicopter_payments
ALTER TABLE helicopter_payments 
MODIFY COLUMN user_id BIGINT UNSIGNED NULL COMMENT 'NULL for guest bookings';

-- Allow NULL for user_id in billing_details
ALTER TABLE billing_details 
MODIFY COLUMN user_id BIGINT UNSIGNED NULL COMMENT 'NULL for guest bookings';

-- ========================================
-- STEP 3: Create indexes for performance
-- ========================================

-- Index for cleanup job (finds expired bookings)
CREATE INDEX IF NOT EXISTS idx_booking_expires 
ON bookings(booking_expires_at, bookingStatus);

-- Index for guest booking queries
CREATE INDEX IF NOT EXISTS idx_guest_bookings 
ON bookings(guest_booking, guest_email);

-- Index for booking status filtering
CREATE INDEX IF NOT EXISTS idx_booking_status 
ON bookings(bookingStatus, paymentStatus);

-- Helicopter booking indexes
CREATE INDEX IF NOT EXISTS idx_heli_booking_expires 
ON helicopter_bookings(booking_expires_at, bookingStatus);

CREATE INDEX IF NOT EXISTS idx_heli_guest_bookings 
ON helicopter_bookings(guest_booking, guest_email);

-- ========================================
-- STEP 4: Update existing data
-- ========================================

-- Set guest_booking = FALSE for existing bookings (they were all logged-in users)
UPDATE bookings 
SET guest_booking = FALSE 
WHERE guest_booking IS NULL;

UPDATE helicopter_bookings 
SET guest_booking = FALSE 
WHERE guest_booking IS NULL;

-- Set status = CONFIRMED for existing booked seats
UPDATE booked_seats 
SET status = 'CONFIRMED' 
WHERE status IS NULL;

UPDATE helicopter_booked_seats 
SET status = 'CONFIRMED' 
WHERE status IS NULL;

-- ========================================
-- VERIFICATION QUERIES
-- ========================================

SELECT '========================================' AS '';
SELECT '✅ MIGRATION COMPLETED SUCCESSFULLY' AS '';
SELECT '========================================' AS '';
SELECT '' AS '';

-- Verify bookings table
SELECT 'Bookings table - bookedUserId:' AS verification, 
       COLUMN_TYPE, IS_NULLABLE 
FROM information_schema.COLUMNS 
WHERE TABLE_NAME = 'bookings' 
  AND COLUMN_NAME = 'bookedUserId'
  AND TABLE_SCHEMA = DATABASE();

-- Verify payments table
SELECT 'Payments table - user_id:' AS verification, 
       COLUMN_TYPE, IS_NULLABLE 
FROM information_schema.COLUMNS 
WHERE TABLE_NAME = 'payments' 
  AND COLUMN_NAME = 'user_id'
  AND TABLE_SCHEMA = DATABASE();

-- Verify billing table
SELECT 'Billing table - user_id:' AS verification, 
       COLUMN_TYPE, IS_NULLABLE 
FROM information_schema.COLUMNS 
WHERE TABLE_NAME = 'billing_details' 
  AND COLUMN_NAME = 'user_id'
  AND TABLE_SCHEMA = DATABASE();

-- Check new columns exist
SELECT 'New columns in bookings:' AS verification, 
       COUNT(*) as column_count
FROM information_schema.COLUMNS 
WHERE TABLE_NAME = 'bookings' 
  AND COLUMN_NAME IN ('guest_booking', 'guest_email', 'guest_phone', 'booking_expires_at')
  AND TABLE_SCHEMA = DATABASE();

SELECT '' AS '';
SELECT '========================================' AS '';
SELECT 'Expected results:' AS '';
SELECT '- bookedUserId: bigint unsigned, IS_NULLABLE = YES' AS '';
SELECT '- user_id: bigint unsigned, IS_NULLABLE = YES' AS '';
SELECT '- column_count: 4 (all new columns exist)' AS '';
SELECT '========================================' AS '';
SELECT '' AS '';
SELECT '🎉 If all checks pass, restart your backend server!' AS '';
SELECT '========================================' AS '';

-- ========================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- ========================================
-- 
-- If you need to rollback this migration, run:
-- 
-- ALTER TABLE bookings DROP COLUMN IF EXISTS guest_booking;
-- ALTER TABLE bookings DROP COLUMN IF EXISTS guest_email;
-- ALTER TABLE bookings DROP COLUMN IF EXISTS guest_phone;
-- ALTER TABLE bookings DROP COLUMN IF EXISTS booking_expires_at;
-- ALTER TABLE bookings MODIFY COLUMN bookedUserId BIGINT UNSIGNED NOT NULL;
-- 
-- ALTER TABLE booked_seats DROP COLUMN IF EXISTS status;
-- 
-- ALTER TABLE helicopter_bookings DROP COLUMN IF EXISTS guest_booking;
-- ALTER TABLE helicopter_bookings DROP COLUMN IF EXISTS guest_email;
-- ALTER TABLE helicopter_bookings DROP COLUMN IF EXISTS guest_phone;
-- ALTER TABLE helicopter_bookings DROP COLUMN IF EXISTS booking_expires_at;
-- ALTER TABLE helicopter_bookings MODIFY COLUMN bookedUserId BIGINT UNSIGNED NOT NULL;
-- 
-- ALTER TABLE helicopter_booked_seats DROP COLUMN IF EXISTS status;
-- 
-- ALTER TABLE payments MODIFY COLUMN payment_id VARCHAR(255) NOT NULL;
-- ALTER TABLE payments MODIFY COLUMN user_id BIGINT UNSIGNED NOT NULL;
-- ALTER TABLE helicopter_payments MODIFY COLUMN user_id BIGINT UNSIGNED NOT NULL;
-- ALTER TABLE billing_details MODIFY COLUMN user_id BIGINT UNSIGNED NOT NULL;
-- 
-- DROP INDEX IF EXISTS idx_booking_expires ON bookings;
-- DROP INDEX IF EXISTS idx_guest_bookings ON bookings;
-- DROP INDEX IF EXISTS idx_booking_status ON bookings;
-- DROP INDEX IF EXISTS idx_heli_booking_expires ON helicopter_bookings;
-- DROP INDEX IF EXISTS idx_heli_guest_bookings ON helicopter_bookings;
-- 
-- ========================================
