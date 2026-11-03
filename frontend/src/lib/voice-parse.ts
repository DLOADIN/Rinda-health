export type VoiceCommand = 'skip' | 'repeat' | 'back' | 'send';
export type NumberUnit = 'minutes' | 'plain' | 'height';

const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};
const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, last: -1 };
const TIMES: Record<string, string> = { once: '1 time', twice: '2 time', thrice: '3 time' };
const SINGULAR: Record<string, string> = {
  days: 'day',
  weeks: 'week',
  months: 'month',
  years: 'year',
  times: 'time',
  hours: 'hour',
  minutes: 'minute',
  mins: 'minute',
  min: 'minute',
  hrs: 'hour',
  hr: 'hour',
  meters: 'metre',
  metres: 'metre',
  meter: 'metre',
};
const PER_MONTH: Record<string, number> = { day: 30, week: 4.33, month: 1, year: 1 / 12 };

export function normaliseSpeech(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/(\d),(\d)/g, '$1$2')
    .replace(/[^a-z0-9.\s-]/g, ' ')
    .replace(/(\D)\.|\.(\D)|\.$/g, '$1 $2')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const isNumberWord = (w: string) =>
  ONES[w] !== undefined || TENS[w] !== undefined || w === 'hundred' || w === 'thousand';

function wordsToNumber(words: readonly string[]): number | null {
  let total = 0;
  let current = 0;
  let seen = false;
  let used = 0;
  let decimals: string | null = null;
  for (const [i, w] of words.entries()) {
    if (decimals !== null) {
      const digit = ONES[w];
      if (digit !== undefined && digit < 10) decimals += String(digit);
      else break;
      continue;
    }
    const one = ONES[w];
    const ten = TENS[w];
    if ((w === 'a' || w === 'an') && i === 0) {
      current = 1;
      seen = true;
    } else if (w === 'and' && seen) continue;
    else if (w === 'point' && seen) decimals = '';
    else if (ten !== undefined) {
      // "one seventy" and "one twenty" are said for 170 and 120.
      current = used === 1 && current > 0 && current < 10 ? current * 100 + ten : current + ten;
      seen = true;
    } else if (one !== undefined) {
      current = used === 1 && current > 0 && current < 10 && one >= 10 ? current * 100 + one : current + one;
      seen = true;
    } else if (w === 'hundred') {
      current = (current || 1) * 100;
      seen = true;
    } else if (w === 'thousand') {
      total += (current || 1) * 1000;
      current = 0;
      seen = true;
    } else if (seen) break;
    used++;
  }
  if (!seen) return null;
  const whole = total + current;
  return decimals ? Number(`${whole}.${decimals}`) : whole;
}

// This is where spoken number words become digits, plurals become singular and "once"
// becomes "1 time", so the patterns below only have to deal with one way of saying things.
export function digitise(text: string): string {
  const tokens = normaliseSpeech(text)
    .replace(/\b(and )?a half\b/g, 'point five')
    .split(' ')
    .filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i] ?? '';
    if (isNumberWord(w) || ((w === 'a' || w === 'an') && tokens[i + 1] === 'hundred')) {
      let j = i;
      const run: string[] = [];
      while (j < tokens.length) {
        const x = tokens[j] ?? '';
        const inRun =
          isNumberWord(x) ||
          (j === i && (x === 'a' || x === 'an')) ||
          (x === 'and' && isNumberWord(tokens[j + 1] ?? '')) ||
          (x === 'point' && ONES[tokens[j + 1] ?? ''] !== undefined) ||
          (run.at(-1) === 'point' && ONES[x] !== undefined);
        if (!inRun) break;
        // "two three times" is two numbers, not twenty-three: stop at a second plain digit word.
        const digit = ONES[x];
        if (run.length > 0 && run.at(-1) !== 'point' && digit !== undefined && digit < 10) {
          const previous = ONES[run.at(-1) ?? ''];
          if (previous !== undefined && previous < 10) break;
        }
        run.push(x);
        j++;
      }
      const value = wordsToNumber(run);
      out.push(value === null ? w : String(value));
      i = j - 1;
      continue;
    }
    const times = TIMES[w];
    if (times) {
      out.push(times);
      continue;
    }
    out.push(SINGULAR[w] ?? w);
  }
  return out.join(' ').replace(/(\d) point (\d)/g, '$1.$2');
}

const NUM = String.raw`\d+(?:\.\d+)?`;

