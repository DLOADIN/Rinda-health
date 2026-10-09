# API

REST over HTTPS, JSON, versioned under `/api/v1` (SRS Section 3.4). Every request and response body is a Zod `strictObject` from `@rinda/schemas`, shared with the web app, so unknown fields are rejected in both directions.

## Conventions

- **Auth.** Participant routes need `Authorization: Bearer <access token>`. Staff routes under `/api/v1/admin` need the staff session cookie and a role. Public routes are marked.
- **Errors.** `{ "error": { "code": "VALIDATION_FAILED", "message": "plain words", "details": [...] } }`. Codes are stable strings; messages never echo submitted values.
- **Idempotency.** `POST /assessments`, `POST /safety-events` and `POST /feedback` take an `Idempotency-Key` header (UUID v4 created on the phone). Same key and same body returns the original response with `200`; same key with a different body returns `409 IDEMPOTENCY_MISMATCH`.
- **Rate limits.** Sign-in: 10 requests per minute per study code and per client; five wrong PINs lock the code for 15 minutes (FR-03). Guide: 20 generated answers per participant per day.
- **No health data in URLs.** Query strings never carry answers, values or bands.
- **Versions travel with data.** Every assessment carries the questionnaire and ruleset version IDs it was answered and scored with.

## Participant routes

| Method and path | Purpose | Notes | FR |
| --- | --- | --- | --- |
| `GET /api/v1/health` | Liveness | Public; no data | |
| `GET /api/v1/flags` | Non-sensitive feature booleans for this environment | Public; cached by the service worker | FR-50 |
| `POST /api/v1/auth/participant` | Sign in with study code and PIN; first use sets the PIN | Public; returns access token, sets refresh cookie | FR-03 |
| `POST /api/v1/auth/refresh` | New access token from the refresh cookie | Rotates the refresh token; checks `Origin` | |
| `POST /api/v1/auth/signout` | Revoke the refresh token | Used by shared-phone sign-out | FR-43 |
| `GET /api/v1/content/manifest?lang=en` | Published questionnaire, ruleset, recommendations, referral list, consent document, guide chips and audio list, each with version and hash | Only `published` versions ever appear | FR-04, FR-20, FR-28 |
| `GET /api/v1/content/:type/:versionId` | One published content body | Immutable; long cache lifetime | FR-28 |
| `POST /api/v1/consents` | Record consent events, one per scope | Never updates an earlier event | FR-02, FR-44 |
| `GET /api/v1/consents` | The participant's consent history | | FR-44 |
| `PUT /api/v1/profile` | Save the banded profile | | FR-03 |
| `POST /api/v1/assessments` | Submit answers and measurements; the server re-scores and returns results | `Idempotency-Key` required; body includes the client result hash | FR-08, FR-09, FR-29 |
| `GET /api/v1/assessments` | History list (date, versions, bands) | Own data only | FR-14, FR-35 |
| `GET /api/v1/assessments/:id` | One assessment with results, plan and explanations | Own data only | FR-10, FR-33, FR-37 |
| `POST /api/v1/safety-events` | Record a safety event (no answers) | Client-generated UUID is the idempotency key | FR-13, FR-41 |
| `POST /api/v1/feedback` | SUS, rating items, baseline comparison | Versioned form | FR-17 |
| `POST /api/v1/guide/explain` | Answer a question chip | Generative only when `guideGenerative` is on; otherwise `source: "template"` | FR-36 |
| `POST /api/v1/guide/feedback` | "Was this helpful?" yes or no | Counted without participant ID | FR-36 |
| `GET /api/v1/me/export` | Download the participant's own data as JSON | | FR-44 |
| `POST /api/v1/deletion-requests` | Withdraw and request deletion | | FR-18 |
| `GET /api/v1/deletion-requests/current` | Status of the participant's request | | FR-44 |
| `POST /api/v1/usability-events` | Screen timing events | Exists only when `usabilityEvents` is on | |

### Key payloads

