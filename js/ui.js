// Input form and value validation.
// validateParams and stepValue are pure functions (tested in Node); initForm touches the DOM
// and is only called from the browser.
// Labels and error messages are user-facing and therefore in Russian.

/**
 * Largest number of luminaires n_x · n_y: beyond it a recalculation takes many seconds (500 in a
 * 6 × 4 × 3 m room with a file: about 6 s), and such counts mean a wrong flux more often than a
 * real room (spec, accepted 5 Nov 2026).
 */
export const MAX_LUMINAIRES = 500;

import { ILLUMINANCE_SCALE } from './workplane.js';

/** Lowest mounting height, m: above the 0.8 m work plane (spec, "Входные параметры"). */
export const HM_MIN = 0.9;

/**
 * Height of the photometric centre above the floor for a mounting height h_m (accepted 5 Nov 2026,
 * as in DIALux): the luminaire is mounted by the centre of the top of its housing, so the centre is
 * the housing height lower. Without a file the housing height is 0.
 */
export const photometricHeight = (hm, housing = 0) => hm - housing;
/** Distance from the ceiling to the photometric centre, h_c of the calculation modules. */
export const ceilingDrop = (H, hm, housing = 0) => H - photometricHeight(hm, housing);

/**
 * Parameters entered by the user. Ranges follow the spec table "Входные параметры" (input parameters).
 * The subdivision step is not a user parameter: it is chosen by autoStep() in geometry.js.
 * Angles are in degrees here (UI only); the calculation modules take radians.
 *   group — form section (data-group in the page); int — integer only; gt — strict lower bound;
 *   step — change by the arrows and the ↑ / ↓ keys (0.1 unless stated otherwise); ladder — the arrows
 *   go to the next value of this list instead;
 *   max may depend on other values; when(values) — the field is shown and checked only if true;
 *   kind: 'choice' — a value set by the page (no field of its own).
 */
