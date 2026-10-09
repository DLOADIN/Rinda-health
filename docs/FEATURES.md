# Standout features

Rinda Health is more than forms and tables. These six features make it a safe, offline-first screening companion. Each one maps to requirements in [SRS.md](SRS.md) Section 11, where the acceptance criteria live. This file describes what people see and how each feature fits together.

| # | Feature | Why it is more than CRUD | Requirements |
| --- | --- | --- | --- |
| 1 | Works fully offline | Encrypted local drafts, on-device scoring, an idempotent sync queue and safe app updates | FR-28 to FR-31 |
| 2 | Rinda Guide and My Health Snapshot | A deterministic planner picks each person's most important metrics and next steps; an optional AI layer explains them; a rich results dashboard | FR-32 to FR-36 |
| 3 | Explainable results and What-if | Every band explains itself from the ruleset; a live simulator shows how habits change a band | FR-37, FR-38 |
| 4 | Safety net and care navigator | Offline crisis support, a verified service directory and a clinic-ready summary card with a QR code | FR-39 to FR-41 |
| 5 | Privacy shield | Quick exit, auto-lock, shared-phone mode and a personal data and consent centre | FR-42 to FR-44 |
| 6 | Research and facilitator console | Session mode with task timers, two-person content approval, live pilot insights and an audit trail | FR-45 to FR-48 |

## Baseline every feature inherits

- **Two languages.** English and Kinyarwanda everywhere, switchable at any moment without losing answers (FR-16, FR-21). Optional "Listen" read-aloud from approved recordings (FR-49).
- **Trauma-informed controls.** "Get help now" and Pause/Exit on every screen, every sensitive question skippable with no default answer, calm wording, no countdowns, no streaks, no shame (FR-05, FR-06, FR-12).
- **Educational, not diagnostic.** The purpose statement is on every result (FR-01).
- **Design system.** shadcn/ui components only, the Rinda palette, words plus icons for every band, 44 px tap targets ([DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)).
- **Privacy.** No names, phone numbers, IDs or free text anywhere, including the guide (C-06). Logs never hold health data (FR-15).
- **Offline.** Every participant-facing feature works in airplane mode once the phone is prepared (NFR-18).

## Pilot profile

Optional parts sit behind server-side flags (FR-50). Anything shown to pilot participants must be covered by the approved ethics protocol, so the pilot profile below is the default until the supervisor agrees otherwise.

| Flag | Development | Pilot | Reason |
| --- | --- | --- | --- |
| `offlineSync` | on | on | Encrypted offline drafts are already in the approved protocol (ethics B5.1) |
| `guideDeterministic` | on | on | Rule-based next steps from approved content; no AI |
| `guideGenerative` | on with synthetic data only | **off** | Ethics form B18 says no AI; needs an amendment and `ETHICS_AMENDMENT_REF` |
| `measurementCoach` | on | on | Guidance only; never changes a score |
| `progressTrends` | on | on | Appears only when two or more assessments exist |
| `whatIf` | on | on, confirm with supervisor | Educational, deterministic, nothing stored |
| `careNavigator` | on | on | The referral list is part of the approved protocol |
| `careGeolocation` | on | **off** | Location is not described in the protocol |
| `clinicCard` | on | on | Shows the participant's own values; nothing uploaded |
| `sharedDeviceMode` | on | on | Study phones are shared between participants |
| `readAloud` | on | off until recordings are approved | Recordings must be approved content (FR-49) |
| `usabilityEvents` | off | **off** unless the protocol covers screen timings | The facilitator records task outcomes instead (FR-45) |
| `pilotInsights` | on | on (staff only) | Aggregates for the evaluation chapter |

---

## Feature 1: Works fully offline

**Why.** Sessions run on a mobile hotspot that can drop, and many young people have patchy data. The proposal's RQ2 asks for an offline-tolerant tool. Losing someone's answers halfway through a sensitive questionnaire is a real harm.

**What people see**

1. Before a session the facilitator taps **Prepare this phone**. A checklist fills in: app, English pack, Kinyarwanda pack, questions, ruleset v1.0, referral list, storage space. It ends with an "Offline ready" card that shows a check icon and the word "Ready", so it never relies on colour, and lists every version (FR-28).
2. The participant answers questions. Each answer is saved, encrypted, on the phone as they go. A small Badge in the header reads "Offline: answers saved on this phone" when the network is gone.
3. They submit with no network. Results appear immediately, labelled "Saved on this phone, not sent yet" (FR-29).
4. When the network returns, the Sync centre shows Sending, then Sent. "Send now" forces a retry (FR-30).
5. If a new app version is ready, a Sonner toast offers it only after the questionnaire is finished.

