# Rinda Health: Software Requirements Specification

Version 1.1, 4 October 2026. Living copy for development.

Trauma-informed NCD and mental-wellness risk-screening progressive web app. Derived from the final mission capstone proposal (18 September 2026). Structure follows ISO/IEC/IEEE 29148.

> **How to use this file.** This is the requirements source of truth for the project. Version 1.0 was delivered as `Rinda_Health_SRS.docx` (1 October 2026) and stays the version reviewed with the proposal. Edit requirements here, keep IDs stable, never reuse a retired ID, and record every change in the table below.

| Version | Date | Change |
| --- | --- | --- |
| 1.0 | 1 Oct 2026 | Delivered as Rinda_Health_SRS.docx. |
| 1.1 | 4 Oct 2026 | Section 9 stack now names shadcn/ui as the only component library. NFR-04 verification no longer cites Lighthouse PWA audits, which Lighthouse 12 removed. Added Section 11: six standout features (FR-28 to FR-50, NFR-15 to NFR-18). |
| 1.2 | 5 Oct 2026 | C-07 and NFR-14: pilot data on supervisor-approved Neon hosting instead of Rwanda or Article 50 (ADR-014). |
| 1.5 | 9 Oct 2026 | Section 14: email reports (FR-58, revised 10 Oct 2026), charts (FR-59), Gemini for Ask Rinda (ADR-019), offline check-ups. |
| 1.4 | 7 Oct 2026 | Section 13: open sign-up for every role with email or phone and a password or Google (replaces study codes, PINs and invite-only staff accounts); plain SQL on PostgreSQL instead of Prisma; `frontend/` and `backend/` folders with a single-file API; role dashboards. C-06 and FR-03 updated. See ADR-016 to ADR-018. |
| 1.3 | 6 Oct 2026 | Added Section 12: staff sign-in with Google or an SMS one-time code, role-based authorisation, staff account management and staff sessions (FR-51 to FR-55, NFR-19). Section 3.4 admin auth routes and Section 7.1 AdminUser updated. Participants keep study code and PIN (FR-03, C-06 unchanged). See ADR-015. |

## 1. Introduction

### 1.1 Purpose

This document specifies what the Rinda Health prototype must do and how well it must do it. It turns the proposal's functional and non-functional requirements (Tables 13 and 14), scoring rules (Table 7), safety protocol (Section 3.2.7) and ethics commitments (Section 1.10) into testable requirements. It is written for the student developer, the supervisor, the health reviewers and the ethics committee, and it is the reference against which the prototype is built and tested.

### 1.2 Product scope

Rinda Health is a progressive web app (PWA) that lets Rwandan adults aged 18 to 35 complete a short, private screening of six NCD risk-factor domains (tobacco, alcohol, physical activity, diet, body size, blood pressure) and, optionally, the PHQ-9 and GAD-7. It shows a separate, explained, educational result for each domain, never a combined score, and points the person to real services. It is used in facilitated pilot sessions with 15 participants and 5 to 6 key informants in Kigali.

The product is educational and non-diagnostic. It is not an emergency service, does not train or use any machine-learning model, does not connect to national health systems, and does not use laboratory tests, wearables or a generative model.

### 1.3 Definitions

| Term | Meaning in this document |
| --- | --- |
| Participant | A consented study participant who uses the app with a study code. |
| Facilitator | The trained student researcher running a session. |
| Researcher-admin | The person who manages participant codes, publishes approved content and exports de-identified data. |
| Reviewer | The supervisor, clinician key informant or mental-health key informant who approves content. |
| Domain | One of the eight independently scored areas: six NCD domains and two optional mental-wellness instruments. |
| Band | An educational category produced by a versioned rule, for example "Below recommended". Not a diagnosis. |
| Ruleset version | An immutable, approved set of scoring thresholds, for example v1.0. |
| Content version | An immutable, approved version of questions, recommendations, referral list or consent text in one language. |
| Draft | An unfinished assessment stored encrypted on the device. |
| Idempotency key | A unique identifier sent with a submission so that retries never create a duplicate assessment. |
| Safety event | A record of a Tier 1, 2 or 3 response: tier, trigger type, time and actions, never the answers. |
| Missingness code | The reason a value is absent: SKIPPED, MODULE_DECLINED, DONT_KNOW or NOT_APPLICABLE. |

### 1.4 References

- Rinda Health final mission capstone proposal, 18 September 2026, Sections 1.5, 1.10, 2.6 to 2.9 and Chapter 3.
- Law No. 058/2021 relating to the protection of personal data and privacy (Rwanda).
- ISO/IEC/IEEE 29148:2018, Systems and software engineering: Life cycle processes, Requirements engineering.
- WCAG 2.2 (W3C, 2023); scoring sources as listed in proposal Table 7.

### 1.5 Priority scheme

Each requirement has a priority. **Must**: required for the pilot; the pilot cannot run without it. **Should**: expected for the pilot; can be cut only with supervisor agreement. **Could**: included if time allows.

## 2. Overall description

### 2.1 Product perspective

Rinda Health is a standalone system with three parts: a React and TypeScript PWA client, a Node.js and TypeScript REST API, and a PostgreSQL database. A shared TypeScript rules package holds the deterministic scoring and safety-check logic and is used by both the client and the API, so the same code produces the same result in both places. Approved content (questions, recommendations, referral list, consent text) is stored as versioned JSON files with approval metadata and loaded into the database at deployment.

### 2.2 Product functions

- Participant code sign-in with a personal PIN, eligibility confirmation and layered, versioned consent.
- Minimal profile in bands: age band, sex (including "prefer not to say"), district band, preferred language.
- Questionnaire for six NCD domains and the optional PHQ-9 and GAD-7 module, with skip, pause and exit on every screen.
- Optional measurements with validation and explicit units.
- Encrypted offline drafts and an offline submission queue with idempotent sync.
- Deterministic, versioned, per-domain results with contributing factors, completeness, source, limitations and reviewed recommendations.
- On-device safety check on PHQ-9 item 9, a "Get help now" button on every screen, and safety-event recording.
- Assessment history, usability and baseline-comparison feedback, withdrawal and deletion requests.
- Admin functions: participant codes, content publishing with approval records, deletion handling, de-identified export.

### 2.3 User classes

| User class | Description | Main needs |
| --- | --- | --- |
| Participant | Rwandan adult aged 18 to 35, Kigali or peri-urban, varied digital skills, English or Kinyarwanda | Simple large controls, privacy, control over sensitive questions, clear and calm results |
| Facilitator | Student researcher trained in psychological first aid | Start sessions, see order assignment (AB/BA), record observed-distress safety events, wipe study devices |
| Researcher-admin | Student researcher | Generate codes, publish approved versions, process deletions, export de-identified data |
| Reviewer | Supervisor, clinician, mental-health professional, bilingual researcher | Review content and rules; approvals are recorded against each version |

