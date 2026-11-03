// Spec 006 — regra de tela da visão Semanal do vendedor.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rotuloSemana, fmtBw, corBw, filtrar, cards, totalLinha, planilha, rotuloStatusCarga, textoAtualizacao,
  rotuloSemanaDetalhe, cabecalhoSemana, anos, FMT_MOEDA, FMT_PCT,
} from '../src/lib/semanal.ts';

const SEMANAS = [
  { n: 1, ini: '2026-10-01', fim: '2026-10-01' },
  { n: 2, ini: '2026-10-02', fim: '2026-10-08' },
];
const linha = (id, celulas, extra = {}) => ({
  CLIENTE_ID: id, CLIENTE: `Cliente ${id}`, CURVA: 'C', SEGMENTO: '', RAMO: 'Clínica', VENDEDOR_ID: 1, VENDEDOR: 'Alice',
  DE_TITULAR: null, SEMANAS: celulas, FECH_ANT: 0, FECH: celulas.reduce((t, c) => t + c.valor, 0), BW_FECH: null, STATUS: 'Sem base',
  MES_2: 0, MES_1: 0, MES: 0, ...extra,
});
const c = (valor, anterior) => ({ valor, anterior, bw: anterior > 0 ? (valor - anterior) / anterior : null });

test('C-001 / RN-004: B/W e rótulo da semana', () => {
  assert.equal(fmtBw(0.2), '+20,0%');
  assert.equal(rotuloSemana(SEMANAS[1]), '02/10 a 08/10');
  assert.equal(corBw(-0.2), 'text-destructive');
  assert.equal(corBw(null), 'text-ink-muted');
});

test('C-003 / RN-004 / RN-005: queda total −100,0%; filtro inclui; anterior 0 fica fora', () => {
  assert.equal(fmtBw(-1), '−100,0%');
  assert.equal(fmtBw(null), 'Sem base');
  const linhas = [linha(1, [c(0, 0), c(0, 1000)]), linha(2, [c(0, 0), c(500, 0)]), linha(3, [c(0, 0), c(851, 1000)])];
  assert.deepEqual(filtrar(linhas, { ramo: '', abaixo: 2 }).map(l => l.CLIENTE_ID), [1]);
  assert.equal(filtrar(linhas, { ramo: 'Hospital', abaixo: 0 }).length, 0);
  assert.equal(filtrar(linhas, { ramo: '', abaixo: 0 }).length, 3);
});

test('RN-005: −14,96% arredonda para −15,0% e entra no filtro', () => {
  assert.equal(filtrar([linha(1, [c(0, 0), c(850.4, 1000)])], { ramo: '', abaixo: 2 }).length, 1);
});

test('C-002 / RF-005: cards 40 e 28', () => {
  const linhas = Array.from({ length: 40 }, (_, i) => linha(i + 1, [c(0, 0), c(i < 28 ? 100 : 0, 0)], i === 0 ? { STATUS: 'Alerta' } : {}));
  assert.deepEqual(cards(linhas), { carteira: 40, comCompra: 28, fechamento: 2800, alerta: 1 });
});

test('RF-003: TOTAL soma as linhas visíveis e recalcula o B/W', () => {
  const t = totalLinha([linha(1, [c(0, 0), c(1200, 1000)]), linha(2, [c(0, 0), c(300, 500)])], SEMANAS);
  assert.equal(t.SEMANAS[1].valor, 1500);
  assert.equal(t.SEMANAS[1].bw, 0);
  assert.equal(t.FECH, 1500);
});

test('C-010 / RN-012: planilha com TOTAL, número com formato e Sem base vazio', () => {
  const linhas = Array.from({ length: 40 }, (_, i) => linha(i + 1, [c(0, 0), i === 0 ? c(1200, 1000) : i === 1 ? c(0, 1000) : c(0, null)]));
  const itens = [
    { CLIENTE_ID: 1, semana: 2, CODPROD: 10, PRODUTO: 'P1', qt: 10, qtAnt: 6, total: 1200, dif: 4, vlUnit: 120, movimento: 'Comprou a mais' },
    { CLIENTE_ID: 999, semana: 2, CODPROD: 10, PRODUTO: 'P1', qt: 1, qtAnt: 0, total: 1, dif: 1, vlUnit: 1, movimento: 'Novo na semana' },
  ];
  const p = planilha({ semanas: SEMANAS }, linhas, itens, 2026, 10);
  assert.equal(p.arquivo, 'analytics-semanal-2026-10.xlsx');
  const [dados, produtos] = p.abas;
  assert.equal(dados.nome, 'Dados semanais');
  assert.equal(dados.linhas.length, 41);
  assert.equal(dados.linhas[40][0], 'TOTAL');
  const col = dados.colunas.indexOf('2ª sem (02/10 a 08/10)');
  assert.equal(dados.linhas[0][col], 1200);
  assert.equal(dados.formatos[col], FMT_MOEDA);
  assert.equal(dados.linhas[1][col + 1], -1);
  assert.equal(dados.formatos[col + 1], FMT_PCT);
  assert.equal(dados.linhas[2][col + 1], null);
  assert.equal(dados.fixas, 2);
  assert.equal(produtos.nome, 'Produtos');
  assert.equal(produtos.linhas.length, 1, 'só clientes visíveis');
  assert.ok(produtos.colunas.includes('Diferença QTD'));
  assert.equal(planilha({ semanas: SEMANAS }, [], itens, 2026, 10), null);
});

test('RF-010 / RN-016: status da carga e data de atualização', () => {
  assert.equal(rotuloStatusCarga('SUCCESS'), 'Concluída');
  assert.equal(rotuloStatusCarga('FAILED'), 'Com falha');
  assert.equal(rotuloStatusCarga(null), '');
  assert.equal(textoAtualizacao('2026-10-30 08:05:00'), 'Vendas atualizadas em 30/10/2026 08:05');
  assert.equal(textoAtualizacao(null), '');
});

test('C-009 / RN-011: seletor e cabeçalho da semana', () => {
  assert.equal(rotuloSemanaDetalhe({ n: 3, ini: '2026-10-09', fim: '2026-10-15' }), 'Semana 3 - 09/10/2026 a 15/10/2026');
  assert.equal(cabecalhoSemana({ pedidos: 2, valor: 2000 }).replace(/\s/g, ' '), '2 pedido(s) • R$ 2.000,00');
});

test('RF-004: ano corrente −1 a +1', () => {
  assert.deepEqual(anos('2026-11-03'), [2025, 2026, 2027]);
});
