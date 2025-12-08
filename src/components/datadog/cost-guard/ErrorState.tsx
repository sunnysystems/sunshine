'use client';

import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  rateLimitError?: boolean;
  timeoutError?: boolean;
  retryAfter?: number; // seconds
}

export function ErrorState({
  title = 'Error loading data',
  message = 'Failed to load Cost Guard data. Please try again.',
  onRetry,
  rateLimitError = false,
  timeoutError = false,
  retryAfter,
}: ErrorStateProps) {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState<number | null>(
    retryAfter || null,
  );

  useEffect(() => {
    if (!rateLimitError || !retryAfter) {
      return;
    }

    setCountdown(retryAfter);

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [rateLimitError, retryAfter]);

  // Auto-retry when countdown reaches 0
  useEffect(() => {
    if (rateLimitError && countdown === 0 && onRetry) {
      onRetry();
    }
  }, [rateLimitError, countdown, onRetry]);

  const displayTitle = rateLimitError
    ? t('datadog.api.rateLimit.title') || 'Rate Limit Exceeded'
    : timeoutError
      ? 'Request Timeout'
      : title;

  const displayMessage = rateLimitError
    ? countdown !== null && countdown > 0
      ? t('datadog.api.rateLimit.retrying', { seconds: countdown }) ||
        `Retrying automatically in ${countdown} seconds...`
      : t('datadog.api.rateLimit.waiting') ||
        'Waiting for rate limit to reset. Please wait...'
    : timeoutError
      ? 'The request took too long to complete. This may happen when fetching data for many services. Please try again.'
      : message;

  return (
    <Alert
      variant={rateLimitError ? 'default' : 'destructive'}
      className={rateLimitError ? 'border-yellow-500' : 'border-destructive'}
    >
      {rateLimitError ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <AlertCircle className="h-4 w-4" />
      )}
      <AlertTitle>{displayTitle}</AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>{displayMessage}</span>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={rateLimitError && countdown !== null && countdown > 0}
            className="ml-4"
          >
            {rateLimitError && countdown !== null && countdown > 0 ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {countdown}s
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </>
            )}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}

