# Testing

Acceptance criteria in [SRS.md](SRS.md) become tests. A requirement is not done until its tests exist and pass in CI, and [TRACEABILITY.md](TRACEABILITY.md) names them.

## Layers

| Layer | Tool | What it covers |
| --- | --- | --- |
| Rules | Vitest | Every domain rule, `checkItem9`, planner, simulator, explanations, plausibility; golden fixtures; 100% branch coverage |
| Rules in the browser | Playwright | The same golden fixtures executed by the production web bundle, compared with the Node output (FR-09) |
| Schemas and content | Vitest | Zod schemas accept valid and reject invalid payloads; content validation and key parity between `en` and `rw` |
| API | Vitest and Supertest against a disposable PostgreSQL (Docker) | Auth and lockout, ownership checks, idempotency, re-score, safety-event schema, two-person publishing, flags guard, exports, deletion |
| Web units | Vitest with Testing Library | Components that hold logic: band badge mapping, chart text alternatives, crypto and storage layer, sync state machine |
| End to end | Playwright, projects `mobile-chromium` (Pixel 7) and `mobile-webkit` (iPhone 14), against `vite build` plus `vite preview` so the service worker is real | Full flows in both languages, offline, safety, privacy, staff console |
| Accessibility | `@axe-core/playwright` on every route, plus a manual checklist | WCAG 2.2 AA (NFR-08) |
| Performance | Build-size check, Lighthouse performance and accessibility | NFR-06, NFR-17 (Lighthouse 12 and later has no PWA category, so PWA checks are Playwright tests) |
| Design tokens | `node scripts/check-contrast.mjs` | Every token pair in the contrast table (NFR-15) |

## Must-have test suites

**Offline (NFR-18).** Prepare the phone, `context.setOffline(true)`, then: PIN unlock, questionnaire, measurements, submit, results, Get help now from every route, care directory, safety screen. Reconnect: queued items sync exactly once; the update prompt never appears inside the questionnaire.

**Safety** (see [SAFETY.md](SAFETY.md)). Item 9 = 1, 2, 3 offline in both browsers; Tier 1 boundaries; schema rejects answers in safety events; PHQ-8 mode hides item 9.

**Privacy.**
- FR-15 sentinel test: enter sentinel values (systolic 187, diastolic 113, 13 servings, PIN 482915) and search API logs, browser console and service-worker console for them.
- Network allowlist: every request in the participant flow is same-origin.
- IndexedDB holds ciphertext only (no sentinel value readable).
- Shared-phone sign-out and facilitator wipe leave participant storage empty while the app shell stays cached.
- Clinic card and exports contain no study code or identifier.
- What-if makes no network request and writes nothing.

**Idempotency.** Ten identical submissions with one key create one assessment; same key with a different body returns 409.

**Content governance.** Publishing fails with one approval, with two approvals from the same person, and with the wrong reviewer types; succeeds with the right pair; audit entries written.

**Guide** (FR-36). With `guideGenerative` off, the API cannot reach the model provider (the client factory throws in tests if called). Validator unit tests with adversarial answers: changed number, unknown source ID, diagnosis word, phone number, mood mention, wrong language. The provider is mocked in CI; real model calls happen only in the evaluation script, with an agreed budget.

**Accessibility.** axe-core clean on every route in light and dark mode and both languages; keyboard-only path through the questionnaire; visible focus; 44 px targets; 200% text zoom without horizontal scrolling at 360 px; `prefers-reduced-motion` respected; charts have text alternatives.

**Kinyarwanda layout.** Screenshot tests of key screens in `rw`, because longer words can overflow buttons and cards.

## CI pipeline (`.github/workflows/ci.yml`, created in Milestone 0)

1. `npm ci`
2. `npm run lint` and `npm run typecheck`
3. `npm run test` (Vitest: rules with coverage gate, schemas, content, API, web units)
4. `npm run content:validate`
5. `npm run build`, then the build-size check and `node scripts/check-contrast.mjs`
6. `npm run test:e2e` (Playwright, both projects, includes offline, safety, privacy and axe suites)
7. `npm run test:logs` (sentinel search over the logs collected during step 6)
8. `npm audit --audit-level=high`

`npm run check` runs steps 2 to 5 locally and is what the `/ship-check` skill runs first.

## Test data

Synthetic only (C-08). Study codes start with `DEMO-`. Fixtures live next to the code they test; golden fixtures live in `packages/rules/test/golden/`. Never copy real pilot data into tests, issues or logs.

## Definition of done for a change

- Acceptance criteria covered by tests that fail without the change and pass with it.
- `npm run check` passes; e2e passes for the affected flows.
- No new UI dependency outside shadcn/ui; no hard-coded user-facing strings; both languages present.
- Traceability updated; docs updated if behaviour changed.
- For rules, safety or privacy changes: the matching reviewer subagent (`rules-auditor`, `safety-reviewer`, `privacy-reviewer`) has reviewed the diff.
