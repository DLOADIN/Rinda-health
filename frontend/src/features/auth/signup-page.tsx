import { zodResolver } from '@hookform/resolvers/zod';
import { ROLES, SignupRequest, type Role } from '@rinda/schemas';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import type { z } from 'zod';
import { ApiError } from '@/components/api-error';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/password-input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { AuthFrame } from '@/features/auth/auth-frame';
import { GoogleButton } from '@/features/auth/google-button';
import { useSignupMutation } from '@/lib/api';

type Values = z.infer<typeof SignupRequest>;

export function SignupPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [signup, { isLoading, error }] = useSignupMutation();
  const form = useForm<Values>({
    resolver: zodResolver(SignupRequest),
    defaultValues: {
      role: 'participant',
      identifier: '',
      password: '',
      displayName: undefined,
      preferredLanguage: i18n.language === 'rw' ? 'rw' : 'en',
    },
  });
  const role = useWatch({ control: form.control, name: 'role' });

  const onSubmit = async (values: Values) => {
    const result = await signup({ ...values, preferredLanguage: i18n.language === 'rw' ? 'rw' : 'en' });
    if ('data' in result && result.data) void navigate('/app', { replace: true });
  };

  return (
    <AuthFrame heading={t('auth.signupTitle')} subtitle={t('auth.signupSubtitle')} slide={2}>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <Controller
          name="role"
          control={form.control}
          render={({ field }) => (
            <FieldSet>
              <FieldLegend>{t('auth.role')}</FieldLegend>
              <RadioGroup value={field.value} onValueChange={(v) => field.onChange(v as Role)}>
                {ROLES.map((r) => (
                  <FieldLabel key={r} htmlFor={`role-${r}`}>
                    <Field orientation="horizontal" className="min-h-11">
                      <FieldContent>
                        <FieldTitle>{t(`auth.roles.${r}`)}</FieldTitle>
                        <FieldDescription>{t(`auth.roleHelp.${r}`)}</FieldDescription>
                      </FieldContent>
                      <RadioGroupItem value={r} id={`role-${r}`} />
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
            </FieldSet>
          )}
        />
        <FieldGroup>
          <Controller
            name="displayName"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="displayName">{t('auth.displayName')}</FieldLabel>
                <Input
                  id="displayName"
                  autoComplete="nickname"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value === '' ? undefined : e.target.value)}
                />
              </Field>
            )}
          />
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
                <PasswordInput
                  {...field}
                  id="password"
                  autoComplete="new-password"
                  aria-invalid={fieldState.invalid}
                />
                <FieldDescription>{t('auth.passwordHint')}</FieldDescription>
                {fieldState.invalid ? <FieldError>{t('auth.passwordShort')}</FieldError> : null}
              </Field>
            )}
          />
          <ApiError error={error} />
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? <Spinner data-icon="inline-start" /> : null}
            {t('auth.submitSignup')}
          </Button>
        </FieldGroup>
      </form>
      <GoogleButton intent="signup" role={role} />
      <p className="text-center text-sm">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="font-medium text-brand-ember-strong underline underline-offset-4">
          {t('landing.login')}
        </Link>
      </p>
    </AuthFrame>
  );
}
