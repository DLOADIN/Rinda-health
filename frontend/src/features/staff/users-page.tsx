import { ROLES, type Role } from '@rinda/schemas';
import { Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ApiError } from '@/components/api-error';
import { ConfirmAction } from '@/components/confirm-action';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useCreateUserMutation,
  useDeleteUserMutation,
  useUpdateUserMutation,
  useUsersQuery,
  type AdminUser,
} from '@/lib/api';
import { formatDate } from '@/lib/format';

function AddUserDialog() {
  const { t } = useTranslation();
  const [create, { isLoading, error }] = useCreateUserMutation();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>('facilitator');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await create({
      role,
      identifier,
      password,
      ...(name.trim() ? { displayName: name.trim() } : {}),
    });
    if (!('error' in result)) {
      toast.success(t('users.created'));
      setOpen(false);
      setIdentifier('');
      setPassword('');
      setName('');
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden="true" data-icon="inline-start" />
          {t('users.add')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={(e) => void submit(e)}>
          <DialogHeader>
            <DialogTitle>{t('users.add')}</DialogTitle>
            <DialogDescription>{t('auth.signupSubtitle')}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="u-role">{t('users.role')}</FieldLabel>
              <NativeSelect id="u-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {ROLES.map((r) => (
                  <NativeSelectOption key={r} value={r}>
                    {t(`auth.roles.${r}`)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="u-name">{t('users.name')}</FieldLabel>
              <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="u-id">{t('auth.identifier')}</FieldLabel>
              <Input id="u-id" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
              <FieldDescription>{t('auth.identifierHint')}</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="u-pw">{t('auth.password')}</FieldLabel>
              <Input
                id="u-pw"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
              <FieldDescription>{t('auth.passwordHint')}</FieldDescription>
            </Field>
            <ApiError error={error} />
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={isLoading || password.length < 8 || !identifier}>
              {t('common.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserRow({ user, isMe }: { user: AdminUser; isMe: boolean }) {
  const { t } = useTranslation();
  const [update, { error }] = useUpdateUserMutation();
  const [remove, { error: removeError }] = useDeleteUserMutation();
  const change = async (patch: { role?: Role; active?: boolean }) => {
    if (!('error' in (await update({ id: user.id, ...patch })))) toast.success(t('users.updated'));
  };
  const failure = error ?? removeError;
  return (
    <>
      <TableRow>
        <TableCell className="pl-4">
          <div className="flex flex-col">
            <span className="font-medium">{user.displayName ?? user.email ?? user.phone}</span>
            <span className="text-sm text-muted-foreground">{user.email ?? user.phone}</span>
          </div>
        </TableCell>
        <TableCell>
          <NativeSelect
            aria-label={t('users.role')}
            value={user.role}
            disabled={isMe}
            onChange={(e) => void change({ role: e.target.value as Role })}
            className="min-w-36"
          >
            {ROLES.map((r) => (
              <NativeSelectOption key={r} value={r}>
                {t(`auth.roles.${r}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </TableCell>
        <TableCell className="hidden sm:table-cell">
          <div className="flex min-h-11 items-center gap-2">
            <Switch
              id={`active-${user.id}`}
              checked={user.active}
              disabled={isMe}
              onCheckedChange={(v) => void change({ active: v })}
              aria-label={user.active ? t('users.turnOff') : t('users.turnOn')}
            />
            <span className="text-sm">{user.active ? t('users.active') : t('users.inactive')}</span>
          </div>
        </TableCell>
        <TableCell className="hidden lg:table-cell">
          {user.lastSignInAt ? formatDate(user.lastSignInAt, true) : t('users.never')}
        </TableCell>
        <TableCell className="pr-4 text-right">
          <ConfirmAction
            trigger={<Trash2 aria-hidden="true" />}
            label={t('users.delete')}
            size="icon-touch"
            disabled={isMe}
            title={t('users.delete')}
            description={t('users.deleteConfirm')}
            onConfirm={() =>
              void remove(user.id).then((r) =>
                !('error' in r) ? toast.success(t('users.deleted')) : undefined,
              )
            }
          />
        </TableCell>
      </TableRow>
      {failure ? (
        <TableRow>
          <TableCell colSpan={5} className="px-4">
            <ApiError error={failure} />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

export function UsersPage({ meId }: { meId: string }) {
  const { t } = useTranslation();
  const [role, setRole] = useState<Role | ''>('');
  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useUsersQuery({
    ...(role ? { role } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('users.title')} actions={<AddUserDialog />} />
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          aria-label={t('users.search')}
          placeholder={t('users.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <NativeSelect
          aria-label={t('users.role')}
          value={role}
          onChange={(e) => setRole(e.target.value as Role | '')}
          className="sm:w-56"
        >
          <NativeSelectOption value="">{t('users.allRoles')}</NativeSelectOption>
          {ROLES.map((r) => (
            <NativeSelectOption key={r} value={r}>
              {t(`auth.roles.${r}`)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <ApiError error={error} />
      {isLoading ? <Skeleton className="h-48" /> : null}
      {data ? (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">{t('users.name')}</TableHead>
                  <TableHead>{t('users.role')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('users.status')}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t('users.lastSignIn')}</TableHead>
                  <TableHead className="pr-4 text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="p-4 text-muted-foreground">
                      {t('users.empty')}
                    </TableCell>
                  </TableRow>
                ) : null}
                {data.map((u) => (
                  <UserRow key={u.id} user={u} isMe={u.id === meId} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
