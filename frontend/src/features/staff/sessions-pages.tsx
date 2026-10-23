import { TASK_CODES } from '@rinda/schemas';
import {
  Activity,
  CircleCheck,
  CircleDot,
  HeartHandshake,
  Plus,
  QrCode,
  Smartphone,
  Timer,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ApiError } from '@/components/api-error';
import { ConfirmAction } from '@/components/confirm-action';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
  useDeviceLinkMutation,
  useLiveSessionQuery,
  useWipeDeviceMutation,
  useSessionsQuery,
  type LiveSession,
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

function TaskRow({
  session,
  taskCode,
  liveSeconds,
}: {
  session: Session;
  taskCode: string;
  liveSeconds?: number;
}) {
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
      {liveSeconds && !existing ? (
        <Button
          type="button"
          variant="ghost"
          onClick={() => setMinutes(String(Math.round((liveSeconds / 60) * 10) / 10))}
          disabled={Boolean(session.endedAt)}
        >
          <Timer aria-hidden="true" data-icon="inline-start" />
          {t('sessions.live.useTime', { minutes: Math.max(1, Math.round(liveSeconds / 60)) })}
        </Button>
      ) : null}
      <Button type="submit" variant="outline" disabled={!outcome || isLoading || Boolean(session.endedAt)}>
        {t('sessions.saveTask')}
      </Button>
    </form>
  );
}

const STEPS = ['signin', 'consent', 'questionnaire', 'measurements', 'results', 'get_help'] as const;

function minutesLabel(seconds: number) {
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function LiveConsole({ live }: { live: LiveSession }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const currentIndex = live.current ? STEPS.indexOf(live.current.step as (typeof STEPS)[number]) : -1;
  const inStep = live.current
    ? Math.max(0, Math.round((now - Date.parse(live.current.startedAt)) / 1000))
    : 0;
  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
          <Activity aria-hidden="true" className="size-5 text-brand-ember-strong" />
          {t('sessions.live.title')}
          {live.ended ? (
            <Badge variant="outline">{t('sessions.ended')}</Badge>
          ) : live.online ? (
            <Badge className="gap-1">
              <Wifi aria-hidden="true" className="size-3.5" />
              {t('sessions.live.online')}
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <WifiOff aria-hidden="true" className="size-3.5" />
              {t('sessions.live.waiting')}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>{t('sessions.live.body')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {live.alerts.length > 0 ? (
          <Alert className="border-band-wellness bg-brand-blush-soft">
            <HeartHandshake aria-hidden="true" />
            <AlertTitle>{t('sessions.live.alertTitle')}</AlertTitle>
            <AlertDescription>
              {live.alerts.map((a) => (
                <span key={a.occurredAt} className="block">
                  {t('sessions.live.alert', { tier: a.tier, time: formatDate(a.occurredAt, true) })}
                </span>
              ))}
            </AlertDescription>
          </Alert>
        ) : null}
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {STEPS.map((step, i) => {
            const done = (live.totals[step] ?? 0) > 0 && i !== currentIndex;
            const active = i === currentIndex;
            return (
              <li
                key={step}
                aria-current={active ? 'step' : undefined}
                className={`rounded-2xl border p-3 text-sm ${active ? 'border-primary bg-brand-blush-soft' : done ? 'bg-card' : 'bg-card/40 text-muted-foreground'}`}
              >
                <p className="flex items-center gap-1.5 font-medium">
                  {active ? (
                    <CircleDot aria-hidden="true" className="size-4 text-brand-ember-strong" />
                  ) : null}
                  {t(`sessions.task.${step}`)}
                </p>
                <p className="mt-1 tabular-nums">
                  {active ? minutesLabel(inStep) : live.totals[step] ? minutesLabel(live.totals[step]) : '—'}
                </p>
              </li>
            );
          })}
        </ol>
        {live.current ? (
          <p className="text-sm text-muted-foreground">
            {t('sessions.live.now', {
              step: t(`sessions.task.${live.current.step}`),
              time: minutesLabel(inStep),
            })}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t('sessions.live.notYet')}</p>
        )}
      </CardContent>
    </Card>
  );
}

function StudyPhoneCard({ session, live }: { session: Session; live: LiveSession | undefined }) {
  const { t } = useTranslation();
  const [link, { data: linkData, isLoading: linking, error: linkError }] = useDeviceLinkMutation();
  const [wipe, { isLoading: wiping, error: wipeError }] = useWipeDeviceMutation();
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    if (!linkData) return;
    let active = true;
    void import('qrcode').then(async (QRCode) => {
      const svg = await QRCode.toString(linkData.url, { type: 'svg', margin: 1, width: 240 });
      if (active) setQr(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    });
    return () => {
      active = false;
    };
  }, [linkData]);
  const device = live?.device;
  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
          <Smartphone aria-hidden="true" className="size-5 text-brand-ember-strong" />
          {t('sessions.phone.title')}
          {device?.wipedAt ? (
            <Badge className="gap-1">
              <CircleCheck aria-hidden="true" className="size-3.5" />
              {t('sessions.phone.wiped')}
            </Badge>
          ) : device?.wipeRequested ? (
            <Badge variant="outline">{t('sessions.phone.wiping')}</Badge>
          ) : device?.linked ? (
            <Badge className="gap-1">
              <CircleCheck aria-hidden="true" className="size-3.5" />
              {t('sessions.phone.linked')}
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>{t('sessions.phone.body')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!session.endedAt && !device?.linked ? (
          linkData && qr ? (
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              <img
                src={qr}
                alt={t('sessions.phone.qrAlt')}
                className="size-60 rounded-2xl border bg-card p-2"
              />
              <div className="flex flex-col gap-2 text-sm">
                <p>{t('sessions.phone.scan')}</p>
                <p className="break-all text-muted-foreground">{linkData.url}</p>
                <p className="text-muted-foreground">
                  {t('sessions.phone.expires', { time: formatDate(linkData.expiresAt, true) })}
                </p>
                <Button
                  variant="outline"
                  className="self-start"
                  onClick={() => void link(session.id)}
                  disabled={linking}
                >
                  {t('sessions.phone.newCode')}
                </Button>
              </div>
            </div>
          ) : (
            <Button className="self-start" onClick={() => void link(session.id)} disabled={linking}>
              <QrCode aria-hidden="true" data-icon="inline-start" />
              {t('sessions.phone.show')}
            </Button>
          )
        ) : null}
        {!session.endedAt ? (
          <ConfirmAction
            trigger={
              <>
                <Smartphone aria-hidden="true" data-icon="inline-start" />
                {t('sessions.phone.endAndWipe')}
              </>
            }
            title={t('sessions.phone.endAndWipe')}
            description={t('sessions.phone.endAndWipeConfirm')}
            onConfirm={() => void wipe(session.id)}
          />
        ) : null}
        {wiping ? <p className="text-sm text-muted-foreground">{t('sessions.phone.wiping')}</p> : null}
        <ApiError error={linkError ?? wipeError} />
      </CardContent>
    </Card>
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
  const { data: live } = useLiveSessionQuery(id, { pollingInterval: 3000, skip: !id });
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
      {live ? <LiveConsole live={live} /> : null}
      <StudyPhoneCard session={session} live={live} />
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
            <TaskRow key={code} session={session} taskCode={code} liveSeconds={live?.totals[code]} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