export const PARAMS = Object.freeze([
  { key: 'L', group: 'room', label: 'Длина', sym: 'L', unit: 'м', def: 6, min: 1, max: 50, step: 0.1 },
  { key: 'W', group: 'room', label: 'Ширина', sym: 'W', unit: 'м', def: 4, min: 1, max: 50, step: 0.1 },
  { key: 'H', group: 'room', label: 'Высота', sym: 'H', unit: 'м', def: 3, min: 2, max: 20, step: 0.1 },
  { key: 'rhoC', group: 'refl', label: 'Потолок', sym: 'ρ<sub>1</sub>', unit: '', def: 0.7, min: 0, max: 0.9, step: 0.1 },
  { key: 'rhoW', group: 'refl', label: 'Стены', sym: 'ρ<sub>2…5</sub>', unit: '', def: 0.5, min: 0, max: 0.9, step: 0.1 },
  { key: 'rhoF', group: 'refl', label: 'Пол', sym: 'ρ<sub>0</sub>', unit: '', def: 0.2, min: 0, max: 0.9, step: 0.1 },
  // the arrows of E_n walk the scale of illuminance levels (100 → 150 → 200 …), those of h_р switch
  // between the two standard planes 0.0 and 0.8 m; any other value can still be typed
  { key: 'En', group: 'norm', label: 'Норма', sym: 'E<sub>н</sub>', unit: 'лк', def: 200, min: 1, max: 5000, ladder: ILLUMINANCE_SCALE },
  {
    key: 'hwp', group: 'norm', label: 'Поверхность', sym: 'h<sub>р</sub>', unit: 'м', def: 0, min: 0, ladder: [0, 0.8],
    max: (v) => Math.max(0, (v.H ?? 20) - 0.1), maxNote: 'H − 0,1',
  },
  // uniformity required by the norm, U₀ = Emin / Ē; empty — not set (stage 7)
  { key: 'U0n', group: 'norm', label: 'Равномерность', sym: 'U<sub>0</sub>', unit: '', def: 0.4, min: 0.1, max: 1, step: 0.05, optional: true, placeholder: '—' },
  { key: 'mf', group: 'norm', label: 'Коэф.', sym: 'MF', unit: '', def: 0.75, min: 0.1, max: 1, step: 0.1 },
  { key: 'nx', group: 'grid', label: 'Вдоль X', sym: 'n<sub>x</sub>', unit: 'шт', def: 3, min: 1, max: 30, int: true, step: 1 },
  { key: 'ny', group: 'grid', label: 'Вдоль Y', sym: 'n<sub>y</sub>', unit: 'шт', def: 2, min: 1, max: 30, int: true, step: 1 },
  // mounting height: the centre of the top of the housing (as in DIALux); it follows H while it is
  // at the ceiling (initForm)
  {
    key: 'hm', group: 'grid', label: 'Высота установки', sym: 'h<sub>м</sub>', unit: 'м', def: 3, min: HM_MIN, step: 0.1,
    max: (v) => v.H ?? 20, maxNote: 'не выше H',
  },
  { key: 'psi', group: 'grid', label: 'Поворот', sym: 'ψ', unit: '°', def: 0, min: 0, max: 180, step: 90 },
  // photometry: 'cosine' without a file, 'file' with one (set by the page, no field)
  { key: 'phot', group: 'lumdata', kind: 'choice', def: 'cosine', options: [{ value: 'cosine' }, { value: 'file' }] },
  { key: 'flux', group: 'lumdata', label: 'Поток', sym: 'Φ', unit: 'лм', def: 4000, gt: 0, max: 1e6, step: 100 },
  { key: 'cct', group: 'lumdata', label: 'Цв. темп.', sym: 'T<sub>ц</sub>', unit: 'К', def: 3000, min: 1000, max: 20000, step: 100, when: (v) => v.phot === 'file' },
  { key: 'power', group: 'lumdata', label: 'Мощность', sym: 'P', unit: 'Вт', def: 10, gt: 0, max: 1e5, step: 0.1, when: (v) => v.phot === 'file' },
]);

/** Parses a number from a string; accepts a decimal comma and spaces. */
export function parseNumber(s) {
  if (typeof s === 'number') return s;
  const t = String(s).trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return NaN;
  return Number(t);
}

/** A typed value with every decimal point turned into a comma (fields always show a comma). */
export const toComma = (s) => String(s).replace(/\./g, ',');

/** Formats a number for display: decimal comma, no trailing zeros. */
export function formatNumber(x, digits = 3) {
  if (!Number.isFinite(x)) return '—';
  return String(Number(x.toFixed(digits))).replace('.', ',');
}

/** Reflectances of faces 0…5 (floor, ceiling, four walls) from form values. */
export const faceRho = (v) => [v.rhoF, v.rhoC, v.rhoW, v.rhoW, v.rhoW, v.rhoW];

/** Defaults of all parameters (numbers and choices). */
export const DEFAULTS = Object.freeze(Object.fromEntries(PARAMS.map((p) => [p.key, p.def])));

/**
 * The value after one step of the arrows: x ± step, without float noise, kept within the bounds
 * (an invalid x starts from the default).
 * @param {object} p — a PARAMS entry; @param {number} x; @param {1|-1} dir; @param {object} values — for max(values)
 */
export function stepValue(p, x, dir, values = {}) {
  const start = Number.isFinite(x) ? x : p.def;
  if (p.ladder) {
    // the next value of the ladder above (below) x; none → x stays, within the bounds
    const max = typeof p.max === 'function' ? p.max(values) : p.max ?? Infinity;
    const ok = p.ladder.filter((v) => v >= (p.min ?? -Infinity) - 1e-12 && v <= max + 1e-12);
    const next = dir > 0 ? ok.find((v) => v > start + 1e-9) : [...ok].reverse().find((v) => v < start - 1e-9);
    return next ?? start;
  }
  const step = p.step ?? 0.1;
  let y = Number((start + dir * step).toFixed(10));
  const max = typeof p.max === 'function' ? p.max(values) : p.max;
  const min = p.min ?? (p.gt !== undefined ? p.gt + step : -Infinity);
  if (y > max) y = max;
  if (y < min) y = p.gt !== undefined && start > p.gt && start < min ? start : min;
  return y;
}

