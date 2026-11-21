// Luminaires in the form (stage 2.1, the editor after DIALux): the buttons of the placement kinds,
// the rows of fields of the selected group or of the next group to draw, and the list of the
// luminaires of the project (the dialog "List"). Browser only; the pure part is js/groupform.js.

import { rowsOf, fieldValues, draftValues, validateGroup, validateDraft } from './groupform.js';
import { groupCount } from './groups.js';
import { TYPE_COLORS, typeColorOf } from './model.js';
import { stepValue, parseNumber, toDecimal, formatNumber } from './ui.js';
import { t, decimal } from './i18n.js';

export { TYPE_COLORS, typeColorOf };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Name of a type as the lists show it: its own name, the article of its file, or "Type N". */
export function typeName(ty, k, file = null) {
  if (ty.name) return ty.name;
  if (ty.photometry === 'file' && file) {
    const tb = file.table;
    const article = tb?.catalog || tb?.name || '';
    if (article) return String(article).trim();
    return file.name.replace(/\.(ies|ldt)$/i, '');
  }
  return t('lum.typeN', { n: k + 1 });
}

/** Mark of a type: a dot of its colour (no letters, decided on 21 Nov 2026). */
export const typeMark = (color) => `<span class="tymark" style="--ty:${color}" aria-hidden="true"></span>`;

/** The lamp set of a type's file in words ("LED / 7190"), when the file has several. */
export function setText(file, set) {
  const s = file?.table?.lampSets;
  if (!s || s.length < 2 || !s[set]) return '';
  return s[set].type || t('phot.set', { n: set + 1 });
}

/** The swatches of the colour of a type: the palette and a colour of one's own. */
export function renderSwatches(host, color) { host.innerHTML = swatchesHtml(color); }
/** The HTML of the swatches of the colour of a type. */
export function swatchesHtml(color) {
  const own = !TYPE_COLORS.includes(color);
  return `<div class="swrow">${TYPE_COLORS.map((c) => `<button type="button" class="sw${c === color ? ' sel' : ''}" data-color="${c}" style="--ty:${c}" aria-label="${c}"></button>`).join('')}
    <label class="sw own${own ? ' sel' : ''}" style="--ty:${own ? color : '#ffffff'}" data-tip="${esc(t('lum.colorOwn'))}"><input type="color" value="${color}" aria-label="${esc(t('lum.colorOwn'))}"></label></div>`;
}

const SVG = (d, extra = '') => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"${extra}>${d}</svg>`;
const DOT = (x, y, r = 1.7) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
/** Icons of the placement kinds. */
export const KIND_ICON = {
  single: SVG(DOT(8, 8, 2.6)),
  grid: SVG(DOT(4, 4) + DOT(12, 4) + DOT(4, 12) + DOT(12, 12)),
  line: SVG(`<path d="M1.5 8h13" stroke-width="1"/>${DOT(3, 8)}${DOT(8, 8)}${DOT(13, 8)}`),
  circle: SVG(`<circle cx="8" cy="8" r="5.2" stroke-width="1"/>${DOT(13.2, 8)}${DOT(2.8, 8)}${DOT(8, 2.8)}${DOT(8, 13.2)}`),
};
/** Icons of the rows of fields. */
const ROW_ICON = {
  pos: SVG('<path d="M8 14.5s4.5-4.2 4.5-7.8a4.5 4.5 0 0 0-9 0C3.5 10.3 8 14.5 8 14.5z"/><circle cx="8" cy="6.7" r="1.6"/>'),
  rot: SVG('<path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M11.8 1.8v2.8H9"/>'),
  count: SVG('<path d="M5.5 2.5 4.5 13.5M11.5 2.5l-1 11M2.5 5.5h11M2 10.5h11"/>'),
  size: SVG('<path d="M2 5.5h12M2 3.5v4M14 3.5v4M10.5 14V2M8.5 2h4M8.5 14h4" stroke-width="1.1"/>'),
  centre: SVG('<circle cx="8" cy="8" r="5"/><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3"/>'),
  start: SVG(`<path d="M5 8h9" stroke-dasharray="1.6 1.6"/><circle cx="4" cy="8" r="2.4"/>`),
  end: SVG(`<path d="M2 8h9" stroke-dasharray="1.6 1.6"/>${DOT(12, 8, 2.4)}`),
};

