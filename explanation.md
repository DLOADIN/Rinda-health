# Rinda Health: how this project works

A guide to the whole repository as it stands on 7 October 2026: frontend and backend separated, the database live on Neon, sign-in and sign-up for every role, and a dashboard for each role. Read it once from top to bottom, then use it as a map.

---

## 1. The project in one paragraph

Rinda Health is a **progressive web app (PWA)**: a website that installs on a phone like an app. Young adults in Kigali answer questions about six NCD risk factors (tobacco, alcohol, physical activity, diet, body size, blood pressure) and get a **separate, explained, educational result for each area**, with next steps and real services to call. It never diagnoses and never adds results into one score. Staff (facilitators, researcher-admins and reviewers) use the same app with their own dashboards.

```
 Phone or laptop (browser)            Server                               Database
┌──────────────────────────┐  /api   ┌──────────────────────────────┐ SQL ┌────────────────────┐
│ frontend/  React + shadcn │ ──────► │ backend/server.ts  (one file) │ ──► │ PostgreSQL on Neon │
└──────────────────────────┘         └──────────────────────────────┘     └────────────────────┘
              │                                     │
              └──── both use the same packages/rules (scoring) and packages/schemas ────┘
```

---

## 2. The four roles (actors)

| Role | Signs in with | Dashboard menu | Can do |
| --- | --- | --- | --- |
| **Participant** | Email or phone + password, or Google | Home, Check-up, Results, Get help, Profile | Take check-ups, see and delete results, edit profile, ask for data deletion |
| **Facilitator** | Same | Home, Participants, Sessions, Safety, Profile | Start and run sessions, record task outcomes and times, record distress events |
| **Researcher-admin** | Same | Home, Users, Content, Participants, Safety, Deletions, Audit log, Features, Profile | Manage every account, write and publish content, complete deletions, read the audit log, switch features |
| **Reviewer** | Same | Home, Reviews, Profile | Approve content or request changes |

Anyone can sign up as any role (decision ADR-017). Close this before real data are collected.

---

## 3. How to run it

### 3.1 First time

1. Install Node.js 22.12 or newer (24 recommended), then run `npm install` in the project folder.
2. Copy `.env.example` to `.env` and fill it in (section 4).
3. Run:
   ```bash
   npm run db:check     # prints your Neon host and PostgreSQL version
   npm run db:migrate   # creates the tables (records them as done if you already ran the SQL in Neon)
   npm run db:seed      # demo accounts for every role, printed once with their password
   npm run dev          # frontend and backend together
   ```
4. Open **http://localhost:5173**.

### 3.2 Demo accounts (synthetic data only)

| Email | Role |
| --- | --- |
| admin@rinda.test | Researcher-admin |
| facilitator@rinda.test | Facilitator |
| reviewer@rinda.test, reviewer2@rinda.test | Reviewer |
| participant1@rinda.test, participant2@rinda.test | Participant |

All of them share one password. `npm run db:seed` prints it, or uses `SEED_PASSWORD` from `.env` if you set one. Running the seed again resets it.

### 3.3 All commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Frontend (port 5173) and backend (port 3000) together; the frontend forwards `/api` to the backend |
| `npm run check` | Everything that must pass before calling work done: lint, typecheck, scoring coverage (100%), every unit and database test, content validation, build, size budget, colour contrast |
| `npm run test` | All unit and database tests |
| `npm run test:e2e` | Builds the app and runs browser tests at phone size in Chromium and WebKit |
| `npm run test:logs` | Checks the backend logs from the last browser test run contain no health values or passwords |
| `npm run content:validate` | Checks the wording files: same keys in English and Kinyarwanda, every band has a label |
| `npm run db:check` / `db:migrate` / `db:seed` | Test the database connection / apply new SQL migrations / add demo data |
| `npm run build` | Production build of the frontend into `frontend/dist` |

---

## 4. The `.env` file (secrets, never committed)