/**
 * Validates form values. Fields are checked in PARAMS order, so a bound that depends on another
 * value (h_c ≤ H − 0.9) sees that value once it is valid; while it is invalid the bound uses the
 * widest range. Choices are known up front, so any field may depend on them.
 * Fields hidden by `when` are not checked and keep their default in `values`.
 * @param {Record<string, string|number>} raw
 * @returns {{ ok: boolean, values: Record<string, number|string>, errors: Record<string, string> }}
 */
export function validateParams(raw) {
  const values = {}, errors = {};
  const choices = Object.fromEntries(PARAMS.filter((p) => p.kind === 'choice').map((p) => [p.key, raw[p.key] ?? p.def]));
  for (const p of PARAMS) {
    if (p.kind === 'choice') {
      const x = raw[p.key] ?? p.def;
      if (!p.options.some((o) => o.value === x)) errors[p.key] = 'Выберите вариант';
      else values[p.key] = x;
      continue;
    }
    if (p.when && !p.when({ ...choices, ...values })) { values[p.key] = p.def; continue; }
    if (p.optional && (raw[p.key] == null || String(raw[p.key]).trim() === '')) { values[p.key] = null; continue; }
    const x = parseNumber(raw[p.key] ?? '');
    if (!Number.isFinite(x)) { errors[p.key] = 'Введите число'; continue; }
    if (p.int && !Number.isInteger(x)) { errors[p.key] = 'Введите целое число'; continue; }
    const max = typeof p.max === 'function' ? p.max(values) : p.max;
    const unit = p.unit && p.unit !== '°' ? ` ${p.unit}` : p.unit;
    if (p.gt !== undefined && !(x > p.gt)) { errors[p.key] = `Должно быть больше ${formatNumber(p.gt)}${unit}`; continue; }
    if (p.min !== undefined && x < p.min || x > max) {
      const lo = p.gt !== undefined ? `> ${formatNumber(p.gt)}, не более ` : `${formatNumber(p.min)}…`;
      errors[p.key] = `Допустимо ${lo}${formatNumber(max)}${unit}${p.maxNote ? ` (${p.maxNote})` : ''}`;
      continue;
    }
    values[p.key] = x;
  }
  if (Number.isInteger(values.nx) && Number.isInteger(values.ny) && values.nx * values.ny > MAX_LUMINAIRES) {
    errors.ny = `Не более ${MAX_LUMINAIRES} светильников, сейчас ${values.nx} × ${values.ny} = ${values.nx * values.ny}`;
    delete values.ny;
  }
  return { ok: Object.keys(errors).length === 0, values, errors };
}

const UP = '<svg viewBox="0 0 8 5" width="8" height="5" aria-hidden="true"><path d="M0 5 4 0 8 5z" fill="currentColor"/></svg>';
const DOWN = '<svg viewBox="0 0 8 5" width="8" height="5" aria-hidden="true"><path d="M0 0h8L4 5z" fill="currentColor"/></svg>';

/**
 * Builds the form fields and calls onChange(values) on every valid change.
 * Fields go to the elements marked data-group="…" inside root (choices have no field).
 * Every number field has up / down arrows on its left (and ↑ / ↓ keys) changing it by its step.
 * Invalid input is flagged and ignored; the last valid values stay in effect.
 * @param {HTMLElement} root
 * @param {(values: Record<string, number|string>) => void} onChange
 * @returns {{ values: () => Record<string, number|string>,
 *             set: (v: Record<string, number|string>) => void }} set — changes values from the page
 */