/** The buttons of the placement kinds: single, grid, line, circle; the one being drawn is pressed. */
export function renderKinds(host, kind, drawing) {
  host.innerHTML = ['single', 'grid', 'line', 'circle'].map((k) => {
    const on = drawing && k === kind;
    return `<button type="button" data-kind="${k}" aria-pressed="${on}" class="gschipb tipl${on ? ' sel' : ''}" data-tip="${esc(t(`lum.kind.${k}`))}" aria-label="${esc(t(`lum.kind.${k}`))}">${KIND_ICON[k]}</button>`;
  }).join('');
}

const UP = '<svg viewBox="0 0 8 5" width="7" height="4" aria-hidden="true"><path d="M0 5 4 0 8 5z" fill="currentColor"/></svg>';
const DOWN = '<svg viewBox="0 0 8 5" width="7" height="4" aria-hidden="true"><path d="M0 0h8L4 5z" fill="currentColor"/></svg>';

/**
 * The rows of fields: of the selected group, or of the next group to draw (`draft`). Every valid
 * change calls onChange({ group }) or onChange({ draft }).
 * @returns {{ load(o), context(c) }} o = { group } | { kind, draft }, with ctx { H, L, W, others, at }
 */
export function initGroupForm(host, onChange) {
  let g = null, kind = 'single', draft = null, ctx = { H: 3, L: 6, W: 4, others: 0, at: 0 }, inputs = {}, fields = {}, timer = 0;
  const shown = (x) => (x == null || !Number.isFinite(x) ? '' : formatNumber(x, 6));

  function build() {
    inputs = {}; fields = {};
    const rows = rowsOf(g ? g.kind : kind, !g);
    const v = g ? fieldValues(g, ctx) : draftValues(kind, draft, ctx);
    const parts = [];
    if (g?.kind === 'single' && g.points.length > 1) {
      const n = g.points.length, at = Math.min(ctx.at ?? 0, n - 1);
      parts.push(`<div class="gpoint"><button type="button" class="gschipb sm" data-pt="-1"${at <= 0 ? ' disabled' : ''} aria-label="${esc(t('lum.prevLum'))}">‹</button><span>${esc(t('lum.lumOf', { k: at + 1, n }))}</span><button type="button" class="gschipb sm" data-pt="1"${at >= n - 1 ? ' disabled' : ''} aria-label="${esc(t('lum.nextLum'))}">›</button></div>`);
    }
    for (const r of rows) {
      const cells = r.fields.map((f) => {
        fields[f.key] = f;
        const unit = f.unit === '°' ? '<span class="gu">°</span>' : '';
        return `<div class="gf" data-k="${f.key}"><span class="gax">${esc(f.ax)}</span><span class="spin"><button type="button" tabindex="-1" data-d="1" aria-label="${esc(t('form.more'))}">${UP}</button><button type="button" tabindex="-1" data-d="-1" aria-label="${esc(t('form.less'))}">${DOWN}</button></span><input id="in-g-${f.key}" inputmode="decimal" autocomplete="off" spellcheck="false" value="${esc(shown(v[f.key]))}" aria-label="${esc(t(`gform.tip.${r.tip}`) + ': ' + f.ax)}">${unit}</div>`;
      }).join('');
      const tip = t(`gform.tip.${r.tip}`);
      parts.push(`<div class="grow" data-tip="${esc(tip)}"><span class="gic" title="${esc(tip)}">${ROW_ICON[r.icon]}</span><div class="gcells c${r.fields.length}">${cells}</div></div>`);
    }
    parts.push('<div class="ferr gerr" role="alert" hidden></div>');
    if (!g) parts.push(`<div class="gshint gdraw">${esc(t(`lum.draw.${kind}`))}</div>`);
    host.innerHTML = parts.join('');
    for (const k of Object.keys(fields)) inputs[k] = host.querySelector(`#in-g-${k}`);
  }
  const raw = () => Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value]));
  function check() {
    const r = g ? validateGroup(g, raw(), ctx) : validateDraft(kind, raw(), ctx);
    const msgs = [];
    for (const [k, el] of Object.entries(inputs)) {
      const e = r.errors[k] || '';
      el.closest('.gf').classList.toggle('bad', !!e);
      el.toggleAttribute('aria-invalid', !!e);
      if (e && !msgs.includes(e)) msgs.push(e);
    }
    const box = host.querySelector('.gerr');
    box.textContent = msgs.join(' '); box.hidden = !msgs.length;
    if (!r.ok) return;
    if (g) { g = r.group; onChange({ group: r.group }); } else { draft = r.draft; onChange({ draft: r.draft }); }
  }
  // the room form around listens to input and change too: these fields are not its own
  host.addEventListener('input', (e) => {
    e.stopPropagation();
    const el = e.target;
    if (el.tagName === 'INPUT' && el.value.includes(decimal() === ',' ? '.' : ',')) {
      const at = el.selectionStart; el.value = toDecimal(el.value); if (at != null) el.setSelectionRange(at, at);
    }
    clearTimeout(timer); timer = setTimeout(check, 250);
  });
  host.addEventListener('change', (e) => { e.stopPropagation(); clearTimeout(timer); check(); });
  host.addEventListener('keydown', (e) => {
    if (e.target.tagName !== 'INPUT') return;
    if (e.key === 'Enter') { clearTimeout(timer); check(); return; }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault(); bump(e.target.closest('.gf').dataset.k, e.key === 'ArrowUp' ? 1 : -1);
  });
  host.addEventListener('click', (e) => {
    const s = e.target.closest('.spin button');
    if (s) { bump(s.closest('.gf').dataset.k, Number(s.dataset.d)); return; }
    const p = e.target.closest('[data-pt]');
    if (p && g?.kind === 'single') {
      const n = g.points.length;
      ctx = { ...ctx, at: Math.max(0, Math.min(n - 1, (ctx.at ?? 0) + Number(p.dataset.pt))) };
      onChange({ group: g, at: ctx.at });
      build();
    }
  });
  function bump(k, dir) {
    const f = fields[k], el = inputs[k];
    if (!f || !el) return;
    const p = { ...f, def: 0, min: f.min ?? 0, max: typeof f.max === 'function' ? f.max(ctx) : f.max };
    el.value = shown(stepValue(p, parseNumber(el.value), dir));
    clearTimeout(timer); check();
  }
  return {
    /** Shows a group ({ group }) or the next group to draw ({ kind, draft }); rebuilds the rows. */
    load(o, c) { g = o.group ?? null; kind = o.kind ?? g?.kind ?? 'single'; draft = o.draft ?? {}; ctx = { at: 0, ...c }; build(); },
    /** The context changed (room size, other groups): the values are shown again. */
    context(c) { ctx = { ...ctx, ...c }; build(); },
  };
}

