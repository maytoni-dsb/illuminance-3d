// Stage 2.1: generators of the luminaire groups, the placement check and the edits of the editor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupPoints, groupCount, housingHalf, boxInOutline, pointInOutline, clampToRoom, moveGroup, movePoints, ungroup, wrapDeg,
  turnLuminaires, areaCentre, areaOf,
} from '../js/groups.js';
import { modelFromValues, instances, calcParams, placementErrors, lumCount, cleanModel, isFormModel, newId } from '../js/model.js';
import { createCalc } from '../js/calc.js';
import { luminaireGrid } from '../js/photometry.js';
import { rectOutline } from '../js/geometry.js';
import { DEFAULTS, ceilingDrop } from '../js/ui.js';

const DEG = Math.PI / 180;
const room = { L: 6, W: 4 };
const near = (a, b, eps = 1e-12) => Math.abs(a - b) <= eps;
const pts = (g) => groupPoints(g, room);

test('grid: without an area the points of version 1, with an area the same pattern inside it', () => {
  const g = { kind: 'grid', nx: 4, ny: 3, hm: 3, psi: 30 };
  const want = luminaireGrid({ L: 6, W: 4, H: 3, nx: 4, ny: 3 });
  pts(g).forEach((p, k) => { assert.equal(p.x, want[k].pos[0]); assert.equal(p.y, want[k].pos[1]); assert.equal(p.psi, 30); });
  const a = pts({ ...g, area: { x0: 1, y0: 0.5, x1: 5, y1: 3.5 } });
  assert.deepEqual([a[0].x, a[0].y, a[11].x, a[11].y], [1.5, 1, 4.5, 3]);
});

test('line: n luminaires from the start to the end, heights between the ends, ψ from the direction', () => {
  const g = { kind: 'line', x0: 1, y0: 1, x1: 1, y1: 4, n: 4, hm: 3, hm1: 2.4, psi: 0 };
  const p = pts(g);
  assert.equal(p.length, 4);
  assert.ok(near(p[0].y, 1) && near(p[3].y, 4) && near(p[1].y, 2));
  assert.ok(near(p[0].hm, 3) && near(p[3].hm, 2.4) && near(p[1].hm, 2.8));
  assert.ok(p.every((q) => near(q.x, 1) && near(q.psi, 90)));       // a line along +Y: C0 along +Y
  assert.ok(near(pts({ ...g, psi: 90 })[0].psi, 180));
  const one = pts({ ...g, n: 1 });
  assert.ok(near(one[0].y, 2.5) && near(one[0].hm, 2.7));
  assert.ok(near(pts({ ...g, y0: 4, y1: 1 })[0].psi, 270));         // reversed: ψ turns by 180°
});

test('circle: from +X counter-clockwise; ψ from the radius (90° — along the tangent)', () => {
  const g = { kind: 'circle', cx: 3, cy: 2, r: 1.5, n: 8, hm: 3, psi: 90 };
  const p = pts(g);
  assert.equal(p.length, 8);
  for (const [k, q] of p.entries()) {
    assert.ok(near(Math.hypot(q.x - 3, q.y - 2), 1.5));
    assert.ok(near(q.psi, wrapDeg(45 * k + 90)), `${k}`);
  }
  assert.ok(near(p[0].x, 4.5) && near(p[2].y, 3.5));
  assert.ok(near(pts({ ...g, psi: 0 })[1].psi, 45));
});

test('turning the luminaires of a group or of some single luminaires', () => {
  const g = { kind: 'circle', cx: 3, cy: 2, r: 1, n: 4, hm: 3, psi: 0 };
  assert.equal(turnLuminaires(g, 30).psi, 30);
  assert.equal(turnLuminaires(g, -30).psi, 330);
  const s = { kind: 'single', points: [{ x: 1, y: 1, hm: 3, psi: 0 }, { x: 2, y: 1, hm: 3, psi: 350 }] };
  assert.deepEqual(turnLuminaires(s, 20, [1]).points.map((q) => q.psi), [0, 10]);
  assert.deepEqual(turnLuminaires(s, 20).points.map((q) => q.psi), [20, 10]);
  const a = areaCentre({ x0: 1, y0: 0.5, x1: 5, y1: 3.5 });
  assert.deepEqual(a, { cx: 3, cy: 2, w: 4, h: 3 });
  assert.deepEqual(areaOf(3, 2, 4, 3), { x0: 1, y0: 0.5, x1: 5, y1: 3.5 });
});

