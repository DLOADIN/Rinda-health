# Scoring, safety and planner rules (ruleset v1.0)

Status: **proposed**, awaiting approval by the supervisor and the health reviewers (FR-20, FR-46). Source: [SRS.md](SRS.md) Section 5. If this file and the SRS disagree, stop and ask; do not pick one.

These rules are the heart of the product. They live in `packages/rules` as pure TypeScript functions and run unchanged in the browser and in the API (FR-09).

## 1. Principles

1. **Pure and deterministic.** No I/O, no clock, no randomness, no `Date.now()`. Same input and ruleset version, same output, byte for byte after normalisation.
2. **One implementation.** The web app and the API import the same package. Never re-implement a rule elsewhere, including in SQL, UI code or tests.
3. **Numbers live in the ruleset, logic lives in code.** Thresholds, cut-offs, sources and the planner order come from a versioned ruleset JSON in `packages/content/rulesets/`. Code implements the rule shapes. A new threshold means a new ruleset version; a new rule shape means new code and a new major version.
4. **Every domain stands alone.** Missing any required input gives `insufficient` ("Not enough information") for that domain only. Never fill a default, never treat a skip as 0 (FR-05).
5. **No combined score.** NCD domains and mental-wellness instruments are never added, averaged or ranked together (C-04).
6. **Codes out, words in the UI.** The engine returns band codes and explanation parameters; approved content turns them into words in each language.
7. **100% branch coverage** in `packages/rules` (NFR-11), plus every golden case below on both builds.

## 2. Package API

```ts
// packages/rules/src/index.ts (shape, not final code)
export type Sex = 'female' | 'male' | 'not_stated';
export type Missingness = 'SKIPPED' | 'MODULE_DECLINED' | 'DONT_KNOW' | 'NOT_APPLICABLE';
export type Answer<T> = { value: T } | { missing: Missingness };

export function scoreAssessment(input: AssessmentInput, ruleset: Ruleset): AssessmentResult;
export function checkItem9(answer: Answer<0 | 1 | 2 | 3>): 'tier2' | 'prompt_facilitator' | null; // runs as soon as item 9 is answered
export function planNextSteps(result: AssessmentResult, ruleset: Ruleset): Plan;                 // FR-33
export function simulate(change: WhatIfChange, base: AssessmentInput, ruleset: Ruleset): WhatIfResult; // FR-38
export function explain(result: DomainResult, ruleset: Ruleset): ExplanationParts;                // FR-37
export function checkPlausibility(m: MeasurementInput, ruleset: Ruleset): PlausibilityFlag[];     // FR-34
export function normalise(result: AssessmentResult): string; // canonical JSON (sorted keys) for comparing client and server results
```

Each `DomainResult` carries: `domain`, `band`, `severity`, `value` (when there is one), `completeness`, `contributingFactors` (codes), `ruleId`, `source`, `rulesetVersion`.

## 3. Domain rules

