// Форма ввода и проверка значений.
// validateParams — чистая функция (тестируется в Node); initForm работает с DOM
// и вызывается только из браузера.

/** Параметры этапа 1. Диапазоны — по таблице «Входные параметры» спецификации. */
export const PARAMS = Object.freeze([
  { key: 'L', label: 'Длина', sym: 'L', unit: 'м', def: 6, min: 1, max: 50 },
  { key: 'W', label: 'Ширина', sym: 'W', unit: 'м', def: 4, min: 1, max: 50 },
  { key: 'H', label: 'Высота', sym: 'H', unit: 'м', def: 3, min: 2, max: 20 },
  { key: 'h', label: 'Шаг разбиения', sym: 'h', unit: 'м', def: 0.25, min: 0.1, max: 1 },
]);

/** Число из строки: допускается десятичная запятая и пробелы. */
export function parseNumber(s) {
  if (typeof s === 'number') return s;
  const t = String(s).trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return NaN;
  return Number(t);
}

/** Число для показа: десятичная запятая, без лишних нулей. */
export function formatNumber(x, digits = 3) {
  if (!Number.isFinite(x)) return '—';
  return String(Number(x.toFixed(digits))).replace('.', ',');
}

/**
 * Проверка значений формы.
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
 * Строит поля формы и вызывает onChange(values) при каждом допустимом изменении.
 * @param {HTMLElement} root
 * @param {(values: Record<string, number>) => void} onChange
 * @returns {{ values: () => Record<string, number> }}
 */
export function initForm(root, onChange) {
  const inputs = {}, errs = {};
  for (const p of PARAMS) {
    const row = document.createElement('label');
    row.className = 'field';
    row.innerHTML = `<span class="field-label">${p.label} <i>${p.sym}</i></span>
      <span class="field-input"><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false"
        name="${p.key}" value="${formatNumber(p.def)}" aria-describedby="err-${p.key}"><span class="unit">${p.unit}</span></span>
      <span class="field-err" id="err-${p.key}" role="alert"></span>`;
    root.appendChild(row);
    inputs[p.key] = row.querySelector('input');
    errs[p.key] = row.querySelector('.field-err');
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
      inputs[p.key].toggleAttribute('aria-invalid', !!e);
    }
    if (r.ok) { last = r.values; onChange(r.values); }
  }
  root.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(check, 200); });
  root.addEventListener('change', () => { clearTimeout(timer); check(); });

  return { values: () => ({ ...last }) };
}
