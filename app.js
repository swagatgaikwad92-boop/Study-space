// Study Space bootstrap. Order matters: storage -> settings -> canvas -> workspace -> tools -> UI.
import { state } from './core/model.js';
import { bus } from './core/util.js';
import { dbInit, db } from './storage/database.js';
import { loadSettings } from './core/settings.js';
import { initViewport } from './canvas/viewport.js';
import { initDots } from './canvas/dots.js';
import { initWorkspace, instances, selectObject } from './workspace.js';
import { initDrag } from './canvas/drag.js';
import { initPen } from './tools/pen.js';
import { initFocus } from './tools/focus.js';
import { initGroups } from './ui/groups.js';
import { initDock } from './ui/dock.js';
import { initToasts } from './ui/toast.js';
import { initDialogs } from './ui/dialogs.js';
import { initContextMenu } from './ui/context-menu.js';
import { initKeyboard } from './core/keyboard.js';
import { pomo } from './pomodoro/timer-state.js';
import { initWave } from './pomodoro/wave-animation.js';
import { initEcosystem } from './ecosystem/ecosystem.js';
import { initSolveCountBridge } from './ecosystem/solvecount-bridge.js';
import { initCalendarBridge } from './ecosystem/calendar-bridge.js';
import { loadConfig } from './dabsy/dabsy-bridge.js';
import { setInstanceResolver } from './dabsy/dabsy-context.js';
import { initPwa } from './pwa/install.js';
import { createObject } from './workspace.js';

async function main() {
  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), world = $('world');
  initToasts($('toasts'));
  initDialogs();
  initPwa();

  await dbInit();
  if (!db.persistent) bus.emit('toast', { text: 'Storage isn’t available here, so your desk won’t be saved after you close it.', ms: 8000 });
  await loadSettings();

  initViewport(stage, world);
  initDots($('dots'));
  initWave();
  initPen($('ink'));
  await initWorkspace($('objects'));
  initDrag($('objects'), $('guides'));
  initFocus();
  initGroups($('groups'));
  initContextMenu();
  initDock();
  initKeyboard();
  setInstanceResolver((id) => instances.get(id));

  bus.on('canvas-tap', () => selectObject(null));
  bus.on('save-error', (err) => {
    const quota = err?.name === 'QuotaExceededError';
    bus.emit('toast', { id: 'save-error', text: quota ? 'Storage is full, so recent changes may not be saved.' : 'Couldn’t save your latest changes. Trying again on the next change.' });
  });

  // Ecosystem + Pomodoro
  initEcosystem(); initSolveCountBridge(); initCalendarBridge();
  bus.on('ecosystem:solvecount', (m) => {
    if (m.type === 'session' && m.state === 'running' && ![...state.objects.values()].some((o) => o.type === 'solvecount' && o.visible)) {
      bus.emit('toast', { id: 'sc', text: 'A SolveCount session is running.', ms: 9000, action: { label: 'Show timer', onClick: () => createObject('solvecount') } });
    }
  });
  await pomo.restore();
  document.body.classList.toggle('is-studying', pomo.status === 'running' && pomo.phase === 'focus');
  await loadConfig();

  // Pause media that is hidden by closing; nothing autoplays.
  document.addEventListener('visibilitychange', () => bus.emit('visibility', document.visibilityState));

  document.body.classList.add('ready');
  $('boot')?.remove();
  window.__studySpace = { state, instances };   // handy for debugging/tests
}

main().catch((err) => {
  console.error(err);
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = 'Study Space couldn’t start. Reload the page to try again.';
});
