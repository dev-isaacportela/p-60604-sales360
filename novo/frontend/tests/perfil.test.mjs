// Spec 001 — Configurações e avatar (T-094).
import test from 'node:test';
import assert from 'node:assert/strict';
import { textoFerias, normalizarNome, iniciais } from '../src/lib/perfil.ts';

const feriasAna = [{ PAPEL_FERIAS: 'TITULAR', ESTADO: 'FUTURA', DT_INICIO: '2026-11-01', DT_FIM: '2026-11-15', OUTRA_PESSOA: 'Bruno Lima' }];

test('C-012 / RN-012: férias do titular — Ativo antes, Férias durante, Ativo depois', () => {
  assert.deepEqual(textoFerias(feriasAna, '2026-10-30'), {
    status: 'Ativo',
    substituto: 'Bruno Lima',
    avisos: ['Férias programadas de 01/11/2026 a 15/11/2026'],
  });
  const ativa = [{ ...feriasAna[0], ESTADO: 'ATIVA' }];
  assert.deepEqual(textoFerias(ativa, '2026-11-05'), { status: 'Férias', substituto: 'Bruno Lima', avisos: [] });
  assert.deepEqual(textoFerias([], '2026-11-16'), { status: 'Ativo', substituto: 'Não definido', avisos: [] });
  assert.deepEqual(textoFerias(ativa, '2026-11-16'), { status: 'Ativo', substituto: 'Não definido', avisos: [] });
});

test('RN-012 (substituto): Bruno vê quem está cobrindo e até quando', () => {
  const bruno = [{ PAPEL_FERIAS: 'SUBSTITUTO', ESTADO: 'ATIVA', DT_INICIO: '2026-11-01', DT_FIM: '2026-11-15', OUTRA_PESSOA: 'Ana Souza' }];
  assert.deepEqual(textoFerias(bruno, '2026-11-05'), {
    status: 'Ativo',
    substituto: 'Não definido',
    avisos: ['Você cobre Ana Souza até 15/11/2026'],
  });
});

test('RN-010: nome vazio volta ao da conta, acima de 120 é recusado, avatar com iniciais', () => {
  assert.deepEqual(normalizarNome('  ', 'ana@x'), { gravar: '', exibir: 'ana@x', erro: null });
  assert.equal(normalizarNome('a'.repeat(121), 'ana@x').erro, 'O nome pode ter até 120 caracteres.');
  assert.equal(normalizarNome('a'.repeat(120), 'ana@x').erro, null);
  assert.equal(normalizarNome('  Ana Souza ', 'ana@x').gravar, 'Ana Souza');
  assert.equal(iniciais('Ana Souza'), 'AS');
  assert.equal(iniciais('Gil Prado Lopes'), 'GL');
});
