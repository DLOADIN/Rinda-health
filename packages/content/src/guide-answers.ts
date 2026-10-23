import enAnswers from '../en/guide-answers.json' with { type: 'json' };
import rwAnswers from '../rw/guide-answers.json' with { type: 'json' };
import { TextContentSchema, type Language } from './schemas.ts';

export const GUIDE_ANSWERS: Record<Language, Record<string, string>> = {
  en: TextContentSchema.parse(enAnswers).entries,
  rw: TextContentSchema.parse(rwAnswers).entries,
};
