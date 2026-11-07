import './legal-strings';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { CONTACT_EMAIL, CONTACT_PHONE_SHOWN } from '@/features/landing/contact';

const SECTIONS = [
  'who',
  'collect',
  'notCollect',
  'why',
  'share',
  'phone',
  'safety',
  'rights',
  'keep',
  'security',
  'changes',
] as const;

// This is where the privacy policy is shown, one card per section, in the person's language.
export default function PrivacyPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <Link
        to="/"
        className="min-h-11 content-center self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        {t('legal.privacy.back')}
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t('legal.privacy.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('legal.privacy.version')}</p>
        <p>{t('legal.privacy.intro')}</p>
      </header>
      {SECTIONS.map((key) => {
        const items = t(`legal.privacy.sections.${key}.items`, {
          returnObjects: true,
          email: CONTACT_EMAIL,
          phone: CONTACT_PHONE_SHOWN,
        }) as string[];
        return (
          <section key={key} className="flex flex-col gap-3 rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-semibold">{t(`legal.privacy.sections.${key}.title`)}</h2>
            <ul className="flex list-disc flex-col gap-2 pl-5">
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
