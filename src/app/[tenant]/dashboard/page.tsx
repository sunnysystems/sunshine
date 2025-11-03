'use client';

import { useTenant } from '@/components/tenant/TenantProvider';
import { Badge } from '@/components/ui/badge';

export default function DashboardPage() {
  const { tenant, role } = useTenant();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome to your {tenant} organization dashboard
          </p>
        </div>
        <Badge variant="secondary" className="text-sm">
          {role}
        </Badge>
      </div>
    </div>
  );
}
