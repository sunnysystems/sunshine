-- Create table for Datadog Cost Guard contract configurations
CREATE TABLE IF NOT EXISTS datadog_cost_guard_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
    contract_start_date DATE NOT NULL,
    contract_end_date DATE NOT NULL,
    plan_name TEXT NOT NULL DEFAULT 'Enterprise Observability',
    billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')) DEFAULT 'monthly',
    contracted_spend DECIMAL(12, 2) NOT NULL DEFAULT 0,
    product_families JSONB DEFAULT '{}'::jsonb,
    thresholds JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_datadog_cost_guard_config_org_id ON datadog_cost_guard_config(organization_id);

-- Enable RLS
ALTER TABLE datadog_cost_guard_config ENABLE ROW LEVEL SECURITY;

-- Policy: Organization owners and admins can read their config
CREATE POLICY "Organization owners and admins can read datadog cost guard config" ON datadog_cost_guard_config
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE user_id = auth.uid()::text::uuid
              AND role IN ('owner', 'admin')
              AND status = 'active'
        )
    );

-- Policy: Organization owners and admins can insert their config
CREATE POLICY "Organization owners and admins can insert datadog cost guard config" ON datadog_cost_guard_config
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE user_id = auth.uid()::text::uuid
              AND role IN ('owner', 'admin')
              AND status = 'active'
        )
    );

-- Policy: Organization owners and admins can update their config
CREATE POLICY "Organization owners and admins can update datadog cost guard config" ON datadog_cost_guard_config
    FOR UPDATE USING (
        organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE user_id = auth.uid()::text::uuid
              AND role IN ('owner', 'admin')
              AND status = 'active'
        )
    );

-- Policy: Organization owners and admins can delete their config
CREATE POLICY "Organization owners and admins can delete datadog cost guard config" ON datadog_cost_guard_config
    FOR DELETE USING (
        organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE user_id = auth.uid()::text::uuid
              AND role IN ('owner', 'admin')
              AND status = 'active'
        )
    );

-- Policy: Service role can manage all configs
CREATE POLICY "Service role can manage datadog cost guard config" ON datadog_cost_guard_config
    FOR ALL USING (auth.role() = 'service_role');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_datadog_cost_guard_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_datadog_cost_guard_config_updated_at
    BEFORE UPDATE ON datadog_cost_guard_config
    FOR EACH ROW
    EXECUTE FUNCTION update_datadog_cost_guard_config_updated_at();

