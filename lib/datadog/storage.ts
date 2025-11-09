import {
  DATADOG_CREDENTIALS_EVENT,
  DATADOG_CREDENTIALS_STORAGE_KEY,
} from './constants';

export interface DatadogCredentialPayload {
  apiKey: string;
  appKey: string;
  updatedAt: string;
}

type CredentialStore = Record<string, DatadogCredentialPayload>;

function readStore(): CredentialStore {
  if (typeof window === 'undefined') {
    return {};
  }

  const raw = window.localStorage.getItem(DATADOG_CREDENTIALS_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as
      | CredentialStore
      | DatadogCredentialPayload
      | undefined;

    if (!parsed) {
      return {};
    }

    if ('apiKey' in parsed) {
      return { default: parsed as DatadogCredentialPayload };
    }

    if (typeof parsed === 'object') {
      return parsed as CredentialStore;
    }
  } catch {
    return {};
  }

  return {};
}

function writeStore(store: CredentialStore) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    DATADOG_CREDENTIALS_STORAGE_KEY,
    JSON.stringify(store),
  );
}

export function loadDatadogCredentials(
  tenant: string,
): DatadogCredentialPayload | null {
  const store = readStore();
  const credentials =
    store[tenant] ?? (tenant === 'default' ? null : store.default);
  return credentials ?? null;
}

export function persistDatadogCredentials(
  tenant: string,
  apiKey: string,
  appKey: string,
): DatadogCredentialPayload {
  const store = readStore();
  const payload: DatadogCredentialPayload = {
    apiKey,
    appKey,
    updatedAt: new Date().toISOString(),
  };

  const nextStore = {
    ...store,
    [tenant]: payload,
  };

  writeStore(nextStore);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(DATADOG_CREDENTIALS_EVENT));
  }

  return payload;
}

export function removeDatadogCredentials(tenant: string) {
  const store = readStore();
  if (!(tenant in store)) {
    return;
  }

  const nextStore = { ...store };
  delete nextStore[tenant];
  writeStore(nextStore);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(DATADOG_CREDENTIALS_EVENT));
  }
}


