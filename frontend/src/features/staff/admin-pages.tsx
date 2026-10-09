// Researcher-admin: deletion requests (FR-18), the append-only audit log (FR-48) and feature flags (FR-50).
import { FLAG_KEYS } from '@rinda/schemas';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ApiError } from '@/components/api-error';
import { ConfirmAction } from '@/components/confirm-action';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Field, FieldContent, FieldLabel } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useAuditLogQuery,
  useCompleteDeletionMutation,
  useDeletionRequestsQuery,
  useFlagsQuery,
  useSetFlagMutation,
} from '@/lib/api';
import { formatDate } from '@/lib/format';

function EmptyRow({ text, cols }: { text: string; cols: number }) {
  return (
    <TableRow>
      <TableCell colSpan={cols} className="p-4 text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}

export function DeletionsPage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useDeletionRequestsQuery();
  const [complete, completeState] = useCompleteDeletionMutation();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('deletions.title')} description={t('deletions.intro')} />
      <ApiError error={error ?? completeState.error} />
      {isLoading ? <Skeleton className="h-40" /> : null}
      {data ? (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">{t('participants.who')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('deletions.requested')}</TableHead>
                  <TableHead>{t('deletions.due')}</TableHead>
                  <TableHead className="pr-4 text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? <EmptyRow text={t('deletions.empty')} cols={4} /> : null}
                {data.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="pl-4">{d.participantLabel}</TableCell>
                    <TableCell className="hidden sm:table-cell">{formatDate(d.requestedAt)}</TableCell>
                    <TableCell className="whitespace-normal">{formatDate(d.dueAt)}</TableCell>
                    <TableCell className="pr-4 text-right">
                      {d.status === 'completed' ? (
                        <Badge variant="outline">{t('deletions.completed')}</Badge>
                      ) : (
                        <ConfirmAction
                          trigger={t('deletions.complete')}
                          size="sm"
                          title={t('deletions.complete')}
                          description={t('deletions.completeConfirm')}
                          onConfirm={() =>
                            void complete(d.id).then((r) =>
                              !('error' in r) ? toast.success(t('deletions.done')) : undefined,
                            )
                          }
                        />
                      )}
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

export function AuditPage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useAuditLogQuery();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('audit.title')} description={t('audit.intro')} />
      <ApiError error={error} />
      {isLoading ? <Skeleton className="h-48" /> : null}
      {data ? (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">{t('audit.when')}</TableHead>
                  <TableHead>{t('audit.action')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('audit.who')}</TableHead>
                  <TableHead className="hidden lg:table-cell pr-4">{t('audit.target')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? <EmptyRow text={t('audit.empty')} cols={4} /> : null}
                {data.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="pl-4 whitespace-normal">{formatDate(a.createdAt, true)}</TableCell>
                    <TableCell>
                      <code className="text-sm">{a.action}</code>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {a.actor ?? t(`auth.roles.${a.actorRole}`, { defaultValue: a.actorRole })}
                    </TableCell>
                    <TableCell className="hidden pr-4 lg:table-cell">{a.targetType ?? ''}</TableCell>
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

export function FlagsPage() {
  const { t } = useTranslation();
  const { data, isLoading, error } = useFlagsQuery();
  const [setFlag, setState] = useSetFlagMutation();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('flags.title')} description={t('flags.intro')} />
      <ApiError error={error ?? setState.error} />
      {isLoading ? <Skeleton className="h-48" /> : null}
      {data ? (
        <Card>
          <CardContent className="flex flex-col gap-1">
            {FLAG_KEYS.map((key) => (
              <Field key={key} orientation="horizontal" className="min-h-11 justify-between">
                <FieldContent>
                  <FieldLabel htmlFor={`flag-${key}`}>{t(`flags.names.${key}`)}</FieldLabel>
                </FieldContent>
                <Switch
                  id={`flag-${key}`}
                  checked={data[key]}
                  onCheckedChange={(enabled) =>
                    void setFlag({ key, enabled }).then((r) =>
                      !('error' in r) ? toast.success(t('flags.saved')) : undefined,
                    )
                  }
                />
              </Field>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
