// Luminaire types and groups in the form (stage 2.1): the list of types (letter, colour, name,
// count), the list of groups and the fields of the selected group. Browser only; the pure part is
// js/groupform.js (fields, validation) and js/model.js (the edits).

import { GROUP_FIELDS, groupFieldValues, validateGroup } from './groupform.js';
import { groupCount } from './groups.js';
import { typeLetter } from './model.js';
import { stepValue, parseNumber, toDecimal, formatNumber } from './ui.js';
import { t, decimal } from './i18n.js';

/** Colours of the types on the plan and in the lists (A, B, C…; repeated after eight). */
export const TYPE_COLORS = Object.freeze(['#e8590c', '#1971c2', '#2f9e44', '#9c36b5', '#c2255c', '#0c8599', '#e67700', '#5f3dc4']);
export const typeColor = (k) => TYPE_COLORS[k % TYPE_COLORS.length];

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

/** Mark of a type: its letter on its colour. */
export const typeMark = (k) => `<span class="tymark" style="--ty:${typeColor(k)}">${typeLetter(k)}</span>`;

/**
 * The list of types: a button per type (selected one pressed) with its luminaire count, and a
 * button to add one.
 * @param {(ty, k) => string} nameOf
 */
export function renderTypes(host, m, selected, nameOf) {
  const counts = new Map(m.types.map((ty) => [ty.id, 0]));
  for (const g of m.groups) counts.set(g.type, (counts.get(g.type) ?? 0) + groupCount(g));
  host.innerHTML = m.types.map((ty, k) => {
    const on = ty.id === selected, used = m.groups.some((g) => g.type === ty.id);
    const del = m.types.length > 1
      ? `<button type="button" class="tydel" data-deltype="${ty.id}"${used ? ` disabled title="${esc(t('lum.typeUsed'))}"` : ` title="${esc(t('lum.typeDel'))}"`} aria-label="${esc(t('lum.typeDelAria', { name: nameOf(ty, k) }))}">×</button>` : '';
    return `<div class="tyitem${on ? ' on' : ''}"><button type="button" class="tybtn" data-type="${ty.id}" aria-pressed="${on}">${typeMark(k)}<span class="tyname">${esc(nameOf(ty, k))}</span><span class="tycount">${counts.get(ty.id)}</span></button>${del}</div>`;
  }).join('') + `<button type="button" class="gschipb sm tyadd" data-addtype="1">+ ${esc(t('lum.typeAdd'))}</button>`;
}

const KIND_ICON = {
  grid: '<svg viewBox="0 0 16 16" aria-hidden="true"><g fill="currentColor"><circle cx="4" cy="4" r="1.6"/><circle cx="12" cy="4" r="1.6"/><circle cx="4" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/></g></svg>',
  line: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 8h13" stroke="currentColor" stroke-width="1" fill="none"/><g fill="currentColor"><circle cx="3" cy="8" r="1.6"/><circle cx="8" cy="8" r="1.6"/><circle cx="13" cy="8" r="1.6"/></g></svg>',
  lines: '<svg viewBox="0 0 16 16" aria-hidden="true"><g fill="currentColor"><circle cx="3" cy="4.5" r="1.4"/><circle cx="8" cy="4.5" r="1.4"/><circle cx="13" cy="4.5" r="1.4"/><circle cx="3" cy="11.5" r="1.4"/><circle cx="8" cy="11.5" r="1.4"/><circle cx="13" cy="11.5" r="1.4"/></g></svg>',
  circle: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1" fill="none"/><g fill="currentColor"><circle cx="13" cy="8" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="13" r="1.5"/></g></svg>',
  single: '<svg viewBox="0 0 16 16" aria-hidden="true"><g fill="currentColor"><circle cx="5" cy="6" r="1.8"/><circle cx="11.5" cy="10.5" r="1.8"/></g></svg>',
};
export const kindIcon = (kind) => `<span class="gricon">${KIND_ICON[kind] ?? ''}</span>`;

/** Short description of a group for its row: "Grid 3 × 2", "Line · 4", "Circle · 8", "Single · 2". */
export function groupLabel(g) {
  const n = groupCount(g);
  if (g.kind === 'grid') return t('lum.kindGrid', { nx: g.nx, ny: g.ny });
  return `${t(`lum.kind.${g.kind}`)} · ${n}`;
}

/**
 * The list of groups: a row per group (icon, label, type mark, count; selected one pressed),
 * the actions of the selected group and the buttons that add a group of a kind.
 * @param {Map<string, number>} errorsOf — group id → number of placement errors
 */
