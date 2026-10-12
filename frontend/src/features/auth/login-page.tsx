import { zodResolver } from '@hookform/resolvers/zod';
import { LoginRequest } from '@rinda/schemas';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { ApiError } from '@/components/api-error';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { AuthFrame } from '@/features/auth/auth-frame';
import { GoogleButton } from '@/features/auth/google-button';
import { useLoginMutation } from '@/lib/api';

type Values = z.infer<typeof LoginRequest>;
const CALLBACK_ERRORS = ['google', 'google_no_account', 'account_off'] as const;

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [login, { isLoading, error }] = useLoginMutation();
  const form = useForm<Values>({
    resolver: zodResolver(LoginRequest),
    defaultValues: { identifier: '', password: '' },
  });
  const callbackError = params.get('error');

  // A study phone waiting at sign-in still clears itself when the facilitator ends the session.
  useEffect(() => {
    void import('@/lib/study-device').then((m) => m.resumeStudyDevice());
  }, []);

  const onSubmit = async (values: Values) => {
    const result = await login(values);
    if ('data' in result && result.data) {
      void i18n.changeLanguage(result.data.preferredLanguage);
      void navigate('/app', { replace: true });
    }
  };

  return (
    <AuthFrame heading={t('auth.loginHeading')}>
      <Card className="glass-strong w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-lg md:text-xl">{t('auth.loginTitle')}</CardTitle>
          <CardDescription>{t('auth.loginSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {callbackError && (CALLBACK_ERRORS as readonly string[]).includes(callbackError) ? (
            <Alert role="alert">
              <AlertDescription>{t(`auth.callbackErrors.${callbackError}`)}</AlertDescription>
            </Alert>
          ) : null}
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FieldGroup>
              <Controller
                name="identifier"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="identifier">{t('auth.identifier')}</FieldLabel>
                    <Input
                      {...field}
                      id="identifier"
                      autoComplete="username"
                      inputMode="email"
                      aria-invalid={fieldState.invalid}
                    />
                    <FieldDescription>{t('auth.identifierHint')}</FieldDescription>
                    {fieldState.invalid ? <FieldError>{t('auth.identifierInvalid')}</FieldError> : null}
                  </Field>
                )}
              />
              <Controller
                name="password"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="password">{t('auth.password')}</FieldLabel>
                    <Input
                      {...field}
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      aria-invalid={fieldState.invalid}
                    />
                  </Field>
                )}
              />
              <ApiError error={error} />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <Spinner data-icon="inline-start" /> : null}
                {t('auth.submitLogin')}
              </Button>
            </FieldGroup>
          </form>
          <GoogleButton intent="login" />
          <p className="text-center text-sm">
            {t('auth.noAccount')}{' '}
            <Link to="/signup" className="font-medium text-brand-ember-strong underline underline-offset-4">
              {t('landing.signup')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthFrame>
  );
}
