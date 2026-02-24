-- Critical fix: Allow NULL for user_id columns
-- This fixes the "Column 'user_id' cannot be null" error

USE flyola;

-- Most critical: Allow NULL for user_id in payments
ALTER TABLE payments MODIFY COLUMN user_id INT NULL;
ALTER TABLE payments MODIFY COLUMN payment_id VARCHAR(255) NULL;

-- Allow NULL for user_id in helicopter_payments
ALTER TABLE helicopter_payments MODIFY COLUMN user_id BIGINT UNSIGNED NULL;

-- Allow NULL for user_id in billing_details
ALTER TABLE billing_details MODIFY COLUMN user_id INT NULL;

-- Allow NULL for bookedUserId in bookings
ALTER TABLE bookings MODIFY COLUMN bookedUserId INT NULL;

-- Allow NULL for bookedUserId in helicopter_bookings
ALTER TABLE helicopter_bookings MODIFY COLUMN bookedUserId BIGINT UNSIGNED NULL;

-- Verify the changes
SELECT 'Payments table - user_id should allow NULL:' AS status;
SHOW COLUMNS FROM payments LIKE 'user_id';

SELECT 'Billing table - user_id should allow NULL:' AS status;
SHOW COLUMNS FROM billing_details LIKE 'user_id';

SELECT 'Bookings table - bookedUserId should allow NULL:' AS status;
SHOW COLUMNS FROM bookings LIKE 'bookedUserId';
