// The codifier dialog (stage 7): a window in the middle of the page with the norms of the chosen set,
// collapsible sections, search and a click on a row to apply it. Strings: dictionaries (norms.*).
// Stage 8: only the sets of the language (normSets); with one set the switch is hidden.

import { normSets, searchNorms, normFromRow, applicable } from './norms.js';
import { t, formatNumber, foldText, planeCode } from './i18n.js';

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STORE = 'lcalc.normset';

/**
 * Text with the words of the query marked, escaped. The search folds the text (diacritics,
 * dashes), and so does the marking: foldText keeps the positions of the characters.
 */
function mark(text, words) {
  const s = String(text ?? '');
  if (!words.length) return esc(s);
  const f = foldText(s), hit = new Uint8Array(s.length);
  for (const w of words) for (let i = f.indexOf(w); i >= 0; i = f.indexOf(w, i + 1)) hit.fill(1, i, i + w.length);
  let out = '', open = false;
  for (let i = 0; i < s.length; i++) {
    if (hit[i] && !open) { out += '<mark>'; open = true; } else if (!hit[i] && open) { out += '</mark>'; open = false; }
    out += esc(s[i]);
  }
  return open ? `${out}</mark>` : out;
}

/**
 * @param {{ dialog: HTMLDialogElement, set: HTMLElement, query: HTMLInputElement, body: HTMLElement,
 *           count: HTMLElement, note: HTMLElement, close: HTMLElement,
 *           current: () => object|null, apply: (norm) => void }} o
 */
export function initNormDialog(o) {
  const sets = normSets();
  let setId = sets[0].id;
  try { setId = localStorage.getItem(STORE) || setId; } catch (e) { /* storage unavailable */ }
  if (!sets.some((s) => s.id === setId)) setId = sets[0].id;
  let timer = 0, rows = new Map();
  const setOf = () => sets.find((s) => s.id === setId);

  o.set.innerHTML = sets.map((s) => `<button type="button" data-set="${s.id}">${s.title}</button>`).join('');
  o.set.hidden = sets.length < 2;

  function render() {
    const set = setOf(), q = o.query.value.trim();
    for (const b of o.set.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.set === setId));
    const words = foldText(q).split(/\s+/).filter(Boolean);
    const secs = searchNorms(set, q);
    const cur = o.current();
    rows = new Map();
    const total = secs.reduce((a, s) => a + s.rows.length, 0);
    o.count.textContent = q ? (total ? t('norms.found', { n: total }) : '') : t('norms.rows', { n: total });
    if (!secs.length) { o.body.innerHTML = `<div class="nempty">${t(setId === 'en12464' ? 'norms.noneEn' : 'norms.none')}</div>`; return; }
    const openAll = !!q && total <= 120;
    o.body.innerHTML = secs.map((s, k) => {
      const has = cur && cur.set === setId && s.rows.some((r) => r.ref === cur.ref);
      return `<details class="nsec"${openAll || has ? ' open' : ''}><summary>${mark(s.title, words)}<small>${s.rows.length}</small></summary>
        <table class="ntable"><thead><tr><th class="r">${set.refLabel}</th><th>${set.head}</th>
          <th class="p">${t('norms.plane')}</th><th class="v">Ē, ${t('unit.lx')}</th><th class="v">U₀</th></tr></thead><tbody>${s.rows.map((r, j) => {
          const id = `${k}-${j}`; rows.set(id, r);
          const ok = applicable(r), sel = cur && cur.set === setId && cur.ref === r.ref;
          const note = r.note ? `<small>${mark(r.note, words)}</small>` : '';
          return `<tr class="${ok ? 'nrow' : 'na'}${sel ? ' sel' : ''}" data-row="${id}"${ok ? ' tabindex="0"' : ` title="${esc(t('norms.vertical'))}"`}>
            <td class="r">${mark(r.ref, words)}</td><td>${mark(r.name, words)}${note}</td><td class="p">${esc(planeCode(r.plane))}</td>
            <td class="v"><b>${formatNumber(r.E, 0)}</b></td><td class="v">${r.U0 != null ? formatNumber(r.U0, 2) : '—'}</td></tr>`;
        }).join('')}</tbody></table></details>`;
    }).join('');
    o.note.textContent = set.note;
    o.note.hidden = !set.note;
  }

  function choose(tr) {
    const r = rows.get(tr?.dataset.row);
    if (!r || !applicable(r)) return;
    o.apply(normFromRow(setOf(), r));
    o.dialog.close();
  }

  o.set.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-set]');
    if (!b || b.dataset.set === setId) return;
    setId = b.dataset.set;
    try { localStorage.setItem(STORE, setId); } catch (e2) { /* storage unavailable */ }
    o.body.scrollTop = 0;
    render();
  });
  o.query.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { o.body.scrollTop = 0; render(); }, 120); });
  o.body.addEventListener('click', (e) => choose(e.target.closest('tr.nrow')));
  o.body.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const tr = e.target.closest('tr.nrow'); if (tr) { e.preventDefault(); choose(tr); } } });
  o.close.addEventListener('click', () => o.dialog.close());
  o.dialog.addEventListener('click', (e) => { if (e.target === o.dialog) o.dialog.close(); }); // the backdrop

  return {
    open() {
      const cur = o.current();
      if (cur?.set && sets.some((s) => s.id === cur.set)) setId = cur.set;
      o.query.value = '';
      render();
      o.dialog.showModal();
      o.query.focus();
      o.body.querySelector('tr.sel')?.scrollIntoView({ block: 'center' });
    },
    isOpen: () => o.dialog.open,
  };
}
