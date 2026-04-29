-- ============================================================
-- Update flight dates for helicopter bookings
-- BOOK1776103758334 (PNR: 9Y3J9C) and BOOK1776104174751 (PNR: 1OTNRS)
-- ============================================================

USE flyola_Prod;

-- Preview before changing
SELECT '=== BEFORE ===' AS info;
SELECT id, pnr, bookDate, bookingStatus, email_id
FROM helicopter_bookings
WHERE pnr IN ('9Y3J9C', '1OTNRS');

-- Update flight date for booking 9Y3J9C
UPDATE helicopter_bookings
SET bookDate = '2026-04-17'   
WHERE pnr = '9Y3J9C'
AND bookingStatus = 'CONFIRMED';

UPDATE helicopter_bookings
SET bookDate = '2026-04-18'   
WHERE pnr = '9Y3J9C'
AND bookingStatus = 'CONFIRMED';

-- Update flight date for booking 1OTNRS
UPDATE helicopter_bookings
SET bookDate = '2026-04-18'  
WHERE pnr = '1OTNRS'
AND bookingStatus = 'CONFIRMED';

UPDATE helicopter_bookings
SET bookDate = '2026-04-19'  
WHERE pnr = '1OTNRS'
AND bookingStatus = 'CONFIRMED';


-- Also update the booked seats dates to match
UPDATE helicopter_booked_seats hbs
JOIN helicopter_bookings hb ON hb.id = hbs.helicopter_booking_id
SET hbs.bookDate = '2026-04-17'
WHERE hb.pnr = '9Y3J9C';

UPDATE helicopter_booked_seats hbs
JOIN helicopter_bookings hb ON hb.id = hbs.helicopter_booking_id
SET hbs.bookDate = '2026-04-18'
WHERE hb.pnr = '1OTNRS';

-- Verify after change
SELECT '=== AFTER ===' AS info;
SELECT
    hb.id, hb.pnr, hb.bookDate, hb.bookingStatus,
    hbs.seat_label, hbs.bookDate AS seat_bookDate
FROM helicopter_bookings hb
JOIN helicopter_booked_seats hbs ON hbs.helicopter_booking_id = hb.id
WHERE hb.pnr IN ('9Y3J9C', '1OTNRS');
