-- Fix RLS policies for other Datadog tables
-- This migration checks if tables exist and verifies their structure before creating RLS policies

-- ============================================================================
-- datadog_contracts (if exists)
-- ============================================================================
DO $$
DECLARE
    has_org_id BOOLEAN;
    has_contract_id BOOLEAN;
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'datadog_contracts') THEN
        -- Check which columns exist
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'datadog_contracts' 
            AND column_name = 'organization_id'
        ) INTO has_org_id;
        
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'datadog_contracts' 
            AND column_name = 'contract_id'
        ) INTO has_contract_id;

        -- Enable RLS if not already enabled
        ALTER TABLE datadog_contracts ENABLE ROW LEVEL SECURITY;

        -- Drop existing policies if they exist (to avoid conflicts)
        DROP POLICY IF EXISTS "Organization owners and admins can read datadog contracts" ON datadog_contracts;
        DROP POLICY IF EXISTS "Organization owners and admins can insert datadog contracts" ON datadog_contracts;
        DROP POLICY IF EXISTS "Organization owners and admins can update datadog contracts" ON datadog_contracts;
        DROP POLICY IF EXISTS "Organization owners and admins can delete datadog contracts" ON datadog_contracts;
        DROP POLICY IF EXISTS "Service role can manage datadog contracts" ON datadog_contracts;
        DROP POLICY IF EXISTS "Service role only for datadog contracts" ON datadog_contracts;

        -- Create policies based on available columns
        IF has_org_id THEN
            -- If has organization_id, use it directly
            CREATE POLICY "Organization owners and admins can read datadog contracts" ON datadog_contracts
                FOR SELECT USING (
                    organization_id IN (
                        SELECT organization_id
                        FROM organization_members
                        WHERE user_id = auth.uid()::text::uuid
                          AND role IN ('owner', 'admin')
                          AND status = 'active'
                    )
                );

            CREATE POLICY "Organization owners and admins can insert datadog contracts" ON datadog_contracts
                FOR INSERT WITH CHECK (
                    organization_id IN (
                        SELECT organization_id
                        FROM organization_members
                        WHERE user_id = auth.uid()::text::uuid
                          AND role IN ('owner', 'admin')
                          AND status = 'active'
                    )
                );

            CREATE POLICY "Organization owners and admins can update datadog contracts" ON datadog_contracts
                FOR UPDATE USING (
                    organization_id IN (
                        SELECT organization_id
                        FROM organization_members
                        WHERE user_id = auth.uid()::text::uuid
                          AND role IN ('owner', 'admin')
                          AND status = 'active'
                    )
                );

            CREATE POLICY "Organization owners and admins can delete datadog contracts" ON datadog_contracts
                FOR DELETE USING (
                    organization_id IN (
                        SELECT organization_id
                        FROM organization_members
                        WHERE user_id = auth.uid()::text::uuid
                          AND role IN ('owner', 'admin')
                          AND status = 'active'
                    )
                );
        ELSIF has_contract_id THEN
            -- If has contract_id, check through datadog_cost_guard_config
            CREATE POLICY "Organization owners and admins can read datadog contracts" ON datadog_contracts
                FOR SELECT USING (
                    EXISTS (
                        SELECT 1
                        FROM datadog_cost_guard_config dcgc
                        WHERE dcgc.id = datadog_contracts.contract_id
                          AND dcgc.organization_id IN (
                              SELECT organization_id
                              FROM organization_members
                              WHERE user_id = auth.uid()::text::uuid
                                AND role IN ('owner', 'admin')
                                AND status = 'active'
                          )
                    )
                );

            CREATE POLICY "Organization owners and admins can insert datadog contracts" ON datadog_contracts
                FOR INSERT WITH CHECK (
                    EXISTS (
                        SELECT 1
                        FROM datadog_cost_guard_config dcgc
                        WHERE dcgc.id = datadog_contracts.contract_id
                          AND dcgc.organization_id IN (
                              SELECT organization_id
                              FROM organization_members
                              WHERE user_id = auth.uid()::text::uuid
                                AND role IN ('owner', 'admin')
                                AND status = 'active'
                          )
                    )
                );

            CREATE POLICY "Organization owners and admins can update datadog contracts" ON datadog_contracts
                FOR UPDATE USING (
                    EXISTS (
                        SELECT 1
                        FROM datadog_cost_guard_config dcgc
                        WHERE dcgc.id = datadog_contracts.contract_id
                          AND dcgc.organization_id IN (
                              SELECT organization_id
                              FROM organization_members
                              WHERE user_id = auth.uid()::text::uuid
                                AND role IN ('owner', 'admin')
                                AND status = 'active'
                          )
                    )
                );

            CREATE POLICY "Organization owners and admins can delete datadog contracts" ON datadog_contracts
                FOR DELETE USING (
                    EXISTS (
                        SELECT 1
                        FROM datadog_cost_guard_config dcgc
                        WHERE dcgc.id = datadog_contracts.contract_id
                          AND dcgc.organization_id IN (
                              SELECT organization_id
                              FROM organization_members
                              WHERE user_id = auth.uid()::text::uuid
                                AND role IN ('owner', 'admin')
                                AND status = 'active'
                          )
                    )
                );
        ELSE
            -- If neither column exists, allow only service role (restrictive)
            CREATE POLICY "Service role only for datadog contracts" ON datadog_contracts
                FOR ALL USING (auth.role() = 'service_role');
        END IF;

        -- Always allow service role
        CREATE POLICY "Service role can manage datadog contracts" ON datadog_contracts
            FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;

