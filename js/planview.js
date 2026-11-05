// 2D overlay of the view (stage 6), drawn on a canvas over the WebGL view whenever the view is
// redrawn, so lines and text stay sharp at any zoom:
//   - on the plan: the room outline, the axes of the luminaire grid, the dimensions (room and grid),
//     and for a shown plane its isolines with their values and the numbers at the GOST points;
//   - in 3D: for a shown plane the numbers at the GOST points and the isoline values, projected
//     (the isolines themselves are 3D lines of the view).
// Colours of the plane are drawn by view3d from the same field. Spec, "Планы Г-0,0 и Г-0,8".

import { labelPlaces } from './isolines.js';

const FONT = '"Suisse Intl","Helvetica Neue",Helvetica,Arial,sans-serif';
/** Spacing of the isoline labels along a line: px on the plan, m in 3D. */
const LABEL_SPACING = 240, LABEL_MIN = 70, LABEL_SPACING_3D = 1.6, LABEL_MIN_3D = 0.8;

/** Illuminance as written on the plan: whole lux from 10 lx, one decimal below. */
export const fmtLux = (v) => (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString('ru-RU');
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
  const labels = [];
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
      for (const p of labelPlaces(sp, closed, LABEL_SPACING, LABEL_MIN)) labels.push({ ...p, text: fmtLux(level) });
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
  for (const l of labels) {
    if (l.x < 0 || l.x > size.w || l.y < 0 || l.y > size.h) continue;
    if (taken.some(([a, b]) => Math.abs(a - l.x) < 26 && Math.abs(b - l.y) < 14)) continue;
    taken.push([l.x, l.y]);
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
  for (const { level, lines } of d.sets) {
    for (const { pts, closed } of lines) {
      for (const q of labelPlaces(pts, closed, LABEL_SPACING_3D, LABEL_MIN_3D)) {
        const p = project(q.x, q.y, d.z);
        if (!p || p[0] < 0 || p[0] > size.w || p[1] < 0 || p[1] > size.h) continue;
        if (taken.some(([a, b]) => Math.abs(a - p[0]) < 24 && Math.abs(b - p[1]) < 12)) continue;
        taken.push(p);
        const text = fmtLux(level), w = ctx.measureText(text).width + 6;
        ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(p[0] - w / 2, p[1] - 7, w, 14);
        ctx.fillStyle = '#222'; ctx.fillText(text, p[0], p[1] + 0.5);
      }
    }
  }
  ctx.restore();
}
