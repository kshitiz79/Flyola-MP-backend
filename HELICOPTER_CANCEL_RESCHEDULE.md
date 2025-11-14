# 🚁 Helicopter Booking - Cancel & Reschedule APIs

## New Endpoints for Helicopter Management

- **Cancel:** `/bookings/helicopter/cancel/:id`
- **Reschedule:** `/bookings/helicopter/reschedule/:id`

---

## 🚫 Cancel Helicopter Booking

### Endpoint
```
POST /bookings/helicopter/cancel/:id
```

### Cancellation Policy

| Time Before Departure | Cancellation Fee | Refund |
|----------------------|------------------|--------|
| **> 96 hours (4 days)** | ₹400 per seat | Full fare - ₹400/seat |
| **48-96 hours (2-4 days)** | 25% of total fare | 75% of total fare |
| **24-48 hours (1-2 days)** | 50% of total fare | 50% of total fare |
| **< 24 hours** | 100% of total fare | No refund |

### cURL Example

```bash
curl -X POST http://localhost:4000/bookings/helicopter/cancel/123 \
  -H "Content-Type: application/json"
```

### Success Response

```json
{
  "message": "Helicopter booking cancelled successfully",
  "refundAmount": 4600,
  "cancellationFee": 400,
  "wallet_amount": 49600,
  "note": "Wallet updated instantly; refund processing for external accounts (if applicable) takes 7–10 business days"
}
```

### Error Responses

**Booking Not Found:**
```json
{
  "error": "Booking not found"
}
```

**Not a Helicopter Booking:**
```json
{
  "error": "This is not a helicopter booking"
}
```

**Already Cancelled:**
```json
{
  "error": "Booking is already cancelled"
}
```

---

## 🔄 Reschedule Helicopter Booking

### Endpoint
```
POST /bookings/helicopter/reschedule/:id
```

### Rescheduling Policy

| Time Before Departure | Rescheduling Fee |
|----------------------|------------------|
| **> 48 hours (2 days)** | ₹500 per seat |
| **24-48 hours (1-2 days)** | ₹1000 per seat |
| **< 24 hours** | Not allowed |

**Additional Charges:**
- If new schedule is more expensive, fare difference is charged
- Total deduction = Rescheduling fee + Fare difference

### Request Body

```json
{
  "newScheduleId": 5,
  "newBookDate": "2024-11-25",
  "newSeatLabels": ["S1", "S2"]
}
```

### cURL Example

```bash
curl -X POST http://localhost:4000/bookings/helicopter/reschedule/123 \
  -H "Content-Type: application/json" \
  -d '{
    "newScheduleId": 5,
    "newBookDate": "2024-11-25",
    "newSeatLabels": ["S1", "S2"]
  }'
```

### Success Response

```json
{
  "message": "Helicopter booking rescheduled successfully",
  "reschedulingFee": 1000,
  "fareDifference": 500,
  "totalDeduction": 1500,
  "wallet_amount": 48100,
  "newBookingDetails": {
    "schedule_id": 5,
    "bookDate": "2024-11-25",
    "seatLabels": ["S1", "S2"],
    "totalFare": 10500
  }
}
```

### Error Responses

**Missing Required Fields:**
```json
{
  "error": "newScheduleId, newBookDate, and newSeatLabels (array) are required"
}
```

**Invalid Date Format:**
```json
{
  "error": "Invalid newBookDate format (YYYY-MM-DD)"
}
```

**Not a Helicopter Booking:**
```json
{
  "error": "This is not a helicopter booking"
}
```

**Too Close to Departure:**
```json
{
  "error": "Rescheduling not permitted less than 24 hours before departure"
}
```

**Seat Not Available:**
```json
{
  "error": "Seat S1 is not available on new helicopter schedule"
}
```

**Seat Count Mismatch:**
```json
{
  "error": "Number of new seats must match original booking"
}
```

