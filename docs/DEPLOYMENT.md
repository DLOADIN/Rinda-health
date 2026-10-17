# Deploying Rinda Health on Vercel

One Vercel project serves both parts on one domain, configured in [`vercel.json`](../vercel.json):

| Service | Folder | Public path | What it is |
| --- | --- | --- | --- |
| `frontend` | `frontend/` | everything except `/api/...` | The PWA, built by Vite into `frontend/dist`. Unknown paths fall back to `index.html` so deep links such as `/app/results` work. |
| `backend` | `backend/` | `/api/...` | The Express API as one Vercel Function. `npm run build` bundles `vercel-app.ts` into `dist/vercel-app.mjs`, and `index.mjs` exports it. |

The browser calls the API on the same domain (`/api/v1/...`), and the API only calls outside services (Neon, Brevo, Gemini, Meta, Google), so no service bindings are needed. The API receives the full path, including `/api`.

## Environment variables (Vercel → Project → Settings → Environment Variables)

Set these for Production (and Preview if you use previews). Never commit them.

| Variable | Value |
| --- | --- |
| `APP_ENV` | `staging` until ethics approval and synthetic data only; `pilot` only for the real pilot |
| `PUBLIC_URL` | The deployment address, e.g. `https://rinda-health.vercel.app` (must start with `https://`, so cookies are secure) |
| `TRUST_PROXY` | `1` (Vercel sits in front of the API) |
| `DATABASE_URL` | Neon pooled connection string |
| `SESSION_SECRET` | 48 or more random characters |
| `HANDOVER_SECRET` | 32 or more random characters, different from the session secret (required when `APP_ENV=pilot`) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional, for Google sign-in |
| `BREVO_API_KEY`, `EMAIL_FROM` | Optional, for report emails |
| `GEMINI_API_KEY`, `ETHICS_AMENDMENT_REF` | Optional, for the AI guide (stays off without both) |
| `MESSAGING_APPROVAL_REF`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Optional, for WhatsApp notices |

Make random secrets with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

## Before the first deploy

1. Apply migrations to Neon from your computer: `npm run db:migrate` (uses your local `.env`).
2. For Google sign-in, add `https://<your-domain>/api/v1/auth/google/callback` as an authorised redirect URI in Google Cloud.
3. Push to `main`. Vercel builds both services; check the build logs if anything fails.

## After deploying

- Open `https://<your-domain>/api/v1/health`: it should show `"database":"ok"`.
- Sign up, do a check-up, and open the guide.
- Install the PWA from the browser menu and try a check-up in airplane mode.
