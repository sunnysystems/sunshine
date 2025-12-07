'use client';

import { FormEvent, useEffect, useState } from 'react';

import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Trash2,
} from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
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
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/hooks/useTranslation';
import {
  DatadogCredentialPayload,
  persistDatadogCredentials,
  removeDatadogCredentials,
} from '@/lib/datadog/storage';

interface DatadogCredentialsFormProps {
  tenant: string;
  credentials: DatadogCredentialPayload | null;
  onCredentialsSaved: (payload: DatadogCredentialPayload) => void;
  onCredentialsRemoved: () => void;
}

type FeedbackState =
  | {
      type: 'success' | 'error' | 'removed';
      message: string;
    }
  | null;

export function DatadogCredentialsForm({
  tenant,
  credentials,
  onCredentialsSaved,
  onCredentialsRemoved,
}: DatadogCredentialsFormProps) {
  const { t, language } = useTranslation();
  const [apiKey, setApiKey] = useState('');
  const [appKey, setAppKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  useEffect(() => {
    setApiKey('');
    setAppKey('');
  }, [tenant, credentials?.updatedAt]);

  function resetFeedback() {
    setFeedback(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();

    const trimmedApiKey = apiKey.trim();
    const trimmedAppKey = appKey.trim();

    if (!trimmedApiKey || !trimmedAppKey) {
      setFeedback({
        type: 'error',
        message: t('datadog.credentials.error'),
      });
      return;
    }

    setIsSaving(true);
    try {
      const payload = await persistDatadogCredentials(
        tenant,
        trimmedApiKey,
        trimmedAppKey,
      );
      setFeedback({
        type: 'success',
        message: t('datadog.credentials.success'),
      });
      setApiKey('');
      setAppKey('');
      onCredentialsSaved(payload);
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : t('common.error'),
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove() {
    setIsRemoving(true);
    try {
      await removeDatadogCredentials(tenant);
      setFeedback({
        type: 'removed',
        message: t('datadog.credentials.removed'),
      });
      onCredentialsRemoved();
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : t('common.error'),
      });
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
            <KeyRound className="h-4 w-4" />
            <span>{t('datadog.credentials.title')}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('datadog.credentials.subtitle')}
          </p>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('datadog.credentials.alertTitle')}</AlertTitle>
          <AlertDescription>
            {t('datadog.credentials.alertBody')}
          </AlertDescription>
        </Alert>

        {feedback ? (
          <Alert
            variant={feedback.type === 'error' ? 'destructive' : 'default'}
          >
            {feedback.type === 'error' ? (
              <AlertCircle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <AlertTitle>
              {feedback.type === 'error'
                ? t('common.error')
                : t('common.success')}
            </AlertTitle>
            <AlertDescription>{feedback.message}</AlertDescription>
          </Alert>
        ) : null}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="datadog-api-key">
              {t('datadog.credentials.apiKeyLabel')}
            </Label>
            <Input
              id="datadog-api-key"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={t('datadog.credentials.apiKeyPlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="datadog-app-key">
              {t('datadog.credentials.appKeyLabel')}
            </Label>
            <Input
              id="datadog-app-key"
              autoComplete="off"
              value={appKey}
              onChange={(event) => setAppKey(event.target.value)}
              placeholder={t('datadog.credentials.appKeyPlaceholder')}
            />
          </div>

          {credentials ? (
            <p className="text-xs text-muted-foreground">
              {t('datadog.credentials.existingSecretNote')}
            </p>
          ) : null}

          {isSaving && (
            <Alert>
              <AlertCircle className="h-4 w-4 animate-pulse" />
              <AlertTitle>{t('datadog.credentials.validatingTitle')}</AlertTitle>
              <AlertDescription>
                {t('datadog.credentials.validatingMessage')}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="submit" disabled={isSaving}>
              {isSaving
                ? t('datadog.credentials.saving')
                : t('datadog.credentials.saveButton')}
            </Button>

            {credentials ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={isRemoving}
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
                    <AlertDialogAction onClick={handleRemove}>
                      {t('datadog.credentials.removeConfirm') === 'datadog.credentials.removeConfirm'
                        ? (language === 'pt-BR' ? 'Sim, remover credenciais' : 'Yes, remove credentials')
                        : t('datadog.credentials.removeConfirm')}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

