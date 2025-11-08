'use client';

import { useTenant } from '@/components/tenant/TenantProvider';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/hooks/useTranslation';

export default function DashboardPage() {
  const { tenant, role } = useTenant();
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground">
            {t('dashboard.subtitle', { tenant })}
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {t(`roles.${role}`)}
        </Badge>
      </div>
    </div>
  );
}
