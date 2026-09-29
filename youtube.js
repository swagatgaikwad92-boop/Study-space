// YouTube helpers. The official IFrame API script is the only external
// dependency in the app: it is what makes seek / ±10s / volume / progress possible
// on an embedded player. It is loaded lazily, only when a video is first opened.

const ID_RE = /^[\w-]{11}$/;

/** Returns {id, start} or null for anything that is not a recognisable YouTube URL. */
export function parseYouTube(input) {
  if (typeof input !== 'string') return null;
  const text = input.trim();
  if (ID_RE.test(text)) return { id: text, start: 0 };
  let url;
  try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch { return null; }
  const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else { const m = url.pathname.match(/^\/(embed|shorts|live|v)\/([\w-]{11})/); if (m) id = m[2]; }
  }
  if (!id || !ID_RE.test(id)) return null;
  const t = url.searchParams.get('t') || url.searchParams.get('start');
  let start = 0;
  if (t) {
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    if (m) start = (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
  }
  return { id, start };
}

export const watchUrl = (id, t = 0) => `https://www.youtube.com/watch?v=${id}${t ? `&t=${Math.floor(t)}s` : ''}`;

let apiPromise = null;
export function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    if (!navigator.onLine) { apiPromise = null; return reject(new Error('offline')); }
    const timer = setTimeout(() => { apiPromise = null; reject(new Error('timeout')); }, 9000);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timer); prev?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { clearTimeout(timer); apiPromise = null; reject(new Error('blocked')); };
    document.head.append(s);
  });
  return apiPromise;
}