| Domain | Inputs | Rule | Band codes | Source |
| --- | --- | --- | --- | --- |
| `tobacco` | Current smoked or smokeless use (yes/no) | Yes gives `attention`; no gives `no_reported_risk` | `no_reported_risk`, `attention` | WHO STEPS (2024) |
| `alcohol` | AUDIT-C items 1 to 3, each 0 to 4 | Total 0 to 12. If item 1 is "never" (0), total is 0 and items 2 and 3 are `NOT_APPLICABLE`. Attention at male 4 or more, female 3 or more, sex not stated 3 or more | `lower_risk`, `attention` | Bush et al. (1998); Bradley et al. (2007) |
| `activity` | Moderate minutes per week, vigorous minutes per week (both required, 0 allowed) | Moderate-equivalent = moderate + 2 × vigorous. Under 150 gives `below`; 150 or more gives `meets` | `meets`, `below` | Bull et al. (2020) |
| `diet` | Fruit and vegetable servings per day; adds salt at the table | Under 5 gives `below`; 5 or more gives `meets`. Salt is an information flag only, never a band | `meets`, `below` | WHO (2020); WHO (2012) |
| `bmi` | Height (cm), weight (kg) | BMI rounded to one decimal, half up, **before** banding (Section 4). Under 18.5 underweight; 18.5 to 24.9 normal; 25.0 to 29.9 overweight; 30.0 or more obesity | `underweight`, `normal`, `overweight`, `obesity` | WHO (2000) |
| `waist` | Waist (cm), sex | Male: 94 or more increased, 102 or more substantially increased. Female or not stated: 80 and 88 | `not_increased`, `increased`, `substantially_increased` | WHO (2011) |
| `bp` | Systolic and diastolic (mmHg), source, date | Band each value separately and take the more severe. Normal: under 130 and under 85. High-normal: 130 to 139 or 85 to 89. Hypertension range: 140 or more or 90 or more (confirm at a health centre). Seek care today: 180 or more or 110 or more | `normal`, `high_normal`, `hypertension_range`, `seek_care_today` | Unger et al. (2020); WHO (2021b) |
| `phq9` (optional) | Items 1 to 9, each 0 to 3 | All 9 needed. 0 to 4 minimal; 5 to 9 mild; 10 to 14 moderate; 15 to 19 moderately severe; 20 to 27 severe. Non-clinical labels in the UI | `minimal`, `mild`, `moderate`, `moderately_severe`, `severe` | Kroenke et al. (2001) |
| `gad7` (optional) | Items 1 to 7, each 0 to 3 | All 7 needed. 0 to 4 minimal; 5 to 9 mild; 10 to 14 moderate; 15 to 21 severe | `minimal`, `mild`, `moderate`, `severe` | Spitzer et al. (2006) |

Every domain can also return `insufficient`.

### Severity mapping (drives the UI band style; proposed for reviewer approval)

| Severity | UI token | Domains and bands |
| --- | --- | --- |
| `ok` | `band-ok` | tobacco `no_reported_risk`; alcohol `lower_risk`; activity and diet `meets`; bmi `normal`; waist `not_increased`; bp `normal`; phq9 and gad7 `minimal` |
| `attention` | `band-attention` | tobacco `attention`; alcohol `attention`; activity and diet `below`; bmi `underweight`, `overweight`; waist `increased`; bp `high_normal` |
| `confirm` | `band-confirm` | bmi `obesity`; waist `substantially_increased`; bp `hypertension_range` |
| `urgent` | `band-urgent` | bp `seek_care_today` only |
| `wellness` | `band-wellness` | phq9 and gad7 above `minimal` (never `attention`, `confirm` or `urgent` styling) |
| `unknown` | dashed outline | any `insufficient` |

## 4. BMI arithmetic (no floating-point surprises)

`Math.round(bmi * 10) / 10` is wrong for exact halves: 41.6 kg at 160 cm is exactly 16.25 and must round to 16.3, but floating point gives 16.2. Use integers:

```ts
// weight to 0.1 kg and height to 0.1 cm, as entered
const w10 = Math.round(weightKg * 10);
const h10 = Math.round(heightCm * 10);
// BMI × 10, rounded half up: exact because every intermediate is an integer below 2^53
const bmi10 = Math.floor((2 * w10 * 1_000_000 + h10 * h10) / (2 * h10 * h10));
const bmi = bmi10 / 10; // band on bmi10 against 185, 250, 300
```

## 5. Safety tiers

Summary only; the full protocol is in [SAFETY.md](SAFETY.md).

| Tier | Automatic trigger | App behaviour |
| --- | --- | --- |
| 1 | PHQ-9 total 10 or more, or GAD-7 total 10 or more, with item 9 = 0 | Supportive message and referral list, no alarm wording (FR-25) |
| 2 | PHQ-9 item 9 above 0, checked on the phone the moment it is answered and before any network call; or a facilitator records observed or disclosed distress | Safety screen, session pauses (FR-11) |
| 3 | Facilitator only | Safety screen; facilitator follows the Tier 3 checklist (FR-41) |

