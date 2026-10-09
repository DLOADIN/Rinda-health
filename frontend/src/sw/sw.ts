/// <reference lib="webworker" />
// Service worker (docs/OFFLINE.md). Precaches the participant app shell; caches published content by version;
// never caches personal data. The outbox flush (Background Sync) is added with lib/sync in Milestone 2.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Participant routes fall back to the app shell offline. API and staff routes never do.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//, /^\/staff/] }),
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
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});
