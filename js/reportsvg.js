// Vector drawings of the report (stage 7): the room plan with luminaires and dimensions, the plan of
// a work plane with isolines and the numbers at the GOST points, the false-colour scale.
// Pure module: returns SVG markup as strings, units are millimetres of the printed page, so the
// plans are drawn to a drafting scale (М 1:n). No DOM: tested in Node.
// Text inherits the font of the report; sizes in mm (1 pt = 0.3528 mm).

import { labelPlaces } from './isolines.js';
import { LEVELS, COLORS_HEX } from './colorscale.js';
import { fmtLux, fmtLen } from './planview.js';

const PT = 0.3528;
/** Drafting scales, 1:n (ГОСТ 2.302). */
export const SCALES = Object.freeze([10, 15, 20, 25, 40, 50, 75, 100, 200, 400, 500, 800, 1000]);
const r2 = (x) => Math.round(x * 100) / 100;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** The largest drafting scale at which an L × W m room fits into maxW × maxH mm. */
export function planScale(L, W, maxW, maxH) {
  for (const n of SCALES) if (L * 1000 / n <= maxW + 1e-9 && W * 1000 / n <= maxH + 1e-9) return n;
  return Math.ceil(Math.max(L * 1000 / maxW, W * 1000 / maxH));
}

/** Room metres → page mm: origin of the room at (ox, oy + W·k), +Y up. */
function transform(L, W, n, ox, oy) {
  const k = 1000 / n;
  return { k, x: (x) => ox + x * k, y: (y) => oy + (W - y) * k };
}

/** Luminaire outlines at the grid positions: housing (else luminous area) a × b turned by ψ. */
function luminaires(T, d, { stroke = '#141414', fill = '#ffffff', glow = '#f6d64a', width = 0.22, opacity = 1 } = {}) {
  const s = d.shape?.housing ?? d.shape?.luminous ?? null;
  const lumA = d.shape?.luminous;
  // without a file: a small square, as in the 3D view
  const side = Math.min(0.3, 0.35 * Math.min(d.L / d.xs.length, d.W / d.ys.length));
  const a = Math.max((s ? s.a : side) * T.k, 1.8), b = Math.max((s ? s.b : side) * T.k, 1.8);
  const round = !!s?.round;
  const deg = -(d.psi ?? 0) * 180 / Math.PI; // room CCW = page CW (y flipped)
  const shapeOf = (w, h, rnd) => (rnd ? `<ellipse rx="${r2(w / 2)}" ry="${r2(h / 2)}"/>` : `<rect x="${r2(-w / 2)}" y="${r2(-h / 2)}" width="${r2(w)}" height="${r2(h)}"/>`);
  const inner = lumA && s && (lumA.a < s.a - 1e-6 || lumA.b < s.b - 1e-6)
    ? `<g fill="${glow}" stroke="none">${shapeOf(Math.max(lumA.a * T.k, 0.6), Math.max(lumA.b * T.k, 0.6), lumA.round)}</g>` : '';
  const one = `<g fill="${s ? fill : glow}" stroke="${stroke}" stroke-width="${width}">${shapeOf(a, b, round)}</g>${inner}`;
  let out = `<g opacity="${opacity}">`;
  for (const y of d.ys) for (const x of d.xs) out += `<g transform="translate(${r2(T.x(x))} ${r2(T.y(y))}) rotate(${r2(deg)})">${one}</g>`;
  return `${out}</g>`;
}

/** Dimension chains: horizontal below the room, vertical on its left (text turned), mm values. */
function dimensions(T, L, W, chains, font = 2.3) {
  const tick = (x, y) => `<path d="M${r2(x - 0.8)} ${r2(y + 0.8)}L${r2(x + 0.8)} ${r2(y - 0.8)}" stroke-width="0.3"/>`;
  const x0 = T.x(0), y0 = T.y(0);
  const charW = font * 0.56;
  let g = '', t = '';
  const h = (pos, line) => {
    g += `<path d="M${r2(T.x(pos[0]) - 1.5)} ${r2(line)}H${r2(T.x(pos[pos.length - 1]) + 1.5)}"/>`;
    for (let k = 0; k < pos.length; k++) {
      const px = T.x(pos[k]);
      g += `<path d="M${r2(px)} ${r2(y0 + 1)}V${r2(line + 1)}"/>${tick(px, line)}`;
      if (k === 0) continue;
      const a = T.x(pos[k - 1]), text = fmtLen(pos[k] - pos[k - 1]);
      if (px - a < text.length * charW + 2) continue;
      t += `<text x="${r2((a + px) / 2)}" y="${r2(line - 0.9)}" text-anchor="middle">${text}</text>`;
    }
  };
  const v = (pos, line) => {
    g += `<path d="M${r2(line)} ${r2(T.y(pos[0]) + 1.5)}V${r2(T.y(pos[pos.length - 1]) - 1.5)}"/>`;
    for (let k = 0; k < pos.length; k++) {
      const py = T.y(pos[k]);
      g += `<path d="M${r2(x0 - 1)} ${r2(py)}H${r2(line - 1)}"/>${tick(line, py)}`;
      if (k === 0) continue;
      const a = T.y(pos[k - 1]), text = fmtLen(pos[k] - pos[k - 1]);
      if (a - py < text.length * charW + 2) continue;
      const cx = line - 0.9, cy = (a + py) / 2;
      t += `<text x="${r2(cx)}" y="${r2(cy)}" text-anchor="middle" transform="rotate(-90 ${r2(cx)} ${r2(cy)})">${text}</text>`;
    }
  };
  const [gx, gy] = chains;
  let off = 6;
  if (gx) { h(gx, y0 + off); v(gy, x0 - off); off += 6; }
  h([0, L], y0 + off); v([0, W], x0 - off);
  return `<g fill="none" stroke="#141414" stroke-width="0.18">${g}</g><g fill="#141414" font-size="${font}" style="font-variant-numeric:tabular-nums">${t}</g>`;
}

