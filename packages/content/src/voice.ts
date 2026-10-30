import enVoice from '../en/voice.json' with { type: 'json' };
import rwVoice from '../rw/voice.json' with { type: 'json' };
import { TextContentSchema, type Language } from './schemas.ts';

export const VOICE: Record<Language, Record<string, string>> = {
  en: TextContentSchema.parse(enVoice).entries,
  rw: TextContentSchema.parse(rwVoice).entries,
};

const range = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => `${prefix}.${i}`);
const WELLNESS_OPTIONS = range('q.wellness.opt', 4);

export const VOICE_CHOICES: Record<string, readonly string[]> = {
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
  'q.activity.moderate': 'voice.number.minutes',
  'q.activity.vigorous': 'voice.number.minutes',
  'q.diet.servings': 'voice.number.servings',
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