/**
 * The luminaires of the project (dialog "List"): a row per type with its mark, name (editable),
 * file, count; the active one marked (a click on a row makes it active); actions per row: replace
 * the luminaires of the selection, delete (only an unused type).
 * @param {{ nameOf(ty, k), fileOf(ty), active, canReplace: boolean }} o
 */
export function renderLumList(host, m, o) {
  const counts = new Map(m.types.map((ty) => [ty.id, 0]));
  for (const g of m.groups) counts.set(g.type, (counts.get(g.type) ?? 0) + groupCount(g));
  const rows = m.types.map((ty, k) => {
    const f = o.fileOf(ty), n = counts.get(ty.id), on = ty.id === o.active;
    const st = f ? setText(f, ty.file?.set ?? 0) : '';
    const file = f ? `${esc(f.name)}${st ? ` · ${esc(st)}` : ''}` : esc(t('rui.noFileLum'));
    const flux = `${formatNumber(f ? f.phot.flux : ty.flux, 0)} ${t('unit.lm')}`;
    return `<tr class="${on ? 'on' : ''}" data-type="${ty.id}">
      <td>${typeMark(typeColorOf(m, k))}</td>
      <td><input class="lname" data-name="${ty.id}" value="${esc(ty.name ?? '')}" placeholder="${esc(typeName({ ...ty, name: undefined }, k, f))}" maxlength="80" aria-label="${esc(t('lum.typeName'))}"><small>${file} · ${esc(flux)}</small></td>
      <td class="n">${n}</td>
      <td class="acts">${o.canReplace ? `<button type="button" class="gschipb sm" data-replace="${ty.id}" data-tip="${esc(t('lum.replaceTip'))}">${esc(t('lum.replace'))}</button>` : ''}
        <button type="button" class="gschipb sm" data-dup="${ty.id}" data-tip="${esc(t('lum.dupTip'))}">${esc(t('lum.dup'))}</button>
        <button type="button" class="ldel" data-del="${ty.id}"${n || m.types.length < 2 ? ` disabled data-tip="${esc(t('lum.typeUsed'))}"` : ''} aria-label="${esc(t('lum.typeDel'))}">×</button></td></tr>`;
  }).join('');
  host.innerHTML = `<table class="ltable"><thead><tr><th></th><th>${esc(t('lum.typeName'))}</th><th class="n">${esc(t('unit.pcs'))}</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <button type="button" class="gschipb sm" data-addtype="1">+ ${esc(t('lum.typeAdd'))}</button>`;
}
