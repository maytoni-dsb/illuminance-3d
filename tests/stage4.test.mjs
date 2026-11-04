// Stage 4 tests: calculation pipeline (calc.js), worker module loader (worker.js), realistic view (tonemap.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCalc } from '../js/calc.js';
import { moduleDeps, rewriteImports } from '../js/worker.js';
import { createRoom, autoStep } from '../js/geometry.js';
import {
  luminance, adaptationLuminance, wardScale, shoulder, srgbEncode, displayValue, exposure, L_DMAX, SHOULDER,
} from '../js/tonemap.js';

const jsDir = fileURLToPath(new URL('../js/', import.meta.url));
const P = { L: 6, W: 4, H: 3, nx: 3, ny: 2, flux: 4000, hc: 0, psi: 0, phot: 'cosine', fUp: 0.3, rho: [0.2, 0.7, 0.5, 0.5, 0.5, 0.5] };

// ---------------------------------------------------------------------------------------------
// Pipeline

test('calc: results, criteria and reuse of the kernel and the direct component', () => {
  const calc = createCalc();
  const a = calc.run(P);
  assert.equal(a.N, 4206);
  assert.equal(a.Edir.length, a.N);
  assert.ok(a.converged && Math.abs(a.balance.rel) < 1e-10);
  assert.ok(a.checks3.every((c) => c.ok), JSON.stringify(a.checks3));
  assert.ok(a.checks4.every((c) => c.ok), JSON.stringify(a.checks4));
  assert.deepEqual(a.reused, { kernel: false, direct: false });

  const b = calc.run({ ...P, rho: [0.3, 0.8, 0.6, 0.6, 0.6, 0.6], checks: false });   // ρ only
  assert.deepEqual(b.reused, { kernel: true, direct: true });
  assert.equal(b.ms.kernel, 0);
  assert.ok(b.checks4 === undefined);
  const c = calc.run({ ...P, nx: 4, checks: false });                                  // luminaires
  assert.deepEqual(c.reused, { kernel: true, direct: false });
  const d = calc.run({ ...P, L: 7, checks: false });                                   // geometry
  assert.deepEqual(d.reused, { kernel: false, direct: false });
  // f_up is ignored by the cosine model: no recalculation of the direct component
  const e = calc.run({ ...P, L: 7, fUp: 0.9, checks: false });
  assert.equal(e.reused.direct, true);
});

test('calc: a warm start gives the same result as a cold one (within ε)', () => {
  const warm = createCalc();
  warm.run({ ...P, rho: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], checks: false });
  const w = warm.run({ ...P, checks: false });
  const c = createCalc().run({ ...P, checks: false });
  let worst = 0;
  for (let g = 0; g < c.N; g++) worst = Math.max(worst, Math.abs(w.Eind[g] - c.Eind[g]) / c.Eind[g]);
  assert.ok(worst < 2e-4, `${worst}`);
});

// ---------------------------------------------------------------------------------------------
// Worker module loader

test('worker loader: finds and rewrites relative imports', () => {
  const src = `import { a, b } from './geometry.js';\nimport * as K from "./kernel.js";\nexport { x } from './solver.js';\nimport './side.js';\nconst s = "from './no.js'";`;
  assert.deepEqual(moduleDeps(src), ['./geometry.js', './kernel.js', './solver.js', './side.js']);
  const out = rewriteImports(src, (s) => `blob:${s.slice(2)}`);
  assert.match(out, /from 'blob:geometry\.js'/);
  assert.match(out, /from "blob:kernel\.js"/);
  assert.match(out, /export \{ x \} from 'blob:solver\.js'/);
  assert.match(out, /import 'blob:side\.js'/);
  assert.match(out, /"from '\.\/no\.js'"/);
});

