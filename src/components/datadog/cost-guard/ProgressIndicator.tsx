'use client';

import { Progress } from '@/components/ui/progress';

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
  if (total === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {current
            ? `Carregando: ${current}`
            : `Carregando ${completed} de ${total} serviços...`}
        </span>
        <span className="font-medium">{progress}%</span>
      </div>
      <Progress value={progress} className="h-2" />
    </div>
  );
}

