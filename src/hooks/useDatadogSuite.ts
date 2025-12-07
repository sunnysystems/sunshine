'use client';

import { useCallback, useEffect, useState } from 'react';

import { DATADOG_CREDENTIALS_EVENT } from '@/lib/datadog/constants';
import { loadDatadogCredentials } from '@/lib/datadog/storage';

const DEFAULT_STATE = {
  hasCredentials: false,
};

/**
 * Hook to determine whether Datadog credentials have been configured
 * for the active tenant. Fetches from API instead of localStorage.
 */
export function useDatadogSuiteAvailability(tenant?: string) {
  const [state, setState] = useState(DEFAULT_STATE);
  const [isLoading, setIsLoading] = useState(false);

  const checkCredentials = useCallback(async () => {
    if (typeof window === 'undefined' || !tenant) {
      setState(DEFAULT_STATE);
      return;
    }

    setIsLoading(true);
    try {
      const credentials = await loadDatadogCredentials(tenant);
      setState({
        hasCredentials: !!(credentials?.apiKey && credentials?.appKey),
      });
    } catch (error) {
      // If 403 or 404, credentials don't exist or user doesn't have access
      if (
        error instanceof Error &&
        (error.message.includes('permission') ||
          error.message.includes('not found') ||
          error.message.includes('404'))
      ) {
        setState(DEFAULT_STATE);
      } else {
        // For other errors, assume no credentials (fail-safe)
        setState(DEFAULT_STATE);
      }
    } finally {
      setIsLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    checkCredentials();

    // Listen for credential update events
    const handler = () => {
      checkCredentials();
    };

    window.addEventListener(DATADOG_CREDENTIALS_EVENT, handler);
    return () => {
      window.removeEventListener(DATADOG_CREDENTIALS_EVENT, handler);
    };
  }, [checkCredentials]);

  const refresh = useCallback(() => {
    checkCredentials();
  }, [checkCredentials]);

  return { ...state, refresh, isLoading };
}

