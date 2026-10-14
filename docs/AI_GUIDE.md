# Rinda Guide: the AI agent

Feature 2 in [FEATURES.md](FEATURES.md); requirements FR-33, FR-34 and FR-36, NFR-16.

> **Provider update (9 October 2026, ADR-019).** The explainer now calls **Google Gemini** (free tier, `GEMINI_API_KEY`, `GEMINI_MODEL`) through plain `fetch` in `backend/server.ts` section 5b. The flow, payload limits, validator, fallbacks, logging and ethics gate below are unchanged. The template composer lives in `packages/rules/src/guide.ts`.

## Read this first: ethics status

The approved ethics application says the prototype uses **no machine learning or generative AI** (Part A7 and B18 = NO), and SRS constraint C-03 keeps the MVP deterministic. Proposal Section 1.10.7 allows a later generative model only to reword explanations from redacted result codes, never to change results or write safety or referral text, and only after new ethics and supervisor approval.

So the guide is built in two layers:

| Layer | Contents | Pilot |
| --- | --- | --- |
| Deterministic guide | Planner, measurement coach, template composer | **On**: rule-based, approved content only, no AI |
| Generative explainer | Gemini rewrites the template answer in warmer, more personal language | **Off**. The API refuses to enable it unless `ETHICS_AMENDMENT_REF` holds the approved amendment reference |

Build and test the generative layer with synthetic data only. Never enable it for real participants without the amendment.

## What the agent does

Goal: every person sees which of their metrics matter most, knows those metrics were measured well, and gets a clear, kind explanation and a next step.

```
scored assessment ──► Planner (@rinda/rules)          picks up to 3 focus metrics, targets, reasons
measurement input ──► Measurement coach               checklists, unit fixes, soft re-check prompts
question chip     ──► Template composer               approved text + planner output   ← always available, offline
                         │
                         ▼ (only if guideGenerative is on and no urgent result or safety event in this session)
                      Explainer (Gemini, server)      rewrites the composed answer for this person
                         │
                         ▼
                      Validator ── pass ──► show "Written by Rinda's guide from your results"
                         └──── fail ──► show the template ("From approved guidance")
```

The planner and coach are specified in [SCORING_RULES.md](SCORING_RULES.md) Sections 7 and 9. This file covers the chips, the composer and the explainer.

**Why a bounded workflow and not a free-roaming tool-using agent.** The facts are already computed by the rules; the only open-ended part is wording. Letting a model choose what to compute or which content to show adds risk without adding value in a health context. The model therefore gets no tools and no say over numbers, bands, safety or referrals. See ADR-007 in [DECISIONS.md](DECISIONS.md).

## Question chips

There is no text box (C-06). Chips are content-managed and versioned. Starting set:

| Chip ID | Label (EN) | Where |
| --- | --- | --- |
| `overview` | What do my results mean? | Dashboard |
| `first_step` | What is one small step I can start this week? | Dashboard |
| `plan_week` | Make me a simple plan for this week | Dashboard |
| `tips` | What can I do about my results? | Dashboard; offline answer set for the person's own focus areas (ADR-028) |
| `explain.<domain>` | Explain my result for this area | Domain page (NCD domains only) |
| `why_matters.<domain>` | Why does this matter at my age? | Domain page |
| `measure_better.<domain>` | How do I measure this well next time? | BP, waist, BMI pages |

Mental-wellness domains have no chips. Their pages show approved support content only. A seek-care-today result or any safety event in the session switches the guide to templates only.

## Template composer (deterministic, offline)

`composeTemplateAnswer(chipId, result, plan, content)` lives in `packages/rules` next to the planner, so it runs offline in the browser. Each chip maps to an approved template with slots filled from the planner (for example `{targetText}`) and the result (for example `{value}`, `{target}`). Output shape is identical to the explainer's, with `source: "template"`.

## Explainer (Gemini)

**Where.** `backend/server.ts` section 5b (`explainWithGemini`), behind `POST /api/v1/guide/explain` (see [API.md](API.md)). The API key never reaches the browser.

**Answer once.** A passing answer is saved in `guide_answers` per check-up, question and language and served again without calling Gemini; withdrawing the AI opt-in deletes the saved answers. Numbers that already appear in the approved answer, as digits or words, are allowed.

**Model.** `gemini-3.5-flash` by default, overridable with `GEMINI_MODEL`. The answer is requested as structured JSON (`responseMimeType: application/json` with a response schema). A blocked, empty or malformed reply shows the template.

**What is sent** (and nothing else):

```json
{
  "language": "en",
  "chip": "first_step",
  "results": [
    { "domain": "activity", "band": "below", "bandLabel": "Below recommended", "value": 60, "unit": "minutes a week", "target": 150 },
    { "domain": "diet", "band": "below", "bandLabel": "Below recommended", "value": 3, "unit": "servings a day", "target": 5 }
  ],
  "plan": [ { "domain": "activity", "targetText": "about 20 more minutes on 3 days", "reason": "activity_below" } ],
  "templateAnswer": "…the composer's answer for this chip…",
  "allowedNumbers": [3, 5, 20, 60, 150]
}
```

