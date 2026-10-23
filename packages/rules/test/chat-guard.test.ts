import { describe, expect, it } from 'vitest';
import { checkChatQuestion } from '../src/index.ts';

describe('checkChatQuestion', () => {
  it.each([
    'I want to kill myself',
    'thinking about suicide',
    'I keep hurting myself',
    'I want to die',
    'is an overdose dangerous',
    'there is no reason to live',
  ])('stops "%s" before it is sent', (q) => {
    expect(checkChatQuestion(q)).toBe('crisis');
  });

  it.each(['call me on 0788 123 456', 'my email is a.b@gmail.com', '+250 788 123 456', '1199880012345678'])(
    'refuses personal details in "%s"',
    (q) => {
      expect(checkChatQuestion(q)).toBe('personal');
    },
  );

  it.each(['How can I walk more?', 'Is 140 over 90 high?', 'What does below recommended mean?'])(
    'lets "%s" through',
    (q) => {
      expect(checkChatQuestion(q)).toBe('ok');
    },
  );

  it('treats an empty question as empty', () => {
    expect(checkChatQuestion('  ')).toBe('empty');
  });
});
