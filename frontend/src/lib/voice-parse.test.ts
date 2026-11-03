import { describe, expect, it } from 'vitest';
import {
  looksOffTopic,
  readBloodPressure,
  readChoice,
  readCommand,
  readNumber,
  readQuestionChoice,
  readYesNo,
} from '@/lib/voice-parse';

const drinksOften = [
  'Never',
  'Monthly or less',
  '2 to 4 times a month',
  '2 to 3 times a week',
  '4 or more times a week',
];
const drinksPerDay = ['1 or 2', '3 or 4', '5 or 6', '7 to 9', '10 or more'];
const howOften = ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'];

describe('readCommand', () => {
  it('hears skip, repeat, back and send', () => {
    expect(readCommand('Skip this one please')).toBe('skip');
    expect(readCommand("I'd rather not say")).toBe('skip');
    expect(readCommand('Can you repeat that?')).toBe('repeat');
    expect(readCommand('go back')).toBe('back');
    expect(readCommand('Send it')).toBe('send');
    expect(readCommand('thirty minutes')).toBeNull();
  });
});

describe('readYesNo', () => {
  it('understands plain and everyday answers', () => {
    expect(readYesNo('Yes')).toBe(true);
    expect(readYesNo('yeah I do')).toBe(true);
    expect(readYesNo('No.')).toBe(false);
    expect(readYesNo('I do not smoke')).toBe(false);
    expect(readYesNo("I don't")).toBe(false);
    expect(readYesNo('never')).toBe(false);
  });

  it('gives nothing when unsure, so nothing is guessed', () => {
    expect(readYesNo("I don't know")).toBeNull();
    expect(readYesNo('maybe')).toBeNull();
    expect(readYesNo('banana')).toBeNull();
  });
});

describe('readNumber', () => {
  it('reads digits and spoken numbers', () => {
    expect(readNumber('150')).toBe(150);
    expect(readNumber('about 1,200')).toBe(1200);
    expect(readNumber('seventy two point five')).toBe(72.5);
    expect(readNumber('one hundred and twenty')).toBe(120);
    expect(readNumber('a hundred')).toBe(100);
    expect(readNumber('sixty-five kilos')).toBe(65);
    expect(readNumber('none')).toBe(0);
    expect(readNumber('I am not sure')).toBeNull();
  });

  it('turns hours into minutes when minutes are asked for', () => {
    expect(readNumber('two hours', 'minutes')).toBe(120);
    expect(readNumber('two and a half hours', 'minutes')).toBe(150);
    expect(readNumber('an hour', 'minutes')).toBe(60);
    expect(readNumber('half an hour', 'minutes')).toBe(30);
    expect(readNumber('45 minutes', 'minutes')).toBe(45);
  });
});

describe('readChoice', () => {
  it('matches the words of an option', () => {
    expect(readChoice('never', drinksOften)).toBe(0);
    expect(readChoice('monthly or less', drinksOften)).toBe(1);
    expect(readChoice('about three times a week', drinksOften)).toBe(3);
    expect(readChoice('several days', howOften)).toBe(1);
  });

  it('matches a spoken number to the range it falls in', () => {
    expect(readChoice('three', drinksPerDay)).toBe(1);
    expect(readChoice('about eight drinks', drinksPerDay)).toBe(3);
    expect(readChoice('twelve', drinksPerDay)).toBe(4);
  });

  it('understands everyday words and option numbers', () => {
    expect(readChoice('always', howOften)).toBe(3);
    expect(readChoice('never', howOften)).toBe(0);
    expect(readChoice('sometimes', howOften)).toBe(1);
    expect(readChoice('option two', howOften)).toBe(1);
    expect(readChoice('the last one', howOften)).toBe(3);
  });

  it('gives nothing when the answer is unclear', () => {
    expect(readChoice('hmm', howOften)).toBeNull();
    expect(readChoice('times', drinksOften)).toBeNull();
  });
});