| Variable | Where it comes from |
| --- | --- |
| `DATABASE_URL` | Neon console, **Connect**, with "Connection pooling" **on**. The host contains `-pooler`. Keep `?sslmode=require` at the end |
| `DIRECT_URL` | Optional. It is the same string with `-pooler` removed from the host; the backend works it out automatically if you leave it empty |
| `SESSION_SECRET` | Not from Neon. Make one on your computer: `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` |
| `SEED_PASSWORD` | Not from Neon. Any password you want for the demo accounts |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud console, Credentials, OAuth client ID (Web application) |
| `PUBLIC_URL` | Where people open the app: `http://localhost:5173` locally, your real address after deployment |
| `AWS_*` (Neon storage keys) | Not used: the app stores no files. You can leave them or remove them |

**Google sign-in settings.** In the Google OAuth client, add:

- Authorised JavaScript origin: `http://localhost:5173`
- Authorised redirect URI: `http://localhost:5173/api/v1/auth/google/callback`

After deployment, add the same two entries with your live address (for example `https://rinda.example.org` and `https://rinda.example.org/api/v1/auth/google/callback`) and set `PUBLIC_URL` to that address. While the consent screen is in "Testing" mode, only Google accounts listed as test users can sign in.

---

## 5. What every folder and file holds

### 5.1 Root

| File | What is in it |
| --- | --- |
| `package.json` | The workspaces (`frontend`, `backend`, `packages/*`) and every `npm run` command |
| `package-lock.json` | Exact versions of every package (generated; commit it, never edit it) |
| `tsconfig.base.json` | Shared TypeScript settings (strict mode) |
| `vitest.config.ts` | The test projects: `rules`, `schemas`, `backend`, `web`, and the 100% coverage rule for scoring |
| `playwright.config.ts` | Browser tests: two phones at 360 px, starts the backend and the built frontend first |
| `eslint.config.js` | Code rules: no `any`, accessibility checks, no hard-coded visible text |
| `.prettierrc.json`, `.prettierignore` | Code formatting style |
| `.env.example` | Every setting with an explanation and no secret values |
| `.gitignore`, `.dockerignore` | What Git and Docker must skip (`node_modules`, builds, `.env`, test output, `Badget-main/`) |
| `docker-compose.yml` | Optional local PostgreSQL plus the backend in containers |
| `.github/workflows/ci.yml` | GitHub Actions: runs the checks and browser tests on every push |
| `README.md` | Project introduction and how to run it |
| `Badget-main/` | Your design reference copy of Badget. Not part of the app, ignored by Git and the tools |

### 5.2 `backend/`: the whole API

| File | What is in it |
| --- | --- |
| `server.ts` | **The entire backend in one file**, in numbered sections: 1 settings check; 2 safe logging and error codes; 3 database (`pg` pool, transactions, migration runner, direct-URL helper); 4 passwords (Argon2id) and sessions (HttpOnly cookie, hashed in the database); 5 Google sign-in (OpenID Connect with PKCE); 6 middleware (request IDs, request log, error handler); 7 feature flags; 8 routes; 9 demo seed; 10 the `serve`, `migrate`, `seed` and `db-check` commands |
| `server.test.ts` | Backend tests. Seven run without a database; ten run every role's operations against Neon inside a throwaway schema that is deleted afterwards |
| `db/migrations/001_init.sql` | The database in plain SQL: users, sessions, participant profiles, consents, assessments, safety events, facilitator sessions and tasks, feedback, deletion requests, content versions and approvals, feature flags, and the append-only audit log |
| `Dockerfile` | Builds a container that applies migrations and starts `server.ts` |
| `package.json`, `tsconfig.json` | Backend settings and its commands |

**API routes** (all under `/api/v1`):

