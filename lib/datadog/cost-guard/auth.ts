/**
 * Authentication and authorization utilities for Cost Guard
 */

import { checkTenantAccess } from '@/lib/tenant';
import { OWNER_ROLES } from './constants';

export interface AuthValidationResult {
  authorized: boolean;
  role: string | null;
}

/**
 * Validate that user is owner or admin
 * Centralized function used across all Cost Guard endpoints
 */
export async function validateOwnerOrAdmin(
  tenant: string,
  userId: string,
): Promise<AuthValidationResult> {
  const { hasAccess, role } = await checkTenantAccess(tenant, userId);
  if (!hasAccess || !OWNER_ROLES.has(role)) {
    return {
      authorized: false,
      role: role || null,
    };
  }
  return { authorized: true, role };
}

