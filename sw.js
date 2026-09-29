// Study Space service worker: caches the application shell so the desk opens offline.
// Cross-origin requests (YouTube, AI endpoints) are never cached or intercepted.
const VERSION = '2546367901';
const CACHE = `study-space-${VERSION}`;
const PRECACHE = /*__PRECACHE__*/["./assets/icons/icon-192.png", "./assets/icons/icon-512.png", "./assets/icons/icon-maskable-512.png", "./assets/icons/icon.svg", "./index.html", "./manifest.json", "./scripts/app.js", "./scripts/canvas/dots.js", "./scripts/canvas/drag.js", "./scripts/canvas/placement.js", "./scripts/canvas/snapping.js", "./scripts/canvas/viewport.js", "./scripts/core/actions.js", "./scripts/core/history.js", "./scripts/core/keyboard.js", "./scripts/core/model.js", "./scripts/core/settings.js", "./scripts/core/util.js", "./scripts/dabsy/dabsy-bridge.js", "./scripts/dabsy/dabsy-context.js", "./scripts/ecosystem/calendar-bridge.js", "./scripts/ecosystem/ecosystem.js", "./scripts/ecosystem/solvecount-bridge.js", "./scripts/objects/audio.js", "./scripts/objects/base.js", "./scripts/objects/calculator.js", "./scripts/objects/dabsy.js", "./scripts/objects/fallback.js", "./scripts/objects/image.js", "./scripts/objects/note.js", "./scripts/objects/pdf.js", "./scripts/objects/pomodoro.js", "./scripts/objects/registry.js", "./scripts/objects/solvecount.js", "./scripts/objects/text.js", "./scripts/objects/video.js", "./scripts/objects/youtube.js", "./scripts/pomodoro/timer-state.js", "./scripts/pomodoro/wave-animation.js", "./scripts/pwa/install.js", "./scripts/storage/autosave.js", "./scripts/storage/database.js", "./scripts/storage/file-storage.js", "./scripts/storage/object-storage.js", "./scripts/storage/settings-storage.js", "./scripts/storage/workspace-storage.js", "./scripts/tools/focus.js", "./scripts/tools/pen.js", "./scripts/ui/context-menu.js", "./scripts/ui/dialogs.js", "./scripts/ui/dock.js", "./scripts/ui/groups.js", "./scripts/ui/menu.js", "./scripts/ui/toast.js", "./scripts/workspace.js", "./styles/accessibility.css", "./styles/animations.css", "./styles/canvas.css", "./styles/controls.css", "./styles/dabsy.css", "./styles/glass.css", "./styles/notes.css", "./styles/pomodoro.css", "./styles/responsive.css", "./styles/tokens.css", "./styles/tools.css", "./styles/windows.css", "./vendor/pdf.min.mjs", "./vendor/pdf.worker.min.mjs"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('study-space-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Navigations: network first (fresh shell), fall back to cached index.html offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put('./index.html', copy)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  // Everything else: cache first, refresh in the background.
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
