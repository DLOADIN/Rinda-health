# Security and privacy

Frame: Rwanda's Law No. 058/2021 on the protection of personal data and privacy, the ALU ethics approval, and SRS constraints C-05 to C-08, FR-15, FR-18, FR-19 and NFR-01 to NFR-03, NFR-12 and NFR-14. Health data are sensitive personal data, so the default answer to "should we collect or log this?" is no.

## What we collect and what we never collect

| Data | Where | Class | Kept for |
| --- | --- | --- | --- |
| Study code, PIN hash (Argon2id), AB/BA order | API database | Pseudonymous identifier | Until deletion (30 days after the pilot at most) |
| Age band, sex, district band, education band, device type, language | API database | Banded profile | Same |
| Answers, measurements, results, missingness codes | Phone (encrypted, until sent) and API database | Health data | Same |
| Consent events (scope, version, language, time) | API database | Consent record | Kept with the consent records |
| Safety events (tier, trigger, actions, times; no answers) | API database | Safety record | Kept with the consent records |
| Feedback and task outcomes | API database | Research data | Same as health data |
| Participant email or phone number (E.164), used to sign in (ADR-017); email report choice | API database; with the participant's opt-in, the email address and an NCD result summary go to Brevo (ADR-020) to send the report. `message_events` keeps channel, status and error code only | Contact identifier | Deleted with the account; the transfer must be covered by the ethics approval (MESSAGING_APPROVAL_REF) before the pilot |
| Staff email, phone number (E.164), Google subject ID, break-glass password hash (Argon2id), hashed sessions and SMS codes | API database; email goes to Google and phone number to the SMS provider at sign-in only (SRS Section 12, NFR-19) | Staff identifier | Duration of the project; SMS codes expire after 5 minutes |
| Offline hand-over packages: waiting check-ups and item 9 events, sealed on the phone to the server's hand-over key (ECDH P-256, HKDF-SHA-256, AES-256-GCM), with an expiring per-person proof inside (ADR-027) | While being handed over: QR codes on the phone screen, then the facilitator's laptop (`handover-inbox` vault record, tagged with the facilitator's id). Only the server can open a package; the laptop never sees inside | Sealed health data | Laptop: until uploaded or discarded, at most 14 days. The phone keeps its own copy until it sends it itself |
| Technical logs (route, status, duration, correlation ID) | Log store | Operational | 14 days |

**Never collected anywhere in the system** (C-06): participant names, national ID numbers, phone numbers or email addresses, free-text answers, exact dates of birth, GPS location, photos, audio in the app, IP addresses in logs, device identifiers, third-party analytics or tracking.

## Threats and mitigations

| Threat | Mitigation |
| --- | --- |
| Someone else uses or sees a shared study phone | Shared-phone mode wipes everything at sign-out (FR-43); facilitator wipe (FR-27); quick exit and auto-lock (FR-42); drafts and outbox encrypted |
| Lost or stolen phone | Short-lived local data (cleared once sent), encrypted IndexedDB, PIN lock, refresh token revocable from the console |
| Someone films a phone's hand-over QR codes, or copies a facilitator laptop's packages | Packages are sealed to the server's key, so a recording or copy cannot be read; the proof inside expires after 30 days; uploads need a facilitator who had a session with that participant in the last 14 days; replays store nothing new. In the pilot the key comes from its own `HANDOVER_SECRET`, and `HANDOVER_SECRET_PREVIOUS` keeps packages already in the field working during a rotation |
| Camera use (blood pressure reading, hand-over scanning) | Pictures are read in memory on the device and never stored or sent; the camera stops as soon as it is not needed (ADR-026) |
| Network eavesdropping | HTTPS only with TLS 1.2 or later, HSTS, no mixed content |
| Stolen database or backup | Pseudonymous codes only, no direct identifiers, host disk encryption, encrypted backups, least-privilege database role |
| Staff misuse | Role-based access on every route, two-person content approval (FR-46), append-only audit log (FR-48), exports logged (FR-19) |
| Cross-site scripting | React escaping, no `dangerouslySetInnerHTML`, strict Content Security Policy, Zod validation at every boundary |
| Brute-forcing PINs or passwords | Argon2id, rate limits, five failed attempts lock a code for 15 minutes (FR-03) |
| Health data leaking through logs | Logger never receives request bodies; redaction list; FR-15 sentinel test |
| Vulnerable dependencies | Lockfile, `npm audit` in CI, minimal dependency list, shadcn components are copied source rather than a large UI kit |
| AI provider exposure (only if FR-36 is enabled) | No identifiers, dates or mental-wellness data sent; ethics amendment first; see [AI_GUIDE.md](AI_GUIDE.md) |

## Controls the code must implement

**Transport and headers.** HTTPS everywhere. Helmet with HSTS and this Content Security Policy (tighten further if possible):

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self';
frame-ancestors 'none'; base-uri 'none'; form-action 'self'
```

`'unsafe-inline'` for styles is needed because popovers and charts position themselves with inline style attributes. Scripts stay strict. Fonts are self-hosted; no CDN, no Google Fonts.

**Participant authentication.** Study code plus a 4- to 6-digit PIN set at first use (FR-03). The API returns a 15-minute access token (kept in memory, sent as a Bearer header) and sets a refresh token in an `HttpOnly; Secure; SameSite=Strict` cookie scoped to `/api/v1/auth`. Refresh tokens are stored hashed, rotate on use and are revoked on sign-out and on deletion. Lifetime is configurable (`PARTICIPANT_REFRESH_TTL_HOURS`, default 12 for the pilot).

**Offline unlock.** The phone keeps a PBKDF2-SHA-256 verifier of the PIN (600,000 iterations, random salt) so the app can unlock offline. The lock is a privacy barrier for shared phones, not protection against forensic analysis; that is why local data are kept only until sent and shared-phone mode keeps nothing.

**Local encryption** (NFR-03). On first sign-in the app generates a random AES-GCM 256-bit key with `extractable: false` and stores the `CryptoKey` object in IndexedDB. Drafts, the outbox and cached results are encrypted with a fresh 96-bit IV per record. Wipe deletes the key, which makes any leftover ciphertext unreadable.

**Staff authentication.** Email and password (Argon2id, at least 12 characters), optional TOTP (Should), `HttpOnly` session cookie, 8-hour idle timeout. Roles: `researcher_admin`, `facilitator`, `reviewer` (with a reviewer type: `supervisor`, `clinical`, `mental_health`, `language`, `community`).

**Authorisation.** Deny by default. Every route declares its roles. Participant routes check ownership on every record (`participantId` from the token, never from the body).

**Validation.** Zod `strictObject` schemas from `@rinda/schemas` on every request and response; unknown keys are rejected, which is what keeps answers out of safety events (FR-13).

**Idempotency.** `POST /assessments` and `POST /safety-events` require an `Idempotency-Key` (UUID v4 generated on the phone). The API stores the key with a hash of the canonical request and returns the original response for repeats; a different payload with a reused key gets `409`.

**Logging** (FR-15, NFR-12). pino, JSON, one line per request: method, route template (not the raw URL), status, duration, correlation ID. Never log request or response bodies, query strings on participant routes, headers with tokens or cookies, or IP addresses. Redact `req.headers.authorization`, `req.headers.cookie`, `res.headers["set-cookie"]` and any key named `pin`, `password`, `token`, `answers`, `value`, `systolic`, `diastolic` as a second line of defence. Browser code never sends logs anywhere.

**FR-15 sentinel test.** The end-to-end suite enters unusual sentinel values (for example systolic 187, diastolic 113, 13 servings, PIN 482915) and then searches API logs, browser console output and service-worker logs for them. Any hit fails CI.

**Secrets.** Only in the host's secret store or a local `.env` that is git-ignored. The repository holds `.env.example` with names and comments, never values.

**Database.** PostgreSQL with a migration role and a separate least-privilege runtime role. Daily encrypted backups; one restore drill recorded before the pilot (NFR-07).

## Hosting and residency

- Development and demos: any host (for example Render) with **synthetic data only** (C-08). Seed scripts generate obviously fake study codes such as `DEMO-XXXX`.
- Pilot: Neon PostgreSQL, approved by the supervisor on 5 October 2026 on condition that any personal identifiers collected are deleted within about 72 hours (C-07, NFR-14, ADR-014). The app collects no participant identifiers (C-06). Keep the written approval with the ethics documents.
- No participant data before ethics approval (C-08).

## Retention and rights

- Application data: exported de-identified and deleted within 30 days after the pilot; backups expire within a further 30 days; technical logs 14 days (SRS Section 7.2).
- Withdrawal and deletion requests are completed within 72 hours and recorded (FR-18). Deleting a participant removes profile, assessments, responses, measurements, results, feedback, task outcomes and refresh tokens; consent and safety records follow the retention the ethics approval sets.
- People can see what is kept, change optional consents and download their own results (FR-44).

## If something goes wrong

1. Contain: revoke tokens, rotate secrets, take the affected service offline if needed.
2. Tell the supervisor and the ALU Research Ethics Committee immediately.
3. Notify the national data-protection authority and affected people within the deadline Law No. 058/2021 sets; confirm the current requirement with the supervisor.
4. Write down what happened, what data were affected and what changed, without copying any health data into the report.
