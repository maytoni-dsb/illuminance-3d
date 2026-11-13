// Help: "?" buttons next to groups, the "?" of the top bar and F1 (stage 7). A popover shows the text
// of a topic: a group, a single field (F1 in a field) or the current stage (F1 elsewhere).
// The texts come from the dictionaries (help.*).

import { t } from './i18n.js';

/** Topics: data-help="<key>" on a button.help, field keys "f:<key>", stages "stage1…3". */
export const HELP_KEYS = Object.freeze([
  'stage1', 'stage2', 'stage3', 'room', 'refl', 'norm', 'file', 'lumdata', 'grid', 'results', 'plane', 'view',
  'f:roomname', 'f:L', 'f:W', 'f:H', 'f:rhoC', 'f:rhoW', 'f:rhoF', 'f:En', 'f:hwp', 'f:U0n', 'f:mf', 'f:nx', 'f:ny',
  'f:hm', 'f:psi', 'f:flux', 'f:cct', 'f:power',
  'f:name', 'f:description', 'f:author', 'f:phone', 'f:email', 'f:customer',
]);

/**
 * The topics in the language of the page: { title, text }; {keys} in a text is the list of the hot
 * keys of the page (help.keys, same as js/hotkeys.js).
 */
export const HELP = Object.freeze(Object.fromEntries(HELP_KEYS.map((k) => [k, Object.freeze({
  get title() { return t(`help.topics.${k}.title`); },
  get text() { return t(`help.topics.${k}.text`, { keys: t('help.keys') }); },
})])));

/** "?" button markup for a topic. */
export const helpButton = (key) => `<button type="button" class="help" data-help="${key}" aria-label="${t('help.label', { title: HELP[key]?.title ?? '' })}" aria-expanded="false">?</button>`;

let api = null;

/**
 * Opens and closes the popover for every button.help inside root (one at a time); Esc, a click
 * elsewhere or a second click on the button close it. Returns { show(key, anchor), close() }:
 * show opens a topic next to any element (F1, the "?" of the top bar).
 */
export function initHelp(root = document) {
  const pop = document.createElement('div');
  pop.className = 'helppop';
  pop.setAttribute('role', 'dialog');
  pop.hidden = true;
  document.body.appendChild(pop);
  let owner = null;
  const close = () => { if (owner) owner.setAttribute('aria-expanded', 'false'); owner = null; pop.hidden = true; };
  function show(key, anchor) {
    close();
    const h = HELP[key] ?? { title: t('help.title'), text: t('help.none') };
    pop.innerHTML = `<div class="hpt">${h.title}</div><div class="hpx">${h.text}</div>`;
    pop.style.maxWidth = h.text.length > 400 ? '420px' : '';
    pop.hidden = false;
    const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, hh = pop.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    const below = r.bottom + 8 + hh < window.innerHeight;
    pop.style.left = `${left + window.scrollX}px`;
    pop.style.top = `${Math.max(8, below ? r.bottom + 8 : r.top - 8 - hh) + window.scrollY}px`;
    owner = anchor; anchor.setAttribute('aria-expanded', 'true');
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button.help');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (owner === b) { close(); return; }
    show(b.dataset.help, b);
  });
  document.addEventListener('click', (e) => { if (owner && !pop.contains(e.target) && !owner.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  window.addEventListener('resize', close);
  document.addEventListener('scroll', (e) => { if (!pop.contains(e.target)) close(); }, true);
  api = { show, close, isOpenFor: (el) => owner === el };
  return api;
}
