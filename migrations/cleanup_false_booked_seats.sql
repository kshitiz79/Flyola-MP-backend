-- ============================================================
-- CLEANUP: Release falsely-blocked helicopter seats
-- Run this ONCE against your production DB (flyola)
-- Safe to run multiple times (idempotent)
-- ============================================================

USE flyola;

-- ── STEP 0: Preview what will be cleaned (run this first to verify) ──────────

SELECT '=== HELICOPTER: Expired PENDING bookings with HOLD seats ===' AS info;
SELECT
    hb.id              AS booking_id,
    hb.pnr,
    hb.bookingStatus,
    hb.paymentStatus,
    hb.booking_expires_at,
    hb.email_id,
    hbs.seat_label,
    hbs.status         AS seat_status
FROM helicopter_bookings hb
JOIN helicopter_booked_seats hbs ON hbs.helicopter_booking_id = hb.id
WHERE hb.bookingStatus = 'PENDING'
  AND (
      hb.booking_expires_at IS NULL
      OR hb.booking_expires_at < NOW()
  )
  AND hbs.status = 'HOLD';

SELECT '=== HELICOPTER: PENDING bookings with no payment (stuck) ===' AS info;
SELECT
    hb.id,
    hb.pnr,
    hb.bookingStatus,
    hb.paymentStatus,
    hb.booking_expires_at,
    hb.created_at
FROM helicopter_bookings hb
WHERE hb.bookingStatus = 'PENDING'
  AND hb.paymentStatus IN ('PENDING', 'FAILED', 'CANCELLED')
  AND (
      hb.booking_expires_at IS NULL
      OR hb.booking_expires_at < NOW()
  );

-- ── STEP 1: Release HOLD seats for expired/abandoned helicopter bookings ─────

-- Delete HOLD seats tied to expired PENDING bookings
DELETE hbs
FROM helicopter_booked_seats hbs
JOIN helicopter_bookings hb ON hb.id = hbs.helicopter_booking_id
WHERE hb.bookingStatus = 'PENDING'
  AND (
      hb.booking_expires_at IS NULL
      OR hb.booking_expires_at < NOW()
  )
  AND hbs.status = 'HOLD';

SELECT ROW_COUNT() AS helicopter_hold_seats_released;

-- ── STEP 2: Cancel the stale PENDING helicopter bookings themselves ──────────

UPDATE helicopter_bookings
SET
    bookingStatus      = 'CANCELLED',
    paymentStatus      = 'CANCELLED',
    cancellationReason = 'Auto-cancelled: payment not completed within expiry window'
WHERE bookingStatus = 'PENDING'
  AND paymentStatus IN ('PENDING', 'FAILED', 'CANCELLED')
  AND (
      booking_expires_at IS NULL
      OR booking_expires_at < NOW()
  );

SELECT ROW_COUNT() AS helicopter_bookings_cancelled;

-- ── STEP 3: Same cleanup for regular flights ─────────────────────────────────

DELETE bs
FROM booked_seats bs
JOIN bookings b ON b.id = bs.booking_id
WHERE b.bookingStatus = 'PENDING'
  AND (
      b.booking_expires_at IS NULL
      OR b.booking_expires_at < NOW()
  )
  AND bs.status = 'HOLD';

SELECT ROW_COUNT() AS flight_hold_seats_released;

UPDATE bookings
SET
    bookingStatus      = 'CANCELLED',
    paymentStatus      = 'CANCELLED',
    cancellationReason = 'Auto-cancelled: payment not completed within expiry window'
WHERE bookingStatus = 'PENDING'
  AND paymentStatus IN ('PENDING', 'FAILED', 'CANCELLED')
  AND (
      booking_expires_at IS NULL
      OR booking_expires_at < NOW()
  );

SELECT ROW_COUNT() AS flight_bookings_cancelled;

-- ── STEP 4: Verify seats are now free ────────────────────────────────────────

SELECT '=== Remaining HOLD seats (should be 0 or only active ones) ===' AS info;
SELECT
    hbs.seat_label,
    hbs.status,
    hb.bookingStatus,
    hb.booking_expires_at
FROM helicopter_booked_seats hbs
JOIN helicopter_bookings hb ON hb.id = hbs.helicopter_booking_id
WHERE hbs.status = 'HOLD';

SELECT '=== DONE: Seats released and visible again ===' AS info;
