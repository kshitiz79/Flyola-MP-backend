# Coupon & Discount System

## Overview
Complete coupon/discount system for flight and helicopter bookings with admin management.

## Database Setup

Run the migration:
```bash
mysql -u your_user -p your_database < migrations/create-coupons-tables.sql
```

## API Endpoints

### 1. Complete Booking with Discount
**Endpoint:** `POST /api/bookings/complete-booking-discount`

**Request Body:** (Same as `/complete-booking` + couponCode)
```json
{
  "bookedSeat": { ... },
  "booking": { ... },
  "billing": { ... },
  "payment": { ... },
  "passengers": [ ... ],
  "couponCode": "FLYOLA50"
}
```

**Response:**
```json
{
  "message": "Booking completed successfully with discount",
  "booking": {
    "originalFare": 5000,
    "discountAmount": 500,
    "finalFare": 4500,
    "couponApplied": "FLYOLA50"
  },
  "discount": {
    "code": "FLYOLA50",
    "type": "percentage",
    "value": 10,
    "saved": 500
  }
}
```

### 2. Validate Coupon (Before Booking)
**Endpoint:** `POST /api/coupons/validate`

**Request:**
```json
{
  "code": "FLYOLA50",
  "bookingAmount": 5000,
  "userId": 123
}
```

**Response:**
```json
{
  "valid": true,
  "originalAmount": 5000,
  "discountAmount": "500.00",
  "finalAmount": "4500.00",
  "savings": "500.00"
}
```

### 3. Create Coupon (Admin Only)
**Endpoint:** `POST /api/coupons`
**Auth:** Required (Admin)

**Request:**
```json
{
  "code": "SUMMER2024",
  "discount_type": "percentage",
  "discount_value": 15,
  "max_discount": 1000,
  "min_booking_amount": 2000,
  "usage_limit": 100,
  "valid_from": "2024-06-01",
  "valid_until": "2024-08-31",
  "description": "Summer special 15% off"
}
```

### 4. Get All Coupons (Admin)
**Endpoint:** `GET /api/coupons`
**Auth:** Required (Admin)

### 5. Update Coupon (Admin)
**Endpoint:** `PUT /api/coupons/:id`
**Auth:** Required (Admin)

### 6. Delete Coupon (Admin)
**Endpoint:** `DELETE /api/coupons/:id`
**Auth:** Required (Admin)

### 7. Get Coupon Usage History (Admin)
**Endpoint:** `GET /api/coupons/usage/:couponId?`
**Auth:** Required (Admin)

## Coupon Types

### 1. Percentage Discount
```json
{
  "discount_type": "percentage",
  "discount_value": 10,
  "max_discount": 500
}
```
- 10% off with max ₹500 discount

### 2. Fixed Amount Discount
```json
{
  "discount_type": "fixed",
  "discount_value": 100
}
```
- Flat ₹100 off

## Features

✅ **Percentage & Fixed Discounts**
✅ **Maximum Discount Cap** (for percentage)
✅ **Minimum Booking Amount** requirement
✅ **Usage Limits** (total uses)
✅ **Validity Period** (from/until dates)
✅ **Auto-expiry** check
✅ **Usage Tracking** (who used when)
✅ **Admin Management** (CRUD operations)

## Integration Steps

### Frontend Integration

1. **Validate Coupon Before Payment:**
```javascript
const validateCoupon = async (code, amount) => {
  const response = await fetch('/api/coupons/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: code,
      bookingAmount: amount,
      userId: currentUserId
    })
  });
  return response.json();
};
```

2. **Complete Booking with Discount:**
```javascript
const completeBooking = async (bookingData, couponCode) => {
  const response = await fetch('/api/bookings/complete-booking-discount', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      ...bookingData,
      couponCode: couponCode
    })
  });
  return response.json();
};
```

### Admin Panel Integration

1. **Create Coupon Form** - Use POST /api/coupons
2. **Coupon List** - Use GET /api/coupons
3. **Edit Coupon** - Use PUT /api/coupons/:id
4. **Delete Coupon** - Use DELETE /api/coupons/:id
5. **Usage Reports** - Use GET /api/coupons/usage

## Sample Coupons (Auto-created)

1. **FLYOLA50** - 10% off (max ₹500) on bookings above ₹1000
2. **WELCOME100** - Flat ₹100 off on bookings above ₹500
3. **SUMMER2024** - 15% off (max ₹1000) on bookings above ₹2000

## Database Schema

### coupons table
- id, code, discount_type, discount_value
- max_discount, min_booking_amount
- usage_limit, used_count
- valid_from, valid_until, status
- description, created_by, timestamps

### coupon_usage table
- id, coupon_id, user_id, booking_id
- original_amount, discount_amount, final_amount
- used_at

## Notes for Developers

- `/complete-booking-discount` has **same format** as `/complete-booking`
- Just add `couponCode` field to existing booking payload
- No changes needed in existing booking flow
- Coupon validation happens automatically
- Discount is applied before payment processing
- Original fare is preserved in booking record
