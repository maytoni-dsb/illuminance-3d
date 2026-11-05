// Form value validation tests (no DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PARAMS, DEFAULTS, parseNumber, formatNumber, validateParams, faceRho } from '../js/ui.js';

test('parseNumber: comma, dot, spaces, garbage', () => {
  assert.equal(parseNumber('0,25'), 0.25);
  assert.equal(parseNumber(' 6.5 '), 6.5);
  assert.equal(parseNumber('1 200'), 1200);
  assert.ok(Number.isNaN(parseNumber('')));
  assert.ok(Number.isNaN(parseNumber('6м')));
  assert.ok(Number.isNaN(parseNumber('1,2,3')));
});

test('formatNumber: decimal comma, no trailing zeros', () => {
  assert.equal(formatNumber(0.25), '0,25');
  assert.equal(formatNumber(6), '6');
  assert.equal(formatNumber(0.2428571, 4), '0,2429');
});

const raw = (over = {}) => ({ ...Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, String(v)])), ...over });

test('validateParams: defaults are valid and match the spec table', () => {
  const r = validateParams(DEFAULTS);
  assert.equal(r.ok, true);
  assert.deepEqual(r.values, { ...DEFAULTS });
  assert.deepEqual(
    { L: DEFAULTS.L, W: DEFAULTS.W, H: DEFAULTS.H, nx: DEFAULTS.nx, ny: DEFAULTS.ny, flux: DEFAULTS.flux, hc: DEFAULTS.hc, psi: DEFAULTS.psi, phot: DEFAULTS.phot, mf: DEFAULTS.mf },
    { L: 6, W: 4, H: 3, nx: 3, ny: 2, flux: 4000, hc: 0, psi: 0, phot: 'cosine', mf: 0.75 },
  );
  assert.ok(!PARAMS.some((p) => p.key === 'h')); // the step is automatic, not a form field
});

test('validateParams: room bounds are inclusive', () => {
  assert.ok(validateParams(raw({ L: '50', W: '1', H: '2' })).ok);
  const r = validateParams(raw({ L: '51', W: 'abc', H: '1,9' }));
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['H', 'L', 'W']);
});

test('validateParams: luminaire counts are integers 1…30, flux > 0', () => {
  assert.ok(validateParams(raw({ nx: '30', ny: '1' })).ok);
  assert.match(validateParams(raw({ nx: '2,5' })).errors.nx, /целое/);
  assert.ok(validateParams(raw({ ny: '0' })).errors.ny);
  assert.ok(validateParams(raw({ nx: '31' })).errors.nx);
  assert.ok(validateParams(raw({ flux: '0' })).errors.flux);
  assert.ok(validateParams(raw({ flux: '0,5' })).ok);
});

test('validateParams: suspension is limited by H − 0.9', () => {
  assert.ok(validateParams(raw({ H: '3', hc: '2,1' })).ok);
  const r = validateParams(raw({ H: '3', hc: '2,2' }));
  assert.match(r.errors.hc, /2,1/);
  assert.ok(validateParams(raw({ H: '20', hc: '19,1' })).ok);
  assert.ok(validateParams(raw({ hc: '-0,1' })).errors.hc);
});

test('validateParams: rotation 0…180°, MF 0.1…1', () => {
  assert.ok(validateParams(raw({ psi: '180', mf: '1' })).ok);
  assert.ok(validateParams(raw({ psi: '181' })).errors.psi);
  assert.ok(validateParams(raw({ mf: '0,05' })).errors.mf);
});

test('validateParams: CCT and power only with a file; photometry is cosine or file', () => {
  assert.ok(validateParams(raw({ phot: 'cosine', cct: 'abc', power: '' })).ok);
  assert.ok(validateParams(raw({ phot: 'file', cct: 'abc' })).errors.cct);
  assert.ok(validateParams(raw({ phot: 'file', power: '0' })).errors.power);
  const r = validateParams(raw({ phot: 'file', flux: '820', cct: '4000', power: '6,5' }));
  assert.ok(r.ok);
  assert.deepEqual([r.values.flux, r.values.cct, r.values.power], [820, 4000, 6.5]);
  assert.ok(validateParams(raw({ phot: 'file', flux: 'abc' })).errors.flux);
  assert.ok(validateParams(raw({ phot: 'laser' })).errors.phot);
});

