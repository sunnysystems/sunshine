-- Create table for individual Datadog services in Cost Guard contracts
CREATE TABLE IF NOT EXISTS datadog_cost_guard_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_id UUID NOT NULL REFERENCES datadog_cost_guard_config(id) ON DELETE CASCADE,
    service_name TEXT NOT NULL, -- Nome exato da quote (e.g., "Infra Host (Enterprise)")
    service_key TEXT NOT NULL, -- Chave interna (e.g., "infra_host_enterprise")
    product_family TEXT NOT NULL, -- product_family da API (e.g., "infra_hosts")
    usage_type TEXT, -- usage_type específico da API v2 (e.g., "infra_host_enterprise")
    quantity DECIMAL(12, 2) NOT NULL, -- Quantidade committed
    list_price DECIMAL(12, 4) NOT NULL, -- Preço unitário LIST PRICE
    unit TEXT NOT NULL, -- Unidade (hosts, GB, M, K, etc.)
    committed_value DECIMAL(12, 2) NOT NULL, -- Valor total committed (quantity * list_price)
    threshold DECIMAL(12, 2), -- Threshold opcional (padrão 90% do committed)
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE(config_id, service_key) -- Um serviço por chave por contrato
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_datadog_cost_guard_services_config_id ON datadog_cost_guard_services(config_id);
CREATE INDEX IF NOT EXISTS idx_datadog_cost_guard_services_service_key ON datadog_cost_guard_services(service_key);

-- Enable RLS
ALTER TABLE datadog_cost_guard_services ENABLE ROW LEVEL SECURITY;

-- Policy: Organization owners and admins can read services for their configs
CREATE POLICY "Organization owners and admins can read datadog cost guard services" ON datadog_cost_guard_services
    FOR SELECT USING (
        config_id IN (
            SELECT id
            FROM datadog_cost_guard_config
            WHERE organization_id IN (
                SELECT organization_id
                FROM organization_members
                WHERE user_id = auth.uid()::text::uuid
                  AND role IN ('owner', 'admin')
                  AND status = 'active'
            )
        )
    );

-- Policy: Organization owners and admins can insert services for their configs
CREATE POLICY "Organization owners and admins can insert datadog cost guard services" ON datadog_cost_guard_services
    FOR INSERT WITH CHECK (
        config_id IN (
            SELECT id
            FROM datadog_cost_guard_config
            WHERE organization_id IN (
                SELECT organization_id
                FROM organization_members
                WHERE user_id = auth.uid()::text::uuid
                  AND role IN ('owner', 'admin')
                  AND status = 'active'
            )
        )
    );

-- Policy: Organization owners and admins can update services for their configs
CREATE POLICY "Organization owners and admins can update datadog cost guard services" ON datadog_cost_guard_services
    FOR UPDATE USING (
        config_id IN (
            SELECT id
            FROM datadog_cost_guard_config
            WHERE organization_id IN (
                SELECT organization_id
                FROM organization_members
                WHERE user_id = auth.uid()::text::uuid
                  AND role IN ('owner', 'admin')
                  AND status = 'active'
            )
        )
    );

-- Policy: Organization owners and admins can delete services for their configs
CREATE POLICY "Organization owners and admins can delete datadog cost guard services" ON datadog_cost_guard_services
    FOR DELETE USING (
        config_id IN (
            SELECT id
            FROM datadog_cost_guard_config
            WHERE organization_id IN (
                SELECT organization_id
                FROM organization_members
                WHERE user_id = auth.uid()::text::uuid
                  AND role IN ('owner', 'admin')
                  AND status = 'active'
            )
        )
    );

-- Policy: Service role can manage all services
CREATE POLICY "Service role can manage datadog cost guard services" ON datadog_cost_guard_services
    FOR ALL USING (auth.role() = 'service_role');

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_datadog_cost_guard_services_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_datadog_cost_guard_services_updated_at
    BEFORE UPDATE ON datadog_cost_guard_services
    FOR EACH ROW
    EXECUTE FUNCTION update_datadog_cost_guard_services_updated_at();

-- Function to automatically calculate committed_value
CREATE OR REPLACE FUNCTION calculate_committed_value()
RETURNS TRIGGER AS $$
BEGIN
    NEW.committed_value = NEW.quantity * NEW.list_price;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically calculate committed_value
CREATE TRIGGER calculate_datadog_cost_guard_services_committed_value
    BEFORE INSERT OR UPDATE ON datadog_cost_guard_services
    FOR EACH ROW
    EXECUTE FUNCTION calculate_committed_value();

