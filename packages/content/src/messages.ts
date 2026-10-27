import enMessages from '../en/messages.json' with { type: 'json' };
import rwMessages from '../rw/messages.json' with { type: 'json' };
import { TextContentSchema, type Language } from './schemas.ts';

export const MESSAGES: Record<Language, Record<string, string>> = {
  en: TextContentSchema.parse(enMessages).entries,
  rw: TextContentSchema.parse(rwMessages).entries,
};