### 2.4 Operating environment

- Client: current Chrome and Samsung Internet on Android, and Safari on iOS 16.4 or later, on phones with screens from 360 px wide. Installable to the home screen; works in the browser without installing.
- Server: Node.js 22 LTS, Express, PostgreSQL 16, packaged with Docker.
- Hosting: any provider for development with synthetic data only. Pilot data on a server located in Rwanda, or elsewhere only with the authorisation Article 50 of Law No. 058/2021 requires.
- Session hardware: study smartphone, validated automatic upper-arm blood pressure monitor, weighing scale, measuring tape, mobile Wi-Fi hotspot.

### 2.5 Design and implementation constraints

| ID | Constraint | Source |
| --- | --- | --- |
| C-01 | The client is a PWA. No native Android or iOS app is built. | Proposal 1.5; user decision 28 Sep 2026 |
| C-02 | All server code is Node.js and TypeScript. No Python anywhere in the system. | User decision 28 Sep 2026 |
| C-03 | Scoring is deterministic and rule-based. No machine-learning or generative model in the MVP. | Proposal 1.5, 1.10.7 |
| C-04 | NCD and mental-wellness results are calculated, stored and shown separately. No combined score. | Proposal 1.4 |
| C-05 | Only approved, published content and rules reach participants. | Proposal 3.2.8, FR-20 |
| C-06 | No national ID numbers, GPS or free-text answers are stored in the application. Email addresses and phone numbers are stored only to sign people in (participants and staff), with an optional display name, and are removed when a deletion request is completed (Section 13, ADR-017). | Proposal 1.10.1; v1.3; v1.4 |
| C-07 | Pilot data hosted on the supervisor-approved PostgreSQL service (Neon, ADR-014); any personal identifiers collected are deleted within about 72 hours. | Proposal 2.6; supervisor approval 5 Oct 2026 |
| C-08 | No participant data collected before ethics approval. | Proposal 1.10 |

### 2.6 Assumptions and dependencies

- Ethics approval (ALU, and RNEC if required) is granted before the pilot. If the PHQ-9 item-9 procedure is not approved, the PHQ-8 is used (FR-11 then applies only to observed distress).
- Key informants approve the ruleset v1.0, questions, recommendations, referral list and the Kinyarwanda translations before the pilot.
- Referral numbers (112, 114, 912, 3512, 3029) and facility list are confirmed before the pilot.
- Sessions provide Wi-Fi; offline behaviour is still required because connectivity can drop.

## 3. External interface requirements

### 3.1 User interface

Screens: Welcome and purpose statement; Sign in with study code and PIN; Eligibility; Consent (summary, full sheet, four separate un-ticked choices); Profile; Questionnaire sections (one question per screen, large tap targets); Mental-wellness introduction and opt-in; Measurements; Review and submit; Results overview with one card per domain; Domain detail; "How results are calculated"; History; Feedback; Settings (language, withdraw); Get help now; Neutral exit screen; Safety screen. Every screen shows the Get help now button and the Pause/Exit control.

### 3.2 Hardware interfaces

None directly. Blood pressure, weight, height and waist values are typed in by the participant or facilitator from the session devices; the app records whether a value was measured in session or recalled.

### 3.3 Software interfaces

- PostgreSQL 16 through Prisma ORM; schema changes through Prisma Migrate.
- Browser APIs: Service Worker, Cache Storage, IndexedDB, Web Crypto (AES-GCM), Web App Manifest.
- No interface to DHIS2, OpenMRS, e-Ubuzima or any other national system.

### 3.4 Communications and API

All traffic is HTTPS (TLS 1.2 or later). The API is JSON over REST, versioned under /api/v1. Requests are validated with Zod schemas shared with the client. Participant requests carry an opaque session token; admin requests carry an admin session token with a role.

| Method and path | Purpose | Notes |
| --- | --- | --- |
| POST /api/v1/auth/participant | Sign in with study code and PIN; first use sets the PIN | Rate-limited; returns opaque token |
| GET /api/v1/content/manifest?lang= | Published questionnaire, ruleset, recommendation, referral and consent versions | Cached by the service worker |
| POST /api/v1/consents | Record a consent event per scope | Stores consent document version and time |
| PUT /api/v1/profile | Save banded profile |  |
| POST /api/v1/assessments | Submit an assessment; returns per-domain results | Requires Idempotency-Key header; same key returns the original result |
| GET /api/v1/assessments, GET /api/v1/assessments/:id | History and one result | Own data only |
| POST /api/v1/safety-events | Record a Tier 1, 2 or 3 event | No answer content accepted by schema |
| POST /api/v1/feedback | SUS, usefulness, trust, cultural fit and baseline comparison items | Versioned feedback form |
| POST /api/v1/deletion-requests | Withdraw and request deletion |  |
| GET /api/v1/admin/auth/google/start, GET /api/v1/admin/auth/google/callback | Staff sign-in with Google (FR-51) | OpenID Connect with PKCE; only pre-registered staff emails |
| POST /api/v1/admin/auth/sms/request, POST /api/v1/admin/auth/sms/verify | Staff sign-in with an SMS one-time code (FR-52) | Rate-limited; same response whether or not the number is registered |
| POST /api/v1/admin/auth | Break-glass staff sign-in with email and password (FR-52) | Argon2id password hash; researcher-admin only |
| POST /api/v1/admin/auth/signout, GET /api/v1/admin/me | Sign out; current staff member, role and permissions (FR-55) |  |
| GET, POST, PATCH /api/v1/admin/staff | List, invite, change role or deactivate staff accounts (FR-54) | Researcher-admin only |
| POST /api/v1/admin/participants | Generate study codes and order assignment | Researcher-admin only |
| GET, PATCH /api/v1/admin/deletion-requests | List and complete deletion requests | Completion within 72 hours |
| POST /api/v1/admin/content/publish | Publish an approved content or ruleset version | Refused without approval records |
| GET /api/v1/admin/exports/:dataset | De-identified CSV export with data dictionary and versions | Each export logged |
| GET /api/v1/health | Health check | No data |

## 4. Functional requirements

Requirements FR-01 to FR-20 carry the proposal's numbering (Table 13) so the proposal and this document stay traceable. FR-21 onwards are requirements the proposal describes in its text but does not list in Table 13. Each requirement has acceptance criteria that become tests.

### 4.1 Access, eligibility and consent

