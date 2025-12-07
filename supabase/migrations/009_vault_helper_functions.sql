-- Helper functions to access Supabase Vault for Datadog credentials
-- These functions wrap the vault extension functions
-- Documentation: https://supabase.com/docs/guides/database/vault
--
-- Note: These functions use SECURITY DEFINER to run with elevated privileges
-- to access vault.decrypted_secrets view. The service_role will be able to
-- execute these functions via RPC calls.

-- Function to create/update a secret in vault
-- If secret with same name exists, delete it first, then create new one
CREATE OR REPLACE FUNCTION vault_create_secret(secret_name TEXT, secret_value TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  existing_secret_id UUID;
BEGIN
  -- Check if secret with this name already exists
  SELECT id INTO existing_secret_id
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;
  
  -- If exists, update it using the UUID
  IF existing_secret_id IS NOT NULL THEN
    -- Update the existing secret
    PERFORM vault.update_secret(existing_secret_id, secret_value, secret_name, 'Datadog credential');
  ELSE
    -- Create new secret with name and description
    PERFORM vault.create_secret(secret_value, secret_name, 'Datadog credential');
  END IF;
END;
$$;

-- Function to get a secret from vault by name
CREATE OR REPLACE FUNCTION vault_get_secret(secret_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  secret_value TEXT;
BEGIN
  SELECT decrypted_secret INTO secret_value
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;
  
  RETURN secret_value;
EXCEPTION
  WHEN OTHERS THEN
    -- Return NULL if secret doesn't exist
    RETURN NULL;
END;
$$;

-- Function to delete a secret from vault by name
CREATE OR REPLACE FUNCTION vault_delete_secret(secret_name TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  secret_id UUID;
BEGIN
  -- Find the secret by name
  SELECT id INTO secret_id
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;
  
  -- If found, delete it
  IF secret_id IS NOT NULL THEN
    -- Delete from vault.secrets table using the ID
    DELETE FROM vault.secrets WHERE id = secret_id;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Ignore errors if secret doesn't exist (idempotent)
    NULL;
END;
$$;

-- Grant execute permissions to service role
GRANT EXECUTE ON FUNCTION vault_create_secret(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION vault_get_secret(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION vault_delete_secret(TEXT) TO service_role;

