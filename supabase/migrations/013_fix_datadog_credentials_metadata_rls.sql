-- Fix RLS policies for datadog_credentials_metadata
-- Add missing INSERT, UPDATE, and DELETE policies for owners/admins

-- Policy: Organization owners and admins can insert their metadata
CREATE POLICY "Organization owners and admins can insert datadog credentials metadata" ON datadog_credentials_metadata
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE user_id = auth.uid()::text::uuid
              AND role IN ('owner', 'admin')
              AND status = 'active'
        )
    );

-- Policy: Organization owners and admins can update their metadata
CREATE POLICY "Organization owners and admins can update datadog credentials metadata" ON datadog_credentials_metadata
    FOR UPDATE USING (
        organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE user_id = auth.uid()::text::uuid
              AND role IN ('owner', 'admin')
              AND status = 'active'
        )
    );

-- Policy: Organization owners and admins can delete their metadata
CREATE POLICY "Organization owners and admins can delete datadog credentials metadata" ON datadog_credentials_metadata
    FOR DELETE USING (
        organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE user_id = auth.uid()::text::uuid
              AND role IN ('owner', 'admin')
              AND status = 'active'
        )
    );

