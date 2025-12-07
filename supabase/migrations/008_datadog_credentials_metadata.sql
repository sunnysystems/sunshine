-- Create metadata table for tracking Datadog credentials updates
-- This is optional - we can check vault directly for existence

CREATE TABLE IF NOT EXISTS datadog_credentials_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_datadog_credentials_metadata_org_id ON datadog_credentials_metadata(organization_id);

-- Enable Row Level Security
ALTER TABLE datadog_credentials_metadata ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only organization owners/admins can read metadata
CREATE POLICY "Organization owners and admins can view metadata" ON datadog_credentials_metadata
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE user_id = auth.uid()::text::uuid
              AND role IN ('owner', 'admin')
              AND status = 'active'
        )
    );

-- RLS Policy: Service role can manage metadata for system operations
CREATE POLICY "Service role can manage metadata" ON datadog_credentials_metadata
    FOR ALL USING (auth.role() = 'service_role');

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_datadog_credentials_metadata_updated_at
    BEFORE UPDATE ON datadog_credentials_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

