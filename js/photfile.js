// Photometric data files: IES LM-63 (1986, 1991, 1995, 2002, 2019) and EULUMDAT (LDT).
// Pure module: no DOM and no Three.js, so it runs in the browser, a Web Worker and Node.
// Error and warning messages are user-facing and therefore in Russian.
//
// Both formats are reduced to one table (`PhotTable`):
//   C       — angles of the STORED C planes, rad, ascending;
//   gamma   — vertical angles γ, rad, ascending (γ = 0 down, π up);
//   cd      — absolute luminous intensity, cd, plane by plane (cd[p·nG + k] is plane p, angle k);
//   sym     — how the stored planes extend to the full circle (see photometry.js, expandPlanes):
//             'rot'    one plane, rotational symmetry;
//             'quad'   planes 0…π/2, symmetric to the C0–C180 and C90–C270 planes;
//             'half0'  planes 0…π, symmetric to the C0–C180 plane;
//             'half90' planes π/2…3π/2, symmetric to the C90–C270 plane;
//             'none'   planes over the whole circle.
// Orientation (spec, "Светильники"): C counterclockwise viewed from above from the luminaire's C0
// plane; IES horizontal angles are read as C angles as they are (0° along the luminaire length,
// LM-63), and EULUMDAT C angles likewise; the luminaire length lies along C0–C180 in both formats.
//
// Fluxes in the table:
//   ratedFlux — the luminaire flux stated in the file, lm, or null when the file does not state it:
//               LDT: Φ_lamps(set 1) · LORL / 100; IES with absolute photometry (lumens = −1): none;
//               IES with relative photometry: none either (the file gives lamp lumens, and the
//               luminaire flux is what the candela table integrates to);
//   lampFlux  — lamp flux, lm (LDT set 1; IES: number of lamps · lumens per lamp), or null.
// The flux of the model itself is the exact integral of the interpolated table (photometry.js).

const DEG = Math.PI / 180;
const FT = 0.3048;

/** A parse error with a user-facing (Russian) message. */
export class PhotometryFileError extends Error {
  constructor(message) { super(message); this.name = 'PhotometryFileError'; }
}
const fail = (msg) => { throw new PhotometryFileError(msg); };

/**
 * Parses a photometric file; the format is recognised by its contents (the file name only helps
 * with error messages).
 * @param {string} text — file contents (already decoded)
 * @param {string} [fileName]
 * @returns {PhotTable}
 */
