-- Rollback Migration: Remove type field from airports table
-- Date: 2024-11-17

-- Drop the index
DROP INDEX IF EXISTS idx_airports_type ON airports;

-- Remove the type column
ALTER TABLE airports DROP COLUMN type;
