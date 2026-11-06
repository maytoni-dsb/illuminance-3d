// Stage 6 acceptance checks shown on the page ("Критерии этапа 6"): plans of the planes.
// Pure module, no DOM. The page runs them on the plan it shows (maintained values, E = MF · E₀);
// tests/plan.test.mjs runs them on several rooms.
// Check names and details are user-facing and therefore in Russian.

import { bilinear } from './workplane.js';
import { levelIndex, LEVELS } from './colorscale.js';

const pct = (x) => `${(100 * x).toFixed(2).replace('.', ',')} %`;
function exp(x) {
  if (x === 0) return '0';
  const [m, e] = x.toExponential(1).split('e');
  return `${m.replace('.', ',')}·10<sup>${e.replace('-', '−').replace('+', '')}</sup>`;
}

/**
 * Isolines against the colors of the plan. Every vertex of an isoline lies on a cell edge; there
 * the bilinear interpolant (the colors) must equal the level, and just before and after the vertex
 * along the edge the color must change. Inside a cell the straight segment is compared with the
 * curved border: the distance |E(mid) − l| / |∇E| at the midpoint, in cell sizes.
 * @param {{ grid, E }} plan — node values (any scaling, the same as the isolines)
 * @param {{ level, lines }[]} sets — isolines.isolineSet of the same values
 * @returns {{ vertices, onLevel, colorsDiffer, maxMid }}
 */
export function isolineAudit(plan, sets) {
  const { ax, ay, dx, dy } = plan.grid;
  const f = (x, y) => bilinear(plan.E, ax, ay, dx, dy, x, y);
  const cell = Math.min(dx, dy);
  let vertices = 0, onLevel = 0, colorsDiffer = 0, maxMid = 0;
  for (const { level, lines } of sets) {
    const kLevel = LEVELS.indexOf(level);
    for (const { pts, closed } of lines) {
      const n = pts.length / 2;
      for (let k = 0; k < n; k++) {
        const x = pts[2 * k], y = pts[2 * k + 1];
        vertices++;
        if (Math.abs(f(x, y) - level) <= 1e-9 * Math.max(1, level)) onLevel++;
        // along the edge the vertex lies on: a horizontal edge when y is on a grid line
        const onH = Math.abs(y / dy - Math.round(y / dy)) < 1e-9;
        const h = 1e-6 * cell;
        const a = onH ? f(x - h, y) : f(x, y - h), b = onH ? f(x + h, y) : f(x, y + h);
        const ka = levelIndex(a), kb = levelIndex(b);
        if (kLevel < 0 || (Math.min(ka, kb) < kLevel && Math.max(ka, kb) >= kLevel)) colorsDiffer++;
      }
      const seg = closed ? n : n - 1;
      for (let k = 0; k < seg; k++) {
        const k1 = (k + 1) % n;
        const mx = (pts[2 * k] + pts[2 * k1]) / 2, my = (pts[2 * k + 1] + pts[2 * k1 + 1]) / 2;
        const e = 1e-4 * cell;
        const gx = (f(mx + e, my) - f(mx - e, my)) / (2 * e), gy = (f(mx, my + e) - f(mx, my - e)) / (2 * e);
        const g = Math.hypot(gx, gy);
        if (g > 0) maxMid = Math.max(maxMid, Math.abs(f(mx, my) - level) / g / cell);
      }
    }
  }
  return { vertices, onLevel, colorsDiffer, maxMid };
}

/** Trapezoidal area mean of the node values (the plan's own Ē). */
export function nodeMean(plan) {
  const { ax, ay } = plan.grid;
  let s = 0, w = 0;
  for (let j = 0; j <= ay; j++) {
    const wj = j === 0 || j === ay ? 0.5 : 1;
    for (let i = 0; i <= ax; i++) {
      const wi = (i === 0 || i === ax ? 0.5 : 1) * wj;
      s += wi * plan.E[i + j * (ax + 1)]; w += wi;
    }
  }
  return s / w;
}

/**
 * @param {object} plan — calc.plan(z) (E₀ values)
 * @param {{ level, lines }[]} sets — isolines of MF · E
 * @param {number} mf — maintenance factor
 * @param {{ avg:number }} stats — the plane's indices in the results (cell averages, E₀)
 * @returns {{name: string, ok: boolean, detail: string}[]}
 */
export function stage6Checks(plan, sets, mf, stats) {
  const out = [];
  const scaled = { grid: plan.grid, E: plan.E.map((v) => mf * v) };
  const a = isolineAudit(scaled, sets);
  out.push({
    name: 'Изолинии проходят по границам цветов',
    ok: a.vertices > 0 ? a.onLevel === a.vertices && a.colorsDiffer === a.vertices && a.maxMid < 0.05 : true,
    detail: a.vertices > 0
      ? `${a.vertices.toLocaleString('ru-RU')} вершин на ребрах ячеек: на уровне — ${a.onLevel.toLocaleString('ru-RU')}, цвет по обе стороны разный — ${a.colorsDiffer.toLocaleString('ru-RU')}; середины отрезков отстоят от границы цвета не больше ${exp(a.maxMid)} ячейки`
      : 'на плане нет изолиний (освещенность в пределах одного уровня шкалы)',
  });

  const m = nodeMean(plan), dev = m / stats.avg - 1;
  out.push({
    name: 'Ē плана совпадает с Ē в результатах (0,5 %)',
    ok: Math.abs(dev) <= 0.005,
    detail: `по узлам вспомогательной сетки ${(mf * m).toFixed(1).replace('.', ',')} лк, по ячейкам ${(mf * stats.avg).toFixed(1).replace('.', ',')} лк, отличие ${pct(dev)}`,
  });

  // the reflected part between the mesh vertices is interpolated: compare with the exact sum at
  // the GOST points, as a share of the total illuminance there
  const v = plan.vertices, g = plan.gost;
  let worst = 0;
  for (let k = 0; k < g.E.length; k++) {
    const r = bilinear(v.E, v.nx, v.ny, v.dx, v.dy, g.pts[3 * k], g.pts[3 * k + 1]);
    if (g.E[k] > 0) worst = Math.max(worst, Math.abs(r - g.Eref[k]) / g.E[k]);
  }
  out.push({
    name: 'Отраженная между вершинами сетки: интерполяция против точного расчета (1 %)',
    ok: worst <= 0.01,
    detail: `в ${g.E.length} точках сетки ГОСТ наибольшее отличие ${pct(worst)} от полной освещенности`,
  });
  return out;
}
