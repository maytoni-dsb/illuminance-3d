// Тесты этапа 1: геометрия и разбиение. Запуск: npm test (node --test tests/)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  divisions, createRoom, FACE_DEFS, facePoint, elementCenter, localIndex,
  globalIndex, fromGlobalIndex, elementCenters, faceVertexValues,
} from '../js/geometry.js';

const EPS = 1e-12;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

const DEFAULT = { L: 6, W: 4, H: 3, h: 0.25 };

test('divisions: ⌈a/h⌉ без ошибки округления', () => {
  assert.equal(divisions(6, 0.25), 24);
  assert.equal(divisions(5.1, 0.25), 21);      // 20,4 → 21
  assert.equal(divisions(1.1, 0.1), 11);       // 1.1/0.1 = 11.000000000000002
  assert.equal(divisions(0.7, 0.1), 7);
  assert.equal(divisions(3, 0.3), 10);
  assert.equal(divisions(0.1, 1), 1);          // размер меньше шага → 1 элемент
  assert.throws(() => divisions(0, 0.25), RangeError);
  // перебор «круглых» размеров и шагов из допустимых диапазонов
  for (let hc = 10; hc <= 100; hc += 5) {
    const h = hc / 100;
    for (let k = 1; k * h <= 50 + 1e-9; k++) {
      const a = Number((k * h).toFixed(10));
      assert.equal(divisions(a, h), k, `a=${a}, h=${h}`);
    }
  }
});

test('число элементов совпадает с n_L, n_W, n_H (комната по умолчанию)', () => {
  const r = createRoom(DEFAULT);
  assert.deepEqual({ ...r.n }, { L: 24, W: 16, H: 12 });
  const expected = [24 * 16, 24 * 16, 24 * 12, 24 * 12, 16 * 12, 16 * 12];
  assert.deepEqual(r.faces.map((f) => f.count), expected);
  assert.deepEqual(r.faces.map((f) => [f.nu, f.nv]), [[24, 16], [24, 16], [24, 12], [24, 12], [16, 12], [16, 12]]);
  assert.equal(r.N, 2 * (24 * 16 + 24 * 12 + 16 * 12));
  assert.equal(r.N, 1728);
});

test('число элементов для некратных размеров', () => {
  const r = createRoom({ L: 7.3, W: 2.05, H: 2.7, h: 0.3 });
  const nL = Math.ceil(7.3 / 0.3), nW = Math.ceil(2.05 / 0.3), nH = 9;
  assert.deepEqual({ ...r.n }, { L: nL, W: nW, H: nH });
  assert.equal(r.N, 2 * (nL * nW + nL * nH + nW * nH));
  assert.ok(near(r.d.L * nL, 7.3) && near(r.d.W * nW, 2.05) && near(r.d.H * nH, 2.7));
  assert.ok(r.d.L <= 0.3 + 1e-12 && r.d.W <= 0.3 + 1e-12 && r.d.H <= 0.3 + 1e-12);
});

test('нормали единичные, перпендикулярны граням и направлены внутрь', () => {
  for (const p of [DEFAULT, { L: 1, W: 50, H: 20, h: 1 }, { L: 12.4, W: 3.3, H: 2.1, h: 0.1 }]) {
    const r = createRoom(p);
    const center = [p.L / 2, p.W / 2, p.H / 2];
    for (const f of r.faces) {
      assert.ok(near(dot(f.normal, f.normal), 1), `${f.name}: |n| = 1`);
      assert.ok(Math.abs(dot(f.normal, f.u)) < EPS && Math.abs(dot(f.normal, f.v)) < EPS, `${f.name}: n ⟂ u, v`);
      // центр грани + малый шаг по нормали попадает внутрь комнаты
      const c = facePoint(f, f.sizeU / 2, f.sizeV / 2);
      const q = c.map((x, k) => x + 1e-3 * f.normal[k]);
      assert.ok(q[0] > 0 && q[0] < p.L && q[1] > 0 && q[1] < p.W && q[2] > 0 && q[2] < p.H, `${f.name}: нормаль внутрь`);
      // нормаль смотрит на центр комнаты
      assert.ok(dot(f.normal, center.map((x, k) => x - c[k])) > 0, `${f.name}: нормаль на центр`);
    }
  }
});

