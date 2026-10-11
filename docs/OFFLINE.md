# Offline and sync

How Rinda Health keeps working with no signal (FR-08, FR-28 to FR-31, FR-43, NFR-18; ADR-006). Pilot sessions happen in places where mobile data drops, so the participant flow must never depend on the network after the phone has been prepared.

## What works offline

| Works offline after "Prepare this phone" | Needs the network |
| --- | --- |
| PIN unlock, consent review, questionnaire, measurements, submit, provisional results, Why this result, What-if, planner and measurement coach, template guide answers, Get help now, the safety screen, the care directory, the clinic card, history already on the phone, My data (local part), quick exit, auto-lock | First sign-in on a new phone, sending queued items, server re-score, export and deletion requests (queued until online), the staff console, the generative explainer (off for the pilot) |

## The three layers

1. **Service worker** (Workbox through vite-plugin-pwa 2, `injectManifest`). Precaches the participant app shell and serves it offline. Caches published content by version. Never caches personal data.
2. **Encrypted IndexedDB** (`idb` and Web Crypto). Holds drafts, the outbox, results that came back from the server, and the offline unlock verifier.
3. **Shared rules** (`@rinda/rules`, bundled). Scores on the phone so a result appears within 1 second of submitting, then the server re-scores with the same package and ruleset version (FR-29).

## Prepare this phone (FR-28)

A facilitator runs this once per phone, on Wi-Fi, from Settings or the first-run screen.

1. Make sure the service worker is installed and the precache is complete.
2. Fetch `GET /api/v1/content/manifest` for `en` and `rw`.
3. Fetch every listed item (questionnaire, ruleset, recommendations, referral list, consent document, guide chips) by version, check its SHA-256 against the manifest with `crypto.subtle.digest`, and validate it with the content schema. The service worker stores the responses.
4. Fetch the lazy participant chunks (charts, guide panel, clinic card) and the Inter font file, so they sit in the runtime cache. Data-saver mode skips the font (the system font stack takes over) and audio.
5. Call `navigator.storage.persist()` and record the answer.
6. Show the **Offline ready** card: a CircleCheck icon, the words "Offline ready", the content, ruleset and referral-list versions, the storage used from `navigator.storage.estimate()`, and whether storage is persistent.

If any step fails, stop with a plain message naming what could not be saved ("The Kinyarwanda questions could not be saved. Connect to Wi-Fi and try again."). Never show Offline ready for a partial preparation. Preparation stores no personal data and can run before anyone signs in.

When the app is online later and the manifest has a newer published version, it downloads the new items in the background and swaps them in only between assessments, never during one.

## Local storage

One IndexedDB database, `rinda`, opened through `apps/web/src/lib/storage/`. Nothing personal goes to `localStorage`, `sessionStorage` or Cache Storage.

| Store | Holds | Encrypted | Cleared |
| --- | --- | --- | --- |
| `key` | The device `CryptoKey` (AES-GCM 256, `extractable: false`) | Not readable by design | Wipe, sign-out in shared-phone mode |
| `session` | Opaque participant ID, PIN verifier (PBKDF2-SHA-256, 600,000 iterations, random salt), language, shared-phone flag, lock settings | Verifier only (it is a hash) | Wipe, sign-out |
| `drafts` | One in-progress assessment: answers, measurements, current step, content and ruleset version IDs, Idempotency-Key | Yes | On successful submit; after 7 days unopened |
| `outbox` | Submissions, safety events, feedback, export and deletion requests waiting to send | Yes | When the server confirms each item |
| `results` | Results and plans returned by the server, for history and the dashboard | Yes | Shared-phone mode: at sign-out. Personal phones: per the retention setting in My data |
| `meta` | Sync timestamps, mismatch counter, storage warnings shown | No (holds no personal values) | Wipe |

Every encrypted record is `{ id, iv, ciphertext, createdAt }` with a fresh 96-bit IV from `crypto.getRandomValues`. The key never leaves the browser and cannot be exported, so a copied database file is unreadable on another device. Wiping deletes the key first, then the stores.

The PIN lock is a privacy barrier for shared phones, not protection against forensic analysis. That is why data are kept only until sent and shared-phone mode keeps nothing (see [SECURITY_PRIVACY.md](SECURITY_PRIVACY.md)).

## Drafts

- Every answer is written to the encrypted draft as soon as it is given, so closing the app, a dead battery or quick exit loses nothing.
- The Idempotency-Key (UUID v4) is created when the assessment starts and stays with the draft. Retries of the same assessment always reuse it.
- The draft records the questionnaire and ruleset version IDs it began with. A content update never changes a draft in progress.

## Submitting and the outbox

