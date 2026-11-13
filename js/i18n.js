// Interface languages (stage 8): the current language, translated strings and the formats of
// numbers and dates. The strings live in the dictionaries js/lang-ru.js, js/lang-en.js and
// js/lang-de.js; code never contains user-facing text, only keys.
//
// The language is chosen once per page load: from the switch of the top bar (kept in localStorage),
// else from the languages of the browser (the first of ru, en, de; English when none matches).
// Switching reloads the page, so modules may take strings when they are evaluated. Node (the tests)
// and Web Workers have no page: they start in Russian and the page tells a worker its language
// (setLang).
//
// A dictionary value is
//   - a string with {name} placeholders filled from the parameters of t();
//   - a plural object { one, few, many, other } chosen by Intl.PluralRules for the parameter n;
//   - a function (params) => string for text that a template cannot express;
//   - any other value (arrays, objects) that raw() returns as it is.

import ru from './lang-ru.js';
import en from './lang-en.js';
import de from './lang-de.js';

/** Dictionaries by language id, in the order of the switch. */
export const DICTS = Object.freeze({ ru, en, de });
export const LANG_IDS = Object.freeze(Object.keys(DICTS));
const STORE = 'lcalc.lang';

/** First language of a browser list that has a dictionary ('de-AT' → 'de'); English when none. */
export function pickLang(list) {
  for (const l of list ?? []) {
    const base = String(l ?? '').toLowerCase().split(/[-_]/)[0];
    if (DICTS[base]) return base;
  }
  return 'en';
}

function detect() {
  if (typeof document === 'undefined') return 'ru'; // Node and workers: set explicitly
  try { const s = localStorage.getItem(STORE); if (DICTS[s]) return s; } catch (e) { /* storage unavailable */ }
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  return pickLang(nav.languages?.length ? nav.languages : [nav.language]);
}

let lang = detect();
let dict = DICTS[lang];
let plurals = new Intl.PluralRules(dict.meta.locale);

/** The current language id: 'ru', 'en' or 'de'. */
export const getLang = () => lang;
/** Meta data of the current language: locale, separators, quotes, units… (see the dictionaries). */
export const meta = () => dict.meta;

/** Sets the language without a reload (tests, workers). Unknown ids are ignored. */
export function setLang(id) {
  if (!DICTS[id]) return lang;
  lang = id; dict = DICTS[id];
  plurals = new Intl.PluralRules(dict.meta.locale);
  return lang;
}

/** Keeps the choice of the switch for the next page loads. */
export function storeLang(id) {
  try { localStorage.setItem(STORE, id); } catch (e) { /* storage unavailable */ }
}

const lookup = (d, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), d);

/** The raw dictionary value of a key in the current language (arrays, objects, functions). */
export function raw(key) {
  const v = lookup(dict, key);
  return v === undefined ? lookup(DICTS.en, key) : v;
}

/** Fills {name} placeholders. */
export const fill = (s, p = {}) => s.replace(/\{(\w+)\}/g, (m, k) => (k in p ? String(p[k]) : m));

/**
 * The text of a key in the current language.
 * @param {string} key — 'section.name'
 * @param {object} [p] — placeholder values; p.n chooses the plural form
 */
export function t(key, p = {}) {
  let v = raw(key);
  if (v === undefined) { if (typeof console !== 'undefined') console.warn(`i18n: no text for ${key}`); return key; }
  if (typeof v === 'function') return v(p);
  if (v && typeof v === 'object' && !Array.isArray(v)) v = v[plurals.select(Number(p.n))] ?? v.other ?? v.many ?? v.one;
  return typeof v === 'string' ? fill(v, p) : v;
}

// ---- numbers ----

/** Decimal separator of the current language. */
export const decimal = () => dict.meta.decimal;

/** A number for display: the decimal separator of the language, no trailing zeros, no grouping. */
export function formatNumber(x, digits = 3) {
  if (!Number.isFinite(x)) return '—';
  return String(Number(x.toFixed(digits))).replace('.', dict.meta.decimal);
}

/** A whole number with the digit grouping of the locale (1 000 / 1,000 / 1.000). */
export const group = (x) => Math.round(x).toLocaleString(dict.meta.locale);

/**
 * A number for the report: the decimal separator of the language, `digits` decimals at most, a
 * minus sign; thousands grouped from five digits on (10 000) with the group mark of the language.
 */
export function num(x, digits = 0) {
  if (!Number.isFinite(x)) return '—';
  const v = Number(x.toFixed(digits));
  const [i, f] = String(Math.abs(v)).split('.');
  const int = i.length > 4 ? i.replace(/\B(?=(\d{3})+(?!\d))/g, dict.meta.group) : i;
  return `${v < 0 ? '−' : ''}${int}${f ? `${dict.meta.decimal}${f}` : ''}`;
}

/** A number in scientific notation for the developer checks: 1,2·10<sup>−9</sup>. */
export function sci(x, digits = 1) {
  if (!Number.isFinite(x)) return String(x);
  if (x === 0) return '0';
  const [m, e] = x.toExponential(digits).split('e');
  return `${m.replace('.', dict.meta.decimal)}·10<sup>${e.replace('-', '−').replace('+', '')}</sup>`;
}

/** A date in words in the language: 13 November 2026, 13. November 2026. */
export const longDate = (d) => d.toLocaleDateString(dict.meta.locale, { day: 'numeric', month: 'long', year: 'numeric' });

// ---- planes ----

/**
 * Name of a horizontal plane at the height z, m, with the plane letter of the language (meta.plane):
 * H-0.8 in English. Always with a decimal (H-0.0, H-1.2).
 */
export function planeName(z) {
  const s = formatNumber(z, 2);
  return `${dict.meta.plane}-${s.includes(dict.meta.decimal) ? s : `${s}${dict.meta.decimal}0`}`;
}

/**
 * Plane of a norms row in the language: the data keep 'H-0.8', 'V-1.0' or 'V' (vertical, height not
 * stated); shown with the plane letters and the decimal separator of the language.
 */
export function planeCode(code) {
  const m = /^([HV])(?:-(\d+(?:\.\d+)?))?$/.exec(String(code ?? ''));
  if (!m) return String(code ?? '');
  const letter = m[1] === 'H' ? dict.meta.plane : dict.meta.vplane;
  if (m[2] == null) return letter;
  const s = formatNumber(Number(m[2]), 2);
  return `${letter}-${s.includes(dict.meta.decimal) ? s : `${s}${dict.meta.decimal}0`}`;
}

// ---- search ----

/**
 * Text folded for search, one character for one: lower case without diacritics (ü = u, and so for
 * the Cyrillic e with diaeresis),
 * dashes as hyphens. Positions match the original text, so hits can be marked in it.
 */
export function foldText(s) {
  let out = '';
  for (const c of String(s ?? '')) {
    let f = c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    if (/^[‑–—]$/.test(f)) f = '-';
    out += f.length === c.length ? f : c.toLowerCase().length === c.length ? c.toLowerCase() : c;
  }
  return out;
}
