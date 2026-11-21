// Luminaires in the form (stage 2.1, the editor after DIALux): the buttons of the placement kinds,
// the rows of fields of the selected group or of the next group to draw, and the list of the
// luminaires of the project (the dialog "List"). Browser only; the pure part is js/groupform.js.

import { rowsOf, fieldValues, draftValues, validateGroup, validateDraft, MEASURES, gridOverRoom } from './groupform.js';
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

/** The palette of the full choice of a colour (24, the first eight are TYPE_COLORS). */
export const PALETTE = Object.freeze([...TYPE_COLORS, '#fa5252', '#e64980', '#be4bdb', '#7950f2', '#4c6ef5', '#228be6', '#15aabf', '#12b886',
  '#40c057', '#82c91e', '#fab005', '#fd7e14', '#c92a2a', '#a61e4d', '#862e9c', '#364fc7']);

/**
 * The colours of a luminaire in its card (21 Nov 2026): four colours of the palette no other
 * luminaire of the project shows, always in the order of the palette (no "carousel"), the one of
 * the luminaire marked; then the full choice — filled with the colour when it is none of the four.
 * @param {string} color — the colour of the luminaire
 * @param {Set<string>} used — the colours of the other luminaires of the project
 */
export function swatchesHtml(color, used) {
  const four = TYPE_COLORS.filter((c) => !used.has(c) || c === color).slice(0, 4);
  const mine = four.includes(color);
  return `<div class="swrow">${four.map((c) => `<button type="button" class="tsw${c === color ? ' sel' : ''}" data-color="${c}" style="--ty:${c}" aria-label="${c}" aria-pressed="${c === color}"></button>`).join('')}
    <button type="button" class="tsw more${mine ? '' : ' sel'}" data-more="1" style="${mine ? '' : `--ty:${color}`}" aria-haspopup="true" aria-expanded="false" aria-label="${esc(t('lum.colorMore'))}" title="${esc(t('lum.colorMore'))}"></button></div>`;
}

/** The full choice of a colour: the palette without the colours of the other luminaires, and a colour of one's own (HEX or the picker). */
export function paletteHtml(color, used) {
  return `<div class="pal">${PALETTE.filter((c) => !used.has(c) || c === color).map((c) => `<button type="button" class="tsw${c === color ? ' sel' : ''}" data-color="${c}" style="--ty:${c}" aria-label="${c}"></button>`).join('')}</div>
    <div class="palown"><span>${esc(t('lum.colorOwn'))}</span><input class="palhex" value="${color}" maxlength="7" spellcheck="false" aria-label="HEX"><input type="color" class="palpick" value="${color}" aria-label="${esc(t('lum.colorOwn'))}"></div>`;
}

const SVG = (d, extra = '') => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"${extra}>${d}</svg>`;
const DOT = (x, y, r = 1.7) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
/** Icons of the placement kinds. */
export const KIND_ICON = {
  auto: SVG('<rect x="2" y="2.5" width="12" height="11" rx="1" stroke-width="1"/>' + DOT(5.5, 6) + DOT(10.5, 6) + DOT(5.5, 10) + DOT(10.5, 10) + '<path d="M12.5 1v2.4M11.3 2.2h2.4" stroke-width="1.1"/>'),
  single: SVG(DOT(8, 8, 2.6)),
  grid: SVG(DOT(4, 4) + DOT(12, 4) + DOT(4, 12) + DOT(12, 12)),
  line: SVG(`<path d="M1.5 8h13" stroke-width="1"/>${DOT(3, 8)}${DOT(8, 8)}${DOT(13, 8)}`),
  circle: SVG(`<circle cx="8" cy="8" r="5.2" stroke-width="1"/>${DOT(13.2, 8)}${DOT(2.8, 8)}${DOT(8, 2.8)}${DOT(8, 13.2)}`),
};
/** Icons of the rows of fields. */
const ROW_ICON = {
  rot: SVG('<path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M11.8 1.8v2.8H9"/>'),
  count: SVG('<path d="M5.5 2.5 4.5 13.5M11.5 2.5l-1 11M2.5 5.5h11M2 10.5h11"/>'),
  size: SVG('<path d="M2 5.5h12M2 3.5v4M14 3.5v4M10.5 14V2M8.5 2h4M8.5 14h4" stroke-width="1.1"/>'),
  centre: SVG('<circle cx="8" cy="8" r="5"/><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3"/>'),
  pos: SVG('<path d="M3 13V3M3 13h10M3 13l6-6" /><path d="M1.6 4.4 3 3l1.4 1.4M11.6 11.6 13 13l-1.4 1.4M9 4.6V7H6.6"/>'),
  start: SVG(`<path d="M5 8h9" stroke-dasharray="1.6 1.6"/><circle cx="4" cy="8" r="2.4"/>`),
  end: SVG(`<path d="M2 8h9" stroke-dasharray="1.6 1.6"/>${DOT(12, 8, 2.4)}`),
};

