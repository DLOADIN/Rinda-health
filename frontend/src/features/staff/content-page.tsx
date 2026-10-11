import { CONTENT_TYPES, type Role } from '@rinda/schemas';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ApiError } from '@/components/api-error';
import { ConfirmAction } from '@/components/confirm-action';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useContentQuery,
  useCreateContentMutation,
  useDeleteContentMutation,
  usePublishContentMutation,
  useReviewContentMutation,
  useUpdateContentMutation,
  type ContentVersion,
} from '@/lib/api';
import { formatDate } from '@/lib/format';

type ContentType = (typeof CONTENT_TYPES)[number];

function parseBody(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function DraftDialog({ existing }: { existing?: ContentVersion }) {
  const { t } = useTranslation();
  const [create, createState] = useCreateContentMutation();
  const [update, updateState] = useUpdateContentMutation();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ContentType>((existing?.type as ContentType) ?? 'general');
  const [key, setKey] = useState(existing?.key ?? '');
  const [version, setVersion] = useState(existing?.version ?? '0.1.0');
  const [language, setLanguage] = useState<'' | 'en' | 'rw'>(
    (existing?.language as '' | 'en' | 'rw') ?? 'en',
  );
  const [body, setBody] = useState(existing ? JSON.stringify(existing.body, null, 2) : '{\n  \n}');
  const parsed = parseBody(body);
  const error = createState.error ?? updateState.error;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!parsed) return;
    const result = existing
      ? await update({ id: existing.id, version, body: parsed })
      : await create({ type, key, version, language, body: parsed });
    if (!('error' in result)) {
      toast.success(t('content.saved'));
      setOpen(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {existing ? (
          <Button variant="outline" size="sm">
            <Pencil aria-hidden="true" data-icon="inline-start" />
            {t('content.edit')}
          </Button>
        ) : (
          <Button>
            <Plus aria-hidden="true" data-icon="inline-start" />
            {t('content.new')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>{existing ? t('content.edit') : t('content.new')}</DialogTitle>
            <DialogDescription>{t('content.intro')}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="c-type">{t('content.type')}</FieldLabel>
                <NativeSelect
                  id="c-type"
                  value={type}
                  disabled={Boolean(existing)}
                  onChange={(e) => setType(e.target.value as ContentType)}
                >
                  {CONTENT_TYPES.map((ct) => (
                    <NativeSelectOption key={ct} value={ct}>
                      {ct}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="c-key">{t('content.key')}</FieldLabel>
                <Input
                  id="c-key"
                  value={key}
                  disabled={Boolean(existing)}
                  onChange={(e) => setKey(e.target.value)}
                  pattern="[a-z0-9-]{1,60}"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="c-version">{t('content.version')}</FieldLabel>
                <Input
                  id="c-version"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  pattern="\d+\.\d+\.\d+"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="c-lang">{t('content.language')}</FieldLabel>
                <NativeSelect
                  id="c-lang"
                  value={language}
                  disabled={Boolean(existing)}
                  onChange={(e) =>
                    setLanguage(e.target.value === 'rw' ? 'rw' : e.target.value === 'en' ? 'en' : '')
                  }
                >
                  <NativeSelectOption value="en">{t('language.en')}</NativeSelectOption>
                  <NativeSelectOption value="rw">{t('language.rw')}</NativeSelectOption>
                  <NativeSelectOption value="">{t('content.languageNone')}</NativeSelectOption>
                </NativeSelect>
              </Field>
            </div>
            <Field data-invalid={!parsed}>
              <FieldLabel htmlFor="c-body">{t('content.body')}</FieldLabel>
              <Textarea
                id="c-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                className="font-mono text-sm"
                aria-invalid={!parsed}
              />
              {!parsed ? <FieldError>{t('content.bodyInvalid')}</FieldError> : null}
            </Field>
            <ApiError error={error} />
          </FieldGroup>
          <DialogFooter>
            <Button
              type="submit"
              disabled={!parsed || !key || createState.isLoading || updateState.isLoading}
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({
  item,
  decision,
}: {
  item: ContentVersion;
  decision: 'approved' | 'changes_requested';
}) {
  const { t } = useTranslation();
  const [review, { isLoading, error }] = useReviewContentMutation();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await review({ id: item.id, decision, ...(notes.trim() ? { notes: notes.trim() } : {}) });
    if (!('error' in result)) {
      toast.success(t('content.reviewed'));
      setOpen(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={decision === 'approved' ? 'default' : 'outline'}>
          {decision === 'approved' ? t('content.approve') : t('content.requestChanges')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>
              {decision === 'approved' ? t('content.approve') : t('content.requestChanges')}
            </DialogTitle>
            <DialogDescription>
              {item.key} · {item.version}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor={`notes-${item.id}`}>{t('content.notes')}</FieldLabel>
              <Textarea
                id={`notes-${item.id}`}
                value={notes}
                maxLength={500}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            <ApiError error={error} />
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={isLoading}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ContentCard({ item, role }: { item: ContentVersion; role: Role }) {
  const { t } = useTranslation();
  const [publish, publishState] = usePublishContentMutation();
  const [remove, removeState] = useDeleteContentMutation();
  const isAdmin = role === 'researcher_admin';
  const draft = item.status === 'draft';
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          {item.key} · {item.version}
          <Badge variant={item.status === 'published' ? 'default' : 'outline'}>
            {t(`content.statuses.${item.status}`)}
          </Badge>
        </CardTitle>
        <CardDescription>
          {item.type}
          {item.language ? ` · ${item.language.toUpperCase()}` : ''} · {formatDate(item.updatedAt, true)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {draft ? <p className="text-sm">{t('content.approvals', { count: item.approvedCount })}</p> : null}
        {item.approvals.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {item.approvals.map((a) => (
              <li key={a.approverId}>
                {a.approver}: {t(`content.decisions.${a.decision}`)}
                {a.notes ? ` · ${a.notes}` : ''}
              </li>
            ))}
          </ul>
        ) : null}
        {item.createdByMe && draft ? (
          <p className="text-sm text-muted-foreground">{t('content.yourDraft')}</p>
        ) : null}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="self-start">
              {t('content.body')}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(item.body, null, 2)}
            </pre>
          </CollapsibleContent>
        </Collapsible>
        <ApiError error={publishState.error ?? removeState.error} />
      </CardContent>
      {draft ? (
        <CardFooter className="flex flex-wrap gap-2">
          {!item.createdByMe ? (
            <>
              <ReviewDialog item={item} decision="approved" />
              <ReviewDialog item={item} decision="changes_requested" />
            </>
          ) : null}
          {isAdmin ? (
            <>
              <DraftDialog existing={item} />
              <Button
                size="sm"
                disabled={item.approvedCount < 2}
                onClick={() =>
                  void publish(item.id).then((r) =>
                    !('error' in r) ? toast.success(t('content.published')) : undefined,
                  )
                }
              >
                {t('content.publish')}
              </Button>
              <ConfirmAction
                trigger={
                  <>
                    <Trash2 aria-hidden="true" data-icon="inline-start" />
                    {t('content.delete')}
                  </>
                }
                size="sm"
                title={t('content.delete')}
                description={t('content.deleteConfirm')}
                onConfirm={() => void remove(item.id)}
              />
            </>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}

export function ContentPage({ role }: { role: Role }) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useContentQuery();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={role === 'reviewer' ? t('content.reviewTitle') : t('content.title')}
        description={t('content.intro')}
        actions={role === 'researcher_admin' ? <DraftDialog /> : null}
      />
      <ApiError error={error} />
      {isLoading ? <Skeleton className="h-48" /> : null}
      {data && data.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyDescription>{t('content.empty')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {data?.map((c) => (
          <ContentCard key={c.id} item={c} role={role} />
        ))}
      </div>
    </div>
  );
}
