import { BUNDLED_CONTENT } from '@rinda/content';
import { useTranslation } from 'react-i18next';
import type { Language } from '@/lib/i18n';

export function useContent() {
  const { i18n } = useTranslation();
  const lang: Language = i18n.language === 'rw' ? 'rw' : 'en';
  const content = BUNDLED_CONTENT[lang];
  return {
    lang,
    text: (id: string): string => content.text[id] ?? id,
    referrals: content.referrals.entries,
  };
}