export function initForm(root, onChange) {
  const inputs = {}, errs = {}, flds = {};
  const choice = {};
  for (const p of PARAMS) {
    if (p.kind === 'choice') { choice[p.key] = p.def; continue; }
    const host = root.querySelector(`[data-group="${p.group}"]`);
    const fld = document.createElement('div');
    fld.className = 'fld';
    fld.id = `w-${p.key}`;
    fld.innerHTML = `<label class="fl" for="in-${p.key}"><span class="t">${p.label}</span></label>
      <div class="ibox"><span class="spin"><button type="button" tabindex="-1" data-d="1" aria-label="Больше">${UP}</button><button type="button" tabindex="-1" data-d="-1" aria-label="Меньше">${DOWN}</button></span><input id="in-${p.key}" name="${p.key}" inputmode="decimal" autocomplete="off" spellcheck="false"
        value="${formatNumber(p.def)}"${p.placeholder ? ` placeholder="${p.placeholder}"` : ''} aria-describedby="err-${p.key}"><span class="unit">${p.unit}</span></div>
      <span class="ferr" id="err-${p.key}" role="alert" hidden></span>`;
    const input = fld.querySelector('input');
    inputs[p.key] = input;
    errs[p.key] = fld.querySelector('.ferr');
    const bump = (dir) => {
      input.value = formatNumber(stepValue(p, parseNumber(input.value), dir, last), 6);
      clearTimeout(timer);
      check();
    };
    fld.querySelectorAll('.spin button').forEach((b) => b.addEventListener('click', () => bump(Number(b.dataset.d))));
    // the decimal separator is always shown as a comma, whatever is typed (stage 7)
    input.addEventListener('input', () => {
      if (!input.value.includes('.')) return;
      const at = input.selectionStart;
      input.value = toComma(input.value);
      if (at != null) input.setSelectionRange(at, at);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); bump(e.key === 'ArrowUp' ? 1 : -1); }
    });
    host.appendChild(fld);
    flds[p.key] = fld;
  }

  let last = validateParams(readRaw()).values;
  let timer = 0;
  showWhen(last);

  function readRaw() {
    return Object.fromEntries(PARAMS.map((p) => [p.key, p.kind === 'choice' ? choice[p.key] : inputs[p.key].value]));
  }
  function showWhen(v) {
    for (const p of PARAMS) if (p.when && flds[p.key]) flds[p.key].hidden = !p.when(v);
  }
  function check(follow = true) {
    // the mounting height at the ceiling follows the room height (not when a room is loaded)
    const h = parseNumber(inputs.H.value), m = parseNumber(inputs.hm.value);
    if (follow && Number.isFinite(h) && h !== last.H && Number.isFinite(m) && Math.abs(m - last.H) < 1e-9) inputs.hm.value = formatNumber(h, 6);
    const raw = readRaw();
    const r = validateParams(raw);
    showWhen({ ...last, ...r.values, ...choice });
    for (const p of PARAMS) {
      if (!errs[p.key]) continue;
      const e = r.errors[p.key] || '';
      errs[p.key].textContent = e;
      errs[p.key].hidden = !e;
      errs[p.key].parentElement.classList.toggle('bad', !!e);
      inputs[p.key].toggleAttribute('aria-invalid', !!e);
    }
    if (r.ok) { last = r.values; onChange(r.values); }
  }
  // Debounce typing; apply immediately on change (blur / Enter).
  root.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => check(), 200); });
  root.addEventListener('change', () => { clearTimeout(timer); check(); });

  /** Sets values from the page; { exact: true } loads them as they are (another room). */
  function set(v, { exact = false } = {}) {
    for (const [k, x] of Object.entries(v)) {
      if (k in choice) choice[k] = x;
      else if (inputs[k]) inputs[k].value = x == null ? '' : typeof x === 'number' ? formatNumber(x, 6) : toComma(x);
    }
    clearTimeout(timer);
    check(!exact);
  }
  return { values: () => ({ ...last }), set };
}
