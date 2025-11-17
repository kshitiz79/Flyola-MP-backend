-- Migration: Add type field to airports table
-- Date: 2024-11-17

-- Add type column with ENUM values
ALTER TABLE airports 
ADD COLUMN type ENUM('airport', 'helipad', 'both') NOT NULL DEFAULT 'airport' 
COMMENT 'Type of location: airport (airport only), helipad (helipad only), or both (airport with helipad)';

-- Update existing records based on current data
-- Set type to 'both' for locations that have both airport_code and has_helipad=true
UPDATE airports 
SET type = 'both' 
WHERE airport_code IS NOT NULL AND has_helipad = true;

-- Set type to 'helipad' for locations that have no airport_code but have helipad facilities
UPDATE airports 
SET type = 'helipad' 
WHERE airport_code IS NULL AND has_helipad = true;

-- Set type to 'airport' for locations that have airport_code but no helipad
UPDATE airports 
SET type = 'airport' 
WHERE airport_code IS NOT NULL AND (has_helipad = false OR has_helipad IS NULL);

-- Add index for better query performance
CREATE INDEX idx_airports_type ON airports(type);