Item 9 skipped (open question, SRS Section 10): proposed default is no automatic Tier 2, plus a discreet facilitator prompt (`checkItem9` returns `prompt_facilitator`).

## 6. Golden cases

Store them in `packages/rules/test/golden/v1.0.json` and run every case in a Node test and in a browser-build test (FR-09). Format:

```json
{ "id": "bmi-18.5-by-rounding", "domain": "bmi", "input": { "heightCm": 170, "weightKg": 53.4, "sex": "female" }, "expected": { "band": "normal", "value": 18.5 } }
```

| Domain | Case | Expected |
| --- | --- | --- |
| BMI | 170 cm, 53.1 kg (18.37) | 18.4 `underweight` |
| BMI | 170 cm, 53.4 kg (18.48, rounds up) | 18.5 `normal` |
| BMI | 170 cm, 71.9 kg | 24.9 `normal` |
| BMI | 170 cm, 72.2 kg (24.98, rounds up) | 25.0 `overweight` |
| BMI | 170 cm, 86.3 kg | 29.9 `overweight` |
| BMI | 170 cm, 86.6 kg (29.97, rounds up) | 30.0 `obesity` |
| BMI | 200 cm, 99.8 kg (exactly 24.95) | 25.0 `overweight` |
| BMI rounding trap | 160 cm, 41.6 kg (exactly 16.25) | 16.3 `underweight` |
| BMI rounding trap | 184 cm, 105.8 kg (exactly 31.25) | 31.3 `obesity` |
| Waist | male 93 / 94 / 101 / 102 | `not_increased` / `increased` / `increased` / `substantially_increased` |
| Waist | female 79 / 80 / 87 / 88 | `not_increased` / `increased` / `increased` / `substantially_increased` |
| Waist | sex not stated 79 / 80 | `not_increased` / `increased` |
| Blood pressure | 129/84 | `normal` |
| Blood pressure | 130/84 and 129/85 | `high_normal` |
| Blood pressure | 139/89 | `high_normal` |
| Blood pressure | 140/89 and 139/90 | `hypertension_range` |
| Blood pressure | 179/109 | `hypertension_range` |
| Blood pressure | 180/109 and 179/110 | `seek_care_today` |
| Blood pressure | 182/70 (systolic decides) and 120/112 (diastolic decides) | `seek_care_today` |
| AUDIT-C | male 3 / 4; female 2 / 3; not stated 2 / 3 | `lower_risk` / `attention` in each pair |
| AUDIT-C | item 1 = never | total 0, `lower_risk`, items 2 and 3 `NOT_APPLICABLE` |
| Activity | 149 moderate, 0 vigorous / 150 moderate, 0 vigorous | `below` / `meets` |
| Activity | 70 moderate + 40 vigorous (= 150) | `meets` |
| Activity | 120 moderate, vigorous skipped | `insufficient` |
| Diet | 4 / 5 servings | `below` / `meets` |
| PHQ-9 | totals 4/5, 9/10, 14/15, 19/20 | band changes at each pair |
| PHQ-9 | item 9 = 0 vs 1 | no Tier 2 vs Tier 2 |
| PHQ-9 | one item skipped, item 9 = 1 | `insufficient` band and Tier 2 still fires |
| GAD-7 | totals 4/5, 9/10, 14/15 | band changes at each pair |
| Tier 1 | PHQ-9 total 9 vs 10 with item 9 = 0; GAD-7 9 vs 10 | no Tier 1 vs Tier 1 |

## 7. Next-best-step planner (FR-33, proposed)

The planner turns a scored assessment into at most three focus areas, each with an approved recommendation, a simple target and the reason it was chosen. It looks at NCD domains only. Mental-wellness results never enter the plan (C-04); they get their own approved support content.

**Before the plan.** `bp seek_care_today` produces an urgent banner with approved seek-care text above everything else. It is a referral, not a focus area.

**Priority order** (highest first; the first three that apply become focus areas, the rest are listed under "Your other results"):

