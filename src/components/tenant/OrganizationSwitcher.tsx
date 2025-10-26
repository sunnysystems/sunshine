'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ChevronDown, Building2, Plus } from 'lucide-react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface OrganizationSwitcherProps {
  currentOrganization?: {
    id: string;
    name: string;
    slug: string;
    role: string;
  };
}

export function OrganizationSwitcher({ currentOrganization }: OrganizationSwitcherProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const organizations = (session?.user as any)?.organizations || [];

  const handleOrganizationChange = (orgSlug: string) => {
    // Extract the current path without the organization prefix
    const pathWithoutOrg = pathname.replace(/^\/[^\/]+/, '');
    const newPath = `/${orgSlug}${pathWithoutOrg}`;
    router.push(newPath);
    setIsOpen(false);
  };

  const handleCreateOrganization = () => {
    router.push('/setup');
    setIsOpen(false);
  };

  if (!currentOrganization || organizations.length === 0) {
    return null;
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex items-center gap-2 px-3 py-2 h-auto"
        >
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-xs">
              <Building2 className="h-3 w-3" />
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col items-start">
            <span className="text-sm font-medium">{currentOrganization.name}</span>
            <span className="text-xs text-muted-foreground capitalize">
              {currentOrganization.role}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 ml-auto" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <div className="px-2 py-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Organizations
          </p>
        </div>
        <DropdownMenuSeparator />
        
        {organizations.map((org: any) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => handleOrganizationChange(org.slug)}
            className="flex items-center gap-3 px-3 py-2"
          >
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs">
                <Building2 className="h-3 w-3" />
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-start">
              <span className="text-sm font-medium">{org.name}</span>
              <span className="text-xs text-muted-foreground capitalize">
                {org.role}
              </span>
            </div>
            {org.slug === currentOrganization.slug && (
              <div className="ml-auto h-2 w-2 rounded-full bg-primary" />
            )}
          </DropdownMenuItem>
        ))}
        
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleCreateOrganization}
          className="flex items-center gap-3 px-3 py-2"
        >
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-xs">
              <Plus className="h-3 w-3" />
            </AvatarFallback>
          </Avatar>
          <span className="text-sm">Create organization</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
