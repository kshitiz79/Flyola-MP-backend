-- ============================================================
-- ONE-TIME PRODUCTION CLEANUP SCRIPT
-- Flyola — Orphaned Seat Cleanup
-- 
-- Run this ONCE on production to fix seats that were never
-- released due to the status:'HOLD' bug in the cleanup job.
--
-- Safe to run while server is live — uses DELETE with WHERE,
-- no table drops or schema changes.
--
-- HOW TO RUN:
--   mysql -u root -p flyolanew < cleanup-orphaned-seats.sql
-- OR inside mysql shell:
--   USE flyolanew;
--   SOURCE /path/to/cleanup-orphaned-seats.sql
-- ============================================================

-- Show counts BEFORE cleanup so you can see what will be deleted
SELECT 'BEFORE CLEANUP' AS status;

SELECT
  COUNT(*) AS orphaned_flight_seats
FROM booked_seats bs
WHERE bs.booking_id IN (
  SELECT id FROM bookings
  WHERE bookingStatus IN ('EXPIRED', 'CANCELLED', 'PENDING')
    AND (
      -- Explicit expiry passed
      (booking_expires_at IS NOT NULL AND booking_expires_at < NOW())
      OR
      -- No expiry set but created more than 20 minutes ago and still PENDING
      (booking_expires_at IS NULL AND bookingStatus = 'PENDING' AND created_at < DATE_SUB(NOW(), INTERVAL 20 MINUTE))
      OR
      -- Already EXPIRED or CANCELLED
      bookingStatus IN ('EXPIRED', 'CANCELLED')
    )
);

SELECT
  COUNT(*) AS orphaned_helicopter_seats
FROM helicopter_booked_seats hbs
WHERE hbs.helicopter_booking_id IN (
  SELECT id FROM helicopter_bookings
  WHERE bookingStatus IN ('EXPIRED', 'CANCELLED', 'PENDING')
    AND (
      -- No expiry column on helicopter_bookings — use created_at age
      (bookingStatus = 'PENDING' AND created_at < DATE_SUB(NOW(), INTERVAL 20 MINUTE))
      OR
      bookingStatus IN ('EXPIRED', 'CANCELLED')
    )
);

-- ============================================================
-- STEP 1: Delete orphaned flight booked_seats
-- ============================================================
DELETE FROM booked_seats
WHERE booking_id IN (
  SELECT id FROM bookings
  WHERE bookingStatus IN ('EXPIRED', 'CANCELLED')
    OR (
      bookingStatus = 'PENDING'
      AND (
        (booking_expires_at IS NOT NULL AND booking_expires_at < NOW())
        OR (booking_expires_at IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL 20 MINUTE))
      )
    )
);

SELECT ROW_COUNT() AS flight_seats_deleted;

-- ============================================================
-- STEP 2: Delete orphaned helicopter_booked_seats
-- ============================================================
DELETE FROM helicopter_booked_seats
WHERE helicopter_booking_id IN (
  SELECT id FROM helicopter_bookings
  WHERE bookingStatus IN ('EXPIRED', 'CANCELLED')
    OR (
      bookingStatus = 'PENDING'
      AND created_at < DATE_SUB(NOW(), INTERVAL 20 MINUTE)
    )
);

SELECT ROW_COUNT() AS helicopter_seats_deleted;

-- ============================================================
-- STEP 3: Mark stale PENDING flight bookings as EXPIRED
-- (in case any were missed by the old cron)
-- ============================================================
UPDATE bookings
SET
  bookingStatus  = 'EXPIRED',
  paymentStatus  = 'EXPIRED',
  cancellationReason = 'Booking expired - cleaned up by manual script',
  cancelledAt    = NOW()
WHERE bookingStatus = 'PENDING'
  AND (
    (booking_expires_at IS NOT NULL AND booking_expires_at < NOW())
    OR (booking_expires_at IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL 20 MINUTE))
  );

SELECT ROW_COUNT() AS flight_bookings_marked_expired;

-- ============================================================
-- STEP 4: Mark stale PENDING helicopter bookings as EXPIRED
-- ============================================================
UPDATE helicopter_bookings
SET
  bookingStatus  = 'EXPIRED',
  paymentStatus  = 'EXPIRED',
  cancellationReason = 'Booking expired - cleaned up by manual script',
  cancelledAt    = NOW()
WHERE bookingStatus = 'PENDING'
  AND created_at < DATE_SUB(NOW(), INTERVAL 20 MINUTE);

SELECT ROW_COUNT() AS helicopter_bookings_marked_expired;

-- ============================================================
-- Show counts AFTER cleanup to confirm
-- ============================================================
SELECT 'AFTER CLEANUP' AS status;

SELECT COUNT(*) AS remaining_orphaned_flight_seats
FROM booked_seats bs
WHERE bs.booking_id IN (
  SELECT id FROM bookings WHERE bookingStatus IN ('EXPIRED', 'CANCELLED')
);

SELECT COUNT(*) AS remaining_orphaned_helicopter_seats
FROM helicopter_booked_seats hbs
WHERE hbs.helicopter_booking_id IN (
  SELECT id FROM helicopter_bookings WHERE bookingStatus IN ('EXPIRED', 'CANCELLED')
);

SELECT 'DONE - All orphaned seats cleaned up.' AS result;