test('worker loader: every module the worker needs imports siblings only as \'./name.js\'', () => {
  const seen = new Set();
  const visit = (spec) => {
    if (seen.has(spec)) return;
    seen.add(spec);
    const text = readFileSync(jsDir + spec.slice(2), 'utf8');
    for (const line of text.split('\n')) {
      if (/^\s*import\s/.test(line) || /^\s*export\s.*\sfrom\s/.test(line)) {
        assert.match(line, /['"]\.\/[\w.-]+\.js['"]/, `${spec}: ${line}`);
      }
    }
    for (const d of moduleDeps(text)) visit(d);
  };
  visit('./calc.js');
  for (const m of ['./kernel.js', './solver.js', './direct.js', './checks3.js', './checks4.js', './formfactor.js', './geometry.js']) {
    assert.ok(seen.has(m), m);
  }
  assert.ok(![...seen].some((m) => /view3d|ui|orbit/.test(m)), 'no DOM modules in the worker');
  // worker.js itself has no static imports (they would bypass the stamps)
  assert.ok(!/^\s*import\s/m.test(readFileSync(jsDir + 'worker.js', 'utf8')));
  assert.ok(readdirSync(jsDir).includes('worker.js'));
});

// ---------------------------------------------------------------------------------------------
// Realistic view

test('tonemap: Ward\'s scale factor', () => {
  assert.ok(Math.abs(wardScale(L_DMAX / 2) - 1 / L_DMAX) < 1e-15);   // adapted to half the display maximum
  assert.ok(wardScale(1) > wardScale(10) && wardScale(10) > wardScale(1000)); // brighter scene, smaller scale
  // m·L_wa grows with L_wa: a brighter room still looks brighter after the exposure
  assert.ok(wardScale(10) * 10 < wardScale(100) * 100);
});

test('tonemap: luminance ρE/π, log average, shoulder, sRGB', () => {
  const room = createRoom({ L: 6, W: 4, H: 3, h: autoStep(6, 4, 3) });
  const E = new Float64Array(room.N).fill(Math.PI * 100);
  const L = luminance(room, E, [0.2, 0.7, 0.5, 0.5, 0.5, 0.5]);
  assert.ok(Math.abs(L[room.faces[0].offset] - 20) < 1e-12 && Math.abs(L[room.faces[1].offset] - 70) < 1e-12);
  const Lc = new Float64Array(room.N).fill(30);
  assert.ok(Math.abs(adaptationLuminance(room, Lc) - (30 + 1e-4)) < 1e-9);
  assert.equal(shoulder(0.5), 0.5);
  assert.ok(shoulder(10) <= 1 && shoulder(2) < 1 && shoulder(2) > 0.99 && shoulder(SHOULDER + 1e-9) > SHOULDER);
  assert.equal(srgbEncode(0), 0); assert.equal(srgbEncode(1), 1);
  assert.ok(Math.abs(srgbEncode(0.18) - 0.4613561295004) < 1e-9);
  assert.ok(displayValue(1e6, 0.01) <= 1 && displayValue(0, 0.01) === 0);
  assert.ok(Math.abs(displayValue(10, 0.01, 1) - displayValue(20, 0.01)) < 1e-15); // +1 stop doubles
});

test('criterion: the exposure depends on the result only (whole room), so a rotation cannot change it', () => {
  // exposure() takes the room and the element luminances, nothing about the camera; the page
  // computes it once per result. The 3D view checks the same on the rendered frames (view3d.exposureCheck).
  assert.equal(exposure.length, 2);
  const calc = createCalc();
  const r = calc.run({ ...P, checks: false });
  const room = createRoom({ L: P.L, W: P.W, H: P.H, h: r.h });
  const E = Float64Array.from(r.Edir, (x, g) => 0.75 * (x + r.Eind[g]));
  const ex = exposure(room, luminance(room, E, P.rho));
  assert.ok(ex.Lwa > 5 && ex.Lwa < 100, `${ex.Lwa}`);
  // a typical office comes out as light grey: mid-grey wall luminance maps to 0.5…0.9
  const wall = luminance(room, E, P.rho)[room.faces[2].offset + 10];
  const v = displayValue(wall, ex.m);
  assert.ok(v > 0.5 && v < 0.9, `${v}`);
});
