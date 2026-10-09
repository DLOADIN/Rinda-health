// Approved content lookup (C-05). Milestone 0 reads the bundled draft content from @rinda/content; Milestone 2
// swaps this for the published manifest cached by the service worker (FR-04, FR-20, FR-28).
import { BUNDLED_CONTENT } from '@rinda/content';
import { useTranslation } from 'react-i18next';
import type { Language } from '@/lib/i18n';

export function useContent() {
  const { i18n } = useTranslation();
  const lang: Language = i18n.language === 'rw' ? 'rw' : 'en';
  const content = BUNDLED_CONTENT[lang];
  return {
    lang,
    /** Text by content ID. A missing ID shows the ID itself, so gaps are visible in review and never invented. */
    text: (id: string): string => content.text[id] ?? id,
    referrals: content.referrals.entries,
  };
}
