/**
 * Validate Datadog credentials by making test API calls
 * This performs a sanity check to ensure the credentials are functional
 * Tries multiple endpoints to ensure robust validation
 */
export async function validateDatadogCredentials(
  apiKey: string,
  appKey: string,
): Promise<{ valid: boolean; error?: string }> {
  const headers = {
    'DD-API-KEY': apiKey,
    'DD-APPLICATION-KEY': appKey,
  };

  // Try /api/v1/user endpoint first (most reliable)
  try {
    const userResponse = await fetch('https://api.datadoghq.com/api/v1/user', {
      method: 'GET',
      headers,
    });

    if (userResponse.ok) {
      // If we get a successful response, credentials are valid
      return { valid: true };
    }

    // If 401 or 403, credentials are invalid
    if (userResponse.status === 401 || userResponse.status === 403) {
      return {
        valid: false,
        error: 'Invalid API key or Application key. Please check your credentials.',
      };
    }
  } catch (error) {
    // If network error on first endpoint, try the validate endpoint
    // Continue to fallback below
  }

  // Fallback: Try /api/v1/validate endpoint
  try {
    const validateResponse = await fetch(
      'https://api.datadoghq.com/api/v1/validate',
      {
        method: 'GET',
        headers,
      },
    );

    if (validateResponse.ok) {
      const data = await validateResponse.json().catch(() => ({}));
      
      // Check if response has valid: true
      if (data.valid === true) {
        return { valid: true };
      }
      
      // If response is ok but doesn't have valid: true, still consider it valid
      // (some endpoints might not return the valid field)
      return { valid: true };
    }

    // Handle specific error statuses
    if (validateResponse.status === 403) {
      return {
        valid: false,
        error: 'Invalid API key or Application key. Please check your credentials.',
      };
    }
    if (validateResponse.status === 401) {
      return {
        valid: false,
        error: 'Authentication failed. Please verify your API and Application keys.',
      };
    }
    
    return {
      valid: false,
      error: `Datadog API returned status ${validateResponse.status}. Please verify your credentials.`,
    };
  } catch (error) {
    // Handle network errors
    if (error instanceof Error) {
      if (error.message.includes('fetch') || error.message.includes('network')) {
        return {
          valid: false,
          error: 'Network error. Please check your internet connection and try again.',
        };
      }
      return {
        valid: false,
        error: `Validation error: ${error.message}`,
      };
    }
    return {
      valid: false,
      error: 'Unknown error occurred during credential validation.',
    };
  }
}

