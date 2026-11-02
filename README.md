# Rinda Health

A bilingual (English and Kinyarwanda), offline-first progressive web app that helps Rwandan adults aged 18 to 35 check their risk factors for non-communicable diseases (NCDs) and, if they choose, their mental wellness.

**Educational, not diagnostic. Not an emergency service.**

ALU BSc Software Engineering capstone by Mugemanyi Manzi David, supervised by Emmanuel Annor. Pilot in Kigali, November 2026.

| | |
| --- | --- |
| Live app | https://rinda-health.vercel.app |
| Walkthrough video | https://youtu.be/wKDEsNN1Ep4 |
| Technical report (PDF, 5 pages) | https://docs.google.com/document/d/1zbBbaQLzkrVKINQaLGhBCyxlatvr2zvOFQs_XyVmvqU/edit?tab=t.0 |
| Repository | https://github.com/DLOADIN/Rinda-health |

## The problem it solves

NCDs such as hypertension, diabetes and heart disease are rising among young Rwandans, but most screening happens late, in clinics, and on paper. Young adults rarely get an early, private picture of their own risk factors, in their own language, with clear next steps. Mobile data is also patchy, and many phones are shared.

Rinda Health gives a short, private check-up that works on any phone, even offline. It explains each result in plain language, with a practical next step and real services to contact.

## Main features

- **Six-area NCD check-up**: tobacco, alcohol, physical activity, fruit and vegetables, body size (BMI and waist) and blood pressure. There is also an optional mental-wellness check (PHQ-9 and GAD-7), and every sensitive question can be skipped.
- **Separate result for each area**: each shows its band as a word and an icon, explains why, and gives tips and a small weekly plan. There is never a combined score.
- **Deterministic, versioned scoring**: the same pure functions run on the phone and on the server. No AI decides any result.
- **Safety first**: "Get help now" and Exit are on every participant screen. A risky answer to PHQ-9 item 9 opens the safety screen on the phone before any network call.
- **Works offline**: the check-up is scored on the phone, saved encrypted (AES-GCM) and sent later without duplicates. A facilitator can also carry it to the server by QR code.
- **Blood pressure from a photo**: in-browser image processing reads a BP monitor's seven-segment display.
- **Voice check-up**: Rinda reads each question aloud and fills the form from spoken answers.
- **Ask Rinda**: an AI guide answers questions about your own results. Its answers are validated against approved content and checked for crisis words, with up to 15 questions a day.
- **Email and SMS summaries** after each check-up (Brevo and Pindo), with on/off switches on the Profile page.
- **Dashboards for four roles**: participant, facilitator, researcher-admin and reviewer. Staff also get sessions, QR uploads, content approval, feature flags, an audit log and research exports.

## Technical requirements

| Need | Version |
| --- | --- |
| Node.js | 22.12 or newer (24 LTS recommended) |
| npm | 10 or newer |
| Database | PostgreSQL 16+ (Neon serverless Postgres used in production) |
| Browser | A current Chromium browser (Chrome, Edge, Samsung Internet) or Safari on iOS. Both engines are tested in CI. |
| Operating system for development | Windows 10/11, macOS or Linux |
| Optional services | Brevo (email), Pindo (SMS), Gemini / Groq / OpenRouter (AI guide), Groq / ElevenLabs / Gemini (voice), Google OAuth (sign-in) |

### Main frameworks and libraries

| Part | Technology |
| --- | --- |
| Frontend (`frontend/`) | React 19, TypeScript 5, Vite 8, Tailwind CSS 4, shadcn/ui (Radix), lucide-react, Redux Toolkit + RTK Query, React Hook Form + Zod, i18next, Workbox (PWA), IndexedDB (`idb`) + Web Crypto |
| Backend (`backend/`) | Node.js, Express 5, Zod 4, `pg` (plain SQL, no ORM), pino logging, Argon2id passwords, Google OpenID Connect |
| Shared packages | `packages/rules` (scoring), `packages/schemas` (API contracts), `packages/content` (approved wording and ruleset) |
| Tests | Vitest, Supertest, Testing Library, Playwright (mobile Chromium and WebKit), axe-core |
| Delivery | Vercel (frontend and serverless API), Neon PostgreSQL, GitHub Actions CI, Docker Compose (optional local) |

