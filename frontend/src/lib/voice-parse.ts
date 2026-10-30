export type VoiceCommand = 'skip' | 'repeat' | 'back' | 'send';

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

export function readCommand(text: string): VoiceCommand | null {
  const t = normaliseSpeech(text);
  if (/\b(skip|pass|next question|rather not|prefer not|dont want to answer)\b/.test(t)) return 'skip';
  if (/\b(repeat|say (that|it) again|pardon|come again|read it again)\b/.test(t)) return 'repeat';
  if (/\b(go back|previous|back|change my answer)\b/.test(t)) return 'back';
  if (/\b(send|submit|finish|done)\b/.test(t)) return 'send';
  return null;
}

export function readYesNo(text: string): boolean | null {
  const t = normaliseSpeech(text);
  if (/\b(dont know|do not know|not sure|maybe)\b/.test(t)) return null;
  const strongYes = /\b(yes|yeah|yep|yup|sure|of course|correct)\b/.test(t);
  const no = /\b(no|nope|nah|never|not|dont)\b/.test(t);
  const weakYes = /\b(i do|sometimes|a little)\b/.test(t);
  if (strongYes && !no) return true;
  if (no && !strongYes) return false;
  if (weakYes && !no) return true;
  return null;
}

function wordsToNumber(words: readonly string[]): number | null {
  let total = 0;
  let current = 0;
  let seen = false;
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
      current += ten;
      seen = true;
    } else if (one !== undefined) {
      current += one;
      seen = true;
    } else if (w === 'hundred') {
      current = (current || 1) * 100;
      seen = true;
    } else if (w === 'thousand') {
      total += (current || 1) * 1000;
      current = 0;
      seen = true;
    } else if (seen) break;
  }
  if (!seen) return null;
  const whole = total + current;
  return decimals ? Number(`${whole}.${decimals}`) : whole;
}

export function readNumber(text: string, unit: 'minutes' | 'plain' = 'plain'): number | null {
  const halfHour = /\bhalf an? hour\b/.test(normaliseSpeech(text));
  const t = normaliseSpeech(text)
    .replace(/\bhalf an? hour\b/, '30 minutes')
    .replace(/\b(and )?a half\b/, 'point five');
  const tokens = t.split(' ');
  const digits = t.match(/\d+(?:\.\d+)?/);
  let value: number | null = null;
  if (digits) value = Number(digits[0]);
  else {
    const from = tokens.findIndex(
      (w, i) =>
        ONES[w] !== undefined ||
        TENS[w] !== undefined ||
        w === 'hundred' ||
        ((w === 'a' || w === 'an') && /^(hundred|hour)/.test(tokens[i + 1] ?? '')),
    );
    if (from >= 0) value = wordsToNumber(tokens.slice(from));
    if (value === null && /\b(none|nothing|no)\b/.test(t)) value = 0;
  }
  if (value === null || !Number.isFinite(value)) return null;
  if (unit === 'minutes' && !halfHour && /\bhours?\b/.test(t)) value = Math.round(value * 60);
  return value;
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

const STOP = new Set(['a', 'an', 'the', 'or', 'to', 'than', 'i', 'my', 'it', 'is', 'of', 'on', 'times']);

export function readChoice(text: string, labels: readonly string[]): number | null {
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

  const normalised = labels.map(normaliseSpeech);
  const exact = normalised.indexOf(t);
  if (exact >= 0) return exact;
  for (const [pattern, meaning] of SYNONYMS) {
    const at = normalised.indexOf(meaning);
    if (at >= 0 && pattern.test(t)) return at;
  }

  const spoken = readNumber(t);
  const words = new Set(t.split(' ').filter((w) => !STOP.has(w)));
  const scores = normalised.map((label, i) => {
    let score = 0;
    const r = labelRange(labels[i] ?? '');
    if (r && spoken !== null && spoken >= r[0] && spoken <= r[1]) score += 2;
    for (const w of label.split(' ')) if (!STOP.has(w) && !/^\d+$/.test(w) && words.has(w)) score += 1;
    return score;
  });
  const best = Math.max(...scores);
  if (best <= 0) return null;
  return scores.filter((s) => s === best).length === 1 ? scores.indexOf(best) : null;
}
