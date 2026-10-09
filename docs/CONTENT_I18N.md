# Content, languages and wording

Requirements: FR-04, FR-16, FR-20, FR-21, FR-46, FR-49, NFR-09. Only approved, published content reaches participants (C-05).

## Two kinds of text

| Kind | Examples | Lives in | Review |
| --- | --- | --- | --- |
| **Health content** | Questions and answer options, band labels, result explanations, recommendations, safety and Tier 1 text, referral list, consent document, guide chips and templates, audio | `packages/content/<lang>/*.json`, published as `ContentVersion` rows | Two approvals in the console (FR-46) |
| **Interface strings** | "Next", "Back", "Saved on this phone", error messages | `apps/web/src/locales/<lang>/*.json` (i18next) | Language reviewer before each pilot release |

If a string says anything about health, risk, results, safety or services, it is health content, not an interface string.

## Content package layout

```
packages/content/
  schemas/                     Zod schema per content type (single source for validation)
  rulesets/v1.0.json           thresholds, sources, planner order, validation ranges (language-neutral)
  en/
    questionnaire.json         questions, options, skip rules, missingness options
    explanations.json          FR-37 templates with slots: {value}, {threshold}, {source}
    recommendations.json       per domain and band, plus planner target templates
    referral-list.json         care directory entries with verified dates
    safety.json                safety screen, Tier 1 message, Get help now text
    consent.json               consent summary, full sheet, choices
    guide.json                 chip labels and template answers
    feedback.json              SUS and rating items
  rw/                          same files, same keys
  audio/                       optional recordings listed in the manifest (FR-49)
```

Every entry has a stable ID (`rec.activity.below`, `q.auditc.1`, `ref.hotline.114`). IDs never change meaning; a changed meaning gets a new ID.

## Publishing workflow

1. Edit JSON in a branch. `npm run content:validate` checks schemas, ID uniqueness, slot names, key parity between `en` and `rw`, and that every band code in the ruleset has a label and an explanation.
2. `npm run content:import` creates **draft** `ContentVersion` rows (development) or the researcher uploads the bundle in the console (pilot).
3. Reviewers compare the field-by-field diff and approve in the console. Two different people with the required reviewer types (table in [API.md](API.md)).
4. The researcher publishes. The manifest serves the new version; phones pick it up next time they are prepared or open online.
5. Published versions are immutable. Fixing a typo means a new patch version with its own approvals.

Development seeds may auto-approve with seeded reviewer accounts; the seed script refuses to run when `APP_ENV` is `pilot`.

## Languages

- English is written first, then translated by the bilingual key informant. Kinyarwanda must be complete before a pilot release (NFR-09); the key-parity test fails otherwise.
- Use validated Kinyarwanda versions of PHQ-9 and GAD-7 and RBC's Kinyarwanda WHO STEPS wording where they exist (SRS Section 10). Do not translate validated instruments yourself.
- Switching language keeps all answers (FR-21). Answers are stored as option codes, never as display text.
- No hard-coded user-facing strings in components: the `i18next/no-literal-string` lint rule runs on `apps/web/src`, except `components/ui/`.
- Numbers, dates and units are formatted with `Intl` for `en-RW` and `rw-RW`; dates are shown as words ("4 October 2026"), never as ambiguous digits. Some browsers ship no Kinyarwanda locale data and silently fall back to English month names, so `lib/i18n/format.ts` checks `Intl.DateTimeFormat.supportedLocalesOf("rw")` and otherwise builds Kinyarwanda dates from month names kept in the interface strings. Test this on the study phones.

## Wording guide (trauma-informed, plain language)

| Instead of | Write |
| --- | --- |
| "You are at high risk" | "Your blood pressure reading is higher than the healthy range" |
| "Abnormal", "bad", "fail" | "Below recommended", "Higher than recommended" |
| "You must see a doctor immediately" | "Please get your blood pressure checked at a health centre today" (approved seek-care text only) |
| "Obese" as a label for a person | "Your BMI is in the 30 or above range" |
| "Depression score: severe" | "Your answers suggest you have been carrying a lot lately. Support is available." (approved by the mental-health reviewer) |
| "Don't skip questions" | "You can skip any question. Skipping never counts against you." |

Rules: short sentences (aim for 15 words or fewer), second person, active voice, one idea per screen, never blame, never guilt, never threaten. Explain why a question is asked when it is sensitive.

## Read-aloud recordings (FR-49)

- Recorded by an approved reader from approved text; each file is tied to the content ID and version it reads.
- Mono Opus at about 24 kbps; target under 5 MB per language for all core questions and result headlines.
- Listed in the manifest with a hash; cached during "Prepare this phone" unless data-saver is on.
- If a recording is missing, the Listen button is hidden. English may use the device voice; Kinyarwanda never uses an unapproved synthetic voice.
