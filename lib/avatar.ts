import { getGravatarUrl } from './gravatar';

/**
 * Get user avatar URL with fallback priority:
 * 1. Custom avatar_url from database (Supabase Storage)
 * 2. Gravatar URL (if email is registered)
 * 3. null (fallback to initials)
 * 
 * @param avatarUrl - Custom avatar URL from database
 * @param email - User's email for Gravatar fallback
 * @param size - Size of avatar (for Gravatar)
 * @returns Avatar URL or null
 */
export function getUserAvatarUrl(
  avatarUrl: string | null | undefined,
  email: string,
  size: number = 200
): string | null {
  // Priority 1: Custom avatar from Supabase Storage
  if (avatarUrl) {
    return avatarUrl;
  }

  // Priority 2: Gravatar
  if (email) {
    return getGravatarUrl(email, size, 'mp'); // 'mp' = mystery person default, always returns image
  }

  // Priority 3: null (component should show initials)
  return null;
}

/**
 * Get user avatar URL with 404 check for Gravatar
 * Only returns Gravatar URL if it exists
 */
export async function getUserAvatarUrlWithGravatarCheck(
  avatarUrl: string | null | undefined,
  email: string,
  size: number = 200
): Promise<string | null> {
  // Priority 1: Custom avatar from Supabase Storage
  if (avatarUrl) {
    return avatarUrl;
  }

  // Priority 2: Gravatar (only if exists)
  if (email) {
    const gravatarUrl = getGravatarUrl(email, size, '404');
    try {
      const response = await fetch(gravatarUrl, { method: 'HEAD' });
      if (response.status !== 404) {
        return gravatarUrl;
      }
    } catch {
      // If check fails, return Gravatar anyway (optimistic)
      return getGravatarUrl(email, size, 'mp');
    }
  }

  // Priority 3: null (component should show initials)
  return null;
}

