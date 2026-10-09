# Rinda Health

A bilingual (English and Kinyarwanda), offline-first progressive web app that helps Rwandan adults aged 18 to 35 check their risk factors for non-communicable diseases (NCDs) and, if they choose, their mental wellness.

**Educational, not diagnostic. Not an emergency service.**

ALU BSc Software Engineering capstone by Mugemanyi Manzi David, supervised by Emmanuel Annor. Pilot in Kigali, November 2026.

## The problem it solves

NCDs such as hypertension, diabetes and heart disease are rising among young Rwandans, but most screening happens late, in clinics, and on paper. Young adults rarely get an early, private picture of their own risk factors, in their own language, with clear next steps. Mobile data is also patchy, and many phones are shared.

Rinda Health gives a short, private check-up that works on any phone, and explains each result in plain language with a practical next step and real services to contact.

## What it does

- **Screens six NCD risk factors**: tobacco, alcohol, physical activity, diet, body size (BMI and waist) and blood pressure.
- **Gives a separate result for each area**: the band in words and an icon, the source of the rule and the next step. There is never a combined score.
- **Scores deterministically**: fixed, versioned rules give the same result on the phone and on the server. No AI decides any result.
- **Puts safety first**: "Get help now" and Exit are on every participant screen.
- **Dashboards for four roles**: participants, facilitators, researcher-admins and reviewers each have their own sidebar menu, metrics and tools, on phones and laptops.

## Tech stack

| Part | Technology |
| --- | --- |
| Frontend (`frontend/`) | React 19, TypeScript, Vite 8, Tailwind CSS 4, shadcn/ui, RTK Query, i18next, Workbox (PWA) |
| Backend (`backend/server.ts`) | Node.js, Express 5, Zod, pino, Argon2id, Google sign-in (OpenID Connect) |
| Database | PostgreSQL on Neon, plain SQL through `pg` (no ORM) |
| Shared code | `packages/rules` (scoring), `packages/schemas` (API contracts), `packages/content` (wording and ruleset) |
| Tests | Vitest, Supertest, Playwright (mobile Chromium and WebKit), axe-core |

## Run it locally

You need **Node.js 22.12 or newer** (24 recommended).

1. Install: `npm install`
2. Copy `.env.example` to `.env` and fill in at least `DATABASE_URL` (Neon pooled connection string) and `SESSION_SECRET`. The comments in `.env.example` explain each value.
3. Create the tables and demo accounts:
   ```bash
   npm run db:check     # test the connection
   npm run db:migrate   # create the tables (skips ones already created)
   npm run db:seed      # synthetic demo accounts for every role
   ```
4. Start: `npm run dev`, then open http://localhost:5173, to be changed in the future

| Command | Does |
| --- | --- |
| `npm run dev` | Frontend and backend together (the API is reached through `/api`) |
| `npm run check` | Lint, typecheck, all unit and database tests, content validation, build, size and contrast checks |
| `npm run test:e2e` | Browser tests on phone-sized Chromium and WebKit |
| `npm run build` | Production build of the frontend |

## Project layout

```
frontend/          the web app (PWA): pages, components, translations
backend/           server.ts (the whole API), db/migrations (SQL), server.test.ts
packages/rules/    scoring, safety checks and planner, shared by frontend and backend
packages/schemas/  shared request and response shapes
packages/content/  wording (en, rw) and the scoring ruleset
docs/              requirements (SRS), design system, architecture and decisions
e2e/               browser tests
```

A file-by-file guide is in [explanation.md](explanation.md). The full requirements are in [docs/SRS.md](docs/SRS.md).


