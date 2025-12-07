import {
  DATADOG_CREDENTIALS_EVENT,
} from './constants';

export interface DatadogCredentialPayload {
  apiKey: string;
  appKey: string;
  updatedAt: string;
}

/**
 * Load Datadog credentials from API (replaces localStorage)
 */
export async function loadDatadogCredentials(
  tenant: string,
): Promise<DatadogCredentialPayload | null> {
  try {
    const response = await fetch(
      `/api/datadog/credentials?tenant=${encodeURIComponent(tenant)}`,
      {
        method: 'GET',
        credentials: 'include',
      },
    );

    if (response.status === 404) {
      // Credentials not found
      return null;
    }

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('You do not have permission to view Datadog credentials');
      }
      throw new Error(`Failed to load credentials: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      apiKey: data.apiKey,
      appKey: data.appKey,
      updatedAt: new Date().toISOString(), // API doesn't return updatedAt yet
    };
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to load Datadog credentials');
  }
}

/**
 * Persist Datadog credentials via API (replaces localStorage)
 */
export async function persistDatadogCredentials(
  tenant: string,
  apiKey: string,
  appKey: string,
): Promise<DatadogCredentialPayload> {
  try {
    const response = await fetch('/api/datadog/credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        tenant,
        apiKey,
        appKey,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 403) {
        throw new Error('You do not have permission to manage Datadog credentials');
      }
      
      if (response.status === 400 && errorData.validationError) {
        throw new Error(errorData.message || 'Invalid Datadog credentials');
      }
      
      throw new Error(errorData.message || `Failed to save credentials: ${response.statusText}`);
    }

    const data = await response.json();
    
    const payload: DatadogCredentialPayload = {
      apiKey,
      appKey,
      updatedAt: new Date().toISOString(),
    };

    // Dispatch event for components that might be listening
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(DATADOG_CREDENTIALS_EVENT));
    }

    return payload;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to save Datadog credentials');
  }
}

/**
 * Remove Datadog credentials via API (replaces localStorage)
 */
export async function removeDatadogCredentials(tenant: string): Promise<void> {
  try {
    const response = await fetch(
      `/api/datadog/credentials?tenant=${encodeURIComponent(tenant)}`,
      {
        method: 'DELETE',
        credentials: 'include',
      },
    );

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('You do not have permission to delete Datadog credentials');
      }
      if (response.status === 404) {
        // Credentials don't exist, that's okay (idempotent)
        return;
      }
      throw new Error(`Failed to remove credentials: ${response.statusText}`);
    }

    // Dispatch event for components that might be listening
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(DATADOG_CREDENTIALS_EVENT));
    }
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to remove Datadog credentials');
  }
}