**How it works.** The service worker precaches the app shell and the active content manifest. Drafts and the outbox live in IndexedDB, encrypted with AES-GCM. The same `@rinda/rules` package scores on the phone and on the server, and the server's re-score is authoritative. Every submission carries an Idempotency-Key generated when the assessment starts, so retries never duplicate. Full design in [OFFLINE.md](OFFLINE.md).

**shadcn components.** Card, Progress, Badge, Button, Sonner, Alert, Skeleton, Spinner.

**Done when.** The Playwright offline suite completes the whole flow in Chromium and WebKit with the network off, three queued submissions arrive exactly once, and IndexedDB holds only ciphertext.

---

## Feature 2: Rinda Guide and My Health Snapshot

### 2a. My Health Snapshot (the metrics dashboard)

**Why.** A results page that lists numbers does not change behaviour. People need to see where they stand, why, and the one thing to do next. The proposal measures comprehension and usefulness, so the dashboard is part of the evaluation.

**Mobile layout (360 px and up)**

```
┌──────────────────────────────────────┐
│ Rinda   EN | RW        Exit          │  header: language ToggleGroup, quick exit
│ Educational, not a diagnosis.        │  Alert (muted)
├──────────────────────────────────────┤
│ YOUR NEXT BEST STEP                  │  Card, primary emphasis (FR-33)
│ Walk 20 more minutes on 3 days       │
│ this week.                           │
│ Why this?        Ask Rinda           │
├──────────────────────────────────────┤
│ Body and lifestyle                   │  NCD section
│ ┌───────────────┐ ┌───────────────┐  │
│ │ Blood pressure│ │ Activity      │  │  domain Cards: 2 columns from 400 px
│ │ 142/91 mmHg   │ │ 60 of 150 min │  │
│ │ [Confirm at a │ │ [Below        │  │  band Badge: word + icon + colour
│ │  health centre│ │  recommended] │  │
│ │ ▁▃▅▇ marker   │ │ ◔ progress    │  │  mini visual
│ └───────────────┘ └───────────────┘  │
│ Tobacco · Alcohol · Fruit and veg ·  │
│ BMI · Waist                          │
├──────────────────────────────────────┤
│ Mood and stress (private)        ▸   │  Collapsible, closed by default
├──────────────────────────────────────┤
│ [ Get help now ]                     │  sticky bar on every screen (Drawer)
└──────────────────────────────────────┘
```

On tablets and laptops the domain cards form a 3- or 4-column grid and the next-step card sits beside the grid.

**Card anatomy (FR-10, FR-32).** Domain name, the person's value with units, a band Badge (word, lucide icon and band colour), the recommended target, a mini visual, then two links: **Why?** (FR-37) and **What can I do?** (approved recommendation, What-if). Missing inputs show a dashed outline and "Not enough information".

**Visuals per domain** (shadcn Chart, which wraps Recharts):

| Domain | Card visual | Detail page visual |
| --- | --- | --- |
| Blood pressure | Two short band bars (systolic, diastolic) with a marker | Band map: systolic against diastolic with shaded band zones and the person's point |
| Physical activity | Radial progress toward 150 minutes | Stacked bar: moderate plus 2 × vigorous against the 150 line |
| Fruit and vegetables | Five dots, filled up to today's servings | Same, with the salt information note |
| Alcohol | AUDIT-C 0 to 12 scale with the threshold marker for the person's sex | Item-by-item breakdown |
| Tobacco | Status icon and text, no chart | Approved quit-support content |
| BMI | Segmented band bar with a marker | Same, with neutral wording and no weight target |
| Waist | Segmented band bar with the sex-specific cut-offs | Same |
| PHQ-9 and GAD-7 | Shown only after the person opens the private section; soft blush styling, no red | Scale with non-clinical labels and the support list |

Every chart is decorative to screen readers (`aria-hidden`) and paired with a visible sentence or a table carrying the same numbers.

**Mental wellness stays separate (C-04).** The section is collapsed by default and opens with "Show my mood and stress results". Results use the `band-wellness` style for every band so nothing looks alarming; the band words carry the meaning. A score of 10 or more shows the Tier 1 message and the support list (FR-25).

