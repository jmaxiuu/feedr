/* Feedr service worker — offline shell + always-fresh catalog.
   Bump CACHE whenever you change a shell file, so phones drop the old copy. */
const CACHE = "feedr-counter-v10";

const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./fonts/bricolage-grotesque-latin.woff2",
  "./fonts/bricolage-grotesque-latin-ext.woff2",
  "./fonts/courier-prime-400-latin.woff2",
  "./fonts/courier-prime-400-latin-ext.woff2",
  "./fonts/courier-prime-700-latin.woff2",
  "./fonts/courier-prime-700-latin-ext.woff2",
  "./js/app.js",
  "./js/picker.js",
  "./js/catalog.js",
  "./data/catalog.json",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon-180.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);
  if(url.origin !== location.origin) return;   // YouTube etc. — never our business

  // The catalog is the one file people edit. Always try the network first so a
  // fresh deploy shows up immediately; fall back to cache when offline.
  if(url.pathname.endsWith("/data/catalog.json")){
    e.respondWith(networkFirst(req));
    return;
  }

  // Navigations: same deal, but any failure lands on the cached shell.
  if(req.mode === "navigate"){
    e.respondWith(networkFirst(req).catch(() => caches.match("./index.html")));
    return;
  }

  e.respondWith(cacheFirst(req));
});

async function networkFirst(req){
  try{
    const res = await fetch(req);
    if(res.ok) (await caches.open(CACHE)).put(req, res.clone());
    return res;
  }catch(err){
    const hit = await caches.match(req, { ignoreSearch: true });
    if(hit) return hit;
    throw err;
  }
}

async function cacheFirst(req){
  const hit = await caches.match(req, { ignoreSearch: true });
  if(hit) return hit;
  const res = await fetch(req);
  if(res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
}