export function numbersIn(text: string): number[] {
  return [...digitise(text).matchAll(new RegExp(NUM, 'g'))].map((m) => Number(m[0]));
}

export function readCommand(text: string): VoiceCommand | null {
  const t = normaliseSpeech(text);
  if (/\b(skip|pass|next question|rather not|prefer not|dont want to answer)\b/.test(t)) return 'skip';
  if (/\b(repeat|say (that|it) again|pardon|come again|read it again)\b/.test(t)) return 'repeat';
  if (/\b(go back|previous|back|change my answer)\b/.test(t)) return 'back';
  if (/\b(send|submit|finish|done)\b/.test(t)) return 'send';
  return null;
}

export function looksOffTopic(text: string): boolean {
  const t = normaliseSpeech(text);
  return (
    /\b(what|why|who|where|when|how come|can you|could you|tell me|do you know|whats)\b/.test(t) ||
    t.split(' ').length > 14
  );
}

export function readYesNo(text: string): boolean | null {
  const t = normaliseSpeech(text);
  if (/\b(dont know|do not know|not sure|maybe)\b/.test(t)) return null;
  const strongYes = /\b(yes|yeah|yep|yup|yah|ya|sure|of course|correct|right|indeed|absolutely)\b/.test(t);
  const no = /\b(no|nope|nah|never|not|dont|none|nothing)\b/.test(t);
  const weakYes =
    /\b(i do|sometimes|a little|a bit|usually|often|always|i (smoke|use|chew|add|put|drink)|i will|lets do|okay|ok)\b/.test(
      t,
    );
  if (strongYes && !no) return true;
  if (no && !strongYes) return false;
  if (weakYes && !no) return true;
  return null;
}

// This is where a spoken duration becomes a number of minutes, including "an hour and a half",
// "30 minutes a day" (times seven) and "an hour, three times a week" (times three).
function readMinutes(text: string): number | null {
  let d = digitise(text);
  let times = 1;
  const perWeek = d.match(
    new RegExp(String.raw`(${NUM}) (?:day|time)s? (?:a|per|each|every|in a|in the) week`),
  );
  if (perWeek?.[1]) {
    times = Number(perWeek[1]);
    d = d.replace(perWeek[0], ' ');
  } else if (/\b(a|per|each|every) day\b|\bdaily\b|\beveryday\b/.test(d)) {
    times = 7;
  }
  if (/\b(none|nothing|no|never|not at all|dont)\b/.test(d) && !new RegExp(NUM).test(d)) return 0;
  let minutes: number | null = null;
  const hourAndHalf = /\b(an?|1) hour (and )?point 5\b|\b(an?|1) hour and a half\b/.test(d);
  if (hourAndHalf) minutes = 90;
  else if (/\bhalf an? hour\b/.test(d)) minutes = 30;
  else {
    const hours = d.match(new RegExp(String.raw`(${NUM}|an?) hour`));
    const mins = d.match(new RegExp(String.raw`(${NUM}) minute`));
    if (hours?.[1]) {
      const h = /^an?$/.test(hours[1]) ? 1 : Number(hours[1]);
      minutes = Math.round(h * 60) + (mins?.[1] ? Number(mins[1]) : 0);
    } else {
      const first = d.match(new RegExp(NUM));
      if (first) minutes = Number(first[0]);
    }
  }
  if (minutes === null || !Number.isFinite(minutes)) return null;
  return Math.round(minutes * times);
}

function readHeight(text: string): number | null {
  const d = digitise(text);
  const metres = d.match(/\b(\d) metre (\d{1,2})\b/);
  if (metres?.[1] && metres[2]) return Number(metres[1]) * 100 + Number(metres[2]);
  const first = d.match(new RegExp(NUM));
  if (!first) return null;
  const value = Number(first[0]);
  return value > 0 && value < 3 ? Math.round(value * 100) : value;
}

export function readNumber(text: string, unit: NumberUnit = 'plain'): number | null {
  if (unit === 'minutes') return readMinutes(text);
  if (unit === 'height') return readHeight(text);
  const d = digitise(text);
  const first = d.match(new RegExp(NUM));
  if (first) {
    const value = Number(first[0]);
    return Number.isFinite(value) ? value : null;
  }
  if (/\b(none|nothing|no|zero)\b/.test(d)) return 0;
  return null;
}

// This is where "120 over 80" said in one go becomes both blood pressure numbers.
export function readBloodPressure(text: string): { systolic: number; diastolic: number } | null {
  const d = digitise(text);
  const m = d.match(/\b(\d{2,3}) (?:over|on|by|slash|and|upon) (\d{2,3})\b/);
  if (!m?.[1] || !m[2]) return null;
  return { systolic: Number(m[1]), diastolic: Number(m[2]) };
}

