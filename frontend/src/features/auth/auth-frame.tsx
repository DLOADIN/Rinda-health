import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function AuthFrame({ heading, children }: { heading: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <section className="flex w-full flex-col items-center py-4 md:py-10">
      <h1 className="mb-2 text-center text-3xl font-medium tracking-tight md:text-4xl">{heading}</h1>
      <p className="mb-8 max-w-md text-center text-muted-foreground">{t('landing.educational')}</p>
      {children}
    </section>
  );
}
