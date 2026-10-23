import { CircleCheck, CircleAlert, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

const claims = new Map<string, Promise<{ deviceToken: string; language: 'en' | 'rw' } | null>>();
function claim(code: string) {
  let pending = claims.get(code);
  if (!pending) {
    pending = fetch('/api/v1/devices/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ deviceToken: string; language: 'en' | 'rw' }>) : null))
      .catch(() => null);
    claims.set(code, pending);
  }
  return pending;
}

export function SetupPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { code = '' } = useParams();
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');

  useEffect(() => {
    let active = true;
    void claim(code).then(async (result) => {
      if (!result) {
        if (active) setState('failed');
        return;
      }
      const { rememberStudyDevice } = await import('@/lib/study-device');
      await rememberStudyDevice(result.deviceToken);
      void i18n.changeLanguage(result.language);
      if (!active) return;
      setState('done');
      window.setTimeout(() => void navigate('/login', { replace: true }), 1500);
    });
    return () => {
      active = false;
    };
  }, [code, i18n, navigate]);

  return (
    <section className="flex flex-1 items-center justify-center px-4 py-16">
      <Card className="glass-strong w-full max-w-md text-center">
        <CardHeader className="items-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-blush-soft text-brand-ember-strong">
            {state === 'working' ? (
              <Smartphone aria-hidden="true" className="size-7" />
            ) : state === 'done' ? (
              <CircleCheck aria-hidden="true" className="size-7" />
            ) : (
              <CircleAlert aria-hidden="true" className="size-7" />
            )}
          </span>
          <CardTitle className="text-2xl">{t(`setup.${state}.title`)}</CardTitle>
          <CardDescription className="text-base">{t(`setup.${state}.body`)}</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          {state === 'working' ? <Spinner /> : null}
          {state === 'failed' ? (
            <Button asChild variant="outline">
              <Link to="/login">{t('landing.login')}</Link>
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
