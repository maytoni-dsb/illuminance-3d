// Photometric file in the form: drop zone, luminaire description, compact polar diagram and the
// choice of the lamp set of an LDT file.
// lidcCurves and describeLuminaire are pure (tested in Node); initPhotFile touches the DOM.
// Labels and messages come from the dictionaries (phot.*).

import { parsePhotometryFile, luminaireShape } from './photfile.js';
import { createPhotometry } from './photometry.js';
import { t, formatNumber } from './i18n.js';

const DEG = Math.PI / 180;
const STORE_KEY = 'photfile';
const MAX_BYTES = 5 * 1024 * 1024;

/** Text of a file: UTF-8 when valid, otherwise Windows-1252 (common in LDT and IES files). */
export function decodeBytes(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); }
}

/**
 * Polar curves of the intensity distribution, normalised to the peak, for the planes C0–C180 and
 * C90–C270 (C0 and C90 to the right, γ = 0 straight down), and the grid: rings and the γ lines
 * every 30°.
 * @param {import('./photometry.js').Photometry} phot
 * @param {number} R — radius of the outer ring, px
 * @returns {{ c0: string, c90: string, max: number, rings: number[], spokes: string }} SVG paths
 *   around (0, 0); max — the peak in cd/klm (outer ring); rings — ring radii, px
 */
