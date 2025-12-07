'use client';

import { FormEvent, useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { AlertCircle, Trash2 } from 'lucide-react';
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
  const { t, language } = useTranslation();
  const { refresh } = useDatadogSuiteAvailability(tenant);

  const [apiKey, setApiKey] = useState('');
  const [appKey, setAppKey] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [notes, setNotes] = useState('');
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadStored() {
      try {
        const stored = await loadDatadogCredentials(tenant);
        if (!cancelled && stored) {
          setApiKey(stored.apiKey);
          setAppKey(stored.appKey);
          setUpdatedAt(stored.updatedAt);
        }
      } catch {
        // If credentials don't exist or user doesn't have access, leave empty
        if (!cancelled) {
          setApiKey('');
          setAppKey('');
          setUpdatedAt(null);
        }
      }
    }

    loadStored();

    return () => {
      cancelled = true;
    };
  }, [tenant]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!apiKey.trim() || !appKey.trim()) {
      setStatus('error');
      return;
    }

    try {
      setStatus('saving');
      const payload = await persistDatadogCredentials(
        tenant,
        apiKey.trim(),
        appKey.trim(),
      );
      setUpdatedAt(payload.updatedAt);
      setStatus('saved');
      refresh();
    } catch (error) {
      setStatus('error');
      // eslint-disable-next-line no-console
      console.error('Failed to save credentials:', error);
    }
  };

  const onReset = () => {
    // Clear form fields only (doesn't remove from server)
    setApiKey('');
    setAppKey('');
    setNotes('');
    setStatus('idle');
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await removeDatadogCredentials(tenant);
      setApiKey('');
      setAppKey('');
      setNotes('');
      setUpdatedAt(null);
      setStatus('idle');
      refresh();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to remove credentials:', error);
      setStatus('error');
    } finally {
      setIsRemoving(false);
    }
  };

  // Check if credentials are saved (have updatedAt timestamp)
  const hasCredentials = updatedAt !== null;

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

          {status === 'saving' && (
            <Alert>
              <AlertCircle className="h-4 w-4 animate-pulse" />
              <AlertTitle>{t('datadog.credentials.validatingTitle')}</AlertTitle>
              <AlertDescription>
                {t('datadog.credentials.validatingMessage')}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={status === 'saving' || isRemoving}>
              {status === 'saving'
                ? t('datadog.apiCredentials.saving')
                : t('datadog.apiCredentials.saveCta')}
            </Button>
            
            {hasCredentials && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={isRemoving || status === 'saving'}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('datadog.credentials.removeButton') === 'datadog.credentials.removeButton' 
                      ? (language === 'pt-BR' ? 'Remover credenciais' : 'Remove credentials')
                      : t('datadog.credentials.removeButton')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {t('datadog.credentials.removeDialogTitle') === 'datadog.credentials.removeDialogTitle'
                        ? (language === 'pt-BR' ? 'Remover credenciais armazenadas?' : 'Remove stored credentials?')
                        : t('datadog.credentials.removeDialogTitle')}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('datadog.credentials.removeDialogDescription') === 'datadog.credentials.removeDialogDescription'
                        ? (language === 'pt-BR' 
                          ? 'Isso remove as chaves Datadog do Supabase Vault para esta organização.'
                          : 'This removes the Datadog API and application keys from Supabase Vault for this organization.')
                        : t('datadog.credentials.removeDialogDescription')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>
                      {t('common.cancel') === 'common.cancel'
                        ? (language === 'pt-BR' ? 'Cancelar' : 'Cancel')
                        : t('common.cancel')}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRemove}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {t('datadog.credentials.removeConfirm') === 'datadog.credentials.removeConfirm'
                        ? (language === 'pt-BR' ? 'Sim, remover credenciais' : 'Yes, remove credentials')
                        : t('datadog.credentials.removeConfirm')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={onReset}
              disabled={status === 'saving' || isRemoving}
            >
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

