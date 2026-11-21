// 2D overlay of the view (stage 6), drawn on a canvas over the WebGL view whenever the view is
// redrawn, so lines and text stay sharp at any zoom:
//   - on the plan: the room outline, the axes of the luminaire grid, the dimensions (room and grid),
//     and for a shown plane its isolines with their values and the numbers at the GOST points;
//   - in 3D: for a shown plane the numbers at the GOST points and the isoline values, projected
//     (the isolines themselves are 3D lines of the view).
// Colours of the plane are drawn by view3d from the same field. Spec, "Plans of the planes 0.0 and 0.8".

import { labelPlaces } from './isolines.js';
import { meta } from './i18n.js';

const FONT = '"Suisse Intl","Helvetica Neue",Helvetica,Arial,sans-serif';
/** Spacing of the isoline labels along a line: px on the plan, m in 3D. */
const LABEL_SPACING = 240, LABEL_MIN = 70, LABEL_SPACING_3D = 1.6, LABEL_MIN_3D = 0.8;

/** Illuminance as written on the plan: whole lux from 10 lx, one decimal below. */
export const fmtLux = (v) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString(meta().locale);
/** Length as written on the dimensions: whole millimetres, as on drawings (accepted 5 Nov 2026). */
export const fmtLen = (v) => String(Math.round(v * 1000));

function halo(ctx, text, x, y, fill = '#111', glow = 'rgba(255,255,255,.85)') {
  ctx.lineWidth = 3; ctx.strokeStyle = glow; ctx.strokeText(text, x, y);
  ctx.fillStyle = fill; ctx.fillText(text, x, y);
}

/**
 * Room plan: outline, axes of the luminaire grid, dimension chains (grid) and overall dimensions.
 * @param {{ x, y, k }} T — room metres → px
 * @param {{ L:number, W:number, xs:number[], ys:number[], ink:string, muted:string }} d — axis
 *        positions of the luminaire grid along X and Y; colours of the theme for the dimensions
 */
export function drawRoomPlan(ctx, T, size, d) {
  const x0 = T.x(0), x1 = T.x(d.L), y0 = T.y(0), y1 = T.y(d.W); // y0 > y1 (room +Y is up)
  ctx.save();
  // axes of the grid: dash-dot, a little past the walls
  ctx.strokeStyle = 'rgba(40,40,40,.55)';
  ctx.lineWidth = 0.8;
  ctx.setLineDash([12, 3, 2, 3]);
  ctx.beginPath();
  for (const x of d.xs) { const px = T.x(x); ctx.moveTo(px, y1 - 8); ctx.lineTo(px, y0 + 14); }
  for (const y of d.ys) { const py = T.y(y); ctx.moveTo(x0 - 14, py); ctx.lineTo(x1 + 8, py); }
  ctx.stroke();
  ctx.setLineDash([]);
  // outline
  ctx.strokeStyle = d.ink;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(x0, y1, x1 - x0, y0 - y1);

  // dimensions: the grid chain next to the room, the overall size further out
  ctx.font = `500 11px ${FONT}`;
  ctx.fillStyle = d.ink; ctx.strokeStyle = d.ink; ctx.lineWidth = 0.9;
  const chain = (vals) => (vals.length <= 7 ? vals : [vals[0], vals[1], vals[2], vals[vals.length - 2], vals[vals.length - 1]]);
  const tick = (px, py) => { ctx.beginPath(); ctx.moveTo(px - 4, py + 4); ctx.lineTo(px + 4, py - 4); ctx.stroke(); };
  // horizontal: below the room
  const hDim = (pos, yLine, ext) => {
    ctx.beginPath(); ctx.moveTo(T.x(pos[0]), yLine); ctx.lineTo(T.x(pos[pos.length - 1]), yLine); ctx.stroke();
    for (let k = 0; k < pos.length; k++) {
      const px = T.x(pos[k]);
      ctx.beginPath(); ctx.moveTo(px, ext); ctx.lineTo(px, yLine + 4); ctx.stroke();
      tick(px, yLine);
      if (k === 0) continue;
      const a = T.x(pos[k - 1]), len = pos[k] - pos[k - 1], text = fmtLen(len);
      const w = ctx.measureText(text).width;
      if (px - a < w + 8) continue;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(text, (a + px) / 2, yLine - 2);
    }
  };
  // vertical: left of the room, text turned
  const vDim = (pos, xLine, ext) => {
    ctx.beginPath(); ctx.moveTo(xLine, T.y(pos[0])); ctx.lineTo(xLine, T.y(pos[pos.length - 1])); ctx.stroke();
    for (let k = 0; k < pos.length; k++) {
      const py = T.y(pos[k]);
      ctx.beginPath(); ctx.moveTo(ext, py); ctx.lineTo(xLine - 4, py); ctx.stroke();
      tick(xLine, py);
      if (k === 0) continue;
      const a = T.y(pos[k - 1]), text = fmtLen(pos[k] - pos[k - 1]);
      const w = ctx.measureText(text).width;
      if (a - py < w + 8) continue;
      ctx.save(); ctx.translate(xLine - 2, (a + py) / 2); ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(text, 0, 0); ctx.restore();
    }
  };
  const gx = chain([0, ...d.xs, d.L]), gy = chain([0, ...d.ys, d.W]);
  hDim(gx, y0 + 22, y0 + 4);
  hDim([0, d.L], y0 + 46, y0 + 26);
  vDim(gy, x0 - 22, x0 - 4);
  vDim([0, d.W], x0 - 46, x0 - 26);
  // a gap in a shortened chain: the axes in between are equal
  ctx.restore();
}

