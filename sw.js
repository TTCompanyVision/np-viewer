// sw.js — офлайн-режим веб-версии (PWA). Шаблон: build.py подставляет версию и список файлов оболочки.
//
// Оболочка (страница, поток разбора, three.js и загрузчики) кладётся в кэш при установке — после первого
// захода сайт открывается без интернета. Библиотеки тяжёлых форматов (STEP, IFC, 3DM) кэшируются при первом
// использовании. Новая сборка = новая версия: старый кэш удаляется, открытые вкладки получают обновление.

const VERSION = '__VERSION__';
const SHELL = __SHELL__;
const CACHE = 'np-viewer-' + VERSION;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('np-viewer-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.includes('/_test/')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // страница: сперва сеть (свежая версия), без сети — из кэша
    if (req.mode === 'navigate') {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put('./', fresh.clone());
        return fresh;
      } catch (err) {
        return (await cache.match('./')) || (await cache.match('index.html')) || Response.error();
      }
    }
    // остальное: из кэша, а при первом обращении — из сети с сохранением (папка библиотек с отпечатком версии)
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  })());
});