**Trends (FR-35).** With two or more assessments, the History tab shows a line chart per domain with shaded band zones and a vertical marker wherever the ruleset version changed.

**shadcn components.** Card, Badge, Chart, Tabs, Collapsible, Progress, Alert, Button, Separator, Tooltip on desktop only (use Popover on touch), Skeleton, Empty.

### 2b. Rinda Guide (the AI agent)

**Why.** "Make sure every individual is given the best metrics": each person should know which of their numbers matter most, whether those numbers were measured well, and what to do about them, in words they understand.

The guide is an agent built from five parts. Only the explainer uses AI, and only when the flag is on.

| Part | What it does | AI? | Pilot |
| --- | --- | --- | --- |
| Planner | Ranks the person's results, picks up to three focus metrics in the approved priority order, attaches a simple target ("add 1 serving a day") and the reason (FR-33) | No, deterministic in `@rinda/rules` | On |
| Measurement coach | Checklists before blood pressure and body measurements, unit-mistake detection and soft re-check prompts, so the metrics themselves are trustworthy (FR-34) | No | On |
| Template composer | Answers each question chip by assembling approved content and the planner's output; works offline | No | On |
| Explainer | Rewrites the composer's answer in warmer, more personal plain language, in response to the same chips (FR-36) | Yes, Gemini on the server | **Off** |
| Validator | Checks every generated answer: numbers unchanged, sources approved, no diagnosis words, no phone numbers or mental-wellness content; otherwise falls back to the template | No | n/a |

**What people see.** An "Ask Rinda" button on the dashboard and on each domain page opens a Drawer of question chips, for example "What do my results mean?", "What is one small step I can start this week?", "Why does blood pressure matter at my age?" and "Make me a simple plan for this week". There is no text box, so no free text is ever collected (C-06). Answers appear in a Card. A small Badge says where the answer came from: "From approved guidance" or "Written by Rinda's guide from your results". A Sources Collapsible lists the approved content used, and follow-up chips continue the conversation. Seek-care and safety messages always come from approved templates and are shown above any guide answer.

Full design, prompts, guardrails and evaluation in [AI_GUIDE.md](AI_GUIDE.md).

**shadcn components.** Drawer (mobile) or Sheet (desktop), Button, Card, Badge, Collapsible, Skeleton, Alert.

---

## Feature 3: Explainable results and What-if

**Why.** Trust grows when people can see exactly how a result was made. Seeing that "two more 20-minute walks would get me to the recommendation" turns a band into a plan.

**Why this result (FR-37).** Every domain detail page has an Accordion: "What we used" (the inputs), "The rule" (threshold, source citation, ruleset version), "What would change it" (the nearest threshold in plain words). The text is generated from the published ruleset, so it always matches the "How results are calculated" page (FR-23).

**What-if (FR-38).** A "Try a change" panel on behaviour domains only:

| Domain | Controls |
| --- | --- |
| Physical activity | Sliders for moderate and vigorous minutes per week, with steppers for precise values |
| Fruit and vegetables | Stepper (ButtonGroup with Input) for servings per day |
| Alcohol | Select for each AUDIT-C item |
| Tobacco | Switch: "If I stopped using tobacco" |

The panel shows "Now: Below recommended" and "With this change: Meets recommendation" as two Badges, recalculated on the phone by `@rinda/rules` as the controls move. It is labelled "Simulation. Nothing is saved." Nothing is stored or sent. Weight, BMI, waist and blood pressure are deliberately excluded: weight targets can harm people with a difficult relationship with food, and blood pressure needs a health worker.

**shadcn components.** Accordion, Slider, ButtonGroup, Input, InputGroup, Select, Switch, Badge, Card, Button.

---

## Feature 4: Safety net and care navigator

**Why.** Screening without a way to act is unethical. The ethics application promises a referral list, a tiered distress protocol and help on every screen.

**Get help now (FR-12, FR-41).** A sticky button on every screen opens a Drawer with large call buttons for the confirmed numbers (SAMU 912, emergency 112, RBC 114 and the others in the approved referral list), a "Find a health centre" link and, during facilitated sessions, "Talk to the facilitator now". It works offline because the referral list is precached.

**Safety screen (FR-11, FR-41).** When PHQ-9 item 9 is above 0 the phone shows the safety screen at once, before any network call. It is calm (Bone background, rose call buttons, short sentences) and pauses the session. Safety events queue encrypted and sync later without any answers. See [SAFETY.md](SAFETY.md).

