import enVoice from '../en/voice.json' with { type: 'json' };
import rwVoice from '../rw/voice.json' with { type: 'json' };
import { TextContentSchema, type Language } from './schemas.ts';

export const VOICE: Record<Language, Record<string, string>> = {
  en: TextContentSchema.parse(enVoice).entries,
  rw: TextContentSchema.parse(rwVoice).entries,
};

const range = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}.${i}`);
const WELLNESS_OPTIONS = range('q.wellness.opt', 4);

// One spoken range. `min` is included and `max` is not, so the edges can sit exactly on the
// scoring thresholds (130 for blood pressure, 150 minutes for activity, 80 or 94 cm for waist):
// whichever range someone picks, it lands in the same result band as their real number would.
// `value` is the number saved for that range.
export interface VoiceRange {
  min: number | null;
  max: number | null;
  value: number;
}

const ranges = (...list: Array<[number | null, number | null, number]>): readonly VoiceRange[] =>
  list.map(([min, max, value]) => ({ min, max, value }));

export const VOICE_RANGES: Record<string, readonly VoiceRange[]> = {
  'q.activity.moderate': ranges(
    [0, 1, 0],
    [1, 30, 15],
    [30, 60, 45],
    [60, 90, 75],
    [90, 150, 120],
    [150, 300, 225],
    [300, null, 330],
  ),
  'q.activity.vigorous': ranges(
    [0, 1, 0],
    [1, 30, 15],
    [30, 60, 45],
    [60, 75, 68],
    [75, 150, 110],
    [150, null, 180],
  ),
  'q.diet.servings': ranges([0, 1, 0], [1, 3, 1.5], [3, 5, 3.5], [5, null, 5]),
  'voice.body.height': ranges(
    [null, 150, 145],
    [150, 160, 155],
    [160, 170, 165],
    [170, 180, 175],
    [180, 190, 185],
    [190, null, 195],
  ),
  'voice.body.weight': ranges(
    [null, 50, 45],
    [50, 60, 55],
    [60, 70, 65],
    [70, 80, 75],
    [80, 90, 85],
    [90, 100, 95],
    [100, null, 105],
  ),
  'voice.body.waist': ranges([null, 80, 75], [80, 88, 84], [88, 94, 90], [94, 102, 98], [102, null, 106]),
  'voice.bp.systolic': ranges(
    [null, 120, 115],
    [120, 130, 125],
    [130, 140, 135],
    [140, 160, 150],
    [160, 180, 170],
    [180, null, 185],
  ),
  'voice.bp.diastolic': ranges(
    [null, 80, 75],
    [80, 85, 82],
    [85, 90, 87],
    [90, 100, 95],
    [100, 110, 105],
    [110, null, 115],
  ),
};

export const VOICE_CHOICES: Record<string, readonly string[]> = {
  ...Object.fromEntries(
    Object.entries(VOICE_RANGES).map(([id, list]) => [id, range(`${id}.opt`, list.length)]),
  ),
  'q.auditc.1': range('q.auditc.1.opt', 5),
  'q.auditc.2': range('q.auditc.2.opt', 5),
  'q.auditc.3': range('q.auditc.3.opt', 5),
  'voice.source': range('voice.source.opt', 2),
  ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`q.phq9.${i + 1}`, WELLNESS_OPTIONS])),
  ...Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`q.gad7.${i + 1}`, WELLNESS_OPTIONS])),
};

const HINTS: Record<string, string> = {
  'q.tobacco.current': 'voice.yesno',
  'q.diet.salt': 'voice.yesno',
  ...Object.fromEntries(Object.keys(VOICE_RANGES).map((id) => [id, 'voice.range.hint'])),
};

const LEADS: Record<string, readonly string[]> = {
  'q.phq9.1': ['q.phq9.stem'],
  'q.gad7.1': ['q.gad7.stem'],
  'voice.wellness.ask': ['q.wellness.title', 'q.wellness.intro', 'q.wellness.risk'],
};

export const VOICE_LINES: readonly string[] = [
  ...Object.keys(VOICE.en).filter((id) => !/\.opt\.\d$/.test(id)),
  ...Object.keys(VOICE_CHOICES).filter((id) => !id.startsWith('voice.')),
  ...Object.keys(HINTS),
];

export function spokenText(id: string, text: (id: string) => string): string | null {
  if (!VOICE_LINES.includes(id)) return null;
  const choices = VOICE_CHOICES[id];
  const hint = HINTS[id];
  const parts = [
    ...(LEADS[id] ?? []).map(text),
    text(id),
    ...(choices ? [`${text('voice.choose')} ${choices.map(text).join(', ')}.`] : []),
    ...(hint ? [text(hint)] : []),
  ];
  return parts.join(' ');
}