/**
 * Icons of the ways of spacing (after DIALux; black squares): in a frame for a grid, on a segment
 * with ticks for a line.
 */
function wayIcon(way, line) {
  const xs = way === 'in' ? [11, 25] : way === 'edge' ? [8.5, 18, 27.5] : [6, 18, 30];
  const frame = line ? '<path d="M6 9H30M6 5v8M30 5v8" fill="none" stroke="currentColor" stroke-width="1"/>' : '<rect x="6" y="3.5" width="24" height="11" fill="none" stroke="currentColor" stroke-width="1"/>';
  return `<svg width="36" height="18" viewBox="0 0 36 18" aria-hidden="true">${frame}${xs.map((x) => `<rect x="${x - 2.5}" y="7" width="5" height="4" fill="currentColor"/>`).join('')}</svg>`;
}
const MEASURE_ICON = {
  r: SVG('<circle cx="8" cy="8" r="6" stroke-dasharray="2 1.6" stroke-width="1"/><path d="M8 8h6" stroke-width="1.6"/>' + DOT(8, 8, 1.2)),
  d: SVG('<circle cx="8" cy="8" r="6" stroke-dasharray="2 1.6" stroke-width="1"/><path d="M2 8h12" stroke-width="1.6"/>'),
  p: SVG('<circle cx="8" cy="8" r="6" stroke-width="1.8"/>'),
};
const FIT_ICON = SVG('<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/><rect x="5.5" y="5.5" width="5" height="5" rx="0.5" stroke-width="1"/>');

