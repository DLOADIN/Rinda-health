// This is the guide's offline answer set: for each area and result, why it matters and what helps. It has its own
// entry point so only the guide panel and the server load it, not every page of the app.
import enAnswers from '../en/guide-answers.json' with { type: 'json' };
import rwAnswers from '../rw/guide-answers.json' with { type: 'json' };
import { TextContentSchema, type Language } from './schemas.ts';

export const GUIDE_ANSWERS: Record<Language, Record<string, string>> = {
  en: TextContentSchema.parse(enAnswers).entries,
  rw: TextContentSchema.parse(rwAnswers).entries,
};