// This is where an everyday answer about how often becomes "times a month":
// "2 or 3 times a week" is about 11, "every weekend" about 6, "a few times a year" under 1.
export function readFrequency(text: string): number | null {
  const d = digitise(text);
  if (/\b(dont drink|do not drink|i dont|not at all|never drink|zero)\b/.test(d)) return 0;
  if (
    /\b(almost never|hardly ever|rarely|seldom|occasionally|once in a while|special occasion|few time a year|less than (1 time a )?month(ly)?)\b/.test(
      d,
    )
  )
    return 0.5;
  if (/\b(almost|nearly) (every day|daily|everyday)\b|\bmost day\b|\balmost daily\b/.test(d)) return 25;
  if (/\b(every day|everyday|daily|each day|all the time|always)\b/.test(d)) return 30;
  if (/\bweekend\b/.test(d)) return 6;
  const every = d.match(
    new RegExp(String.raw`\bevery (other |(${NUM})(?: (?:or|to) (${NUM}))? )?(day|week|month|year)\b`),
  );
  if (every?.[4]) {
    const gap =
      every[1] === 'other ' ? 2 : every[2] ? (Number(every[2]) + Number(every[3] ?? every[2])) / 2 : 1;
    return (PER_MONTH[every[4]] ?? 1) / gap;
  }
  const rate = d.match(
    new RegExp(
      String.raw`\b(${NUM}|a few|a couple of|few|couple of)(?:(?: or| to| and)? (${NUM}))? (?:time )?(?:a |per |each |every |in a |in the |in )?(day|week|month|year)\b`,
    ),
  );
  if (rate?.[1] && rate[3]) {
    const low = /few|couple/.test(rate[1]) ? (rate[1].includes('couple') ? 2 : 3) : Number(rate[1]);
    const high = rate[2] ? Number(rate[2]) : low;
    return ((low + high) / 2) * (PER_MONTH[rate[3]] ?? 1);
  }
  if (/\bweekly\b|\b1 time a week\b/.test(d)) return 4.33;
  if (/\bmonthly\b/.test(d)) return 1;
  if (/\b(yearly|annually)\b/.test(d)) return 1 / 12;
  if (/\b(never|no|none|nope)\b/.test(d)) return 0;
  return null;
}

// This is where an answer about the last two weeks becomes one of the four PHQ-9/GAD-7 choices.
export function readTwoWeeks(text: string): number | null {
  const d = digitise(text);
  if (/\bnot at all\b|\bnot really\b|\bnot once\b|\bnever\b|\bno day\b|^(no|nope|none|nah)\b/.test(d))
    return 0;
  if (
    /\bmore than half\b|\bhalf (the|of the) (time|day)\b|\bmost (of the )?(day|time)\b|\boften\b|\ba lot\b|\bmany day\b|\busually\b|\bfrequently\b/.test(
      d,
    )
  )
    return /\bnot (very )?often\b/.test(d) ? 1 : 2;
  if (
    /\b(nearly|almost) (every day|everyday|daily|all the time)\b|\bevery day\b|\beveryday\b|\balways\b|\ball the time\b|\bdaily\b|\bconstantly\b/.test(
      d,
    )
  )
    return 3;
  if (
    /\bseveral\b|\bsometimes\b|\bsome day\b|\ba few\b|\bfew day\b|\ba couple\b|\bonce or twice\b|\boccasionally\b|\brarely\b|\bhardly\b|\ba little\b|\bnot much\b|\b1 time\b|\b2 time\b/.test(
      d,
    )
  )
    return 1;
  const days = d.match(new RegExp(String.raw`(${NUM})(?:(?: or| to)? (${NUM}))? day`));
  if (days?.[1]) {
    const n = Math.max(Number(days[1]), Number(days[2] ?? days[1]));
    if (n === 0) return 0;
    if (n <= 6) return 1;
    if (n <= 11) return 2;
    return 3;
  }
  return null;
}

function labelRange(label: string): [number, number] | null {
  const t = normaliseSpeech(label);
  const more = t.match(/^(\d+) or more\b/);
  if (more) return [Number(more[1]), Infinity];
  const between = t.match(/^(\d+) (?:or|to) (\d+)\b/);
  if (between) return [Number(between[1]), Number(between[2])];
  return null;
}

