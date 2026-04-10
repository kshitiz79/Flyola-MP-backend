-- ============================================================
-- CLEANUP: Release falsely-blocked helicopter seats
-- TARGET: flyola_Prod (PRODUCTION DATABASE)
-- Run this ONCE against production
-- ============================================================

USE flyola_Prod;

-- ── STEP 0: Preview what will be cleaned ────────────────────

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

SELECT '=== ALL helicopter_booked_seats (full picture) ===' AS info;
SELECT
    hbs.id,
    hbs.helicopter_booking_id,
    hbs.helicopter_schedule_id,
    hbs.bookDate,
    hbs.seat_label,
    hbs.status         AS seat_status,
    hb.bookingStatus,
    hb.paymentStatus,
    hb.booking_expires_at
FROM helicopter_booked_seats hbs
JOIN helicopter_bookings hb ON hb.id = hbs.helicopter_booking_id
ORDER BY hbs.bookDate DESC;

-- ── STEP 1: Release HOLD seats for expired/abandoned bookings ─

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

-- ── STEP 2: Cancel stale PENDING helicopter bookings ─────────

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

-- ── STEP 3: Same for regular flights ─────────────────────────

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

-- ── STEP 4: Verify ───────────────────────────────────────────

SELECT '=== Remaining HOLD seats after cleanup ===' AS info;
SELECT
    hbs.seat_label,
    hbs.status,
    hb.bookingStatus,
    hb.booking_expires_at
FROM helicopter_booked_seats hbs
JOIN helicopter_bookings hb ON hb.id = hbs.helicopter_booking_id
WHERE hbs.status = 'HOLD';

SELECT '=== DONE ===' AS info;
