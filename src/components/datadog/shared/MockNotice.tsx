'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useTranslation } from '@/hooks/useTranslation';

export function MockNotice() {
  const { t } = useTranslation();

  return (
    <Alert variant="warning" className="border-dashed">
      <AlertTitle>{t('datadog.shared.mockTitle')}</AlertTitle>
      <AlertDescription>
        {t('datadog.shared.mockNotice')}
      </AlertDescription>
    </Alert>
  );
}

