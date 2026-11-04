// Photometric file in the form: drop zone, luminaire description, compact polar diagram and the
// choice of the lamp set of an LDT file.
// lidcCurves and describeLuminaire are pure (tested in Node); initPhotFile touches the DOM.
// Labels and messages are user-facing and therefore in Russian.

import { parsePhotometryFile, luminaireShape } from './photfile.js';
import { createPhotometry } from './photometry.js';

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

/** "0,5 × 0,04 × 0,06 м" or "⌀0,076 × 0,099 м" (length × width × height of the housing). */
export function sizeText(t) {
  const s = t.luminaire;
  const m = (x) => String(Number(x.toFixed(3))).replace('.', ',');
  if (!(s.length > 0)) return '';
  const h = s.height > 0 ? ` × ${m(s.height)}` : '';
  return (s.round ? `⌀${m(s.length)}` : `${m(s.length)} × ${m(s.width)}`) + `${h} м`;
}

/**
 * What the form takes from a file: the luminaire flux, the colour temperature and the power of a
 * lamp set (LDT: Φ_lamps · LORL; IES: the flux of the intensity table).
 * @param {import('./photfile.js').PhotTable} t
 * @param {number} [set] — lamp set index (LDT)
 * @returns {{ flux:number, cct:number|null, power:number|null }}
 */
export function setValues(t, tableFlux, set = 0) {
  const ls = t.lampSets?.[set];
  if (ls) return { flux: Math.round(ls.flux * t.lor), cct: ls.cct, power: ls.power };
  return { flux: Math.round(t.ratedFlux ?? tableFlux), cct: t.cct, power: t.power };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Simple hash of the text, so the calculation can tell files apart without comparing tables. */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

function polarSvg(phot) {
  const R = 52;
  const { c0, c90, rings, spokes } = lidcCurves(phot, R);
  return `<svg class="pfpolar" viewBox="-56 -56 112 112" role="img" aria-label="Кривая силы света: C0–C180 сплошная, C90–C270 пунктир">
    ${rings.map((r) => `<circle r="${r.toFixed(1)}" class="ring"/>`).join('')}<path d="${spokes}" class="ring"/>
    <path d="${c90}" class="c90"/><path d="${c0}" class="c0"/></svg>`;
}

/**
 * Builds the photometry block: the drop zone in `zone`, the luminaire description in `card`.
 * @param {{ zone: HTMLElement, card: HTMLElement, sets: HTMLElement, dropTarget: HTMLElement }} el
 * @param {(f: null | { table, phot, shape, key, name, set, values }) => void} onChange
 *   called with the file (and the values of its lamp set for the form) or null when removed
 */
export function initPhotFile(el, onChange) {
  el.zone.innerHTML = `
    <label class="pfdrop">
      <input type="file" accept=".ies,.ldt,.IES,.LDT" hidden>
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13V4M6.5 7.5 10 4l3.5 3.5"/><path d="M4 12.5v3h12v-3"/></svg>
      <span class="pftext">Перетащите файл IES или LDT сюда или <u>выберите</u></span>
    </label>
    <div class="pffile" hidden><span class="pfname"></span><button type="button" class="pfclear" aria-label="Убрать файл" title="Убрать файл">×</button></div>
    <div class="pferr" role="alert" hidden></div>`;
  const input = el.zone.querySelector('input');
  const drop = el.zone.querySelector('.pfdrop');
  const fileRow = el.zone.querySelector('.pffile');
  const err = el.zone.querySelector('.pferr');
  let current = null;

  function showCosine() {
    const p = createPhotometry({ type: 'cosine', flux: 1000 });
    el.card.innerHTML = `<div class="pfdesc"><div class="pfl1">Файл не загружен</div><div class="pfl2">Косинусная кривая силы света</div></div>${polarSvg(p)}`;
    el.sets.innerHTML = ''; el.sets.hidden = true;
  }
  function show(f) {
    const t = f.table;
    const lines = [t.manufacturer, t.name, t.catalog].filter((x) => x && x.trim());
    el.card.innerHTML = `<div class="pfdesc">${lines.map((x, i) => `<div class="pfl${Math.min(i + 1, 3)}">${esc(x)}</div>`).join('')}
      ${sizeText(t) ? `<div class="pfl3">${sizeText(t)}</div>` : ''}
      ${t.warnings.length ? `<ul class="pfwarn">${t.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}</div>${polarSvg(f.phot)}`;
    const sets = t.lampSets ?? [];
    el.sets.hidden = sets.length < 2;
    el.sets.innerHTML = sets.length < 2 ? '' : `<label class="fl" for="lampset"><span class="t">Источник света</span></label>
      <select id="lampset">${sets.map((s, i) => `<option value="${i}"${i === f.set ? ' selected' : ''}>${esc(s.type || `Набор ${i + 1}`)} · ${s.flux} лм${s.cct ? ` · ${s.cct} К` : ''}${s.power ? ` · ${String(s.power).replace('.', ',')} Вт` : ''}</option>`).join('')}</select>`;
    el.sets.querySelector('select')?.addEventListener('change', (e) => {
      current = { ...current, set: Number(e.target.value), values: setValues(t, current.phot.tableFlux, Number(e.target.value)) };
      onChange(current);
    });
    fileRow.querySelector('.pfname').textContent = f.name;
    fileRow.hidden = false;
  }

  function load(text, name, { store = true } = {}) {
    try {
      const table = parsePhotometryFile(text, name);
      const phot = createPhotometry({ type: 'file', table });
      current = { table, phot, shape: luminaireShape(table), key: `${name}|${text.length}|${hash(text)}`, name, set: 0, values: setValues(table, phot.tableFlux, 0) };
      err.hidden = true;
      show(current);
      if (store) { try { localStorage.setItem(STORE_KEY, JSON.stringify({ name, text })); } catch (e) { /* full or blocked */ } }
      onChange(current);
    } catch (e) {
      err.textContent = `${name}: ${e.message}`;
      err.hidden = false;
      console.error(e);
    }
  }
  function clear() {
    current = null;
    fileRow.hidden = true; err.hidden = true;
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* storage unavailable */ }
    showCosine();
    onChange(null);
  }

  async function readFile(file) {
    if (!file) return;
    if (!/\.(ies|ldt)$/i.test(file.name)) { err.textContent = `${file.name}: нужен файл .ies или .ldt`; err.hidden = false; return; }
    if (file.size > MAX_BYTES) { err.textContent = `${file.name}: файл больше 5 МБ`; err.hidden = false; return; }
    load(decodeBytes(await file.arrayBuffer()), file.name);
  }
  input.addEventListener('change', () => { readFile(input.files[0]); input.value = ''; });
  fileRow.querySelector('.pfclear').addEventListener('click', clear);
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
  // the last file of this browser (a convenience: works without it)
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved?.text) load(saved.text, saved.name, { store: false });
  } catch (e) { /* storage unavailable */ }

  return { current: () => current, load, clear };
}