/**
 * A plane on the plan: isolines (clipped to the plane) with their values and the numbers at the
 * GOST points, thinned when they would overlap.
 * @param {{ L, W, sets, gost: { pts, values, nx, ny, dx, dy } }} d — values with MF
 */
export function drawPlaneOnPlan(ctx, T, size, d) {
  const x0 = T.x(0), x1 = T.x(d.L), y0 = T.y(0), y1 = T.y(d.W);
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.rect(x0, y1, x1 - x0, y0 - y1); ctx.clip();
  ctx.strokeStyle = 'rgba(20,20,20,.72)';
  ctx.lineWidth = 1;
  const labels = [], spare = new Map(); // dense candidates of every level (each drawn value gets a label)
  for (const { level, lines } of d.sets) {
    for (const { pts, closed } of lines) {
      const n = pts.length / 2;
      const sp = new Float64Array(pts.length);
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const px = T.x(pts[2 * k]), py = T.y(pts[2 * k + 1]);
        sp[2 * k] = px; sp[2 * k + 1] = py;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      if (closed) ctx.closePath();
      ctx.stroke();
      for (const p of labelPlaces(sp, closed, LABEL_SPACING, LABEL_MIN)) labels.push({ ...p, level, text: fmtLux(level) });
      addSpare(spare, level, denseCandidates(sp, closed, 14));
    }
  }

  ctx.font = `600 11px ${FONT}`;
  const g = d.gost;
  const wide = Math.max(...Array.from(g.values, (v) => ctx.measureText(fmtLux(v)).width)) + 6;
  const step = Math.max(1, Math.ceil(wide / Math.max(1e-6, g.dx / T.k)), Math.ceil(16 / Math.max(1e-6, g.dy / T.k)));
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const taken = [];
  // with thinning keep the shown points about the middle of the plane
  const oi = Math.floor(((g.nx - 1) % step) / 2), oj = Math.floor(((g.ny - 1) % step) / 2);
  for (let j = oj; j < g.ny; j += step) {
    for (let i = oi; i < g.nx; i += step) {
      const k = i + j * g.nx;
      const px = T.x(g.pts[3 * k]), py = T.y(g.pts[3 * k + 1]);
      if (px < -40 || px > size.w + 40 || py < -20 || py > size.h + 20) continue;
      ctx.fillStyle = '#111';
      ctx.fillRect(px - 1, py - 1, 2, 2);
      halo(ctx, fmtLux(g.values[k]), px, py - 9);
      taken.push([px, py - 6]);
    }
  }

  ctx.font = `500 10.5px ${FONT}`;
  const onScreen = (l) => l.x >= 0 && l.x <= size.w && l.y >= 0 && l.y <= size.h && l.x >= x0 && l.x <= x1 && l.y >= y1 && l.y <= y0;
  const put = [], labelled = new Set();
  for (const l of labels) {
    if (!onScreen(l)) continue;
    if (taken.some(([a, b]) => Math.abs(a - l.x) < 26 && Math.abs(b - l.y) < 14)) continue;
    taken.push([l.x, l.y]); put.push(l); labelled.add(l.level);
  }
  for (const l of missingLabels(spare, labelled, taken, onScreen, 26, 14)) { taken.push([l.x, l.y]); put.push({ ...l, text: fmtLux(l.level) }); }
  for (const l of put) {
    ctx.save();
    ctx.translate(l.x, l.y); ctx.rotate(l.angle);
    const w = ctx.measureText(l.text).width + 6;
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.fillRect(-w / 2, -7, w, 14);
    ctx.fillStyle = '#222';
    ctx.fillText(l.text, 0, 0.5);
    ctx.restore();
  }
  ctx.restore();
}

