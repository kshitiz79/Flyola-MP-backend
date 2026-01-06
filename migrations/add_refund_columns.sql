-- Add refund columns to payments table
ALTER TABLE `payments` 
ADD COLUMN `refund_id` VARCHAR(255) NULL AFTER `user_id`,
ADD COLUMN `refund_amount` DECIMAL(10, 2) NULL AFTER `refund_id`;

-- Add refund columns to helicopter_payments table  
ALTER TABLE `helicopter_payments`
ADD COLUMN `refund_id` VARCHAR(255) NULL AFTER `user_id`,
ADD COLUMN `refund_amount` DECIMAL(10, 2) NULL AFTER `refund_id`;