describe('every check-up question, answered in everyday words', () => {
  const ask = (id: string, labels: readonly string[], said: string) => readQuestionChoice(id, said, labels);
  const thirdQ = ['Never', 'Less than monthly', 'Monthly', 'Weekly', 'Daily or almost daily'];
  const source = ['Taken today', 'From memory or a recent reading'];

  it('how often you drink (AUDIT-C 1)', () => {
    const cases: Array<[string, number]> = [
      ['I never drink', 0],
      ["I don't drink", 0],
      ['no', 0],
      ['once a month', 1],
      ['rarely', 1],
      ['a few times a year', 1],
      ['monthly', 1],
      ['2 or 3 months', 2],
      ['two or three times a month', 2],
      ['twice a month', 2],
      ['every two weeks', 2],
      ['once a week', 2],
      ['2 to 3 times a week', 3],
      ['two three times a week', 3],
      ['2-3 times a week', 3],
      ['every weekend', 3],
      ['four times a week', 4],
      ['every day', 4],
      ['almost daily', 4],
      ['option 3', 2],
    ];
    for (const [said, want] of cases)
      expect([said, ask('q.auditc.1', drinksOften, said)]).toEqual([said, want]);
  });

  it('how many drinks on a typical day (AUDIT-C 2)', () => {
    const cases: Array<[string, number]> = [
      ['one', 0],
      ['one or two', 0],
      ['two drinks', 0],
      ['two or three', 1],
      ['3 or 4 beers', 1],
      ['five', 2],
      ['about six bottles', 2],
      ['eight', 3],
      ['ten or more', 4],
      ['like fifteen', 4],
    ];
    for (const [said, want] of cases)
      expect([said, ask('q.auditc.2', drinksPerDay, said)]).toEqual([said, want]);
  });

  it('six or more drinks at once (AUDIT-C 3)', () => {
    const cases: Array<[string, number]> = [
      ['never', 0],
      ['a few times a year', 1],
      ['less than monthly', 1],
      ['once a month', 2],
      ['monthly', 2],
      ['two or three times a month', 2],
      ['weekly', 3],
      ['every weekend', 3],
      ['once a week', 3],
      ['every day', 4],
      ['almost every day', 4],
    ];
    for (const [said, want] of cases) expect([said, ask('q.auditc.3', thirdQ, said)]).toEqual([said, want]);
  });

  it('the last two weeks (PHQ-9 and GAD-7)', () => {
    const cases: Array<[string, number]> = [
      ['not at all', 0],
      ['no', 0],
      ['never', 0],
      ['not really', 0],
      ['several days', 1],
      ['sometimes', 1],
      ['a few days', 1],
      ['three days', 1],
      ['once or twice', 1],
      ['not very often', 1],
      ['more than half the days', 2],
      ['most days', 2],
      ['often', 2],
      ['about ten days', 2],
      ['nearly every day', 3],
      ['every day', 3],
      ['all the time', 3],
      ['always', 3],
    ];
    for (const [said, want] of cases) {
      expect([said, ask('q.phq9.1', howOften, said)]).toEqual([said, want]);
      expect([said, ask('q.gad7.3', howOften, said)]).toEqual([said, want]);
    }
  });

  it('where the body measurements come from', () => {
    expect(ask('voice.source', source, 'taken today')).toBe(0);
    expect(ask('voice.source', source, 'I measured it just now')).toBe(0);
    expect(ask('voice.source', source, 'from memory')).toBe(1);
    expect(ask('voice.source', source, 'a recent reading at the clinic')).toBe(1);
    expect(ask('voice.source', source, 'last week')).toBe(1);
  });

  it('minutes of activity a week', () => {
    expect(readNumber('150 minutes', 'minutes')).toBe(150);
    expect(readNumber('an hour and a half', 'minutes')).toBe(90);
    expect(readNumber('30 minutes a day', 'minutes')).toBe(210);
    expect(readNumber('thirty minutes every day', 'minutes')).toBe(210);
    expect(readNumber('an hour three times a week', 'minutes')).toBe(180);
    expect(readNumber('one hour 3 days a week', 'minutes')).toBe(180);
    expect(readNumber('two hours and 30 minutes', 'minutes')).toBe(150);
    expect(readNumber('none', 'minutes')).toBe(0);
    expect(readNumber("I don't do any", 'minutes')).toBe(0);
  });

  it('servings, height, weight, waist and blood pressure', () => {
    expect(readNumber('two or three servings')).toBe(2);
    expect(readNumber('five')).toBe(5);
    expect(readNumber('170', 'height')).toBe(170);
    expect(readNumber('one seventy', 'height')).toBe(170);
    expect(readNumber('one seventy five centimetres', 'height')).toBe(175);
    expect(readNumber('1.75 metres', 'height')).toBe(175);
    expect(readNumber('one metre seventy', 'height')).toBe(170);
    expect(readNumber('seventy two kilos')).toBe(72);
    expect(readNumber('eighty five centimetres')).toBe(85);
    expect(readNumber('one twenty')).toBe(120);
    expect(readNumber('a hundred and thirty')).toBe(130);
    expect(readBloodPressure('120 over 80')).toEqual({ systolic: 120, diastolic: 80 });
    expect(readBloodPressure('one twenty over eighty')).toEqual({ systolic: 120, diastolic: 80 });
    expect(readBloodPressure('120')).toBeNull();
  });

  it('yes and no in everyday words', () => {
    expect(readYesNo('yes I smoke')).toBe(true);
    expect(readYesNo('I chew tobacco sometimes')).toBe(true);
    expect(readYesNo('I add a little salt')).toBe(true);
    expect(readYesNo('no I do not')).toBe(false);
    expect(readYesNo('I stopped, I do not smoke anymore')).toBe(false);
    expect(readYesNo('nope')).toBe(false);
  });
});

describe('looksOffTopic', () => {
  it('spots questions and long talk that are not answers', () => {
    expect(looksOffTopic('What is the weather in Kigali today?')).toBe(true);
    expect(looksOffTopic('can you tell me a joke')).toBe(true);
    expect(looksOffTopic('thirty minutes')).toBe(false);
    expect(looksOffTopic('yes')).toBe(false);
  });
});