-- ============================================================================
-- datadog_contract_products (if exists)
-- ============================================================================
DO $$
DECLARE
    has_org_id BOOLEAN;
    has_contract_id BOOLEAN;
    contracts_table_exists BOOLEAN;
    contracts_has_org_id BOOLEAN;
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'datadog_contract_products') THEN
        -- Check which columns exist
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'datadog_contract_products' 
            AND column_name = 'organization_id'
        ) INTO has_org_id;
        
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'datadog_contract_products' 
            AND column_name = 'contract_id'
        ) INTO has_contract_id;

        -- Check if datadog_contracts exists and has organization_id
        SELECT EXISTS (
            SELECT 1 FROM pg_tables 
            WHERE schemaname = 'public' 
            AND tablename = 'datadog_contracts'
        ) INTO contracts_table_exists;
        
        IF contracts_table_exists THEN
            SELECT EXISTS (
                SELECT 1 FROM information_schema.columns 
                WHERE table_schema = 'public' 
                AND table_name = 'datadog_contracts' 
                AND column_name = 'organization_id'
            ) INTO contracts_has_org_id;
        ELSE
            contracts_has_org_id := FALSE;
        END IF;

        ALTER TABLE datadog_contract_products ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "Organization owners and admins can read datadog contract products" ON datadog_contract_products;
        DROP POLICY IF EXISTS "Organization owners and admins can insert datadog contract products" ON datadog_contract_products;
        DROP POLICY IF EXISTS "Organization owners and admins can update datadog contract products" ON datadog_contract_products;
        DROP POLICY IF EXISTS "Organization owners and admins can delete datadog contract products" ON datadog_contract_products;
        DROP POLICY IF EXISTS "Service role can manage datadog contract products" ON datadog_contract_products;
        DROP POLICY IF EXISTS "Service role only for datadog contract products" ON datadog_contract_products;

        IF has_org_id THEN
            CREATE POLICY "Organization owners and admins can read datadog contract products" ON datadog_contract_products
                FOR SELECT USING (
                    organization_id IN (
                        SELECT organization_id
                        FROM organization_members
                        WHERE user_id = auth.uid()::text::uuid
                          AND role IN ('owner', 'admin')
                          AND status = 'active'
                    )
                );

            CREATE POLICY "Organization owners and admins can insert datadog contract products" ON datadog_contract_products
                FOR INSERT WITH CHECK (
                    organization_id IN (
                        SELECT organization_id
                        FROM organization_members
                        WHERE user_id = auth.uid()::text::uuid
                          AND role IN ('owner', 'admin')
                          AND status = 'active'
                    )
                );

            CREATE POLICY "Organization owners and admins can update datadog contract products" ON datadog_contract_products
                FOR UPDATE USING (
                    organization_id IN (
                        SELECT organization_id
                        FROM organization_members
                        WHERE user_id = auth.uid()::text::uuid
                          AND role IN ('owner', 'admin')
                          AND status = 'active'
                    )
                );

            CREATE POLICY "Organization owners and admins can delete datadog contract products" ON datadog_contract_products
                FOR DELETE USING (
                    organization_id IN (
                        SELECT organization_id
                        FROM organization_members
                        WHERE user_id = auth.uid()::text::uuid
                          AND role IN ('owner', 'admin')
                          AND status = 'active'
                    )
                );
        ELSIF has_contract_id THEN
            -- Try through datadog_cost_guard_config (which we know exists and has organization_id)
            -- Optionally also check datadog_contracts if it exists and has organization_id
            IF contracts_has_org_id THEN
                    CREATE POLICY "Organization owners and admins can read datadog contract products" ON datadog_contract_products
                        FOR SELECT USING (
                            EXISTS (
                                SELECT 1
                                FROM datadog_contracts dc
                                WHERE dc.id = datadog_contract_products.contract_id
                                  AND dc.organization_id IN (
                                      SELECT organization_id
                                      FROM organization_members
                                      WHERE user_id = auth.uid()::text::uuid
                                        AND role IN ('owner', 'admin')
                                        AND status = 'active'
                                  )
                            )
                            OR EXISTS (
                                SELECT 1
                                FROM datadog_cost_guard_config dcgc
                                WHERE dcgc.id = datadog_contract_products.contract_id
                                  AND dcgc.organization_id IN (
                                      SELECT organization_id
                                      FROM organization_members
                                      WHERE user_id = auth.uid()::text::uuid
                                        AND role IN ('owner', 'admin')
                                        AND status = 'active'
                                  )
                            )
                        );

                    CREATE POLICY "Organization owners and admins can insert datadog contract products" ON datadog_contract_products
                        FOR INSERT WITH CHECK (
                            EXISTS (
                                SELECT 1
                                FROM datadog_contracts dc
                                WHERE dc.id = datadog_contract_products.contract_id
                                  AND dc.organization_id IN (
                                      SELECT organization_id
                                      FROM organization_members
                                      WHERE user_id = auth.uid()::text::uuid
                                        AND role IN ('owner', 'admin')
                                        AND status = 'active'
                                  )
                            )
                            OR EXISTS (
                                SELECT 1
                                FROM datadog_cost_guard_config dcgc
                                WHERE dcgc.id = datadog_contract_products.contract_id
                                  AND dcgc.organization_id IN (
                                      SELECT organization_id
                                      FROM organization_members
                                      WHERE user_id = auth.uid()::text::uuid
                                        AND role IN ('owner', 'admin')
                                        AND status = 'active'
                                  )
                            )
                        );

                    CREATE POLICY "Organization owners and admins can update datadog contract products" ON datadog_contract_products
                        FOR UPDATE USING (
                            EXISTS (
                                SELECT 1
                                FROM datadog_contracts dc
                                WHERE dc.id = datadog_contract_products.contract_id
                                  AND dc.organization_id IN (
                                      SELECT organization_id
                                      FROM organization_members
                                      WHERE user_id = auth.uid()::text::uuid
                                        AND role IN ('owner', 'admin')
                                        AND status = 'active'
                                  )
                            )
                            OR EXISTS (
                                SELECT 1
                                FROM datadog_cost_guard_config dcgc
                                WHERE dcgc.id = datadog_contract_products.contract_id
                                  AND dcgc.organization_id IN (
                                      SELECT organization_id
                                      FROM organization_members
                                      WHERE user_id = auth.uid()::text::uuid
                                        AND role IN ('owner', 'admin')
                                        AND status = 'active'
                                  )
                            )
                        );

                    CREATE POLICY "Organization owners and admins can delete datadog contract products" ON datadog_contract_products
                        FOR DELETE USING (
                            EXISTS (
                                SELECT 1
                                FROM datadog_contracts dc
                                WHERE dc.id = datadog_contract_products.contract_id
                                  AND dc.organization_id IN (
                                      SELECT organization_id
                                      FROM organization_members
                                      WHERE user_id = auth.uid()::text::uuid
                                        AND role IN ('owner', 'admin')
                                        AND status = 'active'
                                  )
                            )
                            OR EXISTS (
                                SELECT 1
                                FROM datadog_cost_guard_config dcgc
                                WHERE dcgc.id = datadog_contract_products.contract_id
                                  AND dcgc.organization_id IN (
                                      SELECT organization_id
                                      FROM organization_members
                                      WHERE user_id = auth.uid()::text::uuid
                                        AND role IN ('owner', 'admin')
                                        AND status = 'active'
                                  )
                            )
                        );
                ELSE
                    -- Only use datadog_cost_guard_config
                    CREATE POLICY "Organization owners and admins can read datadog contract products" ON datadog_contract_products
                        FOR SELECT USING (
                            EXISTS (
                                SELECT 1
                                FROM datadog_cost_guard_config dcgc
                                WHERE dcgc.id = datadog_contract_products.contract_id
                                  AND dcgc.organization_id IN (
                                      SELECT organization_id
                                      FROM organization_members
                                      WHERE user_id = auth.uid()::text::uuid
                                        AND role IN ('owner', 'admin')
                                        AND status = 'active'
                                  )
                            )
                        );

                    CREATE POLICY "Organization owners and admins can insert datadog contract products" ON datadog_contract_products
                        FOR INSERT WITH CHECK (
                            EXISTS (
                                SELECT 1
                                FROM datadog_cost_guard_config dcgc
                                WHERE dcgc.id = datadog_contract_products.contract_id
                                  AND dcgc.organization_id IN (
                                      SELECT organization_id
                                      FROM organization_members
                                      WHERE user_id = auth.uid()::text::uuid
                                        AND role IN ('owner', 'admin')
                                        AND status = 'active'
                                  )
                            )
                        );

                    CREATE POLICY "Organization owners and admins can update datadog contract products" ON datadog_contract_products
                        FOR UPDATE USING (
                            EXISTS (
                                SELECT 1
                                FROM datadog_cost_guard_config dcgc
                                WHERE dcgc.id = datadog_contract_products.contract_id
                                  AND dcgc.organization_id IN (
                                      SELECT organization_id
                                      FROM organization_members
                                      WHERE user_id = auth.uid()::text::uuid
                                        AND role IN ('owner', 'admin')
                                        AND status = 'active'
                                  )
                            )
                        );

                    CREATE POLICY "Organization owners and admins can delete datadog contract products" ON datadog_contract_products
                        FOR DELETE USING (
                            EXISTS (
                                SELECT 1
                                FROM datadog_cost_guard_config dcgc
                                WHERE dcgc.id = datadog_contract_products.contract_id
                                  AND dcgc.organization_id IN (
                                      SELECT organization_id
                                      FROM organization_members
                                      WHERE user_id = auth.uid()::text::uuid
                                        AND role IN ('owner', 'admin')
                                        AND status = 'active'
                                  )
                            )
                        );
            END IF;
        ELSE
            CREATE POLICY "Service role only for datadog contract products" ON datadog_contract_products
                FOR ALL USING (auth.role() = 'service_role');
        END IF;

        CREATE POLICY "Service role can manage datadog contract products" ON datadog_contract_products
            FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;

