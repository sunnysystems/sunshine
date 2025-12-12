-- Create table for Datadog billing dimensions mapping
CREATE TABLE IF NOT EXISTS datadog_billing_dimensions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    dimension_id TEXT NOT NULL, -- ID da dimensão do Datadog (e.g., "infra_host", "logs_ingested")
    label TEXT NOT NULL, -- Label da dimensão (e.g., "Infra Hosts", "Ingested Logs")
    hourly_usage_keys JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array de keys (e.g., ["host_count"])
    mapped_service_key TEXT, -- Chave do SERVICE_MAPPINGS se mapeado (nullable)
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, dimension_id) -- Uma dimensão por organização
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_datadog_billing_dimensions_org_id ON datadog_billing_dimensions(organization_id);
CREATE INDEX IF NOT EXISTS idx_datadog_billing_dimensions_dimension_id ON datadog_billing_dimensions(dimension_id);
CREATE INDEX IF NOT EXISTS idx_datadog_billing_dimensions_mapped_service_key ON datadog_billing_dimensions(mapped_service_key) WHERE mapped_service_key IS NOT NULL;

-- Enable RLS
ALTER TABLE datadog_billing_dimensions ENABLE ROW LEVEL SECURITY;

-- Policy: Organization owners and admins can read their billing dimensions
CREATE POLICY "Organization owners and admins can read datadog billing dimensions" ON datadog_billing_dimensions
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE user_id = auth.uid()::text::uuid
              AND role IN ('owner', 'admin')
              AND status = 'active'
        )
    );

-- Policy: Organization owners and admins can insert their billing dimensions
CREATE POLICY "Organization owners and admins can insert datadog billing dimensions" ON datadog_billing_dimensions
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE user_id = auth.uid()::text::uuid
              AND role IN ('owner', 'admin')
              AND status = 'active'
        )
    );

-- Policy: Organization owners and admins can update their billing dimensions
CREATE POLICY "Organization owners and admins can update datadog billing dimensions" ON datadog_billing_dimensions
    FOR UPDATE USING (
        organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE user_id = auth.uid()::text::uuid
              AND role IN ('owner', 'admin')
              AND status = 'active'
        )
    );

-- Policy: Organization owners and admins can delete their billing dimensions
CREATE POLICY "Organization owners and admins can delete datadog billing dimensions" ON datadog_billing_dimensions
    FOR DELETE USING (
        organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE user_id = auth.uid()::text::uuid
              AND role IN ('owner', 'admin')
              AND status = 'active'
        )
    );

-- Policy: Service role can manage all billing dimensions
CREATE POLICY "Service role can manage datadog billing dimensions" ON datadog_billing_dimensions
    FOR ALL USING (auth.role() = 'service_role');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_datadog_billing_dimensions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_datadog_billing_dimensions_updated_at
    BEFORE UPDATE ON datadog_billing_dimensions
    FOR EACH ROW
    EXECUTE FUNCTION update_datadog_billing_dimensions_updated_at();