/** Label candidates every `step` along a line (any length), with the readable angle. */
export function denseCandidates(pts, closed, step) {
  const c = labelPlaces(pts, closed, step, 0);
  if (c.length || pts.length < 4) return c;
  let a = Math.atan2(pts[3] - pts[1], pts[2] - pts[0]);
  if (a > Math.PI / 2) a -= Math.PI; else if (a <= -Math.PI / 2) a += Math.PI;
  return [{ x: (pts[0] + pts[2]) / 2, y: (pts[1] + pts[3]) / 2, angle: a }];
}
function addSpare(spare, level, cands) {
  if (!spare.has(level)) spare.set(level, []);
  for (const c of cands) spare.get(level).push({ ...c, level });
}
/**
 * For every level that has visible candidates but no label yet: its least crowded candidate
 * (crowding — labels and numbers already within dx × dy).
 */
export function missingLabels(spare, labelled, taken, visible, dx, dy) {
  const out = [];
  for (const [level, cands] of spare) {
    if (labelled.has(level)) continue;
    let best = null, bh = Infinity;
    for (const c of cands) {
      if (!visible(c)) continue;
      const h = taken.reduce((a, [x, y]) => a + (Math.abs(x - c.x) < dx && Math.abs(y - c.y) < dy ? 1 : 0), 0) + out.reduce((a, o) => a + (Math.abs(o.x - c.x) < dx && Math.abs(o.y - c.y) < dy ? 1 : 0), 0);
      if (h < bh) { bh = h; best = c; if (!h) break; }
    }
    if (best) { out.push(best); labelled.add(level); }
  }
  return out;
}

/**
 * A plane in 3D: numbers at the GOST points and the values of the isolines, projected.
 * @param {(x:number, y:number, z:number) => number[] | null} project — room metres → px
 * @param {{ z, sets, gost }} d
 */
export function drawPlane3D(ctx, project, size, d) {
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const taken = [];
  ctx.font = `600 11px ${FONT}`;
  const g = d.gost;
  for (let k = 0; k < g.values.length; k++) {
    const p = project(g.pts[3 * k], g.pts[3 * k + 1], d.z);
    if (!p || p[0] < -30 || p[0] > size.w + 30 || p[1] < -20 || p[1] > size.h + 20) continue;
    if (taken.some(([a, b]) => Math.abs(a - p[0]) < 24 && Math.abs(b - p[1]) < 12)) continue;
    taken.push(p);
    ctx.fillStyle = '#111'; ctx.fillRect(p[0] - 1, p[1] - 1, 2, 2);
    halo(ctx, fmtLux(g.values[k]), p[0], p[1] - 8);
  }
  ctx.font = `500 10px ${FONT}`;
  const shown = (p) => p && p[0] >= 0 && p[0] <= size.w && p[1] >= 0 && p[1] <= size.h;
  const put = [], labelled = new Set(), spare = new Map();
  for (const { level, lines } of d.sets) {
    for (const { pts, closed } of lines) {
      for (const q of labelPlaces(pts, closed, LABEL_SPACING_3D, LABEL_MIN_3D)) {
        const p = project(q.x, q.y, d.z);
        if (!shown(p)) continue;
        if (taken.some(([a, b]) => Math.abs(a - p[0]) < 24 && Math.abs(b - p[1]) < 12)) continue;
        taken.push(p); put.push({ x: p[0], y: p[1], level }); labelled.add(level);
      }
      // dense candidates on the screen, for a value left without a label
      const c = [];
      for (const q of denseCandidates(pts, closed, LABEL_SPACING_3D / 8)) { const p = project(q.x, q.y, d.z); if (shown(p)) c.push({ x: p[0], y: p[1] }); }
      addSpare(spare, level, c);
    }
  }
  for (const l of missingLabels(spare, labelled, taken, () => true, 24, 12)) { taken.push([l.x, l.y]); put.push(l); }
  for (const l of put) {
    const text = fmtLux(l.level), w = ctx.measureText(text).width + 6;
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(l.x - w / 2, l.y - 7, w, 14);
    ctx.fillStyle = '#222'; ctx.fillText(text, l.x, l.y + 0.5);
  }
  ctx.restore();
}

