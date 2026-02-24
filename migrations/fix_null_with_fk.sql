-- Critical fix: Allow NULL for user_id columns
-- Handles foreign key constraints properly

USE flyola;

-- Step 1: Most critical - payments table (no FK issue here)
ALTER TABLE payments MODIFY COLUMN user_id INT NULL;
ALTER TABLE payments MODIFY COLUMN payment_id VARCHAR(255) NULL;

-- Step 2: helicopter_payments
ALTER TABLE helicopter_payments MODIFY COLUMN user_id BIGINT UNSIGNED NULL;

-- Step 3: billing_details (has FK constraint, need to drop and recreate)
-- First, check if FK exists and drop it
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS 
                  WHERE CONSTRAINT_SCHEMA = 'flyola' 
                  AND TABLE_NAME = 'billing_details' 
                  AND CONSTRAINT_NAME = 'billing_details_user_id_foreign');

SET @drop_fk = IF(@fk_exists > 0, 
                  'ALTER TABLE billing_details DROP FOREIGN KEY billing_details_user_id_foreign', 
                  'SELECT "FK does not exist"');
PREPARE stmt FROM @drop_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Now modify the column
ALTER TABLE billing_details MODIFY COLUMN user_id INT NULL;

-- Recreate the FK constraint (allowing NULL)
ALTER TABLE billing_details 
ADD CONSTRAINT billing_details_user_id_foreign 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Step 4: bookings table
ALTER TABLE bookings MODIFY COLUMN bookedUserId INT NULL;

-- Step 5: helicopter_bookings
ALTER TABLE helicopter_bookings MODIFY COLUMN bookedUserId BIGINT UNSIGNED NULL;

-- Verify the changes
SELECT '=== VERIFICATION ===' AS status;
SELECT 'Payments table:' AS table_name, COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = 'flyola' AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'user_id';

SELECT 'Billing table:' AS table_name, COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = 'flyola' AND TABLE_NAME = 'billing_details' AND COLUMN_NAME = 'user_id';

SELECT 'Bookings table:' AS table_name, COLUMN_NAME, IS_NULLABLE, COLUMN_TYPE 
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = 'flyola' AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'bookedUserId';

SELECT '=== ALL DONE! Restart your backend server now ===' AS status;
