// Testes do frontend: regra pura de `src/lib/` (formatação, cálculo, máscara,
// normalização de linhas do backend). Sem React, sem DOM, sem SDK — o que
// depende de tela é verificado nos cenários C-00N abertos no simulador.
//
// Cada `test` cita o requisito/cenário da spec no título (rastreabilidade).
// Node 22.18+ importa `.ts` direto (type stripping); não precisa de vitest.
//
// Uso: cd novo/frontend && npm test   (= node --test "tests/**/*.test.mjs")
import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtData, fmtDataHora, moeda, hojeIso } from '../src/lib/formato.ts';

test('RNT-011: data ISO do backend aparece como dd/mm/aaaa', () => {
  assert.equal(fmtData('2026-08-27'), '27/08/2026');
  assert.equal(fmtDataHora('2026-09-03T14:00:00'), '03/09/2026 14:00');
  assert.equal(fmtDataHora('2026-09-03'), '03/09/2026');
});

test('RNT-011: entrada inválida não quebra a tela', () => {
  assert.equal(fmtData(''), '');
  assert.equal(fmtData(null), '');
  assert.equal(fmtData('27/08/2026'), '27/08/2026');
  assert.equal(moeda('abc'), '');
});

test('RNT-011: moeda em pt-BR', () => {
  assert.equal(moeda(120.5).replace(/ /g, ' '), 'R$ 120,50');
  assert.equal(moeda('0'), moeda(0));
});

test('RNT-011: hojeIso tem o formato aaaa-mm-dd', () => {
  assert.match(hojeIso(), /^\d{4}-\d{2}-\d{2}$/);
});

test('RNT-011: hoje e agora em Brasília — 30/10/2026 23:30 ainda é dia 30', async () => {
  const { hojeBrasilia, agoraBrasilia } = await import('../src/lib/formato.ts');
  const instante = new Date('2026-10-31T02:30:00Z');
  assert.equal(hojeBrasilia(instante), '2026-10-30');
  assert.equal(agoraBrasilia(instante), '2026-10-30T23:30:00');
  assert.match(hojeBrasilia(), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(agoraBrasilia(), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
});
