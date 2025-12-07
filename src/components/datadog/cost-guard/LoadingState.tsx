'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function SummaryCardsLoading() {
  return (
    <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i} className="h-full border-border/60">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-4 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function MetricsLoading() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="h-full border-border/60">
          <CardContent className="space-y-5 p-6">
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-4 w-20" />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-3 w-full" />
            </div>
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ContractCardLoading() {
  return (
    <Card className="border-border/60 bg-card/95 shadow-sm">
      <CardContent className="space-y-4 p-6">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border/60 bg-muted/40 p-4">
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-5 w-32 mb-1" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