No APK is needed. Rinda Health is a progressive web app: open the live link on a phone and choose **Add to Home screen** (Android) or **Share → Add to Home Screen** (iPhone) to install it.

## Install and run locally

1. Clone and install:
   ```bash
   git clone https://github.com/DLOADIN/Rinda-health.git
   cd Rinda-health
   npm install
   ```
2. Create a file called `.env` in the project root with at least these two values:
   ```bash
   DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require   # a Neon or local Postgres
   SESSION_SECRET=any-long-random-string-of-32-or-more-characters
   ```
   Optional values switch on extra services: `APP_ENV` (development, staging or pilot), `PUBLIC_URL`, `BREVO_API_KEY` + `EMAIL_FROM`, `PINDO_API_TOKEN` (+ `SMS_ONLY_TO` to limit SMS to one number), `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY`, `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`. The app works without them; those features just stay off.
3. Create the tables and the synthetic demo accounts:
   ```bash
   npm run db:check     # test the database connection
   npm run db:migrate   # create the tables
   npm run db:seed      # demo accounts for every role (synthetic data only)
   ```
4. Start the app and API together:
   ```bash
   npm run dev
   ```
   Open http://localhost:5173. The API runs on port 3000 and is reached through `/api`.

### Useful commands

| Command | Does |
| --- | --- |
| `npm run dev` | Frontend and API together |
| `npm run check` | Lint, typecheck, unit, golden and database tests, content validation, build, size and contrast checks |
| `npm run test` | All Vitest tests (rules, schemas, content, frontend components, API) |
| `npm run test:golden` | Scoring golden cases only |
| `npm run test:e2e` | Playwright on the production build, phone-sized Chromium and WebKit |
| `npm run build` | Production build of the frontend |
| `npm run sms:check -- +2507XXXXXXXX` | Send one test SMS |
| `npm run models:check` | Check that each AI provider answers |

## Repository structure

```
frontend/                  the web app (PWA)
  src/app/                 router and Redux store
  src/components/          reusable pieces: AppShell, GetHelp, BandBadge, ConfirmAction
  src/components/ui/       shadcn/ui building blocks
  src/features/            one folder per area: auth, consent, participant, results,
                           guide, profile, dashboard, staff, sync, feedback, ...
  src/lib/                 API client, offline outbox, encrypted storage, i18n,
                           BP photo reader, voice, speech parsing
  src/locales/             interface text (en, rw)
  src/sw/                  service worker
backend/
  server.ts                the API: config, SQL, sessions, routers per area, messaging, AI
  server.test.ts           API integration tests (each run in a throwaway database schema)
  db/migrations/           numbered plain-SQL migrations
packages/
  rules/                   pure scoring, safety checks, planner, simulator, chat guard
  schemas/                 Zod contracts for every request and response
  content/                 approved wording (en, rw) and the versioned ruleset
e2e/                       Playwright browser tests (golden parity, safety, privacy, axe)
scripts/                   size, contrast and log checks (Node only)
.github/workflows/ci.yml   CI: checks, e2e on Chromium and WebKit, log check, npm audit
```

A file-by-file guide is in [explanation.md](explanation.md).

## Testing at a glance

| Kind | Tool | Where |
| --- | --- | --- |
| Unit and golden (scoring) | Vitest | `packages/rules/test`: 79 scoring and 7 planner golden cases |
| Component | Vitest + Testing Library | `frontend/src/**/*.test.tsx` |
| Integration (API + real database) | Vitest + Supertest | `backend/server.test.ts` |
| End-to-end, compatibility | Playwright: Pixel 7 (Chromium), iPhone 14 (WebKit) | `e2e/*.spec.ts` |
| Accessibility | axe-core, contrast script | `e2e/privacy.spec.ts`, `scripts/check-contrast.mjs` |
| Performance budget | size script | `scripts/check-size.mjs`: build fails above 250 KB gzip first-load JS |

The report covers the results, performance across devices and browsers, and the code-quality practices.

## Safety and privacy notes

- Rinda Health is educational, not diagnostic, and is not an emergency service. In an emergency in Rwanda, call 912 (SAMU) or 114.
- Only synthetic data is stored in development and staging. Logs never contain answers, results, passwords or tokens.
- Secrets live in `.env` (local) or Vercel environment variables, never in the repository.