**Care directory (FR-39).** A list of verified services from the approved referral-list version: hotlines, health centres, Isange One Stop Centres and counselling services, each with type, district and sector, hours, languages, cost and a tap-to-call Button. Filter by district or sector with a Select. Each entry shows the date it was last verified. On-device distance sorting exists behind `careGeolocation`, which is off for the pilot; location never leaves the phone.

**Clinic-ready card (FR-40).** When a result recommends a health-centre visit (for example blood pressure in the confirm band), "Show a nurse" opens a full-screen Card: date, measured values, bands, ruleset version and the statement "Educational screening, not a diagnosis", plus a QR code holding the same plain text so a health worker can scan it. No study code or identifier. Generated on the phone.

**shadcn components.** Drawer, Button, Item, Select, Badge, Card, Dialog, Alert, Separator.

---

## Feature 5: Privacy shield

**Why.** Study phones are shared, family members may look over a shoulder, and the questions are sensitive. Rwanda's Law No. 058/2021 gives people rights over their data.

- **Quick exit (FR-42).** An "Exit" button in the header (door icon and the word) and Escape pressed twice replace the screen with the neutral screen, clear health data from memory and replace the history entry so Back shows nothing.
- **Auto-lock (FR-42).** After 3 idle minutes (configurable) the app shows a lock screen; the PIN (InputOTP) reopens it. "Lock when I leave the app" is an optional Switch, off by default so calling a hotline does not lock someone out.
- **Shared-phone mode (FR-43).** A Switch at sign-in, on by default on study phones. Nothing stays after sign-out: the app wipes drafts, the outbox once sent and the keys, then shows "This phone is clear". If anything is still unsent, the wipe waits until it is sent or the facilitator confirms.
- **My data and consent (FR-44).** Tabs: "What we keep" and "What we never keep" in plain words; "My consent" with each choice, its document version and time, and Switches to change optional consents from now on (each change is a new consent event); "My data" with a download of the person's own results (with a warning on shared phones) and deletion-request status (FR-18).

**shadcn components.** Button, InputOTP, Switch, Tabs, Card, AlertDialog, Badge, Table.

---

## Feature 6: Research and facilitator console

**Why.** The capstone is judged on its evaluation. The console turns sessions into clean, de-identified evidence for the targets in proposal Table 12, and it enforces the content governance the ethics committee expects.

The console lives at `/staff`, is code-split from the participant app and never precached. It uses the shadcn Sidebar layout.

| Area | What it does | Requirements |
| --- | --- | --- |
| Sessions | Start a session for a study code; show the AB or BA order read-only; task checklist with timers and outcomes (completed, with help, not completed); record observed distress; Tier 3 checklist; end session | FR-24, FR-45, FR-13, FR-41 |
| Participants | Generate study codes with order assignments | FR-26 |
| Content | Versions per content type and language, field-by-field diff, approvals by reviewer type, publish only after two approvals from two different people | FR-20, FR-46 |
| Pilot insights | KPI cards and charts for task completion (target 80% or more), SUS mean (68 or more), comprehension (80% or more), relevance B minus A (median above 0), usefulness and cultural fit (median 4 or more), sync health, safety events by tier | FR-47 |
| Exports | De-identified CSV with versions and a data dictionary; every export logged | FR-19 |
| Deletions | Requests and completion within 14 days | FR-18 |
| Audit log | Append-only list of staff actions | FR-48 |
| Flags | Feature switches per environment; `guideGenerative` stays disabled without an ethics amendment reference | FR-50 |

**shadcn components.** Sidebar, Data Table pattern (Table with TanStack Table), Card, Chart, Badge, Tabs, Dialog, AlertDialog, RadioGroup, Button, Select, Breadcrumb, Pagination, Command, Kbd, Sonner.

---

## Deliberately left out

| Idea | Why not |
| --- | --- |
| Free-text chat with the guide | Collects free text (C-06) and opens the door to crisis disclosures the app cannot handle safely |
| SMS or USSD reminders | Needs phone numbers (C-06) |
| Streaks, points and badges | Guilt and shame mechanics conflict with trauma-informed design |
| Weight-loss targets | Can harm people with eating difficulties; behaviour goals are used instead |
| Combined health score | Forbidden by C-04 |
| Links to national health systems | Out of scope (SRS Section 3.3) |