| ID | Requirement | Priority | Acceptance criteria |
| --- | --- | --- | --- |
| FR-01 | Show the purpose (educational, non-diagnostic, not an emergency service) before any health data are collected, and on every result. | Must | The statement appears on the welcome screen and on every result screen; no health question is reachable before it is acknowledged. |
| FR-02 | Confirm age eligibility (18 to 35) and capture layered, versioned consent with four separate, un-ticked choices: core study, mental-wellness module, audio recording, follow-up contact. | Must | Ineligible users see the referral list and cannot proceed. Each choice is stored as its own consent event with document version, language and time. Declining the mental-wellness choice hides that module. |
| FR-03 | Allow sign-up and sign-in with an email address or phone number and a password, or with Google; store only a minimal banded profile (v1.4, replaces study code and PIN). | Must | No national ID field exists. Passwords stored as Argon2id hashes. Five failed attempts lock the account for 15 minutes. |
| FR-21 | Record preferred language and allow switching language at any point without losing answers. | Must | Switching language mid-questionnaire keeps every answer; the language used is stored with the assessment. |

### 4.2 Questionnaire and trauma-informed controls

| ID | Requirement | Priority | Acceptance criteria |
| --- | --- | --- | --- |
| FR-04 | Load the published questionnaire version and save and resume an encrypted draft on the device. | Must | Closing the browser and reopening restores the draft. The draft in IndexedDB is ciphertext only (AES-GCM, non-extractable key). |
| FR-05 | Allow every sensitive question and the whole mental-wellness module to be skipped, with no penalty and no default answer. | Must | A skipped item is stored with missingness code SKIPPED, never as 0. The module can be declined with one tap and is recorded as MODULE_DECLINED. |
| FR-06 | Allow immediate pause or exit to a neutral screen from every screen. | Must | Exit reaches the neutral screen in one tap and shows no health content. Exit clears the draft if the participant chooses "discard"; "pause" keeps it. |
| FR-22 | Before the mental-wellness module, explain what the questions cover, that they are optional, and what happens if an answer suggests risk. | Must | The introduction screen is shown before the first PHQ-9 item and requires an explicit "continue" or "skip module". |

### 4.3 Measurements

| ID | Requirement | Priority | Acceptance criteria |
| --- | --- | --- | --- |
| FR-07 | Validate optional measurements against approved ranges and explicit units, and record whether each was measured in session or recalled, with its date. | Must | Values outside the plausible ranges in Section 5.4 are rejected with a plain message. Units are shown next to each field. Missing values give "not enough information" for that domain. |

### 4.4 Submission and sync

| ID | Requirement | Priority | Acceptance criteria |
| --- | --- | --- | --- |
| FR-08 | Submit assessments idempotently and tolerate loss of connectivity. | Must | Offline submissions wait in the encrypted queue and are sent when the app opens or connectivity returns (no reliance on Background Sync, which Safari lacks). Ten repeated submissions with one key create exactly one assessment. |

### 4.5 Scoring and results

| ID | Requirement | Priority | Acceptance criteria |
| --- | --- | --- | --- |
| FR-09 | Calculate deterministic, versioned, per-domain results using the rules in Section 5. | Must | The same inputs and ruleset version always produce identical normalised output on client and server. Every golden case in Section 5.3 passes. |
| FR-10 | For each domain, show the band in words and an icon (not colour alone), the contributing factors, data completeness, threshold source, limitations and reviewed recommendations. | Must | Each result card has all six elements. Mental-wellness results use non-clinical labels and always show the referral list. |
| FR-23 | Provide a "How results are calculated" page listing every rule and its citation in plain language. | Must | The page is generated from the published ruleset, so it always matches the version in use. |
| FR-24 | Provide the non-personalised information page (baseline condition A) and present conditions in the participant's assigned AB or BA order. | Must | Order comes from the pre-generated assignment list; the facilitator cannot change it in the app. |

### 4.6 Safety

| ID | Requirement | Priority | Acceptance criteria |
| --- | --- | --- | --- |
| FR-11 | Run the safety check on the device as soon as PHQ-9 item 9 is answered, before any network call, and show the safety screen when item 9 is above 0. | Must | Works in airplane mode. Item 9 = 1, 2 or 3 shows the safety screen immediately; 0 does not. If the PHQ-8 fallback is configured, item 9 is not asked. |
| FR-12 | Show a "Get help now" button on every screen that opens the referral list in one tap, including offline. | Must | The referral list is part of the cached app shell; Playwright test opens it offline from every route. |
| FR-13 | Record safety events with tier, trigger type (item 9, score threshold, observed, disclosed), time and actions taken, without any response content. | Must | The schema rejects any field holding answers or scores. Facilitators can record observed-distress events from a facilitator screen. |
| FR-25 | Show Tier 1 supportive message and referral list when PHQ-9 or GAD-7 total is 10 or more and item 9 is 0. | Must | Boundary tests at 9 and 10 for both instruments. |

### 4.7 History, feedback and withdrawal

| ID | Requirement | Priority | Acceptance criteria |
| --- | --- | --- | --- |
| FR-14 | Display assessment history and mark when two results were produced by different ruleset versions. | Should | History lists date and version; a notice appears when versions differ. |
| FR-17 | Collect versioned usability (SUS) and baseline-comparison feedback after the session. | Must | Feedback is stored with the feedback-form version and linked to the participant code only. |
| FR-18 | Allow withdrawal and deletion requests at any time, completed under the retention schedule. | Must | A request creates a record visible to the admin; completion within 72 hours (agreed with the supervisor, 9 October 2026) deletes all the participant's application data and records the completion date. |

### 4.8 Privacy, content governance and administration

| ID | Requirement | Priority | Acceptance criteria |
| --- | --- | --- | --- |
| FR-15 | Exclude answers, measurements and results from all logs and analytics. | Must | An automated test runs the end-to-end suite, collects all logs and finds zero sensitive values. No third-party analytics. |
| FR-16 | Offer all participant content in English and Kinyarwanda, with language switching at any time. | Must | No hard-coded user-facing strings (lint rule). Every key exists in both language files before a pilot release. |
| FR-19 | Allow authorised de-identified research export with version metadata and missingness codes. | Must | Export contains no PIN hashes or tokens; includes questionnaire, ruleset, content and data-dictionary versions; each export is logged with admin and time. |
| FR-20 | Serve only content and rules marked as approved, with approver role and date. | Must | Publishing a version without approval records fails. Draft versions are never returned by the manifest endpoint. |
| FR-26 | Allow the researcher-admin to generate study codes with order assignments, and to sign in with a role. | Must | Codes are random, at least 8 characters, unambiguous characters only. |
| FR-27 | Allow the facilitator to clear all app data on a study device at the end of a session. | Must | "End session and wipe" removes the draft, queue, key and cached participant data; a check screen confirms storage is empty. |

## 5. Scoring and safety rules (ruleset v1.0)

