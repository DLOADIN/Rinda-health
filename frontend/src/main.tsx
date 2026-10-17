import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router';
import { router } from '@/app/router';
import { store } from '@/app/store';
import { Toaster } from '@/components/ui/sonner';
import '@/lib/i18n';
import '@/lib/install';
import { initTheme } from '@/lib/theme';
import './index.css';

initTheme();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Provider store={store}>
        <RouterProvider router={router} />
        <Toaster />
      </Provider>
    </StrictMode>,
  );
}