test('таблица граней: плоскости, начала, оси', () => {
  const r = createRoom(DEFAULT);
  const { L, W, H } = DEFAULT;
  const plane = [[2, 0], [2, H], [1, 0], [1, W], [0, 0], [0, L]]; // [ось, значение]
  for (const f of r.faces) {
    const [axis, val] = plane[f.id];
    for (const [u, v] of [[0, 0], [f.sizeU, 0], [0, f.sizeV], [f.sizeU, f.sizeV], [f.sizeU / 3, f.sizeV / 7]]) {
      const p = facePoint(f, u, v);
      assert.ok(near(p[axis], val), `${f.name}: точка в плоскости`);
      assert.ok(p.every((x, k) => x >= -EPS && x <= [L, W, H][k] + 1e-9), `${f.name}: точка в пределах комнаты`);
    }
  }
  assert.deepEqual([...r.faces[3].origin], [0, W, 0]);
  assert.deepEqual([...r.faces[5].origin], [L, 0, 0]);
  assert.deepEqual([...r.faces[1].origin], [0, 0, H]);
  // у потолка u × v ≠ n — нормаль хранится явно (спецификация)
  assert.deepEqual(cross(r.faces[1].u, r.faces[1].v), [0, 0, 1]);
  assert.deepEqual([...r.faces[1].normal], [0, 0, -1]);
});

test('общие рёбра: элементы граней с одним ребром совпадают по размеру', () => {
  const r = createRoom({ L: 5.1, W: 3.7, H: 2.9, h: 0.25 });
  const [floor, ceil, y0, yW, x0, xL] = r.faces;
  for (const f of [floor, ceil, y0, yW]) assert.equal(f.du, r.d.L);
  for (const f of [floor, ceil]) assert.equal(f.dv, r.d.W);
  for (const f of [x0, xL]) assert.equal(f.du, r.d.W);
  for (const f of [y0, yW, x0, xL]) assert.equal(f.dv, r.d.H);
  // площадь: сумма элементов = площадь грани
  for (const f of r.faces) assert.ok(near(f.elementArea * f.count, f.area));
});

test('центры элементов и индексы', () => {
  const r = createRoom({ L: 2, W: 1.5, H: 1, h: 0.5 });
  const f = r.faces[2]; // стена y = 0: u = +X, v = +Z
  assert.deepEqual(elementCenter(f, 0, 0), [0.25, 0, 0.25]);
  assert.deepEqual(elementCenter(f, 3, 1), [1.75, 0, 0.75]);
  assert.equal(localIndex(f, 3, 1), 3 + 1 * 4);
  assert.equal(globalIndex(r, 2, 3, 1), r.offset[2] + 7);

  // offset непрерывен, глобальные индексы покрывают 0…N−1 ровно по разу
  assert.equal(r.offset[0], 0);
  assert.equal(r.offset[6], r.N);
  const seen = new Uint8Array(r.N);
  for (const face of r.faces) {
    assert.equal(face.offset, r.offset[face.id]);
    for (let j = 0; j < face.nv; j++) for (let i = 0; i < face.nu; i++) {
      const g = globalIndex(r, face.id, i, j);
      seen[g]++;
      assert.deepEqual(fromGlobalIndex(r, g), { f: face.id, i, j });
    }
  }
  assert.ok(seen.every((c) => c === 1));
  assert.throws(() => fromGlobalIndex(r, r.N), RangeError);

  // массив центров согласован с elementCenter
  const C = elementCenters(r);
  assert.equal(C.length, 3 * r.N);
  const g = globalIndex(r, 5, 2, 1);
  assert.deepEqual([C[3 * g], C[3 * g + 1], C[3 * g + 2]], elementCenter(r.faces[5], 2, 1));
});

test('значения в вершинах: среднее только по своей грани', () => {
  const r = createRoom({ L: 3, W: 2, H: 1, h: 1 });
  // значение = глобальный индекс; у соседних граней совсем другие числа
  const vals = Float64Array.from({ length: r.N }, (_, g) => g);
  const f = r.faces[0]; // пол 3×2
  const vv = faceVertexValues(f, vals);
  assert.equal(vv.length, (f.nu + 1) * (f.nv + 1));
  const e = (i, j) => vals[f.offset + i + j * f.nu];
  assert.equal(vv[0], e(0, 0));                                   // угол — один элемент
  assert.equal(vv[1], (e(0, 0) + e(1, 0)) / 2);                   // ребро — два
  assert.equal(vv[1 + 1 * 4], (e(0, 0) + e(1, 0) + e(0, 1) + e(1, 1)) / 4); // внутри — четыре
  assert.equal(vv[3 + 2 * 4], e(2, 1));
  // постоянное поле остаётся постоянным на каждой грани
  const c = new Float64Array(r.N);
  for (const face of r.faces) c.fill(face.id + 10, face.offset, face.offset + face.count);
  for (const face of r.faces) assert.ok(faceVertexValues(face, c).every((x) => x === face.id + 10));
});

test('FACE_DEFS неизменяем, недопустимые размеры отклоняются', () => {
  assert.ok(Object.isFrozen(FACE_DEFS));
  assert.throws(() => createRoom({ L: 0, W: 4, H: 3, h: 0.25 }), RangeError);
  assert.throws(() => createRoom({ L: 6, W: NaN, H: 3, h: 0.25 }), RangeError);
});
