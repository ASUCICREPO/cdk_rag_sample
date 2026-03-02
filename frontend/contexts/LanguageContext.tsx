// SPDX-License-Identifier: MIT
'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

const SUPPORTED_LANGUAGES = ['en', 'es'] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

interface LanguageContextValue {
  language: string;
  setLanguage: (lang: string) => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

/**
 * Detects the browser language and maps it to a supported language.
 * Falls back to "en" if the browser language is not supported.
 */
function detectBrowserLanguage(): SupportedLanguage {
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE;

  const browserLang = navigator.language.split('-')[0].toLowerCase();
  if (SUPPORTED_LANGUAGES.includes(browserLang as SupportedLanguage)) {
    return browserLang as SupportedLanguage;
  }
  return DEFAULT_LANGUAGE;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<string>(DEFAULT_LANGUAGE);

  useEffect(() => {
    setLanguageState(detectBrowserLanguage());
  }, []);

  const setLanguage = (lang: string) => {
    const normalized = lang.split('-')[0].toLowerCase();
    if (SUPPORTED_LANGUAGES.includes(normalized as SupportedLanguage)) {
      setLanguageState(normalized);
    } else {
      setLanguageState(DEFAULT_LANGUAGE);
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
