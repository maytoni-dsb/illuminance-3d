// Input form and value validation.
// validateParams is a pure function (tested in Node); initForm touches the DOM
// and is only called from the browser.
// Labels and error messages are user-facing and therefore in Russian.

/** Clearance between the luminaire and the higher work plane: h_c ≤ H − 0.9 m (spec, "Входные параметры"). */
export const HC_CLEARANCE = 0.9;

/**
 * Parameters entered by the user. Ranges follow the spec table "Входные параметры" (input parameters).
 * The subdivision step is not a user parameter: it is chosen by autoStep() in geometry.js.
 * Angles are in degrees here (UI only); the calculation modules take radians.
 *   group — form section; int — integer only; gt — strict lower bound (value > gt);
 *   max may depend on other values; when(values) — the field is shown and checked only if true;
 *   kind: 'choice' — a set of options (chips), not a number.
 */
export const PARAMS = Object.freeze([
  { key: 'L', group: 'room', label: 'Длина', sym: 'L', unit: 'м', def: 6, min: 1, max: 50 },
  { key: 'W', group: 'room', label: 'Ширина', sym: 'W', unit: 'м', def: 4, min: 1, max: 50 },
  { key: 'H', group: 'room', label: 'Высота', sym: 'H', unit: 'м', def: 3, min: 2, max: 20 },
  { key: 'rhoC', group: 'refl', label: 'Потолок', sym: 'ρ<sub>1</sub>', unit: '', def: 0.7, min: 0, max: 0.9 },
  { key: 'rhoW', group: 'refl', label: 'Стены', sym: 'ρ<sub>2…5</sub>', unit: '', def: 0.5, min: 0, max: 0.9 },
  { key: 'rhoF', group: 'refl', label: 'Пол', sym: 'ρ<sub>0</sub>', unit: '', def: 0.2, min: 0, max: 0.9 },
  { key: 'nx', group: 'lum', label: 'Вдоль X', sym: 'n<sub>x</sub>', unit: 'шт', def: 3, min: 1, max: 30, int: true },
  { key: 'ny', group: 'lum', label: 'Вдоль Y', sym: 'n<sub>y</sub>', unit: 'шт', def: 2, min: 1, max: 30, int: true },
  { key: 'flux', group: 'lum', label: 'Поток', sym: 'Φ', unit: 'лм', def: 4000, gt: 0, max: 1e6 },
  {
    key: 'hc', group: 'lum', label: 'Свес', sym: 'h<sub>c</sub>', unit: 'м', def: 0, min: 0,
    max: (v) => Math.max(0, (v.H ?? 20) - HC_CLEARANCE), maxNote: 'H − 0,9',
  },
  { key: 'psi', group: 'lum', label: 'Поворот', sym: 'ψ', unit: '°', def: 0, min: 0, max: 180 },
  {
    key: 'phot', group: 'phot', kind: 'choice', label: 'Фотометрия', def: 'cosine',
    options: [
      { value: 'cosine', label: 'Косинусная' },
      { value: 'directIndirect', label: 'Прямо-отражённая' },
      { value: 'file', label: 'Файл IES / LDT', disabled: true, title: 'Появится на этапе 5' },
    ],
  },
  { key: 'fUp', group: 'phot', label: 'Доля потока вверх', sym: 'f<sub>up</sub>', unit: '', def: 0.3, min: 0, max: 1, when: (v) => v.phot === 'directIndirect' },
  { key: 'mf', group: 'maint', label: 'Коэфф. эксплуатации', sym: 'MF', unit: '', def: 0.75, min: 0.1, max: 1 },
]);

/** Parses a number from a string; accepts a decimal comma and spaces. */
export function parseNumber(s) {
  if (typeof s === 'number') return s;
  const t = String(s).trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return NaN;
  return Number(t);
}

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
 * Validates form values. Fields are checked in PARAMS order, so a bound that depends on another
 * value (h_c ≤ H − 0.9) sees that value once it is valid; while it is invalid the bound uses the
 * widest range.
 * Fields hidden by `when` are not checked and keep their default in `values`.
 * @param {Record<string, string|number>} raw
 * @returns {{ ok: boolean, values: Record<string, number|string>, errors: Record<string, string> }}
 */
export function validateParams(raw) {
  const values = {}, errors = {};
  for (const p of PARAMS) {
    if (p.kind === 'choice') {
      const x = raw[p.key] ?? p.def;
      const opt = p.options.find((o) => o.value === x);
      if (!opt || opt.disabled) errors[p.key] = 'Выберите вариант';
      else values[p.key] = x;
      continue;
    }
    if (p.when && !p.when(values)) { values[p.key] = p.def; continue; }
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
  return { ok: Object.keys(errors).length === 0, values, errors };
}

/**
 * Builds the form fields and calls onChange(values) on every valid change.
 * Fields go to the elements marked data-group="room" | "refl" | "lum" | "phot" | "maint" inside root.
 * Invalid input is flagged and ignored; the last valid values stay in effect.
 * @param {HTMLElement} root
 * @param {(values: Record<string, number|string>) => void} onChange
 * @returns {{ values: () => Record<string, number|string> }}
 */
export function initForm(root, onChange) {
  const inputs = {}, errs = {}, flds = {};
  const choice = {};
  for (const p of PARAMS) {
    const host = root.querySelector(`[data-group="${p.group}"]`);
    const fld = document.createElement('div');
    fld.className = 'fld';
    fld.id = `w-${p.key}`;
    if (p.kind === 'choice') {
      fld.classList.add('wide');
      fld.innerHTML = `<span class="fl"><span class="t">${p.label}</span></span>
        <div class="gschips" role="radiogroup" aria-label="${p.label}">${p.options.map((o) =>
          `<button type="button" class="gschipb" role="radio" data-v="${o.value}" aria-checked="${o.value === p.def}" aria-pressed="${o.value === p.def}"
            ${o.disabled ? 'disabled' : ''} ${o.title ? `title="${o.title}"` : ''}>${o.label}</button>`).join('')}</div>`;
      choice[p.key] = p.def;
      fld.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        if (b.disabled) return;
        choice[p.key] = b.dataset.v;
        fld.querySelectorAll('button').forEach((x) => {
          const on = x === b;
          x.setAttribute('aria-pressed', String(on)); x.setAttribute('aria-checked', String(on));
        });
        check();
      }));
    } else {
      fld.innerHTML = `<label class="fl" for="in-${p.key}"><span class="t">${p.label}</span><i>${p.sym}</i></label>
        <div class="ibox"><input id="in-${p.key}" name="${p.key}" inputmode="decimal" autocomplete="off" spellcheck="false"
          value="${formatNumber(p.def)}" aria-describedby="err-${p.key}"><span class="unit">${p.unit}</span></div>
        <span class="ferr" id="err-${p.key}" role="alert" hidden></span>`;
      inputs[p.key] = fld.querySelector('input');
      errs[p.key] = fld.querySelector('.ferr');
    }
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
    for (const p of PARAMS) if (p.when) flds[p.key].hidden = !p.when(v);
  }
  function check() {
    const raw = readRaw();
    const r = validateParams(raw);
    showWhen({ ...last, ...r.values, phot: raw.phot });
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
  root.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(check, 200); });
  root.addEventListener('change', () => { clearTimeout(timer); check(); });

  return { values: () => ({ ...last }) };
}
