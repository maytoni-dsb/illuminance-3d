// Form value validation tests (no DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PARAMS, parseNumber, formatNumber, validateParams } from '../js/ui.js';

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

test('validateParams: defaults are valid, bounds are inclusive', () => {
  const def = Object.fromEntries(PARAMS.map((p) => [p.key, p.def]));
  assert.deepEqual(validateParams(def), { ok: true, values: def, errors: {} });
  assert.ok(validateParams({ L: '50', W: '1', H: '2', h: '0,1' }).ok);
  const r = validateParams({ L: '51', W: 'abc', H: '1,9', h: '0,25' });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['H', 'L', 'W']);
  assert.equal(r.values.h, 0.25);
});