/** Shortened chain of a long grid (as on the view): first three and last two axes. */
const chain = (vals) => (vals.length <= 9 ? vals : [vals[0], vals[1], vals[2], vals[vals.length - 2], vals[vals.length - 1]]);

/** Size of a plan drawing at scale 1:n with its dimension margins, mm. */
export function planBox(L, W, n, withGrid = true) {
  const k = 1000 / n, left = withGrid ? 15 : 9, bottom = withGrid ? 15 : 9;
  return { w: L * k + left + 2, h: W * k + bottom + 2, left, top: 2, bottom };
}

/**
 * Room plan for the summary: outline, axes and outlines of the luminaires, dimension chains.
 * @param {{ L, W, xs:number[], ys:number[], psi:number, shape:object|null, n:number }} d — n: scale 1:n
 */
export function roomPlanSvg(d) {
  const box = planBox(d.L, d.W, d.n, true);
  const T = transform(d.L, d.W, d.n, box.left, box.top);
  const x0 = T.x(0), x1 = T.x(d.L), y0 = T.y(0), y1 = T.y(d.W);
  let axes = '';
  for (const x of d.xs) axes += `<path d="M${r2(T.x(x))} ${r2(y1 - 2)}V${r2(y0 + 2)}"/>`;
  for (const y of d.ys) axes += `<path d="M${r2(x0 - 2)} ${r2(T.y(y))}H${r2(x1 + 2)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="plan" width="${r2(box.w)}mm" height="${r2(box.h)}mm" viewBox="0 0 ${r2(box.w)} ${r2(box.h)}">` +
    `<rect x="${r2(x0)}" y="${r2(y1)}" width="${r2(x1 - x0)}" height="${r2(y0 - y1)}" fill="#f7f7f5"/>` +
    `<g fill="none" stroke="#8a8a8a" stroke-width="0.13" stroke-dasharray="4 0.8 0.5 0.8">${axes}</g>` +
    luminaires(T, d) +
    `<rect x="${r2(x0)}" y="${r2(y1)}" width="${r2(x1 - x0)}" height="${r2(y0 - y1)}" fill="none" stroke="#141414" stroke-width="0.5"/>` +
    dimensions(T, d.L, d.W, [chain([0, ...d.xs, d.L]), chain([0, ...d.ys, d.W])]) +
    '</svg>';
}

/**
 * Plan of a work plane: isolines with their values, numbers at the GOST points (thinned when they
 * would overlap), faint luminaire outlines, the outline and the overall dimensions.
 * @param {{ L, W, xs, ys, psi, shape, n, sets: {level, lines: {pts, closed}[]}[],
 *           gost: { pts, values, nx, ny, dx, dy } }} d — values with MF, lx
 */