test('validateParams: required illuminance, work plane height (≤ H − 0.1) and MF', () => {
  assert.deepEqual([DEFAULTS.En, DEFAULTS.hwp, DEFAULTS.mf], [200, 0, 0.75]);
  assert.ok(validateParams(raw({ En: '500', hwp: '0' })).ok);
  assert.ok(validateParams(raw({ H: '3', hwp: '2,9' })).ok);
  assert.match(validateParams(raw({ H: '3', hwp: '2,95' })).errors.hwp, /2,9/);
  assert.ok(validateParams(raw({ En: '0' })).errors.En);
});

test('stepValue: steps without float noise, within the bounds', async () => {
  const { stepValue } = await import('../js/ui.js');
  const P = Object.fromEntries(PARAMS.map((p) => [p.key, p]));
  assert.equal(stepValue(P.L, 6, 1), 6.1);
  assert.equal(stepValue(P.mf, 0.75, -1), 0.65);
  assert.equal(stepValue(P.mf, 0.15, -1), 0.1);
  assert.equal(stepValue(P.rhoC, 0.9, 1), 0.9);
  assert.equal(stepValue(P.flux, 4000, 1), 4100);
  assert.equal(stepValue(P.power, 6.51, 1), 6.61);
  assert.equal(stepValue(P.En, 200, 1), 300);
  assert.equal(stepValue(P.En, 150, -1), 100);
  assert.equal(stepValue(P.En, 100, 1), 150);
  assert.equal(stepValue(P.En, 450, 1), 500);   // off the scale: to the neighbouring level
  assert.equal(stepValue(P.En, 450, -1), 400);
  assert.equal(stepValue(P.En, 5000, 1), 5000);
  assert.equal(stepValue(P.En, 1, -1), 1);
  assert.equal(stepValue(P.hwp, 0, 1, { H: 3 }), 0.8);
  assert.equal(stepValue(P.hwp, 0.8, 1, { H: 3 }), 0.8);
  assert.equal(stepValue(P.hwp, 0.8, -1, { H: 3 }), 0);
  assert.equal(stepValue(P.hwp, 1.2, -1, { H: 3 }), 0.8);
  assert.equal(stepValue(P.psi, 0, 1), 90);
  assert.equal(stepValue(P.psi, 90, 1), 180);
  assert.equal(stepValue(P.psi, 180, 1), 180);
  assert.equal(stepValue(P.nx, 3, 1), 4);
  assert.equal(stepValue(P.hc, 2, 1, { H: 3 }), 2.1);
  assert.equal(stepValue(P.hc, 2.1, 1, { H: 3 }), 2.1);
  assert.equal(stepValue(P.L, NaN, 1), 6.1); // invalid text starts from the default
});

test('validateParams: reflectances 0…0.9 with the spec defaults; faceRho orders them by face', () => {
  assert.deepEqual([DEFAULTS.rhoC, DEFAULTS.rhoW, DEFAULTS.rhoF], [0.7, 0.5, 0.2]);
  assert.deepEqual(faceRho(DEFAULTS), [0.2, 0.7, 0.5, 0.5, 0.5, 0.5]);
  assert.ok(validateParams(raw({ rhoC: '0,9', rhoW: '0', rhoF: '0' })).ok);
  const r = validateParams(raw({ rhoC: '0,95', rhoW: '-0,1', rhoF: '1' }));
  assert.deepEqual(Object.keys(r.errors).sort(), ['rhoC', 'rhoF', 'rhoW']);
});

test('validateParams: at most 500 luminaires; the grid suggestion respects it', async () => {
  const { MAX_LUMINAIRES } = await import('../js/ui.js');
  const { gridFor } = await import('../js/estimate.js');
  assert.equal(MAX_LUMINAIRES, 500);
  assert.ok(validateParams(raw({ nx: '25', ny: '20' })).ok);
  assert.match(validateParams(raw({ nx: '30', ny: '17' })).errors.ny, /500/);
  for (const N of [480, 500]) {
    const g = gridFor(N, 20, 20, 30, MAX_LUMINAIRES);
    assert.ok(g.n >= N && g.n <= 500, `${N}: ${JSON.stringify(g)}`);
  }
});