export function lidcCurves(phot, R) {
  const k = 1000 / phot.flux;
  let peak = 0;
  for (let C = 0; C < 360; C += 5) for (let g = 0; g <= 180; g += 1) peak = Math.max(peak, phot.intensity(C * DEG, g * DEG) * k);
  const max = peak > 0 ? peak : 1;
  const curve = (cRight) => {
    const cLeft = (cRight + 180) % 360;
    const pts = [];
    for (let g = 0; g <= 180; g += 1) pts.push([g, cRight]);
    for (let g = 180; g >= 0; g -= 1) pts.push([g, cLeft]);
    return pts.map(([g, C], i) => {
      const r = phot.intensity(C * DEG, g * DEG) * k / max * R;
      const x = (C === cRight ? 1 : -1) * r * Math.sin(g * DEG), y = r * Math.cos(g * DEG);
      return `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join('') + 'Z';
  };
  let spokes = '';
  for (let g = 0; g <= 180; g += 30) {
    for (const side of g === 0 || g === 180 ? [1] : [1, -1]) {
      spokes += `M0 0L${(side * R * Math.sin(g * DEG)).toFixed(2)} ${(R * Math.cos(g * DEG)).toFixed(2)}`;
    }
  }
  return { c0: curve(0), c90: curve(90), max, rings: [R / 3, 2 * R / 3, R], spokes };
}

/** "0,5 × 0,04 × 0,06 m" or "⌀0,076 × 0,099 m" (length × width × height of the housing), in the language. */
export function sizeText(table) {
  const s = table.luminaire;
  const m = (x) => formatNumber(x, 3);
  if (!(s.length > 0)) return '';
  const h = s.height > 0 ? ` × ${m(s.height)}` : '';
  return (s.round ? `⌀${m(s.length)}` : `${m(s.length)} × ${m(s.width)}`) + `${h} ${t('unit.m')}`;
}

/**
 * What the form takes from a file: the luminaire flux, the colour temperature and the power of a
 * lamp set. The flux is the flux of the intensity table (cd/klm × the lamp flux of the set), not
 * Φ_lamps · LORL: some files state LORL = 1 instead of 100 while their table is right.
 * @param {import('./photfile.js').PhotTable} t
 * @param {number} [set] — lamp set index (LDT)
 * @returns {{ flux:number, cct:number|null, power:number|null }}
 */
export function setValues(t, tableFlux, set = 0) {
  const ls = t.lampSets?.[set];
  if (ls) return { flux: Math.round(tableFlux * ls.flux / t.lampSets[0].flux), cct: ls.cct, power: ls.power };
  return { flux: Math.round(tableFlux), cct: t.cct, power: t.power };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Simple hash of the text, so the calculation can tell files apart without comparing tables. */
/** Key of a file for the calculation caches (the same for the page and the report). */
export const fileKey = (name, text) => `${name}|${text.length}|${hash(text)}`;

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

function polarSvg(phot) {
  const R = 52;
  const { c0, c90, rings, spokes } = lidcCurves(phot, R);
  return `<svg class="pfpolar" viewBox="-56 -56 112 112" role="img" aria-label="${t('phot.polar')}">
    ${rings.map((r) => `<circle r="${r.toFixed(1)}" class="ring"/>`).join('')}<path d="${spokes}" class="ring"/>
    <path d="${c90}" class="c90"/><path d="${c0}" class="c0"/></svg>`;
}

/**
 * Builds the photometry block: the drop zone in `zone`, the luminaire description in `card`.
 * @param {{ zone: HTMLElement, card: HTMLElement, sets: HTMLElement, dropTarget: HTMLElement }} el
 * @param {(f: null | { table, phot, shape, key, name, set, values, reason }) => void} onChange
 *   called with the file (and the values of its lamp set for the form) or null when removed;
 *   reason: 'load' (a new file), 'restore' (the file kept in this browser), 'set' (another lamp set)
 */
export function initPhotFile(el, onChange, opts = {}) {
  el.zone.innerHTML = `
    <div class="pfdrop" role="button" tabindex="0" aria-label="${t('phot.choose')}">
      <input type="file" accept=".ies,.ldt,.IES,.LDT" hidden>
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13V4M6.5 7.5 10 4l3.5 3.5"/><path d="M4 12.5v3h12v-3"/></svg>
      <span class="pft"><b>${t('phot.drop')}</b><span>${t('phot.click')}</span></span>
      <button type="button" class="pfclear" aria-label="${t('phot.remove')}" title="${t('phot.remove')}" hidden>×</button>
    </div>
    <div class="pferr" role="alert" hidden></div>`;
  const input = el.zone.querySelector('input');
  const drop = el.zone.querySelector('.pfdrop');
  const title = drop.querySelector('.pft b'), sub = drop.querySelector('.pft span');
  const clearBtn = drop.querySelector('.pfclear');
  const err = el.zone.querySelector('.pferr');
  const fileRow = { set hidden(h) {
    title.textContent = h ? t('phot.drop') : current?.name ?? '';
    sub.textContent = h ? t('phot.click') : t('phot.replace');
    clearBtn.hidden = h;
  } };
  drop.addEventListener('click', (e) => { if (!e.target.closest('.pfclear')) input.click(); });
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  let current = null;

  function showCosine() {
    const p = createPhotometry({ type: 'cosine', flux: 1000 });
    el.card.innerHTML = `<div class="pfdesc"><div class="pfl1">${t('phot.none')}</div><div class="pfl2">${t('phot.cosine')}</div></div>${polarSvg(p)}`;
    el.sets.innerHTML = ''; el.sets.hidden = true;
  }
  function show(f) {
    const tb = f.table;
    // manufacturer at the top, name and article together, sizes at the bottom: as high as the polar diagram
    const mid = [tb.name, tb.catalog].filter((x) => x && x.trim());
    el.card.innerHTML = `<div class="pfdesc"><div class="pfl1">${esc(tb.manufacturer?.trim() || ' ')}</div>
      <div class="pfmid">${mid.map((x, i) => `<div class="pfl${i ? 3 : 2}">${esc(x)}</div>`).join('')}</div>
      <div class="pfl3">${sizeText(tb) || ' '}</div>
      ${tb.warnings.length ? `<ul class="pfwarn">${tb.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}</div>${polarSvg(f.phot)}`;
    const sets = tb.lampSets ?? [];
    el.sets.hidden = sets.length < 2;
    el.sets.innerHTML = sets.length < 2 ? '' : `<label class="fl" for="lampset"><span class="t">${t('phot.source')}</span></label>
      <select id="lampset">${sets.map((s, i) => `<option value="${i}"${i === f.set ? ' selected' : ''}>${esc(s.type || t('phot.set', { n: i + 1 }))} · ${s.flux} ${t('unit.lm')}${s.cct ? ` · ${s.cct} ${t('unit.K')}` : ''}${s.power ? ` · ${formatNumber(s.power, 3)} ${t('unit.W')}` : ''}</option>`).join('')}</select>`;
    el.sets.querySelector('select')?.addEventListener('change', (e) => {
      current = { ...current, set: Number(e.target.value), values: setValues(tb, current.phot.tableFlux, Number(e.target.value)), reason: 'set' };
      onChange(current);
    });
    fileRow.hidden = false;
  }

  function load(text, name, { store = true, reason = 'load', set = 0 } = {}) {
    try {
      const table = parsePhotometryFile(text, name);
      const phot = createPhotometry({ type: 'file', table });
      const k = Number.isInteger(set) && set > 0 && set < (table.lampSets?.length ?? 0) ? set : 0;
      current = { table, phot, shape: luminaireShape(table), key: fileKey(name, text), name, text, set: k, values: setValues(table, phot.tableFlux, k), reason };
      err.hidden = true;
      show(current);
      if (store && opts.restore !== false) { try { localStorage.setItem(STORE_KEY, JSON.stringify({ name, text })); } catch (e) { /* full or blocked */ } }
      onChange(current);
    } catch (e) {
      err.textContent = `${name}: ${e.message}`;
      err.hidden = false;
      console.error(e);
    }
  }
  function clear({ reason = 'clear' } = {}) {
    current = null;
    fileRow.hidden = true; err.hidden = true;
    if (opts.restore !== false) { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* storage unavailable */ } }
    showCosine();
    onChange(null, reason);
  }

  async function readFile(file) {
    if (!file) return;
    if (!/\.(ies|ldt)$/i.test(file.name)) { err.textContent = `${file.name}: ${t('phot.type')}`; err.hidden = false; return; }
    if (file.size > MAX_BYTES) { err.textContent = `${file.name}: ${t('phot.size')}`; err.hidden = false; return; }
    load(decodeBytes(await file.arrayBuffer()), file.name);
  }
  input.addEventListener('change', () => { readFile(input.files[0]); input.value = ''; });
  clearBtn.addEventListener('click', (e) => { e.stopPropagation(); clear(); });
  for (const t of [drop, el.dropTarget]) {
    t.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); drop.classList.add('dropping'); } });
    t.addEventListener('dragleave', (e) => { if (!t.contains(e.relatedTarget)) drop.classList.remove('dropping'); });
    t.addEventListener('drop', (e) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault(); e.stopPropagation(); drop.classList.remove('dropping');
      readFile(e.dataTransfer.files[0]);
    });
  }

  showCosine();
  // the last file of this browser (a convenience: works without it); off when the page keeps the
  // files itself (the project, stage 7)
  if (opts.restore !== false) try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved?.text) load(saved.text, saved.name, { store: false, reason: 'restore' });
  } catch (e) { /* storage unavailable */ }

  return { current: () => current, load, clear };
}
