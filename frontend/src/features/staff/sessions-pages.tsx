import { TASK_CODES } from '@rinda/schemas';
import { Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ApiError } from '@/components/api-error';
import { ConfirmAction } from '@/components/confirm-action';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCreateSessionMutation,
  useDeleteSessionMutation,
  useEndSessionMutation,
  useParticipantsQuery,
  useSaveTaskMutation,
  useSessionsQuery,
  type Session,
} from '@/lib/api';
import { formatDate } from '@/lib/format';

function NewSessionDialog() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: participants } = useParticipantsQuery();
  const [create, { isLoading, error }] = useCreateSessionMutation();
  const [participantId, setParticipantId] = useState('');
  const [device, setDevice] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await create({ participantId, ...(device.trim() ? { deviceLabel: device.trim() } : {}) });
    if ('data' in result && result.data) void navigate(`/app/sessions/${result.data.id}`);
  };
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" data-icon="inline-start" />
          {t('sessions.new')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>{t('sessions.new')}</DialogTitle>
            <DialogDescription>{t('participants.intro')}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="s-participant">{t('sessions.participant')}</FieldLabel>
              <NativeSelect
                id="s-participant"
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
            <Field>
              <FieldLabel htmlFor="s-device">{t('sessions.device')}</FieldLabel>
              <Input
                id="s-device"
                value={device}
                maxLength={40}
                placeholder={t('sessions.devicePlaceholder')}
                onChange={(e) => setDevice(e.target.value)}
              />
            </Field>
            <ApiError error={error} />
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={!participantId || isLoading}>
              {t('sessions.start')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SessionsPage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useSessionsQuery();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('sessions.title')} actions={<NewSessionDialog />} />
      <ApiError error={error} />
      {isLoading ? <Skeleton className="h-40" /> : null}
      {data && data.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyDescription>{t('sessions.empty')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      <ItemGroup className="flex flex-col gap-2">
        {data?.map((s) => (
          <Item key={s.id} variant="outline" asChild>
            <Link to={`/app/sessions/${s.id}`}>
              <ItemContent>
                <ItemTitle>{s.participantLabel}</ItemTitle>
                <ItemDescription>
                  {formatDate(s.startedAt, true)}
                  {s.deviceLabel ? ` · ${s.deviceLabel}` : ''}
                </ItemDescription>
              </ItemContent>
              <ItemActions className="flex-wrap">
                <Badge variant="outline">{s.orderAssignment ?? '—'}</Badge>
                <Badge variant={s.endedAt ? 'outline' : 'secondary'}>
                  {s.endedAt ? t('sessions.ended') : t('sessions.open')}
                </Badge>
              </ItemActions>
            </Link>
          </Item>
        ))}
      </ItemGroup>
    </div>
  );
}

function TaskRow({ session, taskCode }: { session: Session; taskCode: string }) {
  const { t } = useTranslation();
  const [save, { isLoading }] = useSaveTaskMutation();
  const existing = session.tasks.find((x) => x.taskCode === taskCode);
  const [outcome, setOutcome] = useState(existing?.outcome ?? '');
  const [minutes, setMinutes] = useState(existing ? String(Math.round(existing.durationSeconds / 60)) : '');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await save({
      id: session.id,
      taskCode,
      outcome,
      durationSeconds: Math.max(0, Math.round(Number(minutes || '0') * 60)),
    });
    if (!('error' in result)) toast.success(t('sessions.taskSaved'));
  };
  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-end"
    >
      <p className="font-medium sm:w-40 sm:self-center">{t(`sessions.task.${taskCode}`)}</p>
      <Field className="flex-1">
        <FieldLabel htmlFor={`o-${taskCode}`}>{t('sessions.outcome')}</FieldLabel>
        <NativeSelect
          id={`o-${taskCode}`}
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          disabled={Boolean(session.endedAt)}
        >
          <NativeSelectOption value="">{t('sessions.notRecorded')}</NativeSelectOption>
          {(['completed', 'completed_with_help', 'not_completed'] as const).map((o) => (
            <NativeSelectOption key={o} value={o}>
              {t(`sessions.outcomes.${o}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field className="sm:w-28">
        <FieldLabel htmlFor={`m-${taskCode}`}>{t('sessions.minutes')}</FieldLabel>
        <Input
          id={`m-${taskCode}`}
          type="number"
          inputMode="numeric"
          min="0"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          disabled={Boolean(session.endedAt)}
        />
      </Field>
      <Button type="submit" variant="outline" disabled={!outcome || isLoading || Boolean(session.endedAt)}>
        {t('sessions.saveTask')}
      </Button>
    </form>
  );
}

export function SessionDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const { data, isLoading, error } = useSessionsQuery();
  const [end, { error: endError }] = useEndSessionMutation();
  const [remove] = useDeleteSessionMutation();
  const session = data?.find((s) => s.id === id);
  if (isLoading) return <Skeleton className="h-64" />;
  if (!session) return <ApiError error={error ?? { status: 404, data: { error: { code: 'NOT_FOUND' } } }} />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={session.participantLabel}
        description={t('sessions.orderReadOnly', { order: session.orderAssignment ?? '—' })}
        actions={
          <>
            {!session.endedAt ? (
              <Button onClick={() => void end(session.id)}>{t('sessions.end')}</Button>
            ) : null}
            <ConfirmAction
              trigger={
                <>
                  <Trash2 aria-hidden="true" data-icon="inline-start" />
                  {t('sessions.delete')}
                </>
              }
              title={t('sessions.delete')}
              description={t('sessions.deleteConfirm')}
              onConfirm={() =>
                void remove(session.id).then(() => navigate('/app/sessions', { replace: true }))
              }
            />
          </>
        }
      />
      <ApiError error={endError} />
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t('sessions.tasks')}</CardTitle>
          <CardDescription>
            {t('sessions.started')}: {formatDate(session.startedAt, true)}
            {session.endedAt ? ` · ${t('sessions.ended')}: ${formatDate(session.endedAt, true)}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {TASK_CODES.map((code) => (
            <TaskRow key={code} session={session} taskCode={code} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
