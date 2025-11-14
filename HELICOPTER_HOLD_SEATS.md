# 🚁 Helicopter Seat Hold API

## Temporary Seat Reservation for Helicopter Bookings

Hold helicopter seats temporarily (10 minutes) while user completes booking process.

---

## 📍 Endpoint

```
POST /helicopter-seat/hold-seats
```

---

## 🎯 Purpose

When a user selects seats for a helicopter booking, this API temporarily reserves those seats to prevent double-booking. The hold expires after 10 minutes if the booking is not completed.

---

## 📥 Request Body

```json
{
  "schedule_id": 1,
  "bookDate": "2024-11-20",
  "seat_labels": ["S1", "S2"],
  "held_by": "user_123"
}
```

### Parameters:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schedule_id` | Integer | ✅ Yes | Helicopter schedule ID |
| `bookDate` | String | ✅ Yes | Booking date (YYYY-MM-DD) |
| `seat_labels` | Array | ✅ Yes | Array of seat labels to hold (e.g., ["S1", "S2"]) |
| `held_by` | String | ✅ Yes | User ID or session ID |

---

## ✅ Success Response

```json
{
  "message": "Helicopter seats held successfully",
  "expiresAt": "2024-11-14T10:45:00.000Z",
  "heldSeats": ["S1", "S2"],
  "bookingType": "helicopter"
}
```

### Response Fields:

| Field | Type | Description |
|-------|------|-------------|
| `message` | String | Success message |
| `expiresAt` | DateTime | When the hold expires (10 minutes from now) |
| `heldSeats` | Array | List of seats that were held |
| `bookingType` | String | Always "helicopter" |

---

## ❌ Error Responses

### Missing Required Fields
```json
{
  "error": "schedule_id, bookDate, seat_labels (array), and held_by are required"
}
```

### Invalid Date Format
```json
{
  "error": "Invalid bookDate format (YYYY-MM-DD)"
}
```

### Helicopter Schedule Not Found
```json
{
  "error": "Helicopter schedule 999 not found"
}
```

### Seat Not Available
```json
{
  "error": "Seat S1 is not available"
}
```

---

## 🧪 cURL Examples

### Hold Single Seat

```bash
curl -X POST http://localhost:4000/helicopter-seat/hold-seats \
  -H "Content-Type: application/json" \
  -d '{
    "schedule_id": 1,
    "bookDate": "2024-11-20",
    "seat_labels": ["S1"],
    "held_by": "user_123"
  }'
```

### Hold Multiple Seats

```bash
curl -X POST http://localhost:4000/helicopter-seat/hold-seats \
  -H "Content-Type: application/json" \
  -d '{
    "schedule_id": 1,
    "bookDate": "2024-11-20",
    "seat_labels": ["S1", "S2", "S3"],
    "held_by": "user_456"
  }'
```

---

## 🔄 Complete Booking Flow

### Step 1: Check Available Seats
```bash
curl -X GET "http://localhost:4000/helicopter-seat/available-seats?schedule_id=1&bookDate=2024-11-20"
```

**Response:**
```json
{
  "availableSeats": ["S1", "S2", "S3", "S4"]
}
```

---

### Step 2: Hold Selected Seats
```bash
curl -X POST http://localhost:4000/helicopter-seat/hold-seats \
  -H "Content-Type: application/json" \
  -d '{
    "schedule_id": 1,
    "bookDate": "2024-11-20",
    "seat_labels": ["S1", "S2"],
    "held_by": "user_123"
  }'
```

**Response:**
```json
{
  "message": "Helicopter seats held successfully",
  "expiresAt": "2024-11-14T10:45:00.000Z",
  "heldSeats": ["S1", "S2"],
  "bookingType": "helicopter"
}
```

---

### Step 3: Complete Booking (within 10 minutes)
```bash
curl -X POST http://localhost:4000/bookings/book-helicopter-seats \
  -H "Content-Type: application/json" \
  -d '{
    "bookedSeat": {
      "bookDate": "2024-11-20",
      "schedule_id": 1,
      "seat_labels": ["S1", "S2"]
    },
    "booking": { ... },
    "passengers": [ ... ]
  }'
```

