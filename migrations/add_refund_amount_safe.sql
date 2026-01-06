-- First check if columns exist
SELECT COLUMN_NAME, DATA_TYPE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'payments' 
AND COLUMN_NAME LIKE 'refund%';

-- Add refund_amount to payments table if it doesn't exist
ALTER TABLE `payments` 
ADD COLUMN IF NOT EXISTS `refund_amount` DECIMAL(10, 2) NULL AFTER `refund_id`;

-- Check helicopter_payments table
SELECT COLUMN_NAME, DATA_TYPE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'helicopter_payments' 
AND COLUMN_NAME LIKE 'refund%';

-- Add to helicopter_payments if needed
ALTER TABLE `helicopter_payments`
ADD COLUMN IF NOT EXISTS `refund_amount` DECIMAL(10, 2) NULL AFTER `refund_id`;
