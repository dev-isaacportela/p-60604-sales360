// Spec 002 — filtro de escopo de visualização (RNT-003, T-107).
import test from 'node:test';
import assert from 'node:assert/strict';
import { escopoPadrao, trocar, opcoesEscopo, mostraFiltro, paraInput, lembrar, recuperar, visoes } from '../src/lib/escopo.ts';

const L = (o) => ({ PROPRIO: 0, MEU_TIME: 1, COD_SUPERVISOR: '2001', COORDENADOR: 'Carlos', ...o });
const LINHAS = [
  L({ VENDEDOR_ID: 2, VENDEDOR: 'Ana', CODFILIAL: '1', FILIAL: 'Recife', CODEPTO: '1', DEPTO: 'Hospitalar', ID_SECAO: '101', SECAO: 'S101' }),
  L({ VENDEDOR_ID: 2, VENDEDOR: 'Ana', CODFILIAL: '1', FILIAL: 'Recife', CODEPTO: '1', DEPTO: 'Hospitalar', ID_SECAO: '102', SECAO: 'S102' }),
  L({ VENDEDOR_ID: 3, VENDEDOR: 'Bruno', CODFILIAL: '2', FILIAL: 'Natal', CODEPTO: '2', DEPTO: 'Enfermagem', ID_SECAO: '201', SECAO: 'S201' }),
  L({ VENDEDOR_ID: 9, VENDEDOR: 'Outro', COD_SUPERVISOR: '3001', COORDENADOR: 'Dora', MEU_TIME: 0, CODFILIAL: '3', FILIAL: 'JP', CODEPTO: '1', DEPTO: 'Hospitalar', ID_SECAO: '301', SECAO: 'S301' }),
];

test('RNT-003: padrão Meu painel / Time inteiro / Todos os coordenadores', () => {
  assert.equal(escopoPadrao({ papeis: ['VENDEDOR'] }).visao, 'ME');
  assert.equal(escopoPadrao({ papeis: ['COORDENADOR'], coordenadorAtivo: true }).visao, 'TEAM');
  assert.equal(escopoPadrao({ papeis: ['DIRETORIA'] }).visao, 'ALL');
  assert.deepEqual(visoes({ papeis: ['VENDEDOR'] }, LINHAS).map(v => v.value), ['ME']);
  assert.ok(visoes({ papeis: ['DIRETORIA'] }, LINHAS).some(v => v.value === 'COORD:3001'));
});

test('RNT-003: trocar coordenador zera vendedor, filial, departamento e seção; filial zera depto e seção', () => {
  const cheio = { visao: 'TEAM', coordenador: '', vendedor: '2', filial: '1', depto: '1', secao: '101' };
  assert.deepEqual(trocar(cheio, 'visao', 'COORD:3001'), { visao: 'COORD', coordenador: '3001', vendedor: '', filial: '', depto: '', secao: '' });
  assert.deepEqual(trocar(cheio, 'filial', '2'), { ...cheio, filial: '2', depto: '', secao: '' });
  assert.deepEqual(trocar(cheio, 'depto', '2'), { ...cheio, depto: '2', secao: '' });
});

test('RNT-003: vendedores recortados pelo coordenador e cascata das opções', () => {
  const base = { visao: 'COORD', coordenador: '2001', vendedor: '', filial: '', depto: '', secao: '' };
  assert.deepEqual(opcoesEscopo(LINHAS, base).vendedores.map(v => v.label), ['Ana', 'Bruno']);
  const daAna = opcoesEscopo(LINHAS, { ...base, vendedor: '2', filial: '1', depto: '1' });
  assert.deepEqual(daAna.filiais.map(f => f.value), ['1']);
  assert.deepEqual(daAna.secoes.map(s => s.value), ['101', '102']);
});

test('RNT-003: vendedor com um escopo não vê o filtro; com dois vê', () => {
  const vend = { papeis: ['VENDEDOR'] };
  assert.equal(mostraFiltro(vend, [{ ...LINHAS[0], PROPRIO: 1 }]), false);
  assert.equal(mostraFiltro(vend, [{ ...LINHAS[0], PROPRIO: 1 }, { ...LINHAS[1], PROPRIO: 1 }]), true);
  assert.equal(mostraFiltro({ papeis: ['COORDENADOR'], coordenadorAtivo: true }, []), true);
});

test('RNT-003: vendedor escolhido vira modo SELLER; filtro lembrado só na mesma sessão', () => {
  const e = { visao: 'TEAM', coordenador: '', vendedor: '2', filial: '', depto: '', secao: '' };
  assert.equal(paraInput(e, '2026-10-30').modo, 'SELLER');
  const mem = new Map();
  const st = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const sessao = { papeis: ['COORDENADOR'], coordenadorAtivo: true };
  lembrar(e, 'tok1', st);
  assert.equal(recuperar(sessao, 'tok1', st).vendedor, '2');
  assert.equal(recuperar(sessao, 'tok2', st).vendedor, '');
});
