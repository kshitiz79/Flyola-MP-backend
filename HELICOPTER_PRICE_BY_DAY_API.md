# 🚁 Helicopter Price by Day API

## Get helicopter schedule prices for all matching days in a month

Returns price and availability for each day the helicopter operates in a given month.

---

## 📍 Endpoint

```
GET /helicopter-schedules/price-by-day/:id
```

---

## 📥 Parameters

### Path Parameter

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | Integer | ✅ Yes | Helicopter schedule ID |

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `month` | String | ❌ No | Month in YYYY-MM format (default: current month) |
| `start_date` | String | ❌ No | Start date in YYYY-MM-DD format (filters results from this date onwards) |

---

## ✅ Success Response

```json
[
  {
    "date": "2025-11-14",
    "price": 5000,
    "schedule": {
      "id": 1,
      "helicopter_id": 5,
      "departure_helipad_id": 1,
      "arrival_helipad_id": 7,
      "departure_time": "10:00:00",
      "arrival_time": "11:30:00",
      "price": "5000.00",
      "status": 1,
      "via_stop_id": "[2, 3]",
      "availableSeats": 4,
      "Helicopter": {
        "id": 5,
        "helicopter_number": "H-001",
        "departure_day": "Friday",
        "seat_limit": 6,
        "start_helipad_id": 1,
        "end_helipad_id": 7
      }
    }
  },
  {
    "date": "2025-11-21",
    "price": 5000,
    "schedule": {
      "id": 1,
      "helicopter_id": 5,
      "departure_helipad_id": 1,
      "arrival_helipad_id": 7,
      "departure_time": "10:00:00",
      "arrival_time": "11:30:00",
      "price": "5000.00",
      "status": 1,
      "via_stop_id": "[2, 3]",
      "availableSeats": 3,
      "Helicopter": { ... }
    }
  },
  {
    "date": "2025-11-28",
    "price": 5000,
    "schedule": { ... }
  }
]
```

---

## ❌ Error Responses

### Missing Schedule ID

```json
{
  "error": "schedule_id is required"
}
```

### Schedule Not Found

```json
{
  "error": "Schedule not found"
}
```

### Helicopter Not Found

```json
{
  "error": "Associated Helicopter not found"
}
```

### Invalid Departure Day

```json
{
  "error": "Helicopter departure day not defined"
}
```

### Server Error

```json
{
  "error": "Failed to get prices by day",
  "details": "Error message here"
}
```

---

## 🧪 cURL Examples

### Get Current Month Prices

```bash
curl -X GET "http://localhost:4000 /helicopter-schedules/price-by-day/1"
```

### Get Specific Month Prices

```bash
curl -X GET "http://localhost:4000 /helicopter-schedules/price-by-day/1?month=2025-12"
```

### Get Prices from Specific Start Date

```bash
curl -X GET "http://localhost:4000 /helicopter-schedules/price-by-day/1?start_date=2025-11-15"
```

### Combine Month and Start Date

```bash
curl -X GET "http://localhost:4000 /helicopter-schedules/price-by-day/1?month=2025-11&start_date=2025-11-11"
```

---

## 🔍 How It Works

### 1. Fetch Helicopter Schedule
- Gets schedule by ID
- Includes associated Helicopter details
- Extracts `departure_day` (e.g., "Friday")

### 2. Determine Date Range
- **Default:** Current month (1st to last day)
- **With `month`:** Specified month (e.g., 2025-11)
- **With `start_date`:** Filters from this date onwards

### 3. Find Matching Days
- Loops through all days in the range
- Only includes days matching helicopter's `departure_day`
- Example: If helicopter flies on "Friday", only Fridays are included

### 4. Calculate Availability
- For each matching day:
  - Calls `getAvailableHelicopterSeats()`
  - Returns count of available seats
  - Excludes booked and held seats

### 5. Return Results
- Array of objects, one per matching day
- Each object contains date, price, and full schedule details

---

## 📊 Response Fields Explained

### Top Level

| Field | Type | Description |
|-------|------|-------------|
| `date` | String | Date in YYYY-MM-DD format |
| `price` | Number | Price per seat (parsed as number) |
| `schedule` | Object | Full schedule details |

### Schedule Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | Integer | Helicopter schedule ID |
| `helicopter_id` | Integer | Helicopter ID |
| `departure_helipad_id` | Integer | Departure helipad ID |
| `arrival_helipad_id` | Integer | Arrival helipad ID |
| `departure_time` | String | Departure time (HH:mm:ss) |
| `arrival_time` | String | Arrival time (HH:mm:ss) |
| `price` | String | Price per seat (as string) |
| `status` | Integer | 1 = Active, 0 = Inactive |
| `via_stop_id` | String | JSON array of intermediate helipad IDs |
| `availableSeats` | Integer | Number of available seats for this date |
| `seatError` | String | Error message if seat check failed (optional) |
| `Helicopter` | Object | Helicopter details |

---

## 🎯 Use Cases

### 1. Calendar View
Display availability for entire month:

```javascript
const prices = await fetch('/helicopter-schedules/price-by-day/1?month=2025-11');

prices.forEach(day => {
  calendar[day.date] = {
    price: day.price,
    available: day.schedule.availableSeats > 0
  };
});
```

### 2. Price Comparison
Show prices for next 30 days:

