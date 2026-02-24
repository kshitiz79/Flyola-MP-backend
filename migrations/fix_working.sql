-- Critical fix: Allow NULL for user_id columns

USE flyola;

-- Step 1: payments table
ALTER TABLE payments MODIFY COLUMN payment_id VARCHAR(255) NULL;
ALTER TABLE payments MODIFY COLUMN user_id BIGINT UNSIGNED NULL;

-- Step 2: helicopter_payments
ALTER TABLE helicopter_payments MODIFY COLUMN user_id BIGINT UNSIGNED NULL;

-- Step 3: billing_details - drop FK first (ignore error if doesn't exist)
ALTER TABLE billing_details DROP FOREIGN KEY billing_details_user_id_foreign;

-- Now modify column
ALTER TABLE billing_details MODIFY COLUMN user_id BIGINT UNSIGNED NULL;

-- Recreate FK
ALTER TABLE billing_details 
ADD CONSTRAINT billing_details_user_id_foreign 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Step 4: bookings
ALTER TABLE bookings MODIFY COLUMN bookedUserId BIGINT UNSIGNED NULL;

-- Step 5: helicopter_bookings
ALTER TABLE helicopter_bookings MODIFY COLUMN bookedUserId BIGINT UNSIGNED NULL;

-- Verify
SELECT '=== DONE! ===' AS status;
