import { describe, expect, it } from 'vitest';
import { checkChatQuestion } from '../src/index.ts';

describe('checkChatQuestion', () => {
  it.each([
    'I want to kill myself',
    'thinking about suicide',
    'I keep hurting myself',
    'I want to die',
    'I wanna die',
    'i wannnna diiiie',
    'I killed myself once almost',
    'I want to end it',
    'ending it all tonight',
    'I will end my own life',
    'I want to take my life',
    'kms',
    'I want to unalive myself',
    'I don’t want to live anymore',
    "I don't want to be here anymore",
    'I am tired of living',
    'life isn’t worth it',
    'there is nothing to live for',
    'there is no reason to live',
    'no point living',
    'I can’t go on',
    'everyone is better off without me',
    'I wish I was dead',
    'I would rather be dead',
    'how to hang myself',
    'I will jump off the bridge',
    'where to buy rat poison',
    'I will take all my pills',
    'I took an overdose',
    'overdosing on pills',
    'he raped me',
    'my husband beats me',
    'my partner hits me',
    'he abuses me',
    'I was sexually assaulted',
    'I live with an abusive partner',
    'they forced me',
    'there is domestic violence at home',
  ])('stops "%s" before it is sent', (q) => {
    expect(checkChatQuestion(q)).toBe('crisis');
  });

  it.each(['call me on 0788 123 456', 'my email is a.b@gmail.com', '+250 788 123 456', '1199880012345678'])(
    'refuses personal details in "%s"',
    (q) => {
      expect(checkChatQuestion(q)).toBe('personal');
    },
  );

  it.each(['I feel so stressed', 'my anxiety is bad', 'I am depressed', 'how is my mood', 'I feel lonely'])(
    'keeps "%s" away from the model',
    (q) => {
      expect(checkChatQuestion(q)).toBe('wellness');
    },
  );

  it.each([
    'How can I walk more?',
    'Is 140 over 90 high?',
    'What does below recommended mean?',
    'Is binge drinking alcohol abuse?',
    'Am I going to die from high blood pressure?',
    "I don't want to die young",
    'My knees are killing me after running',
    "I've beaten my smoking habit",
    'Can I overdose on caffeine?',
  ])('lets "%s" through', (q) => {
    expect(checkChatQuestion(q)).toBe('ok');
  });

  it('treats an empty question as empty', () => {
    expect(checkChatQuestion('  ')).toBe('empty');
  });
});