const SYNONYMS: Array<[RegExp, string]> = [
  [/\b(never|not once|no days)\b/, 'not at all'],
  [/\b(sometimes|a few days|some days|a little)\b/, 'several days'],
  [/\b(often|most days|a lot|half the time)\b/, 'more than half the days'],
  [/\b(always|every day|daily|all the time)\b/, 'nearly every day'],
];

const STOP = new Set(['a', 'an', 'the', 'or', 'to', 'than', 'i', 'my', 'it', 'is', 'of', 'on', 'time']);

// This is where an answer names a choice directly: "option two", "the last one" or the choice's own words.
function namedChoice(text: string, labels: readonly string[]): number | null {
  const t = normaliseSpeech(text);
  const picked = t.match(/\b(?:option|number|choice) (\w+)\b/);
  if (picked?.[1]) {
    const n = Number(picked[1]) || ONES[picked[1]] || 0;
    if (n >= 1 && n <= labels.length) return n - 1;
  }
  const ordinal = Object.entries(ORDINALS).find(([w]) => new RegExp(`\\bthe ${w}( one)?\\b`).test(t));
  if (ordinal) {
    if (ordinal[1] === -1) return labels.length - 1;
    return ordinal[1] <= labels.length ? ordinal[1] - 1 : null;
  }
  const spoken = digitise(t);
  const exact = labels.findIndex((l) => digitise(l) === spoken);
  return exact >= 0 ? exact : null;
}

export function readChoice(text: string, labels: readonly string[]): number | null {
  const named = namedChoice(text, labels);
  if (named !== null) return named;
  const t = normaliseSpeech(text);
  const normalised = labels.map(normaliseSpeech);
  for (const [pattern, meaning] of SYNONYMS) {
    const at = normalised.indexOf(meaning);
    if (at >= 0 && pattern.test(t)) return at;
  }

  const spoken = readNumber(t);
  const words = new Set(
    digitise(t)
      .split(' ')
      .filter((w) => !STOP.has(w)),
  );
  const scores = labels.map((label) => {
    let score = 0;
    const r = labelRange(label);
    if (r && spoken !== null && spoken >= r[0] && spoken <= r[1]) score += 2;
    for (const w of digitise(label).split(' '))
      if (!STOP.has(w) && !/^\d+$/.test(w) && words.has(w)) score += 1;
    return score;
  });
  const best = Math.max(...scores);
  if (best <= 0) return null;
  return scores.filter((s) => s === best).length === 1 ? scores.indexOf(best) : null;
}

const pick = (value: number, upTo: readonly number[]) => {
  const at = upTo.findIndex((limit) => value < limit);
  return at < 0 ? upTo.length : at;
};

// This is where each check-up question gets the reading that fits it, before the general matcher.
export function readQuestionChoice(id: string, text: string, labels: readonly string[]): number | null {
  const named = namedChoice(text, labels);
  if (named !== null) return named;
  if (id === 'q.auditc.1') {
    const perMonth = readFrequency(text);
    // Never · monthly or less · 2 to 4 times a month · 2 to 3 times a week · 4 or more times a week
    if (perMonth !== null) return perMonth === 0 ? 0 : 1 + pick(perMonth, [1.5, 6, 15]);
  }
  if (id === 'q.auditc.3') {
    const perMonth = readFrequency(text);
    // Never · less than monthly · monthly · weekly · daily or almost daily
    if (perMonth !== null) return perMonth === 0 ? 0 : 1 + pick(perMonth, [1, 3, 20]);
  }
  if (id === 'q.auditc.2') {
    const numbers = numbersIn(text).filter((n) => n > 0);
    if (numbers.length > 0) {
      const drinks = Math.max(...numbers.slice(0, 2));
      const at = labels.findIndex((l) => {
        const r = labelRange(l);
        return r !== null && drinks >= r[0] && drinks <= r[1] + 0.99;
      });
      if (at >= 0) return at;
    }
  }
  if (/^q\.(phq9|gad7)\./.test(id)) {
    const choice = readTwoWeeks(text);
    if (choice !== null && choice < labels.length) return choice;
  }
  if (id === 'voice.source') {
    const d = digitise(text);
    if (
      /\b(memory|remember|recent|before|last|ago|old|earlier|clinic|hospital|doctor|yesterday|nurse|pharmacy)\b/.test(
        d,
      )
    )
      return 1;
    if (/\b(today|now|just|here|this morning|this session|measured|took|taken)\b/.test(d)) return 0;
  }
  return readChoice(text, labels);
}
