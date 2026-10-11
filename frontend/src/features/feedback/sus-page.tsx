// System Usability Scale after the session (FR-17): ten statements, 1 to 5, each skippable with no default.
import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '@/components/api-error';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldGroup } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Choice } from '@/features/participant/choice';
import { useFeedbackStatusQuery, useSubmitFeedbackMutation } from '@/lib/api';
import { useContent } from '@/lib/content';

const EMPTY = Array<number | null>(10).fill(null);

export function SusPage() {
  const { t } = useTranslation();
  const { text } = useContent();
  const { data: status } = useFeedbackStatusQuery();
  const [submit, { isLoading, error, isSuccess, reset }] = useSubmitFeedbackMutation();
  const [items, setItems] = useState(EMPTY);
  const [again, setAgain] = useState(false);
  const scale = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: text(`sus.scale.${n}`) }));

  if (isSuccess || (status?.submitted && !again)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={text('sus.title')} />
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <CircleCheck aria-hidden="true" className="size-5" />
              {text('sus.thanks')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => {
                reset();
                setItems(EMPTY);
                setAgain(true);
              }}
            >
              {t('feedback.again')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit({ formVersion: 'sus-1.0', items });
      }}
    >
      <PageHeader title={text('sus.title')} description={text('sus.intro')} />
      <Card className="glass">
        <CardContent>
          <FieldGroup>
            {items.map((v, i) => (
              <Choice
                key={`sus-${i}`}
                id={`sus-${i + 1}`}
                question={`${i + 1}. ${text(`sus.${i + 1}`)}`}
                options={scale}
                value={v === null ? null : String(v)}
                onChange={(next) => {
                  const updated = [...items];
                  updated[i] = next === null ? null : Number(next);
                  setItems(updated);
                }}
              />
            ))}
          </FieldGroup>
        </CardContent>
      </Card>
      <ApiError error={error} />
      <Button type="submit" disabled={isLoading} className="w-full sm:w-auto sm:self-start">
        {isLoading ? <Spinner data-icon="inline-start" /> : null}
        {t('feedback.submit')}
      </Button>
    </form>
  );
}
