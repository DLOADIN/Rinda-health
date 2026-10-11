// Item 9 (FR-11, docs/SAFETY.md): 1, 2 and 3 open the safety screen synchronously, before any network call; 0 does
// not. The safety screen shows the referral list and uses calm styling only.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SafetyScreen, WellnessSection, WELLNESS_START } from '@/features/participant/wellness-section';
import '@/lib/i18n';

const answering = { ...WELLNESS_START, mode: 'answering' as const };

describe('WellnessSection item 9', () => {
  it.each([1, 2, 3])('answer %i opens the safety screen before any network call', async (value) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const onItem9Risk = vi.fn();
    const { container } = render(
      <WellnessSection state={answering} onChange={() => undefined} onItem9Risk={onItem9Risk} />,
    );
    const option = container.querySelector<HTMLElement>(`#phq9-9-${value}`);
    expect(option).toBeTruthy();
    if (option) await userEvent.click(option);
    expect(onItem9Risk).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('answer 0, and every other item, never opens it', async () => {
    const onItem9Risk = vi.fn();
    const { container } = render(
      <WellnessSection state={answering} onChange={() => undefined} onItem9Risk={onItem9Risk} />,
    );
    for (const id of ['#phq9-9-0', '#phq9-1-3', '#gad7-7-3']) {
      const option = container.querySelector<HTMLElement>(id);
      if (option) await userEvent.click(option);
    }
    expect(onItem9Risk).not.toHaveBeenCalled();
  });

  it('nothing is preselected and every item can be skipped', () => {
    const { container } = render(
      <WellnessSection state={answering} onChange={() => undefined} onItem9Risk={() => undefined} />,
    );
    expect(container.querySelectorAll('[role="radio"][data-state="checked"]')).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /skip this question/i })).toHaveLength(16);
  });
});

describe('SafetyScreen', () => {
  it('shows call links and lets the person stop, with calm styling', () => {
    const { container } = render(<SafetyScreen onStop={() => undefined} onContinue={() => undefined} />);
    expect(container.querySelectorAll('a[href^="tel:"]').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /stop these questions/i })).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/[\s"](bg|text|border)-(band-urgent|destructive|brand-ember)\b/);
  });
});
