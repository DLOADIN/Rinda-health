import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { AppShell } from '@/components/app-shell';
import { Spinner } from '@/components/ui/spinner';
import { RouteError } from '@/features/errors/route-error';
import { NeutralScreen } from '@/features/exit/neutral-screen';
import { UpdatePrompt } from '@/features/sync/update-prompt';
import { PublicShell } from '@/features/landing/public-shell';

const LandingPage = lazy(() =>
  import('@/features/landing/landing-page').then((m) => ({ default: m.LandingPage })),
);
const SetupPage = lazy(() => import('@/features/setup/setup-page').then((m) => ({ default: m.SetupPage })));
const LoginPage = lazy(() => import('@/features/auth/login-page').then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import('@/features/auth/signup-page').then((m) => ({ default: m.SignupPage })));
const PrivacyPage = lazy(() =>
  import('@/features/landing/landing-page').then((m) => ({ default: m.PrivacyPage })),
);
const DashboardLayout = lazy(() =>
  import('@/features/dashboard/dashboard-layout').then((m) => ({ default: m.DashboardLayout })),
);

const wait = (node: ReactNode) => <Suspense fallback={<Spinner className="mx-auto my-8" />}>{node}</Suspense>;

function PublicLayout() {
  return (
    <>
      <UpdatePrompt />
      <Outlet />
    </>
  );
}

export const router = createBrowserRouter([
  {
    element: <PublicShell />,
    errorElement: <RouteError standalone />,
    children: [
      {
        element: <PublicLayout />,
        errorElement: <RouteError />,
        children: [
          { path: '/', element: wait(<LandingPage />) },
          { path: '/login', element: wait(<LoginPage />) },
          { path: '/signup', element: wait(<SignupPage />) },
          { path: '/setup/:code', element: wait(<SetupPage />) },
          { path: '/privacy', element: wait(<PrivacyPage />) },
        ],
      },
    ],
  },
  {
    element: <AppShell />,
    errorElement: <RouteError standalone />,
    children: [
      {
        element: <PublicLayout />,
        errorElement: <RouteError />,
        children: [
          { path: '/exit', element: <NeutralScreen /> },
          { path: '*', element: <NeutralScreen /> },
        ],
      },
    ],
  },
  { path: '/app/*', element: wait(<DashboardLayout />), errorElement: <RouteError standalone /> },
  { path: '/staff/*', element: <Navigate to="/app" replace /> },
]);
