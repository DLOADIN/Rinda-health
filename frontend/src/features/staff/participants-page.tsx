import type { Role } from '@rinda/schemas';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ApiError } from '@/components/api-error';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCreateSessionMutation, useParticipantsQuery } from '@/lib/api';
import { formatDate } from '@/lib/format';

export function ParticipantsPage({ role }: { role: Role }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, error } = useParticipantsQuery();
  const [createSession, { error: startError }] = useCreateSessionMutation();
  const start = async (participantId: string) => {
    const result = await createSession({ participantId });
    if ('data' in result && result.data) void navigate(`/app/sessions/${result.data.id}`);
  };
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('participants.title')} description={t('participants.intro')} />
      <ApiError error={error ?? startError} />
      {isLoading ? <Skeleton className="h-48" /> : null}
      {data ? (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">{t('participants.who')}</TableHead>
                  <TableHead>{t('participants.order')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('participants.joined')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('participants.checkups')}</TableHead>
                  {role === 'facilitator' ? (
                    <TableHead className="pr-4 text-right">{t('common.actions')}</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="p-4 text-muted-foreground">
                      {t('participants.empty')}
                    </TableCell>
                  </TableRow>
                ) : null}
                {data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="pl-4">
                      <div className="flex flex-col">
                        <span className="font-medium">{p.displayName ?? p.label}</span>
                        {p.displayName ? (
                          <span className="text-sm text-muted-foreground">{p.label}</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{p.orderAssignment ?? '—'}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{formatDate(p.createdAt)}</TableCell>
                    <TableCell className="hidden sm:table-cell">{p.assessments}</TableCell>
                    {role === 'facilitator' ? (
                      <TableCell className="pr-4 text-right">
                        <Button size="sm" onClick={() => void start(p.id)}>
                          {t('participants.startSession')}
                        </Button>
                      </TableCell>
                    ) : null}
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
