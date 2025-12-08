'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MetricUsageCardProps {
  name: string;
  unit: string;
  usage: number | string; // Can be number or "N/A" for errors
  limit: number;
  threshold?: number | null;
  projected: number | string; // Can be number or "N/A" for errors
  trend: number[];
  statusBadge: React.ReactNode;
  actionLabel: string;
}

const statusBarColors = {
  base: 'bg-primary/15',
  fill: 'bg-primary',
  threshold: 'border border-dashed border-primary/60',
};

export function MetricUsageCard({
  name,
  unit,
  usage,
  limit,
  threshold,
  projected,
  trend,
  statusBadge,
  actionLabel,
}: MetricUsageCardProps) {
  const hasError = typeof usage === 'string' || typeof projected === 'string';
  const usageValue = typeof usage === 'string' ? 0 : usage;
  const projectedValue = typeof projected === 'string' ? 0 : projected;
  
  const usagePct = hasError ? 0 : Math.min((usageValue / limit) * 100, 120);
  const projectedPct = hasError ? 0 : Math.min((projectedValue / limit) * 100, 120);
  const thresholdPct =
    threshold && limit > 0 ? Math.min((threshold / limit) * 100, 120) : null;

  return (
    <Card className="h-full border-border/60 bg-card/95 shadow-sm">
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base font-semibold leading-tight">
            {name}
          </CardTitle>
          {statusBadge}
        </div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {unit}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Usage</span>
            <span className="font-medium">
              {typeof usage === 'string' ? usage : usage.toLocaleString()} / {limit.toLocaleString()}
            </span>
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
            {!hasError && (
              <>
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 rounded-full',
                    statusBarColors.fill,
                  )}
                  style={{ width: `${usagePct}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary/30"
                  style={{ width: `${projectedPct}%`, opacity: 0.4 }}
                />
              </>
            )}
            {hasError && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                N/A
              </div>
            )}
            {thresholdPct ? (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-destructive/70"
                style={{ left: `${thresholdPct}%` }}
              />
            ) : null}
            <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-border/50" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Projected {typeof projected === 'string' ? projected : projected.toLocaleString()}</span>
            {threshold ? (
              <span>Threshold {threshold.toLocaleString()}</span>
            ) : (
              <span>No threshold</span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            7-day trend
          </p>
          <div className="flex h-16 items-end gap-1 overflow-hidden rounded-md bg-muted/50 p-2">
            {trend.map((value, index) => (
              <div
                key={index}
                className="w-full rounded-t-sm bg-primary/70"
                style={{ height: `${value}%` }}
              />
            ))}
          </div>
        </div>

        <div className="rounded-md border border-dashed border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
          {actionLabel}
        </div>
      </CardContent>
    </Card>
  );
}

