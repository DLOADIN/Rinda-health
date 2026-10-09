import { SEVERITIES } from '@rinda/rules';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { createStore } from '@/app/store';
import { AppShell } from '@/components/app-shell';
import { BandBadge } from '@/components/band-badge';
import { i18n } from '@/lib/i18n';

describe('BandBadge (FR-10)', () => {
  it.each(SEVERITIES)('%s shows a word and an icon, never colour alone', (severity) => {
    const { container } = render(<BandBadge severity={severity} label={`label-${severity}`} />);
    expect(screen.getByText(`label-${severity}`)).toBeTruthy();
    expect(container.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  });

  it('never uses alarm styling for mental wellness', () => {
    const { container } = render(<BandBadge severity="wellness" label="Support is available" />);
    const cls = container.firstElementChild?.className ?? '';
    expect(cls).toContain('bg-band-wellness');
    expect(cls).not.toMatch(/(^|\s)(bg|text)-(band-urgent|band-confirm|brand-ember|destructive|primary)\b/);
  });
});

function renderShell(path = '/') {
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <p>health content</p> },
          { path: '/exit', element: <p>neutral</p> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <Provider store={createStore()}>
      <RouterProvider router={router} />
    </Provider>,
  );
  return router;
}

describe('AppShell', () => {
  it('shows Get help now and Exit on every screen (FR-06, FR-12)', () => {
    renderShell();
    expect(screen.getByRole('button', { name: 'Get help now' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Exit to a neutral screen' })).toBeTruthy();
  });

  it('Get help now opens the referral list with call links', async () => {
    renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'Get help now' }));
    const links = await screen.findAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(
      expect.arrayContaining(['tel:112', 'tel:114', 'tel:912']),
    );
  });

  it('Exit replaces the history entry with the neutral screen (FR-42)', async () => {
    const router = renderShell();
    await userEvent.click(screen.getByRole('button', { name: 'Exit to a neutral screen' }));
    expect(router.state.location.pathname).toBe('/exit');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.queryByText('health content')).toBeNull();
  });

  it('switches language and sets <html lang> (FR-21)', async () => {
    renderShell();
    await userEvent.click(screen.getByRole('radio', { name: 'Ikinyarwanda' }));
    expect(document.documentElement.lang).toBe('rw');
    await i18n.changeLanguage('en');
  });
});

describe('RouteError (FR-12)', () => {
  it('a crashing screen still offers Get help now', async () => {
    const { RouteError } = await import('@/features/errors/route-error');
    function Boom(): never {
      throw new Error('boom');
    }
    const router = createMemoryRouter([
      { path: '/', element: <Boom />, errorElement: <RouteError standalone /> },
    ]);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <Provider store={createStore()}>
        <RouterProvider router={router} />
      </Provider>,
    );
    expect(await screen.findByRole('button', { name: 'Get help now' })).toBeTruthy();
    expect(screen.queryByText('boom')).toBeNull();
    spy.mockRestore();
  });
});
