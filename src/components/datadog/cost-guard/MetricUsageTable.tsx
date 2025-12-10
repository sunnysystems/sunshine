'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Status = 'ok' | 'watch' | 'critical';

export interface MetricTableRow {
  metric: string;
  unit: string;
  usage: string;
  limit: string;
  threshold?: string | null;
  projected: string;
  status: {
    type: Status;
    label: string;
  };
  aggregationType: 'MAX' | 'SUM';
}

interface MetricUsageTableProps {
  title: string;
  columns: {
    metric: string;
    unit: string;
    usage: string;
    limit: string;
    threshold: string;
    projected: string;
    status: string;
    aggregationType: string;
  };
  rows: MetricTableRow[];
}

const statusBadgeStyles: Record<Status, string> = {
  ok: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  watch: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  critical: 'bg-red-500/10 text-red-600 border-red-500/20',
};

export function MetricUsageTable({ title, columns, rows }: MetricUsageTableProps) {
  return (
    <Card className="border-border/60 bg-card/95 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-3 pr-3 font-medium">{columns.metric}</th>
              <th className="pb-3 pr-3 font-medium">{columns.unit}</th>
              <th className="pb-3 pr-3 font-medium">{columns.usage}</th>
              <th className="pb-3 pr-3 font-medium">{columns.limit}</th>
              <th className="pb-3 pr-3 font-medium">{columns.threshold}</th>
              <th className="pb-3 pr-3 font-medium">{columns.projected}</th>
              <th className="pb-3 pr-3 font-medium">{columns.status}</th>
              <th className="pb-3 pr-3 font-medium">{columns.aggregationType}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((row, index) => (
              <tr key={`${row.metric}-${index}`} className="group hover:bg-muted/40">
                <td className="py-3 pr-3 font-medium text-foreground">{row.metric}</td>
                <td className="py-3 pr-3 text-muted-foreground">{row.unit}</td>
                <td className="py-3 pr-3 text-foreground">{row.usage}</td>
                <td className="py-3 pr-3 text-muted-foreground">{row.limit}</td>
                <td className="py-3 pr-3 text-muted-foreground">
                  {row.threshold ?? '—'}
                </td>
                <td className="py-3 pr-3 text-muted-foreground">
                  {row.projected}
                </td>
                <td className="py-3 pr-3">
                  <Badge
                    variant="outline"
                    className={cn(
                      'border px-2 py-0.5 text-xs font-medium',
                      statusBadgeStyles[row.status.type],
                    )}
                  >
                    {row.status.label}
                  </Badge>
                </td>
                <td className="py-3 pr-3 text-muted-foreground">
                  <Badge variant="outline" className="border px-2 py-0.5 text-xs font-medium">
                    {row.aggregationType}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

