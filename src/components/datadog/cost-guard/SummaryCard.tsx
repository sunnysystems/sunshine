'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Status = 'ok' | 'watch' | 'critical';

interface SummaryCardProps {
  title: string;
  value: string;
  caption: string;
  status?: {
    type: Status;
    label: string;
  };
}

const statusStyles: Record<Status, string> = {
  ok: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  watch: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  critical: 'bg-red-500/10 text-red-600 border-red-500/20',
};

export function SummaryCard({ title, value, caption, status }: SummaryCardProps) {
  return (
    <Card className="h-full border-border/60 bg-gradient-to-b from-background to-muted/40">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {status ? (
            <Badge
              variant="outline"
              className={cn('border', statusStyles[status.type])}
            >
              {status.label}
            </Badge>
          ) : null}
        </div>
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
        <p className="text-sm text-muted-foreground">{caption}</p>
      </CardContent>
    </Card>
  );
}