export function isolinePlanSvg(d, id = 'p') {
  const box = planBox(d.L, d.W, d.n, false);
  const T = transform(d.L, d.W, d.n, box.left, box.top);
  const x0 = T.x(0), x1 = T.x(d.L), y0 = T.y(0), y1 = T.y(d.W);
  const fs = 6.2 * PT, ls = 5.6 * PT; // GOST numbers, isoline labels
  // isolines
  let lines = '';
  const labels = [];
  for (const { level, lines: ls_ } of d.sets) {
    for (const { pts, closed } of ls_) {
      const n = pts.length / 2, sp = new Float64Array(pts.length);
      let path = '';
      for (let k = 0; k < n; k++) {
        const px = T.x(pts[2 * k]), py = T.y(pts[2 * k + 1]);
        sp[2 * k] = px; sp[2 * k + 1] = py;
        path += `${k ? 'L' : 'M'}${r2(px)} ${r2(py)}`;
      }
      if (closed) path += 'Z';
      lines += `<path d="${path}"/>`;
      for (const p of labelPlaces(sp, closed, 55, 16)) labels.push({ ...p, text: fmtLux(level) });
    }
  }
  // GOST points: thinned to a step that keeps the numbers apart
  const g = d.gost;
  let widest = 0;
  for (const v of g.values) widest = Math.max(widest, fmtLux(v).length);
  const need = widest * fs * 0.58 + 1.6;
  const step = Math.max(1, Math.ceil(need / (g.dx * T.k)), Math.ceil((fs + 1.4) / (g.dy * T.k)));
  const oi = Math.floor(((g.nx - 1) % step) / 2), oj = Math.floor(((g.ny - 1) % step) / 2);
  let dots = '', nums = '';
  const taken = [];
  for (let j = oj; j < g.ny; j += step) {
    for (let i = oi; i < g.nx; i += step) {
      const k = i + j * g.nx, px = T.x(g.pts[3 * k]), py = T.y(g.pts[3 * k + 1]);
      dots += `<circle cx="${r2(px)}" cy="${r2(py)}" r="0.28"/>`;
      nums += `<text x="${r2(px)}" y="${r2(py - 0.9)}">${fmtLux(g.values[k])}</text>`;
      taken.push([px, py - 0.9 - fs * 0.35]);
    }
  }
  let lab = '';
  for (const l of labels) {
    if (taken.some(([a, b]) => Math.abs(a - l.x) < 6 && Math.abs(b - l.y) < 3.2)) continue;
    taken.push([l.x, l.y]);
    const w = l.text.length * ls * 0.58 + 1.4;
    lab += `<g transform="translate(${r2(l.x)} ${r2(l.y)}) rotate(${r2(l.angle * 180 / Math.PI)})"><rect x="${r2(-w / 2)}" y="${r2(-ls * 0.62)}" width="${r2(w)}" height="${r2(ls * 1.24)}" fill="#fff"/><text y="${r2(ls * 0.36)}">${l.text}</text></g>`;
  }
  const clip = `${id}-clip`;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="plan" width="${r2(box.w)}mm" height="${r2(box.h)}mm" viewBox="0 0 ${r2(box.w)} ${r2(box.h)}">` +
    `<defs><clipPath id="${clip}"><rect x="${r2(x0)}" y="${r2(y1)}" width="${r2(x1 - x0)}" height="${r2(y0 - y1)}"/></clipPath></defs>` +
    luminaires(T, d, { stroke: '#b5b5b5', fill: 'none', glow: 'none', width: 0.15 }) +
    `<g clip-path="url(#${clip})"><g fill="none" stroke="#3a3a3a" stroke-width="0.2" stroke-linejoin="round">${lines}</g>` +
    `<g fill="#555" font-size="${r2(ls)}" text-anchor="middle" style="font-variant-numeric:tabular-nums">${lab}</g></g>` +
    `<g fill="#141414">${dots}</g>` +
    `<g fill="#141414" font-size="${r2(fs)}" font-weight="600" text-anchor="middle" stroke="#fff" stroke-width="0.55" paint-order="stroke" style="font-variant-numeric:tabular-nums">${nums}</g>` +
    `<rect x="${r2(x0)}" y="${r2(y1)}" width="${r2(x1 - x0)}" height="${r2(y0 - y1)}" fill="none" stroke="#141414" stroke-width="0.4"/>` +
    dimensions(T, d.L, d.W, [null, null]) +
    '</svg>';
}

/** False-colour scale: 27 steps, each label is the lower bound of its colour, width w mm. */
export function colorScaleSvg(w = 165) {
  const n = LEVELS.length, cw = w / n, h = 4, fs = 5.4 * PT;
  let boxes = '', text = '';
  for (let k = 0; k < n; k++) {
    boxes += `<rect x="${r2(k * cw)}" y="0" width="${r2(cw + 0.02)}" height="${h}" fill="${COLORS_HEX[k]}"/>`;
    const s = LEVELS[k].toLocaleString('ru-RU').replace(/\s/g, ' ');
    text += `<text x="${r2(k * cw + 0.3)}" y="${r2(h + fs + 0.9)}">${esc(s)}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" class="scale" width="${r2(w)}mm" height="${r2(h + fs + 2)}mm" viewBox="0 0 ${r2(w)} ${r2(h + fs + 2)}">` +
    `${boxes}<rect x="0" y="0" width="${r2(w)}" height="${h}" fill="none" stroke="#141414" stroke-width="0.12"/>` +
    `<g fill="#141414" font-size="${r2(fs)}" style="font-variant-numeric:tabular-nums">${text}</g></svg>`;
}