test('group counts equal the generated points for many parameters', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 300; k++) {
    for (const g of [
      { kind: 'line', x0: 6 * rnd(), y0: 4 * rnd(), x1: 6 * rnd(), y1: 4 * rnd(), n: 1 + Math.floor(9 * rnd()), hm: 3, hm1: 2 + rnd(), psi: 360 * rnd() },
      { kind: 'circle', cx: 3, cy: 2, r: 0.1 + rnd(), n: 1 + Math.floor(12 * rnd()), hm: 3, psi: 360 * rnd() },
      { kind: 'grid', nx: 1 + Math.floor(5 * rnd()), ny: 1 + Math.floor(5 * rnd()), hm: 3, psi: 0, area: { x0: rnd(), y0: rnd(), x1: 2 + rnd(), y1: 2 + rnd() } }]) {
      assert.equal(pts(g).length, groupCount(g), JSON.stringify(g));
      assert.ok(pts(g).every((q) => q.psi >= 0 && q.psi < 360));
    }
  }
});

test('half sizes of a turned housing along X and Y', () => {
  const s = { a: 1.2, b: 0.2 };
  assert.deepEqual(housingHalf(s, 0), [0.6, 0.1]);
  const h90 = housingHalf(s, 90);
  assert.ok(near(h90[0], 0.1) && near(h90[1], 0.6));
  const h45 = housingHalf(s, 45);
  assert.ok(near(h45[0], 0.7 * Math.SQRT1_2) && near(h45[1], 0.7 * Math.SQRT1_2));
  assert.deepEqual(housingHalf(null, 30), [0, 0]);
});

test('a housing must lie inside the outline: half its size along each axis from the walls', () => {
  const o = rectOutline(6, 4);
  assert.ok(boxInOutline(o, 0.6, 2, 0.6, 0.1));
  assert.ok(!boxInOutline(o, 0.59, 2, 0.6, 0.1));
  assert.ok(boxInOutline(o, 3, 0.1, 0.6, 0.1));
  assert.ok(!boxInOutline(o, 3, 0.09, 0.6, 0.1));
  assert.ok(boxInOutline(o, 0, 0, 0, 0));          // a point on the corner is inside
  assert.ok(!pointInOutline(o, -1e-6, 1));
  // an L-shaped outline: a box over the inner corner is outside although its corners are inside
  const L = [[0, 0], [6, 0], [6, 2], [3, 2], [3, 4], [0, 4]];
  assert.ok(!pointInOutline(L, 4, 3));
  assert.ok(boxInOutline(L, 1.5, 3, 0.5, 0.5));
  assert.ok(!boxInOutline(L, 3, 2, 0.5, 0.5));
  // dragging stops at the wall
  assert.deepEqual(clampToRoom(-1, 5, 0.6, 0.1, 6, 4), [0.6, 3.9]);
  assert.deepEqual(clampToRoom(2, 2, 4, 0.1, 6, 4), [3, 2]);
});

test('placement errors: outside the room, the height range and the work plane', () => {
  const m = modelFromValues({ ...DEFAULTS, hwp: 0.8 });
  const sizeOf = () => ({ a: 1.2, b: 0.2, h: 0.1 });
  assert.deepEqual(placementErrors(m, sizeOf), []);
  m.groups.push({ id: 'g2', type: 't1', kind: 'single', points: [
    { x: 0.6, y: 2, hm: 3, psi: 0 },    // touches the wall: fine
    { x: 0.5, y: 2, hm: 3, psi: 0 },    // housing through the wall
    { x: 0.5, y: 2, hm: 3, psi: 90 },   // turned: 0.1 from the wall is enough
    { x: 3, y: 2, hm: 3.5, psi: 0 },    // above the ceiling
    { x: 3, y: 2, hm: 0.9, psi: 0 },    // photometric centre 0.8: not above the work plane
  ] });
  assert.deepEqual(placementErrors(m, sizeOf).map((e) => `${e.group}:${e.index}:${e.code}`), ['g2:1:outside', 'g2:3:height', 'g2:4:low']);
  // the cosine model has no housing: a luminaire on the wall is inside
  m.groups[1].points = [{ x: 0, y: 2, hm: 3, psi: 0 }];
  assert.deepEqual(placementErrors(m), []);
});

