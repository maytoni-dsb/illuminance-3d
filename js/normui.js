// The codifier dialog (stage 7): a window in the middle of the page with the norms of the chosen set,
// collapsible sections, search and a click on a row to apply it. User-facing strings are Russian.

import { NORM_SETS, searchNorms, normFromRow, applicable } from './norms.js';
import { formatNumber } from './ui.js';

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STORE = 'lcalc.normset';

/** Highlights the words of the query in already escaped text. */
function mark(html, words) {
  if (!words.length) return html;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/е/g, '[её]')).join('|')})`, 'gi');
  return html.replace(/(<[^>]*>)|([^<]+)/g, (m, tag, text) => tag ?? text.replace(re, '<mark>$1</mark>'));
}

/**
 * @param {{ dialog: HTMLDialogElement, set: HTMLElement, query: HTMLInputElement, body: HTMLElement,
 *           count: HTMLElement, note: HTMLElement, close: HTMLElement,
 *           current: () => object|null, apply: (norm) => void }} o
 */
export function initNormDialog(o) {
  let setId = 'sp52';
  try { setId = localStorage.getItem(STORE) || setId; } catch (e) { /* storage unavailable */ }
  if (!NORM_SETS.some((s) => s.id === setId)) setId = 'sp52';
  let timer = 0, rows = new Map();
  const setOf = () => NORM_SETS.find((s) => s.id === setId);

  o.set.innerHTML = NORM_SETS.map((s) => `<button type="button" data-set="${s.id}">${s.title}</button>`).join('');

  function render() {
    const set = setOf(), q = o.query.value.trim();
    for (const b of o.set.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.set === setId));
    const words = q.toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean);
    const secs = searchNorms(set, q);
    const cur = o.current();
    rows = new Map();
    const total = secs.reduce((a, s) => a + s.rows.length, 0);
    o.count.textContent = q ? (total ? `найдено: ${total}` : '') : `${total} строк`;
    if (!secs.length) { o.body.innerHTML = `<div class="nempty">Ничего не найдено. Попробуйте другое слово${setId === 'en12464' ? ' — названия в EN 12464-1 на английском' : ''}.</div>`; return; }
    const openAll = !!q && total <= 120;
    o.body.innerHTML = secs.map((s, k) => {
      const has = cur && cur.set === setId && s.rows.some((r) => r.ref === cur.ref);
      return `<details class="nsec"${openAll || has ? ' open' : ''}><summary>${mark(esc(s.title), words)}<small>${s.rows.length}</small></summary>
        <table class="ntable"><thead><tr><th class="r">${set.refLabel}</th><th>${setId === 'sp52' ? 'Помещение, рабочее место' : 'Type of task / activity area'}</th>
          <th class="p">Плоскость</th><th class="v">Ē, лк</th><th class="v">U₀</th></tr></thead><tbody>${s.rows.map((r, j) => {
          const id = `${k}-${j}`; rows.set(id, r);
          const ok = applicable(r), sel = cur && cur.set === setId && cur.ref === r.ref;
          const note = r.note ? `<small>${mark(esc(r.note), words)}</small>` : '';
          return `<tr class="${ok ? 'nrow' : 'na'}${sel ? ' sel' : ''}" data-row="${id}"${ok ? ' tabindex="0"' : ' title="Вертикальная плоскость: в программе рассчитываются только горизонтальные"'}>
            <td class="r">${mark(esc(r.ref), words)}</td><td>${mark(esc(r.name), words)}${note}</td><td class="p">${esc(r.plane)}</td>
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
      if (cur?.set) setId = cur.set;
      o.query.value = '';
      render();
      o.dialog.showModal();
      o.query.focus();
      o.body.querySelector('tr.sel')?.scrollIntoView({ block: 'center' });
    },
    isOpen: () => o.dialog.open,
  };
}
