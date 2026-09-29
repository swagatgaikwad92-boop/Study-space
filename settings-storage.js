// User settings and DABSy configuration (device-local only).
import { dbGet, dbPut } from './database.js';

export async function loadSetting(key, fallback = null) {
  try { const r = await dbGet('settings', key); return r ? r.value : fallback; } catch { return fallback; }
}
export async function saveSetting(key, value) {
  try { await dbPut('settings', { key, value }); return true; } catch { return false; }
}
