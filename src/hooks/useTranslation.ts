'use client';

import { useSession } from 'next-auth/react';
import { useMemo } from 'react';

import { translations, type Language } from '@/lib/translations';

export function useTranslation() {
  const { data: session } = useSession();
  
  // Get user's language preference from session or default to pt-BR
  const language: Language = useMemo(() => {
    if (session?.user && 'preferences' in session.user) {
      const prefs = (session.user as any).preferences;
      if (prefs?.language === 'pt-BR' || prefs?.language === 'en-US') {
        return prefs.language;
      }
    }
    // Check localStorage as fallback
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('language');
      if (stored === 'pt-BR' || stored === 'en-US') {
        return stored;
      }
    }
    return 'pt-BR';
  }, [session]);

  const t = useMemo(() => {
    const translations_data = translations[language];
    
    return (path: string): string => {
      const keys = path.split('.');
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

