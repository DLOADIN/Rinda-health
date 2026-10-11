import { ArrowRight, Mail, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ApiError } from '@/components/api-error';
import { ConfirmAction } from '@/components/confirm-action';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { ResultView } from '@/features/results/result-view';
import { Badge } from '@/components/ui/badge';
import {
  useAssessmentQuery,
  useAssessmentsQuery,
  useDeleteAssessmentMutation,
  useEmailReportsQuery,
  useMeQuery,
  useSendEmailReportMutation,
  type Assessment,
} from '@/lib/api';
import { pendingFor, useOutbox } from '@/lib/offline';
import { useCached } from '@/lib/use-cached';
import { formatDate } from '@/lib/format';

export function ResultsPage() {
  const { t } = useTranslation();
  const { data: me } = useMeQuery();
  const { data: live, isLoading, error } = useAssessmentsQuery();
  const { data: saved, fromCache } = useCached(me ? `assessments:${me.id}` : null, live, error);
  useOutbox();
  const data =
    saved || me ? [...(me ? pendingFor(me.id).map((i) => i.provisional) : []), ...(saved ?? [])] : undefined;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('results.title')}
        actions={
          <Button asChild>
            <Link to="/app/checkup">{t('dashboard.startCheckup')}</Link>
          </Button>
        }
      />
      {fromCache ? null : <ApiError error={saved ? null : error} />}
      {isLoading ? <Skeleton className="h-40" /> : null}
      {data && data.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyDescription>{t('results.empty')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link to="/app/checkup">{t('dashboard.startCheckup')}</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : null}
      <div className="flex flex-col gap-4">
        {data?.map((a) => (
          <Card key={a.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                {t('results.checkupOn', { date: formatDate(a.createdAt, true) })}
                {a.provisional ? <Badge variant="outline">{t('offline.savedOnPhone')}</Badge> : null}
              </CardTitle>
              <CardDescription>{t('results.version', { version: a.rulesetVersion })}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <ResultView assessment={a} compact />
              <Button asChild variant="outline" className="w-full sm:w-auto sm:self-start">
                <Link to={`/app/results/${a.id}`}>
                  {t('results.view')}
                  <ArrowRight aria-hidden="true" data-icon="inline-end" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function EmailReportButton({ assessmentId }: { assessmentId: string }) {
  const { t } = useTranslation();
  const { data } = useEmailReportsQuery();
  const [send, { isLoading }] = useSendEmailReportMutation();
  if (!data?.available || !data.email) return null;
  return (
    <Button
      variant="outline"
      disabled={isLoading}
      onClick={() =>
        void send({ assessmentId }).then((r) =>
          'error' in r || r.data.status !== 'sent'
            ? toast.error(t('emailReports.sendFailed'))
            : toast.success(t('emailReports.sent')),
        )
      }
    >
      <Mail aria-hidden="true" data-icon="inline-start" />
      {t('emailReports.send')}
    </Button>
  );
}

export function ResultDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const { data: me } = useMeQuery();
  const local = id.startsWith('local-');
  const { data: live, isLoading, error } = useAssessmentQuery(id, { skip: local });
  const { data: cachedList } = useCached<Assessment[]>(me ? `assessments:${me.id}` : null, undefined, error);
  const data = local
    ? me
      ? pendingFor(me.id).find((i) => i.provisional.id === id)?.provisional
      : undefined
    : (live ?? cachedList?.find((a) => a.id === id));
  const [remove] = useDeleteAssessmentMutation();
  const onDelete = async () => {
    if (!('error' in (await remove(id)))) {
      toast.success(t('results.deleted'));
      void navigate('/app/results', { replace: true });
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={data ? t('results.checkupOn', { date: formatDate(data.createdAt, true) }) : t('results.title')}
        description={data ? t('results.version', { version: data.rulesetVersion }) : undefined}
        actions={
          data && !data.provisional ? (
            <div className="flex flex-wrap gap-2">
              <EmailReportButton assessmentId={data.id} />
              <ConfirmAction
                trigger={
                  <>
                    <Trash2 aria-hidden="true" data-icon="inline-start" />
                    {t('results.delete')}
                  </>
                }
                title={t('results.delete')}
                description={t('results.deleteConfirm')}
                onConfirm={() => void onDelete()}
              />
            </div>
          ) : null
        }
      />
      <ApiError error={error} />
      {isLoading ? <Skeleton className="h-64" /> : null}
      {data ? <ResultView assessment={data} /> : null}
    </div>
  );
}