Never sent: study code, any ID, dates, sex, age band, district, PHQ-9 or GAD-7 data, safety events, free text, blood pressure in the seek-care band.

**System prompt** (stable, cached; the approved content library for the active language and content version is appended after it):

```text
You are the guide inside Rinda Health, an educational app that helps young adults in Rwanda
(aged 18 to 35) understand everyday risk factors for non-communicable diseases.

You receive one person's results, already calculated by fixed rules, a short plan chosen by
those rules, an answer written from approved health-education text, and the library of approved
text. Rewrite that answer so it speaks to this person's own results and the question they chose.

These limits keep people safe, so follow them exactly:
- Use only the facts and approved text you are given. If something is not there, leave it out.
- Copy numbers exactly as given. Never calculate, round or estimate a new number.
- Results are educational bands, not diagnoses. Never say the person has a disease.
- No medicines, doses, treatments, phone numbers, links or emergency instructions. The app
  shows those from approved text.
- No weight-loss targets and no comments about body shape. Talk about everyday habits.
- Be warm and practical, with no blame, fear or shame. Use short sentences and everyday words.
- Write in the requested language, in at most 4 short paragraphs and under 150 words.
- For each paragraph, list the IDs of the approved texts it draws on.
```

**Output schema** (structured output; hand-written JSON Schema because every object needs `additionalProperties: false`):

```ts
// packages/schemas/src/guide.ts
export const GUIDE_ANSWER_JSON_SCHEMA = {
  type: 'object',
  properties: {
    paragraphs: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, sourceIds: { type: 'array', items: { type: 'string' } } },
        required: ['text', 'sourceIds'],
        additionalProperties: false,
      },
    },
    followUpChipIds: { type: 'array', items: { type: 'string', enum: CHIP_IDS } },
  },
  required: ['paragraphs', 'followUpChipIds'],
  additionalProperties: false,
} as const;

// Zod twin for runtime checks the JSON Schema cannot express (lengths, counts)
export const GuideAnswer = z.strictObject({
  paragraphs: z.array(z.strictObject({ text: z.string().max(600), sourceIds: z.array(z.string()).min(1) })).min(1).max(4),
  followUpChipIds: z.array(z.enum(CHIP_IDS)).max(3),
});
```

**Call.** One `POST` to `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent` with the key in the `x-goog-api-key` header, the system instruction, the facts above as the user turn, a response schema, a 20-second timeout and no retries. Token counts come from `usageMetadata` and are logged without any text. Any network error, non-200 status or validator failure shows the template.

## Validator

`validateAnswer()` is deterministic and unit-tested with adversarial fixtures. Any failure means the template is shown and a failure code (never text) is counted.

1. Schema and limits: 1 to 4 paragraphs, under 150 words in total, at most 3 follow-up chips.
2. **Numbers**: every number in the text must be in `allowedNumbers` (digits and number words in both languages).
3. **Sources**: every `sourceId` exists in the approved library for this language and content version.
4. **Banned content**: diagnosis words ("diagnose", "you have", disease names other than the approved band labels), medicines and doses, "cure", "guarantee", emergency wording, crisis vocabulary, URLs, anything shaped like a phone number.
5. **Scope**: no mention of mood, anxiety, depression or the mental-wellness section.
6. **Language**: output matches the requested language (stop-word check). Kinyarwanda generation stays disabled until the language reviewer approves an evaluation sample; until then Kinyarwanda users get the template.

## UI rules

- The template answer renders immediately. The generated answer replaces it when ready, with a Skeleton in between, so the guide never blocks.
- Generated answers carry a Badge, "Written by Rinda's guide from your results", and the line "It can make mistakes. Your results and any safety advice come from approved rules."
- A Sources Collapsible lists the titles of the approved texts used.
- "Was this helpful?" offers two buttons only (no free text); the API counts them.

## Logging and limits

- `GuideRequestLog`: chip ID, source (`generated` or `template`), validator outcome code, model, latency, token counts. No prompt, no answer, no participant ID.
- Rate limit: 20 generated answers per participant per day; beyond that, templates.
- Rough cost at current Opus 5.5 prices ($4 input and $20 output per million tokens): about 3,000 input tokens (mostly cached) and up to 1,500 output tokens including thinking, so roughly 3 to 4 US cents per answer. Measure real usage before quoting it.

## Evaluation before any amendment

1. Generate 40 synthetic profiles that cover every band and planner case (reuse the golden fixtures).
2. Run every chip for every profile (about 240 answers). Running this costs money, so agree the budget first.
3. Targets: validator pass rate of 98% or more; zero changed numbers; zero safety or referral text written by the model.
4. The clinician and the language reviewer rate a stratified sample of 30 answers for accuracy, tone and clarity (1 to 5). Median 4 or more and no factual errors.
5. Attach the results to the amendment.

## Ethics amendment checklist

- What changes for participants, with screenshots.
- Exactly what data leave the server (the payload above) and what never does.
- Provider, processing location and retention terms, checked at the time of submission.
- A new, separate, un-ticked consent choice: "Use an AI guide to explain my results" (consent scope `ai_explanations`).
- Safeguards: validator, fallback, no mental-wellness content, no safety text, logging limits.
- Evaluation results from the section above.
- Supervisor approval.