/** Colours of the gizmo, after 3ds Max: X red, Y green, Z blue, the active handle yellow (over a white halo). */
export const GIZMO_COLORS = Object.freeze({ x: '#e03131', y: '#2f9e44', z: '#1c7ed6', active: '#f5b700' });

/**
 * Outline of a luminaire in room coordinates (stage 2.1): a rectangle a × b turned by ψ, or an
 * ellipse (round), as a list of points at height z.
 */
export function outline(x, y, z, a, b, psiDeg, round = false) {
  const c = Math.cos(psiDeg * Math.PI / 180), s = Math.sin(psiDeg * Math.PI / 180);
  const pts = round
    ? Array.from({ length: 24 }, (_, k) => [a / 2 * Math.cos(k * Math.PI / 12), b / 2 * Math.sin(k * Math.PI / 12)])
    : [[-a / 2, -b / 2], [a / 2, -b / 2], [a / 2, b / 2], [-a / 2, b / 2]];
  return pts.map(([u, v]) => [x + u * c - v * s, y + u * s + v * c, z]);
}

function poly(ctx, P, pts) {
  const q = pts.map((p) => P(p[0], p[1], p[2]));
  if (q.some((v) => !v)) return false;
  ctx.beginPath();
  q.forEach((v, k) => (k ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1])));
  ctx.closePath();
  return true;
}

/**
 * The luminaire editor (stage 2.1, after 3ds Max) on the plan and in 3D: the plan grid (plan, when
 * shown), guides of the selected lines and circles and of the group being drawn, the luminaires as
 * wireframes (the housing and the luminous area; a small circle with a cross without a file) in the
 * colour of their type — all of them on the plan, the selected ones in 3D — the selected in the
 * accent colour, misplaced in red; the snapped point, the selection rectangle and the gizmo.
 * @param {{ mode: '2d' | '3d', P: (x, y, z) => [px, py] | null, k: number, items, color, letter,
 *   selected, grid, L, W, guides, box, accent, bad: Set<string>, snap, gizmo }} d
 *   P — room point → view px; k — metres per px (plan); gizmo — { tool, o, x, y, ring, active }
 */