export function renderGroups(host, m, selected, errorsOf = new Map()) {
  const kOf = new Map(m.types.map((ty, k) => [ty.id, k]));
  const rows = m.groups.map((g) => {
    const on = g.id === selected, bad = errorsOf.get(g.id) || 0;
    return `<button type="button" class="gritem${on ? ' on' : ''}${bad ? ' bad' : ''}" data-group="${g.id}" aria-pressed="${on}"${bad ? ` title="${esc(t('lum.groupBad'))}"` : ''}>${kindIcon(g.kind)}<span class="grlabel">${esc(groupLabel(g))}</span>${typeMark(kOf.get(g.type) ?? 0)}</button>`;
  }).join('');
  const sel = m.groups.find((g) => g.id === selected);
  const act = (a, label, dis = false, title = '') => `<button type="button" class="gschipb sm" data-act="${a}"${dis ? ' disabled' : ''}${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</button>`;
  const actions = sel ? `<div class="gracts">${act('dup', t('lum.dup'))}${act('ungroup', t('lum.ungroup'), sel.kind === 'single', t('lum.ungroupTip'))}${act('del', t('lum.del'), m.groups.length < 2)}</div>` : '';
  const add = `<div class="gradd"><span>${esc(t('lum.add'))}</span>${['grid', 'line', 'lines', 'circle', 'single'].map((k) =>
    `<button type="button" class="gschipb sm" data-add="${k}" title="${esc(t(`lum.kind.${k}`))}" aria-label="${esc(t('lum.addAria', { kind: t(`lum.kind.${k}`) }))}">${kindIcon(k)}</button>`).join('')}</div>`;
  host.innerHTML = `<div class="grlist">${rows}</div>${actions}${add}`;
}

const UP = '<svg viewBox="0 0 8 5" width="8" height="5" aria-hidden="true"><path d="M0 5 4 0 8 5z" fill="currentColor"/></svg>';
const DOWN = '<svg viewBox="0 0 8 5" width="8" height="5" aria-hidden="true"><path d="M0 0h8L4 5z" fill="currentColor"/></svg>';

/**
 * The fields of the selected group, rebuilt for its kind on load(); on every valid change
 * onChange(group) gets the edited group.
 * @returns {{ load(g, ctx), group(): object|null, errors(): Record<string,string> }}
 *   ctx = { H, others, at } (groupform.validateGroup); `at` — the point of a single group
 */
