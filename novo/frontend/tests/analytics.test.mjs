// Spec 007 — regra de tela do Analytics.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  periodo, validarIntervalo, periodoAnterior, diasUteis, projecao, pontosEvolucao, cardsResumo, fmtPct,
  ordenar, listaParam, filtroDoClique, abas, visitas, MSG_ORDEM, MSG_24_MESES,
} from '../src/lib/analytics.ts';

test('C-001 / RN-004: cards do Overview', () => {
  const c = cardsResumo({ META: 50000, BRUTO: 42000, DEVOLVIDO: 2000, LIQUIDO: 40000 });
  assert.equal(c.falta, 10000);
  assert.equal(fmtPct(c.atingimento), '80,0%');
  assert.equal(fmtPct(c.pctDevolvido), '4,8%');
  assert.equal(cardsResumo({ META: 0, BRUTO: 0, DEVOLVIDO: 0, LIQUIDO: 500 }).semMeta, true);
  assert.equal(cardsResumo({ META: 100, BRUTO: 0, DEVOLVIDO: 0, LIQUIDO: 500 }).falta, 0);
});

test('C-002 / RN-005: projeção por dias úteis', () => {
  assert.equal(diasUteis('2026-10-01', '2026-10-31'), 22);
  assert.equal(diasUteis('2026-10-01', '2026-10-15'), 11);
  assert.equal(projecao(40000, '2026-10-01', '2026-10-31', '2026-10-15'), 80000);
  assert.equal(projecao(30000, '2026-09-01', '2026-09-30', '2026-10-15'), 30000);
});

test('C-017 / RN-001: período e intervalo personalizado', () => {
  assert.equal(validarIntervalo('2026-12-31', '2026-01-01'), MSG_ORDEM);
  assert.equal(validarIntervalo('2024-01-01', '2026-12-31'), MSG_24_MESES);
  assert.equal(validarIntervalo('2025-01-01', '2026-12-31'), null);
  assert.deepEqual(periodo('TRIMESTRE', '2026-10-15'), { de: '2026-08-01', ate: '2026-10-31' });
  assert.deepEqual(periodo('MES', '2026-10-15'), { de: '2026-10-01', ate: '2026-10-31' });
  assert.deepEqual(periodo('ANO', '2026-10-15'), { de: '2025-11-01', ate: '2026-10-31' });
  assert.deepEqual(periodo('PERSONALIZADO', '2026-10-15', '2026-12-31', '2026-01-01'), { erro: MSG_ORDEM });
});

test('RN-007: período anterior de mesmo tamanho', () => {
  assert.deepEqual(periodoAnterior('2026-10-01', '2026-10-31'), { deAnt: '2026-09-01', ateAnt: '2026-09-30' });
  assert.deepEqual(periodoAnterior('2026-08-01', '2026-10-31'), { deAnt: '2026-05-01', ateAnt: '2026-07-31' });
  assert.deepEqual(periodoAnterior('2026-10-05', '2026-10-14'), { deAnt: '2026-09-25', ateAnt: '2026-10-04' });
});

test('RN-006: evolução por dia com meta diária; por mês acima de 31 dias', () => {
  const linhas = [{ TIPO: 'M', CHAVE: '2026-10', VALOR: 44000 }, { TIPO: 'L', CHAVE: '2026-10-02', VALOR: 1500 }];
  const dias = pontosEvolucao(linhas, '2026-10-01', '2026-10-15');
  assert.equal(dias.length, 15);
  assert.equal(dias[0].meta, 2000);
  assert.equal(dias[2].meta, 0, 'sábado 03/10');
  assert.equal(dias[1].valor, 1500);
  const meses = pontosEvolucao([{ TIPO: 'L', CHAVE: '2026-09', VALOR: 10 }], '2026-05-01', '2026-10-31');
  assert.deepEqual(meses.map(p => p.rotulo), ['mai/26', 'jun/26', 'jul/26', 'ago/26', 'set/26', 'out/26']);
  assert.equal(meses[4].valor, 10);
});

test('RF-022: ordena pelo número', () => {
  const l = [{ V: '10000' }, { V: '9000' }];
  assert.deepEqual(ordenar(l, 'V', 'asc').map(x => x.V), ['9000', '10000']);
  assert.deepEqual(ordenar([{ N: 'Beta' }, { N: 'alfa' }], 'N', 'asc').map(x => x.N), ['alfa', 'Beta']);
});

test('RF-023: só cliente e produto do ranking filtram', () => {
  const f = { tipo: 'MES', de: '', ate: '', ramos: [], clientes: [], produtos: [] };
  assert.deepEqual(filtroDoClique(f, 'CLIENTE', '7001').clientes, ['7001']);
  assert.deepEqual(filtroDoClique(f, 'PRODUTO', '10').produtos, ['10']);
  assert.equal(filtroDoClique(f, 'RAMO', 'Hospital'), f);
  assert.equal(filtroDoClique(f, 'FORNECEDOR', '3'), f);
});

test('RN-002: lista para o parâmetro', () => {
  assert.equal(listaParam(['1', '2'], ','), ',1,2,');
  assert.equal(listaParam(['Hospital'], '|'), '|Hospital|');
  assert.equal(listaParam([], ','), '');
});

test('RF-001: abas por perfil', () => {
  assert.equal(abas({ papeis: ['VENDEDOR'] }).length, 4);
  assert.ok(!abas({ papeis: ['VENDEDOR'] }).includes('Metas'));
  assert.equal(abas({ papeis: ['VENDEDOR'], coordenadorAtivo: true }).length, 5);
  assert.equal(abas({ papeis: ['DIRETORIA'] }).length, 5);
});

test('RN-009: 12 visitas em 30 dias → média 2,8', () => {
  const v = visitas([
    { ORIGEM: 'CLIENTE', TIPO: 'Positivação', N: 8 },
    { ORIGEM: 'PROSPECCAO', TIPO: 'Aumento de mix — conhecer o cliente', N: 3 },
    { ORIGEM: 'PROSPECCAO', TIPO: 'Financeiro', N: 1 },
  ], '2026-09-16', '2026-10-15');
  assert.equal(v.total, 12);
  assert.equal(v.media, 2.8);
  assert.equal(v.tipos.find(t => t.tipo === 'Positivação').n, 8);
  assert.equal(v.tipos.find(t => t.tipo === 'Outros tipos').n, 1);
});
