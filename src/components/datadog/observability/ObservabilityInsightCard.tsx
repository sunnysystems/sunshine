import type { ReactNode } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ObservabilityInsightCardProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
}

export function ObservabilityInsightCard({
  title,
  description,
  icon,
  children,
}: ObservabilityInsightCardProps) {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center gap-3">
        {icon ? <div className="text-primary">{icon}</div> : null}
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
        {children}
      </CardContent>
    </Card>
  );
}

