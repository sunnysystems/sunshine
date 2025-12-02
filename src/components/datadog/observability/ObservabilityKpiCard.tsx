import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ObservabilityKpiCardProps {
  label: string;
  value: string;
  deltaLabel?: string;
  deltaValue?: string;
  trend?: 'up' | 'down';
  description?: string;
}

export function ObservabilityKpiCard({
  label,
  value,
  deltaLabel,
  deltaValue,
  trend = 'up',
  description,
}: ObservabilityKpiCardProps) {
  const TrendIcon = trend === 'down' ? ArrowDownRight : ArrowUpRight;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
        {deltaLabel && deltaValue ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 font-medium">
              <TrendIcon
                className={`h-4 w-4 ${
                  trend === 'down' ? 'text-rose-500' : 'text-emerald-500'
                }`}
              />
              {deltaValue}
            </span>
            <span className="text-muted-foreground">{deltaLabel}</span>
          </div>
        ) : null}
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