-- ============================================================================
-- datadog_credentials (if exists)
-- ============================================================================
DO $$
DECLARE
    has_org_id BOOLEAN;
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'datadog_credentials') THEN
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'datadog_credentials' 
            AND column_name = 'organization_id'
        ) INTO has_org_id;

        ALTER TABLE datadog_credentials ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "Organization owners and admins can read datadog credentials" ON datadog_credentials;
        DROP POLICY IF EXISTS "Organization owners and admins can insert datadog credentials" ON datadog_credentials;
        DROP POLICY IF EXISTS "Organization owners and admins can update datadog credentials" ON datadog_credentials;
        DROP POLICY IF EXISTS "Organization owners and admins can delete datadog credentials" ON datadog_credentials;
        DROP POLICY IF EXISTS "Service role can manage datadog credentials" ON datadog_credentials;
        DROP POLICY IF EXISTS "Service role only for datadog credentials" ON datadog_credentials;

        IF has_org_id THEN
            CREATE POLICY "Organization owners and admins can read datadog credentials" ON datadog_credentials
                FOR SELECT USING (
                    organization_id IN (
                        SELECT organization_id
                        FROM organization_members
                        WHERE user_id = auth.uid()::text::uuid
                          AND role IN ('owner', 'admin')
                          AND status = 'active'
                    )
                );

            CREATE POLICY "Organization owners and admins can insert datadog credentials" ON datadog_credentials
                FOR INSERT WITH CHECK (
                    organization_id IN (
                        SELECT organization_id
                        FROM organization_members
                        WHERE user_id = auth.uid()::text::uuid
                          AND role IN ('owner', 'admin')
                          AND status = 'active'
                    )
                );

            CREATE POLICY "Organization owners and admins can update datadog credentials" ON datadog_credentials
                FOR UPDATE USING (
                    organization_id IN (
                        SELECT organization_id
                        FROM organization_members
                        WHERE user_id = auth.uid()::text::uuid
                          AND role IN ('owner', 'admin')
                          AND status = 'active'
                    )
                );

            CREATE POLICY "Organization owners and admins can delete datadog credentials" ON datadog_credentials
                FOR DELETE USING (
                    organization_id IN (
                        SELECT organization_id
                        FROM organization_members
                        WHERE user_id = auth.uid()::text::uuid
                          AND role IN ('owner', 'admin')
                          AND status = 'active'
                    )
                );
        ELSE
            CREATE POLICY "Service role only for datadog credentials" ON datadog_credentials
                FOR ALL USING (auth.role() = 'service_role');
        END IF;

        CREATE POLICY "Service role can manage datadog credentials" ON datadog_credentials
            FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;

