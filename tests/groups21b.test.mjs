// Stage 2.1, the interface pass of 21 Nov 2026: the ways of spacing of grids and lines (after DIALux)
// and the arcs of circle groups.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupPoints, spacing, normArc, turnArc, fullCircle } from '../js/groups.js';
import { cleanModel, modelFromValues, calcParams } from '../js/model.js';
import { DEFAULTS } from '../js/ui.js';

const room = { L: 6, W: 4 };
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-12);

test('spacing along a segment: in, edge, axis; one luminaire in the middle', () => {
  assert.ok(near(spacing(3, 6, 'in'), [1, 3, 5]));
  assert.ok(near(spacing(3, 6, 'axis'), [0, 3, 6]));
  assert.ok(near(spacing(3, 6, 'edge', 0.25), [0.25, 3, 5.75]));
  assert.ok(near(spacing(3, 6, 'edge'), [0, 3, 6]));              // no housing: as 'axis'
  for (const w of ['in', 'edge', 'axis']) assert.deepEqual(spacing(1, 6, w, 0.3), [3]);
});

test('grid: the way "in" is version 1 bit for bit; edge and axis over the area', () => {
  const g = { kind: 'grid', nx: 3, ny: 2, hm: 3, psi: 0 };
  assert.deepEqual(groupPoints({ ...g, mx: 'in', my: 'in' }, room), groupPoints(g, room));
  const pts = groupPoints({ ...g, mx: 'axis', my: 'edge' }, room, { a: 0.4, b: 0.2 });
  assert.ok(near(pts.map((p) => p.x).slice(0, 3), [0, 3, 6]));
  assert.ok(near([pts[0].y, pts[3].y], [0.1, 3.9]));               // b along Y at ψ = 0
  const turned = groupPoints({ ...g, psi: 90, mx: 'edge', my: 'edge' }, room, { a: 0.4, b: 0.2 });
  assert.ok(near([turned[0].x, turned[0].y], [0.1, 0.2]));          // turned by 90°: a along Y
});

test('line: axis is the old line; in and edge', () => {
  const g = { kind: 'line', x0: 0, y0: 1, x1: 4, y1: 1, n: 3, hm: 3, hm1: 2, psi: 0 };
  assert.deepEqual(groupPoints({ ...g, m: 'axis' }, room), groupPoints(g, room));
  const a = groupPoints({ ...g, m: 'in' }, room);
  assert.ok(near(a.map((p) => p.x), [4 / 6, 2, 4 - 4 / 6]));
  assert.ok(Math.abs(a[1].hm - 2.5) < 1e-12);
  assert.ok(near(groupPoints({ ...g, m: 'edge' }, room, { a: 0.5, b: 0.1 }).map((p) => p.x), [0.25, 2, 3.75]));
});

test('circle: the full circle from 0° as before, shifted circles and arcs', () => {
  const g = { kind: 'circle', cx: 3, cy: 2, r: 1, n: 4, hm: 3, psi: 0 };
  assert.deepEqual(groupPoints({ ...g, a0: 0, a1: 360 }, room), groupPoints(g, room));
  const s = groupPoints({ ...g, a0: 30, a1: 390 }, room);
  assert.ok(Math.abs(s[0].psi - 30) < 1e-9 && Math.abs(s[1].psi - 120) < 1e-9);
  const arc = groupPoints({ ...g, n: 3, a0: 0, a1: 90 }, room);
  assert.ok(near(arc.map((p) => p.psi), [0, 45, 90]));
  assert.ok(Math.abs(groupPoints({ ...g, n: 1, a0: 0, a1: 90 }, room)[0].psi - 45) < 1e-9);
  assert.ok(fullCircle(g) && fullCircle({ a0: 30, a1: 390 }) && !fullCircle({ a0: 0, a1: 90 }));
});

test('arc angles: a0 in [0, 360), a1 in (a0, a0 + 360]; turning moves both', () => {
  assert.deepEqual(normArc(300, 60), [300, 420]);
  assert.deepEqual(normArc(-30, 30), [330, 390]);
  assert.deepEqual(normArc(30, 30), [30, 390]);
  assert.deepEqual(normArc(0, 1000), [0, 280]);
  const g = { kind: 'circle', a0: 350, a1: 710 };
  assert.deepEqual([turnArc(g, 20).a0, turnArc(g, 20).a1], [10, 370]);
  assert.equal(turnArc({ kind: 'circle', a0: 340, a1: 700 }, 20).a0, undefined); // back to 0…360
});

test('the project keeps the ways and the arc; version 1 projects are unchanged', () => {
  let m = modelFromValues(DEFAULTS);
  const v1 = calcParams(m);
  m = { ...m, groups: [{ ...m.groups[0], mx: 'axis', my: 'in' }, { id: 'g2', type: 't1', kind: 'line', x0: 1, y0: 1, x1: 5, y1: 1, n: 2, hm: 3, hm1: 3, psi: 0, m: 'edge' },
    { id: 'g3', type: 't1', kind: 'circle', cx: 3, cy: 2, r: 1, n: 3, hm: 3, psi: 0, a0: 300, a1: 60 }] };
  const c = cleanModel(JSON.parse(JSON.stringify(m)));
  assert.equal(c.groups[0].mx, 'axis');
  assert.equal(c.groups[0].my, undefined);
  assert.equal(c.groups[1].m, 'edge');
  assert.deepEqual([c.groups[2].a0, c.groups[2].a1], [300, 420]);
  assert.deepEqual(calcParams(modelFromValues(DEFAULTS)).lums, v1.lums);
});
