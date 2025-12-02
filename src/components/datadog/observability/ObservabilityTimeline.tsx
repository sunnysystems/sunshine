import type { ReactNode } from 'react';

interface TimelineItem {
  id: string;
  title: string;
  description?: string;
  timestamp?: string;
  icon?: ReactNode;
  accentColorClass?: string;
}

interface ObservabilityTimelineProps {
  items: TimelineItem[];
}

export function ObservabilityTimeline({ items }: ObservabilityTimelineProps) {
  return (
    <ol className="relative space-y-6 border-l border-border pl-6">
      {items.map((item) => (
        <li key={item.id} className="space-y-1">
          <span
            className={`absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background ${item.accentColorClass ?? ''}`}
          >
            {item.icon ?? null}
          </span>
          <p className="text-sm font-semibold">{item.title}</p>
          {item.timestamp ? (
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {item.timestamp}
            </p>
          ) : null}
          {item.description ? (
            <p className="text-sm text-muted-foreground">
              {item.description}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

