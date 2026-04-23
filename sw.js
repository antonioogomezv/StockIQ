const CACHE = "stockiq-1775629196200";
const SHELL = ["/", "/index.html", "/styles.css", "/script.js", "/config.js",
               "https://cdn.jsdelivr.net/npm/chart.js",
               "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap"];

self.addEventListener("install", function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener("activate", function(e) {
  e.waitUntil(caches.keys().then(function(keys) {
    return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
  }));
  self.clients.claim();
});

self.addEventListener("fetch", function(e) {
  let url = e.request.url;

  // Never cache POST requests
  if (e.request.method !== 'GET') return;

  // Skip Firebase/Firestore — must not be intercepted (streaming connections)
  if (url.includes("firestore.googleapis.com") || url.includes("firebase") ||
      url.includes("googleapis.com") || url.includes("google.com/images")) return;

  // Skip Netlify functions (API proxies)
  if (url.includes("/.netlify/functions/")) return;

  // API calls — network only, cache as fallback
  if (url.includes("finnhub.io") || url.includes("polygon.io") || url.includes("anthropic.com")) {
    e.respondWith(fetch(e.request).catch(function() { return caches.match(e.request); }));
    return;
  }

  // Fonts and CDN — cache-first (they never change)
  if (url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com") || url.includes("cdn.jsdelivr.net") || url.includes("gstatic.com/firebasejs")) {
    e.respondWith(caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(res) {
        return caches.open(CACHE).then(function(c) { c.put(e.request, res.clone()); return res; });
      });
    }));
    return;
  }

  // App shell (HTML, CSS, JS, config) — network-first so deploys show immediately
  e.respondWith(
    fetch(e.request).then(function(res) {
      if (!res || res.status !== 200 || res.type === 'opaque') return res;
      return caches.open(CACHE).then(function(c) { c.put(e.request, res.clone()); return res; });
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});
