// Form value validation tests (no DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PARAMS, DEFAULTS, parseNumber, formatNumber, validateParams } from '../js/ui.js';

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

test('validateParams: f_up is checked only for the direct-indirect model; file is not yet available', () => {
  assert.ok(validateParams(raw({ phot: 'cosine', fUp: 'abc' })).ok);
  assert.ok(validateParams(raw({ phot: 'directIndirect', fUp: 'abc' })).errors.fUp);
  const r = validateParams(raw({ phot: 'directIndirect', fUp: '1' }));
  assert.ok(r.ok);
  assert.equal(r.values.fUp, 1);
  assert.ok(validateParams(raw({ phot: 'file' })).errors.phot);
  assert.ok(validateParams(raw({ phot: 'laser' })).errors.phot);
});
