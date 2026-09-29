// Install prompt handling + service worker registration (relative paths, so it works
// from a GitHub Pages sub-path like /study-space/).
import { bus } from '../core/util.js';

let deferred = null;
export const canInstall = () => !!deferred;
export async function promptInstall() {
  if (!deferred) return;
  deferred.prompt();
  try { await deferred.userChoice; } catch { /* ignore */ }
  deferred = null;
}

export function initPwa() {
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
  addEventListener('appinstalled', () => { deferred = null; bus.emit('toast', { text: 'Study Space is installed.' }); });
  addEventListener('online', () => bus.emit('toast', { text: 'Back online.' }));
  addEventListener('offline', () => bus.emit('toast', { text: 'You’re offline. Your desk still works; videos and DABSy need internet.' }));
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err) => console.warn('[pwa] service worker', err));
  }
  navigator.storage?.persist?.().catch(() => {});
}