1. `bp` `hypertension_range`: confirm at a health centre (offers the clinic card, FR-40)
2. `tobacco` `attention`
3. `alcohol` `attention`
4. `activity` `below`
5. `diet` `below`
6. `waist` `substantially_increased`, or `bmi` `obesity`
7. `waist` `increased`, or `bmi` `overweight` or `underweight`
8. `bp` `high_normal`

Domains with `insufficient` are skipped. If nothing applies, the plan returns the approved "keep going" content and no targets.

**Targets**

| Domain | Target rule | Example |
| --- | --- | --- |
| Activity | `gap = 150 − (moderate + 2 × vigorous)`; `step = min(roundUpTo10(gap), 60)`. If `step >= 30`, suggest `roundUpTo5(step / 3)` minutes on 3 days; otherwise suggest `step` more minutes this week | 60 + 0 gives "about 20 more minutes on 3 days"; 140 + 0 gives "about 10 more minutes this week" |
| Diet | `step = min(5 − servings, 2)` more servings a day | 3 servings gives "add 2 servings a day"; 4 gives "add 1" |
| Tobacco, alcohol | Approved recommendation only, no number | |
| BMI, waist | Behaviour goals (activity, diet) and "talk to a health worker if you are concerned". **Never a weight target** | |
| BP | Approved confirm or lifestyle recommendation and the care directory | |

**Planner golden cases**

| Case | Inputs (other domains `ok`) | Expected focus areas |
| --- | --- | --- |
| P1 | female, AUDIT-C 3, activity 60 + 0, diet 3 | alcohol, activity (+20 min × 3 days), diet (+2 servings) |
| P2 | BP 142/91, tobacco yes, activity 100 + 10, diet 4 | bp confirm, tobacco, activity (+10 min × 3 days); diet under "other results" |
| P3 | BP 185/100, everything else `ok` | urgent banner, no focus areas |
| P4 | everything `ok` | no focus areas, "keep going" content |
| P5 | activity `insufficient`, diet 2 | diet (+2 servings) only |
| P6 | BMI 31.0, waist 90 (female) | waist and BMI as one focus area with behaviour goals, no weight number |

## 8. What-if simulator (FR-38)

`simulate()` re-scores a single behaviour domain with changed inputs and returns `{ before, after }` bands. Allowed changes: activity minutes, fruit and vegetable servings, AUDIT-C items, tobacco use. Anything else throws. The function is pure; the UI must not store or send its output.

## 9. Validation and measurement coaching

**Hard ranges** (SRS Section 5.4, reject with a plain message):

| Measurement | Unit | Accepted |
| --- | --- | --- |
| Height | cm | 120 to 220 |
| Weight | kg | 30 to 250 |
| Waist | cm | 40 to 200 |
| Systolic | mmHg | 70 to 260, and greater than diastolic |
| Diastolic | mmHg | 40 to 160 |
| Moderate or vigorous activity | minutes per week | 0 to 3000 |
| Fruit and vegetable servings | per day | 0 to 20 |

**Helpful rejections.** Height between 1.2 and 2.2 means metres were typed: say "Height is in centimetres, for example 165". Weight above 250 with a height in range likely means pounds or a typo: ask to check.

**Soft plausibility checks** (FR-34, proposed; ask "Please check this reading", never block):

- Pulse pressure (systolic minus diastolic) under 20 or over 100 mmHg.
- Systolic 180 or more, or diastolic 110 or more: suggest resting 5 minutes and measuring again before continuing. The value the participant finally enters is the one scored.
- BMI under 15 or over 50, or waist larger than height.

Whether a reading was re-checked is stored with the measurement. Averaging several blood-pressure readings (as WHO STEPS does) would change the scoring input, so it is a candidate for ruleset v1.1, not v1.0.

## 10. Changing a rule

Use the `/change-rule` skill. In short: write the change and its source here, add or update golden cases first, bump the ruleset version, get two approvals in the console (FR-46), publish, and never edit a published ruleset in place.