export function parsePhotometryFile(text, fileName = '') {
  if (typeof text !== 'string' || !text.trim()) fail('Файл пустой');
  const t = text.replace(/^﻿/, '');
  const head = t.slice(0, 4000);
  const isIes = /^\s*IES/i.test(head) || /^\s*TILT\s*=/im.test(head);
  const ext = (fileName.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase();
  if (isIes) return parseIes(t, fileName);
  if (ext === 'ies') fail('Файл .ies без строки TILT= — это не файл IES LM-63');
  return parseLdt(t, fileName);
}

// ---------------------------------------------------------------------------------------------
// IES LM-63

/**
 * @param {string} text
 * @param {string} [fileName]
 * @returns {PhotTable}
 */
export function parseIes(text, fileName = '') {
  const lines = text.split(/\r\n|\r|\n/);
  const warnings = [];
  let k = 0;
  let version = 'LM-63-1986';
  if (/^\s*IES/i.test(lines[0] ?? '')) { version = lines[0].trim(); k = 1; }
  const kw = {};
  let lastKey = null;
  for (; k < lines.length; k++) {
    const s = lines[k].trim();
    if (/^TILT\s*=/i.test(s)) break;
    const m = s.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (m) {
      const key = m[1].trim().toUpperCase();
      if (key === 'MORE' && lastKey) kw[lastKey] += ` ${m[2]}`;
      else { kw[key] = kw[key] ? `${kw[key]} ${m[2]}` : m[2]; lastKey = key; }
    }
  }
  if (k >= lines.length) fail('В файле IES нет строки TILT=');
  const tilt = lines[k].trim().replace(/^TILT\s*=\s*/i, '').trim();
  const nums = lines.slice(k + 1).join(' ').split(/[\s,]+/).filter((x) => x !== '');
  let q = 0;
  const next = (what) => {
    if (q >= nums.length) fail(`Файл IES обрывается: не хватает данных (${what})`);
    const v = Number(nums[q++]);
    if (!Number.isFinite(v)) fail(`В файле IES не число «${nums[q - 1]}» (${what})`);
    return v;
  };
  if (/^INCLUDE$/i.test(tilt)) {
    next('TILT: геометрия лампы');
    const n = Math.round(next('TILT: число углов'));
    if (!(n >= 0 && n < 10000)) fail('TILT=INCLUDE: неверное число углов');
    for (let i = 0; i < 2 * n; i++) next('TILT: углы и множители');
    warnings.push('Наклон лампы (TILT=INCLUDE) не учитывается: светильник считается установленным как при измерении');
  } else if (!/^NONE$/i.test(tilt)) {
    warnings.push(`Внешний файл наклона лампы (TILT=${tilt}) не учитывается`);
  }
  const nLamps = next('число ламп');
  const lmPerLamp = next('поток лампы');
  const mult = next('множитель силы света');
  const nV = Math.round(next('число вертикальных углов'));
  const nH = Math.round(next('число горизонтальных углов'));
  const ptype = Math.round(next('тип фотометрии'));
  const units = Math.round(next('единицы размеров'));
  const w = next('ширина'), l = next('длина'), h = next('высота');
  const ballast = next('коэффициент ПРА');
  const blpf = next('второй коэффициент');
  const watts = next('мощность');
  if (ptype === 2 || ptype === 3) fail(`Фотометрия типа ${ptype === 2 ? 'B' : 'A'} не поддерживается, нужен тип C`);
  if (ptype !== 1) fail(`Неизвестный тип фотометрии ${ptype}`);
  if (!(nV >= 2 && nV <= 10000)) fail(`Неверное число вертикальных углов: ${nV}`);
  if (!(nH >= 1 && nH <= 10000)) fail(`Неверное число горизонтальных углов: ${nH}`);
  const V = Array.from({ length: nV }, () => next('вертикальные углы'));
  const Hd = Array.from({ length: nH }, () => next('горизонтальные углы'));
  const need = nV * nH, have = nums.length - q;
  if (have < need) {
    fail(`В файле ${have} значений силы света вместо ${need} (${nH} плоскостей × ${nV} углов)` +
      (have > 0 && have % nV === 0 ? `: данных хватает только на ${have / nV} плоскости` : ''));
  }
  const factor = mult * ballast * (blpf > 0 ? blpf : 1);
  const cd = new Float64Array(need);
  for (let i = 0; i < need; i++) {
    const v = next('сила света');
    cd[i] = v * factor;
  }
  if (have > need) warnings.push(`После таблицы силы света в файле ещё ${have - need} чисел; они пропущены`);
  if (!(factor > 0)) fail('Множитель силы света должен быть больше нуля');

  checkAscending(V, 'вертикальные углы');
  checkAscending(Hd, 'горизонтальные углы');
  if (V[0] < -1e-9 || V[nV - 1] > 180 + 1e-9) fail('Вертикальные углы должны лежать в пределах 0…180°');
  const h0 = Hd[0], h1 = Hd[nH - 1];
  let sym;
  if (nH === 1) {
    if (Math.abs(h0) > 1e-9) fail(`Одна горизонтальная плоскость должна иметь угол 0°, а не ${h0}°`);
    sym = 'rot';
  } else if (Math.abs(h0) < 1e-9 && Math.abs(h1 - 90) < 1e-9) sym = 'quad';
  else if (Math.abs(h0) < 1e-9 && Math.abs(h1 - 180) < 1e-9) sym = 'half0';
  else if (Math.abs(h0 - 90) < 1e-9 && Math.abs(h1 - 270) < 1e-9) sym = 'half90';
  else if (h0 >= -1e-9 && h1 > 180 && h1 <= 360 + 1e-9) sym = 'none';
  else fail(`Непонятный набор горизонтальных углов: ${h0}…${h1}°`);

  const unit = units === 1 ? FT : 1;
  if (units !== 1 && units !== 2) warnings.push(`Неизвестные единицы размеров (${units}); приняты метры`);
  const round = w < 0 || l < 0;
  const opening = {
    round,
    length: Math.abs(round ? Math.max(Math.abs(w), Math.abs(l)) : l) * unit,
    width: Math.abs(round ? Math.max(Math.abs(w), Math.abs(l)) : w) * unit,
    height: Math.abs(h) * unit,
  };
  const absolute = lmPerLamp < 0;
  return finish({
    format: 'ies',
    version,
    fileName,
    manufacturer: kw.MANUFAC ?? '',
    name: kw.LUMINAIRE ?? '',
    catalog: kw.LUMCAT ?? '',
    lamp: kw.LAMP ?? kw.LAMPCAT ?? '',
    C: Hd.map((x) => x * DEG),
    gamma: V.map((x) => x * DEG),
    cd,
    sym,
    ratedFlux: null,
    lampFlux: absolute ? null : nLamps * lmPerLamp,
    absolute,
    power: watts > 0 ? watts : null,
    cct: Number(kw._SEARCH_COLORTEMP) || null,
    cri: Number(kw._SEARCH_CRI) || null,
    lampSets: null,
    // LM-63 gives only the luminous opening; the housing is taken to be the same size.
    luminaire: opening,
    luminous: { ...opening, height: 0 },
    warnings,
  });
}

// ---------------------------------------------------------------------------------------------
// EULUMDAT

/** Symmetry of EULUMDAT Isym values (spec of the format, field 3). */
const LDT_SYM = ['none', 'rot', 'half0', 'half90', 'quad'];

/**
 * @param {string} text
 * @param {string} [fileName]
 * @returns {PhotTable}
 */
export function parseLdt(text, fileName = '') {
  const lines = text.split(/\r\n|\r|\n/);
  const warnings = [];
  const line = (n) => lines[n - 1] ?? fail(`Файл LDT обрывается на строке ${n}`);
  const num = (n, what) => {
    const s = line(n).trim().replace(',', '.');
    const v = Number(s);
    if (s === '' || !Number.isFinite(v)) fail(`Строка ${n} файла LDT (${what}): не число «${line(n).trim()}»`);
    return v;
  };
  const int = (n, what) => {
    const v = num(n, what);
    if (!Number.isInteger(v)) fail(`Строка ${n} файла LDT (${what}): нужно целое число, а не ${v}`);
    return v;
  };
  if (lines.length < 30) fail('Это не файл LDT (EULUMDAT): в нём меньше 30 строк');
  let isym = int(3, 'симметрия Isym');
  const Mc = int(4, 'число плоскостей C');
  const Ng = int(6, 'число углов γ');
  if (!(isym >= 0 && isym <= 4)) fail(`Неизвестная симметрия Isym = ${isym}`);
  if (!(Mc >= 1 && Mc <= 3600)) fail(`Неверное число плоскостей C: ${Mc}`);
  if (!(Ng >= 2 && Ng <= 3600)) fail(`Неверное число углов γ: ${Ng}`);
  const mm = (n, what) => Math.abs(num(n, what)) / 1000;
  const lumL = mm(13, 'длина светильника'), lumB = mm(14, 'ширина светильника'), lumH = mm(15, 'высота светильника');
  const areaL = mm(16, 'длина светящей части'), areaB = mm(17, 'ширина светящей части');
  const areaH = [18, 19, 20, 21].map((n) => mm(n, 'высота светящей части'));
  const lorl = num(23, 'КПД светильника LORL');
  const conv = num(24, 'коэффициент пересчёта силы света');
  const tilt = num(25, 'наклон при измерении');
  const nSets = int(26, 'число наборов ламп');
  if (!(nSets >= 1 && nSets <= 50)) fail(`Неверное число наборов ламп: ${nSets}`);
  // field 26a…26f of lamp set k (0-based): files write the sets one after another, six lines each
  // (line 26 + 6k + field + 1). The sets are alternative lamps for the same optics (one is used at
  // a time); the table is in cd/klm of the chosen set.
  const at = (field, k) => 26 + 6 * k + field + 1;
  const numOr = (n, what) => { const s = line(n).trim().replace(',', '.'); const v = Number(s); return s !== '' && Number.isFinite(v) ? v : null; };
  const lampSets = Array.from({ length: nSets }, (_, k) => {
    const flux = num(at(2, k), 'поток ламп');
    if (!(flux > 0)) fail(`Поток ламп набора ${k + 1} должен быть больше нуля, а не ${flux}`);
    return Object.freeze({
      count: num(at(0, k), 'число ламп'),
      type: line(at(1, k)).trim(),
      flux,
      cct: Number((line(at(3, k)).match(/\d+(?:[.,]\d+)?/) ?? [''])[0].replace(',', '.')) || null,
      cri: Number((line(at(4, k)).match(/\d+(?:[.,]\d+)?/) ?? [''])[0].replace(',', '.')) || null,
      power: (numOr(at(5, k)) ?? 0) > 0 ? numOr(at(5, k)) : null,
    });
  });
  const nLamps = lampSets[0].count;
  const lampType = lampSets[0].type;
  const lampFlux = lampSets[0].flux;
  const dataStart = 26 + 6 * nSets + 10 + 1; // after the 10 direct ratios
  const toks = lines.slice(dataStart - 1).join(' ').split(/\s+/).filter((x) => x !== '');
  let q = 0;
  const next = (what) => {
    if (q >= toks.length) fail(`Файл LDT обрывается: не хватает данных (${what})`);
    const v = Number(toks[q++].replace(',', '.'));
    if (!Number.isFinite(v)) fail(`В файле LDT не число «${toks[q - 1]}» (${what})`);
    return v;
  };
  const Cd = Array.from({ length: Mc }, () => next('углы C'));
  const Gd = Array.from({ length: Ng }, () => next('углы γ'));

  if (Mc === 1 && isym !== 1) {
    warnings.push(`В файле одна плоскость C при симметрии Isym = ${isym}; принята симметрия вращения`);
    isym = 1;
  }
  // stored planes: Mc1…Mc2 (1-based) by the EULUMDAT formulas; Isym = 3 starts at C270 and wraps
  let idx;
  if (isym === 0) idx = range(0, Mc);
  else if (isym === 1) idx = [0];
  else if (isym === 2 || isym === 4) {
    const d = isym === 2 ? 2 : 4;
    if (Mc % d) fail(`Число плоскостей C = ${Mc} не делится на ${d} при симметрии Isym = ${isym}`);
    idx = range(0, Mc / d + 1);
  } else {
    if (Mc % 4) fail(`Число плоскостей C = ${Mc} не делится на 4 при симметрии Isym = 3`);
    const mc1 = 3 * Mc / 4; // 0-based
    idx = range(0, Mc / 2 + 1).map((i) => (mc1 + i) % Mc);
  }
  const nStored = idx.length;
  const need = nStored * Ng, have = toks.length - q;
  if (have < need) fail(`В файле ${have} значений силы света вместо ${need} (${nStored} плоскостей × ${Ng} углов)`);
  if (have > need) warnings.push(`После таблицы силы света в файле ещё ${have - need} чисел; они пропущены`);
  if (!(lampFlux > 0)) fail(`Поток ламп должен быть больше нуля, а не ${lampFlux}`);
  const scale = lampFlux / 1000;
  const raw = new Float64Array(need);
  for (let i = 0; i < need; i++) raw[i] = next('сила света') * scale;
  if (Math.abs(tilt) > 1e-9) warnings.push(`Светильник измерен с наклоном ${tilt}°; наклон не учитывается`);
  if (Math.abs(conv - 1) > 1e-9) warnings.push(`Коэффициент пересчёта силы света ${conv} не применяется (значения в кд/клм)`);

  checkAscending(Gd, 'углы γ');
  if (Gd[0] < -1e-9 || Gd[Ng - 1] > 180 + 1e-9) fail('Углы γ должны лежать в пределах 0…180°');
  let C = idx.map((i) => Cd[i]);
  let cd = raw;
  const sym = LDT_SYM[isym];
  if (isym === 3) {
    // planes C270…C360/C0…C90: mirror them across the C90–C270 plane (C → 180° − C) into 90…270°,
    // which is the same light (the distribution is symmetric to that plane) in ascending order
    const order = C.map((c, i) => [mod360(180 - c), i]).sort((a, b) => a[0] - b[0]);
    C = order.map((o) => o[0]);
    cd = new Float64Array(need);
    order.forEach(([, i], p) => cd.set(raw.subarray(i * Ng, (i + 1) * Ng), p * Ng));
  } else if (isym === 1) C = [0];
  checkAscending(C, 'углы C');
  if (isym === 0 && (C[0] < -1e-9 || C[C.length - 1] >= 360 + 1e-9)) fail('Углы C должны лежать в пределах 0…360°');

  const round = !(lumB > 0), roundArea = !(areaB > 0);
  return finish({
    format: 'ldt',
    version: 'EULUMDAT',
    fileName,
    manufacturer: line(1).trim(),
    name: line(9).trim(),
    catalog: line(10).trim(),
    lamp: lampType,
    C: C.map((x) => x * DEG),
    gamma: Gd.map((x) => x * DEG),
    cd,
    sym,
    ratedFlux: lampFlux * lorl / 100,
    lampFlux,
    lor: lorl / 100,
    absolute: nLamps < 0,
    power: lampSets[0].power,
    cct: lampSets[0].cct,
    cri: lampSets[0].cri,
    lampSets: Object.freeze(lampSets),
    luminaire: { round, length: lumL, width: round ? lumL : lumB, height: lumH },
    luminous: { round: roundArea, length: areaL, width: roundArea ? areaL : areaB, height: Math.max(...areaH) },
    warnings,
  });
}

// ---------------------------------------------------------------------------------------------

function finish(t) {
  for (let i = 0; i < t.cd.length; i++) {
    if (!(t.cd[i] >= 0)) {
      if (t.cd[i] < 0 && t.cd[i] > -1e-6) { t.cd[i] = 0; continue; }
      fail(`Отрицательная или неверная сила света в таблице: ${t.cd[i]}`);
    }
  }
  let max = 0;
  for (const v of t.cd) max = Math.max(max, v);
  if (!(max > 0)) fail('В таблице силы света все значения нулевые');
  return Object.freeze({ ...t, C: Float64Array.from(t.C), gamma: Float64Array.from(t.gamma), warnings: Object.freeze(t.warnings) });
}

function checkAscending(a, what) {
  for (let i = 1; i < a.length; i++) if (!(a[i] > a[i - 1])) fail(`${what[0].toUpperCase()}${what.slice(1)} должны возрастать: ${a[i - 1]}, ${a[i]}`);
}
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
const mod360 = (x) => ((x % 360) + 360) % 360;

/**
 * @typedef {Object} PhotTable
 * @property {'ies'|'ldt'} format
 * @property {string} version, fileName, manufacturer, name, catalog, lamp
 * @property {Float64Array} C — stored plane angles, rad
 * @property {Float64Array} gamma — vertical angles, rad
 * @property {Float64Array} cd — intensity, cd, plane-major
 * @property {'rot'|'quad'|'half0'|'half90'|'none'} sym
 * @property {number|null} ratedFlux, lampFlux, power, cct, cri
 * @property {{count:number, type:string, flux:number, cct:number|null, cri:number|null, power:number|null}[]|null} lampSets
 *   — LDT lamp sets (alternatives; the table is scaled by the first one), null for IES
 * @property {{round:boolean, length:number, width:number, height:number}} luminaire, luminous — m
 * @property {string[]} warnings
 */

/**
 * Luminaire shape for the 3D view, in the luminaire frame: `a` along the C0–C180 plane, `b` along
 * C90–C270, m. IES (LM-63): length along C0–C180, width along C90–C270. EULUMDAT: length along
 * C90–C270 and width along C0–C180 — as ERCO writes its IES/LDT pairs (IES width = LDT length,
 * with identical C angles); the Maytoni library pairs disagree with each other on this.
 * Zero sizes give null (the view then draws a default marker).
 * @param {PhotTable} t
 * @returns {{ luminous: {round:boolean, a:number, b:number} | null,
 *             housing: {round:boolean, a:number, b:number, h:number} | null }}
 */
export function luminaireShape(t) {
  const ab = (s) => (t.format === 'ies' ? [s.length, s.width] : [s.width, s.length]);
  const lum = t.luminous, hou = t.luminaire;
  const [la, lb] = ab(lum), [ha, hb] = ab(hou);
  const luminous = la > 0 && lb > 0 ? { round: lum.round, a: la, b: lb } : (ha > 0 && hb > 0 ? { round: hou.round, a: ha, b: hb } : null);
  const housing = ha > 0 && hb > 0 ? { round: hou.round, a: Math.max(ha, luminous?.a ?? 0), b: Math.max(hb, luminous?.b ?? 0), h: hou.height } : null;
  return { luminous, housing };
}