```
answers saved ──Submit──▶ scoreAssessment() on the phone ──▶ provisional result shown
                                      │                       "Saved on this phone, not sent yet"
                                      ▼
                        outbox.add({ type, payload, idempotencyKey, participantId })
                                      │
                 triggers: app open · online · visible again · Send now · Background Sync
                                      ▼
                       flush(): POST with Idempotency-Key ──▶ 200 ─▶ remove item, store server result
                                      │                     ─▶ 409 ─▶ keep item, mark "needs help", tell facilitator
                                      │                     ─▶ 401 ─▶ refresh once, else wait for sign-in
                                      ▼                     ─▶ 5xx or offline ─▶ back off and retry
```

**Sync triggers** (FR-30). The app calls `flush()`:
- when it starts;
- on the `online` event;
- on `visibilitychange` when the page becomes visible;
- when the participant or facilitator taps **Send now**;
- on the service worker `sync` event (tag `rinda-outbox`) where the browser supports Background Sync, which Chromium does and Safari does not. Background Sync is a bonus, never the plan.

**Order and back-off.** Items send oldest first, safety events before everything else. After a network or server failure, wait 5 s, 15 s, 60 s, then every 5 minutes while the app is open. Only one flush runs at a time (a lock held in the sync slice and, across tabs, a `navigator.locks` lock named `rinda-flush`).

**Whose items.** Every outbox item stores the opaque participant ID. `flush()` sends only items that belong to the signed-in participant, so on a shared phone nothing can be sent under someone else's account.

**Tokens.** The access token lives in memory only. `flush()` calls `POST /api/v1/auth/refresh` (HttpOnly cookie, `SameSite=Strict`, scoped to `/api/v1/auth`) when it needs one. If the refresh cookie has expired (12 hours), items stay queued and the sync status says "Sign in to send".

**Sync status** (FR-30). A small Badge in the header shows one of: Saved on this phone, Sending, Sent, Sign in to send, Needs help. The Sync centre (Settings) lists queued items by type and time, never by content, with the Send now button.

## Reconciling results (FR-29)

The server re-scores every submission with `@rinda/rules` and the ruleset version in the payload, then returns its results and a `resultMismatch` flag computed by comparing normalised results.

- No mismatch: the provisional label disappears.
- Mismatch: the server result replaces the provisional one with a short notice ("Your results were checked and updated."). The app increments a counter in `meta`; the server counts the event without logging any values.
- CI fails if any golden fixture scores differently in Node and in the production browser bundle, so a real mismatch should mean a bug or a tampered client.

## Service worker

### Plugin configuration

```ts
// apps/web/vite.config.ts (extract)
import { VitePWA } from 'vite-plugin-pwa';

VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src/sw',
  filename: 'sw.ts',
  registerType: 'prompt',
  injectRegister: false, // registered by useRegisterSW in UpdatePrompt
  manifest: {
    name: 'Rinda Health',
    short_name: 'Rinda',
    lang: 'en',
    start_url: '/',
    display: 'standalone',
    background_color: '#EBE9E1',
    theme_color: '#E43D12',
    icons: [
      { src: '/icons/192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  injectManifest: {
    globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
    // Lazy chunks are named after their entry files; keep these names stable.
    globIgnores: [
      '**/assets/staff-routes-*.js',
      '**/assets/charts-*.js',
      '**/assets/guide-panel-*.js',
      '**/assets/clinic-card-*.js',
    ],
  },
  devOptions: { enabled: false },
});
```

The lazy entry files are `features/staff/staff-routes.tsx`, `features/dashboard/charts.tsx`, `features/guide/guide-panel.tsx` and `features/care/clinic-card.tsx`. Vite names their chunks after them. A test reads the generated precache manifest and fails if a staff chunk is in it (ADR-009) or if the precache exceeds the NFR-06 budget.

The theme colours in the manifest are the only hex values allowed outside `rinda-theme.css`, because a web manifest cannot read CSS variables.

### `src/sw/sw.ts`

```ts
/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { flush } from '../lib/sync/flush';

declare let self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Participant routes fall back to the app shell offline. API and staff routes never do.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//, /^\/staff/],
  }),
);

// The manifest changes when content is published: try the network briefly, else use the cache.
registerRoute(
  ({ url }) => url.pathname === '/api/v1/content/manifest',
  new NetworkFirst({ cacheName: 'rinda-content', networkTimeoutSeconds: 3 }),
);

// Content bodies are addressed by version ID and never change once published.
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/content/'),
  new CacheFirst({ cacheName: 'rinda-content' }),
);

registerRoute(
  ({ url }) => url.pathname === '/api/v1/flags',
  new NetworkFirst({ cacheName: 'rinda-config', networkTimeoutSeconds: 3 }),
);

// Lazy participant chunks and the font, fetched during "Prepare this phone".
registerRoute(
  ({ request, url }) =>
    (request.destination === 'script' && /\/assets\/(charts|guide-panel|clinic-card)-/.test(url.pathname)) ||
    request.destination === 'font',
  new CacheFirst({ cacheName: 'rinda-assets' }),
);

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
});

// Chromium only. Safari never fires this; the page triggers cover it.
self.addEventListener('sync', (event) => {
  const syncEvent = event as SyncEvent;
  if (syncEvent.tag === 'rinda-outbox') syncEvent.waitUntil(flush({ from: 'service-worker' }));
});
```

