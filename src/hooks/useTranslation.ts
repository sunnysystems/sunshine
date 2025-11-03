'use client';

import { useMemo } from 'react';

import { useSession } from 'next-auth/react';

import { translations, type Language } from '@/lib/translations';

interface UserPreferences {
  language?: Language;
}

interface SessionUser {
  preferences?: UserPreferences;
}

export function useTranslation() {
  const { data: session } = useSession();
  
  // Get user's language preference from session or default to pt-BR
  const language: Language = useMemo(() => {
    if (session?.user && 'preferences' in session.user) {
      const prefs = (session.user as SessionUser).preferences;
      if (prefs?.language === 'pt-BR' || prefs?.language === 'en-US') {
        return prefs.language;
      }
    }
    // Check localStorage as fallback
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('language');
      if (stored === 'pt-BR' || stored === 'en-US') {
        return stored as Language;
      }
    }
    return 'pt-BR';
  }, [session]);

  const t = useMemo(() => {
    const translations_data = translations[language];
    
    return (path: string): string => {
      const keys = path.split('.');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let value: any = translations_data;
      
      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key];
        } else {
          return path; // Return the path if translation not found
        }
      }
      
      return typeof value === 'string' ? value : path;
    };
  }, [language]);

  return { t, language };
}