-- ============================================================================
-- datadog_usage (if exists)
-- ============================================================================
DO $$
DECLARE
    has_org_id BOOLEAN;
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'datadog_usage') THEN
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'datadog_usage' 
            AND column_name = 'organization_id'
        ) INTO has_org_id;

        ALTER TABLE datadog_usage ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "Organization owners and admins can read datadog usage" ON datadog_usage;
        DROP POLICY IF EXISTS "Organization owners and admins can insert datadog usage" ON datadog_usage;
        DROP POLICY IF EXISTS "Organization owners and admins can update datadog usage" ON datadog_usage;
        DROP POLICY IF EXISTS "Organization owners and admins can delete datadog usage" ON datadog_usage;
        DROP POLICY IF EXISTS "Service role can manage datadog usage" ON datadog_usage;
        DROP POLICY IF EXISTS "Service role only for datadog usage" ON datadog_usage;

        IF has_org_id THEN
            CREATE POLICY "Organization owners and admins can read datadog usage" ON datadog_usage
                FOR SELECT USING (
                    organization_id IN (
                        SELECT organization_id
                        FROM organization_members
                        WHERE user_id = auth.uid()::text::uuid
                          AND role IN ('owner', 'admin')
                          AND status = 'active'
                    )
                );

            CREATE POLICY "Organization owners and admins can insert datadog usage" ON datadog_usage
                FOR INSERT WITH CHECK (
                    organization_id IN (
                        SELECT organization_id
                        FROM organization_members
                        WHERE user_id = auth.uid()::text::uuid
                          AND role IN ('owner', 'admin')
                          AND status = 'active'
                    )
                );

            CREATE POLICY "Organization owners and admins can update datadog usage" ON datadog_usage
                FOR UPDATE USING (
                    organization_id IN (
                        SELECT organization_id
                        FROM organization_members
                        WHERE user_id = auth.uid()::text::uuid
                          AND role IN ('owner', 'admin')
                          AND status = 'active'
                    )
                );

            CREATE POLICY "Organization owners and admins can delete datadog usage" ON datadog_usage
                FOR DELETE USING (
                    organization_id IN (
                        SELECT organization_id
                        FROM organization_members
                        WHERE user_id = auth.uid()::text::uuid
                          AND role IN ('owner', 'admin')
                          AND status = 'active'
                    )
                );
        ELSE
            CREATE POLICY "Service role only for datadog usage" ON datadog_usage
                FOR ALL USING (auth.role() = 'service_role');
        END IF;

        CREATE POLICY "Service role can manage datadog usage" ON datadog_usage
            FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;
