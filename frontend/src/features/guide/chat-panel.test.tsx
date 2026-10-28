import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import ChatPanel from '@/features/guide/chat-panel';
import '@/lib/i18n';

const setup = () => {
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Response(JSON.stringify({ available: true, turnsLeft: 15 })));
  render(
    <MemoryRouter>
      <ChatPanel
        assessmentId={null}
        staff={false}
        language="en"
        chipLabel={(id) => id}
        onClose={() => undefined}
      />
    </MemoryRouter>,
  );
  return fetchSpy;
};

const posts = (spy: ReturnType<typeof setup>) =>
  spy.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST');

describe('ChatPanel', () => {
  it('opens the safety screen for a crisis phrase and sends nothing', async () => {
    const spy = setup();
    expect(screen.getByRole('button', { name: /Get help now/ })).toBeTruthy();
    await userEvent.type(screen.getByRole('textbox', { name: 'Your question' }), 'I want to end it all');
    await userEvent.click(screen.getByRole('button', { name: 'Send question' }));
    expect(screen.getByRole('region')).toBeTruthy();
    expect(posts(spy)).toHaveLength(0);
    spy.mockRestore();
  });

  it('answers mood and stress questions on the phone without sending them', async () => {
    const spy = setup();
    await userEvent.type(screen.getByRole('textbox', { name: 'Your question' }), 'I feel so stressed');
    await userEvent.click(screen.getByRole('button', { name: 'Send question' }));
    expect(screen.getByText(/I can only help with questions about Rinda Health/)).toBeTruthy();
    expect(posts(spy)).toHaveLength(0);
    spy.mockRestore();
  });
});
