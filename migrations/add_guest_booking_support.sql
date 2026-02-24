-- Migration: Add Guest Booking Support and Booking-First Flow
-- Date: 2025-02-20
-- Description: Adds support for guest bookings and booking expiry for payment-after-booking flow

-- Add guest booking fields to bookings table
ALTER TABLE bookings ADD COLUMN guest_booking BOOLEAN DEFAULT FALSE;
ALTER TABLE bookings ADD COLUMN guest_email VARCHAR(255);
ALTER TABLE bookings ADD COLUMN guest_phone VARCHAR(20);
ALTER TABLE bookings ADD COLUMN booking_expires_at TIMESTAMP NULL;

ALTER TABLE bookings 
MODIFY COLUMN bookedUserId BIGINT UNSIGNED NULL;

ALTER TABLE booked_seats ADD COLUMN status VARCHAR(20) DEFAULT 'CONFIRMED';

ALTER TABLE helicopter_bookings ADD COLUMN guest_booking BOOLEAN DEFAULT FALSE;
ALTER TABLE helicopter_bookings ADD COLUMN guest_email VARCHAR(255);
ALTER TABLE helicopter_bookings ADD COLUMN guest_phone VARCHAR(20);
ALTER TABLE helicopter_bookings ADD COLUMN booking_expires_at TIMESTAMP NULL;

ALTER TABLE helicopter_bookings 
MODIFY COLUMN bookedUserId BIGINT UNSIGNED NULL;

ALTER TABLE helicopter_booked_seats ADD COLUMN status VARCHAR(20) DEFAULT 'CONFIRMED';

-- Allow NULL for user_id in payments (for guest bookings)
ALTER TABLE payments MODIFY COLUMN user_id INT NULL;
ALTER TABLE payments MODIFY COLUMN payment_id VARCHAR(255) NULL;

-- Allow NULL for user_id in helicopter_payments (for guest bookings)
ALTER TABLE helicopter_payments MODIFY COLUMN user_id BIGINT UNSIGNED NULL;

-- Allow NULL for user_id in billing_details (for guest bookings)
ALTER TABLE billing_details MODIFY COLUMN user_id INT NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_booking_expires ON bookings(booking_expires_at, bookingStatus);
CREATE INDEX IF NOT EXISTS idx_guest_bookings ON bookings(guest_booking, guest_email);
CREATE INDEX IF NOT EXISTS idx_booking_status ON bookings(bookingStatus, paymentStatus);

CREATE INDEX IF NOT EXISTS idx_heli_booking_expires ON helicopter_bookings(booking_expires_at, bookingStatus);
CREATE INDEX IF NOT EXISTS idx_heli_guest_bookings ON helicopter_bookings(guest_booking, guest_email);

-- Add comments for documentation
ALTER TABLE bookings 
MODIFY COLUMN guest_booking BOOLEAN DEFAULT FALSE COMMENT 'True if booking made without login',
MODIFY COLUMN guest_email VARCHAR(255) COMMENT 'Email for guest bookings',
MODIFY COLUMN guest_phone VARCHAR(20) COMMENT 'Phone for guest bookings',
MODIFY COLUMN booking_expires_at TIMESTAMP NULL COMMENT 'Expiry time for pending bookings (15 min)',
MODIFY COLUMN bookedUserId INT NULL COMMENT 'NULL for guest bookings, user ID for logged-in users';

ALTER TABLE helicopter_bookings
MODIFY COLUMN guest_booking BOOLEAN DEFAULT FALSE COMMENT 'True if booking made without login',
MODIFY COLUMN guest_email VARCHAR(255) COMMENT 'Email for guest bookings',
MODIFY COLUMN guest_phone VARCHAR(20) COMMENT 'Phone for guest bookings',
MODIFY COLUMN booking_expires_at TIMESTAMP NULL COMMENT 'Expiry time for pending bookings (15 min)',
MODIFY COLUMN bookedUserId BIGINT UNSIGNED NULL COMMENT 'NULL for guest bookings, user ID for logged-in users';

ALTER TABLE booked_seats
MODIFY COLUMN status VARCHAR(20) DEFAULT 'CONFIRMED' COMMENT 'HOLD, CONFIRMED, or RELEASED';

ALTER TABLE helicopter_booked_seats
MODIFY COLUMN status VARCHAR(20) DEFAULT 'CONFIRMED' COMMENT 'HOLD, CONFIRMED, or RELEASED';

-- Update existing bookings to have guest_booking = false
UPDATE bookings SET guest_booking = FALSE WHERE guest_booking IS NULL;
UPDATE helicopter_bookings SET guest_booking = FALSE WHERE guest_booking IS NULL;

-- Update existing booked seats to have status = CONFIRMED
UPDATE booked_seats SET status = 'CONFIRMED' WHERE status IS NULL;
UPDATE helicopter_booked_seats SET status = 'CONFIRMED' WHERE status IS NULL;
