// This is the service worker that lets Rinda open and work offline after the first visit.
/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//, /^\/staff/] }),
);

registerRoute(
  ({ url }) => url.pathname === '/api/v1/content/manifest',
  new NetworkFirst({ cacheName: 'rinda-content', networkTimeoutSeconds: 3 }),
);

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/content/'),
  new CacheFirst({ cacheName: 'rinda-content' }),
);

registerRoute(
  ({ url }) => url.pathname === '/api/v1/flags',
  new NetworkFirst({ cacheName: 'rinda-config', networkTimeoutSeconds: 3 }),
);

registerRoute(
  ({ request, url }) =>
    (request.destination === 'script' && /\/assets\/(charts|guide-panel|clinic-card)-/.test(url.pathname)) ||
    request.destination === 'font',
  new CacheFirst({ cacheName: 'rinda-assets' }),
);

self.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});
