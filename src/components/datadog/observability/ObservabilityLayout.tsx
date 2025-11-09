import type { ReactNode } from 'react';

interface ObservabilityLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function ObservabilityLayout({
  title,
  subtitle,
  children,
}: ObservabilityLayoutProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="max-w-2xl text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

