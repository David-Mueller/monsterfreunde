'use strict';

// Offline support: everything the app needs is stored on the first visit.
// The cache name carries the deployed version, so a new deployment installs
// a fresh cache and removes the old one. Requests are matched without their
// ?v= parameter because the stored files already belong to this version.
const VERSION = '__VERSION__';
// The local suffix makes structural asset changes visible in previews even
// before the deployment workflow replaces VERSION with a commit stamp.
const CACHE = `monsterfreunde-${VERSION.startsWith('__') ? 'lokal-four-monsters-v13-live-engine' : VERSION}`;
const FILES = [
  './', 'index.html', 'styles.css', 'app.js', 'speech.js', 'monster-motion.js', 'rig.js', 'sounds.js', 'manifest.webmanifest',
  'assets/momo.png', 'assets/pip.png', 'assets/lumi.png', 'assets/zing.png', 'assets/rig.json', 'assets/icon-192.png', 'assets/icon-512.png'
];

// Every part image listed in the rig data is stored too, so new monsters
// and new parts never need a change here.
async function partFiles() {
  const rig = await (await fetch('assets/rig.json')).json();
  return Object.entries(rig).flatMap(([monster, data]) => Object.entries(data.parts)
    .filter(([part]) => !part.startsWith('eye'))
    .flatMap(([part, info]) => [`assets/parts/${monster}-${part}.png`, ...(info.lower ? [`assets/parts/${monster}-${part.replace('leg', 'shin')}.png`] : [])]));
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(async cache => cache.addAll([...FILES, ...await partFiles()])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

// Pages are fetched from the network first, bypassing the HTTP cache, so an
// online visit always shows the newest deployment and offline visits still
// work. Files asked for with a different version than this worker holds are
// fetched from the network too, so old and new files never mix while the
// next worker installs. Everything else is served from the cache.
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const wanted = url.searchParams.get('v');
  const stale = wanted && wanted !== VERSION && !(VERSION.startsWith('__') && wanted === 'lokal');
  event.respondWith(caches.open(CACHE).then(async cache => {
    if (request.mode === 'navigate' || stale) {
      try {
        const response = await fetch(request.mode === 'navigate' ? new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' }) : request);
        if (response.ok && request.mode === 'navigate') cache.put(request, response.clone());
        return response;
      } catch (error) {
        const fallback = await cache.match(request, { ignoreSearch: true }) || (request.mode === 'navigate' && await cache.match('index.html', { ignoreSearch: true }));
        if (fallback) return fallback;
        throw error;
      }
    }
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  }));
});
