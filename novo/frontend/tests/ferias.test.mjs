// Spec 010 — Férias de Vendedores (T-088).
import test from 'node:test';
import assert from 'node:assert/strict';
import { estadoFerias, validarFerias } from '../src/lib/ferias.ts';

const pessoas = [
  { USER_ID: 1, NOME: 'Tereza Lima' }, { USER_ID: 2, NOME: 'Ulisses Reis' },
  { USER_ID: 3, NOME: 'Vítor Gomes' }, { USER_ID: 4, NOME: 'Xavier Melo' }, { USER_ID: 5, NOME: 'Joana Prates' },
];
const existentes = [
  { TITULAR_ID: 1, TITULAR: 'Tereza Lima', SUBSTITUTO_ID: 2, DT_INICIO: '2026-11-01', DT_FIM: '2026-11-15' },
  { TITULAR_ID: 3, TITULAR: 'Vítor Gomes', SUBSTITUTO_ID: 4, DT_INICIO: '2026-10-20', DT_FIM: '2026-11-10' },
];
const validar = (titularId, substitutoId, inicio, fim) => validarFerias({ titularId, substitutoId, inicio, fim }, existentes, pessoas);

test('C-021: férias sobrepostas do mesmo titular são recusadas com o período existente', () => {
  assert.equal(validar(1, 2, '2026-11-10', '2026-11-20'), 'Tereza Lima já tem férias entre 01/11/2026 e 15/11/2026.');
});

test('RN-020: substituto igual, datas invertidas e conflitos de substituição', () => {
  assert.equal(validar(5, 5, '2026-12-20', '2026-12-30'), 'O substituto precisa ser outra pessoa.');
  assert.equal(validar(5, 1, '2026-12-30', '2026-12-20'), 'O início precisa ser antes do fim.');
  assert.equal(validar(4, 5, '2026-11-01', '2026-11-05'), 'Xavier Melo está substituindo Vítor Gomes entre 20/10/2026 e 10/11/2026.');
  assert.equal(validar(5, 3, '2026-10-25', '2026-10-28'), 'Vítor Gomes está de férias entre 20/10/2026 e 10/11/2026.');
  assert.equal(validar(5, 0, '2026-12-20', '2026-12-30'), 'Informe vendedor, substituto, início e fim.');
  assert.equal(validar(5, 1, '2026-12-20', '2026-12-30'), null);
});

test('RNT-010: estado FUTURA, ATIVA e ENCERRADA', () => {
  assert.equal(estadoFerias('2026-12-01', '2026-12-15', '2026-10-30'), 'FUTURA');
  assert.equal(estadoFerias('2026-10-20', '2026-10-30', '2026-10-30'), 'ATIVA');
  assert.equal(estadoFerias('2026-10-01', '2026-10-29', '2026-10-30'), 'ENCERRADA');
});