**Insufficient Wallet Balance:**
```json
{
  "error": "Insufficient wallet balance: 1000 < 1500"
}
```

---

## 📊 Complete Example Flow

### Step 1: Book Helicopter
```bash
curl -X POST http://localhost:4000/bookings/book-helicopter-seats \
  -H "Content-Type: application/json" \
  -d '{
    "bookedSeat": {
      "bookDate": "2024-11-20",
      "schedule_id": 1,
      "seat_labels": ["S1", "S2"]
    },
    "booking": {
      "contact_no": "9876543210",
      "email_id": "agent@example.com",
      "noOfPassengers": 2,
      "totalFare": "10000",
      "bookedUserId": 5,
      "schedule_id": 1,
      "bookDate": "2024-11-20",
      "agentId": 1
    },
    "passengers": [...]
  }'
```

**Response:** `bookingId: 123`

---

### Step 2a: Cancel Booking (if needed)
```bash
curl -X POST http://localhost:4000/bookings/helicopter/cancel/123 \
  -H "Content-Type: application/json"
```

**Result:**
- Refund credited to agent wallet
- Seats released back to inventory
- Booking marked as CANCELLED

---

### Step 2b: Reschedule Booking (alternative)
```bash
curl -X POST http://localhost:4000/bookings/helicopter/reschedule/123 \
  -H "Content-Type: application/json" \
  -d '{
    "newScheduleId": 5,
    "newBookDate": "2024-11-25",
    "newSeatLabels": ["S3", "S4"]
  }'
```

**Result:**
- Old seats released
- New seats booked
- Rescheduling fee + fare difference deducted from wallet
- Booking updated with new details

---

## 🔍 Key Differences: Flight vs Helicopter

| Feature | Flight (IRCTC) | Helicopter |
|---------|---------------|------------|
| **Cancel Endpoint** | `/bookings/irctc/cancel/:id` | `/bookings/helicopter/cancel/:id` |
| **Reschedule Endpoint** | `/bookings/irctc/reschedule/:id` | `/bookings/helicopter/reschedule/:id` |
| **Schedule Table** | `flight_schedules` | `helicopter_schedules` |
| **Seat Validation** | `getAvailableSeats()` | `getAvailableHelicopterSeats()` |
| **Agent Check** | Must be IRCTC agent | Any agent with helicopter booking |

---

## 💡 Important Notes

1. **Wallet Updates:** Instant for cancellations and rescheduling
2. **Seat Availability:** Real-time check before rescheduling
3. **Time Validation:** All times in IST (Asia/Kolkata)
4. **Booking Status:** Must be SUCCESS or CONFIRMED for rescheduling
5. **Socket Events:** Emits `seats-updated` for real-time updates

---

## 🧪 Testing Checklist

### Cancellation Tests:
- [ ] Cancel > 96 hours before departure (₹400/seat fee)
- [ ] Cancel 48-96 hours before (25% fee)
- [ ] Cancel 24-48 hours before (50% fee)
- [ ] Cancel < 24 hours before (no refund)
- [ ] Try cancelling already cancelled booking
- [ ] Try cancelling non-helicopter booking
- [ ] Verify wallet credit

### Rescheduling Tests:
- [ ] Reschedule > 48 hours before (₹500/seat fee)
- [ ] Reschedule 24-48 hours before (₹1000/seat fee)
- [ ] Try rescheduling < 24 hours before (should fail)
- [ ] Reschedule to more expensive schedule (fare difference charged)
- [ ] Reschedule to cheaper schedule (no refund of difference)
- [ ] Try with unavailable seats (should fail)
- [ ] Try with insufficient wallet balance (should fail)
- [ ] Verify old seats released and new seats booked

---

## 📞 Support

For issues or questions:
- Check booking ID is correct
- Verify it's a helicopter booking (not flight)
- Ensure sufficient wallet balance for rescheduling
- Check time restrictions (24 hours minimum)