These rules restate proposal Table 7 precisely enough to implement and test. They are subject to approval by the supervisor and health reviewers (FR-20). Every domain is scored independently. If any input needed for a domain is missing, that domain shows "Not enough information". Band labels are placeholders for content review.

### 5.1 Domain rules

| Domain | Inputs | Rule | Source |
| --- | --- | --- | --- |
| Tobacco | Current use of smoked or smokeless tobacco (yes/no) | Yes: Attention. No: No reported risk. | WHO STEPS (2024) |
| Alcohol | AUDIT-C items 1-3, each 0-4; total 0-12 | Male ≥4, female ≥3, sex not stated ≥3: Attention. Otherwise: Lower risk. If item 1 is "never", total is 0. | Bush et al. (1998); Bradley et al. (2007) |
| Physical activity | Moderate minutes per week; vigorous minutes per week | Moderate-equivalent = moderate + 2 × vigorous. Below 150: Below recommended. 150 or more: Meets recommendation. | Bull et al. (2020) |
| Diet | Fruit and vegetable servings per day; adds salt at table | Below 5 servings: Below recommended; 5 or more: Meets recommendation. Salt: information message only, no band. | WHO (2020); WHO (2012) |
| Body size: BMI | Height (cm), weight (kg) | BMI = kg / m², rounded to one decimal (half up) before banding. <18.5 underweight; 18.5-24.9 normal; 25.0-29.9 overweight; ≥30.0 obesity. | WHO (2000) |
| Body size: waist | Waist circumference (cm), sex | Male: ≥94 increased, ≥102 substantially increased. Female or not stated: ≥80 increased, ≥88 substantially increased. | WHO (2011) |
| Blood pressure | Systolic and diastolic (mmHg); source and date | Band is the higher of the systolic and diastolic categories. <130 and <85 normal; 130-139 or 85-89 high-normal; ≥140 or ≥90 hypertension range, confirm at a health centre; ≥180 or ≥110 seek care today. | Unger et al. (2020); WHO (2021b) |
| Depressive symptoms (optional) | PHQ-9 items 1-9, each 0-3; total 0-27 | All 9 items needed for a band. 0-4 minimal; 5-9 mild; 10-14 moderate; 15-19 moderately severe; 20-27 severe; shown with non-clinical labels. | Kroenke et al. (2001) |
| Anxiety symptoms (optional) | GAD-7 items 1-7, each 0-3; total 0-21 | All 7 items needed. 0-4 minimal; 5-9 mild; 10-14 moderate; 15-21 severe; non-clinical labels. | Spitzer et al. (2006) |

### 5.2 Safety tiers

| Tier | Automatic trigger | App behaviour | Facilitator action |
| --- | --- | --- | --- |
| Tier 1 | PHQ-9 ≥10 or GAD-7 ≥10, with PHQ-9 item 9 = 0 | Supportive message and referral list (114, nearest health centre); no alarm wording | Verbal check-in at end of session; participant decides whether to continue |
| Tier 2 | PHQ-9 item 9 > 0 (on device, immediately), or facilitator records observed or disclosed distress | Safety screen with referral list; session pauses | Follow the written script; offer same-day warm handover to on-call professional |
| Tier 3 | Facilitator only: stated plan or intent, or cannot keep safe | Safety screen | Stay with participant; call 912 or 112; contact on-call professional; inform supervisor within one hour |

Open question for the mental-health reviewer: what should happen if PHQ-9 item 9 is skipped. Proposed default: no automatic Tier 2, but the facilitator receives a discreet prompt to check in.

### 5.3 Golden boundary cases

The automated suite must include at least these cases, each run on both client and server builds of the rules package.

| Domain | Boundary inputs and expected bands |
| --- | --- |
| BMI | 18.4 underweight / 18.5 normal; 24.9 normal / 25.0 overweight; 29.9 overweight / 30.0 obesity; 24.95 rounds to 25.0 overweight |
| Waist | Male 93 / 94 / 101 / 102; female 79 / 80 / 87 / 88; sex not stated 79 / 80 |
| Blood pressure | 129/84 normal; 130/84 and 129/85 high-normal; 139/89 high-normal; 140/89 and 139/90 hypertension range; 179/109 hypertension range; 180/109 and 179/110 seek care today |
| AUDIT-C | Male 3 / 4; female 2 / 3; not stated 2 / 3 |
| Physical activity | 149 moderate / 150 moderate; 70 moderate + 40 vigorous = 150 meets |
| Diet | 4 / 5 servings |
| PHQ-9 | Totals 4/5, 9/10, 14/15, 19/20; item 9 = 0 vs 1; one item missing gives Not enough information but item 9 check still runs |
| GAD-7 | Totals 4/5, 9/10, 14/15 |

### 5.4 Validation ranges

Proposed plausible ranges, for approval by the clinician reviewer. Values outside them are rejected with a message asking the person to check the reading.

| Measurement | Unit | Accepted range |
| --- | --- | --- |
| Height | cm | 120-220 |
| Weight | kg | 30-250 |
| Waist circumference | cm | 40-200 |
| Systolic BP | mmHg | 70-260, and greater than diastolic |
| Diastolic BP | mmHg | 40-160 |
| Moderate or vigorous activity | minutes per week | 0-3000 |
| Fruit and vegetable servings | per day | 0-20 |

## 6. Non-functional requirements

| ID | Category | Requirement | How it is verified |
| --- | --- | --- | --- |
| NFR-01 | Security | TLS for all traffic; secrets in the host's secret store; server-side authorisation on every request; least-privilege database role; Argon2id for PINs and admin passwords; rate limiting on sign-in. | Security test checklist; dependency scan in CI |
| NFR-02 | Privacy | Data minimisation (C-06), pseudonymous codes, approved retention, deletion workflow, no third-party analytics or trackers. | Code review; network inspection shows no third-party requests |
| NFR-03 | Offline drafts | Drafts and queue encrypted with AES-GCM using a non-extractable Web Crypto key; cleared on submission, exit-discard and session wipe. | Inspect IndexedDB in tests: no plaintext |
| NFR-04 | Installability and offline | Valid manifest and service worker; app shell, questionnaire and referral list available offline after first load; installable on Android and iOS. | Playwright installability and offline tests (Lighthouse 12 and later has no PWA audits) |
| NFR-05 | Compatibility | Core flow completes on current Chrome (Android), Safari (iOS 16.4+) and Samsung Internet, on screens from 360 px wide. | Manual test on 3 real devices; Playwright Chromium and WebKit |
| NFR-06 | Performance | Cached questionnaire screen loads within 1 s; online result returned within 5 s at pilot load; initial download under 1 MB compressed. | Lighthouse; API timing in tests |
| NFR-07 | Reliability | No acknowledged assessment lost; idempotent retry; daily encrypted backup and one verified restore before the pilot. | Restore drill recorded |
| NFR-08 | Accessibility | WCAG 2.2 AA: scalable text, labelled controls, logical focus and screen-reader order, contrast at least 4.5:1, results not by colour alone, tap targets at least 44 px. | axe-core in CI; manual screen-reader check |
| NFR-09 | Localisation | All user-facing strings in i18next resource files; English first; Kinyarwanda complete before pilot. | Lint rule; key-parity test between languages |
| NFR-10 | Explainability | Every result reproducible from stored inputs, questionnaire version and ruleset version. | Re-score test on stored assessments |
| NFR-11 | Maintainability | Monorepo with typed contracts shared between client and server; migrations; ESLint and Prettier; unit-test coverage of the rules package at 100% of branches. | CI gates |
| NFR-12 | Observability | Structured logs with correlation IDs and technical events only; logger redacts bodies, headers with tokens, and any health field; operational logs kept 14 days. | FR-15 log-inspection test |
| NFR-13 | Research integrity | Exports include question, instrument, rule and data-dictionary versions plus missingness codes. | Export test against the data dictionary |
| NFR-14 | Data residency | Pilot database and backups on the supervisor-approved hosting (ADR-014). | Supervisor's written approval kept with ethics documents |

