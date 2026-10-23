// This is the optional mood and stress part of the check-up, plus the safety screen. Calm colours only.
import { RULESET_V1 } from '@rinda/content';
import { checkItem9 } from '@rinda/rules';
import { HeartHandshake } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldDescription, FieldGroup } from '@/components/ui/field';
import { Choice } from '@/features/participant/choice';
export { SafetyScreen } from '@/features/participant/safety-screen';
import { useContent } from '@/lib/content';

export type WellnessMode = 'intro' | 'answering' | 'declined' | 'stopped';
export interface WellnessState {
  mode: WellnessMode;
  phq9: Array<number | null>;
  gad7: Array<number | null>;
}
const PHQ_VARIANT = RULESET_V1.domains.phq9.variant;
export const WELLNESS_START: WellnessState = {
  mode: 'intro',
  phq9: Array<number | null>(PHQ_VARIANT === 'PHQ-8' ? 8 : 9).fill(null),
  gad7: Array<number | null>(RULESET_V1.domains.gad7.items).fill(null),
};

export function WellnessSection({
  state,
  onChange,
  onItem9Risk,
}: {
  state: WellnessState;
  onChange: (next: WellnessState) => void;
  onItem9Risk: () => void;
}) {
  const { t } = useTranslation();
  const { text } = useContent();
  const options = [0, 1, 2, 3].map((n) => ({ value: String(n), label: text(`q.wellness.opt.${n}`) }));
  const set = (which: 'phq9' | 'gad7', index: number, v: string | null) => {
    const value = v === null ? null : Number(v);
    const items = [...state[which]];
    items[index] = value;
    onChange({ ...state, [which]: items });
    // Item 9 is checked right here, on the phone, before anything is sent.
    const isItem9 = which === 'phq9' && index === 8 && PHQ_VARIANT === 'PHQ-9';
    if (isItem9 && value !== null && checkItem9({ value }) === 'tier2') onItem9Risk();
  };

  return (
    <Card className="border-band-wellness bg-brand-blush-soft">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <HeartHandshake aria-hidden="true" className="size-5" />
          {text('q.wellness.title')}
        </CardTitle>
        {state.mode === 'intro' ? (
          <CardDescription className="flex flex-col gap-2 text-base text-foreground">
            <span>{text('q.wellness.intro')}</span>
            <span>{text('q.wellness.risk')}</span>
            <span>{text('q.wellness.separate')}</span>
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        {state.mode === 'intro' ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={() => onChange({ ...state, mode: 'answering' })}>
              {t('checkup.wellness.start')}
            </Button>
            <Button type="button" variant="outline" onClick={() => onChange({ ...state, mode: 'declined' })}>
              {t('checkup.wellness.skip')}
            </Button>
          </div>
        ) : null}
        {state.mode === 'declined' ? (
          <div className="flex flex-col items-start gap-2">
            <FieldDescription>{t('checkup.wellness.declined')}</FieldDescription>
            <Button type="button" variant="ghost" onClick={() => onChange({ ...state, mode: 'intro' })}>
              {t('checkup.wellness.changeMind')}
            </Button>
          </div>
        ) : null}
        {state.mode === 'stopped' ? (
          <FieldDescription>{t('checkup.wellness.stopped')}</FieldDescription>
        ) : null}
        {state.mode === 'answering' ? (
          <FieldGroup>
            <p className="font-medium">{text('q.phq9.stem')}</p>
            {state.phq9.map((v, i) => (
              <Choice
                key={`phq9-${i}`}
                id={`phq9-${i + 1}`}
                question={text(`q.phq9.${i + 1}`)}
                options={options}
                value={v === null ? null : String(v)}
                onChange={(next) => set('phq9', i, next)}
              />
            ))}
            <p className="font-medium">{text('q.gad7.stem')}</p>
            {state.gad7.map((v, i) => (
              <Choice
                key={`gad7-${i}`}
                id={`gad7-${i + 1}`}
                question={text(`q.gad7.${i + 1}`)}
                options={options}
                value={v === null ? null : String(v)}
                onChange={(next) => set('gad7', i, next)}
              />
            ))}
          </FieldGroup>
        ) : null}
      </CardContent>
    </Card>
  );
}
