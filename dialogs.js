// Dialogs sit at the top of the glass hierarchy (strongest surface). Small, focused.
import { bus, el } from '../core/util.js';
import { parseYouTube } from '../objects/youtube.js';

let openDialog = null;

export function closeDialog() {
  if (!openDialog) return;
  const { node, prev, onKey } = openDialog;
  openDialog = null;
  document.removeEventListener('keydown', onKey, true);
  node.classList.add('closing'); setTimeout(() => node.remove(), 160);
  prev?.focus?.({ preventScroll: true });
}

export function showDialog({ title, content, actions = [], onClose }) {
  closeDialog();
  const prev = document.activeElement;
  const node = el('div', { class: 'dialog-scrim', 'data-ui': '', onpointerdown: (e) => { if (e.target === node) { closeDialog(); onClose?.(); } } },
    el('div', { class: 'dialog glass strongest', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('h2', { text: title }), content,
      actions.length ? el('div', { class: 'dialog-actions' }, actions.map((a) => el('button', { type: 'button', class: `btn ${a.primary ? 'primary' : 'subtle'}`, onclick: a.onClick }, a.label))) : null));
  document.getElementById('overlays').append(node);
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeDialog(); onClose?.(); }
    if (e.key === 'Tab') {   // simple focus trap
      const f = [...node.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((n) => !n.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener('keydown', onKey, true);
  openDialog = { node, prev, onKey };
  setTimeout(() => node.querySelector('input, textarea, button')?.focus({ preventScroll: true }), 30);
  return node;
}

export function promptDialog({ title, value = '', type = 'text', confirm = 'Save', placeholder = '', onSubmit }) {
  const input = el('input', { type, value, placeholder, class: 'text-input', 'aria-label': title, autocomplete: 'off', maxlength: '120' });
  const submit = () => { closeDialog(); onSubmit(input.value); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  showDialog({ title, content: input, actions: [{ label: 'Cancel', onClick: closeDialog }, { label: confirm, primary: true, onClick: submit }] });
  setTimeout(() => input.select(), 40);
}

export function youtubeDialog(onAdd) {
  const input = el('input', { type: 'url', class: 'text-input', placeholder: 'Paste a YouTube link', 'aria-label': 'YouTube link', autocomplete: 'off' });
  const msg = el('p', { class: 'form-error', role: 'alert' });
  const submit = () => {
    if (!parseYouTube(input.value)) { msg.textContent = 'That doesn’t look like a YouTube link.'; input.focus(); return; }
    closeDialog(); onAdd(input.value);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  input.addEventListener('input', () => { msg.textContent = ''; });
  showDialog({ title: 'Add a YouTube video', content: el('div', {}, input, msg), actions: [{ label: 'Cancel', onClick: closeDialog }, { label: 'Add video', primary: true, onClick: submit }] });
}

export function initDialogs() {
  bus.on('prompt', promptDialog);
}