## 7. Data requirements

### 7.1 Data model

This updates the proposal's ERD (Figure 4) with the entities its text requires but the diagram omits (marked new).

| Entity | Key attributes |
| --- | --- |
| Participant | id, study_code (unique), pin_hash, order_assignment (AB/BA), created_at, withdrawn_at |
| Profile | participant_id, age_band, sex (female / male / not_stated), district_band, education_band, device_type, preferred_language |
| ConsentEvent | participant_id, scope (core / mental_wellness / audio / follow_up), granted, consent_doc_version, language, created_at |
| QuestionnaireVersion / RulesetVersion / RecommendationVersion / ReferralListVersion / ConsentDocVersion | id, version, language, content (JSON), status (draft / published / retired), published_at |
| ContentApproval (new) | content_type, content_version_id, approver_role, decision, approved_at, notes |
| Assessment | id, participant_id, questionnaire_version_id, ruleset_version_id, idempotency_key (unique per participant), language, status, started_at, submitted_at |
| Response | assessment_id, question_code, value, missingness_code |
| Biomarker | assessment_id, type, value, unit, source (in_session / recalled), measured_on |
| RiskResult | assessment_id, domain, band_code, completeness, contributing_factors (codes), ruleset_version_id |
| ResultRecommendation | risk_result_id, recommendation_version_id, recommendation_code |
| SafetyEvent (new) | participant_id, tier, trigger_type, actions (codes), occurred_at, recorded_by_role; no answers or scores |
| FeedbackResponse | participant_id, form_version, condition (A / B / post-session), item_code, value |
| DeletionRequest | participant_id, status, requested_at, completed_at |
| AdminUser (new; updated in v1.3) | id, email (optional, unique), phone_number (optional, unique, E.164), google_subject (optional, unique), password_hash (optional, break-glass only), role (researcher_admin / facilitator / reviewer), reviewer_type, active, last_sign_in_at. At least one of email or phone_number |
| StaffOtpChallenge (new, v1.3) | id, staff_user_id, code_hash, expires_at, attempts, consumed_at, created_at |
| StaffSession (new, v1.3) | id, staff_user_id, token_hash, created_at, last_seen_at, expires_at, revoked_at, auth_method (google / sms / password) |
| ExportLog (new) | admin_id, dataset, versions_included, created_at |

### 7.2 Retention

Retention follows proposal Table 11: application data exported de-identified and deleted within 30 days after the pilot; backups expire within a further 30 days; operational logs 14 days; safety-event log kept with consent records. Deletion requests are completed within 14 days.

## 8. Traceability

| Proposal item | Requirements | Evaluation metric (proposal Table 12) |
| --- | --- | --- |
| Objective 2: functional prototype | FR-01 to FR-27 | Task completion ≥80% |
| Objective 3: evaluation | FR-17, FR-24, FR-19 | SUS mean ≥68; comprehension ≥80%; relevance B−A median >0; usefulness and cultural fit median ≥4 |
| Objective 4: reproducible scoring | FR-09, NFR-10, Section 5.3 | Golden fixtures 100% identical |
| Objective 4: idempotent sync | FR-08, NFR-07 | Zero duplicate assessments |
| Objective 4: no sensitive logging | FR-15, NFR-12 | Zero sensitive values in logs |
| Objective 4: skip and exit | FR-05, FR-06, FR-22 | Skip, pause and exit scenarios 100% functional |
| RQ2: bilingual, offline-tolerant | FR-16, FR-21, FR-04, FR-08, NFR-04, NFR-05 | Cross-browser completion on all three browsers |
| Section 1.10.6: user safety | FR-11, FR-12, FR-13, FR-25 | Safety boundary tests pass; offline help test passes |
| Section 2.6: governance | C-05 to C-08, FR-20, NFR-14 | Approval records present for every published version |

## 9. Technology stack

| Layer | Choice |
| --- | --- |
| Repository | One monorepo (npm workspaces): apps/web, apps/api, packages/rules, packages/content, packages/schemas |
| PWA client | React, TypeScript, Vite with vite-plugin-pwa (Workbox), Tailwind CSS v4, shadcn/ui components only (see docs/DESIGN_SYSTEM.md), Redux Toolkit, React Hook Form with Zod, i18next |
| Browser storage | IndexedDB (through a small wrapper), Web Crypto AES-GCM |
| API | Node.js 22 LTS, TypeScript, Express, Zod, pino logger with redaction, Argon2id, idempotency middleware |
| Database | PostgreSQL 16, Prisma ORM and Prisma Migrate, CSV data dictionary |
| Testing | Vitest (rules golden fixtures, unit), Supertest (API), Playwright (Chromium and WebKit, offline), Lighthouse, axe-core |
| Delivery | Docker and docker-compose, GitHub Actions CI, Render for development with synthetic data, Rwanda-located server for the pilot |

## 10. Open issues

1. Confirm Rwanda-based hosting, or Article 50 authorisation, for pilot data.
1. Mental-health reviewer to decide the behaviour when PHQ-9 item 9 is skipped (Section 5.2).
1. Clinician reviewer to approve validation ranges (Section 5.4) and final band wording.
1. Confirm referral numbers 112, 114 (hours and scope), 3512, 3029, the ALU wellness contact and the facility list by district.
1. Confirm with the ethics committee whether PHQ-9 or the PHQ-8 fallback is approved; FR-11 depends on it.
1. Obtain Kinyarwanda STEPS item wording from RBC and the Muller et al. (2024) PHQ-9 and GAD-7 translations.

