// Smoke da spec 006 — matriz semanal, detalhe e carga do ERP.
// Leituras primeiro; a carga (que reescreve o RAW) por ultimo.

import { CLIENTE, PRODUTO, FILIAL, SECAO } from '../seeds/006-semanal.mjs';
import { statusPorBw, curvaPorValor, semanasDoMes } from '../../lib/006-regras.mjs';
import { MENSAGENS } from '../../lib/006-carga.mjs';

export default async function ({ teste, chamar, linhas, banco, db, ID, assert }) {
  const id = (email) => banco(`SELECT ID FROM INT_USER WHERE DESCR = '${email}'`)[0].ID;
  const ALICE = id('alice.moura@benenutri.local');
  const BERNARDO = id('bernardo.reis@benenutri.local');
  const CECILIA = id('cecilia.paz@benenutri.local');
  const TANIA = ID.TANIA;
  const ESCOPO = { modo: 'ME', coordenador: '', vendedor: '', filial: '', depto: '', secao: '', ano: 2026, mes: 10 };

  const matriz = (userId, hoje = '2026-10-30', input = {}) => chamar('s360SemanalMatriz', { ...ESCOPO, hoje, ...input }, userId);
  const linhaDe = async (userId, cliente, hoje, input) => (await matriz(userId, hoje, input)).linhas.find((l) => l.CLIENTE_ID === cliente);
  const exec = (sql) => db.exec(sql);

  /* ─────────────── matriz ─────────────── */

  await teste('RNT-003: modo sem permissao nao devolve dado', async () => {
    assert.equal((await matriz(ALICE, '2026-10-30', { modo: 'TEAM' })).linhas.length, 0);
    assert.equal((await matriz(ALICE, '2026-10-30', { modo: 'ALL' })).linhas.length, 0);
  });

  await teste('C-001 / RN-004 / RF-001: celula, B/W e semanas do mes', async () => {
    const r = await matriz(ALICE);
    assert.equal(r.semanas.length, 6);
    assert.deepEqual(r.semanas[1], { n: 2, ini: '2026-10-02', fim: '2026-10-08' });
    const alfa = r.linhas.find((l) => l.CLIENTE_ID === CLIENTE.ALFA);
    assert.deepEqual(alfa.SEMANAS[1], { valor: 1200, anterior: 1000, bw: 0.2 });
    assert.equal((await matriz(ALICE, '2026-10-30', { ano: 2026, mes: 2 })).semanas.length, 5);
  });

  await teste('C-002 / RF-002: toda a carteira, inclusive sem venda', async () => {
    const r = await matriz(ALICE, '2026-11-05');
    assert.equal(r.linhas.length, 40);
    const zeradas = r.linhas.filter((l) => l.SEMANAS.every((s) => s.valor === 0) && l.FECH_ANT === 0);
    assert.equal(zeradas.length, 12);
    assert.ok(zeradas.every((l) => l.BW_FECH === null && l.STATUS === 'Sem base'));
    assert.equal(r.linhas.filter((l) => l.SEMANAS.some((s) => s.valor > 0)).length, 28);
  });

  await teste('C-003 / RN-004: queda total e -100%, nao Sem base', async () => {
    const zeta = await linhaDe(ALICE, CLIENTE.ZETA);
    assert.equal(zeta.SEMANAS[1].bw, -1);
    assert.equal(statusPorBw(-1), 'Alerta');
  });

  await teste('C-004 / RN-003: devolucao na semana em que ocorreu; sem secao ignorada', async () => {
    const eta = await linhaDe(ALICE, CLIENTE.ETA);
    assert.equal(eta.SEMANAS[2].valor, 1700);
    assert.equal(eta.FECH, 1700);
  });

  await teste('C-005 / RN-008: status pela faixa de B/W da semana de hoje', async () => {
    const r = await matriz(ALICE, '2026-10-20');
    assert.equal(r.semanaRef, 4);
    const st = (c) => r.linhas.find((l) => l.CLIENTE_ID === c).STATUS;
    assert.deepEqual([st(CLIENTE.BETA), st(CLIENTE.GAMA), st(CLIENTE.DELTA), st(CLIENTE.EPSILON)],
      ['No padrão', 'Fora do padrão', 'Alerta', 'Sem base']);
    assert.equal(r.linhas.filter((l) => l.STATUS === 'Alerta').length, 1);
  });

  await teste('RN-008 (limites): faixa sobre o valor arredondado', async () => {
    assert.equal(statusPorBw(-0.149), 'No padrão');
    assert.equal(statusPorBw(-0.15), 'Fora do padrão');
    assert.equal(statusPorBw(0.25), 'Fora do padrão');
    assert.equal(statusPorBw(0.251), 'Alerta');
    assert.equal(statusPorBw(-0.1496), 'Fora do padrão');
    assert.equal(statusPorBw(null), 'Sem base');
  });

  await teste('C-018 / RN-007: mes encerrado olha o fechamento', async () => {
    const r = await matriz(ALICE, '2026-11-05');
    assert.equal(r.mesEncerrado, true);
    const beta = r.linhas.find((l) => l.CLIENTE_ID === CLIENTE.BETA);
    assert.equal(beta.BW_FECH, -0.2);
    assert.equal(beta.SEMANAS[5].bw, null);
    assert.equal(beta.STATUS, 'Fora do padrão');
    assert.equal((await linhaDe(ALICE, CLIENTE.BETA, '2026-10-20')).STATUS, 'No padrão');
  });

  await teste('RN-006: valor medio no escopo da linha', async () => {
    const medio = await linhaDe(ALICE, CLIENTE.MEDIO);
    assert.equal(medio.VALOR_MEDIO, 2000, '3.000 + 1.000 em 2 semanas; os 5.000 de outra BU nao entram');
    assert.equal((await linhaDe(ALICE, 6030)).VALOR_MEDIO, 0);
  });

  await teste('RN-009: curva da carteira, senao pelo valor medio', async () => {
    assert.equal((await linhaDe(ALICE, CLIENTE.CURVA_B)).CURVA, 'B');
    assert.equal((await linhaDe(ALICE, CLIENTE.CURVA_A)).CURVA, 'A');
    assert.equal(curvaPorValor(6999.99), 'C');
    assert.equal(curvaPorValor(7000), 'B');
    exec(`UPDATE EQUIPE_CLIENTE SET CURVA_CLASSIFICACAO = 'A' WHERE ID_CLIENTE = ${CLIENTE.EQUIPE} AND ID_VENDEDOR = ${BERNARDO}`);
    exec(`UPDATE EQUIPE_CLIENTE SET CURVA_CLASSIFICACAO = 'C' WHERE ID_CLIENTE = ${CLIENTE.EQUIPE} AND ID_VENDEDOR = ${ALICE}`);
    assert.equal((await linhaDe(CECILIA, CLIENTE.EQUIPE, '2026-10-30', { modo: 'TEAM' })).CURVA, 'A', 'equipe: a melhor curva');
    exec(`UPDATE EQUIPE_CLIENTE SET CURVA_CLASSIFICACAO = NULL WHERE ID_CLIENTE = ${CLIENTE.EQUIPE}`);
  });

  await teste('C-007 / RN-001: substituto ve o titular e so a venda das ferias', async () => {
    const kappa = await linhaDe(BERNARDO, CLIENTE.KAPPA);
    assert.equal(kappa.DE_TITULAR, 'Alice Moura');
    assert.equal(kappa.SEMANAS[1].valor, 900);
    assert.equal(kappa.SEMANAS[3].valor, 0, 'a compra de 20/10 e so de Alice');
    assert.ok(await linhaDe(BERNARDO, CLIENTE.KAPPA, '2026-11-05'), 'ferias cruzam o mes aberto');
    const nov = await matriz(BERNARDO, '2026-11-05', { mes: 11 });
    assert.equal(nov.linhas.filter((l) => l.DE_TITULAR).length, 0, 'ferias fora do mes: nao herda');
  });

  await teste('C-008 / RN-002: equipe sem contar duas vezes', async () => {
    const kappa = await linhaDe(CECILIA, CLIENTE.KAPPA, '2026-10-30', { modo: 'TEAM' });
    assert.equal(kappa.VENDEDOR, 'Equipe');
    assert.equal(kappa.SEMANAS[1].valor, 900);
    assert.equal(kappa.SEMANAS[3].valor, 400);
  });

  await teste('RN-002 (escopo duplo): venda conta uma vez', async () => {
    assert.equal((await linhaDe(ALICE, CLIENTE.DUPLO)).FECH, 500);
  });

  await teste('RN-010: linha Equipe soma e recalcula o B/W', async () => {
    const eq = await linhaDe(CECILIA, CLIENTE.EQUIPE, '2026-10-30', { modo: 'TEAM' });
    assert.deepEqual(eq.SEMANAS[1], { valor: 1500, anterior: 1000, bw: 0.5 });
    assert.equal(statusPorBw(eq.SEMANAS[1].bw), 'Alerta');
    assert.equal((await linhaDe(ALICE, CLIENTE.EQUIPE)).SEMANAS[1].valor, 1000, 'a venda da secao 6102 e do titular Bernardo');
  });

  await teste('C-009 / RN-011: detalhe do cliente bate com a celula', async () => {
    const r = await chamar('s360SemanalDetalhe', { ...ESCOPO, hoje: '2026-10-30', clienteId: String(CLIENTE.ALFA) }, ALICE);
    const s3 = r.semanas[2];
    assert.equal(s3.pedidos, 2);
    assert.equal(s3.valor, 2000);
    assert.deepEqual(s3.itens.slice(0, 2).map((i) => [i.CODPROD, i.movimento, i.dif]),
      [[PRODUTO.P2, 'Deixou de comprar', -4], [PRODUTO.P1, 'Comprou a mais', 4]]);
    assert.equal(r.semanas[1].valor, (await linhaDe(ALICE, CLIENTE.ALFA)).SEMANAS[1].valor);
    assert.equal(r.sazonalidade.find((p) => p.CODPROD === PRODUTO.P1).meses.length, 12);
    const fora = await chamar('s360SemanalDetalhe', { ...ESCOPO, hoje: '2026-10-30', clienteId: String(CLIENTE.ALFA) }, CECILIA);
    assert.ok(fora.semanas.every((s) => s.valor === 0), 'Cecilia em ME nao tem Alfa');
  });

  await teste('RF-007 / RN-012: itens com movimento para a planilha', async () => {
    const r = await chamar('s360SemanalProdutos', { ...ESCOPO, hoje: '2026-10-30' }, ALICE);
    const alfa3 = r.itens.filter((i) => i.CLIENTE_ID === CLIENTE.ALFA && i.semana === 3);
    assert.deepEqual(alfa3.map((i) => i.CODPROD), [PRODUTO.P2, PRODUTO.P1, PRODUTO.P3]);
    assert.ok(r.itens.every((i) => i.qt > 0 || i.qtAnt > 0));
  });

  await teste('RF-010: data da ultima carga concluida', async () => {
    assert.equal((await linhas('s360SemanalAtualizacao', {}, ALICE))[0].FIM_EM, '2026-10-30 08:05:00');
  });

  await teste('RF-011 (devolucoes): devolucao nova na fonte entra na leitura seguinte', async () => {
    exec(`INSERT INTO IMP_DEVOLUCOES_TOTVS (NOTA_DEVOLUCAO, DATA_DEVOLUCAO, CODFILIAL, CODEPTO, CODSEC, CODCLI, CODPROD, QT_DEVOLVIDA, VALOR_DEVOLVIDO)
      VALUES ('D6009', '2026-10-06', '${FILIAL}', '1', '${SECAO.A}', ${CLIENTE.ALFA}, ${PRODUTO.P1}, 1, 200)`);
    assert.equal((await linhaDe(ALICE, CLIENTE.ALFA)).SEMANAS[1].valor, 1000);
  });

  /* ─────────────── carga do ERP ─────────────── */

  const fonte = (linhasFonte) => {
    exec('DELETE FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA');
    const stmt = db.prepare(`INSERT INTO IMP_VENDAS_DASHBOARD_TOTVS_RCA (NUMPED, DTSAIDA, CODFILIAL, CODPROD, DESCRICAO, CODCLI, CODEPTO, CODSEC, QT, VLUNIT, TOTAL)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    exec('BEGIN');
    for (const l of linhasFonte) {
      stmt.run(l.numped, l.data ?? '2026-10-20', l.filial ?? FILIAL, l.produto ?? PRODUTO.P1, 'Produto', l.cliente ?? 6029,
        l.depto ?? '1', l.secao ?? String(SECAO.A), l.qt ?? 1, l.vlunit ?? 100, l.total ?? 100);
    }
    exec('COMMIT');
  };
  const carga = (agora, userId = null) => chamar('s360SemanalCarga', { agora }, userId);
  const raw = (numped) => banco(`SELECT * FROM PEDIDOS_SEMANAIS_SYNC_RAW WHERE NUMPED = '${numped}'`);
  const log = (exec2) => banco(`SELECT * FROM ACOMP_SEMANAL_SYNC_LOG WHERE EXECUCAO_ID = '${exec2}'`)[0];

  const BASE = [
    { numped: '5001', qt: 3, total: 300 }, { numped: '5001', qt: 2, total: 200 },
    { numped: '5002', data: '', cliente: 999999 },
    { numped: '5003', qt: 0, vlunit: 25, total: 100 },
    { numped: '5004', qt: 0, vlunit: 0, total: 100 },
    { numped: '5009', qt: 1, total: 50 },
  ];

  await teste('RN-017: chamada com usuario e recusada, inclusive ADMIN', async () => {
    const antes = banco('SELECT COUNT(*) AS N FROM ACOMP_SEMANAL_SYNC_LOG')[0].N;
    for (const quem of [ALICE, TANIA]) {
      const r = await carga('2026-11-02 08:00:00', quem);
      assert.equal(r.ok, false);
      assert.equal(r.error, MENSAGENS.manual);
    }
    assert.equal(banco('SELECT COUNT(*) AS N FROM ACOMP_SEMANAL_SYNC_LOG')[0].N, antes);
  });

  await teste('C-019 / RN-013: linhas repetidas somadas, validacao e quantidade', async () => {
    fonte(BASE);
    const r = await carga('2026-11-02 08:00:00');
    assert.equal(r.ok, true, r.error);
    const [p1] = raw('5001');
    assert.deepEqual([p1.QT, p1.TOTAL, p1.ATIVO, p1.SEMANA_NUMERO, p1.ID_SECAO], [5, 500, 1, 4, SECAO.A]);
    assert.equal((await linhaDe(ALICE, 6029)).SEMANAS[3].valor, 500 + 100 + 100 + 50, 'celula da 4a sem conta 500 do P1');
    const [semData] = raw('5002');
    assert.equal(semData.STATUS_INGESTAO, 'ERRO_DATA', 'sem data e sem cliente: so o erro de data');
    assert.equal(banco("SELECT COUNT(*) AS N FROM ACOMP_SEMANAL_SYNC_ERRO_ATUAL WHERE NUMPED = '5002'")[0].N, 1);
    assert.equal(raw('5003')[0].QT, 4);
    assert.equal(raw('5004')[0].QT, 1);
  });

  await teste('RN-014: item ausente na carga seguinte e inativado e so ele conta', async () => {
    fonte(BASE.filter((l) => l.numped !== '5009'));
    const r = await carga('2026-11-02 09:00:00');
    assert.equal(r.inativados, 1);
    assert.equal(raw('5009')[0].ATIVO, 0);
    assert.equal(log(r.execucaoId).TOTAL_INATIVADOS_RAW, 1);
    assert.equal((await linhaDe(ALICE, 6029)).SEMANAS[3].valor, 700);
  });

  await teste('C-013 / RN-016: uma carga por vez; presa ha mais de 30 min vira falha', async () => {
    exec("INSERT INTO ACOMP_SEMANAL_SYNC_LOG (EXECUCAO_ID, STATUS, INICIO_EM) VALUES ('PRESA1000', 'RUNNING', '2026-11-02 10:00:00')");
    const antes = banco('SELECT COUNT(*) AS N FROM ACOMP_SEMANAL_SYNC_LOG')[0].N;
    const r1 = await carga('2026-11-02 10:10:00');
    assert.equal(r1.ok, false);
    assert.equal(r1.error, 'Já existe uma sincronização em andamento desde 10:00.');
    assert.equal(banco('SELECT COUNT(*) AS N FROM ACOMP_SEMANAL_SYNC_LOG')[0].N, antes);
    const r2 = await carga('2026-11-02 10:31:00');
    assert.equal(r2.ok, true);
    const presa = log('PRESA1000');
    assert.deepEqual([presa.STATUS, presa.MENSAGEM], ['FAILED', MENSAGENS.interrompida]);
  });

  await teste('C-012: carga de 10.000 itens com 50 sem cliente', async () => {
    fonte(Array.from({ length: 10000 }, (_, i) => ({
      numped: `C${i}`, cliente: i < 50 ? 999999 : 6001 + (i % 40), produto: 61001 + (i % 3),
    })));
    const r = await carga('2026-11-02 11:00:00');
    const l = log(r.execucaoId);
    assert.deepEqual([l.STATUS, l.TOTAL_VALIDOS, l.TOTAL_ERROS], ['SUCCESS', 9950, 50]);
    assert.equal((await linhas('s360SemanalAtualizacao', {}, ALICE))[0].FIM_EM, '2026-11-02 11:00:00');
  });

  await teste('C-014 / RN-015: erro nao se repete; resolvido sai em 7 dias', async () => {
    const erros48 = Array.from({ length: 48 }, (_, i) => ({ numped: `E${i}`, cliente: 999999 }));
    fonte([...erros48, { numped: 'E900', secao: '9999' }, { numped: 'E901', secao: '9999' }]);
    await carga('2026-11-02 12:00:00');
    fonte([...erros48, { numped: 'E900' }, { numped: 'E901' }]);
    await carga('2026-11-02 13:00:00');
    const erros = banco("SELECT * FROM ACOMP_SEMANAL_SYNC_ERRO_ATUAL WHERE NUMPED LIKE 'E%'");
    assert.equal(erros.length, 50);
    assert.equal(erros.filter((e) => e.SITUACAO === 'ABERTO' && e.QTD_OCORRENCIAS === 2).length, 48);
    assert.deepEqual(erros.filter((e) => e.SITUACAO === 'RESOLVIDO').map((e) => e.NUMPED).sort(), ['E900', 'E901']);
    exec("UPDATE ACOMP_SEMANAL_SYNC_ERRO_ATUAL SET RESOLVIDO_EM = '2026-10-26 13:00:00' WHERE NUMPED = 'E900'");
    exec("UPDATE ACOMP_SEMANAL_SYNC_ERRO_ATUAL SET RESOLVIDO_EM = '2026-10-28 13:00:00' WHERE NUMPED = 'E901'");
    await carga('2026-11-03 14:00:00');
    assert.deepEqual(banco("SELECT NUMPED FROM ACOMP_SEMANAL_SYNC_ERRO_ATUAL WHERE SITUACAO = 'RESOLVIDO' AND NUMPED LIKE 'E9%'").map((e) => e.NUMPED), ['E901'],
      'resolvido ha 8 dias apagado, ha 6 dias fica');
  });

  await teste('RF-017: lista de erros abertos so para a TI', async () => {
    const ti = await linhas('s360SemanalErros', { tipo: 'ERRO_CLIENTE', pagina: '1' }, TANIA);
    assert.ok(ti.length === 48 && ti.every((e) => e.TIPO_ERRO === 'ERRO_CLIENTE'));
    assert.equal(Number(ti[0].TOTAL), 48);
    assert.equal((await linhas('s360SemanalErros', { tipo: '', pagina: '1' }, ALICE)).length, 0);
  });

  await teste('RNT-005 (servidor): semanas usadas na carga e na matriz sao as mesmas', async () => {
    const s = semanasDoMes(2026, 10);
    const r = banco("SELECT DISTINCT SEMANA_NUMERO AS N FROM PEDIDOS_SEMANAIS_SYNC_RAW WHERE DATA_SAIDA = '2026-10-20' AND ATIVO = 1");
    assert.deepEqual(r.map((x) => x.N), [s.findIndex((x) => x.ini <= '2026-10-20' && x.fim >= '2026-10-20') + 1]);
  });
}
