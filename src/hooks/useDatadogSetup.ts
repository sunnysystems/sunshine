'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'sunshine:datadogCredentialsConfigured';
const CREDENTIAL_EVENT = 'sunshine:datadog-credentials-updated';

function readCredentialsState(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch (error) {
    console.error('Failed to read Datadog credentials state from storage', error);
    return false;
  }
}

export function useDatadogSetup() {
  const [hasCredentials, setHasCredentials] = useState<boolean>(() => {
    return typeof window === 'undefined' ? false : readCredentialsState();
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const syncState = () => {
      setHasCredentials(readCredentialsState());
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        syncState();
      }
    };

    const handleCustomEvent = () => {
      syncState();
    };

    syncState();

    window.addEventListener('storage', handleStorage);
    window.addEventListener(CREDENTIAL_EVENT, handleCustomEvent as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(
        CREDENTIAL_EVENT,
        handleCustomEvent as EventListener,
      );
    };
  }, []);

  const markCredentialsConfigured = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, 'true');
    window.dispatchEvent(new Event(CREDENTIAL_EVENT));
    setHasCredentials(true);
  }, []);

  const clearCredentialsConfigured = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, 'false');
    window.dispatchEvent(new Event(CREDENTIAL_EVENT));
    setHasCredentials(false);
  }, []);

  return {
    hasCredentials,
    markCredentialsConfigured,
    clearCredentialsConfigured,
    storageKey: STORAGE_KEY,
    eventName: CREDENTIAL_EVENT,
  };
}