## 11. Addendum: standout features (v1.1)

This addendum adds six features that go beyond data entry and display. They were requested on 4 October 2026 and are designed in [FEATURES.md](FEATURES.md). Requirement IDs continue from FR-27. Priorities follow Section 1.5. Every feature respects C-01 to C-08: FR-36 is the only one that uses a generative model, it is outside the MVP defined by C-03, and it ships disabled until an ethics amendment and supervisor approval exist (proposal Section 1.10.7).

### 11.1 Feature 1: works fully offline

| ID | Requirement | Priority | Acceptance criteria |
| --- | --- | --- | --- |
| FR-28 | Provide "Prepare this phone for offline use": download and verify the app shell, both language packs, the published content, the ruleset and the referral list, then show an "Offline ready" check listing their versions. | Must | After preparation, airplane mode blocks no participant step except the very first sign-in on a new device. The check lists content, ruleset and referral-list versions and the storage used. Preparation stops with a plain message if any item cannot be cached. |
| FR-29 | When offline, score on the device with the shared rules package, label the result "Saved on this phone, not sent yet", and reconcile with the server's re-score after sync. | Must | The result appears offline within 1 s of submitting. On sync the server recomputes; if its normalised result differs, the server result is shown with a short notice and the mismatch is counted without logging any value. CI fails on any client and server mismatch in the golden fixtures. |
| FR-30 | Show sync status (Saved on this phone / Sending / Sent) and a "Send now" control. Retry when the app opens, on the online event, when the app becomes visible again, and through Background Sync where the browser supports it. Never reload the app for an update during an assessment. | Must | Playwright: three submissions queued offline arrive exactly once after reconnecting. An available update is offered only on screens outside the questionnaire. |
| FR-31 | Request persistent storage, warn when free storage is low, and offer a data-saver mode (no audio prefetch, system font). | Should | The warning appears below the configured threshold. Data-saver mode reduces the size of the prepared download (measured in a test). |

### 11.2 Feature 2: Rinda Guide and My Health Snapshot

| ID | Requirement | Priority | Acceptance criteria |
| --- | --- | --- | --- |
| FR-32 | Provide "My Health Snapshot", a results dashboard with separate NCD and mental-wellness sections. Each domain card shows the value, the band in words with an icon, the recommended target, a simple visual, and "Why?" and "What can I do?" links. Domains without data show "Not enough information". Every chart has a text alternative. No combined score. | Must | Every domain card has all the listed elements. The mental-wellness section stays collapsed until the participant chooses to open it. axe-core reports no violations. Each chart has equivalent text or a table. |
| FR-33 | Plan next best steps deterministically: choose up to three focus areas in the approved priority order, attach the approved recommendation and a simple target to each, and show why each was chosen. The same code runs on the client and the server. | Must | The planner golden cases in docs/SCORING_RULES.md Section 7 pass on both builds. Changing the priority order requires a new approved ruleset version. |
| FR-34 | Coach measurements: preparation checklists for blood pressure, waist, height and weight, plus soft plausibility checks that ask the person to re-check a reading but never block a value inside the validation range (Section 5.4). Record whether a value was re-checked. | Should | Typing 1.65 for height explains that height is in centimetres. A pulse pressure under 20 or over 100 mmHg asks for a re-check. The re-checked flag is stored with the measurement. |
| FR-35 | When two or more assessments exist, show a trend for each domain with band zones, and mark where the ruleset version changed (extends FR-14). | Should | Trends are drawn from stored results only. A version marker appears wherever two results used different ruleset versions. |
| FR-36 | Offer "Ask Rinda": pre-defined question chips that return a plain-language explanation written by a large language model from the deterministic results and approved content. The model never sets bands, numbers, safety text or referral text, never receives identifiers or mental-wellness data, and every answer passes a validator or falls back to approved text. Disabled unless an ethics amendment reference is configured. | Could | With the flag off, the API cannot call the model provider (test). With the flag on, the validator rejects changed numbers, unapproved sources, banned terms and phone numbers, and the approved template is shown on any rejection, refusal or error. |

### 11.3 Feature 3: explainable results and What-if

| ID | Requirement | Priority | Acceptance criteria |
| --- | --- | --- | --- |
| FR-37 | For each domain, show "Why this result": the inputs used, the threshold crossed, its source, the ruleset version and what change would move the band. The text is generated from the published ruleset. | Must | No threshold value is hand-written in UI copy. The explanation matches the "How results are calculated" page (FR-23) for every band. |
| FR-38 | Provide a What-if simulator for behaviour domains (physical activity, fruit and vegetables, alcohol, tobacco) that recomputes the band on the device, is clearly labelled as a simulation, and is never stored or sent. Weight, BMI, waist and blood pressure are not simulated. | Should | Network inspection shows no request during a simulation and nothing is written to storage. Simulated bands equal the rules package output for every control position in tests. |

### 11.4 Feature 4: safety net and care navigator

| ID | Requirement | Priority | Acceptance criteria |
| --- | --- | --- | --- |
| FR-39 | Provide an offline care directory built from the approved referral-list version: hotlines and services with type, district and sector, opening hours, languages, cost and phone number, a district or sector filter, and tap to call. Optional on-device distance sorting is off for the pilot, and location is never stored or sent. | Must | The directory opens offline from Get help now and from result cards. Each entry shows the date it was verified. The geolocation API is never called while the flag is off. |
| FR-40 | Offer a clinic-ready summary card for results that recommend a health-centre visit: date, measured values, bands, ruleset version and the non-diagnostic statement, plus a QR code holding the same text. No study code or other identifier. Generated on the device. | Should | A test confirms the card holds no identifier. The QR code decodes to the same text. Nothing is uploaded. The card closes with one tap. |
| FR-41 | Keep safety working offline: the Tier 2 safety screen, Get help now and safety-event capture work without a network; safety events queue encrypted and sync without answers; facilitators get a Tier 3 checklist with one-tap call links and a "supervisor informed" time. | Must | Airplane-mode tests pass for item 9 = 1 and for Get help now on every route. Queued safety events sync exactly once. The Tier 3 checklist records its times. |

### 11.5 Feature 5: privacy shield

