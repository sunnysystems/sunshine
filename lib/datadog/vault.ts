import { supabaseAdmin } from '@/lib/supabase';

/**
 * Get the vault secret name for a Datadog credential
 * Pattern: datadog_{type}_{organizationId}
 */
export function getVaultSecretName(
  organizationId: string,
  type: 'api' | 'app',
): string {
  return `datadog_${type}_${organizationId}`;
}

/**
 * Store a credential in Supabase Vault
 * Uses supabase_vault.create_secret() function via RPC
 */
export async function storeCredentialInVault(
  organizationId: string,
  type: 'api' | 'app',
  value: string,
): Promise<void> {
  const secretName = getVaultSecretName(organizationId, type);

  try {
    // Try to delete existing secret first (idempotent)
    try {
      await supabaseAdmin.rpc('vault_delete_secret', {
        secret_name: secretName,
      });
    } catch {
      // Ignore errors if secret doesn't exist
    }

    // Create the secret using supabase_vault.create_secret
    const { error } = await supabaseAdmin.rpc('vault_create_secret', {
      secret_name: secretName,
      secret_value: value,
    });

    if (error) {
      // If RPC doesn't exist, try using SQL directly
      // This requires creating a helper function in the database
      throw new Error(
        `Failed to store ${type} credential in vault: ${error.message}. Please ensure supabase_vault extension is enabled and vault functions are available.`,
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to store ${type} credential in vault`);
  }
}

/**
 * Get a credential from Supabase Vault
 * Uses supabase_vault.get_secret() function via RPC
 */
export async function getCredentialFromVault(
  organizationId: string,
  type: 'api' | 'app',
): Promise<string | null> {
  const secretName = getVaultSecretName(organizationId, type);

  try {
    const { data, error } = await supabaseAdmin.rpc('vault_get_secret', {
      secret_name: secretName,
    });

    if (error) {
      // If secret doesn't exist, return null (not an error)
      if (
        error.message?.includes('not found') ||
        error.code === 'PGRST116' ||
        error.message?.includes('does not exist') ||
        error.message?.includes('No secret found')
      ) {
        return null;
      }
      throw new Error(
        `Failed to get ${type} credential from vault: ${error.message}`,
      );
    }

    return data || null;
  } catch (error) {
    // If secret doesn't exist, return null
    if (
      error instanceof Error &&
      (error.message.includes('not found') ||
        error.message.includes('does not exist') ||
        error.message.includes('No secret found'))
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * Delete a credential from Supabase Vault
 * Uses supabase_vault.delete_secret() function via RPC
 */
export async function deleteCredentialFromVault(
  organizationId: string,
  type: 'api' | 'app',
): Promise<void> {
  const secretName = getVaultSecretName(organizationId, type);

  try {
    const { error } = await supabaseAdmin.rpc('vault_delete_secret', {
      secret_name: secretName,
    });

    if (error) {
      // If secret doesn't exist, that's okay (idempotent)
      if (
        error.message?.includes('not found') ||
        error.code === 'PGRST116' ||
        error.message?.includes('does not exist') ||
        error.message?.includes('No secret found')
      ) {
        return;
      }
      throw new Error(
        `Failed to delete ${type} credential from vault: ${error.message}`,
      );
    }
  } catch (error) {
    // If secret doesn't exist, that's okay
    if (
      error instanceof Error &&
      (error.message.includes('not found') ||
        error.message.includes('does not exist') ||
        error.message.includes('No secret found'))
    ) {
      return;
    }
    throw error;
  }
}

