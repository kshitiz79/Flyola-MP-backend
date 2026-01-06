-- Try to add refund_amount to payments table
-- If it already exists, this will give an error which you can ignore
ALTER TABLE `payments` 
ADD COLUMN `refund_amount` DECIMAL(10, 2) NULL AFTER `refund_id`;

-- Try to add refund_amount to helicopter_payments table  
-- If it already exists, this will give an error which you can ignore
ALTER TABLE `helicopter_payments`
ADD COLUMN `refund_amount` DECIMAL(10, 2) NULL AFTER `refund_id`;