export function drawEditor(ctx, size, d) {
  const P = d.P, plan = d.mode === '2d';
  ctx.save();
  // plan grid: thin lines inside the room
  if (plan && d.grid.show) {
    const px = d.grid.sx / d.k, py = d.grid.sy / d.k;
    if (px >= 6 && py >= 6) {
      ctx.strokeStyle = 'rgba(124,84,254,.16)'; ctx.lineWidth = 0.6;
      ctx.beginPath();
      const i0 = Math.ceil((0 - d.grid.ox) / d.grid.sx), i1 = Math.floor((d.L - d.grid.ox) / d.grid.sx);
      for (let i = i0; i <= i1; i++) { const a = P(d.grid.ox + i * d.grid.sx, 0), b = P(d.grid.ox + i * d.grid.sx, d.W); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      const j0 = Math.ceil((0 - d.grid.oy) / d.grid.sy), j1 = Math.floor((d.W - d.grid.oy) / d.grid.sy);
      for (let j = j0; j <= j1; j++) { const a = P(0, d.grid.oy + j * d.grid.sy), b = P(d.L, d.grid.oy + j * d.grid.sy); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      ctx.stroke();
    }
  }
  // guides
  ctx.setLineDash([6, 4]); ctx.strokeStyle = d.accent; ctx.lineWidth = 1;
  for (const g of d.guides) {
    const z = g.z ?? 0;
    if (g.kind === 'circle') poly(ctx, P, Array.from({ length: 64 }, (_, k) => [g.cx + g.r * Math.cos(k * Math.PI / 32), g.cy + g.r * Math.sin(k * Math.PI / 32), z]));
    else {
      ctx.beginPath();
      for (const [a, b] of g.segments) { const u = P(a[0], a[1], z), v = P(b[0], b[1], z); if (u && v) { ctx.moveTo(u[0], u[1]); ctx.lineTo(v[0], v[1]); } }
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // luminaires: wireframes
  ctx.font = `600 10px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const it of d.items) {
    const sel = d.selected(it);
    if (!plan && !sel) continue;
    const bad = d.bad.has(`${it.group}:${it.index}`);
    const col = bad ? '#EB3D00' : sel ? d.accent : d.color(it.type);
    const z = it.hm ?? 0;
    ctx.strokeStyle = col; ctx.lineWidth = sel ? 2 : 1.2;
    const c = P(it.x, it.y, z);
    if (!c) continue;
    if (it.a > 0 && it.b > 0 && (!plan || Math.min(it.a, it.b) / d.k >= 3)) {
      if (poly(ctx, P, outline(it.x, it.y, z, it.a, it.b, it.psi, it.round))) ctx.stroke();
      if (it.la > 0 && it.lb > 0 && (it.la < it.a - 1e-6 || it.lb < it.b - 1e-6)) {
        ctx.lineWidth = sel ? 1.4 : 0.8;
        if (poly(ctx, P, outline(it.x, it.y, z, it.la, it.lb, it.psi, it.round))) ctx.stroke();
      }
    } else {
      // no housing (cosine model) or too small: a circle with a cross
      ctx.beginPath(); ctx.arc(c[0], c[1], 5, 0, 2 * Math.PI);
      ctx.moveTo(c[0] - 3.5, c[1] - 3.5); ctx.lineTo(c[0] + 3.5, c[1] + 3.5); ctx.moveTo(c[0] + 3.5, c[1] - 3.5); ctx.lineTo(c[0] - 3.5, c[1] + 3.5);
      ctx.stroke();
    }
    // the C0 direction
    const r = Math.max(it.a / 2, 0), t = P(it.x + Math.cos(it.psi * Math.PI / 180) * r, it.y + Math.sin(it.psi * Math.PI / 180) * r, z);
    if (t) {
      const ux = t[0] - c[0], uy = t[1] - c[1], l = Math.hypot(ux, uy) || 1, e = Math.max(l, 6);
      ctx.beginPath(); ctx.moveTo(c[0] + ux / l * (e - 3), c[1] + uy / l * (e - 3)); ctx.lineTo(c[0] + ux / l * (e + 4), c[1] + uy / l * (e + 4));
      ctx.lineWidth = 1; ctx.stroke();
    }
    if (plan && Math.min(it.a, it.b) / d.k >= 16) halo(ctx, d.letter(it.type), c[0], c[1], '#111');
  }
  // the snapped point
  if (d.snap) {
    const v = P(d.snap.x, d.snap.y, d.snap.z ?? 0);
    if (v) {
      const [x, y] = v;
      ctx.strokeStyle = d.accent; ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (d.snap.kind === 'vertex') ctx.rect(x - 5, y - 5, 10, 10);
      else if (d.snap.kind === 'mid') { ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y + 4); ctx.lineTo(x - 6, y + 4); ctx.closePath(); }
      else ctx.arc(x, y, 5.5, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }
  // the selection rectangle (plan)
  if (d.box && plan) {
    const [x0, y0, x1, y1] = d.box, a = P(Math.min(x0, x1), Math.max(y0, y1)), b = P(Math.max(x0, x1), Math.min(y0, y1));
    ctx.fillStyle = 'rgba(124,84,254,.08)'; ctx.strokeStyle = d.accent; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    ctx.setLineDash([]);
  }
  if (d.gizmo) drawGizmo(ctx, d.gizmo);
  ctx.restore();
}

/** The gizmo: move — arrows X and Y and the plane square; rotate — the ring about Z. */
export function drawGizmo(ctx, g) {
  const C = GIZMO_COLORS, act = g.active ?? g.hover;
  // every handle over a white halo: readable on the false colours and on the realistic view
  const HALO = 'rgba(255,255,255,.9)';
  const arrow = (from, to, col) => {
    const ux = to[0] - from[0], uy = to[1] - from[1], l = Math.hypot(ux, uy) || 1, nx = ux / l, ny = uy / l;
    const head = () => { ctx.beginPath(); ctx.moveTo(to[0], to[1]); ctx.lineTo(to[0] - nx * 11 - ny * 4.5, to[1] - ny * 11 + nx * 4.5); ctx.lineTo(to[0] - nx * 11 + ny * 4.5, to[1] - ny * 11 - nx * 4.5); ctx.closePath(); };
    const shaft = () => { ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(to[0] - nx * 9, to[1] - ny * 9); };
    ctx.strokeStyle = HALO; ctx.lineWidth = 5; shaft(); ctx.stroke(); head(); ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2; shaft(); ctx.stroke(); head(); ctx.fill();
  };
  ctx.save();
  if (g.tool === 'move') {
    const sq = planeSquareOf(g);
    ctx.beginPath(); sq.forEach((v, k) => (k ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1]))); ctx.closePath();
    ctx.fillStyle = act === 'xy' ? 'rgba(245,183,0,.55)' : 'rgba(255,255,255,.55)'; ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = act === 'xy' ? C.active : C.x; ctx.beginPath(); ctx.moveTo(sq[1][0], sq[1][1]); ctx.lineTo(sq[2][0], sq[2][1]); ctx.stroke();
    ctx.strokeStyle = act === 'xy' ? C.active : C.y; ctx.beginPath(); ctx.moveTo(sq[3][0], sq[3][1]); ctx.lineTo(sq[2][0], sq[2][1]); ctx.stroke();
    arrow(g.o, g.x, act === 'x' || act === 'xy' ? C.active : C.x);
    arrow(g.o, g.y, act === 'y' || act === 'xy' ? C.active : C.y);
    ctx.font = `600 11px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    halo(ctx, 'X', g.x[0] + (g.x[0] - g.o[0]) * 0.18, g.x[1] + (g.x[1] - g.o[1]) * 0.18, C.x);
    halo(ctx, 'Y', g.y[0] + (g.y[0] - g.o[0]) * 0.18, g.y[1] + (g.y[1] - g.o[1]) * 0.18, C.y);
  } else if (g.tool === 'rotate' && g.ring) {
    const ring = () => { ctx.beginPath(); g.ring.forEach((v, k) => (k ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1]))); ctx.closePath(); };
    ctx.strokeStyle = HALO; ctx.lineWidth = act === 'z' ? 6 : 5; ring(); ctx.stroke();
    ctx.strokeStyle = act === 'z' ? C.active : C.z; ctx.lineWidth = act === 'z' ? 3 : 2; ring(); ctx.stroke();
    if (g.angle != null) {
      ctx.font = `600 11px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      halo(ctx, `${g.angle > 0 ? '+' : ''}${Math.round(g.angle)}°`, g.o[0] + 8, g.o[1] - 10, '#111');
    }
  }
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(g.o[0], g.o[1], 2.5, 0, 2 * Math.PI); ctx.fill();
  ctx.restore();
}
function planeSquareOf(g, share = 0.32) {
  const ux = [(g.x[0] - g.o[0]) * share, (g.x[1] - g.o[1]) * share], uy = [(g.y[0] - g.o[0]) * share, (g.y[1] - g.o[1]) * share];
  return [g.o, [g.o[0] + ux[0], g.o[1] + ux[1]], [g.o[0] + ux[0] + uy[0], g.o[1] + ux[1] + uy[1]], [g.o[0] + uy[0], g.o[1] + uy[1]]];
}
