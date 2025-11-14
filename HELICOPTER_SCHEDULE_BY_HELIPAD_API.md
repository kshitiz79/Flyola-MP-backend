# 🚁 Helicopter Schedule by Helipad & Date API

## Get helicopter schedules between two helipads on a specific date

---

## 📍 Endpoint

```
GET /helicopter-schedules/schedule-by-helipad
```

---

## 📥 Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `departure_helipad_id` | Integer | ✅ Yes | Departure helipad ID |
| `arrival_helipad_id` | Integer | ✅ Yes | Arrival helipad ID |
| `date` | String | ✅ Yes | Date in YYYY-MM-DD format |

---

## ✅ Success Response

### When Schedules Found

```json
{
  "success": true,
  "message": "Helicopter schedules fetched successfully",
  "data": [
    {
      "id": 1,
      "helicopter_id": 5,
      "departure_helipad_id": 1,
      "arrival_helipad_id": 7,
      "departure_time": "10:00:00",
      "arrival_time": "11:30:00",
      "price": "5000.00",
      "status": 1,
      "via_stop_id": "[2, 3]",
      "departure_date": "2025-11-14",
      "availableSeats": 4,
      "Helicopter": {
        "id": 5,
        "helicopter_number": "H-001",
        "departure_day": "Friday",
        "seat_limit": 6
      }
    }
  ]
}
```

### When No Schedules Found

```json
{
  "success": false,
  "message": "No active helicopter schedules found for the given criteria",
  "data": []
}
```

---

## ❌ Error Responses

### Missing Required Parameters

```json
{
  "success": false,
  "error": "departure_helipad_id, arrival_helipad_id, and date are required"
}
```

### Invalid Date Format

```json
{
  "success": false,
  "error": "Invalid date format, expected YYYY-MM-DD"
}
```

### Server Error

```json
{
  "success": false,
  "error": "Failed to get active helicopter schedules by helipad and date",
  "details": "Error message here"
}
```

---

## 🧪 cURL Examples

### Basic Request

```bash
curl -X GET "http://localhost:4000/helicopter-schedules/schedule-by-helipad?departure_helipad_id=1&arrival_helipad_id=7&date=2025-11-14"
```

### With Different Helipads

```bash
curl -X GET "http://localhost:4000/helicopter-schedules/schedule-by-helipad?departure_helipad_id=2&arrival_helipad_id=5&date=2024-12-25"
```

### Future Date

```bash
curl -X GET "http://localhost:4000/helicopter-schedules/schedule-by-helipad?departure_helipad_id=1&arrival_helipad_id=3&date=2025-12-31"
```

---

## 🔍 How It Works

### 1. Date & Weekday Calculation
- Converts date to Asia/Kolkata timezone
- Extracts weekday (e.g., "Friday")

### 2. Schedule Matching
Finds schedules where:
- ✅ `departure_helipad_id` matches
- ✅ `arrival_helipad_id` matches
- ✅ `status = 1` (active)
- ✅ Helicopter's `departure_day` matches weekday

### 3. Seat Availability
- Calls `getAvailableHelicopterSeats()` for each schedule
- Returns count of available seats
- Excludes booked and held seats

### 4. Via Stops Processing
- Parses `via_stop_id` JSON array
- Filters out invalid IDs
- Returns as JSON string

---

## 📊 Response Fields Explained

| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Helicopter schedule ID |
| `helicopter_id` | Integer | Helicopter ID |
| `departure_helipad_id` | Integer | Departure helipad ID |
| `arrival_helipad_id` | Integer | Arrival helipad ID |
| `departure_time` | String | Departure time (HH:mm:ss) |
| `arrival_time` | String | Arrival time (HH:mm:ss) |
| `price` | String | Price per seat |
| `status` | Integer | 1 = Active, 0 = Inactive |
| `via_stop_id` | String | JSON array of intermediate helipad IDs |
| `departure_date` | String | The queried date (YYYY-MM-DD) |
| `availableSeats` | Integer | Number of available seats |
| `seatError` | String | Error message if seat check failed (optional) |
| `Helicopter` | Object | Helicopter details |

---

## 🆚 Comparison: Flight vs Helicopter

| Feature | Flight API | Helicopter API |
|---------|-----------|----------------|
| **Endpoint** | `/flight-schedules/schedule-by-airport` | `/helicopter-schedules/schedule-by-helipad` |
| **Departure Param** | `departure_airport_id` | `departure_helipad_id` |
| **Arrival Param** | `arrival_airport_id` | `arrival_helipad_id` |
| **Schedule Table** | `flight_schedules` | `helicopter_schedules` |
| **Vehicle Table** | `flights` | `helicopters` |
| **Location Table** | `airports` | `helipads` |
| **Seat Function** | `getAvailableSeats()` | `getAvailableHelicopterSeats()` |

