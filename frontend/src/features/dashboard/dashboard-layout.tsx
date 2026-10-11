import type { Me, Role } from '@rinda/schemas';
import { CirclePlus, CloudUpload, DoorOpen, EllipsisVertical, LogOut, UserRound } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router';
import { clearSession } from '@/app/store';
import { useEscapeTwiceToExit, useQuickExit } from '@/components/app-shell';
import { GetHelp } from '@/components/get-help';
import { LanguageSwitch } from '@/components/language-switch';
import { OfflineBadge } from '@/components/offline-badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Spinner } from '@/components/ui/spinner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { HomePage } from '@/features/dashboard/home-page';
import { NAV, type NavItem } from '@/features/dashboard/nav';
import { ProfilePage } from '@/features/profile/profile-page';
import { UpdatePrompt } from '@/features/sync/update-prompt';
import {
  api,
  errorCode,
  useConsentsQuery,
  useLogoutMutation,
  useMeQuery,
  useUpdateMeMutation,
} from '@/lib/api';
import { useCached } from '@/lib/use-cached';
import { displayNameOf, initialsOf } from '@/lib/me';
import { flushOutbox, useOutbox, useOutboxSync } from '@/lib/offline';
import { clearPersonalCache, readSecret, saveSecret } from '@/lib/storage/vault';
import { Badge } from '@/components/ui/badge';

const ParticipantRoutes = lazy(() => import('@/features/participant/participant-routes'));
const StaffRoutes = lazy(() => import('@/features/staff/staff-routes'));
const ConsentPage = lazy(() =>
  import('@/features/consent/consent-page').then((m) => ({ default: m.ConsentPage })),
);

// Participants see the purpose, age check and consent choices before any health question.
function ConsentGate({ me, children }: { me: Me; children: ReactNode }) {
  const { t } = useTranslation();
  const isParticipant = me.role === 'participant';
  const { data: live, error } = useConsentsQuery(undefined, { skip: !isParticipant });
  const { data } = useCached(isParticipant ? `consents:${me.id}` : null, live, error);
  if (!isParticipant) return children;
  if (!data) {
    return error ? (
      <p className="mx-auto max-w-prose text-center text-muted-foreground">{t('consent.needConnection')}</p>
    ) : (
      <Spinner className="mx-auto" />
    );
  }
  return data.decided && data.core ? children : <ConsentPage />;
}

const QUICK_ACTION: Record<Role, { to: string; labelKey: string }> = {
  participant: { to: '/app/checkup', labelKey: 'dashboard.startCheckup' },
  facilitator: { to: '/app/sessions', labelKey: 'sessions.new' },
  researcher_admin: { to: '/app/users', labelKey: 'users.add' },
  reviewer: { to: '/app/content', labelKey: 'nav.reviews' },
};

function useCloseOnPhone() {
  const { isMobile, setOpenMobile } = useSidebar();
  return () => {
    if (isMobile) setOpenMobile(false);
  };
}

