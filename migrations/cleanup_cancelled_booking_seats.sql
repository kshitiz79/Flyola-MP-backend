-- ============================================================
-- CLEANUP: Delete booked seats from CANCELLED helicopter bookings
-- These are seats that were never released when booking was cancelled
-- Run against: flyola_Prod
-- ============================================================

USE flyola_Prod;

-- Preview what will be deleted
SELECT '=== Seats stuck from CANCELLED bookings ===' AS info;
SELECT
    hbs.id,
    hbs.helicopter_booking_id,
    hbs.helicopter_schedule_id,
    hbs.bookDate,
    hbs.seat_label,
    hbs.status AS seat_status,
    hb.bookingStatus,
    hb.paymentStatus
FROM helicopter_booked_seats hbs
JOIN helicopter_bookings hb ON hb.id = hbs.helicopter_booking_id
WHERE hb.bookingStatus = 'CANCELLED';

-- Delete them
DELETE hbs
FROM helicopter_booked_seats hbs
JOIN helicopter_bookings hb ON hb.id = hbs.helicopter_booking_id
WHERE hb.bookingStatus = 'CANCELLED';

SELECT ROW_COUNT() AS seats_released;

-- Verify
SELECT '=== Remaining seats (only CONFIRMED bookings should remain) ===' AS info;
SELECT
    hbs.bookDate,
    hbs.seat_label,
    hbs.status,
    hb.bookingStatus,
    hb.paymentStatus
FROM helicopter_booked_seats hbs
JOIN helicopter_bookings hb ON hb.id = hbs.helicopter_booking_id
ORDER BY hbs.bookDate DESC;

SELECT '=== DONE ===' AS info;