export function initGroupForm(host, onChange) {
  let g = null, ctx = null, inputs = {}, choice = {}, timer = 0, lastErrors = {};

  const unitText = (u) => (u === 'm' ? t('unit.m') : u === 'pcs' ? t('unit.pcs') : u);
  const shown = (x) => (x == null ? '' : formatNumber(x, 6));

  function build() {
    inputs = {}; choice = {};
    if (!g) { host.innerHTML = ''; return; }
    const v = groupFieldValues(g, ctx.at);
    const parts = [];
    if (g.kind === 'single') {
      const n = g.points.length, at = Math.min(ctx.at ?? 0, n - 1);
      parts.push(`<div class="gpoint"><button type="button" class="gschipb sm" data-pt="-1"${at <= 0 ? ' disabled' : ''} aria-label="${esc(t('lum.prevLum'))}">‹</button><span>${esc(t('lum.lumOf', { k: at + 1, n }))}</span><button type="button" class="gschipb sm" data-pt="1"${at >= n - 1 ? ' disabled' : ''} aria-label="${esc(t('lum.nextLum'))}">›</button>
        <button type="button" class="gschipb sm" data-pt="add">+ ${esc(t('lum.addPoint'))}</button><button type="button" class="gschipb sm" data-pt="del"${n < 2 ? ' disabled' : ''}>${esc(t('lum.delPoint'))}</button></div>`);
    }
    let sub = '';
    for (const f of GROUP_FIELDS[g.kind]) {
      // sub-headings: the area of a grid
      if (f.key === 'ax0') { sub = 'area'; parts.push(`<div class="fsub wide">${esc(t('gform.area'))}<small>${esc(t('gform.areaNote'))}</small></div>`); }
      if (f.choice) {
        choice[f.key] = v[f.key] ?? f.choice[0];
        parts.push(`<div class="fld wide gchoice" data-k="${f.key}"><span class="fl"><span class="t">${esc(t(`gform.${f.key}`))}</span></span><div class="seg" role="group">${f.choice.map((c) =>
          `<button type="button" data-c="${c}" aria-pressed="${choice[f.key] === c}">${esc(t(`gform.${f.key}_${c}`))}</button>`).join('')}</div></div>`);
        continue;
      }
      const ph = f.optional && sub === 'area' ? ` placeholder="${esc(shown({ ax0: 0, ay0: 0, ax1: ctx.L, ay1: ctx.W }[f.key]))}"` : '';
      parts.push(`<div class="fld" id="w-g-${f.key}" data-k="${f.key}"><label class="fl" for="in-g-${f.key}"><span class="t">${esc(t(`gform.${f.key}`))}</span></label>
        <div class="ibox"><span class="spin"><button type="button" tabindex="-1" data-d="1" aria-label="${esc(t('form.more'))}">${UP}</button><button type="button" tabindex="-1" data-d="-1" aria-label="${esc(t('form.less'))}">${DOWN}</button></span><input id="in-g-${f.key}" inputmode="decimal" autocomplete="off" spellcheck="false" value="${esc(shown(v[f.key]))}"${ph} aria-describedby="err-g-${f.key}"><span class="unit">${esc(unitText(f.unit))}</span></div>
        <span class="ferr" id="err-g-${f.key}" role="alert" hidden></span></div>`);
    }
    host.innerHTML = `<div class="fgrid gfields" style="--cols:2">${parts.join('')}</div>`;
    for (const f of GROUP_FIELDS[g.kind]) if (!f.choice) inputs[f.key] = host.querySelector(`#in-g-${f.key}`);
    showWhen();
  }

  function raw() {
    const r = { ...choice };
    for (const [k, el] of Object.entries(inputs)) r[k] = el.value;
    return r;
  }
  function showWhen() {
    const v = { ...choice };
    for (const f of GROUP_FIELDS[g.kind]) {
      if (!f.when) continue;
      const el = host.querySelector(`[data-k="${f.key}"]`);
      if (el) el.hidden = !f.when(v);
    }
  }
  function check() {
    if (!g) return;
    const r = validateGroup(g, raw(), ctx);
    lastErrors = r.errors;
    for (const [k, el] of Object.entries(inputs)) {
      const e = r.errors[k] || '', box = el.closest('.fld'), fe = box.querySelector('.ferr');
      fe.textContent = e; fe.hidden = !e; box.classList.toggle('bad', !!e); el.toggleAttribute('aria-invalid', !!e);
    }
    if (r.ok) { g = r.group; onChange(r.group); }
  }

  // the room form around listens to input and change too: these fields are not its own
  host.addEventListener('input', (e) => {
    e.stopPropagation();
    const el = e.target;
    if (el.tagName === 'INPUT' && el.value.includes(decimal() === ',' ? '.' : ',')) {
      const at = el.selectionStart; el.value = toDecimal(el.value); if (at != null) el.setSelectionRange(at, at);
    }
    clearTimeout(timer); timer = setTimeout(check, 200);
  });
  host.addEventListener('change', (e) => { e.stopPropagation(); clearTimeout(timer); check(); });
  host.addEventListener('keydown', (e) => {
    if (e.target.tagName !== 'INPUT' || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault(); bump(e.target.closest('.fld').dataset.k, e.key === 'ArrowUp' ? 1 : -1);
  });
  host.addEventListener('click', (e) => {
    const s = e.target.closest('.spin button');
    if (s) { bump(s.closest('.fld').dataset.k, Number(s.dataset.d)); return; }
    const c = e.target.closest('.gchoice button');
    if (c) {
      const k = c.closest('.gchoice').dataset.k;
      choice[k] = c.dataset.c;
      for (const b of c.parentElement.children) b.setAttribute('aria-pressed', String(b === c));
      showWhen(); check(); return;
    }
    const p = e.target.closest('[data-pt]');
    if (p && g?.kind === 'single') {
      const n = g.points.length, at = Math.min(ctx.at ?? 0, n - 1);
      if (p.dataset.pt === 'add') {
        const q = g.points[at];
        g = { ...g, points: [...g.points, { ...q, x: q.x + 0.5 }] };
        ctx = { ...ctx, at: g.points.length - 1 };
        onChange(g, { at: ctx.at });
      } else if (p.dataset.pt === 'del') {
        if (n < 2) return;
        g = { ...g, points: g.points.filter((_, k) => k !== at) };
        ctx = { ...ctx, at: Math.max(0, at - 1) };
        onChange(g, { at: ctx.at });
      } else {
        ctx = { ...ctx, at: Math.max(0, Math.min(n - 1, at + Number(p.dataset.pt))) };
        onChange(g, { at: ctx.at });
      }
      build();
    }
  });
  function bump(k, dir) {
    const f = GROUP_FIELDS[g.kind].find((x) => x.key === k), el = inputs[k];
    if (!f || !el) return;
    const p = { ...f, def: 0, max: typeof f.max === 'function' ? f.max(ctx) : f.max };
    const x = parseNumber(el.value);
    if (f.optional && !Number.isFinite(x)) el.value = shown({ ax0: 0, ay0: 0, ax1: ctx.L, ay1: ctx.W }[k] ?? 0);
    else el.value = shown(stepValue(p, x, dir));
    clearTimeout(timer); check();
  }

  return {
    /** Shows the group (rebuilds the fields). */
    load(group, c) { g = group; ctx = { at: 0, ...c }; lastErrors = {}; build(); },
    /** The context changed (room height, other groups): the values are checked again. */
    context(c) { ctx = { ...ctx, ...c }; if (g) check(); },
    group: () => g,
    errors: () => lastErrors,
  };
}
