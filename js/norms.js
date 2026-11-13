// Codifier of lighting norms (stage 7): SP 52.13330.2016 table L.1 and EN 12464-1:2021 tables 9–61.
// Pure module: the sets, search and what a chosen row puts into the form. The rows are generated
// (js/norms-data.js, scripts/build-norms.py) and stay in the language of their document; the words
// around them come from the dictionaries (norms.*).
// Stage 8: the Russian version offers SP 52 only, the English and German ones EN 12464-1 only. A room
// keeps a norm of the other set: its document and room names stay as they are, the words around
// them are translated (normSource).

import { SP52, EN12464 } from './norms-data.js';
import { t, raw, foldText } from './i18n.js';

/** All norm sets. title, sections and the reference label: the document's own (not translated). */
export const NORM_SETS = Object.freeze([
  {
    id: 'sp52', sections: SP52,
    get title() { return t('norms.sp52.title'); },
    get refLabel() { return t('norms.sp52.ref'); },
    get head() { return t('norms.sp52.head'); },
    // no-break spaces: the document, its table and the row number never split between lines
    source: (ref) => t('norms.sp52.source', { ref }),
    get note() { return t('norms.sp52.note'); },
  },
  {
    id: 'en12464', sections: EN12464,
    get title() { return t('norms.en12464.title'); },
    get refLabel() { return t('norms.en12464.ref'); },
    get head() { return t('norms.en12464.head'); },
    source: (ref) => t('norms.en12464.source', { ref }),
    get note() { return t('norms.en12464.note'); },
  },
]);

/** The sets of the current language (dictionary norms.sets): ru — SP 52, en and de — EN 12464-1. */
export const normSets = () => raw('norms.sets').map((id) => NORM_SETS.find((s) => s.id === id));

/** A row as an object. */
export const rowOf = ([ref, name, plane, z, E, U0, note]) => ({ ref, name, plane, z, E, U0, note });

/** True when a row can be applied: horizontal planes only (vertical ones are not calculated here). */
export const applicable = (row) => row.z != null;

const fold = foldText;

/**
 * Sections of a set with the rows that match the query (every word in the reference, name, note
 * or section title). An empty query keeps everything.
 * @returns {{ title: string, rows: object[], hits: number }[]} only sections with rows
 */
export function searchNorms(set, query = '') {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const out = [];
  for (const s of set.sections) {
    const title = fold(s.title);
    const rows = s.rows.map(rowOf).filter((r) => {
      if (!words.length) return true;
      const hay = `${fold(r.ref)} ${fold(r.name)} ${fold(r.note)} ${title}`;
      return words.every((w) => hay.includes(w) || fold(r.ref) === w);
    });
    if (rows.length) out.push({ title: s.title, rows, hits: words.length ? rows.length : 0 });
  }
  return out;
}

/**
 * What a chosen row puts into the room: the source text and the form values. The source text is kept
 * for older files; the page writes it from set and ref in the language of the page.
 */
export function normFromRow(set, row) {
  return { source: set.source(row.ref), name: row.name, set: set.id, ref: row.ref, En: row.E, hwp: row.z, U0n: row.U0 };
}

/** The document and row of a norm in the current language: «SP 52.13330.2016, table L.1, no. 4». */
export function normRef(norm) {
  const set = NORM_SETS.find((s) => s.id === norm?.set);
  return set && norm.ref ? set.source(norm.ref) : norm?.source ?? '';
}

/** True while the form still holds the values of the chosen norm. */
export function normMatches(norm, v) {
  if (!norm) return false;
  const eq = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 1e-9);
  return eq(norm.En, v.En) && eq(norm.hwp, v.hwp) && eq(norm.U0n, v.U0n);
}

/** Source line under the norms: «Set by <document, row>: <room>» or «Set by the user». */
export const normSource = (norm) => (norm ? t('norms.setBy', { src: normRef(norm), name: norm.name ? `: ${norm.name}` : '' }) : t('norms.user'));
