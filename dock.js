// The only permanent chrome: a small glass dock (Add / Tools / DABSy / more) plus
// the empty-state invitation. Menus are compact and never nested deeply.
import { state, TYPES } from '../core/model.js';
import { bus, el, icon, iconButton } from '../core/util.js';
import { history } from '../core/history.js';
import { openMenu } from './menu.js';
import { showDialog, closeDialog, youtubeDialog } from './dialogs.js';
import { createObject, addVideo, addNote, importFiles, closedObjects, reopenObject, removeObject } from '../workspace.js';
import { toggleFocus } from '../tools/focus.js';
import { togglePen, isPenOn } from '../tools/pen.js';
import { saveSetting } from '../storage/settings-storage.js';
import { markWorkspace } from '../storage/autosave.js';
import { promptInstall, canInstall } from '../pwa/install.js';
import { applyViewport } from '../canvas/viewport.js';

let fileInput, cameraInput, dock, addBtn, toolsBtn, dabsyBtn, moreBtn, empty;

export function initDock() {
  fileInput = el('input', { type: 'file', multiple: true, hidden: true, accept: '*/*', 'aria-hidden': 'true', tabindex: '-1' });
  cameraInput = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, 'aria-hidden': 'true', tabindex: '-1' });
  for (const inp of [fileInput, cameraInput]) inp.addEventListener('change', () => { importFiles(inp.files); inp.value = ''; });

  addBtn = dockButton('plus', 'Add', () => openAdd());
  toolsBtn = dockButton('tools', 'Tools', () => openTools());
  dabsyBtn = dockButton('spark', 'DABSy', () => createObject('dabsy'));
  moreBtn = iconButton('more', 'More', () => openMore(), 'dock-more');
  dock = el('nav', { class: 'dock glass', 'data-ui': '', 'aria-label': 'Study Space tools' }, addBtn, toolsBtn, dabsyBtn, moreBtn);

  empty = el('div', { class: 'empty', 'data-ui': '' },
    el('p', { class: 'empty-title', text: 'Add something to your space.' }),
    el('button', { type: 'button', class: 'btn primary', onclick: () => openAdd(empty.querySelector('button')) }, icon('plus', 16), 'Add'),
    el('p', { class: 'empty-hint', text: 'Drop a PDF, an image or a YouTube link anywhere.' }));
  document.getElementById('ui').append(dock, empty, fileInput, cameraInput);

  const refresh = () => {
    const any = [...state.objects.values()].some((o) => o.visible) || state.strokes.length > 0;
    empty.hidden = any;
    document.body.classList.toggle('desk-empty', !any);
  };
  for (const ev of ['object-created', 'closed-changed', 'workspace-ready', 'history', 'ink-changed']) bus.on(ev, refresh);
  bus.on('pen-changed', (on) => { toolsBtn.classList.toggle('active', on); dock.classList.toggle('hidden-for-pen', on); });
  bus.on('focus-changed', (id) => { dock.classList.toggle('in-focus', !!id); ensureExitPill(!!id); });
  refresh();
  bindDrop();
  bindPaste();
}

function dockButton(ic, label, onClick) {
  return el('button', { type: 'button', class: 'dock-btn', 'aria-label': label, onclick: onClick }, icon(ic, 19), el('span', { text: label }));
}

let exitPill;
function ensureExitPill(on) {
  if (on && !exitPill) {
    exitPill = el('button', { type: 'button', class: 'exit-focus glass strong', 'data-ui': '', onclick: () => toggleFocus(state.focusedId) }, icon('close', 15), 'Exit focus');
    document.getElementById('ui').append(exitPill);
  }
  if (exitPill) exitPill.hidden = !on;
}

export function openAdd(anchor = addBtn) {
  openMenu({
    anchor, placement: anchor === addBtn ? 'above' : 'below', label: 'Add to your space',
    items: [
      { label: 'Upload file', icon: 'file', onClick: () => fileInput.click() },
      { label: 'Take photo', icon: 'camera', onClick: () => cameraInput.click() },
      { label: 'YouTube link', icon: 'video', onClick: () => youtubeDialog((url) => { const r = addVideo(url); if (r.error) bus.emit('toast', { text: r.error }); }) },
      { label: 'Sticky note', icon: 'note', onClick: () => addNote() },
      { label: 'Voice recording', icon: 'mic', onClick: () => recordDialog() },
      { sep: true },
      { label: 'Pomodoro', icon: 'timer', onClick: () => createObject('pomodoro') },
      { label: 'DABSy', icon: 'spark', onClick: () => createObject('dabsy') },
      { label: 'SolveCount timer', icon: 'timer', onClick: () => createObject('solvecount') },
    ],
  });
}

export function openTools() {
  openMenu({
    anchor: toolsBtn, placement: 'above', label: 'Tools',
    items: [
      { label: 'Sticky Notes', icon: 'note', onClick: () => addNote() },
      { label: 'Pen', icon: 'pen', checked: isPenOn(), onClick: () => togglePen() },
      { label: 'Focus', icon: 'focus', hint: 'F', onClick: () => toggleFocus() },
      { label: 'Calculator', icon: 'calc', onClick: () => createObject('calculator') },
    ],
  });
}