---

## 🎯 Use Cases

### 1. Search Page
User selects:
- Departure helipad: Mumbai
- Arrival helipad: Pune
- Date: 2025-11-14

Frontend calls API and displays available helicopter schedules.

### 2. Booking Flow
```javascript
// Step 1: Get schedules
const response = await fetch(
  '/helicopter-schedules/schedule-by-helipad?' +
  'departure_helipad_id=1&arrival_helipad_id=7&date=2025-11-14'
);

// Step 2: User selects schedule
const schedule = response.data[0];

// Step 3: Check available seats
if (schedule.availableSeats >= passengers) {
  // Proceed to booking
}
```

### 3. Calendar View
Loop through dates to show availability:
```javascript
for (let date of dates) {
  const schedules = await getSchedules(1, 7, date);
  calendar[date] = schedules.length > 0;
}
```

---

## 💡 Important Notes

### Weekday Matching
- Only schedules where helicopter's `departure_day` matches the date's weekday are returned
- Example: If date is Friday (2025-11-14), only helicopters with `departure_day = "Friday"` are included

### Active Schedules Only
- Only schedules with `status = 1` are returned
- Inactive schedules are excluded

### Timezone
- All date/time calculations use **Asia/Kolkata** timezone
- Ensure your frontend sends dates in YYYY-MM-DD format

### Available Seats
- Real-time calculation
- Excludes:
  - Booked seats (from `booked_seats` table)
  - Held seats (from `helicopter_seat_holds` table, not expired)

---

## 🧪 Testing Checklist

- [ ] Valid request with all parameters
- [ ] Missing `departure_helipad_id` (should fail)
- [ ] Missing `arrival_helipad_id` (should fail)
- [ ] Missing `date` (should fail)
- [ ] Invalid date format (should fail)
- [ ] Date with no schedules (should return empty array)
- [ ] Date with multiple schedules (should return all)
- [ ] Verify `availableSeats` count is correct
- [ ] Verify weekday matching works
- [ ] Verify only active schedules returned

---

## 🐛 Troubleshooting

### No Schedules Returned

**Check:**
1. Are there helicopter schedules in database?
2. Is `status = 1` (active)?
3. Does helicopter's `departure_day` match the date's weekday?
4. Are `departure_helipad_id` and `arrival_helipad_id` correct?

**Example:**
```sql
SELECT hs.*, h.departure_day 
FROM helicopter_schedules hs
JOIN helicopters h ON hs.helicopter_id = h.id
WHERE hs.departure_helipad_id = 1 
  AND hs.arrival_helipad_id = 7
  AND hs.status = 1;
```

### Wrong Available Seats Count

**Check:**
1. Are there bookings in `booked_seats` table?
2. Are there active holds in `helicopter_seat_holds` table?
3. Is helicopter's `seat_limit` correct?

**Debug:**
```bash
# Check booked seats
SELECT * FROM booked_seats 
WHERE schedule_id = 1 AND bookDate = '2025-11-14';

# Check held seats
SELECT * FROM helicopter_seat_holds 
WHERE schedule_id = 1 AND bookDate = '2025-11-14' AND expires_at > NOW();
```

---

## 📞 Related APIs

- **Get All Schedules:** `GET /helicopter-schedules/`
- **Get Schedule by ID:** `GET /helicopter-schedules/:id`
- **Get Price by Day:** `GET /helicopter-schedules/price-by-day/:id`
- **Hold Seats:** `POST /helicopter-seat/hold-seats`
- **Book Seats:** `POST /bookings/book-helicopter-seats`

---

## 🎉 Example Integration

```javascript
// React/Next.js example
async function searchHelicopterFlights(from, to, date) {
  try {
    const response = await fetch(
      `/helicopter-schedules/schedule-by-helipad?` +
      `departure_helipad_id=${from}&` +
      `arrival_helipad_id=${to}&` +
      `date=${date}`
    );
    
    const result = await response.json();
    
    if (result.success) {
      return result.data; // Array of schedules
    } else {
      console.log(result.message); // No schedules found
      return [];
    }
  } catch (error) {
    console.error('API Error:', error);
    return [];
  }
}

// Usage
const schedules = await searchHelicopterFlights(1, 7, '2025-11-14');
console.log(`Found ${schedules.length} helicopter schedules`);
```

---

## ✅ Summary

- **Endpoint:** `/helicopter-schedules/schedule-by-helipad`
- **Method:** GET
- **Parameters:** `departure_helipad_id`, `arrival_helipad_id`, `date`
- **Returns:** Array of matching helicopter schedules with availability
- **Same format as flight API** - Easy to integrate!
