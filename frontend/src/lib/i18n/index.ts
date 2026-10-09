// i18next for interface strings only (FR-16, NFR-09). Health wording comes from approved content (lib/content).
// Empty Kinyarwanda values fall back to English until the bilingual key informant supplies them; never machine-translate.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en/common.json';
import rw from '@/locales/rw/common.json';

export const LANGUAGES = ['en', 'rw'] as const;
export type Language = (typeof LANGUAGES)[number];

export const resources = { en: { common: en }, rw: { common: rw } } as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  returnEmptyString: false,
  interpolation: { escapeValue: false }, // React escapes
});

/** Keeps <html lang> in step so screen readers and hyphenation behave (DESIGN_SYSTEM.md "Typography"). */
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

export { i18n };
