// 2D overlay of the plan of a work plane (stage 6): outline, isolines with their values, numbers at
// the points of the GOST grid. Drawn on a canvas over the 3D view whenever the plan is redrawn
// (view3d calls opts.onPlanDraw with the current room → screen transform), so lines and text stay
// sharp at any zoom. The colors under it are drawn by view3d (planeMaterial) from the same field.
// Spec, "Планы Г-0,0 и Г-0,8".

import { labelPlaces } from './isolines.js';

const FONT = '"Suisse Intl","Helvetica Neue",Helvetica,Arial,sans-serif';
/** Spacing of the isoline labels along a line, px; lines shorter than LABEL_MIN get none. */
const LABEL_SPACING = 240, LABEL_MIN = 70;

const fmt = (v) => (v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v) : Math.round(v * 10) / 10)
  .toLocaleString('ru-RU');

/**
 * @param {CanvasRenderingContext2D} ctx — CSS px coordinates
 * @param {{ x:(x:number)=>number, y:(y:number)=>number, k:number }} T — room metres → px
 * @param {{ w:number, h:number }} size — view, px
 * @param {{ L:number, W:number, sets: {level:number, lines:{pts:Float64Array, closed:boolean}[]}[],
 *           gost: { pts: Float64Array, values: ArrayLike<number>, nx:number, ny:number, dx:number, dy:number } }} d
 */
export function drawPlan(ctx, T, size, d) {
  const x0 = T.x(0), x1 = T.x(d.L), y0 = T.y(0), y1 = T.y(d.W); // y1 < y0 (room +Y is up)
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // isolines, clipped to the plane
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
      for (const p of labelPlaces(sp, closed, LABEL_SPACING, LABEL_MIN)) labels.push({ ...p, text: fmt(level) });
    }
  }

  // numbers at the GOST points: as many as fit without overlapping
  ctx.font = `600 11px ${FONT}`;
  const g = d.gost;
  const wide = Math.max(...Array.from(g.values, (v) => ctx.measureText(fmt(v)).width)) + 6;
  const stepX = Math.max(1, Math.ceil(wide / Math.max(1e-6, g.dx / T.k)));
  const stepY = Math.max(1, Math.ceil(16 / Math.max(1e-6, g.dy / T.k)));
  const step = Math.max(stepX, stepY);
  const halo = (text, x, y) => {
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.strokeText(text, x, y);
    ctx.fillStyle = '#111'; ctx.fillText(text, x, y);
  };
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
      halo(fmt(g.values[k]), px, py - 9);
      taken.push([px, py - 6]);
    }
  }

  // isoline labels: skip those too close to a number or another label
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

  // outline of the plane
  ctx.strokeStyle = 'rgba(20,20,20,.9)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x0, y1, x1 - x0, y0 - y1);
}