| Area | Routes |
| --- | --- |
| Public | `GET /health`, `GET /flags` |
| Sign-in | `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/providers`, `GET /auth/google/start`, `GET /auth/google/callback` |
| My account (every role) | `GET /me`, `PATCH /me`, `POST /me/password`, `GET /dashboard` |
| Participant | `GET` and `PUT /participant/profile`; `POST`, `GET`, `GET /:id` and `DELETE /:id` on `/participant/assessments`; `POST /participant/deletion-requests`; `GET /participant/deletion-requests/current` |
| Facilitator | `GET /facilitator/participants`; `GET`, `POST`, `GET /:id` and `DELETE /:id` on `/facilitator/sessions`; `PUT /facilitator/sessions/:id/tasks/:task`; `POST /facilitator/sessions/:id/end`; `GET` and `POST /facilitator/safety-events` |
| Researcher-admin | `GET`, `POST`, `PATCH /:id` and `DELETE /:id` on `/admin/users`; `GET /admin/deletion-requests`; `POST /admin/deletion-requests/:id/complete`; `GET /admin/audit-log`; `GET /admin/flags`; `PATCH /admin/flags/:key` |
| Content (admin and reviewer) | `GET`, `POST`, `GET /:id`, `PATCH /:id` and `DELETE /:id` on `/content`; `POST /content/:id/approvals`; `POST /content/:id/publish` |

### 5.3 `frontend/`: the web app

| Path | What is in it |
| --- | --- |
| `index.html`, `vite.config.ts` | The page shell, the PWA settings (name, colours, icons, offline cache) and the `/api` forwarding to port 3000 |
| `src/main.tsx` | Starts the app: Redux store, router, toasts, light or dark mode from the phone setting |
| `src/index.css` | Tailwind, the self-hosted Inter font and the Rinda colour tokens |
| `src/app/router.tsx` | Pages: `/` welcome, `/login`, `/signup`, `/exit`, and `/app/*` for every dashboard |
| `src/app/store.ts` | Redux store; clearing it on Exit and sign-out drops all cached data |
| `src/lib/api.ts` | Every backend call in one place (RTK Query), with automatic refresh after changes |
| `src/lib/i18n/`, `src/locales/en`, `src/locales/rw` | Translations for every visible word, in English and Kinyarwanda |
| `src/lib/content.ts` | Approved health wording (questions, band labels, referral list) in the current language |
| `src/lib/format.ts`, `src/lib/me.ts` | Dates and numbers in both languages; the name to greet someone by |
| `src/components/app-shell.tsx` | Frame for public pages: language switch, Exit, sticky Get help now |
| `src/components/get-help.tsx`, `referral-list.tsx` | The Get help now drawer and the list of services to call |
| `src/components/band-badge.tsx` | One badge for every result: word, icon and colour together |
| `src/components/confirm-action.tsx`, `page-header.tsx`, `api-error.tsx`, `language-switch.tsx`, `offline-badge.tsx` | Shared pieces: confirmation dialog, page titles, friendly errors, EN/RW switch, offline badge |
| `src/components/ui/` | shadcn components, including the `sidebar` used by the dashboards. Only `button.tsx` is edited (44 px default size) |
| `src/features/auth/` | Sign-in and sign-up pages (Badget-style centred card), the Google button |
| `src/features/dashboard/` | The Badget-style frame (sidebar, header, account menu), each role's menu (`nav.ts`), and the Home page with metric cards |
| `src/features/profile/profile-page.tsx` | Edit name, email, phone, language and password; participants also edit age group, sex and district, and can ask for deletion |
| `src/features/participant/` | Check-up form (every question skippable), results list, one result in full, help page |
| `src/features/results/result-view.tsx` | How a result is shown: purpose statement, any urgent message, next steps, one card per area |
| `src/features/staff/` | Staff pages (one chunk participants never download): participants, sessions, safety, users, content, deletions, audit log, features |
| `src/features/welcome`, `exit`, `errors`, `sync` | Welcome page, neutral exit page, error page with Get help, the update prompt |
| `src/sw/sw.ts` | The service worker: keeps the app working offline, never caches personal data |
| `src/hooks/use-mobile.ts` | Tells the sidebar when the screen is phone-sized |

### 5.4 `packages/`: shared by frontend and backend