function openMore() {
  const closed = closedObjects();
  const setMotion = (m) => { state.settings.motion = m; document.documentElement.dataset.motion = m === 'system' ? '' : m; saveSetting('prefs', { motion: state.settings.motion, snap: state.settings.snap }); };
  openMenu({
    anchor: moreBtn, placement: 'above', label: 'More',
    items: [
      { label: 'Undo', icon: 'undo', disabled: !history.canUndo(), hint: 'Ctrl Z', onClick: () => history.undo() },
      { label: 'Redo', icon: 'redo', disabled: !history.canRedo(), hint: 'Ctrl ⇧ Z', onClick: () => history.redo() },
      { sep: true },
      { label: `Closed items${closed.length ? ` (${closed.length})` : ''}`, icon: 'layers', disabled: !closed.length, onClick: () => openClosed() },
      { label: 'Reset view', icon: 'full', onClick: () => { state.viewport.x = 0; state.viewport.y = 0; state.viewport.scale = 1; applyViewport(); } },
      { label: 'Snap to alignment', icon: 'group', checked: state.settings.snap, onClick: () => { state.settings.snap = !state.settings.snap; saveSetting('prefs', { motion: state.settings.motion, snap: state.settings.snap }); } },
      { label: 'Reduce motion', icon: 'pause', checked: state.settings.motion === 'reduced', onClick: () => setMotion(state.settings.motion === 'reduced' ? 'system' : 'reduced') },
      canInstall() ? { label: 'Install app', icon: 'download', onClick: () => promptInstall() } : null,
    ],
  });
}

function openClosed() {
  const items = closedObjects().map((o) => ({
    label: o.title || o.meta.filename || TYPES[o.type].label, icon: { pdf: 'file', video: 'video', image: 'file', audio: 'audio', text: 'text', pomodoro: 'timer', dabsy: 'spark' }[o.type] || 'file',
    hint: TYPES[o.type].label, onClick: () => reopenObject(o.id, { reveal: true }),
  }));
  openMenu({ anchor: moreBtn, placement: 'above', items, label: 'Closed items' });
}

// ---- Drag & drop / paste -----------------------------------------------------
function bindDrop() {
  const stage = document.getElementById('stage');
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].some((t) => t === 'Files' || t === 'text/uri-list' || t === 'text/plain');
  stage.addEventListener('dragenter', (e) => { if (hasFiles(e)) { depth++; stage.classList.add('drop-ready'); } });
  stage.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; stage.classList.remove('drop-ready'); } });
  stage.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  stage.addEventListener('drop', async (e) => {
    e.preventDefault(); depth = 0; stage.classList.remove('drop-ready');
    const { screenToWorld } = await import('../canvas/viewport.js');
    const at = screenToWorld(e.clientX, e.clientY);
    if (e.dataTransfer.files?.length) {
      const files = [...e.dataTransfer.files];
      importFiles(files, { at: { x: Math.round(at.x - 160), y: Math.round(at.y - 40) } });
    } else {
      const text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      if (text) { const r = addVideo(text.trim()); if (r.error) bus.emit('toast', { text: r.error }); }
    }
  });
}

function bindPaste() {
  document.addEventListener('paste', (e) => {
    if (/INPUT|TEXTAREA/.test(e.target.tagName) || e.target.isContentEditable) return;
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); importFiles(files); return; }
    const text = e.clipboardData?.getData('text/plain')?.trim();
    if (text && /youtu\.?be/.test(text)) { const r = addVideo(text); if (!r.error) e.preventDefault(); }
  });
}

// ---- Voice recording -----------------------------------------------------------
function recordDialog() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    bus.emit('toast', { text: 'Recording isn’t supported in this browser.' }); return;
  }
  const status = el('p', { class: 'muted', text: 'Microphone access is requested only when you start.' });
  const timer = el('div', { class: 'rec-time', text: '0:00' });
  let rec = null, stream = null, chunks = [], t0 = 0, iv = 0;
  const cleanup = () => { clearInterval(iv); stream?.getTracks().forEach((t) => t.stop()); };
  const startBtn = { label: 'Start recording', primary: true, onClick: async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        cleanup();
        const type = rec.mimeType || 'audio/webm';
        const file = new File(chunks, `Recording ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.${type.includes('mp4') ? 'm4a' : 'webm'}`, { type });
        closeDialog();
        const { saveFile } = await import('../storage/file-storage.js');
        try { const meta = await saveFile(file); createObject('audio', { fileId: meta.id, meta: { filename: meta.name, mime: meta.type, size: meta.size, recorded: true } }); }
        catch { bus.emit('toast', { text: 'Couldn’t save the recording.' }); }
      };
      rec.start(); t0 = Date.now();
      status.textContent = 'Recording…';
      iv = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500);
      stopBtnNode.hidden = false; startNode.hidden = true;
    } catch { status.textContent = 'Microphone access was blocked. Allow it in your browser settings to record.'; }
  } };
  const node = showDialog({
    title: 'Record audio', content: el('div', { class: 'rec' }, timer, status),
    actions: [{ label: 'Cancel', onClick: () => { try { rec?.state === 'recording' && (rec.onstop = null, rec.stop()); } catch { /* */ } cleanup(); closeDialog(); } }, startBtn,
      { label: 'Stop and add', primary: true, onClick: () => rec?.stop() }],
    onClose: cleanup,
  });
  const btns = node.querySelectorAll('.dialog-actions .btn');
  const startNode = btns[1], stopBtnNode = btns[2];
  stopBtnNode.hidden = true;
}

void removeObject;
