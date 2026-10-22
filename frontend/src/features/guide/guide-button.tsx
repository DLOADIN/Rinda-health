import { House, RotateCcw, Sparkles } from 'lucide-react';
import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import type { Assessment } from '@/lib/api';

const GuidePanel = lazy(() => import('@/features/guide/guide-panel'));

// This is where a guide that fails to open stays a small message beside its button, instead of taking the whole
// page to the error screen; the person can go back to their own dashboard or try again.
class GuideBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

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
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const fallback = (
    <div role="alert" className="flex flex-col gap-2 rounded-xl border bg-card p-3 text-sm">
      <p>{t('guidePanel.unavailable')}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            setOpen(false);
            void navigate('/app');
          }}
        >
          <House aria-hidden="true" data-icon="inline-start" />
          {t('guidePanel.backToDashboard')}
        </Button>
        <Button variant="outline" onClick={() => setAttempt((n) => n + 1)}>
          <RotateCcw aria-hidden="true" data-icon="inline-start" />
          {t('guidePanel.tryAgain')}
        </Button>
      </div>
    </div>
  );
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Sparkles aria-hidden="true" data-icon="inline-start" />
        {label ?? t('home.askRinda')}
      </Button>
      {open ? (
        <GuideBoundary key={attempt} fallback={fallback}>
          <Suspense fallback={null}>
            <GuidePanel
              assessment={assessment}
              open={open}
              onOpenChange={setOpen}
              initialChip={chip ?? 'overview'}
            />
          </Suspense>
        </GuideBoundary>
      ) : null}
    </>
  );
}
