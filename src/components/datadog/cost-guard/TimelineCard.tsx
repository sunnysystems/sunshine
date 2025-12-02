'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface TimelineItem {
  id: string;
  title: string;
  caption: string;
  dateLabel: string;
  tone: 'info' | 'warning' | 'critical';
}

interface TimelineCardProps {
  title: string;
  description: string;
  items: TimelineItem[];
}

const toneStyles: Record<TimelineItem['tone'], string> = {
  info: 'border-primary/30 bg-primary/10 text-primary',
  warning: 'border-amber-400/50 bg-amber-400/10 text-amber-600',
  critical: 'border-red-500/50 bg-red-500/10 text-red-600',
};

export function TimelineCard({ title, description, items }: TimelineCardProps) {
  return (
    <Card className="border-border/60 bg-card/95 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item) => (
          <div
            key={item.id}
            className="relative rounded-lg border border-border/60 bg-muted/40 p-4"
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium text-foreground">{item.title}</p>
                <p className="text-sm text-muted-foreground">{item.caption}</p>
              </div>
              <span
                className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-medium ${toneStyles[item.tone]}`}
              >
                {item.dateLabel}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

