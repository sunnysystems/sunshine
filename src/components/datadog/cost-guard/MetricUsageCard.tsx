'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, formatNumberWithDecimals } from '@/lib/utils';

interface MetricUsageCardProps {
  name: string;
  unit: string;
  usage: number | string; // Can be number or "N/A" for errors
  limit: number;
  threshold?: number | null;
  projected: number | string; // Can be number or "N/A" for errors
  trend: number[]; // Kept for backward compatibility
  dailyValues?: Array<{ date: string; value: number }>; // Daily absolute values from current month
  dailyForecast?: Array<{ date: string; value: number }>; // Daily forecasted values for remaining days
  monthlyDays?: Array<{ date: string; value: number; isForecast: boolean }>; // All days of month with actual/forecast flag
  daysElapsed?: number; // Days elapsed in current month
  daysRemaining?: number; // Days remaining in current month
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
  dailyValues,
  dailyForecast,
  monthlyDays,
  daysElapsed,
  daysRemaining,
  statusBadge,
  actionLabel,
}: MetricUsageCardProps) {
  const [hoveredDay, setHoveredDay] = useState<{ date: string; value: number; isForecast: boolean } | null>(null);
  
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
              {typeof usage === 'string' ? usage : formatNumberWithDecimals(usage) || '0'} / {formatNumberWithDecimals(limit) || '0'}
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
                className="absolute top-0 bottom-0 w-0.5 bg-amber-500/60"
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
            30-day usage & forecast
          </p>
          <div className="relative h-32 overflow-hidden rounded-md bg-muted/50 p-2">
            {(() => {
              // Use monthlyDays if available (preferred), otherwise fallback to dailyValues/dailyForecast or trend
              if (monthlyDays && monthlyDays.length > 0) {
                
                // Calculate max value for scaling
                const maxValue = Math.max(
                  ...monthlyDays.map(d => d.value),
                  limit,
                  threshold || 0,
                  1 // Minimum to avoid division by zero
                );

                const limitHeight = limit > 0 ? (limit / maxValue) * 100 : 0;
                // Sempre calcular threshold: usar o valor fornecido ou 90% do limit como fallback
                const effectiveThreshold = (threshold !== null && threshold !== undefined && threshold > 0) 
                  ? threshold 
                  : (limit > 0 ? limit * 0.9 : 0);
                const thresholdHeight = effectiveThreshold > 0 ? (effectiveThreshold / maxValue) * 100 : 0;

                return (
                  <>
                    {/* Reference lines */}
                    {limit > 0 && (
                      <div
                        className="absolute left-0 right-0 h-0.5 bg-red-500/60 z-10"
                        style={{
                          bottom: `${limitHeight}%`,
                        }}
                        title={`Limit: ${limit.toLocaleString()}`}
                      />
                    )}
                    {effectiveThreshold > 0 && (
                      <div
                        className="absolute left-0 right-0 h-0.5 bg-amber-500/60 z-10"
                        style={{
                          bottom: `${thresholdHeight}%`,
                        }}
                        title={`Threshold: ${effectiveThreshold.toLocaleString()}`}
                      />
                    )}
                    {/* Bars container - all days of month */}
                    <div className="relative flex h-full items-end gap-[1px]">
                      {monthlyDays.map((day) => {
                        const height = (day.value / maxValue) * 100;
                        // Calcular largura para usar melhor o espaço: (100% - gaps) / número de dias
                        // Com gap de 1px entre 31 barras, temos 30 gaps
                        const barWidth = `calc((100% - ${monthlyDays.length - 1}px) / ${monthlyDays.length})`;
                        
                        if (day.isForecast) {
                          // Forecast days: outline tracejado
                          return (
                            <div
                              key={day.date}
                              className="rounded-t-sm z-20 border-2 border-dashed border-blue-500 cursor-pointer"
                              style={{ 
                                width: barWidth,
                                height: `${Math.max(height, 3)}%`,
                                backgroundColor: 'transparent',
                                boxSizing: 'border-box',
                                minHeight: '4px',
                              }}
                              onMouseEnter={() => setHoveredDay(day)}
                              onMouseLeave={() => setHoveredDay(null)}
                            />
                          );
                        } else {
                          // Actual days: barra cheia
                          return (
                            <div
                              key={day.date}
                              className="rounded-t-sm bg-primary/70 z-20 cursor-pointer"
                              style={{ 
                                width: barWidth,
                                height: `${Math.max(height, 2)}%`,
                                minHeight: '4px',
                              }}
                              onMouseEnter={() => setHoveredDay(day)}
                              onMouseLeave={() => setHoveredDay(null)}
                            />
                          );
                        }
                      })}
                    </div>
                  </>
                );
              }

              // Fallback to dailyValues and dailyForecast if available
              if (dailyValues && dailyForecast) {
                // Combine actual and forecast data
                const allDays = [...dailyValues, ...dailyForecast];
                const maxValue = Math.max(
                  ...allDays.map(d => d.value),
                  limit,
                  threshold || 0,
                  1 // Minimum to avoid division by zero
                );

                const limitHeight = limit > 0 ? (limit / maxValue) * 100 : 0;
                // Sempre calcular threshold: usar o valor fornecido ou 90% do limit como fallback
                const effectiveThreshold = (threshold !== null && threshold !== undefined && threshold > 0) 
                  ? threshold 
                  : (limit > 0 ? limit * 0.9 : 0);
                const thresholdHeight = effectiveThreshold > 0 ? (effectiveThreshold / maxValue) * 100 : 0;

                return (
                  <>
                    {/* Reference lines */}
                    {limit > 0 && (
                      <div
                        className="absolute left-0 right-0 h-0.5 bg-red-500/60 z-10"
                        style={{
                          bottom: `${limitHeight}%`,
                        }}
                        title={`Limit: ${limit.toLocaleString()}`}
                      />
                    )}
                    {effectiveThreshold > 0 && (
                      <div
                        className="absolute left-0 right-0 h-0.5 bg-amber-500/60 z-10"
                        style={{
                          bottom: `${thresholdHeight}%`,
                        }}
                        title={`Threshold: ${effectiveThreshold.toLocaleString()}`}
                      />
                    )}
                    {/* Bars container */}
                    <div className="relative flex h-full items-end gap-[1px]">
                      {dailyValues.map((day) => {
                        const height = (day.value / maxValue) * 100;
                        const totalDays = dailyValues.length + dailyForecast.length;
                        const barWidth = totalDays > 0 ? `calc((100% - ${totalDays - 1}px) / ${totalDays})` : 'auto';
                        
                        return (
                          <div
                            key={`actual-${day.date}`}
                            className="rounded-t-sm bg-primary/70 z-20 cursor-pointer"
                            style={{ 
                              width: barWidth,
                              height: `${Math.max(height, 2)}%`,
                              minHeight: '4px',
                            }}
                            onMouseEnter={() => setHoveredDay({ date: day.date, value: day.value, isForecast: false })}
                            onMouseLeave={() => setHoveredDay(null)}
                          />
                        );
                      })}
                      {dailyForecast.map((day) => {
                        const height = (day.value / maxValue) * 100;
                        const totalDays = dailyValues.length + dailyForecast.length;
                        const barWidth = totalDays > 0 ? `calc((100% - ${totalDays - 1}px) / ${totalDays})` : 'auto';
                        
                        return (
                          <div
                            key={`forecast-${day.date}`}
                            className="rounded-t-sm z-20 border-2 border-dashed border-blue-500 cursor-pointer"
                            style={{ 
                              width: barWidth,
                              height: `${Math.max(height, 3)}%`,
                              backgroundColor: 'transparent',
                              boxSizing: 'border-box',
                              minHeight: '4px',
                            }}
                            onMouseEnter={() => setHoveredDay({ date: day.date, value: day.value, isForecast: true })}
                            onMouseLeave={() => setHoveredDay(null)}
                          />
                        );
                      })}
                    </div>
                  </>
                );
              }

              // Fallback to trend (backward compatibility)
              if (trend && trend.length > 0) {
                return (
                  <div className="flex h-full items-end gap-1">
                    {trend.map((value, index) => (
                      <div
                        key={index}
                        className="w-full rounded-t-sm bg-primary/70"
                        style={{ height: `${value}%` }}
                      />
                    ))}
                  </div>
                );
              }

              return (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  No data available
                </div>
              );
            })()}
          </div>
          {/* Tooltip text below chart */}
          {hoveredDay && (
            <div className="text-center text-xs text-muted-foreground">
              {hoveredDay.isForecast 
                ? `${hoveredDay.date} (forecast): ${formatNumberWithDecimals(hoveredDay.value) || hoveredDay.value.toLocaleString()}`
                : `${hoveredDay.date}: ${formatNumberWithDecimals(hoveredDay.value) || hoveredDay.value.toLocaleString()}`
              }
            </div>
          )}
          {!hoveredDay && (
            <div className="text-center text-xs text-muted-foreground opacity-50">
              Hover over a bar to see details
            </div>
          )}
        </div>

        {actionLabel && actionLabel.trim() !== '' && (
          <div className="rounded-md border border-dashed border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
            {actionLabel}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

