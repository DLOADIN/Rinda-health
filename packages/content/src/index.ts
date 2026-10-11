import enBands from '../en/bands.json' with { type: 'json' };
import enConsent from '../en/consent.json' with { type: 'json' };
import enFeedback from '../en/feedback.json' with { type: 'json' };
import enGeneral from '../en/general.json' with { type: 'json' };
import enGuide from '../en/guide.json' with { type: 'json' };
import enQuestionnaire from '../en/questionnaire.json' with { type: 'json' };
import enReferrals from '../en/referral-list.json' with { type: 'json' };
import enSafety from '../en/safety.json' with { type: 'json' };
import rulesetV1 from '../rulesets/v1.0.json' with { type: 'json' };
import rwBands from '../rw/bands.json' with { type: 'json' };
import rwConsent from '../rw/consent.json' with { type: 'json' };
import rwFeedback from '../rw/feedback.json' with { type: 'json' };
import rwGeneral from '../rw/general.json' with { type: 'json' };
import rwGuide from '../rw/guide.json' with { type: 'json' };
import rwQuestionnaire from '../rw/questionnaire.json' with { type: 'json' };
import rwReferrals from '../rw/referral-list.json' with { type: 'json' };
import rwSafety from '../rw/safety.json' with { type: 'json' };
import { parseRuleset } from './ruleset.ts';
import { ReferralListSchema, TextContentSchema, type Language } from './schemas.ts';

export * from './ruleset.ts';
export * from './schemas.ts';

export const RULESET_V1 = parseRuleset(rulesetV1);

const text = (...files: unknown[]) =>
  Object.assign({}, ...files.map((f) => TextContentSchema.parse(f).entries)) as Record<string, string>;

export const BUNDLED_CONTENT: Record<
  Language,
  { text: Record<string, string>; referrals: ReturnType<typeof ReferralListSchema.parse> }
> = {
  en: {
    text: text(enBands, enGeneral, enSafety, enQuestionnaire, enGuide, enConsent, enFeedback),
    referrals: ReferralListSchema.parse(enReferrals),
  },
  rw: {
    text: text(rwBands, rwGeneral, rwSafety, rwQuestionnaire, rwGuide, rwConsent, rwFeedback),
    referrals: ReferralListSchema.parse(rwReferrals),
  },
};
