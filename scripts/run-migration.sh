#!/bin/bash

# Script to run the guest booking migration
# Usage: ./scripts/run-migration.sh

echo "🚀 Running Guest Booking Migration..."
echo ""

# Get database credentials from .env
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "❌ Error: .env file not found"
    exit 1
fi

# Run the migration
mysql -h "${DB_HOST:-localhost}" -u "${DB_USER:-root}" -p"${DB_PASSWORD}" "${DB_NAME}" < migrations/add_guest_booking_support.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "Verifying guest user..."
    mysql -h "${DB_HOST:-localhost}" -u "${DB_USER:-root}" -p"${DB_PASSWORD}" "${DB_NAME}" -e "SELECT id, name, email, number FROM users WHERE email='guest@flyola.com';"
    echo ""
    echo "✅ Setup complete! You can now test guest bookings."
else
    echo ""
    echo "❌ Migration failed. Please check the error above."
    exit 1
fi