/** The buttons of the placement kinds: single, grid, line, circle; the one being drawn is pressed. */
export function renderKinds(host, kind, drawing, off = false) {
  host.innerHTML = ['auto', 'single', 'grid', 'line', 'circle'].map((k) => {
    const on = drawing && k === kind;
    return `<button type="button" data-kind="${k}" aria-pressed="${on}" class="tipl${on ? ' on' : ''}"${off ? ` disabled data-tip="${esc(t('lum.kindOff'))}"` : ` data-tip="${esc(t(`lum.kind.${k}`))}"`} aria-label="${esc(t(`lum.kind.${k}`))}">${KIND_ICON[k]}</button>`;
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
  let measure = 'r'; // the measure of a circle shown: radius, diameter or length
  const shown = (x) => (x == null || !Number.isFinite(x) ? '' : formatNumber(x, 6));

  function build() {
    inputs = {}; fields = {};
    // the fields of the selected group only (21 Nov 2026); nothing selected: no fields
    if (!g) { host.innerHTML = ''; return; }
    ctx = { ...ctx, measure };
    const rows = rowsOf(g.kind);
    const v = fieldValues(g, ctx);
    if (ctx.blank) for (const k of ctx.blank) v[k] = NaN;
    const parts = [];
    for (const r of rows) {
      const cells = r.fields.map((f) => {
        fields[f.key] = f;
        const unit = f.unit === '°' ? '°' : f.unit === 'pcs' ? t('unit.pcs') : t('unit.m');
        const ax = f.key === 'sz' ? { r: 'R', d: 'D', p: 'P' }[measure] : f.ax;
        if (f.off) return `<div class="gf off" data-k="${f.key}" title="${esc(t('gform.tip.tilt'))}"><span class="gax">${esc(ax)}</span><input id="in-g-${f.key}" value="0" disabled aria-label="${esc(t('gform.tip.tilt'))}"><span class="gu">${unit}</span></div>`;
        return `<div class="gf" data-k="${f.key}"><span class="gax">${esc(ax)}</span><span class="spin"><button type="button" tabindex="-1" data-d="1" aria-label="${esc(t('form.more'))}">${UP}</button><button type="button" tabindex="-1" data-d="-1" aria-label="${esc(t('form.less'))}">${DOWN}</button></span><input id="in-g-${f.key}" inputmode="decimal" autocomplete="off" spellcheck="false" value="${esc(shown(v[f.key]))}" aria-label="${esc(t(`gform.tip.${r.tip}`) + ': ' + ax)}"><span class="gu">${esc(unit)}</span></div>`;
      }).join('');
      const tip = t(`gform.tip.${r.tip}`);
      parts.push(`<div class="grow"><span class="gic" title="${esc(tip)}">${r.icon ? ROW_ICON[r.icon] : ''}</span><div class="gcells">${cells}${extraOf(r.extra)}</div></div>`);
    }
    if (gridOverRoom(g, ctx.L, ctx.W)) parts.push(`<div class="gpick"><button type="button" class="gschipb sm" data-pick="1" data-tip="${esc(t('lum.pickTip'))}">${esc(t('lum.pick'))}</button></div>`);
    parts.push('<div class="ferr gerr" role="alert" hidden></div>');
    host.innerHTML = parts.join('');
    for (const k of Object.keys(fields)) inputs[k] = host.querySelector(`#in-g-${k}`);
  }
  /** The extra control of a row: the ways of spacing, "fit to the room", the measure of a circle. */
  function extraOf(x) {
    if (x === 'mx' || x === 'my' || x === 'm') {
      const cur = g[x] ?? (x === 'm' ? 'axis' : 'in'), n = x === 'mx' ? g.nx : x === 'my' ? g.ny : g.n;
      return `<div class="gways" role="group">${['in', 'edge', 'axis'].map((w) => {
        const off = n < 2 && w !== 'in' && !(x === 'm' && w === 'axis');
        const tip = t(`gform.way.${x === 'm' ? 'line' : 'grid'}.${w}`);
        return `<button type="button" class="tipl${w === cur ? ' on' : ''}" data-way="${x}:${w}"${off ? ' disabled' : ''} data-tip="${esc(tip)}" aria-label="${esc(tip)}" aria-pressed="${w === cur}">${wayIcon(w, x === 'm')}</button>`;
      }).join('')}</div>`;
    }
    if (x === 'fit') return `<button type="button" class="gfit tipl" data-fit="1" data-tip="${esc(t('gform.tip.fit'))}" aria-label="${esc(t('gform.tip.fit'))}">${FIT_ICON}</button>`;
    if (x === 'measure') {
      return `<div class="gways" role="group">${MEASURES.map((m) => `<button type="button" class="tipl${m === measure ? ' on' : ''}" data-measure="${m}" data-tip="${esc(t(`gform.measure.${m}`))}" aria-label="${esc(t(`gform.measure.${m}`))}" aria-pressed="${m === measure}">${MEASURE_ICON[m]}</button>`).join('')}</div>`;
    }
    return '';
  }
  const raw = () => Object.fromEntries(Object.entries(inputs).filter(([k]) => !fields[k]?.off).map(([k, el]) => [k, el.value]));
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
    const w = e.target.closest('[data-way]');
    if (w && g && !w.disabled) {
      const [k, way] = w.dataset.way.split(':');
      const def = k === 'm' ? 'axis' : 'in', next = { ...g };
      if (way === def) delete next[k]; else next[k] = way;
      g = next; onChange({ group: next }); build(); return;
    }
    if (e.target.closest('[data-fit]') && g) {
      const { area: _, ...next } = g;
      g = next; onChange({ group: next }); build(); return;
    }
    const ms = e.target.closest('[data-measure]');
    if (ms) { measure = ms.dataset.measure; build(); return; }
    if (e.target.closest('[data-pick]') && g) { onChange({ pick: g }); return; }
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