| ID | Requirement | Priority | Acceptance criteria |
| --- | --- | --- | --- |
| FR-42 | Provide quick exit and auto-lock. One tap (or pressing Escape twice) replaces the screen with the neutral screen, clears health data held in memory and replaces the navigation history. The app locks after a configurable idle time (default 3 minutes) and needs the PIN to reopen; locking whenever the app is hidden is an optional setting. | Must | After quick exit the browser Back button reveals no health content. The idle lock triggers at the configured time in tests. |
| FR-43 | Provide shared-phone mode, chosen at sign-in or by the facilitator: drafts are kept only until submitted, the queue is cleared once sent, and signing out wipes all local participant data and shows a "This phone is clear" check. Unsent items block the wipe until they are sent or the facilitator confirms. | Must | After sign-out in shared mode, IndexedDB, participant entries in Cache Storage and local keys are empty (test) while the app shell stays cached. |
| FR-44 | Provide "My data and consent": what the app keeps and never keeps, the consent history with versions and times, changing optional consents from now on, a download of the participant's own results, and the status of any deletion request (FR-18). | Should | A consent change creates a new consent event and never edits an old one. The download holds only that participant's data and shows a warning on shared phones. |

### 11.6 Feature 6: research and facilitator console

| ID | Requirement | Priority | Acceptance criteria |
| --- | --- | --- | --- |
| FR-45 | Provide a facilitator session mode in the staff console: start a session for a study code, show the AB or BA order read-only, run the task checklist with timers and outcomes (completed, completed with help, not completed), record observed-distress events (FR-13) and end the session. | Must | Task outcomes and times are stored against the study code only. The order cannot be edited (FR-24). |
| FR-46 | Require two approvals, from two different people holding the required reviewer types, before any content or ruleset version is published, and show a field-by-field diff against the published version. | Must | Publishing with one approval, or with two approvals from the same person, fails. The diff lists every changed field. Approvals and the publish action are written to the audit log. |
| FR-47 | Provide a pilot insights dashboard with aggregate metrics mapped to the proposal's evaluation targets (task completion, SUS, comprehension, relevance B minus A, usefulness, cultural fit), plus sync health and safety-event counts by tier, without showing any individual's answers. | Should | Every metric shows its target from proposal Table 12 next to the current value. No view lists answers per participant. |
| FR-48 | Keep an append-only audit log of staff actions: sign-in, code generation, session start and end, approvals, publishing, exports, deletion completion and flag changes, each with actor, role, action, target and time. | Must | No API route can update or delete an audit entry. Each listed action writes exactly one entry (tests). |

### 11.7 Cross-cutting

| ID | Requirement | Priority | Acceptance criteria |
| --- | --- | --- | --- |
| FR-49 | Offer "Listen" read-aloud for questions and result headlines using approved recordings in both languages, cached when the phone is prepared. English may fall back to the device voice. | Could | Each recording is linked to the content version it reads. When a recording is missing the button is hidden rather than reading unapproved text. |
| FR-50 | Control optional features with server-side flags per environment. Flag changes are audited. The generative guide flag cannot be enabled unless an ethics amendment reference and a provider key are configured. A documented pilot profile sets every flag. | Must | The API refuses to enable `guideGenerative` without `ETHICS_AMENDMENT_REF` (test). `GET /api/v1/flags` returns only non-sensitive booleans. |

| ID | Category | Requirement | How it is verified |
| --- | --- | --- | --- |
| NFR-15 | Design system | The interface is built only from shadcn/ui components themed with docs/design/rinda-theme.css (the "Vibrant but Calm" palette). Every text and background pair meets the contrast table in docs/DESIGN_SYSTEM.md, and participant tap targets are at least 44 px. | Dependency check in CI blocks other UI kits; contrast script; axe-core |
| NFR-16 | AI guardrails | Applies only when FR-36 is enabled: no identifiers, dates or mental-wellness data leave the server, every answer passes the validator or falls back, and no prompt or answer text is logged. | Validator unit tests; payload snapshot test; log inspection (FR-15) |
| NFR-17 | Bundle budget | Participant initial JavaScript at most 250 KB compressed; charts, the staff console and the guide load on demand and are not part of the initial download (supports NFR-06). | Build-size check in CI |
| NFR-18 | Offline completeness | After FR-28 preparation, the whole participant flow from PIN unlock to results, Get help now and the care directory works in airplane mode on Chromium and WebKit. | Playwright offline suite |

### 11.8 Traceability for the addendum

| Proposal item | Requirements |
| --- | --- |
| RQ2: bilingual, offline-tolerant | FR-28 to FR-31, FR-49, NFR-18 |
| Objective 2: explainable, useful results | FR-32, FR-33, FR-34, FR-35, FR-37, FR-38 |
| Section 1.10.6: user safety | FR-39, FR-40, FR-41 |
| Section 1.10.1: privacy and data minimisation | FR-42, FR-43, FR-44, NFR-16 |
| Objective 3: evaluation | FR-45, FR-47 |
| Section 2.6: governance | FR-46, FR-48, FR-50 |
| Section 1.10.7: future generative model | FR-36, NFR-16 (disabled for the pilot) |

## 12. Addendum: staff authentication and authorisation (v1.3)

Requested on 6 October 2026. Staff (researcher-admin, facilitator, reviewer) sign in with Google or with an SMS one-time code sent to their phone. **Participants are unchanged**: they sign in with a study code and PIN (FR-03), and no participant email or phone number is collected (C-06). Google and the SMS provider receive staff identifiers only, never participant data (NFR-19, ADR-015).

### 12.1 Sign-in

| ID | Requirement | Priority | Acceptance criteria |
| --- | --- | --- | --- |
| FR-51 | Let staff sign in with a "Sign in with Google" button, using OpenID Connect (authorisation code flow with PKCE, handled by the API). Only Google accounts whose verified email matches an active, pre-registered staff account may sign in. The API requests the `openid` and `email` scopes only and keeps no Google access or refresh token after sign-in. | Must | An unregistered, deactivated or unverified Google account is refused with a plain message and an audit entry. A tampered `state` or PKCE verifier is refused. The account is linked by Google's stable subject ID after the first sign-in, so a changed Gmail address does not create a new account. Test with a mocked provider. |
| FR-52 | Let staff sign in with a 6-digit one-time code sent by SMS to the phone number on their pre-registered account. Keep email and password (Argon2id) as a break-glass sign-in for researcher-admins only, for when Google or the SMS provider is unavailable. | Must (SMS); Should (break-glass) | The code is random, valid for 5 minutes, single use and stored only as a hash. Five wrong codes end the challenge. At most 3 codes per number per 15 minutes and 10 per client per hour. The request step returns the same response whether or not the number is registered. Phone numbers are stored in E.164 format (+250…). Test with a mocked SMS provider. |

### 12.2 Authorisation and accounts

