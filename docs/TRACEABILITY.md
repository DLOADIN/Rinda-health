 In progress |||||||| In progress || In progress || In progress || In progress || In progress || In progress || In progress || In progress || In progress || In progress || In progress || In progress || In progress || ID | Requirement | Priority | Planned location | Tests | Status |
| --- | --- | --- | --- | --- | --- |
| FR-01 | Show the purpose (educational, non-diagnostic, not an emergency service) before any health… | Must | web: features/welcome, components/purpose-statement | e2e | Planned |
| FR-02 | Confirm age eligibility (18 to 35) and capture layered, versioned consent with four… | Must | web: features/eligibility, features/consent · api: routes/consents | unit, e2e | Planned |
| FR-03 | Allow access with a study code and a 4- to 6-digit PIN set at first use; store only a… | Must | api: routes/auth (Argon2id, lockout) · web: features/auth | api, e2e | Planned |
| FR-04 | Load the published questionnaire version and save and resume an encrypted draft on the device. | Must | web: lib/storage (crypto, idb), features/assessment | unit, e2e | Planned |
| FR-05 | Allow every sensitive question and the whole mental-wellness module to be skipped, with no… | Must | web: features/assessment · rules: missingness | unit, e2e | Planned |
| FR-06 | Allow immediate pause or exit to a neutral screen from every screen. | Must | web: components/app-shell (Pause, Exit) | e2e/shell.spec.ts (Exit, Escape twice); web shell.test.tsx | In progress |
| FR-07 | Validate optional measurements against approved ranges and explicit units, and record… | Must | rules: validation · web: features/measure | golden, e2e | Planned |
| FR-08 | Submit assessments idempotently and tolerate loss of connectivity. | Must | web: lib/sync · api: middleware/idempotency | api, e2e offline | Planned |
| FR-09 | Calculate deterministic, versioned, per-domain results using the rules in Section 5. | Must | rules: score/* | packages/rules/test/golden.test.ts; e2e/golden.spec.ts (Node vs Chromium and WebKit) | In progress |
| FR-10 | For each domain, show the band in words and an icon (not colour alone), the contributing… | Must | web: features/results (DomainCard) | web components/shell.test.tsx (BandBadge word + icon) | In progress |
| FR-11 | Run the safety check on the device as soon as PHQ-9 item 9 is answered, before any network… | Must | rules: checkItem9 · web: features/assessment, features/safety | packages/rules/test/rules.test.ts (checkItem9); golden phq9-* cases | In progress |
| FR-12 | Show a "Get help now" button on every screen that opens the referral list in one tap,… | Must | web: components/get-help (Drawer) | e2e/shell.spec.ts (Get help now, online and offline in Chromium) | In progress |
| FR-13 | Record safety events with tier, trigger type (item 9, score threshold, observed,… | Must | api: routes/safety-events · schemas: safety | packages/schemas/test/schemas.test.ts (rejects answers and scores) | In progress |
| FR-14 | Display assessment history and mark when two results were produced by different ruleset… | Should | web: features/history · api: routes/assessments | e2e | Planned |
| FR-15 | Exclude answers, measurements and results from all logs and analytics. | Must | api: lib/logger · e2e sentinel test | apps/api/test/app.test.ts (log lines); e2e/privacy.spec.ts + npm run test:logs | In progress |
| FR-16 | Offer all participant content in English and Kinyarwanda, with language switching at any time. | Must | content: en, rw · web: lib/i18n | content:validate key parity; locales.test.ts; ESLint i18next/no-literal-string | In progress |
| FR-17 | Collect versioned usability (SUS) and baseline-comparison feedback after the session. | Must | web: features/feedback · api: routes/feedback | api, e2e | Planned |
| FR-18 | Allow withdrawal and deletion requests at any time, completed under the retention schedule. | Must | api: routes/deletion-requests, jobs/deletion | api | Planned |
| FR-19 | Allow authorised de-identified research export with version metadata and missingness codes. | Must | api: routes/admin/exports | api (export contents) | Planned |
| FR-20 | Serve only content and rules marked as approved, with approver role and date. | Must | api: services/content (manifest) | api | Planned |
| FR-21 | Record preferred language and allow switching language at any point without losing answers. | Must | web: lib/i18n, features/settings | e2e/shell.spec.ts (html lang); web shell.test.tsx | In progress |
| FR-22 | Before the mental-wellness module, explain what the questions cover, that they are… | Must | web: features/assessment/wellness-intro | e2e | Planned |
| FR-23 | Provide a "How results are calculated" page listing every rule and its citation in plain… | Must | web: features/results/how · rules: explain | unit, e2e | Planned |
| FR-24 | Provide the non-personalised information page (baseline condition A) and present conditions… | Must | web: features/baseline-info · api: routes/admin/participants | e2e | Planned |
| FR-25 | Show Tier 1 supportive message and referral list when PHQ-9 or GAD-7 total is 10 or more… | Must | rules: safety · web: features/results | golden tier1-* cases | In progress |
| FR-26 | Allow the researcher-admin to generate study codes with order assignments, and to sign in… | Must | api: routes/admin/participants, routes/admin/auth | api | Planned |
| FR-27 | Allow the facilitator to clear all app data on a study device at the end of a session. | Must | web: features/privacy/wipe | e2e (storage empty) | Planned |
| FR-28 | Provide "Prepare this phone for offline use": download and verify the app shell, both… | Must | web: features/prepare, sw/precache | e2e offline | Planned |
| FR-29 | When offline, score on the device with the shared rules package, label the result "Saved on… | Must | web: features/assessment/submit · rules · api: re-score | frontend/src/lib/offline.ts (scoreOnPhone), features/participant/checkup-page.tsx; tour: offline check-up scored and later sent | In progress |
| FR-30 | Show sync status (Saved on this phone / Sending / Sent) and a "Send now" control | Must | web: features/sync, lib/sync, sw/update | lib/offline.ts (outbox, flush on start/online/visible/Send now), dashboard header badge | In progress |
| FR-31 | Request persistent storage, warn when free storage is low, and offer a data-saver mode (no… | Should | web: lib/storage-health, features/settings | unit | Planned |
| FR-32 | Provide "My Health Snapshot", a results dashboard with separate NCD and mental-wellness… | Must | web: features/dashboard | features/dashboard/home-page.tsx, charts.tsx; backend dashboard tests | In progress |
| FR-33 | Plan next best steps deterministically: choose up to three focus areas in the approved… | Must | rules: plan | packages/rules/test/golden.test.ts (planner), guide.test.ts | In progress |
| FR-34 | Coach measurements: preparation checklists for blood pressure, waist, height and weight,… | Should | rules: plausibility · web: features/measure/coach | unit, e2e | Planned |
| FR-35 | When two or more assessments exist, show a trend for each domain with band zones, and mark… | Should | web: features/history/trends | unit | Planned |
| FR-36 | Offer "Ask Rinda": pre-defined question chips that return a plain-language explanation… | Could | api: guide/* (explainer, validate) · web: features/guide | packages/rules/src/guide.ts + test/guide.test.ts; backend/server.ts 5b (Gemini, validator) + server.test.ts (Rinda Guide test); features/guide | In progress |
| FR-37 | For each domain, show "Why this result": the inputs used, the threshold crossed, its… | Must | rules: explain · web: features/results/why | features/results/result-view.tsx (details dialog) | In progress |
| FR-38 | Provide a What-if simulator for behaviour domains (physical activity, fruit and vegetables,… | Should | rules: simulate · web: features/what-if | unit, e2e (no network) | Planned |
| FR-39 | Provide an offline care directory built from the approved referral-list version: hotlines… | Must | content: referral-list · web: features/care | e2e offline | Planned |
| FR-40 | Offer a clinic-ready summary card for results that recommend a health-centre visit: date,… | Should | web: features/care/clinic-card | unit (no identifier), e2e | Planned |
| FR-41 | Keep safety working offline: the Tier 2 safety screen, Get help now and safety-event… | Must | web: features/safety · api: routes/admin/sessions/safety-events | e2e offline, api | Planned |
| FR-42 | Provide quick exit and auto-lock | Must | web: components/app-shell (QuickExit, IdleLock) | e2e/shell.spec.ts (quick exit, Escape twice); idle lock not built yet | In progress |
| FR-43 | Provide shared-phone mode, chosen at sign-in or by the facilitator: drafts are kept only… | Must | web: lib/storage (wipe), features/auth/signout | e2e (storage empty) | Planned |
| FR-44 | Provide "My data and consent": what the app keeps and never keeps, the consent history with… | Should | web: features/privacy · api: routes/consents, routes/me/export | e2e, api | Planned |
| FR-45 | Provide a facilitator session mode in the staff console: start a session for a study code,… | Must | web: staff/sessions · api: routes/admin/sessions | api, e2e | Planned |
| FR-46 | Require two approvals, from two different people holding the required reviewer types,… | Must | web: staff/content · api: routes/admin/content | api (two-person rule) | Planned |
| FR-47 | Provide a pilot insights dashboard with aggregate metrics mapped to the proposal's… | Should | web: staff/insights · api: routes/admin/insights | api | Planned |
| FR-48 | Keep an append-only audit log of staff actions: sign-in, code generation, session start and… | Must | api: lib/audit · db: audit_log grants | api | Planned |
| FR-49 | Offer "Listen" read-aloud for questions and result headlines using approved recordings in… | Could | content: audio · web: components/listen-button | unit | Planned |
| FR-50 | Control optional features with server-side flags per environment | Must | api: routes/flags, routes/admin/flags · web: lib/flags | apps/api/test/app.test.ts (guideGenerative guard, pilot profile) | In progress |
| FR-51 | Staff sign-in with Google (OpenID Connect, PKCE, pre-registered emails only) | Must | api: routes/admin/auth/google, services/staff-auth · web: staff/sign-in | api (mocked provider), e2e | Planned |
| FR-52 | Staff sign-in with an SMS one-time code; email and password break-glass for researcher-admins | Must | api: routes/admin/auth/sms, services/otp, lib/sms · web: staff/sign-in | api (mocked SMS, rate limits, lockout) | Planned |
| FR-53 | Role-based, deny-by-default authorisation for every staff route (permission matrix, SRS 12.4) | Must | api: middleware/require-role, lib/permissions · web: staff route guards | api (every route x every role) | Planned |
| FR-54 | Researcher-admins invite, change and deactivate staff accounts; no public sign-up | Must | api: routes/admin/staff · web: staff/team | api, e2e | Planned |
| FR-55 | Staff sessions: HttpOnly cookie, 8 h idle, 12 h absolute, fresh sign-in for sensitive actions | Must | api: middleware/staff-session | api | Planned |
| FR-58 | Email reports with results, opt-in only, never mental wellness | Should | backend/server.ts composeReportEmail, sendReportEmail, email-reports routes · migration 007 · frontend profile EmailReportsCard, result EmailReportButton | backend/server.test.ts (email reports) | In progress |
| FR-59 | Participant and staff charts with text alternatives | Should | frontend/src/features/dashboard/charts.tsx | visual tour; axe in e2e | In progress |

## Non-functional requirements

| ID | Topic | How it is checked | Status |
| --- | --- | --- | --- |
| NFR-01 | Security | Security checklist in SECURITY_PRIVACY.md; `npm audit` in CI | Planned |
| NFR-02 | Privacy | Network inspection test: first-party requests only | In progress |
| NFR-03 | Offline drafts encrypted | IndexedDB inspection test: ciphertext only | Planned |
| NFR-04 | Installability and offline | Playwright installability and offline suite | Planned |
| NFR-05 | Compatibility | Playwright Chromium and WebKit; three real phones | Planned |
| NFR-06 | Performance | Lighthouse performance; API timing tests | Planned |
| NFR-07 | Reliability | Idempotency tests; restore drill record | Planned |
| NFR-08 | Accessibility | axe-core in CI; screen-reader walk-through | In progress |
| NFR-09 | Localisation | Lint rule; key-parity test | Planned |
| NFR-10 | Explainability | Re-score stored assessments test | Planned |
| NFR-11 | Maintainability | CI gates; 100% branch coverage in packages/rules | In progress |
| NFR-12 | Observability | FR-15 sentinel log test | In progress |
| NFR-13 | Research integrity | Export test against the data dictionary | Planned |
| NFR-14 | Data residency | Hosting record with the ethics documents | Done (ADR-014) |
| NFR-15 | Design system | Dependency guard; contrast script; axe-core | In progress |
| NFR-16 | AI guardrails | Validator tests; payload snapshot; log inspection | Planned |
| NFR-17 | Bundle budget | Build-size check in CI | In progress |
| NFR-18 | Offline completeness | Playwright offline suite | Planned |
| NFR-19 | Staff identity privacy | Network inspection; sentinel test with OTP and staff phone; code review | Planned |
