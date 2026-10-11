import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldLabel, FieldLegend, FieldSet, FieldTitle } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export function Choice({
  id,
  question,
  options,
  value,
  onChange,
}: {
  id: string;
  question: string;
  options: Array<{ value: string; label: string }>;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <FieldSet>
      <FieldLegend variant="label" className="text-base">
        {question}
      </FieldLegend>
      <RadioGroup value={value ?? ''} onValueChange={(v) => onChange(v)}>
        {options.map((o) => (
          <FieldLabel key={o.value} htmlFor={`${id}-${o.value}`}>
            <Field orientation="horizontal" className="min-h-11">
              <FieldContent>
                <FieldTitle>{o.label}</FieldTitle>
              </FieldContent>
              <RadioGroupItem value={o.value} id={`${id}-${o.value}`} />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
      <Button
        type="button"
        variant="ghost"
        className="self-start"
        onClick={() => onChange(null)}
        disabled={value === null}
      >
        {t('checkup.skip')}
      </Button>
    </FieldSet>
  );
}
