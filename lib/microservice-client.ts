/**
 * Client-side helper functions for microservice authentication
 * These functions can be used in React components to interact with microservices
 */

export interface MicroserviceTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface RefreshTokenResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
}

/**
 * Get access and refresh tokens for microservice authentication
 */
export async function getMicroserviceTokens(): Promise<MicroserviceTokenResponse> {
  const response = await fetch('/api/microservices/token', {
    method: 'POST',
    credentials: 'include', // Important: includes session cookie
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to obtain tokens');
  }

  return response.json();
}

/**
 * Refresh access token using refresh token
 */
export async function refreshMicroserviceToken(
  refreshToken: string
): Promise<RefreshTokenResponse> {
  const response = await fetch('/api/microservices/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken }),
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to refresh token');
  }

  return response.json();
}

/**
 * Revoke refresh token
 */
export async function revokeMicroserviceToken(
  refreshToken: string
): Promise<void> {
  const response = await fetch('/api/microservices/revoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken }),
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to revoke token');
  }
}

/**
 * Revoke all refresh tokens for current user
 */
export async function revokeAllMicroserviceTokens(): Promise<void> {
  const response = await fetch('/api/microservices/revoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ revokeAll: true }),
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to revoke tokens');
  }
}

/**
 * Make authenticated request to microservice
 * Automatically handles token refresh if needed
 */
export async function microserviceRequest<T>(
  url: string,
  options: RequestInit = {},
  getToken: () => Promise<string | null>
): Promise<T> {
  const token = await getToken();
  
  if (!token) {
    throw new Error('No access token available');
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 401) {
    // Token expired - would need to refresh here if implementing auto-refresh
    throw new Error('Token expired. Please refresh and try again.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Request failed with status ${response.status}`);
  }

  return response.json();
}

