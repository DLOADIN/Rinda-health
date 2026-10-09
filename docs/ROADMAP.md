# Build plan

Target: a frozen, tested release candidate by **Wednesday 4 November 2026**, a synthetic-data dry run on 5 and 6 November, and the pilot from about **Monday 9 November**, only after the ethics committee approves (C-08). Dates assume work starts Monday 5 October.

Work in thin vertical slices: every milestone ends with something a person can click through on a phone, with tests. Update [TRACEABILITY.md](TRACEABILITY.md) as requirements land.

## Milestone 0: Foundations (5 to 7 October)

- Monorepo with npm workspaces; TypeScript strict; ESLint, Prettier; Vitest; Playwright (Chromium and WebKit); GitHub Actions running `npm run check`.
- `apps/web`: Vite, React, Tailwind CSS v4, shadcn/ui initialised, `docs/design/rinda-theme.css` applied, Button sizes raised to 44 px, app shell with header (language switch, Exit) and sticky Get help now.
- `packages/rules`: types, ruleset v1.0 JSON, all domain rules, `checkItem9`, golden fixtures from [SCORING_RULES.md](SCORING_RULES.md), 100% branch coverage.
- `packages/schemas`: shared Zod schemas for the API.
- `apps/api`: Express 5, health route, pino with redaction, Prisma schema and first migration, synthetic seed.
- Docker Compose for API and PostgreSQL.

**Exit.** CI green; golden fixtures pass in Node and in a browser test; the themed app shell renders on a 360 px phone.

## Milestone 1: Core participant flow (8 to 14 October)

FR-01 to FR-07, FR-09 to FR-12, FR-21, FR-22, FR-25, FR-04 and FR-08 basics.

- Welcome and purpose, sign-in with study code and PIN, eligibility, layered consent with four separate choices.
- Banded profile; questionnaire one question per screen with skip, pause and exit; mental-wellness introduction and opt-in; measurements with validation.
- Encrypted drafts and the outbox; idempotent `POST /assessments`; server re-score.
- Results: one card per domain with band word and icon, factors, completeness, source, limits, recommendation; Tier 1 message; item 9 safety screen offline.

**Exit.** A synthetic participant completes the whole flow in both languages on a real Android phone and an iPhone; safety boundary tests pass.

## Milestone 2: Offline, governance and staff basics (15 to 21 October)

FR-13 to FR-20, FR-23, FR-24, FR-26, FR-27, FR-28 to FR-31, FR-41, FR-43, FR-46, FR-48, FR-50.

- Prepare this phone, Sync centre, safe update prompt, persistent storage, data-saver.
- Safety events with offline queue; facilitator observed-distress capture; Tier 3 checklist.
- Staff console shell (Sidebar): sign-in and roles, study codes, content versions with diff, two-person approval, publish, audit log, flags with the pilot profile.
- History, feedback forms (SUS, ratings, baseline comparison), baseline page A and AB/BA order, How results are calculated, deletion requests, exports with data dictionary, shared-phone mode and wipe.

**Exit.** Playwright offline suite green; FR-15 sentinel log test green; a content change goes from draft to published with two approvals.

## Milestone 3: Standout features (22 to 28 October)

FR-32 to FR-35, FR-37 to FR-40, FR-42, FR-44, FR-45, FR-47; FR-36 behind its flag with synthetic data only.

- My Health Snapshot dashboard with charts and text alternatives; trends.
- Planner, measurement coach, template composer and the Ask Rinda chips.
- Why this result and the What-if simulator.
- Care directory and clinic-ready card with QR.
- Quick exit, auto-lock, My data and consent.
- Facilitator session mode with task timers; pilot insights dashboard.
- Generative explainer and validator, tested only with synthetic profiles.

**Exit.** Every feature in [FEATURES.md](FEATURES.md) is reachable in the pilot profile (or correctly hidden), with tests.

## Milestone 4: Hardening and pilot readiness (29 October to 4 November)

- Accessibility pass: axe-core clean, screen-reader walk-through (TalkBack and VoiceOver), 200% text zoom, contrast script.
- Performance: initial JavaScript within budget (NFR-17), cached screen under 1 s, result under 5 s.
- Security review against [SECURITY_PRIVACY.md](SECURITY_PRIVACY.md); `npm audit` clean or justified.
- Final approved content and Kinyarwanda translations loaded and published through the console.
- Deploy the API and web app, with the database on Neon (ADR-014); backup and one restore drill.
- Run the `/pilot-readiness` skill and fix every gap. Tag `v1.0.0`.

## Parallel tracks (not code)

| Track | Owner | Needed by |
| --- | --- | --- |
| Ethics application to supervisor, then the REC | Student | Supervisor around 9 October |
| Approval of ruleset v1.0, planner order, validation ranges, band wording | Clinician key informant, supervisor | 28 October |
| Mental-wellness content, safety text, item 9 decision (or PHQ-8) | Mental-health key informant | 28 October |
| Kinyarwanda translation and validated PHQ-9 and GAD-7 versions | Bilingual key informant | 30 October |
| Referral numbers, hours and facility list verified by district | Community or CHW key informant | 30 October |
| Rwanda hosting confirmed | Student, supervisor | 28 October |
| Optional read-aloud recordings | Bilingual key informant | 2 November or drop |

## If time runs short, cut in this order

1. FR-49 read-aloud
2. FR-36 generative explainer (already off for the pilot)
3. FR-35 trends (the pilot has one session per person)
4. FR-47 insights dashboard (use the CSV export and a spreadsheet)
5. FR-31 data-saver and storage warnings
6. FR-38 What-if simulator
7. FR-40 clinic card (keep the care directory)

Never cut: consent, safety (FR-11, FR-12, FR-13, FR-25, FR-41), encrypted drafts and idempotent sync, privacy logging (FR-15), approved content only (FR-20, FR-46), both languages, the results explanations and the facilitator session tools needed for the evaluation.

## After the pilot

Analysis and write-up first. The generative guide moves forward only through the ethics amendment checklist in [AI_GUIDE.md](AI_GUIDE.md).