function NavItems({ items }: { items: NavItem[] }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const close = useCloseOnPhone();
  return (
    <SidebarMenu>
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          item.to === '/app' ? pathname === '/app' || pathname === '/app/' : pathname.startsWith(item.to);
        return (
          <SidebarMenuItem key={item.to}>
            <SidebarMenuButton asChild isActive={active} tooltip={t(item.labelKey)} className="h-11">
              <NavLink to={item.to} end={item.to === '/app'} onClick={close}>
                <Icon aria-hidden="true" />
                <span>{t(item.labelKey)}</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

function NavUser({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isMobile } = useSidebar();
  const close = useCloseOnPhone();
  const name = displayNameOf(me) ?? me.phone ?? '';
  const contact = me.email ?? me.phone ?? '';
  const identity = (
    <>
      <Avatar className="size-8 rounded-lg">
        <AvatarFallback className="rounded-lg bg-primary text-primary-foreground">
          {initialsOf(me)}
        </AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{name}</span>
        <span className="truncate text-xs text-muted-foreground">{contact}</span>
      </div>
    </>
  );
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label={t('nav.account')}
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {identity}
              <EllipsisVertical aria-hidden="true" className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5">{identity}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="min-h-11"
              onSelect={() => {
                close();
                void navigate('/app/profile');
              }}
            >
              <UserRound aria-hidden="true" />
              {t('nav.profile')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-11" onSelect={onSignOut}>
              <LogOut aria-hidden="true" />
              {t('nav.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function AppSidebar({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const { t } = useTranslation();
  const close = useCloseOnPhone();
  const items = NAV[me.role];
  const main = items.filter((i) => i.to !== '/app/profile' && i.to !== '/app/help');
  const secondary = items.filter((i) => i.to === '/app/profile' || i.to === '/app/help');
  const quick = QUICK_ACTION[me.role];
  return (
    <Sidebar collapsible="offcanvas" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <NavLink to="/app" onClick={close}>
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-base font-semibold text-primary-foreground">
                  {t('app.name').charAt(0)}
                </span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="text-base font-semibold text-brand-ember-strong">{t('app.name')}</span>
                  <span className="truncate text-xs text-muted-foreground">{t(`auth.roles.${me.role}`)}</span>
                </span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent className="flex flex-col gap-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip={t(quick.labelKey)}
                  className="h-11 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
                >
                  <NavLink to={quick.to} onClick={close}>
                    <CirclePlus aria-hidden="true" />
                    <span>{t(quick.labelKey)}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <NavItems items={main} />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <NavItems items={secondary} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser me={me} onSignOut={onSignOut} />
      </SidebarFooter>
    </Sidebar>
  );
}

function SiteHeader({ me, onExit, onSent }: { me: Me; onExit: () => void; onSent: () => void }) {
  const { t } = useTranslation();
  const outbox = useOutbox();
  const { pathname } = useLocation();
  const [updateMe] = useUpdateMeMutation();
  const current = [...NAV[me.role]]
    .sort((a, b) => b.to.length - a.to.length)
    .find((i) => (i.to === '/app' ? pathname === '/app' || pathname === '/app/' : pathname.startsWith(i.to)));
  return (
    <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur md:rounded-t-xl">
      <div className="flex w-full items-center gap-1 px-2 sm:px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="size-11" aria-label={t('nav.menu')} />
        <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
        <h1 className="truncate text-base font-medium">{current ? t(current.labelKey) : t('app.name')}</h1>
        <div className="ml-auto flex items-center gap-2">
          {outbox.count > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="h-11"
              disabled={outbox.sending}
              onClick={() => void flushOutbox(me).then((n) => (n > 0 ? onSent() : undefined))}
            >
              <CloudUpload aria-hidden="true" data-icon="inline-start" />
              <span className="hidden md:inline">
                {outbox.sending ? t('offline.sending') : t('offline.waiting', { count: outbox.count })}
              </span>
              <Badge variant="secondary" className="md:hidden">
                {outbox.count}
              </Badge>
              <span className="sr-only md:hidden">{t('offline.sendNow')}</span>
            </Button>
          ) : null}
          <LanguageSwitch onChange={(lang) => void updateMe({ preferredLanguage: lang })} />
          {me.role === 'participant' ? (
            <Button variant="outline" onClick={onExit} aria-label={t('shell.exitLabel')}>
              <DoorOpen aria-hidden="true" data-icon="inline-start" />
              <span className="hidden sm:inline">{t('shell.exit')}</span>
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function Shell({ me }: { me: Me }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { pathname } = useLocation();
  const [logout] = useLogoutMutation();
  const quickExit = useQuickExit();
  const isParticipant = me.role === 'participant';
  useEscapeTwiceToExit(isParticipant ? quickExit : () => undefined);

  const onSent = useCallback(() => {
    dispatch(api.util.invalidateTags(['Assessments', 'Dashboard']));
  }, [dispatch]);
  useOutboxSync(me, onSent);

  const signOut = async () => {
    await logout();
    await clearPersonalCache();
    dispatch(api.util.resetApiState());
    dispatch(clearSession);
    void navigate('/login', { replace: true });
  };

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 64)',
          '--header-height': 'calc(var(--spacing) * 14)',
        } as CSSProperties
      }
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-md focus:bg-card focus:p-2"
      >
        {t('app.skipToContent')}
      </a>
      <AppSidebar me={me} onSignOut={() => void signOut()} />
      <SidebarInset className="bg-mesh">
        <SiteHeader me={me} onExit={quickExit} onSent={onSent} />
        <main
          id="main"
          className="@container/main flex flex-1 flex-col gap-6 p-4 pb-24 break-words md:p-6 md:pb-6"
        >
          <OfflineBadge />
          {pathname.startsWith('/app/checkup') ? null : <UpdatePrompt />}
          <Suspense fallback={<Spinner className="mx-auto" />}>
            <ConsentGate me={me}>
              <Routes>
                <Route index element={<HomePage me={me} />} />
                <Route path="profile" element={<ProfilePage me={me} onSignOut={() => void signOut()} />} />
                <Route
                  path="*"
                  element={isParticipant ? <ParticipantRoutes /> : <StaffRoutes role={me.role} />}
                />
              </Routes>
            </ConsentGate>
          </Suspense>
        </main>
      </SidebarInset>
      {isParticipant ? (
        <div className="fixed right-4 bottom-4 z-40 pb-[env(safe-area-inset-bottom)]">
          <GetHelp variant="floating" />
        </div>
      ) : null}
    </SidebarProvider>
  );
}

export function DashboardLayout() {
  const { i18n } = useTranslation();
  const { data: live, isLoading, isError, error } = useMeQuery();
  const [offlineMe, setOfflineMe] = useState<Me | null>(null);
  const offline = isError && errorCode(error) === 'OFFLINE';
  useEffect(() => {
    if (live) void saveSecret('cache:me', live);
    else if (offline) void readSecret<Me>('cache:me').then(setOfflineMe);
  }, [live, offline]);
  const me = live ?? offlineMe ?? undefined;
  useEffect(() => {
    if (me && i18n.language !== me.preferredLanguage) void i18n.changeLanguage(me.preferredLanguage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);
  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Spinner />
      </div>
    );
  }
  if (offline && !me) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Spinner />
      </div>
    );
  }
  if (!me) return <Navigate to="/login" replace />;
  return (
    <TooltipProvider>
      <Shell me={me} />
    </TooltipProvider>
  );
}
