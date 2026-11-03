// Spec 001 — recarga dos contadores do menu (T-096).
import test from 'node:test';
import assert from 'node:assert/strict';
import { precisaRecarregar, EVENTO_CONTADORES } from '../src/lib/contadores.ts';

test('RN-007: contadores relidos a cada 5 minutos e pelo evento logo após a ação', () => {
  const t0 = Date.UTC(2026, 9, 30, 13, 0, 0);
  assert.equal(precisaRecarregar(t0, t0 + 299_000), false);
  assert.equal(precisaRecarregar(t0, t0 + 300_000), true);
  assert.equal(EVENTO_CONTADORES, 's360:contadores');
});
