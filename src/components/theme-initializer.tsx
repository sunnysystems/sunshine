'use client';

import { useEffect, useState } from 'react';

import { useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';

/**
 * Component that initializes theme from user preferences in database
 * This ensures theme preference persists across sessions and browsers
 */
export function ThemeInitializer() {
  const { data: session, status } = useSession();
  const { setTheme } = useTheme();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Only initialize once when session is ready
    if (status === 'loading' || isInitialized) return;

    // If user is logged in, try to get theme from session
    if (session?.user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userPrefs = session.user as any;
      
      // Priority: themePreference > preferences.theme
      const savedTheme = userPrefs?.themePreference || userPrefs?.preferences?.theme;
      
      if (savedTheme) {
        console.log('[ThemeInitializer] Initializing theme from user preference:', savedTheme);
        setTheme(savedTheme);
        setIsInitialized(true);
      } else {
        setIsInitialized(true);
      }
    } else {
      // No user session, mark as initialized
      setIsInitialized(true);
    }
  }, [session, status, setTheme, isInitialized]);

  return null;
}

