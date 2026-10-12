// English ships with the app; the Kinyarwanda text loads the first time someone switches to it (it is still saved
// for offline use), which keeps the first download small.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en/common.json';

export const LANGUAGES = ['en', 'rw'] as const;
export type Language = (typeof LANGUAGES)[number];

void i18n.use(initReactI18next).init({
  resources: { en: { common: en } },
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  returnEmptyString: false,
  interpolation: { escapeValue: false },
  react: { bindI18nStore: 'added' },
});

let rwLoading: Promise<void> | null = null;
export function loadKinyarwanda(): Promise<void> {
  rwLoading ??= import('@/locales/rw/common.json').then((m) => {
    i18n.addResourceBundle('rw', 'common', m.default, true, true);
  });
  return rwLoading;
}

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  if (lng === 'rw') void loadKinyarwanda();
});

export { i18n };
