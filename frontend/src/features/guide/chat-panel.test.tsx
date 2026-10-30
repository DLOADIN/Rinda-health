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
      <ChatPanel assessmentId={null} staff={false} language="en" onClose={() => undefined} />
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

describe('ChatPanel feedback', () => {
  it('asks whether a chat answer helped and sends the vote for that answer', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if ((init as RequestInit | undefined)?.method !== 'POST')
        return new Response(JSON.stringify({ available: true, turnsLeft: 15 }));
      if (String(_url).includes('/guide/feedback')) return new Response(null, { status: 204 });
      return new Response(
        JSON.stringify({
          status: 'answered',
          paragraphs: [{ text: 'Short walks count.', sourceIds: ['guide.tpl.first_step'] }],
          turnsLeft: 14,
          requestId: 'req-1',
        }),
      );
    });
    render(
      <MemoryRouter>
        <ChatPanel assessmentId={null} staff={false} language="en" onClose={() => undefined} />
      </MemoryRouter>,
    );
    expect(screen.queryByText('Was this helpful?')).toBeNull();
    await userEvent.type(screen.getByRole('textbox', { name: 'Your question' }), 'How can I walk more?');
    await userEvent.click(screen.getByRole('button', { name: 'Send question' }));
    await screen.findByText('Short walks count.');
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
    const vote = posts(spy).find(([url]) => String(url).includes('/guide/feedback'));
    expect(JSON.parse(String((vote?.[1] as RequestInit).body))).toEqual({
      requestId: 'req-1',
      helpful: true,
    });
    expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull();
    spy.mockRestore();
  });
});
