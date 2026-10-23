import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { GuideButton } from '@/features/guide/guide-button';
import '@/lib/i18n';

vi.mock('@/features/guide/guide-panel', () => ({
  default: () => {
    throw new Error('chunk failed to load');
  },
}));

describe('GuideButton when the guide cannot open', () => {
  it('stays a small message with a way back to the dashboard', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <MemoryRouter initialEntries={['/app/results']}>
        <Routes>
          <Route path="/app/results" element={<GuideButton assessment={null} />} />
          <Route path="/app" element={<p>Dashboard home</p>} />
        </Routes>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ask Rinda' }));
    expect((await screen.findByRole('alert')).textContent).toContain('cannot answer right now');
    await userEvent.click(screen.getByRole('button', { name: 'Back to my dashboard' }));
    expect(screen.getByText('Dashboard home')).toBeTruthy();
  });
});