test('moving a group, single luminaires and ungrouping keep the luminaires', () => {
  const g = { id: 'g1', type: 't1', kind: 'grid', nx: 3, ny: 2, hm: 3, psi: 0 };
  const moved = moveGroup(g, 0.5, -0.25, room);
  assert.deepEqual(moved.area, { x0: 0.5, y0: -0.25, x1: 6.5, y1: 3.75 });
  pts(moved).forEach((p, k) => { assert.ok(near(p.x, pts(g)[k].x + 0.5)); assert.ok(near(p.y, pts(g)[k].y - 0.25)); });
  for (const h of [{ kind: 'line', x0: 1, y0: 1, x1: 5, y1: 1, n: 3, hm: 3, hm1: 3, psi: 10 },
    { kind: 'circle', cx: 3, cy: 2, r: 1, n: 5, hm: 2.5, psi: 90 }]) {
    const m2 = moveGroup(h, 1, 1, room);
    pts(m2).forEach((p, k) => assert.ok(near(p.x, pts(h)[k].x + 1) && near(p.y, pts(h)[k].y + 1) && near(p.psi, pts(h)[k].psi)));
    const u = ungroup({ id: 'gx', type: 't2', ...h }, room);
    assert.equal(u.kind, 'single');
    assert.equal(u.id, 'gx');
    assert.equal(u.type, 't2');
    assert.deepEqual(pts(u), pts(h));
  }
  const s = movePoints(ungroup({ id: 'g', type: 't', ...g }, room), [1], 0.1, 0);
  assert.ok(near(s.points[1].x, pts(g)[1].x + 0.1) && s.points[0].x === pts(g)[0].x);
  assert.throws(() => movePoints(g, [0], 1, 1), RangeError);
});

test('a model with several types and groups: file round trip, limits, the calculation', () => {
  const m = modelFromValues({ ...DEFAULTS, L: 8, W: 5, H: 3 });
  m.types.push({ id: newId(m.types, 't'), name: 'Downlight', photometry: 'cosine', flux: 1500, cct: 3000, power: 12, file: null });
  m.groups.push(
    { id: 'g2', type: 't2', kind: 'line', x0: 1, y0: 4.5, x1: 7, y1: 4.5, n: 5, hm: 2.8, hm1: 2.6, psi: 0 },
    { id: 'g3', type: 't2', kind: 'grid', nx: 3, ny: 2, hm: 3, psi: 0, area: { x0: 0.5, y0: 0.2, x1: 3.5, y1: 1.4 } },
    { id: 'g4', type: 't1', kind: 'circle', cx: 5.5, cy: 2, r: 1, n: 6, hm: 2.6, psi: 90 },
    { id: 'g5', type: 't2', kind: 'single', points: [{ x: 7.5, y: 0.5, hm: 2.2, psi: 30 }] },
  );
  assert.equal(newId(m.groups, 'g'), 'g6');
  assert.ok(!isFormModel(m));
  assert.deepEqual(cleanModel(JSON.parse(JSON.stringify(m))), m);
  assert.deepEqual(placementErrors(m), []);
  const n = lumCount(m);
  assert.equal(n, 6 + 5 + 6 + 6 + 1);
  const p = calcParams(m);
  assert.equal(p.lums.length, n);
  const r = createCalc().run(p);
  assert.deepEqual(r.types.map((t) => [t.id, t.count]), [['t1', 12], ['t2', 12]]);
  assert.ok(r.checks3.every((c) => c.ok), JSON.stringify(r.checks3));
  const out = { ...p, lums: [...p.lums, { type: 't2', pos: [8.5, 2, 2.5], psi: 0 }] };
  assert.throws(() => createCalc().run(out), /outside the room/);
});

