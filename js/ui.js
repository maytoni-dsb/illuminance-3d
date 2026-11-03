// Input form and value validation.
// validateParams is a pure function (tested in Node); initForm touches the DOM
// and is only called from the browser.
// Labels and error messages are user-facing and therefore in Russian.

/**
 * Room parameters entered by the user. Ranges follow the spec table "Входные параметры" (input parameters).
 * The subdivision step is not a user parameter: it is chosen by autoStep() in geometry.js.
 */
export const PARAMS = Object.freeze([
  { key: 'L', label: 'Длина', sym: 'L', unit: 'м', def: 6, min: 1, max: 50 },
  { key: 'W', label: 'Ширина', sym: 'W', unit: 'м', def: 4, min: 1, max: 50 },
  { key: 'H', label: 'Высота', sym: 'H', unit: 'м', def: 3, min: 2, max: 20 },
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

/**
 * Validates form values.
 * @param {Record<string, string|number>} raw
 * @returns {{ ok: boolean, values: Record<string, number>, errors: Record<string, string> }}
 */
export function validateParams(raw) {
  const values = {}, errors = {};
  for (const p of PARAMS) {
    const x = parseNumber(raw[p.key] ?? '');
    if (!Number.isFinite(x)) { errors[p.key] = 'Введите число'; continue; }
    if (x < p.min || x > p.max) { errors[p.key] = `Допустимо ${formatNumber(p.min)}…${formatNumber(p.max)} ${p.unit}`; continue; }
    values[p.key] = x;
  }
  return { ok: Object.keys(errors).length === 0, values, errors };
}

/**
 * Builds the form fields and calls onChange(values) on every valid change.
 * Invalid input is flagged and ignored; the last valid values stay in effect.
 * @param {HTMLElement} root
 * @param {(values: Record<string, number>) => void} onChange
 * @returns {{ values: () => Record<string, number> }}
 */
export function initForm(root, onChange) {
  const inputs = {}, errs = {};
  for (const p of PARAMS) {
    const fld = document.createElement('div');
    fld.className = 'fld';
    fld.id = `w-${p.key}`;
    fld.innerHTML = `<label class="fl" for="in-${p.key}"><span class="t">${p.label}</span><i>${p.sym}</i></label>
      <div class="ibox"><input id="in-${p.key}" name="${p.key}" inputmode="decimal" autocomplete="off" spellcheck="false"
        value="${formatNumber(p.def)}" aria-describedby="err-${p.key}"><span class="unit">${p.unit}</span></div>
      <span class="ferr" id="err-${p.key}" role="alert" hidden></span>`;
    root.appendChild(fld);
    inputs[p.key] = fld.querySelector('input');
    errs[p.key] = fld.querySelector('.ferr');
  }

  let last = validateParams(readRaw()).values;
  let timer = 0;

  function readRaw() {
    return Object.fromEntries(PARAMS.map((p) => [p.key, inputs[p.key].value]));
  }
  function check() {
    const r = validateParams(readRaw());
    for (const p of PARAMS) {
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