| ID | Requirement | Priority | Acceptance criteria |
| --- | --- | --- | --- |
| FR-53 | Authorise every staff request on the server by role, deny by default, using the permission matrix in Section 12.4. The staff console shows only what the role allows, but the server check is what counts. Participant tokens never reach staff routes, and staff sessions never reach participant routes. | Must | An automated test calls every staff route with each role and with no session; only the matrix's allowed combinations succeed (others return 401 or 403). Content approvals record the approver's reviewer type (FR-46). |
| FR-54 | Let researcher-admins manage staff accounts: invite (email and/or phone number, role, reviewer type), change role or reviewer type, and deactivate. There is no public sign-up. | Must | A new account cannot sign in until it has been invited. Deactivating an account revokes its sessions at once. The last active researcher-admin cannot be deactivated or demoted. Every change writes an audit entry (FR-48). |
| FR-55 | Keep staff sessions in an `HttpOnly; Secure; SameSite=Strict` cookie scoped to `/api/v1/admin`, stored hashed on the server, with an 8-hour idle timeout and a 12-hour absolute lifetime. Require a fresh sign-in (within 15 minutes) before exports, publishing, flag changes and staff account changes. | Must (sessions); Should (fresh sign-in) | Sessions expire on time in tests. Sign-out and deactivation revoke the session. Each sign-in and sign-out writes an audit entry with the method (`google`, `sms`, `password`), never the code or token. |

### 12.3 Non-functional

| ID | Category | Requirement | How it is verified |
| --- | --- | --- | --- |
| NFR-19 | Staff identity privacy | Only a staff member's email (to Google) or phone number (to the SMS provider) leaves the system, and only for that staff member's own sign-in. No participant data is ever sent to either provider. Provider keys live in the host's secret store. Logs never contain codes, tokens, full phone numbers or full emails (masked, for example `+250 7•• ••• 123`). Staff identifiers are deleted when the project ends. | Network inspection of the participant flow shows no provider requests; FR-15 sentinel test extended with an OTP code and a staff phone number; code review |

### 12.4 Permission matrix

| Action | Researcher-admin | Facilitator | Reviewer |
| --- | --- | --- | --- |
| Manage staff accounts (FR-54) | Yes | No | No |
| Generate study codes (FR-26) | Yes | No | No |
| List study codes and order assignment (no answers) | Yes | Yes | No |
| Run sessions, task timers, record distress, Tier 3 checklist (FR-45, FR-13, FR-41) | No | Yes | No |
| Create draft content | Yes | No | No |
| Approve or request changes on content (FR-46) | Yes | No | Yes, by reviewer type |
| Publish content (FR-20, FR-46) | Yes | No | No |
| Pilot insights (FR-47) | Yes | No | No |
| De-identified exports (FR-19) | Yes | No | No |
| Complete deletion requests (FR-18) | Yes | No | No |
| Read audit log (FR-48) | Yes | No | No |
| Change feature flags (FR-50) | Yes | No | No |

### 12.5 Open issues for this addendum

1. Choose the SMS provider. It needs Rwandan delivery, a cost per message, and terms on how long it keeps phone numbers. An SMS code reaches a phone with no mobile data (it needs only cellular signal), but the staff console must still be online to check it.
2. Decided 6 Oct 2026: a basic Google OAuth client from the Google Cloud console, with the consent screen in testing mode and each staff email listed as a test user. Staff identity data (email, Google subject ID, phone number) is kept for the duration of the project (NFR-19).
3. Decided 6 Oct 2026: every staff role (facilitators, researcher-admins, reviewers) may use either Google or SMS. Participants use neither.
4. To decide: add an authenticator-app code (TOTP, `otplib` is already in the dependency allowlist) as a third staff method. It works with no signal at all and costs nothing per sign-in.

## 13. Addendum: accounts, dashboards and plain SQL (v1.4)

Requested on 7 October 2026. Decisions in ADR-016, ADR-017 and ADR-018.

### 13.1 What changes

| Item | Before | Now |
| --- | --- | --- |
| Participant sign-in (FR-03) | Study code and PIN | Email address or phone number and a password, or Google |
| Study codes (FR-26) | Generated by the researcher-admin | Superseded: anyone can sign up; the AB/BA order is assigned at random at sign-up |
| Staff accounts (FR-54) | Invite only | Open sign-up for every role; researcher-admins can still add, change, turn off and delete accounts |
| Staff SMS codes (FR-52) | SMS one-time code | Deferred until an SMS provider is chosen; staff use email or phone and a password, or Google |
| Database access (Sections 3.3, 9) | Prisma ORM | Plain, parameterised SQL through `pg`; schema in `backend/db/migrations/*.sql` |
| Code layout (Section 9) | `apps/web`, `apps/api` | `frontend/`, `backend/` (one file, `server.ts`), shared `packages/` |

### 13.2 Requirements

| ID | Requirement | Priority | Acceptance criteria |
| --- | --- | --- | --- |
| FR-56 | Provide a dashboard for each role with its own sidebar menu, metric cards, profile page and sign-out, usable on phones and laptops. | Must | Each role sees only its own menu; the server refuses other roles' routes (FR-53). No page scrolls sideways at 375 px. |
| FR-57 | Provide create, read, update and delete for each role's data: participant check-ups and profile; facilitator sessions, task results and safety events; researcher-admin users, content, deletion requests and flags; reviewer approvals. | Must | Automated API tests run every operation against PostgreSQL in a throwaway schema. |

### 13.3 Open issues

1. Close or moderate open sign-up for researcher-admin and reviewer before any real data are collected (ADR-017).
2. Tell the ethics committee that participants now sign up with an email or phone number, and confirm when the 72-hour deletion rule starts counting.
3. Before deployment, add the live web address to the Google OAuth client (authorised JavaScript origin and redirect URI `https://<domain>/api/v1/auth/google/callback`) and set `PUBLIC_URL`.

## 14. Addendum: guide, notices and offline check-ups (v1.5)

Requested on 9 October 2026. Decisions in ADR-019 and ADR-020.

| ID | Requirement | Priority | Acceptance criteria |
| --- | --- | --- | --- |
| FR-58 | Email an opted-in participant a summary of each check-up (each NCD area's result word, the first small step and the educational notice), and let them send one again from the result. Never include mental-wellness results. | Should | No email without a current `email_reports` opt-in; only approved content; `message_events` stores status only; the `messaging` flag is off in the pilot profile and needs `MESSAGING_APPROVAL_REF` (tests). |
| FR-59 | Show participant charts (weekly activity ring, blood pressure over time, fruit and vegetables over time) and staff charts (14-day check-ups, sign-ups and sessions), each with a text alternative. | Should | Every chart is `aria-hidden` and paired with a sentence carrying the same numbers. Charts load on demand. |

FR-36 (Ask Rinda) uses Google Gemini (ADR-019); its acceptance criteria are unchanged. Offline check-ups (FR-29, FR-30) are implemented: scored on the phone, kept in an encrypted outbox, and sent once when the network returns.
