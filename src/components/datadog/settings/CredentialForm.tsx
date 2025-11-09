'use client';

import { FormEvent, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useDatadogSuiteAvailability } from '@/hooks/useDatadogSuite';
import { useTranslation } from '@/hooks/useTranslation';
import {
  loadDatadogCredentials,
  persistDatadogCredentials,
  removeDatadogCredentials,
} from '@/lib/datadog/storage';

type Status = 'idle' | 'saving' | 'saved' | 'error';

interface CredentialFormProps {
  tenant: string;
}

export function CredentialForm({ tenant }: CredentialFormProps) {
  const { t } = useTranslation();
  const { refresh } = useDatadogSuiteAvailability(tenant);

  const [apiKey, setApiKey] = useState('');
  const [appKey, setAppKey] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const stored = loadDatadogCredentials(tenant);
    if (stored) {
      setApiKey(stored.apiKey);
      setAppKey(stored.appKey);
      setUpdatedAt(stored.updatedAt);
    }
  }, [tenant]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!apiKey.trim() || !appKey.trim()) {
      setStatus('error');
      return;
    }

    try {
      setStatus('saving');
      const payload = persistDatadogCredentials(
        tenant,
        apiKey.trim(),
        appKey.trim(),
      );
      setUpdatedAt(payload.updatedAt);
      setStatus('saved');
      refresh();
    } catch {
      setStatus('error');
    }
  };

  const onReset = () => {
    removeDatadogCredentials(tenant);
    setApiKey('');
    setAppKey('');
    setUpdatedAt(null);
    setStatus('idle');
    refresh();
  };

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>{t('datadog.apiCredentials.title')}</CardTitle>
        <CardDescription>
          {t('datadog.apiCredentials.subtitle')}
        </CardDescription>
        <p className="text-sm text-muted-foreground">
          {t('datadog.apiCredentials.description')}
        </p>
      </CardHeader>
      <CardContent>
        <form className="space-y-6" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="apiKey">
                {t('datadog.apiCredentials.apiKeyLabel')}
              </Label>
              <Input
                id="apiKey"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={t('datadog.apiCredentials.apiKeyPlaceholder')}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appKey">
                {t('datadog.apiCredentials.appKeyLabel')}
              </Label>
              <Input
                id="appKey"
                value={appKey}
                onChange={(event) => setAppKey(event.target.value)}
                placeholder={t('datadog.apiCredentials.appKeyPlaceholder')}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">
              {t('datadog.apiCredentials.notesLabel')}
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t('datadog.apiCredentials.notesPlaceholder')}
              rows={3}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={status === 'saving'}>
              {status === 'saving'
                ? t('datadog.apiCredentials.saving')
                : t('datadog.apiCredentials.saveCta')}
            </Button>
            <Button type="button" variant="outline" onClick={onReset}>
              {t('datadog.apiCredentials.reset')}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t('datadog.apiCredentials.help')}
            </p>
          </div>

          <div className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
            <p>{t('datadog.apiCredentials.notice')}</p>
            {updatedAt ? (
              <p className="mt-2">
                {t('datadog.apiCredentials.lastUpdated', {
                  timestamp: new Date(updatedAt).toLocaleString(),
                })}
              </p>
            ) : null}
            {status === 'error' ? (
              <p className="mt-2 text-destructive">
                {t('datadog.apiCredentials.error')}
              </p>
            ) : null}
            {status === 'saved' ? (
              <p className="mt-2 text-green-600">
                {t('datadog.apiCredentials.saved')}
              </p>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

