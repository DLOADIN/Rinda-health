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
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

export { i18n };