`lib/sync/flush.ts` uses only `idb`, `fetch` and Web Crypto, so the same code runs in the page and in the service worker. No other `/api` route is cached: results, exports and anything personal are fetched with the network only and, when kept, stored encrypted in IndexedDB.

### Safe updates (FR-30)

```tsx
// apps/web/src/features/sync/update-prompt.tsx (shape)
import { useRegisterSW } from 'virtual:pwa-register/react';

export function UpdatePrompt() {
  const inAssessment = useInAssessment(); // true on consent, questionnaire, measurement and safety routes
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({ immediate: true });
  if (!needRefresh || inAssessment) return null;
  return /* shadcn Alert with a "Update now" Button that calls updateServiceWorker(true) */;
}
```

- The new version waits until the participant taps **Update now** on a screen outside the questionnaire. It never reloads during an assessment, a safety screen or the consent flow.
- The update keeps IndexedDB untouched. Drafts started on the old version finish on their recorded content versions.
- A Playwright test deploys a second build while a questionnaire is open and checks that no prompt or reload happens until the participant reaches results.

## Storage health and data-saver (FR-31)

- Request persistence during preparation and again after sign-in on a personal phone. Chromium grants it more readily to installed apps; Safari decides by its own heuristics. Show the result on the Offline ready card.
- Check `navigator.storage.estimate()` on start. If the free quota falls below the configured threshold (default 50 MB), show a calm Alert on the home screen and stop prefetching optional items.
- **Data-saver** (Switch in Settings, on by default when `navigator.connection.saveData` is true where available): no audio prefetch, no font download, no background content refresh on mobile data. A test measures the prepared download with data-saver on and off.

## iPhones and Safari

- **No Background Sync.** The page triggers (open, online, visible, Send now) do all the work.
- **Storage eviction.** Safari can delete script-written storage for a site that has not been used for seven days of browser use. Web apps added to the Home Screen are not subject to that seven-day cap. **Install Rinda on the Home Screen on every study iPhone** and send queued items at the end of each session.
- **Install.** Safari has no install prompt. The Settings screen shows "Add to Home Screen" steps with the Share icon for iOS, and the normal install Button where `beforeinstallprompt` fires.
- **Separate storage.** On iOS, the Home Screen app and the Safari tab have separate storage. Prepare and use the phone from the installed app only.

## Wipes and shared-phone mode (FR-27, FR-43)

`wipe()` in `lib/storage`:
1. Refuses while the outbox has unsent items, unless a facilitator confirms in an AlertDialog that lists how many items will be lost (types only).
2. Deletes the device key, then every store in the `rinda` database.
3. Deletes participant entries from Cache Storage (there should be none; the check proves it) while keeping the app shell and published content.
4. Clears Redux state and in-memory tokens, calls `POST /api/v1/auth/signout` when online.
5. Shows **This phone is clear** with a CircleCheck icon.

In shared-phone mode drafts are deleted on submit, outbox items as soon as they are confirmed, results are not kept after sign-out, and sign-out always runs `wipe()`.

## Testing

All offline tests run Playwright against `vite build` and `vite preview`, because the dev server does not run the real service worker. Projects: `mobile-chromium` (Pixel 7) and `mobile-webkit` (iPhone 14).

| Test | Checks |
| --- | --- |
| `offline-flow.spec.ts` | Prepare, `context.setOffline(true)`, PIN unlock, whole questionnaire, measurements, submit, provisional result within 1 s, Get help now from every route, care directory, safety screen (NFR-18) |
| `sync-exactly-once.spec.ts` | Three submissions queued offline arrive exactly once after reconnecting; flush triggered by `online`, visibility and Send now |
| `update-guard.spec.ts` | A new build is offered only outside the questionnaire; no reload mid-assessment |
| `precache-manifest.spec.ts` | No staff chunk in the precache; precache within budget |
| `ciphertext-only.spec.ts` | IndexedDB contains no sentinel value (systolic 187, diastolic 113, 13 servings, PIN 482915) |
| `shared-wipe.spec.ts` | After shared-mode sign-out, IndexedDB and participant cache entries are empty and the app still opens offline |
| `reconcile.spec.ts` | A forced server-side mismatch shows the server result and the notice |

Playwright cannot simulate Safari's seven-day eviction or the missing Background Sync on a real iPhone, so the M4 checklist includes a manual run on a real iPhone with the installed app in airplane mode.

## Item 9 safety events on the phone (11 October 2026)

When item 9 is above 0, the safety screen shows first; the Tier 2 event (tier, trigger, actions and time only) is then kept in the encrypted vault under `safety-outbox`, tagged with the account, and sent once that person is online (one event per check-up, deduplicated by ID on the server). Waiting events survive Exit and sign-out so a safety record is not lost, are only ever sent under the account that created them, and are dropped from the phone after 7 days.
