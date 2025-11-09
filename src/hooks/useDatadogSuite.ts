'use client';

import { useEffect, useState } from 'react';

import {
  DATADOG_CREDENTIALS_EVENT,
  DATADOG_CREDENTIALS_STORAGE_KEY,
} from '@/lib/datadog/constants';

type StoredCredentials = {
  apiKey?: string;
  appKey?: string;
  updatedAt?: string;
};

type CredentialMap = Record<string, StoredCredentials>;

const DEFAULT_STATE = {
  hasCredentials: false,
};

function isValidCredentials(
  payload: StoredCredentials | undefined,
): boolean {
  if (!payload) {
    return false;
  }

  const hasApiKey =
    typeof payload.apiKey === 'string' && payload.apiKey.trim().length > 0;
  const hasAppKey =
    typeof payload.appKey === 'string' && payload.appKey.trim().length > 0;

  return hasApiKey && hasAppKey;
}

/**
 * Temporary client-side hook to determine whether Datadog credentials have been
 * configured for the active tenant. This reads from localStorage until
 * persistence is wired to Supabase in a future iteration.
 */
export function useDatadogSuiteAvailability(tenant?: string) {
  const [state, setState] = useState(DEFAULT_STATE);

  useEffect(() => {
    if (typeof window === 'undefined' || !tenant) {
      return;
    }

    const readState = () => {
      try {
        const raw = window.localStorage.getItem(
          DATADOG_CREDENTIALS_STORAGE_KEY,
        );
        if (!raw) {
          setState(DEFAULT_STATE);
          return;
        }

        const parsed = JSON.parse(raw) as
          | StoredCredentials
          | CredentialMap
          | undefined;

        let credentials: StoredCredentials | undefined;

        if (parsed && 'apiKey' in parsed) {
          credentials = parsed as StoredCredentials;
        } else if (parsed && typeof parsed === 'object') {
          credentials = (parsed as CredentialMap)[tenant];
        }

        setState({ hasCredentials: isValidCredentials(credentials) });
      } catch {
        setState(DEFAULT_STATE);
      }
    };

    readState();

    const handler = (event: StorageEvent) => {
      if (event.key === DATADOG_CREDENTIALS_STORAGE_KEY) {
        readState();
      }
    };

    window.addEventListener('storage', handler);
    window.addEventListener(DATADOG_CREDENTIALS_EVENT, readState);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener(DATADOG_CREDENTIALS_EVENT, readState);
    };
  }, [tenant]);

  const refresh = () => {
    if (typeof window === 'undefined' || !tenant) {
      return;
    }

    try {
      const raw = window.localStorage.getItem(
        DATADOG_CREDENTIALS_STORAGE_KEY,
      );
      if (!raw) {
        setState(DEFAULT_STATE);
        return;
      }

      const parsed = JSON.parse(raw) as
        | StoredCredentials
        | CredentialMap
        | undefined;

      let credentials: StoredCredentials | undefined;

      if (parsed && 'apiKey' in parsed) {
        credentials = parsed as StoredCredentials;
      } else if (parsed && typeof parsed === 'object') {
        credentials = (parsed as CredentialMap)[tenant];
      }

      setState({ hasCredentials: isValidCredentials(credentials) });
    } catch {
      setState(DEFAULT_STATE);
    }
  };

  return { ...state, refresh };
}