| Package | What is in it |
| --- | --- |
| `rules/` | The scoring engine: one rule per area, safety tiers, next-step planner, what-if simulator, measurement checks. 79 golden cases and 7 planner cases from the SRS, 100% tested |
| `schemas/` | The shape of every request and response (Zod), including sign-up, sign-in, profile, check-up, sessions, users and content |
| `content/` | Wording files: `rulesets/v1.0.json` (every threshold), and in `en/` and `rw/`: band labels, general text, safety text, referral list, and the draft check-up questions |

### 5.5 `docs/`, `scripts/`, `e2e/`

| Path | What is in it |
| --- | --- |
| `docs/SRS.md` | The requirements, now version 1.4 (Section 13 covers today's changes) |
| `docs/DECISIONS.md` | Decisions ADR-001 to ADR-018 (Neon hosting, single-file backend, open sign-up, Badget design) |
| `docs/*.md` (others) | Features, scoring rules, safety, privacy, offline, AI guide, design system, testing, roadmap, traceability |
| `scripts/check-contrast.mjs`, `check-size.mjs`, `check-logs.mjs`, `run-logged.mjs`, `generate-icons.mjs` | Colour contrast check, download-size budget, log privacy check, log capture for tests, app icon generator |
| `e2e/*.spec.ts` | Browser tests: the app shell at 360 px, accessibility, Get help, Exit, language, offline, and the scoring cases in both browsers |

---

## 6. Wording that still needs your reviewers

- **Kinyarwanda:** all interface text, the draft check-up questions and the band labels are first drafts. The bilingual key informant should check them.
- **Health wording:** the check-up questions are marked `draft` in `packages/content`. The clinician should approve them.
- **Safety and referral wording:** Get help now titles, the safety screen and service names and hours are still `TODO(content)` placeholders, by design. They need the mental-health and community key informants.
- **Mood and stress module (PHQ-9, GAD-7):** not offered yet. It needs validated Kinyarwanda versions and the item 9 safety screen.

---

## 7. Files you can delete safely

All of these are generated, already ignored by Git, and come back when you run the commands again:

`node_modules/`, `coverage/`, `test-results/`, `playwright-report/`, `frontend/dist/`, `*.tsbuildinfo`.

Do not delete anything in `docs/`, `README.md` or `.env`. `Badget-main/` can be deleted whenever you no longer need it as a design reference.

---

## 8. Added on 9 and 10 October 2026: AI guide, email reports, offline, new look

### 8.1 Ask Rinda (the AI guide)

1. A participant taps a question chip ("What do my results mean?", "What is one small step…?", "Make me a simple plan…", or "Explain my result for…" from a result's details).
2. The phone builds an answer straight away from approved templates and the planner (`packages/rules/src/guide.ts`). This works offline and is always available.
3. When online, the backend (`backend/server.ts`, section 5b) may ask **Google Gemini** to reword that answer for the person. It sends only area codes, band words, values and plan targets, never a name, email, phone, ID, date or anything about mood and stress.
4. A checker reads Gemini's answer. If it changes a number, mentions anything outside the facts, names medicines, links, phone numbers or mood, or is too long, the approved template is shown instead. A badge always says "From approved guidance" or "Written by Rinda's guide from your results".

**The AI only switches on when both are set:** `GEMINI_API_KEY` and `ETHICS_AMENDMENT_REF`. For testing with the demo accounts, you may use `ETHICS_AMENDMENT_REF=SYNTHETIC-DEV-ONLY`. The backend refuses that value in the pilot. Kinyarwanda answers stay template-only until your language reviewer approves AI answers in Kinyarwanda.

Each participant must also switch on **"Use AI to explain my results"** in Profile (it starts off). Without that, they get the approved template. In the pilot the backend also needs `GEMINI_PAID_TIER=true`, meaning you have moved the key to a paid Gemini tier that does not train on prompts. Every AI attempt counts towards the limit of 20 per person per day.

**Free AI options** (check each provider's current terms before use; free tiers can change):

| Provider | Free how | Note for health data |
| --- | --- | --- |
| **Google Gemini** (built in) | Free key at aistudio.google.com/apikey, with daily limits | Free-tier prompts may be used by Google to improve its products. Synthetic data only; use a paid tier before real participants |
| Groq | Free tier for open models (Llama, Gemma) via an OpenAI-style API | Fast; check its data-use terms |
| OpenRouter | Some models marked ":free" | Routes to other companies; terms vary by model |
| Cloudflare Workers AI | Daily free allocation | Runs on Cloudflare; needs a Cloudflare account |

Only Gemini is wired in. Switching provider means changing `explainWithGemini` in `server.ts`; the checker and fallback stay the same.

### 8.2 Email reports (ADR-020)

- A participant turns them on in **Profile, Email reports**. They are off by default, need an account with an email address, and every change is saved as a consent record.
- After each new check-up, an opted-in participant gets an email with the result word for each area, one small first step, the educational notice and a link to the result. A result page also has **Email me this summary** (up to 5 a day).
- Mental-wellness results are never emailed. The backend records only "sent", "failed" or "skipped" in `message_events`, never the address or the text.
- WhatsApp and SMS were removed on 10 October 2026 and may come back later.

To set it up (Brevo, free 300 emails a day):

1. Sign up at brevo.com. Go to **Senders, Domains & Dedicated IPs > Senders** and add and verify the address emails come from (your Gmail works).
2. Go to **SMTP & API > API Keys** and create a v3 API key (not an SMTP key).
3. In `.env`: `BREVO_API_KEY=<key>`, `EMAIL_FROM=<verified address>`, and optionally `EMAIL_FROM_NAME=Rinda Health`. Restart `npm run dev`.
4. Sign in as a participant whose account uses that email, switch on **Email me my check-up summaries** in Profile, and do a check-up or press **Email me this summary** on a result.

In the pilot, the admin cannot switch on the `messaging` flag until `MESSAGING_APPROVAL_REF` in `.env` holds the ethics approval reference for emailing results.

### 8.3 Working offline (PWA)

| Works without internet | How |
| --- | --- |
| Opening the app and the dashboard you last saw | Service worker cache plus an encrypted copy of your account and latest results |
| Doing a check-up | Scored on the phone with the same rules, saved encrypted, shown as "Saved on this phone, not sent yet" |
| Sending it later | The header shows "1 waiting to send". It sends by itself when the internet returns, when you reopen the app, or when you tap the badge |
| Ask Rinda | Answers from approved guidance on the phone |
| Get help now | Always available |

- **Install it:** Profile, **Install Rinda**. On iPhone: Share, then Add to Home Screen.
- **Where data is kept:** IndexedDB, encrypted with AES-GCM using a key the browser cannot export (`frontend/src/lib/storage/vault.ts`).
- **What Exit and sign-out clear:** everything except check-ups still waiting to send.

### 8.4 New look

- **Surfaces:** glass cards (`glass`, `glass-strong`), a soft blush, amber and ember background glow (`bg-mesh`), and a glowing hero disc (`hero-orb`). All are defined in `frontend/src/index.css` from the Rinda colour tokens only.
- **Charts** (`frontend/src/features/dashboard/charts.tsx`, loaded on demand), each with a sentence for screen readers:
  - weekly activity ring
  - blood pressure capsules over time
  - fruit and vegetable bars with the target line
  - 14-day area charts for staff
- **Results:** tap any area card for a details dialog with its value, rule and source, next step, and "Ask Rinda about this".

### 8.5 New files

| File | What it does |
| --- | --- |
| `backend/db/migrations/002_guide_and_messaging.sql` | Guide request log and message log |
| `packages/rules/src/guide.ts` | Rule-based guide answers (works offline) |
| `packages/content/en/guide.json`, `rw/guide.json` | Draft guide wording for your reviewers |
| `frontend/src/features/guide/guide-panel.tsx`, `guide-button.tsx` | The Ask Rinda drawer and button |
| `frontend/src/features/dashboard/charts.tsx` | All charts |
| `frontend/src/lib/storage/vault.ts` | Encrypted storage on the phone |
| `frontend/src/lib/offline.ts` | Offline check-ups, the outbox and sending |
| `frontend/src/lib/use-cached.ts` | Shows the last saved copy when offline |
| `frontend/src/lib/install.ts` | The Install app button |