---

## ⏱️ Hold Duration & Expiry

- **Hold Duration:** 10 minutes
- **Auto-Cleanup:** Expired holds are automatically removed every 5 minutes
- **Expiry Behavior:** After expiry, seats become available again

---

## 🔐 Hold Logic

### Same User Can Hold Multiple Times
If the same `held_by` user holds seats again, their previous holds remain valid.

### Different Users Cannot Hold Same Seat
If User A holds S1, User B cannot hold S1 until:
- User A completes booking, OR
- User A's hold expires (10 minutes)

### Held Seats Excluded from Available Seats
When checking available seats, held seats (by other users) are excluded.

---

## 🗄️ Database Table

### Table: `helicopter_seat_holds`

```sql
CREATE TABLE `helicopter_seat_holds` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `schedule_id` INT NOT NULL,
  `bookDate` DATE NOT NULL,
  `seat_label` VARCHAR(10) NOT NULL,
  `held_by` VARCHAR(255) NOT NULL,
  `held_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_schedule_date` (`schedule_id`, `bookDate`),
  INDEX `idx_expires_at` (`expires_at`),
  FOREIGN KEY (`schedule_id`) REFERENCES `helicopter_schedules` (`id`)
);
```

### Run Migration:
```bash
mysql -u root -p flyola < database/create_helicopter_seat_holds_table.sql
```

---

## 🔔 WebSocket Events

When seats are held, a WebSocket event is emitted:

```javascript
{
  event: 'helicopter-seats-updated',
  data: {
    schedule_id: 1,
    bookDate: '2024-11-20',
    availableSeats: ['S3', 'S4']
  }
}
```

Frontend can listen to this event to update seat availability in real-time.

---

## 🆚 Comparison: Flight vs Helicopter

| Feature | Flight Seat Hold | Helicopter Seat Hold |
|---------|-----------------|---------------------|
| **Endpoint** | `/booked-seat/hold-seats` | `/helicopter-seat/hold-seats` |
| **Table** | `seat_holds` | `helicopter_seat_holds` |
| **Schedule Table** | `flight_schedules` | `helicopter_schedules` |
| **WebSocket Event** | `seats-updated` | `helicopter-seats-updated` |
| **Hold Duration** | 10 minutes | 10 minutes |
| **Auto-Cleanup** | Every 5 minutes | Every 5 minutes |

---

## 💡 Best Practices

1. **Always hold seats** before showing payment page
2. **Use unique held_by** identifier (user ID or session ID)
3. **Handle expiry gracefully** - show timer to user
4. **Re-check availability** if hold expires
5. **Release holds** if user cancels (optional - auto-expires anyway)

---

## 🧪 Testing Checklist

- [ ] Hold single seat successfully
- [ ] Hold multiple seats successfully
- [ ] Try holding unavailable seat (should fail)
- [ ] Try holding with invalid schedule_id (should fail)
- [ ] Try holding with invalid date format (should fail)
- [ ] Verify hold expires after 10 minutes
- [ ] Verify different user cannot hold same seat
- [ ] Verify same user can hold multiple times
- [ ] Check WebSocket event emission
- [ ] Verify auto-cleanup of expired holds

---

## 🐛 Troubleshooting

### Seats Not Being Held
- Check if `helicopter_seat_holds` table exists
- Verify schedule_id is valid
- Ensure seats are actually available

### Holds Not Expiring
- Check if MySQL event scheduler is enabled: `SET GLOBAL event_scheduler = ON;`
- Verify cleanup event exists: `SHOW EVENTS;`

### WebSocket Not Working
- Ensure Socket.io is properly configured
- Check if `req.io` is available in middleware

---

## 📞 Support

For issues:
1. Check database table exists
2. Verify schedule_id is from `helicopter_schedules` table
3. Ensure date format is YYYY-MM-DD
4. Check MySQL event scheduler is running
