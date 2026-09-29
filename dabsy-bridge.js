// Safe AI configuration + request layer. No secret is ever shipped with the app.
// The student supplies an endpoint (and optionally a key). Everything is stored on
// this device only. Requests happen solely when the student presses send.
import { loadSetting, saveSetting } from '../storage/settings-storage.js';

export const STYLES = {
  anthropic: { label: 'Anthropic Messages', endpoint: 'https://api.anthropic.com/v1/messages' },
  openai:    { label: 'OpenAI-compatible',  endpoint: 'https://api.openai.com/v1/chat/completions' },
};

let config = null;

export async function loadConfig() {
  config = (await loadSetting('dabsy-config')) || null;
  return config;
}
export const getConfig = () => config;
export const isConfigured = () => !!(config && config.endpoint && config.model);

export async function saveConfig(c) {
  const clean = {
    style: STYLES[c.style] ? c.style : 'anthropic',
    endpoint: String(c.endpoint || '').trim(),
    model: String(c.model || '').trim(),
    apiKey: String(c.apiKey || '').trim(),
  };
  const err = validateEndpoint(clean.endpoint);
  if (err) throw new Error(err);
  if (!clean.model) throw new Error('Enter a model name.');
  config = clean;
  await saveSetting('dabsy-config', clean);
  return clean;
}
export async function clearConfig() { config = null; await saveSetting('dabsy-config', null); }

export function validateEndpoint(url) {
  let u;
  try { u = new URL(url); } catch { return 'Enter a full endpoint URL.'; }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return 'The endpoint must use https.';
  return '';
}

const SYSTEM = 'You are DABSy, a calm study companion inside a student\'s digital desk. Be concise, accurate and encouraging. Explain step by step when asked, use plain text (no markdown tables), and say when you are unsure. When desk context is provided, use it to answer about what the student is currently studying.';

/** messages: [{role:'user'|'assistant', content}] ; context: string|null */
export async function ask(messages, context, signal) {
  if (!isConfigured()) throw new Error('not-configured');
  const system = context ? `${SYSTEM}\n\nWhat is on the student's desk right now (shared because they asked):\n${context}` : SYSTEM;
  const c = config;
  let res;
  try {
    if (c.style === 'anthropic') {
      res = await fetch(c.endpoint, {
        method: 'POST', signal,
        headers: {
          'content-type': 'application/json',
          ...(c.apiKey ? { 'x-api-key': c.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } : {}),
        },
        body: JSON.stringify({ model: c.model, max_tokens: 1024, system, messages }),
      });
    } else {
      res = await fetch(c.endpoint, {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', ...(c.apiKey ? { authorization: `Bearer ${c.apiKey}` } : {}) },
        body: JSON.stringify({ model: c.model, messages: [{ role: 'system', content: system }, ...messages] }),
      });
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error(navigator.onLine ? 'Couldn’t reach the AI service. Check the endpoint in DABSy settings.' : 'You’re offline. DABSy needs an internet connection.');
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('The AI service rejected the key. Check it in DABSy settings.');
    if (res.status === 429) throw new Error('The AI service is busy or rate limited. Try again in a moment.');
    throw new Error(`The AI service returned an error (${res.status}).`);
  }
  const data = await res.json();
  const text = c.style === 'anthropic'
    ? (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n')
    : data.choices?.[0]?.message?.content;
  if (!text) throw new Error('The AI service returned an empty answer.');
  return String(text);
}
