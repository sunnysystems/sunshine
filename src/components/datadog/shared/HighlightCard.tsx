'use client';

import { Fragment } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useTranslation } from '@/hooks/useTranslation';

interface HighlightCardProps {
  title: string;
  description?: string;
  highlights?: string[];
  actions?: string[];
  footer?: React.ReactNode;
}

export function HighlightCard({
  title,
  description,
  highlights,
  actions,
  footer,
}: HighlightCardProps) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-semibold">{title}</CardTitle>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6">
        {highlights && highlights.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('datadog.shared.highlightsTitle')}
            </p>
            <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed">
              {highlights.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {actions && actions.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('datadog.shared.actionsTitle')}
            </p>
            <ul className="list-disc space-y-1 pl-4 text-sm leading-relaxed">
              {actions.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {footer ? (
          <Fragment>
            <Separator />
            <div className="text-sm text-muted-foreground">{footer}</div>
          </Fragment>
        ) : null}
      </CardContent>
    </Card>
  );
}