test('reading a version 2 room: wrong values get defaults, groups of the first editor are converted', () => {
  const m = modelFromValues({ ...DEFAULTS });
  const room = { L: 6, W: 4 };
  const bad = JSON.parse(JSON.stringify(m));
  bad.groups.push({ id: 'g2', type: 't1', kind: 'circle', cx: 'x', cy: 2, r: -1, n: 0, hm: 99, psi: -90 });
  assert.deepEqual(cleanModel(bad).groups[1], { id: 'g2', type: 't1', kind: 'circle', cx: 3, cy: 2, r: 1, n: 6, hm: 3, psi: 270 });
  // the first editor: a line by step, several lines, a tangent circle with a start angle
  const old = [
    { id: 'g2', type: 't1', kind: 'line', x0: 0, y0: 2, x1: 6, y1: 2, by: 'step', n: 1, step: 1.5, off: 0.4, hm: 3, psi: 0 },
    { id: 'g3', type: 't1', kind: 'lines', x0: 1, y0: 1, x1: 5, y1: 1, by: 'count', n: 3, step: 1, off: 0, hm: 3, psi: 0, rows: 2, gap: 1 },
    { id: 'g4', type: 't1', kind: 'circle', cx: 3, cy: 2, r: 1, n: 4, start: 10, orient: 'tangent', hm: 3, psi: 0 },
    { id: 'g5', type: 't1', kind: 'circle', cx: 3, cy: 2, r: 1, n: 4, start: 0, orient: 'tangent', hm: 3, psi: 0 },
    { id: 'g6', type: 't1', kind: 'line', x0: 1, y0: 3, x1: 5, y1: 3, by: 'count', n: 3, step: 1, off: 0, hm: 2.8, psi: 0 },
  ];
  const c = cleanModel({ ...JSON.parse(JSON.stringify(m)), groups: [...m.groups, ...old] }).groups;
  assert.deepEqual(c.map((g) => g.kind), ['grid', 'single', 'single', 'single', 'circle', 'line']);
  assert.deepEqual(groupPoints(c[1], room).map((q) => +q.x.toFixed(6)), [0.75, 2.25, 3.75, 5.25]);
  assert.deepEqual(groupPoints(c[2], room).map((q) => [q.x, q.y]), [[1, 1], [3, 1], [5, 1], [1, 2], [3, 2], [5, 2]]);
  assert.ok(near(groupPoints(c[3], room)[0].psi, 100));
  assert.equal(c[4].psi, 90);
  assert.deepEqual([c[5].n, c[5].hm, c[5].hm1], [3, 2.8, 2.8]);
  const fail = (d, code) => assert.throws(() => cleanModel(d), (e) => e.code === code);
  fail({ ...m, groups: [...m.groups, { ...m.groups[0] }] }, 'model');
  fail({ ...m, groups: [{ ...m.groups[0], type: 'nope' }] }, 'model');
  fail({ ...m, groups: [{ ...m.groups[0], kind: 'spiral' }] }, 'model.kind');
  fail({ ...m, groups: [{ ...m.groups[0], nx: 30, ny: 30 }] }, 'model.count');
  fail({ ...m, types: [] }, 'model');
  assert.equal(cleanModel({ ...m, groups: [{ ...m.groups[0], area: { x0: 2, y0: 0, x1: 1, y1: 4 } }] }).groups[0].area, undefined);
  assert.ok(isFormModel(cleanModel(m)));
});

test('the grid of version 1 through the generic instances: identical positions and heights', () => {
  const v = { ...DEFAULTS, L: 7.3, W: 4.9, H: 3.3, nx: 6, ny: 4, hm: 3.1, psi: 90 };
  const got = instances(modelFromValues(v), () => 0.05);
  const want = luminaireGrid({ L: v.L, W: v.W, H: v.H, nx: v.nx, ny: v.ny, hc: ceilingDrop(v.H, v.hm, 0.05), psi: v.psi * DEG });
  got.forEach((l, k) => { assert.deepEqual(l.pos, [...want[k].pos]); assert.equal(l.psi, want[k].psi); });
});
