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
  title,
  message,
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
    if (!rateLimitError) {
      return;
    }

    // If retryAfter is provided, use it; otherwise default to 30 seconds
    const countdownValue = retryAfter !== null && retryAfter !== undefined ? retryAfter : 30;
    setCountdown(countdownValue);

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
    ? t('datadog.costGuard.api.rateLimit.title')
    : timeoutError
      ? t('datadog.costGuard.api.timeout.title')
      : title || t('datadog.costGuard.errors.loading');

  const displayMessage = rateLimitError
    ? countdown !== null && countdown > 0
      ? t('datadog.costGuard.api.rateLimit.retrying', { seconds: countdown })
      : t('datadog.costGuard.api.rateLimit.waiting')
    : timeoutError
      ? t('datadog.costGuard.api.timeout.message')
      : message || t('datadog.costGuard.errors.loadingMessage');

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

