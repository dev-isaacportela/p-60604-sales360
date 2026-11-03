// Smoke da spec 008 (alertas, prospeccao, prospects, direcionamento): tabela
// Testes de docs/specs/008-alertas-prospeccao/plan.md. O relogio do banco e
// fixado por teste (em('AAAA-MM-DD HH:MM'), Brasilia): escritas e contador
// usam esse relogio; as listas recebem `hoje` como a tela manda.

import { registerMysqlFunctions } from '../mysql-dialect.mjs';
import { EMAIL, CLIENTE, PROSPECT, PRODUTO } from '../seeds/008-alertas.mjs';
import * as R from '../../lib/008-regras.mjs';

export default async function smoke({ teste, chamar, linhas, banco, db, assert, ID }) {
  let relogio = new Date();
  registerMysqlFunctions(db, { now: () => relogio });
  const em = (quando) => { relogio = new Date(`${quando.replace(' ', 'T')}:00-03:00`); };
  em('2026-10-30 10:00');

  const id = (email) => banco(`SELECT ID FROM INT_USER WHERE DESCR = '${email}'`)[0].ID;
  const ALICE = id(EMAIL.ALICE);
  const BENTO = id(EMAIL.BENTO);
  const CELSO = id(EMAIL.CELSO);
  const DORA = id(EMAIL.DORA);

  const ESC = (modo = 'ME', extra = {}) => ({ modo, coordenador: '', vendedor: '', filial: '', depto: '', secao: '', hoje: '2026-10-30', ...extra });
  const afetadas = async (nome, input, user) => (await chamar(nome, input, user)).affectedRows ?? 0;
  const listar = (user, filtros = {}, esc = ESC()) => linhas('s360AlertasListar', {
    ...esc, busca: '', buscaDigitos: '', ramo: '', tipo: '', valorMin: '', situacao: '', clienteId: '', produto: '', pagina: '1', ...filtros,
  }, user);
  const total = (ls) => Number(ls[0]?.TOTAL ?? 0);
  const resumo = async (user, esc = ESC()) => (await linhas('s360AlertasPainel', esc, user)).find((l) => l.TIPO_LINHA === 'RESUMO');
  const contador = async (user) => Number((await linhas('s360ContadoresObter', {}, user))[0].ALERTAS_NAO_LIDOS);
  const v = (DIA, VALOR, extra = {}) => ({ NUMPED: extra.numped ?? DIA, DIA, CODPROD: extra.prod ?? 1, DESCRICAO: 'Produto', VALOR, ID_CLIENTE: extra.cli ?? 1 });
  const prospect = (pid) => banco(`SELECT * FROM PROSPECTS WHERE ID = ${pid}`)[0];
  const ultimo = (tabela) => banco(`SELECT MAX(ID) AS ID FROM ${tabela}`)[0].ID;

  /* ─────────────── lista e leitura ─────────────── */

  await teste('C-001 / RN-010: lidos ocultos por padrao; Todos 12, Lidos 4; 8 pendentes', async () => {
    assert.equal(total(await listar(ALICE)), 8);
    assert.equal(total(await listar(ALICE, { situacao: 'TODOS' })), 12);
    assert.equal(total(await listar(ALICE, { situacao: 'LIDOS' })), 4);
    assert.equal(Number((await resumo(ALICE)).PENDENTES), 8);
  });

  await teste('C-007 / RN-009: cliente fora da carteira some da lista e do contador; coordenador so ve a BU dele', async () => {
    assert.equal(await contador(ALICE), 8);
    db.exec(`DELETE FROM EQUIPE_CLIENTE WHERE ID_CLIENTE = ${CLIENTE.Y} AND ID_VENDEDOR = ${ALICE}`);
    assert.equal(total(await listar(ALICE)), 5);
    assert.equal(await contador(ALICE), 5);
    db.exec(`INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, CODFILIAL) VALUES (${CLIENTE.Y}, ${ALICE}, '4')`);
    assert.equal(await contador(ALICE), 8);

    // Alice tambem em F2 Nutricao (da Dora), com 1 alerta la.
    db.exec(`INSERT INTO BU_VENDEDOR (BU_CODIGO, VENDEDOR_ID, ATIVO, CODFILIAL) VALUES ('1', ${ALICE}, 1, '2');
      INSERT INTO ALERTAS_INTELIGENTES (ID_VENDEDOR, CODFILIAL, ID_CLIENTE, TIPO_ALERTA, TITULO, LIDO, CODEPTO) VALUES (${ALICE}, 2, ${CLIENTE.X}, 'REPOSICAO', 'F2', 0, '1')`);
    const daDora = await listar(DORA, {}, ESC('TEAM'));
    assert.deepEqual(daDora.map((l) => l.TITULO), ['F2']);
    const doCelso = await listar(CELSO, {}, ESC('TEAM'));
    assert.equal(total(doCelso), 8);
    assert.ok(!doCelso.some((l) => l.TITULO === 'F2'));
    db.exec(`DELETE FROM ALERTAS_INTELIGENTES WHERE TITULO = 'F2';
      DELETE FROM BU_VENDEDOR WHERE VENDEDOR_ID = ${ALICE} AND CODFILIAL = '2'`);
  });

  await teste('C-004 / RN-011: marcar tudo no recorte Nutricao marca 5; os 3 de Medicamento seguem', async () => {
    assert.equal(await afetadas('s360AlertasMarcarTodos', { filial: '', depto: '1', secao: '' }, ALICE), 5);
    const restantes = await listar(ALICE);
    assert.equal(total(restantes), 3);
    assert.ok(restantes.every((l) => String(l.CODEPTO) === '8'));
  });

  await teste('C-008 / RN-013: contador baixa 1 ao marcar 1', async () => {
    assert.equal(await contador(ALICE), 3);
    const [primeiro] = await listar(ALICE);
    assert.equal(await afetadas('s360AlertaMarcarLido', { id: String(primeiro.ID) }, ALICE), 1);
    assert.equal(await contador(ALICE), 2);
    assert.equal(await afetadas('s360AlertaMarcarLido', { id: String(primeiro.ID) }, ALICE), 0);
  });

  await teste('C-005 / RN-011: coordenador nao marca alerta do vendedor; substituto com ferias ativas marca', async () => {
    const daEquipe = await listar(CELSO, {}, ESC('TEAM'));
    assert.equal(total(daEquipe), 2);
    assert.ok(daEquipe.every((l) => Number(l.PODE_MARCAR) === 0));
    assert.equal(Number((await resumo(CELSO, ESC('TEAM'))).MARCAVEIS), 0);
    assert.equal(await afetadas('s360AlertaMarcarLido', { id: String(daEquipe[0].ID) }, CELSO), 0);
    assert.equal(await afetadas('s360AlertasMarcarTodos', { filial: '', depto: '', secao: '' }, CELSO), 0);
    assert.equal(banco(`SELECT LIDO FROM ALERTAS_INTELIGENTES WHERE ID = ${daEquipe[0].ID}`)[0].LIDO, 0);
    em('2026-11-05 10:00');
    const doBento = await listar(BENTO, {}, ESC('ME', { hoje: '2026-11-05' }));
    assert.equal(total(doBento), 2);
    assert.ok(doBento.every((l) => Number(l.PODE_MARCAR) === 1));
    assert.equal(await afetadas('s360AlertaMarcarLido', { id: String(daEquipe[0].ID) }, BENTO), 1);
    em('2026-10-30 10:00');
  });

  await teste('C-006 / RN-012: filtros sobre os 340 alertas; potencial soma o filtro inteiro', async () => {
    db.exec(`DELETE FROM ALERTAS_INTELIGENTES WHERE ID_VENDEDOR = ${ALICE}`);
    const valores = Array.from({ length: 340 }, (_, i) => {
      const cliente = i < 4 ? CLIENTE.ACAI : CLIENTE.X;
      const tipo = i >= 4 && i < 61 ? 'REPOSICAO' : 'PRODUTO_PERDIDO';
      return `(${ALICE}, 4, ${cliente}, '${tipo}', 'Alerta ${i}', ${10 + i}, 'ALTA', 0, '1')`;
    });
    db.exec(`INSERT INTO ALERTAS_INTELIGENTES (ID_VENDEDOR, CODFILIAL, ID_CLIENTE, TIPO_ALERTA, TITULO, VALOR_REFERENCIA, PRIORIDADE, LIDO, CODEPTO) VALUES ${valores.join(', ')}`);
    const reposicao = await listar(ALICE, { tipo: 'REPOSICAO' });
    assert.equal(total(reposicao), 57);
    assert.equal(reposicao.length, 50);
    const porCnpj = await listar(ALICE, { busca: '12345678000190', buscaDigitos: '12345678000190' });
    assert.equal(total(porCnpj), 4);
    assert.equal(Number(porCnpj[0].POTENCIAL), 10 + 11 + 12 + 13);
    assert.equal(total(await listar(ALICE, { busca: 'acai' })), 4);
    const pagina7 = await listar(ALICE, { pagina: '7' });
    assert.equal(pagina7.length, 40);
    assert.equal(Number(pagina7[0].TOTAL), 340);
    assert.equal(total(await listar(ALICE, { valorMin: '300' })), 340 - 290);
  });

  /* ─────────────── geracao (RN-001…008, RN-016) ─────────────── */

  await teste('C-002 / RN-002: produto perdido (funcao)', async () => {
    const compras = [v('2026-03-10', 900), v('2026-05-12', 600), v('2026-06-15', 300)];
    const [a, ...resto] = R.produtoPerdido(compras, '2026-10-30');
    assert.equal(resto.length, 0);
    assert.equal(a.PRIORIDADE, 'ALTA');
    assert.equal(a.VALOR, 600);
    assert.equal(R.produtoPerdido([...compras, v('2026-09-15', 100)], '2026-10-30').length, 0);
  });

  await teste('RN-003: sazonalidade', async () => {
    const [a] = R.sazonalidade([v('2025-10-12', 500)], '2026-10-30');
    assert.equal(a.PRIORIDADE, 'ALTA');
    assert.equal(a.VALOR, 500);
    assert.equal(R.sazonalidade([v('2025-10-12', 500), v('2026-10-05', 100)], '2026-10-30').length, 0);
  });

  await teste('RN-004: reposicao', async () => {
    const compras = [v('2026-08-01', 100), v('2026-08-31', 100), v('2026-09-30', 100)];
    const [a] = R.reposicao(compras, '2026-10-28');
    assert.equal(a.PRIORIDADE, 'MEDIA');
    assert.equal(a.VALOR, 0);
    assert.match(a.DESCRICAO, /30\/10\/2026/);
    assert.equal(R.reposicao(compras, '2026-10-20').length, 0);
  });

  await teste('RN-005: volume crescente', async () => {
    const [a] = R.volumeCrescente([v('2026-06-01', 10000), v('2026-09-01', 13000)], '2026-10-30');
    assert.equal(a.VALOR, 13000);
    assert.equal(a.PRIORIDADE, 'MEDIA');
    assert.equal(R.volumeCrescente([v('2026-06-01', 10000), v('2026-09-01', 12000)], '2026-10-30').length, 0);
    assert.equal(R.volumeCrescente([v('2026-09-01', 12000)], '2026-10-30').length, 0);
  });

  await teste('RN-006: nao explorado', async () => {
    const meus = [v('2026-09-01', 100, { prod: 2 })];
    const outros = [v('2026-05-01', 1200, { prod: 1, cli: 2 }), v('2026-06-01', 1200, { prod: 1, cli: 3 })];
    const [a] = R.naoExplorado(meus, outros, '2026-10-30');
    assert.equal(a.PRIORIDADE, 'BAIXA');
    assert.equal(a.VALOR, 200);
    assert.equal(R.naoExplorado(meus, outros.slice(0, 1), '2026-10-30').length, 0);
  });

  await teste('RN-007: pedido incompleto', async () => {
    const base = [v('2026-09-01', 1000, { numped: 'A' }), v('2026-09-15', 1000, { numped: 'B' })];
    const [a] = R.pedidoIncompleto([...base, v('2026-10-29', 400, { numped: 'C' })], '2026-10-30');
    assert.equal(a.PRIORIDADE, 'MEDIA');
    assert.equal(a.VALOR, 400);
    assert.equal(R.pedidoIncompleto([...base, v('2026-10-29', 600, { numped: 'C' })], '2026-10-30').length, 0);
  });

  const fila = (agora) => chamar('s360AlertasProcessarFila', { agora }, 0);
  async function processarAte(dia, vendedor) {
    for (let i = 0; i < 60; i += 1) {
      await fila(`${dia} ${String(6 + Math.floor(i / 6)).padStart(2, '0')}:${String((i % 6) * 10).padStart(2, '0')}:00`);
      const [item] = banco(`SELECT STATUS FROM ALERTAS_PROCESSAMENTO WHERE RUN_ID = 'ALERTAS-${dia}' AND VENDEDOR_ID = ${vendedor}`);
      if (item?.STATUS === 'CONCLUIDO') return;
    }
    throw new Error(`a fila de ${dia} nao chegou ao vendedor ${vendedor}`);
  }
  const perdidos = () => banco(`SELECT * FROM ALERTAS_INTELIGENTES WHERE ID_VENDEDOR = ${ALICE} AND ID_CLIENTE = ${CLIENTE.PERDIDO}
    AND TIPO_ALERTA = 'PRODUTO_PERDIDO' ORDER BY ID`);

  await teste('C-002 / RN-001: a fila de 30/10 grava o produto perdido de Alice na BU', async () => {
    db.exec('DELETE FROM ALERTAS_PROCESSAMENTO');
    await processarAte('2026-10-30', ALICE);
    const [a, ...resto] = perdidos();
    assert.equal(resto.length, 0);
    assert.equal(Number(a.VALOR_REFERENCIA), 600);
    assert.equal(a.PRIORIDADE, 'ALTA');
    assert.equal(Number(a.CODFILIAL), 4);
    assert.equal(String(a.CODEPTO), '1');
    assert.equal(a.PRODUTO_REFERENCIA, `${PRODUTO.P} - SUPLEMENTO P 400G`);
    assert.equal(a.MES_REFERENCIA, '2026-10');
  });

  await teste('C-003 / RN-008: sem duplicar enquanto nao lido; volta depois de lido; 61 dias apagado', async () => {
    db.exec(`INSERT INTO ALERTAS_INTELIGENTES (ID_VENDEDOR, CODFILIAL, ID_CLIENTE, TIPO_ALERTA, TITULO, LIDO, DATA_GERACAO) VALUES
      (${ALICE}, 4, ${CLIENTE.X}, 'REPOSICAO', 'Velho 61', 0, '2026-08-30 06:00:00'),
      (${ALICE}, 4, ${CLIENTE.X}, 'REPOSICAO', 'Velho 59', 0, '2026-09-02 06:00:00')`);
    await processarAte('2026-10-31', ALICE);
    assert.equal(perdidos().length, 1);
    assert.equal(banco("SELECT COUNT(*) AS N FROM ALERTAS_INTELIGENTES WHERE TITULO = 'Velho 61'")[0].N, 0);
    assert.equal(banco("SELECT COUNT(*) AS N FROM ALERTAS_INTELIGENTES WHERE TITULO = 'Velho 59'")[0].N, 1);
    db.exec(`UPDATE ALERTAS_INTELIGENTES SET LIDO = 1 WHERE ID = ${perdidos()[0].ID};
      DELETE FROM ALERTAS_PROCESSAMENTO WHERE RUN_ID = 'ALERTAS-2026-10-31'`);
    await processarAte('2026-10-31', ALICE);
    assert.equal(perdidos().length, 2);
  });

  await teste('C-010 / RN-016: 26 vendedores em 9 execucoes; uma fila por dia; preso ha 21 min vira erro', async () => {
    // Funcoes.
    let itens = Array.from({ length: 26 }, (_, i) => ({ ID: i + 1, STATUS: 'PENDENTE' }));
    let execucoes = 0;
    while (itens.some((i) => i.STATUS === 'PENDENTE')) {
      const { processar } = R.planoFila(itens, '2026-11-02 06:00:00');
      assert.ok(processar.length <= 3);
      const ids = new Set(processar.map((i) => i.ID));
      itens = itens.map((i) => (ids.has(i.ID) ? { ...i, STATUS: 'CONCLUIDO' } : i));
      execucoes += 1;
    }
    assert.equal(execucoes, 9);
    assert.equal(R.itensPorCliente(5, Array.from({ length: 40 }, (_, i) => ({ ID_CLIENTE: 100 + i }))).length, 40);
    assert.deepEqual(R.planoFila([{ ID: 7, STATUS: 'PROCESSANDO', INICIADO_EM: '2026-11-02 07:00:00' }], '2026-11-02 07:21:00').expirar, [7]);
    assert.deepEqual(R.planoFila([{ ID: 7, STATUS: 'PROCESSANDO', INICIADO_EM: '2026-11-02 07:00:00' }], '2026-11-02 07:20:00').expirar, []);

    // SF, com so 26 vendedores ativos no banco do teste.
    db.exec(`UPDATE BU_VENDEDOR SET ATIVO = 0, ATUALIZADO_EM = 'smoke-008' WHERE ATIVO = 1`);
    const novos = Array.from({ length: 26 }, (_, i) => `('1', ${90001 + i}, 1, '4', 'smoke-008-novo')`).join(', ');
    db.exec(`INSERT INTO BU_VENDEDOR (BU_CODIGO, VENDEDOR_ID, ATIVO, CODFILIAL, ATUALIZADO_EM) VALUES ${novos}`);
    const pendentes = () => banco("SELECT COUNT(*) AS N FROM ALERTAS_PROCESSAMENTO WHERE RUN_ID = 'ALERTAS-2026-11-02' AND STATUS = 'PENDENTE'")[0].N;
    for (let i = 0; i < 8; i += 1) await fila(`2026-11-02 06:${String(i * 5).padStart(2, '0')}:00`);
    assert.equal(pendentes(), 2);
    await fila('2026-11-02 06:45:00');
    assert.equal(pendentes(), 0);
    await fila('2026-11-02 06:50:00');
    assert.equal(banco("SELECT COUNT(*) AS N FROM ALERTAS_PROCESSAMENTO WHERE RUN_ID = 'ALERTAS-2026-11-02'")[0].N, 26);
    db.exec(`INSERT INTO ALERTAS_PROCESSAMENTO (RUN_ID, VENDEDOR_ID, STATUS, CRIADO_EM, INICIADO_EM) VALUES ('ALERTAS-2026-11-02', 90001, 'PROCESSANDO', '2026-11-02 07:00:00', '2026-11-02 07:00:00')`);
    const preso = ultimo('ALERTAS_PROCESSAMENTO');
    await fila('2026-11-02 07:21:00');
    assert.equal(banco(`SELECT STATUS FROM ALERTAS_PROCESSAMENTO WHERE ID = ${preso}`)[0].STATUS, 'ERRO');
    db.exec(`DELETE FROM BU_VENDEDOR WHERE ATUALIZADO_EM = 'smoke-008-novo';
      UPDATE BU_VENDEDOR SET ATIVO = 1, ATUALIZADO_EM = NULL WHERE ATUALIZADO_EM = 'smoke-008'`);
  });

  /* ─────────────── e-mails semanais ─────────────── */

  await teste('C-011 / RN-017: 45 avisos -> 1 e-mail com 30 linhas e a nota; reexecucao nao reenvia; sem avisos, sem e-mail', async () => {
    db.exec("DELETE FROM ALERTAS_INTELIGENTES WHERE DATA_GERACAO >= '2026-10-29 03:00:00'");
    const prioridades = ['ALTA', 'MEDIA', 'BAIXA'];
    const valores = Array.from({ length: 45 }, (_, i) => `(${ALICE}, 4, ${CLIENTE.X}, 'Xavier', 'REPOSICAO', 'Aviso ${i}', '${prioridades[i % 3]}', 0, '2026-11-01 06:10:00', '1')`);
    db.exec(`INSERT INTO ALERTAS_INTELIGENTES (ID_VENDEDOR, CODFILIAL, ID_CLIENTE, NOME_CLIENTE, TIPO_ALERTA, TITULO, PRIORIDADE, LIDO, DATA_GERACAO, CODEPTO) VALUES ${valores.join(', ')}`);
    const r1 = await chamar('s360AlertasResumoSemanal', { agora: '2026-11-05 03:00:00' }, 0);
    assert.equal(r1.enviados.length, 1);
    const [envio] = r1.enviados;
    assert.equal(envio.vendedor, ALICE);
    assert.equal(envio.status, 'ENVIADO');
    assert.equal(envio.linhas, 30);
    assert.equal(envio.total, 45);
    assert.equal(envio.nota, R.NOTA_RESUMO);
    assert.ok(!r1.enviados.some((x) => x.vendedor === ID.BRUNO));
    const r2 = await chamar('s360AlertasResumoSemanal', { agora: '2026-11-05 03:05:00' }, 0);
    assert.equal(r2.enviados.length, 0);
    assert.equal(banco(`SELECT COUNT(*) AS N FROM ALERTAS_EMAIL_SEMANAL WHERE ID_VENDEDOR = ${ALICE} AND STATUS = 'ENVIADO'`)[0].N, 1);
    const { linhas: primeiras } = R.linhasResumo([{ PRIORIDADE: 'BAIXA', ID: 1 }, { PRIORIDADE: 'ALTA', ID: 2 }]);
    assert.deepEqual(primeiras.map((a) => a.ID), [2, 1]);
  });

  await teste('C-012 / RN-018: semana operacional encerrada, liquido no cabecalho e no ranking, meta proporcional', async () => {
    assert.deepEqual(R.periodoRelatorio('2026-11-09'), { n: 1, inicio: '2026-11-01', fim: '2026-11-05' });
    const recortada = R.periodoRelatorio('2026-11-02');
    assert.deepEqual([recortada.inicio, recortada.fim], ['2026-10-30', '2026-10-31']);
    assert.equal(R.metaProporcional(30000, '2026-11-01', '2026-11-05'), 5000);
    assert.equal(R.assuntoRelatorio({ inicio: '2026-11-01', fim: '2026-11-05' }), 'Relatório semanal de vendas - 01/11/2026 a 05/11/2026');

    db.exec(`UPDATE FERIAS_VENDEDOR SET ATIVO = 0 WHERE COD_RCA = 8001;
      INSERT INTO IMP_VENDAS_DASHBOARD_TOTVS_RCA (NUMPED, DTSAIDA, CODFILIAL, CODPROD, DESCRICAO, CODCLI, CLIENTE, CODEPTO, CODSEC, TOTAL) VALUES
        ('S1', '2026-11-02', '4', ${PRODUTO.DIETA}, 'DIETA', ${CLIENTE.K}, 'K', '1', '101', 30000),
        ('S2', '2026-11-03', '4', ${PRODUTO.DIETA}, 'DIETA', ${CLIENTE.K}, 'K', '1', '101', 20000);
      INSERT INTO IMP_DEVOLUCOES_TOTVS (NUMPED, DATA_DEVOLUCAO, CODFILIAL, CODEPTO, CODSEC, CODCLI, CLIENTE, CODPROD, DESCRICAO, VALOR_DEVOLVIDO) VALUES
        ('S1', '2026-11-04', '4', '1', '101', ${CLIENTE.K}, 'K', ${PRODUTO.DIETA}, 'DIETA', 2000);
      INSERT INTO METAS_BU_VENDEDOR (CODFILIAL, CODEPTO, VENDEDOR_ID, MES, ANO, META_VALOR) VALUES (4, 1, ${ALICE}, 11, 2026, 30000);`);
    const r = await chamar('s360RelatorioSemanalCoordenadores', { agora: '2026-11-09 08:00:00' }, 0);
    const celso = r.enviados.find((x) => x.sup === 8001);
    assert.equal(celso.status, 'ENVIADO');
    assert.equal(celso.relatorio.bruto, 50000);
    assert.equal(celso.relatorio.devolucao, 2000);
    assert.equal(celso.relatorio.liquido, 48000);
    const alice = celso.relatorio.vendedores.find((x) => Number(x.chave) === ALICE);
    assert.equal(alice.liquido, 48000);
    assert.equal(alice.metaProporcional, 5000);
    const [log] = banco('SELECT * FROM RELATORIO_SEMANAL_COORDENADORES_LOG WHERE COD_SUPERVISOR = 8001');
    assert.equal(Number(log.FATURAMENTO_LIQUIDO), 48000);
    assert.equal(log.DATA_INICIO, '2026-11-01');
    const r2 = await chamar('s360RelatorioSemanalCoordenadores', { agora: '2026-11-09 09:00:00' }, 0);
    assert.ok(!r2.enviados.some((x) => x.sup === 8001));
    db.exec('UPDATE FERIAS_VENDEDOR SET ATIVO = 1 WHERE COD_RCA = 8001');
  });

  /* ─────────────── prospeccao ─────────────── */

  const prospeccao = (user, extra = {}) => chamar('s360ProspeccaoListar', { ...ESC('ME'), tendencia: '', busca: '', pagina: '1', ...extra }, user);
  const achar = (r, cliente) => r.linhas.find((l) => l.ID === cliente);

  await teste('C-013 / RN-020: K alta tendencia; com 15 dias, media; L inativo e no filtro Cliente inativo', async () => {
    const r = await prospeccao(ALICE, { hoje: '2026-10-20' });
    assert.equal(r.ok, true);
    const k = achar(r, CLIENTE.K);
    assert.equal(k.CICLO, 20);
    assert.equal(k.DIAS_SEM_COMPRAR, 18);
    assert.equal(k.PADRAO, 2);
    assert.equal(k.TENDENCIA, 'ALTA');
    assert.equal(r.semana, 4);
    assert.equal(achar(r, CLIENTE.L).TENDENCIA, 'INATIVO');
    assert.equal(achar(await prospeccao(ALICE, { hoje: '2026-10-17' }), CLIENTE.K).TENDENCIA, 'MEDIA');
    const inativos = await prospeccao(ALICE, { hoje: '2026-10-20', tendencia: 'INATIVO' });
    assert.deepEqual(inativos.linhas.map((l) => l.ID), [CLIENTE.L]);
    assert.ok(!achar(r, CLIENTE.U), 'cliente sem compra nao entra');
  });

  await teste('C-014 / RN-020: substituto ve os clientes do titular so com ferias ativas; recorte de departamento', async () => {
    const em05 = await prospeccao(BENTO, { hoje: '2026-11-05' });
    assert.ok(achar(em05, CLIENTE.K) && achar(em05, CLIENTE.B1));
    const em16 = await prospeccao(BENTO, { hoje: '2026-11-16' });
    assert.ok(!achar(em16, CLIENTE.K));
    assert.ok(achar(em16, CLIENTE.B1));
    assert.ok(achar(await prospeccao(ALICE, { hoje: '2026-10-20' }), CLIENTE.M));
    assert.ok(!achar(await prospeccao(ALICE, { hoje: '2026-10-20', depto: '1' }), CLIENTE.M));
  });

  /* ─────────────── prospects ─────────────── */

  const prospects = (user, extra = {}) => linhas('s360ProspectsListar', { etapa: '', busca: '', pagina: '1', ...extra }, user);
  const meus = Object.values(PROSPECT);

  await teste('C-015 / RN-021: vendedor ve os seus, coordenador a equipe, diretoria todos', async () => {
    const daAlice = await prospects(ALICE);
    assert.deepEqual(daAlice.map((p) => p.ID).sort(), [...meus].sort());
    assert.ok(daAlice.every((p) => Number(p.PODE_EDITAR) === 1));
    assert.equal(daAlice.find((p) => p.ID === PROSPECT.CLINICA_NOVA).CONTATO, 'Maria Lima');
    const doCelso = (await prospects(CELSO)).filter((p) => meus.includes(p.ID));
    assert.equal(doCelso.length, 4);
    assert.ok(doCelso.every((p) => Number(p.PODE_EDITAR) === 0));
    assert.equal((await prospects(ID.GIL)).filter((p) => meus.includes(p.ID)).length, 4);
    assert.equal((await prospects(ID.BRUNO)).filter((p) => meus.includes(p.ID)).length, 0);
    assert.equal((await prospects(ALICE, { etapa: 'NEGOCIACAO' })).length, 1);
  });

  const agendar = (pid, inicio, fim) => chamar('s360ProspeccaoCriar', {
    prospectId: String(pid), vendedores: '[]', data: '2026-11-10', inicio, fim, tipo: 'Prospecção', objetivo: '',
  }, ALICE);

  await teste('C-016 / RN-022: etapa automatica avanca e nao regride; mudar etapa manual', async () => {
    assert.ok((await agendar(PROSPECT.CLINICA_NOVA, '09:00', '10:00')).affectedRows > 0);
    assert.equal(prospect(PROSPECT.CLINICA_NOVA).STATUS_PIPELINE, 'NEGOCIACAO');
    assert.ok((await agendar(PROSPECT.LAR_SOL, '11:00', '12:00')).affectedRows > 0);
    assert.equal(prospect(PROSPECT.LAR_SOL).STATUS_PIPELINE, 'VISITA_AGENDADA');
    const visita = banco(`SELECT MAX(ID) AS ID FROM PROSPECT_VISITAS WHERE PROSPECT_ID = ${PROSPECT.LAR_SOL}`)[0].ID;
    db.exec(`UPDATE PROSPECT_VISITAS SET STATUS = 'EM_ANDAMENTO' WHERE ID = ${visita}`);
    assert.ok((await chamar('s360AgendaCheckout', { origem: 'PROSPECCAO', id: String(visita), relato: 'Visitamos o lar.' }, ALICE)).affectedRows > 0);
    assert.equal(prospect(PROSPECT.LAR_SOL).STATUS_PIPELINE, 'VISITADO');

    const mudar = (pid, etapa, user = ALICE) => afetadas('s360ProspectEtapaMudar', { prospectId: String(pid), etapa }, user);
    assert.equal(await mudar(PROSPECT.PERDIDO, 'NOVO'), 1);
    assert.equal(prospect(PROSPECT.PERDIDO).STATUS_PIPELINE, 'NOVO');
    assert.equal(await mudar(PROSPECT.PERDIDO, 'CONVERTIDO'), 0);
    assert.equal(await mudar(PROSPECT.PERDIDO, 'PERDIDO', CELSO), 0);
    assert.equal(await mudar(PROSPECT.PERDIDO, 'PERDIDO', ID.BRUNO), 0);

    assert.equal(await afetadas('s360ProspectContatoAdicionar', { prospectId: String(PROSPECT.CLINICA_NOVA), nome: 'Paula Dias', cargo: 'Diretora', telefone: '', email: '', principal: '1' }, ALICE), 2);
    assert.equal(await afetadas('s360ProspectContatoAdicionar', { prospectId: String(PROSPECT.CLINICA_NOVA), nome: '  ', cargo: '', telefone: '', email: '', principal: '1' }, ALICE), 0);
    const contatos = (await linhas('s360ProspectDetalhe', { prospectId: String(PROSPECT.CLINICA_NOVA) }, ALICE)).filter((l) => l.TIPO_LINHA === 'CONTATO');
    assert.deepEqual(contatos.filter((c) => Number(c.PRINCIPAL) === 1).map((c) => c.NOME), ['Paula Dias']);
  });

  await teste('RN-024: concluir visita de prospeccao exige resumo; objecoes e proximo passo gravados', async () => {
    const visita = banco(`SELECT MAX(ID) AS ID FROM PROSPECT_VISITAS WHERE PROSPECT_ID = ${PROSPECT.CLINICA_NOVA}`)[0].ID;
    db.exec(`UPDATE PROSPECT_VISITAS SET STATUS = 'EM_ANDAMENTO' WHERE ID = ${visita}`);
    const resultado = { visitaId: String(visita), objecoes: 'preço', proximoPasso: 'enviar proposta', dataProximoPasso: '2026-11-10' };
    assert.equal(await afetadas('s360ProspectVisitaResultado', resultado, ALICE), 0, 'visita ainda nao concluida');
    assert.equal(await afetadas('s360AgendaCheckout', { origem: 'PROSPECCAO', id: String(visita), relato: '' }, ALICE), 0);
    assert.ok(await afetadas('s360AgendaCheckout', { origem: 'PROSPECCAO', id: String(visita), relato: 'Reunião com a diretoria.' }, ALICE) > 0);
    assert.equal(await afetadas('s360ProspectVisitaResultado', resultado, CELSO), 0);
    assert.equal(await afetadas('s360ProspectVisitaResultado', resultado, ALICE), 1);
    const [pv] = banco(`SELECT * FROM PROSPECT_VISITAS WHERE ID = ${visita}`);
    assert.deepEqual([pv.OBJECOES, pv.PROXIMO_PASSO, pv.DATA_PROXIMO_PASSO], ['preço', 'enviar proposta', '2026-11-10']);
    assert.equal(prospect(PROSPECT.CLINICA_NOVA).STATUS_PIPELINE, 'NEGOCIACAO');
  });

  await teste('C-017 / RN-023: converter exige codigo do ERP; convertido sai do agendamento e nao entra na carteira', async () => {
    const converter = (codigo) => afetadas('s360ProspectConverter', { prospectId: String(PROSPECT.LAR_SOL), codigo }, ALICE);
    assert.equal(await converter('98765'), 0);
    assert.equal(prospect(PROSPECT.LAR_SOL).STATUS_PIPELINE, 'VISITADO');
    assert.equal(await converter(String(CLIENTE.LAR_SOL_ERP)), 1);
    const p = prospect(PROSPECT.LAR_SOL);
    assert.equal(p.STATUS_PIPELINE, 'CONVERTIDO');
    assert.equal(String(p.COD_CLIENTE_TOTVS), String(CLIENTE.LAR_SOL_ERP));
    assert.ok(p.CONVERTIDO_EM);
    assert.ok(!(await linhas('s360AgendaProspects', { busca: '' }, ALICE)).some((x) => x.ID === PROSPECT.LAR_SOL));
    assert.equal(banco(`SELECT COUNT(*) AS N FROM EQUIPE_CLIENTE WHERE ID_CLIENTE = ${CLIENTE.LAR_SOL_ERP}`)[0].N, 0);
    assert.equal(await afetadas('s360ProspectEtapaMudar', { prospectId: String(PROSPECT.LAR_SOL), etapa: 'NEGOCIACAO' }, ALICE), 0);
  });

  /* ─────────────── direcionamento ─────────────── */

  const semana = (hoje) => ({ ...ESC('TEAM', { hoje }), semana: '2026-10-26' });

  await teste('C-018 / RN-026: controle de agenda de Alice na semana de 26/10', async () => {
    const ls = (await linhas('s360DirecionamentoAgenda', semana('2026-10-29'), CELSO)).filter((l) => l.EXECUTIVO_ID === ALICE);
    assert.equal(ls.length, 11);
    const soma = (campo) => ls.reduce((t, l) => t + Number(l[campo]), 0);
    assert.equal(ls.length - soma('CANCELADA'), 10);
    assert.deepEqual(['CONCLUIDA', 'NAO_CONCLUIDA', 'SEM_RELATO', 'REAGENDADA', 'CANCELADA'].map(soma), [8, 2, 2, 2, 1]);
    assert.equal(ls.find((l) => l.DATA === '2026-10-27' && l.STATUS === 'AGENDADA').SITUACAO, 'Vencida sem relato');
    assert.equal(ls.find((l) => l.DATA === '2026-10-30').SITUACAO, 'Agendada · sem relato');
  });

  await teste('C-019 / RN-027: cliente critico no prazo e depois sem compra; 2 compras fica fora', async () => {
    const w = async (hoje) => {
      const r = await chamar('s360DirecionamentoCriticos', semana(hoje), CELSO);
      assert.equal(r.ok, true);
      const e = r.executivos.find((x) => x.VENDEDOR_ID === ALICE);
      return { e, c: e?.clientes.find((x) => x.ID_CLIENTE === CLIENTE.W) };
    };
    const em29 = await w('2026-10-29');
    assert.equal(em29.c.CICLO, 20);
    assert.equal(em29.c.PREVISTA, '2026-10-31');
    assert.equal(em29.c.SITUACAO, 'Ainda no prazo');
    const em02 = await w('2026-11-02');
    assert.equal(em02.c.SITUACAO, 'Não comprou');
    assert.equal(em02.c.TICKET, 8000);
    assert.ok(em02.e.EM_RISCO >= 8000);
    db.exec(`DELETE FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA WHERE CODCLI = ${CLIENTE.W} AND DTSAIDA = '2026-09-01'`);
    assert.equal((await w('2026-11-02')).c, undefined);
  });

  await teste('C-020 / RN-028: carteira sem visitacao por faixa', async () => {
    const ls = await linhas('s360DirecionamentoSemVisita', { ...ESC('TEAM'), faixa: '', busca: '', pagina: '1' }, CELSO);
    const de = (cliente) => ls.find((l) => l.ID_CLIENTE === cliente && l.VENDEDOR_ID === ALICE);
    assert.equal(de(CLIENTE.V).FAIXA, '31_60');
    assert.equal(Number(de(CLIENTE.V).DIAS), 45);
    assert.equal(de(CLIENTE.U).FAIXA, 'NUNCA');
    assert.equal(de(CLIENTE.T).FAIXA, 'NUNCA');
    assert.equal(de(CLIENTE.R), undefined);
    assert.ok(Number(ls[0].N_NUNCA) >= 2);
    const nunca = await linhas('s360DirecionamentoSemVisita', { ...ESC('TEAM'), faixa: 'NUNCA', busca: 'uruana', pagina: '1' }, CELSO);
    assert.deepEqual(nunca.map((l) => l.ID_CLIENTE), [CLIENTE.U]);
  });

  await teste('C-021 / RN-025: vendedor nao recebe dado do Direcionamento', async () => {
    for (const modo of ['ME', 'TEAM']) {
      assert.equal((await linhas('s360DirecionamentoAgenda', { ...semana('2026-10-29'), modo }, ALICE)).length, 0);
      assert.equal((await linhas('s360DirecionamentoSemVisita', { ...ESC(modo), faixa: '', busca: '', pagina: '1' }, ALICE)).length, 0);
      assert.equal((await chamar('s360DirecionamentoCriticos', { ...semana('2026-10-29'), modo }, ALICE)).ok, false);
    }
  });
}
