-- Critical fix: Allow NULL for user_id columns
-- Properly handles data type mismatches

USE flyola;

-- Step 1: payments table - change to BIGINT UNSIGNED to match users.id
ALTER TABLE payments MODIFY COLUMN payment_id VARCHAR(255) NULL;
ALTER TABLE payments MODIFY COLUMN user_id BIGINT UNSIGNED NULL;

-- Step 2: helicopter_payments - already correct type
ALTER TABLE helicopter_payments MODIFY COLUMN user_id BIGINT UNSIGNED NULL;

-- Step 3: billing_details - drop FK, change type, recreate FK
ALTER TABLE billing_details DROP FOREIGN KEY IF EXISTS billing_details_user_id_foreign;
ALTER TABLE billing_details MODIFY COLUMN user_id BIGINT UNSIGNED NULL;
ALTER TABLE billing_details 
ADD CONSTRAINT billing_details_user_id_foreign 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Step 4: bookings - change to BIGINT UNSIGNED to match users.id
ALTER TABLE bookings MODIFY COLUMN bookedUserId BIGINT UNSIGNED NULL;

-- Step 5: helicopter_bookings - already correct
ALTER TABLE helicopter_bookings MODIFY COLUMN bookedUserId BIGINT UNSIGNED NULL;

-- Verify
SELECT '=== VERIFICATION ===' AS '';
SELECT 'payments.user_id:' AS field, IS_NULLABLE, COLUMN_TYPE 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = 'flyola' AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'user_id';

SELECT 'billing_details.user_id:' AS field, IS_NULLABLE, COLUMN_TYPE 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = 'flyola' AND TABLE_NAME = 'billing_details' AND COLUMN_NAME = 'user_id';

SELECT 'bookings.bookedUserId:' AS field, IS_NULLABLE, COLUMN_TYPE 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = 'flyola' AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'bookedUserId';

SELECT '=== SUCCESS! Now restart backend: npm start ===' AS '';
