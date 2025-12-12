-- Fix RLS policies for sessions and two_factor_codes tables
-- These tables were created without RLS enabled

-- ============================================================================
-- sessions table
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sessions') THEN
        -- Enable RLS if not already enabled
        ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

        -- Drop existing policies if they exist (to avoid conflicts)
        DROP POLICY IF EXISTS "Users can view their own sessions" ON sessions;
        DROP POLICY IF EXISTS "Users can insert their own sessions" ON sessions;
        DROP POLICY IF EXISTS "Users can update their own sessions" ON sessions;
        DROP POLICY IF EXISTS "Users can delete their own sessions" ON sessions;
        DROP POLICY IF EXISTS "Service role can manage sessions" ON sessions;

        -- Policy: Users can view their own sessions
        CREATE POLICY "Users can view their own sessions" ON sessions
            FOR SELECT USING (
                user_id = auth.uid()::text::uuid
            );

        -- Policy: Users can insert their own sessions
        CREATE POLICY "Users can insert their own sessions" ON sessions
            FOR INSERT WITH CHECK (
                user_id = auth.uid()::text::uuid
            );

        -- Policy: Users can update their own sessions
        CREATE POLICY "Users can update their own sessions" ON sessions
            FOR UPDATE USING (
                user_id = auth.uid()::text::uuid
            );

        -- Policy: Users can delete their own sessions
        CREATE POLICY "Users can delete their own sessions" ON sessions
            FOR DELETE USING (
                user_id = auth.uid()::text::uuid
            );

        -- Policy: Service role can manage all sessions
        CREATE POLICY "Service role can manage sessions" ON sessions
            FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;

-- ============================================================================
-- two_factor_codes table
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'two_factor_codes') THEN
        -- Enable RLS if not already enabled
        ALTER TABLE two_factor_codes ENABLE ROW LEVEL SECURITY;

        -- Drop existing policies if they exist (to avoid conflicts)
        DROP POLICY IF EXISTS "Users can view their own two factor codes" ON two_factor_codes;
        DROP POLICY IF EXISTS "Users can insert their own two factor codes" ON two_factor_codes;
        DROP POLICY IF EXISTS "Users can update their own two factor codes" ON two_factor_codes;
        DROP POLICY IF EXISTS "Users can delete their own two factor codes" ON two_factor_codes;
        DROP POLICY IF EXISTS "Service role can manage two factor codes" ON two_factor_codes;

        -- Policy: Users can view their own two factor codes
        CREATE POLICY "Users can view their own two factor codes" ON two_factor_codes
            FOR SELECT USING (
                user_id = auth.uid()::text::uuid
            );

        -- Policy: Users can insert their own two factor codes
        CREATE POLICY "Users can insert their own two factor codes" ON two_factor_codes
            FOR INSERT WITH CHECK (
                user_id = auth.uid()::text::uuid
            );

        -- Policy: Users can update their own two factor codes
        CREATE POLICY "Users can update their own two factor codes" ON two_factor_codes
            FOR UPDATE USING (
                user_id = auth.uid()::text::uuid
            );

        -- Policy: Users can delete their own two factor codes
        CREATE POLICY "Users can delete their own two factor codes" ON two_factor_codes
            FOR DELETE USING (
                user_id = auth.uid()::text::uuid
            );

        -- Policy: Service role can manage all two factor codes
        CREATE POLICY "Service role can manage two factor codes" ON two_factor_codes
            FOR ALL USING (auth.role() = 'service_role');
    END IF;
END $$;

