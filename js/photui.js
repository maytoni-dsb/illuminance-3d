// Photometric file in the form: picker, drag and drop, luminaire card and polar diagram.
// lidcCurves is pure (tested in Node); initPhotFile touches the DOM and runs in the browser only.
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
 * Polar curves of the intensity distribution in cd/klm for the planes C0–C180 and C90–C270
 * (C0 and C90 to the right, C180 and C270 to the left, γ = 0 straight down).
 * @param {import('./photometry.js').Photometry} phot
 * @param {number} R — radius of the outer ring, px
 * @returns {{ c0: string, c90: string, max: number, rings: number[] }} SVG paths (centre 0, 0)
 *   and the ring values, cd/klm (the outer one is `max`)
 */
export function lidcCurves(phot, R) {
  const k = 1000 / phot.flux;
  let peak = 0;
  for (let C = 0; C < 360; C += 5) for (let g = 0; g <= 180; g += 1) peak = Math.max(peak, phot.intensity(C * DEG, g * DEG) * k);
  const max = niceCeil(peak);
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
  return { c0: curve(0), c90: curve(90), max, rings: [0.25, 0.5, 0.75, 1].map((f) => f * max) };
}
function niceCeil(x) {
  if (!(x > 0)) return 1;
  const e = 10 ** Math.floor(Math.log10(x));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * e >= x) return m * e;
  return 10 * e;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (x, d = 0) => Number(x.toFixed(d)).toLocaleString('ru-RU');
const SYM = { rot: 'симметрия вращения', quad: 'симметрия к C0–C180 и C90–C270', half0: 'симметрия к C0–C180', half90: 'симметрия к C90–C270', none: 'без симметрии' };

/** Simple hash of the text, so the calculation can tell files apart without comparing tables. */
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

/**
 * Builds the file block inside `host` and reports every change.
 * @param {HTMLElement} host
 * @param {HTMLElement} dropZone — element that accepts dropped files (the form card)
 * @param {(f: null | { table, phot, shape, key, name }) => void} onChange
 * @returns {{ current: () => (null | { table, phot, shape, key, name }) }}
 */
export function initPhotFile(host, dropZone, onChange) {
  host.innerHTML = `
    <div class="pfpick">
      <label class="gschipb pfbtn"><input type="file" accept=".ies,.ldt,.IES,.LDT" hidden>Выбрать файл IES или LDT</label>
      <span class="pfhint">или перетащите файл на форму</span>
    </div>
    <div class="pferr" role="alert" hidden></div>
    <div class="pfcard" hidden></div>`;
  const input = host.querySelector('input');
  const err = host.querySelector('.pferr');
  const card = host.querySelector('.pfcard');
  let current = null;

  function show(f) {
    const t = f.table, p = f.phot;
    const rated = t.ratedFlux;
    const dims = (s) => (s.round ? `⌀ ${num(s.length * 1000)}` : `${num(s.length * 1000)} × ${num(s.width * 1000)}`) + (s.height ? ` × ${num(s.height * 1000)}` : '') + ' мм';
    const { c0, c90, max, rings } = lidcCurves(p, 70);
    const svg = `<svg class="pfpolar" viewBox="-84 -84 168 168" role="img" aria-label="Кривая силы света">
      ${rings.map((v) => `<circle r="${(v / max * 70).toFixed(1)}" class="ring"/>`).join('')}
      <line x1="-76" y1="0" x2="76" y2="0" class="ring"/><line x1="0" y1="-76" x2="0" y2="76" class="ring"/>
      <path d="${c90}" class="c90"/><path d="${c0}" class="c0"/>
      <text x="2" y="${(70 + 10).toFixed(0)}" class="lbl">${num(max)}</text>
      <text x="-80" y="-74" class="lbl">C180</text><text x="80" y="-74" class="lbl" text-anchor="end">C0</text></svg>`;
    card.innerHTML = `
      <div class="pfname">${esc(t.name || f.name)}${t.catalog ? ` <span>${esc(t.catalog)}</span>` : ''}</div>
      <div class="pfgrid">
        <div class="gstech">
          ${t.manufacturer ? `<div class="gstrow"><span>Производитель</span><b>${esc(t.manufacturer)}</b></div>` : ''}
          <div class="gstrow"><span>Файл</span><b>${esc(f.name)} · ${t.format === 'ies' ? esc(t.version.replace(/^IESNA:\s*/i, '')) : 'EULUMDAT'}</b></div>
          <div class="gstrow"><span>Поток светильника</span><b>${num(p.flux)} лм</b></div>
          ${rated ? `<div class="gstrow"><span>в файле</span><b>${num(rated)} лм (${(100 * (p.flux / rated - 1)).toFixed(2).replace('.', ',')} %)</b></div>` : ''}
          ${t.power ? `<div class="gstrow"><span>Мощность</span><b>${num(t.power, 1)} Вт · ${num(p.flux / t.power)} лм/Вт</b></div>` : ''}
          <div class="gstrow"><span>Вниз / вверх</span><b>${num(100 * p.fluxDown / p.flux)} / ${num(100 * p.fluxUp / p.flux)} %</b></div>
          <div class="gstrow"><span>${t.format === 'ies' ? 'Светящий проём' : 'Светящая часть'}</span><b>${dims(t.luminous)}</b></div>
          ${t.format === 'ldt' ? `<div class="gstrow"><span>Корпус</span><b>${dims(t.luminaire)}</b></div>` : ''}
          <div class="gstrow"><span>КСС</span><b>${SYM[t.sym]}; ${t.C.length} × ${t.gamma.length}</b></div>
        </div>
        <figure class="pffig">${svg}<figcaption><i class="sw c0"></i>C0–C180 <i class="sw c90"></i>C90–C270, кд/клм</figcaption></figure>
      </div>
      ${t.warnings.length ? `<ul class="pfwarn">${t.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
    card.hidden = false;
  }

  function load(text, name, { store = true } = {}) {
    try {
      const table = parsePhotometryFile(text, name);
      const phot = createPhotometry({ type: 'file', table });
      current = { table, phot, shape: luminaireShape(table), key: `${name}|${text.length}|${hash(text)}`, name };
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

  async function readFile(file) {
    if (!file) return;
    if (!/\.(ies|ldt)$/i.test(file.name)) { err.textContent = `${file.name}: нужен файл .ies или .ldt`; err.hidden = false; return; }
    if (file.size > MAX_BYTES) { err.textContent = `${file.name}: файл больше 5 МБ`; err.hidden = false; return; }
    load(decodeBytes(await file.arrayBuffer()), file.name);
  }
  input.addEventListener('change', () => { readFile(input.files[0]); input.value = ''; });
  dropZone.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); dropZone.classList.add('dropping'); } });
  dropZone.addEventListener('dragleave', (e) => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('dropping'); });
  dropZone.addEventListener('drop', (e) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault(); dropZone.classList.remove('dropping');
    readFile(e.dataTransfer.files[0]);
  });

  // the last file of this browser (a convenience: works without it)
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved?.text) load(saved.text, saved.name, { store: false });
  } catch (e) { /* storage unavailable */ }

  return { current: () => current, load };
}
