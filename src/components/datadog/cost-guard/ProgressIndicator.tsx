'use client';

import { Progress } from '@/components/ui/progress';
import { useTranslation } from '@/hooks/useTranslation';

interface ProgressIndicatorProps {
  progress: number;
  total: number;
  completed: number;
  current?: string;
}

export function ProgressIndicator({
  progress,
  total,
  completed,
  current,
}: ProgressIndicatorProps) {
  const { t } = useTranslation();

  if (total === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {current
            ? t('datadog.costGuard.progress.loading', { current })
            : t('datadog.costGuard.progress.loadingCount', { completed, total })}
        </span>
        <span className="font-medium">{progress}%</span>
      </div>
      <Progress value={progress} className="h-2" />
    </div>
  );
}

