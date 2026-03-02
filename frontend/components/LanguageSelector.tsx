// SPDX-License-Identifier: MIT
'use client';

import { useLanguage } from '../contexts/LanguageContext';

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
] as const;

/**
 * Compact language selector dropdown for switching between English and Spanish.
 * Reads and updates language via LanguageContext.
 */
export default function LanguageSelector() {
  const { language, setLanguage } = useLanguage();

  return (
    <select
      aria-label="Select language"
      value={language}
      onChange={(e) => setLanguage(e.target.value)}
      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      {LANGUAGE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
