-- Simple fix: Allow NULL for user_id columns

USE flyola;

-- Critical fixes
ALTER TABLE payments MODIFY COLUMN payment_id VARCHAR(255) NULL;
ALTER TABLE payments MODIFY COLUMN user_id BIGINT UNSIGNED NULL;

ALTER TABLE helicopter_payments MODIFY COLUMN user_id BIGINT UNSIGNED NULL;

ALTER TABLE billing_details MODIFY COLUMN user_id BIGINT UNSIGNED NULL;

ALTER TABLE bookings MODIFY COLUMN bookedUserId BIGINT UNSIGNED NULL;

ALTER TABLE helicopter_bookings MODIFY COLUMN bookedUserId BIGINT UNSIGNED NULL;

SELECT 'Migration complete! Restart backend now.' AS status;
