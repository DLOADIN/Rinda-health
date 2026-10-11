import type { Role } from '@rinda/schemas';
import { SafetyAction } from '@rinda/schemas';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ApiError } from '@/components/api-error';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useParticipantsQuery, useRecordSafetyEventMutation, useSafetyEventsQuery } from '@/lib/api';
import { formatDate } from '@/lib/format';

const ACTIONS = SafetyAction.options;

function RecordDialog() {
  const { t } = useTranslation();
  const { data: participants } = useParticipantsQuery();
  const [record, { isLoading, error }] = useRecordSafetyEventMutation();
  const [open, setOpen] = useState(false);
  const [participantId, setParticipantId] = useState('');
  const [tier, setTier] = useState<2 | 3>(2);
  const [trigger, setTrigger] = useState<'observed' | 'disclosed'>('observed');
  const [actions, setActions] = useState<string[]>([]);
  const toggle = (a: string, on: boolean) =>
    setActions(on ? [...actions, a] : actions.filter((x) => x !== a));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await record({
      participantId,
      tier,
      triggerType: trigger,
      actions,
      ...(actions.includes('supervisor_informed') ? { supervisorInformedAt: new Date().toISOString() } : {}),
    });
    if (!('error' in result)) {
      toast.success(t('safety.saved'));
      setOpen(false);
      setActions([]);
      setParticipantId('');
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" data-icon="inline-start" />
          {t('safety.record')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>{t('safety.record')}</DialogTitle>
            <DialogDescription>{t('safety.intro')}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="se-p">{t('safety.participant')}</FieldLabel>
              <NativeSelect
                id="se-p"
                value={participantId}
                onChange={(e) => setParticipantId(e.target.value)}
                required
              >
                <NativeSelectOption value="">{t('sessions.choose')}</NativeSelectOption>
                {participants?.map((p) => (
                  <NativeSelectOption key={p.id} value={p.id}>
                    {p.displayName ? `${p.displayName} · ${p.label}` : p.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <FieldSet>
              <FieldLegend variant="label">{t('safety.tier')}</FieldLegend>
              <RadioGroup value={String(tier)} onValueChange={(v) => setTier(v === '3' ? 3 : 2)}>
                {(['2', '3'] as const).map((v) => (
                  <Field key={v} orientation="horizontal" className="min-h-11">
                    <RadioGroupItem value={v} id={`tier-${v}`} />
                    <FieldLabel htmlFor={`tier-${v}`} className="font-normal">
                      {t(`safety.tiers.${v}`)}
                    </FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
            </FieldSet>
            <FieldSet>
              <FieldLegend variant="label">{t('safety.trigger')}</FieldLegend>
              <RadioGroup
                value={trigger}
                onValueChange={(v) => setTrigger(v === 'disclosed' ? 'disclosed' : 'observed')}
              >
                {(['observed', 'disclosed'] as const).map((v) => (
                  <Field key={v} orientation="horizontal" className="min-h-11">
                    <RadioGroupItem value={v} id={`trig-${v}`} />
                    <FieldLabel htmlFor={`trig-${v}`} className="font-normal">
                      {t(`safety.triggers.${v}`)}
                    </FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
            </FieldSet>
            <FieldSet>
              <FieldLegend variant="label">{t('safety.actions')}</FieldLegend>
              {ACTIONS.map((a) => (
                <Field key={a} orientation="horizontal" className="min-h-11">
                  <Checkbox
                    id={`act-${a}`}
                    checked={actions.includes(a)}
                    onCheckedChange={(v) => toggle(a, v === true)}
                  />
                  <FieldLabel htmlFor={`act-${a}`} className="font-normal">
                    {t(`safety.actionLabels.${a}`)}
                  </FieldLabel>
                </Field>
              ))}
            </FieldSet>
            <ApiError error={error} />
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!participantId || isLoading}>
              {t('safety.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SafetyPage({ role }: { role: Role }) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useSafetyEventsQuery();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('safety.title')}
        description={t('safety.intro')}
        actions={role === 'facilitator' ? <RecordDialog /> : null}
      />
      <ApiError error={error} />
      {isLoading ? <Skeleton className="h-40" /> : null}
      {data ? (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">{t('safety.when')}</TableHead>
                  <TableHead>{t('safety.tier')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('safety.trigger')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('safety.participant')}</TableHead>
                  <TableHead className="hidden lg:table-cell pr-4">{t('safety.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="p-4 text-muted-foreground">
                      {t('safety.empty')}
                    </TableCell>
                  </TableRow>
                ) : null}
                {data.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="pl-4 whitespace-normal">{formatDate(e.occurredAt, true)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{t('dashboard.tier', { tier: e.tier })}</Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {t(`safety.triggers.${e.triggerType}`)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{e.participantLabel}</TableCell>
                    <TableCell className="hidden pr-4 whitespace-normal lg:table-cell">
                      {e.actions.map((a) => t(`safety.actionLabels.${a}`)).join(', ')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
