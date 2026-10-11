import { Sparkles } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { Assessment } from '@/lib/api';

const GuidePanel = lazy(() => import('@/features/guide/guide-panel'));

export function GuideButton({
  assessment,
  chip,
  label,
  variant = 'outline',
}: {
  assessment: Assessment | null;
  chip?: string;
  label?: string;
  variant?: 'outline' | 'secondary' | 'default';
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Sparkles aria-hidden="true" data-icon="inline-start" />
        {label ?? t('home.askRinda')}
      </Button>
      {open ? (
        <Suspense fallback={null}>
          <GuidePanel
            assessment={assessment}
            open={open}
            onOpenChange={setOpen}
            initialChip={chip ?? 'overview'}
          />
        </Suspense>
      ) : null}
    </>
  );
}
