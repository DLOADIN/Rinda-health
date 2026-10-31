import { QrCode } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatDate } from '@/lib/format';

interface QrSession {
  id: string;
  uploadedAt: string;
  byMe: boolean;
  facilitatorLabel: string | null;
  participantLabel: string;
  sessionId: string | null;
  checkups: number;
  safetyEvents: number;
  saved: number;
  already: number;
  invalid: number;
}

interface QrSessionDetail extends QrSession {
  checkupList: Array<{ createdAt: string; rulesetVersion: string; newFromQr: boolean }>;
}

export function QrSessionsPage() {
  const { t } = useTranslation();
  const [list, setList] = useState<QrSession[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [show, setShow] = useState<'all' | 'mine'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QrSessionDetail | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/v1/facilitator/handovers', { credentials: 'same-origin' })
      .then(async (r) => (r.ok ? ((await r.json()) as QrSession[]) : Promise.reject(new Error('failed'))))
      .then((rows) => {
        if (active) setList(rows);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!openId) return;
    let active = true;
    void fetch(`/api/v1/facilitator/handovers/${openId}`, { credentials: 'same-origin' })
      .then(async (r) => (r.ok ? ((await r.json()) as QrSessionDetail) : null))
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [openId]);

  const shown = (list ?? []).filter((s) => show === 'all' || s.byMe);
  const who = (s: QrSession) =>
    s.byMe ? t('qrSessions.you') : (s.facilitatorLabel ?? t('qrSessions.unknown'));
  const outcome = (s: QrSession) =>
    [
      s.saved ? t('qrSessions.newCount', { count: s.saved }) : null,
      s.already ? t('qrSessions.alreadyCount', { count: s.already }) : null,
      s.invalid ? t('qrSessions.invalidCount', { count: s.invalid }) : null,
    ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('qrSessions.title')}
        description={t('qrSessions.intro')}
        actions={
          <ToggleGroup
            type="single"
            variant="outline"
            value={show}
            onValueChange={(v) => setShow(v === 'mine' ? 'mine' : 'all')}
          >
            <ToggleGroupItem value="all">{t('qrSessions.all')}</ToggleGroupItem>
            <ToggleGroupItem value="mine">{t('qrSessions.mineOnly')}</ToggleGroupItem>
          </ToggleGroup>
        }
      />
      {failed ? (
        <Alert role="alert">
          <AlertDescription>{t('qrSessions.loadFailed')}</AlertDescription>
        </Alert>
      ) : null}
      {!list && !failed ? <Skeleton className="h-48" /> : null}
      {list && shown.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <QrCode aria-hidden="true" />
            </EmptyMedia>
            <EmptyDescription>{t('qrSessions.empty')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      {shown.length > 0 ? (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">{t('qrSessions.when')}</TableHead>
                  <TableHead>{t('qrSessions.participant')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('qrSessions.by')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('qrSessions.checkups')}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t('qrSessions.result')}</TableHead>
                  <TableHead className="pr-4 text-right">{t('qrSessions.details')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="pl-4">{formatDate(s.uploadedAt, true)}</TableCell>
                    <TableCell>{s.participantLabel}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {s.byMe ? <Badge variant="secondary">{who(s)}</Badge> : who(s)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell tabular-nums">{s.checkups}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {outcome(s).join(' · ')}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDetail(null);
                          setOpenId(s.id);
                        }}
                      >
                        {t('qrSessions.details')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={openId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('qrSessions.detailsTitle')}</DialogTitle>
            <DialogDescription>
              {detail ? `${formatDate(detail.uploadedAt, true)} · ${detail.participantLabel}` : null}
            </DialogDescription>
          </DialogHeader>
          {!detail ? <Skeleton className="h-32" /> : null}
          {detail ? (
            <div className="flex flex-col gap-4">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <dt className="text-muted-foreground">{t('qrSessions.by')}</dt>
                <dd>{who(detail)}</dd>
                <dt className="text-muted-foreground">{t('qrSessions.checkups')}</dt>
                <dd className="tabular-nums">{detail.checkups}</dd>
                <dt className="text-muted-foreground">{t('qrSessions.safetyEvents')}</dt>
                <dd className="tabular-nums">{detail.safetyEvents}</dd>
                <dt className="text-muted-foreground">{t('qrSessions.result')}</dt>
                <dd>{outcome(detail).join(' · ')}</dd>
              </dl>
              <ul className="flex flex-col gap-2">
                {detail.checkupList.map((c) => (
                  <li
                    key={c.createdAt}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                  >
                    <span>{t('qrSessions.checkupOn', { date: formatDate(c.createdAt, true) })}</span>
                    <Badge variant="outline">
                      {c.newFromQr ? t('qrSessions.newFromQr') : t('qrSessions.alreadyThere')}
                    </Badge>
                  </li>
                ))}
              </ul>
              {detail.byMe && detail.sessionId ? (
                <Button asChild variant="outline" className="self-start">
                  <Link to={`/app/sessions/${detail.sessionId}`}>{t('qrSessions.session')}</Link>
                </Button>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
