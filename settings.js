// Loads persisted user settings into state at startup.
import { state } from './model.js';
import { loadSetting } from '../storage/settings-storage.js';

export async function loadSettings() {
  const prefs = await loadSetting('prefs');
  if (prefs) {
    if (['system', 'reduced', 'full'].includes(prefs.motion)) state.settings.motion = prefs.motion;
    if (typeof prefs.snap === 'boolean') state.settings.snap = prefs.snap;
  }
  document.documentElement.dataset.motion = state.settings.motion === 'system' ? '' : state.settings.motion;
  const pc = await loadSetting('pomodoro-config');
  if (pc) {
    const c = state.settings.pomodoro;
    for (const k of ['focus', 'short', 'long', 'longEvery']) if (Number.isFinite(pc[k]) && pc[k] > 0 && pc[k] < 1000) c[k] = pc[k];
    if (typeof pc.autoBreak === 'boolean') c.autoBreak = pc.autoBreak;
  }
}
