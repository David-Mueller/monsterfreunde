'use strict';

// Offline support: everything the app needs is stored on the first visit.
// The cache name carries the deployed version, so a new deployment installs
// a fresh cache and removes the old one. Requests are matched without their
// ?v= parameter because the stored files already belong to this version.
const VERSION = '__VERSION__';
const CACHE = `monsterfreunde-${VERSION.startsWith('__') ? 'lokal' : VERSION}`;
const FILES = [
  './', 'index.html', 'styles.css', 'app.js', 'monster-motion.js', 'sounds.js',
  'rig.html', 'rig.js', 'rig-app.js', 'manifest.webmanifest',
  'assets/momo.png', 'assets/pip.png', 'assets/motion.json', 'assets/rig.json',
  'assets/icon-192.png', 'assets/icon-512.png',
  ...['body', 'eye-left', 'eye-right', 'mouth', 'mouth-open', 'mouth-laugh', 'arm-left', 'arm-right']
    .flatMap(part => ['momo', 'pip'].map(monster => `assets/parts/${monster}-${part}.png`))
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch (error) {
      if (request.mode === 'navigate') return cache.match('index.html', { ignoreSearch: true });
      throw error;
    }
  }));
});
