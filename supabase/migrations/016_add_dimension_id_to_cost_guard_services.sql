-- Add dimension_id column to datadog_cost_guard_services table
-- This allows services to be linked to billing dimensions from datadog_billing_dimensions
ALTER TABLE datadog_cost_guard_services
ADD COLUMN IF NOT EXISTS dimension_id TEXT;

-- Note: Foreign key constraint is not added because dimension_id references datadog_billing_dimensions
-- which has a composite unique constraint (organization_id, dimension_id). 
-- A foreign key would require matching both columns, which is complex to implement.
-- Instead, we rely on application-level validation to ensure dimension_id exists.

-- Create index for faster lookups by dimension_id
CREATE INDEX IF NOT EXISTS idx_datadog_cost_guard_services_dimension_id 
ON datadog_cost_guard_services(dimension_id) 
WHERE dimension_id IS NOT NULL;

-- Add comment to column
COMMENT ON COLUMN datadog_cost_guard_services.dimension_id IS 
'Reference to dimension_id from datadog_billing_dimensions. When set, this service uses dimension-based data collection instead of service_key.';

