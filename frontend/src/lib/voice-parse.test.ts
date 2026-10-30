import { describe, expect, it } from 'vitest';
import { readChoice, readCommand, readNumber, readYesNo } from '@/lib/voice-parse';

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
