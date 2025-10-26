'use client';

import { usePathname } from 'next/navigation';
import { Navbar } from '@/components/blocks/navbar';

export function ConditionalNavbar() {
  const pathname = usePathname();
  
  // Don't show navbar on tenant pages (logged in pages)
  const isTenantPage = pathname.startsWith('/') && pathname.split('/').length > 1 && !pathname.startsWith('/auth') && !pathname.startsWith('/api') && !pathname.startsWith('/accept-invite') && !pathname.startsWith('/setup');
  
  // Don't show navbar on auth pages, API routes, or setup pages
  const isPublicPage = !pathname.startsWith('/auth') && 
                      !pathname.startsWith('/api') && 
                      !pathname.startsWith('/accept-invite') && 
                      !pathname.startsWith('/setup') &&
                      !isTenantPage;
  
  if (!isPublicPage) {
    return null;
  }
  
  return <Navbar />;
}
