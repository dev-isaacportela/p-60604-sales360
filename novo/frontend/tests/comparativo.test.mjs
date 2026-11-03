// Spec 007 — Comparativo modular e mensal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blocosPadrao, METRICAS, diferenca, planilhaModular, mensal, itensVisiveis, sugestoes, mesesMensal } from '../src/lib/comparativo.ts';

test('C-015 / RN-016: blocos padrão, métricas e diferença', () => {
  const [b1, b2] = blocosPadrao('2026-10-15');
  assert.deepEqual([b1.de, b1.ate, b2.de, b2.ate], ['2026-07-01', '2026-09-30', '2025-07-01', '2025-09-30']);
  assert.deepEqual(METRICAS('SECAO').map(m => m.value), ['FATURAMENTO']);
  assert.deepEqual(METRICAS('CLIENTE').map(m => m.value), ['FATURAMENTO', 'PEDIDOS']);
  assert.deepEqual(METRICAS('PRODUTO').map(m => m.value), ['FATURAMENTO', 'QUANTIDADE']);
  assert.deepEqual(diferenca(10000, 12500), { dif: 2500, pct: 0.25 });
  assert.equal(diferenca(0, 500).pct, null);
});

test('C-015 / RN-016: planilha do comparativo modular', () => {
  const blocos = [
    { id: 1, categoria: 'CLIENTE', metrica: 'FATURAMENTO', de: '2025-01-01', ate: '2025-03-31', itens: [] },
    { id: 2, categoria: 'CLIENTE', metrica: 'FATURAMENTO', de: '2026-01-01', ate: '2026-03-31', itens: [] },
  ];
  const dados = [[{ CHAVE: '7001', NOME: 'X', VALOR: 10000 }], [{ CHAVE: '7001', NOME: 'X', VALOR: 12500 }, { CHAVE: '7002', NOME: 'Y', VALOR: 100 }]];
  const p = planilhaModular('2026-10-15', blocos, dados, 'Todos');
  assert.equal(p.arquivo, 'comparativo-analytics-2026-10-15.xlsx');
  assert.deepEqual(p.abas.map(a => a.nome), ['Cliente · Faturamento', 'Base de dados', 'Parametros']);
  const aba = p.abas[0];
  const x = aba.linhas.find(l => l[0] === '7001');
  assert.equal(x[aba.colunas.indexOf('Bloco 1 valor')], 10000);
  assert.equal(x[aba.colunas.indexOf('Bloco 2 valor')], 12500);
  assert.equal(x[aba.colunas.indexOf('Dif. Bloco 2')], 2500);
  assert.equal(x[aba.colunas.indexOf('Dif. % Bloco 2')], 0.25);
  const y = aba.linhas.find(l => l[0] === '7002');
  assert.equal(y[aba.colunas.indexOf('Dif. % Bloco 2')], null, 'base zero');
});

test('RN-016: 6 maiores no gráfico e busca de até 8', () => {
  const dados = Array.from({ length: 12 }, (_, i) => ({ CHAVE: String(i), NOME: `Item ${i}`, VALOR: i }));
  const bloco = { id: 1, categoria: 'CLIENTE', metrica: 'FATURAMENTO', de: '', ate: '', itens: [] };
  assert.deepEqual(itensVisiveis(bloco, dados).map(d => d.CHAVE), ['11', '10', '9', '8', '7', '6']);
  assert.equal(sugestoes(dados, 'item', []).length, 8);
});

const L = (id, m2, m1, m) => ({ CLIENTE_ID: id, CLIENTE: `C${id}`, RAMO: 'R', MES_2: m2, MES_1: m1, MES: m, SEMANAS: [] });

test('C-016 / RN-017: comparativo mensal', () => {
  const r = mensal([L(1, 80000, 100000, 60000)], 'TODOS');
  assert.equal(r.variacao, -40000);
  assert.equal(r.pct, -0.4);
  const linhas = [L(1, 0, 0, 5000), L(2, 100, 900, 0), L(3, 0, 0, 0), L(4, 100, 500, 800)];
  const todos = mensal(linhas, 'TODOS');
  assert.equal(todos.linhas.length, 3, 'zerado nos 3 fora');
  assert.deepEqual(todos.linhas.map(l => l.CLIENTE_ID), [2, 4, 1], 'ordem pelo mês anterior');
  const novo = todos.linhas.find(l => l.CLIENTE_ID === 1);
  assert.equal(novo.selo, 'NOVO');
  assert.equal(novo.pct, null);
  assert.equal(todos.linhas.find(l => l.CLIENTE_ID === 2).selo, 'SEM COMPRA');
  assert.deepEqual(mensal(linhas, 'SEM_COMPRA').linhas.map(l => l.CLIENTE_ID), [2]);
  assert.deepEqual(mensal(linhas, 'NOVOS').linhas.map(l => l.CLIENTE_ID), [1]);
  assert.deepEqual(mensal(linhas, 'QUEDA').linhas.map(l => l.CLIENTE_ID), [2]);
  assert.deepEqual(mensal(linhas, 'ALTA').linhas.map(l => l.CLIENTE_ID), [4, 1]);
  assert.equal(mesesMensal('2026-11-03').length, 23);
});
