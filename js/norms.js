// Codifier of lighting norms (stage 7): СП 52.13330.2016 table Л.1 and EN 12464-1:2021 tables 9–61.
// Pure module: the sets, search and what a chosen row puts into the form. The rows are generated
// (js/norms-data.js, scripts/build-norms.py). User-facing strings are Russian; EN names stay English.

import { SP52, EN12464 } from './norms-data.js';

/** The norm sets of the switch. */
export const NORM_SETS = Object.freeze([
  {
    id: 'sp52', title: 'СП 52.13330.2016', table: 'таблица Л.1', sections: SP52, refLabel: '№',
    source: (ref) => `СП 52.13330.2016 табл. Л.1: № ${ref}`,
    note: '',
  },
  {
    id: 'en12464', title: 'EN 12464-1:2021', table: 'tables 9–61', sections: EN12464, refLabel: 'Ref. no.',
    source: (ref) => `EN 12464-1:2021 ref. no. ${ref}`,
    note: 'Ē — Ēm «required»; U₀ — Uo. Плоскость: Г-0,0, где норма относится к полу и для путей движения; ' +
      'вертикальная, где так указано; иначе — рабочая зона на 0,8 м.',
  },
]);

/** A row as an object. */
export const rowOf = ([ref, name, plane, z, E, U0, note]) => ({ ref, name, plane, z, E, U0, note });

/** True when a row can be applied: horizontal planes only (vertical ones are not calculated here). */
export const applicable = (row) => row.z != null;

const fold = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[‑–—]/g, '-');

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

/** What a chosen row puts into the room: the source text and the form values. */
export function normFromRow(set, row) {
  return { source: set.source(row.ref), set: set.id, ref: row.ref, En: row.E, hwp: row.z, U0n: row.U0 };
}

/** True while the form still holds the values of the chosen norm. */
export function normMatches(norm, v) {
  if (!norm) return false;
  const eq = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 1e-9);
  return eq(norm.En, v.En) && eq(norm.hwp, v.hwp) && eq(norm.U0n, v.U0n);
}

/** Source line under the norms: the reference, or «задано пользователем». */
export const normSource = (norm) => norm?.source ?? 'задано пользователем';