```javascript
const today = '2025-11-11';
const prices = await fetch(`/helicopter-schedules/price-by-day/1?start_date=${today}`);

console.log(`Found ${prices.length} available days`);
```

### 3. Availability Check
Find next available date:

```javascript
const prices = await fetch('/helicopter-schedules/price-by-day/1?start_date=2025-11-11');
const nextAvailable = prices.find(day => day.schedule.availableSeats > 0);

if (nextAvailable) {
  console.log(`Next available: ${nextAvailable.date}`);
}
```

---

## 🆚 Comparison: Flight vs Helicopter

| Feature | Flight API | Helicopter API |
|---------|-----------|----------------|
| **Endpoint** | `/flight-schedules/price-by-day/:id` | `/helicopter-schedules/price-by-day/:id` |
| **Schedule Table** | `flight_schedules` | `helicopter_schedules` |
| **Vehicle Table** | `flights` | `helicopters` |
| **Departure Day Field** | `Flight.departure_day` | `Helicopter.departure_day` |
| **Seat Function** | `getAvailableSeats()` | `getAvailableHelicopterSeats()` |
| **Response Format** | Same | Same |

---

## 💡 Important Notes

### Weekday Matching
- Only returns days matching helicopter's `departure_day`
- If helicopter flies on "Monday", only Mondays are returned
- Other days are excluded even if in the date range

### Timezone
- All calculations use **Asia/Kolkata** timezone
- Dates are formatted as YYYY-MM-DD

### Available Seats
- Real-time calculation for each date
- Excludes:
  - Booked seats (from `booked_seats` table)
  - Held seats (from `helicopter_seat_holds` table, not expired)

### Month Parameter
- Format: `YYYY-MM` (e.g., `2025-11`)
- Returns all matching days in that month
- If omitted, uses current month

### Start Date Parameter
- Format: `YYYY-MM-DD` (e.g., `2025-11-11`)
- Filters results from this date onwards
- Useful for "from today" queries
- Can be combined with `month` parameter

---

## 🧪 Testing Checklist

- [ ] Get prices for current month (no parameters)
- [ ] Get prices for specific month (`month=2025-12`)
- [ ] Get prices from start date (`start_date=2025-11-15`)
- [ ] Combine month and start date
- [ ] Invalid schedule ID (should return 404)
- [ ] Schedule without helicopter (should return 404)
- [ ] Verify only matching weekdays returned
- [ ] Verify `availableSeats` count is correct
- [ ] Check multiple dates in response
- [ ] Verify price is consistent across dates

---

## 🐛 Troubleshooting

### No Results Returned

**Check:**
1. Does helicopter schedule exist?
2. Is helicopter associated with schedule?
3. Is `departure_day` set on helicopter?
4. Are there any matching weekdays in the month?

**Example:**
```sql
SELECT hs.*, h.departure_day 
FROM helicopter_schedules hs
JOIN helicopters h ON hs.helicopter_id = h.id
WHERE hs.id = 1;
```

### Wrong Available Seats

**Check:**
1. Are there bookings for those dates?
2. Are there active seat holds?
3. Is helicopter's `seat_limit` correct?

**Debug:**
```bash
# Check bookings for a specific date
SELECT * FROM booked_seats 
WHERE schedule_id = 1 AND bookDate = '2025-11-14';

# Check seat holds
SELECT * FROM helicopter_seat_holds 
WHERE schedule_id = 1 AND bookDate = '2025-11-14' AND expires_at > NOW();
```

### Only One Date Returned

**Possible reasons:**
1. Helicopter only flies once per month (check `departure_day`)
2. `start_date` is near end of month
3. Month has only one matching weekday

---

## 📞 Related APIs

- **Get Schedule by Helipad:** `GET /helicopter-schedules/schedule-by-helipad`
- **Get All Schedules:** `GET /helicopter-schedules/`
- **Get Schedule by ID:** `GET /helicopter-schedules/:id`
- **Hold Seats:** `POST /helicopter-seat/hold-seats`
- **Book Seats:** `POST /bookings/book-helicopter-seats`

---

## 🎉 Example Integration

```javascript
// React/Next.js example
async function getHelicopterPriceCalendar(scheduleId, month) {
  try {
    const url = month 
      ? `/helicopter-schedules/price-by-day/${scheduleId}?month=${month}`
      : `/helicopter-schedules/price-by-day/${scheduleId}`;
    
    const response = await fetch(url);
    const prices = await response.json();
    
    // Build calendar object
    const calendar = {};
    prices.forEach(day => {
      calendar[day.date] = {
        price: day.price,
        available: day.schedule.availableSeats > 0,
        seats: day.schedule.availableSeats
      };
    });
    
    return calendar;
  } catch (error) {
    console.error('API Error:', error);
    return {};
  }
}

// Usage
const calendar = await getHelicopterPriceCalendar(1, '2025-11');
console.log(calendar);
// {
//   '2025-11-14': { price: 5000, available: true, seats: 4 },
//   '2025-11-21': { price: 5000, available: true, seats: 3 },
//   '2025-11-28': { price: 5000, available: false, seats: 0 }
// }
```

---

## ✅ Summary

- **Endpoint:** `/helicopter-schedules/price-by-day/:id`
- **Method:** GET
- **Parameters:** `month` (optional), `start_date` (optional)
- **Returns:** Array of prices for all matching days
- **Same format as flight API** - Easy to integrate!
- **Real-time seat availability** for each date