```ts
// POST /api/v1/auth/participant
Req: { studyCode: string /* 8+ chars, unambiguous alphabet */, pin: string /* 4-6 digits */ }
Res: { accessToken: string, expiresInSeconds: 900, participant: { orderAssignment: 'AB' | 'BA', hasPin: true } }

// POST /api/v1/assessments   (header Idempotency-Key)
Req: {
  questionnaireVersionId: string, rulesetVersionId: string, language: 'en' | 'rw',
  startedAt: string, submittedAt: string,
  responses: Array<{ questionCode: string } & ({ value: number | string } | { missing: Missingness })>,
  measurements: Array<{ type: 'height' | 'weight' | 'waist' | 'systolic' | 'diastolic', value: number,
                        unit: 'cm' | 'kg' | 'mmHg', source: 'in_session' | 'recalled', measuredOn: string, rechecked: boolean }>,
  clientResultHash: string            // sha-256 of normalise(clientResult)
}
Res: { assessmentId: string, results: DomainResult[], plan: Plan, rulesetVersion: string, resultMismatch: boolean }

// POST /api/v1/guide/explain
Req: { assessmentId: string, chipId: ChipId, language: 'en' | 'rw' }
Res: { source: 'generated' | 'template', paragraphs: Array<{ text: string, sourceIds: string[] }>, followUpChipIds: ChipId[] }
```

The server builds the guide payload itself from the stored assessment; the browser never sends results to the guide.

## Staff routes (`/api/v1/admin`)

| Method and path | Roles | Purpose | FR |
| --- | --- | --- | --- |
| `POST /admin/auth`, `POST /admin/auth/signout` | any staff | Sign in and out (Argon2id; optional TOTP) | |
| `POST /admin/participants` | researcher_admin | Generate study codes with AB or BA order | FR-26 |
| `GET /admin/participants` | researcher_admin, facilitator | List codes, order, status (no answers) | FR-26 |
| `POST /admin/sessions` | facilitator | Start a session for a study code | FR-45 |
| `GET /admin/sessions/:id` | facilitator | Session view: order, tasks, safety prompts | FR-45 |
| `PUT /admin/sessions/:id/tasks/:taskCode` | facilitator | Task outcome and duration | FR-45 |
| `POST /admin/sessions/:id/safety-events` | facilitator | Observed or disclosed distress; Tier 3 checklist times | FR-13, FR-41 |
| `POST /admin/sessions/:id/end` | facilitator | End the session | FR-45 |
| `GET /admin/content` | researcher_admin, reviewer | Versions by type, key, language and status | FR-46 |
| `POST /admin/content` | researcher_admin | Create a draft version (validated against its content schema) | FR-46 |
| `GET /admin/content/:versionId/diff` | researcher_admin, reviewer | Field-by-field diff against the published version | FR-46 |
| `POST /admin/content/:versionId/approvals` | reviewer, researcher_admin | Approve or request changes | FR-20, FR-46 |
| `POST /admin/content/:versionId/publish` | researcher_admin | Publish; refused without two approvals from two different people with the required reviewer types | FR-20, FR-46 |
| `GET /admin/insights` | researcher_admin | Aggregates against proposal Table 12 targets | FR-47 |
| `GET /admin/exports/:dataset` | researcher_admin | De-identified CSV plus data dictionary and versions; logged | FR-19 |
| `GET /admin/deletion-requests`, `PATCH /admin/deletion-requests/:id` | researcher_admin | List and complete within 14 days | FR-18 |
| `GET /admin/audit-log` | researcher_admin | Read-only audit entries | FR-48 |
| `GET /admin/flags`, `PATCH /admin/flags/:key` | researcher_admin | Read and change flags; `guideGenerative` refused without `ETHICS_AMENDMENT_REF` | FR-50 |

**Required reviewer types for publishing** (two different people in every case):

| Content type | Approvals needed |
| --- | --- |
| Ruleset, NCD questions, NCD recommendations, measurement guidance, planner order | `clinical` + `researcher_admin` or `supervisor` |
| Mental-wellness questions, Tier 1 and safety screen text, support content | `mental_health` + `researcher_admin` or `supervisor` |
| Any Kinyarwanda version | `language` + the reviewer type the English version needs |
| Referral list and care directory | `community` or `clinical` + `researcher_admin` |
| Consent documents, feedback forms, guide chips and templates | `supervisor` + `researcher_admin` |

## Exports (FR-19)

CSV per dataset (`assessments`, `responses`, `measurements`, `results`, `feedback`, `tasks`, `safety_events`), joined by a `research_id` that is different from the study code. Never exported: PIN hashes, tokens, study codes, staff emails, audit metadata. Each file ships with `data_dictionary.csv` and `versions.json` (questionnaire, ruleset, content and dictionary versions) and writes an `ExportLog` and an audit entry.
