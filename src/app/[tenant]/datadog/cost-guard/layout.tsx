'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { DatadogCredentialGate } from '@/components/datadog/DatadogCredentialGate';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/useTranslation';
import { cn } from '@/lib/utils';

interface CostGuardLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  {
    href: 'contract',
    label: 'datadog.navigation.costGuardContract',
  },
  {
    href: 'metrics',
    label: 'datadog.navigation.costGuardMetrics',
  },
  {
    href: 'actions',
    label: 'datadog.navigation.costGuardActions',
  },
];

export default function CostGuardLayout({ children }: CostGuardLayoutProps) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const segments = pathname?.split('/') ?? [];
  const costGuardIndex = segments.findIndex((segment) => segment === 'cost-guard');
  const basePath =
    costGuardIndex >= 0
      ? segments.slice(0, costGuardIndex + 1).join('/')
      : pathname ?? '';

  return (
    <DatadogCredentialGate>
      <div className="flex flex-col gap-8">
        <nav className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/95 p-4">
          {navItems.map((item) => {
            const href = `${basePath}/${item.href}`;
            const isActive =
              pathname === href ||
              pathname?.endsWith(`/${item.href}`) ||
              pathname?.includes(`/cost-guard/${item.href}`);
            return (
              <Button
                key={item.href}
                asChild
                variant={isActive ? 'secondary' : 'ghost'}
                className={cn(
                  'text-sm font-medium',
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Link href={href}>{t(item.label)}</Link>
              </Button>
            );
          })}
        </nav>
        {children}
      </div>
    </DatadogCredentialGate>
  );
}

