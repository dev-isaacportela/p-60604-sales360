// Smoke da spec 004 — atividades. Rodado por ../smoke.mjs num banco
// descartavel so deste arquivo. A ordem importa: leituras primeiro, depois
// os testes que gravam (o contador de Amanda muda ao longo do arquivo).

import { HOJE, EMAIL, CLIENTE, ATIVIDADE_BRENO } from '../seeds/004-atividades.mjs';

export default async function ({ teste, chamar, linhas, banco, db, assert }) {
  const id = (email) => banco(`SELECT ID FROM INT_USER WHERE DESCR = '${email}'`)[0].ID;
  const [AMANDA, BIA, ELISA, BRENO, CAIO] = ['AMANDA', 'BIA', 'ELISA', 'BRENO', 'CAIO'].map((k) => id(EMAIL[k]));
  const ESCOPO = { modo: 'ME', coordenador: '', vendedor: '', filial: '', depto: '', secao: '', hoje: HOJE };
  const FILTROS = { status: '', prioridade: '', prazo: '' };

  const abertas = (userId, input = {}) => linhas('s360AtividadesAbertas', { ...ESCOPO, ...FILTROS, ...input }, userId);
  const concluidas = (userId, input = {}) => linhas('s360AtividadesConcluidas', { ...ESCOPO, ...FILTROS, pagina: '1', ...input }, userId);
  const resumo = async (userId, input = {}) => (await linhas('s360AtividadesResumo', { ...ESCOPO, ...FILTROS, ...input }, userId))[0];
  const log = (userId, atividade, input = {}) => linhas('s360AtividadeLog', { ...ESCOPO, id: String(atividade), ...input }, userId);
  const contador = async (userId) => (await linhas('s360ContadoresObter', {}, userId))[0].ATIVIDADES_PENDENTES;
  const afetadas = async (nome, input, userId) => (await chamar(nome, input, userId)).affectedRows;
  const tarefa = (atividade) => banco(`SELECT * FROM TAREFAS WHERE ID = ${atividade}`)[0];
  const tarefaPorTitulo = (titulo) => banco(`SELECT * FROM TAREFAS WHERE TITULO = '${titulo}'`)[0];
  const logs = (atividade) => banco(`SELECT * FROM ATIVIDADES_LOG WHERE ID_ATIVIDADE = ${atividade} ORDER BY ID`);
  const fila = (atividade) => banco(`SELECT * FROM GOOGLE_AGENDA_FILA WHERE ENTIDADE = 'TAREFA' AND ENTIDADE_ID = ${atividade}`);

  const criar = (userId, input) =>
    afetadas('s360AtividadeCriar', { titulo: '', descricao: '', clienteId: '', prioridade: '', prazo: '', hoje: HOJE, ...input }, userId);
  // Edicao manda todos os campos, como a tela: os atuais + o que muda.
  const editar = (userId, atividade, mudanca) => {
    const t = tarefa(atividade);
    return afetadas('s360AtividadeAtualizar', {
      id: String(atividade), titulo: t.TITULO, descricao: t.DESCRICAO ?? '', clienteId: t.CLIENTE_ID == null ? '' : String(t.CLIENTE_ID),
      prioridade: t.PRIORIDADE, prazo: t.DATA_LIMITE ?? '', hoje: HOJE, ...mudanca,
    }, userId);
  };
  const status = (userId, atividade, novo) => afetadas('s360AtividadeStatus', { id: String(atividade), status: novo }, userId);
  const excluir = (userId, atividade) => afetadas('s360AtividadeExcluir', { id: String(atividade) }, userId);

  // Hora de Brasilia "agora" (o simulador e UTC, como o UTC_TIMESTAMP do MySQL).
  const agoraBrasilia = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
  const pertoDeAgora = (texto) => Math.abs(Date.parse(`${String(texto).replace(' ', 'T')}Z`) - Date.parse(`${agoraBrasilia().replace(' ', 'T')}Z`)) < 60000;

  /* ─────────────── leitura ─────────────── */

  await teste('RN-011: contador do menu = A Fazer + Em andamento do usuario', async () => {
    assert.equal(await contador(AMANDA), 3, '2 A Fazer + 1 Em andamento; as 5 Concluidas nao contam');
  });

  await teste('C-005 / RN-007: ordem das abertas e concluidas em paginas de 20', async () => {
    const ordem = (await abertas(BIA)).map((t) => [t.STATUS, t.DATA_LIMITE]);
    assert.deepEqual(ordem, [['PENDENTE', '2026-11-04'], ['PENDENTE', null], ['EM_ANDAMENTO', '2026-11-01'], ['EM_ANDAMENTO', '2026-11-02']]);
    const p1 = await concluidas(BIA);
    const p2 = await concluidas(BIA, { pagina: '2' });
    assert.equal(p1.length, 20);
    assert.equal(p2.length, 5);
    assert.equal(p1[0].TOTAL, 25);
    const datas = [...p1, ...p2].map((t) => t.CONCLUIDO_EM);
    assert.deepEqual(datas, [...datas].sort().reverse(), 'conclusao mais recente primeiro');
    assert.equal((await resumo(BIA)).CONCLUIDAS, 25);
  });

  await teste('C-011 / RN-013: filtros e cards refletem o filtro', async () => {
    assert.equal((await resumo(ELISA)).TOTAL, 12);
    assert.equal((await abertas(ELISA, { prazo: '2026-11-05' })).length, 3);
    assert.equal((await resumo(ELISA, { prazo: '2026-11-05' })).TOTAL, 3);
    assert.equal((await abertas(ELISA, { prioridade: 'ALTA' })).length, 5);
    assert.equal((await resumo(ELISA, { prioridade: 'ALTA' })).TOTAL, 5);
    assert.equal((await abertas(ELISA, { status: 'EM_ANDAMENTO' })).length, 6);
    assert.equal((await resumo(ELISA, { status: 'EM_ANDAMENTO' })).EM_ANDAMENTO, 6);
  });

  await teste('RN-006 (servidor): atrasada = prazo antes de hoje e nao concluida', async () => {
    db.exec(`INSERT INTO TAREFAS (VENDEDOR_ID, TITULO, STATUS, PRIORIDADE, DATA_LIMITE, CRIADO_EM, CONCLUIDO_EM) VALUES
      (${BRENO}, 'Vencida ontem', 'PENDENTE', 'MEDIA', '2026-10-29', '2026-10-01 08:00:00', NULL),
      (${BRENO}, 'Vence hoje', 'EM_ANDAMENTO', 'MEDIA', '2026-10-30', '2026-10-01 08:00:00', NULL),
      (${BRENO}, 'Concluida vencida', 'CONCLUIDA', 'MEDIA', '2026-10-28', '2026-10-01 08:00:00', '2026-10-28 10:00:00')`);
    const r = await resumo(BRENO);
    assert.deepEqual([r.TOTAL, r.EM_ANDAMENTO, r.ATRASADAS, r.CONCLUIDAS], [4, 1, 1, 1]);
  });

  await teste('RN-008 (busca): carteira propria, busca inteligente, ate 80 e o total', async () => {
    const r = await chamar('s360AtividadeClientes', { busca: 'hosp sao lucas', hoje: HOJE }, AMANDA);
    assert.equal(r.ok, true);
    assert.equal(r.linhas[0].ID, CLIENTE.HOSPITAL);
    assert.ok(!r.linhas.some((l) => l.ID === CLIENTE.FORA), 'cliente fora da carteira nunca aparece');
    assert.equal((await chamar('s360AtividadeClientes', { busca: '', hoje: HOJE }, CAIO)).total, 0, 'Caio nao tem carteira');
    assert.equal((await chamar('s360AtividadeClientes', { busca: 'hospital', hoje: '' }, AMANDA)).ok, false);

    const extras = Array.from({ length: 85 }, (_, i) => 4101 + i);
    db.exec(`INSERT INTO CLIENTES (ID, RAZAO_SOCIAL, CIDADE, UF, STATUS, WINTHOR_CODCLI) VALUES ${extras.map((c) => `(${c}, 'CLINICA TESTE ${c} LTDA', 'Palmas', 'TO', 'ATIVO', ${c})`).join(', ')}`);
    db.exec(`INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, CODFILIAL, CRIADO_EM) VALUES ${extras.map((c) => `(${c}, ${AMANDA}, '6', '2026-10-01 08:00:00')`).join(', ')}`);
    const muitos = await chamar('s360AtividadeClientes', { busca: 'clinica teste', hoje: HOJE }, AMANDA);
    assert.equal(muitos.linhas.length, 80);
    assert.equal(muitos.total, 85);
  });

  /* ─────────────── escrita ─────────────── */

  await teste('C-002 / RN-005: titulo e prazo obrigatorios, nada gravado', async () => {
    const antes = banco('SELECT COUNT(*) AS N FROM TAREFAS')[0].N;
    assert.equal(await criar(AMANDA, { titulo: '   ', prazo: '2026-11-05' }), 0);
    assert.equal(await criar(AMANDA, { titulo: 'Sem prazo', prazo: '' }), 0);
    assert.equal(await criar(AMANDA, { titulo: 'x'.repeat(301), prazo: '2026-11-05' }), 0);
    assert.equal(banco('SELECT COUNT(*) AS N FROM TAREFAS')[0].N, antes);
    assert.equal(banco('SELECT COUNT(*) AS N FROM GOOGLE_AGENDA_FILA')[0].N, 0);
  });

  let cotacao;
  await teste('C-001: criar com cliente; log, contador e fila na mesma acao', async () => {
    assert.ok(await criar(AMANDA, { titulo: 'Enviar cotação de dietas', clienteId: String(CLIENTE.HOSPITAL), prioridade: 'ALTA', prazo: '2026-11-05' }) > 0);
    const t = tarefaPorTitulo('Enviar cotação de dietas');
    cotacao = t.ID;
    assert.deepEqual([t.VENDEDOR_ID, t.STATUS, t.PRIORIDADE, t.DATA_LIMITE, t.CLIENTE_ID], [AMANDA, 'PENDENTE', 'ALTA', '2026-11-05', CLIENTE.HOSPITAL]);
    assert.ok(pertoDeAgora(t.CRIADO_EM), `CRIADO_EM do servidor: ${t.CRIADO_EM}`);
    const l = logs(cotacao);
    assert.deepEqual(l.map((x) => [x.CAMPO_ALTERADO, x.ID_USUARIO]), [['CRIACAO', AMANDA]]);
    assert.equal(await contador(AMANDA), 4);
    assert.equal(fila(cotacao).length, 1, 'a fila recebe o id da criada (D-003)');
    assert.equal(fila(cotacao)[0].PROCESSADO_EM, null);
  });

  await teste('RN-004 / RN-012: prioridade padrao Media; fila so com prazo', async () => {
    assert.ok(await criar(AMANDA, { titulo: 'Atividade sem prioridade', prazo: '2026-11-10' }) > 0);
    const t = tarefaPorTitulo('Atividade sem prioridade');
    assert.equal(t.PRIORIDADE, 'MEDIA');
    assert.equal(fila(t.ID).length, 1);
    // Atividade antiga sem prazo: trocar o status nao vai para o Google.
    const semPrazo = tarefaPorTitulo('Atividade antiga sem prazo');
    assert.ok(await status(BIA, semPrazo.ID, 'EM_ANDAMENTO') > 0);
    assert.equal(fila(semPrazo.ID).length, 0);
    assert.equal(await excluir(AMANDA, t.ID) > 0, true);
  });

  await teste('C-003 / RN-008: cliente fora da carteira recusado; vazio remove o vinculo', async () => {
    const t = tarefaPorTitulo('Retornar orçamento');
    assert.equal(await editar(AMANDA, t.ID, { clienteId: String(CLIENTE.FORA) }), 0);
    assert.equal(tarefa(t.ID).CLIENTE_ID, CLIENTE.BOA_VIDA);
    assert.equal(logs(t.ID).length, 0);
    assert.ok(await editar(AMANDA, t.ID, { clienteId: '' }) > 0);
    assert.equal(tarefa(t.ID).CLIENTE_ID, null);
    assert.deepEqual(logs(t.ID).map((x) => [x.CAMPO_ALTERADO, x.VALOR_ANTERIOR, x.VALOR_NOVO]), [['CLIENTE_ID', 'CLÍNICA BOA VIDA · 4002', null]]);
    assert.ok(await editar(AMANDA, t.ID, { clienteId: String(CLIENTE.BOA_VIDA) }) > 0, 'volta o cliente para os proximos testes');
  });

  await teste('C-007 / RN-009: uma linha de log por campo mudado, hora do servidor; sem mudanca = 0', async () => {
    const t = tarefaPorTitulo('Retornar orçamento');
    const antes = logs(t.ID).length;
    assert.ok(await editar(AMANDA, t.ID, { prazo: '2026-11-08' }) > 0);
    const novas = logs(t.ID).slice(antes);
    assert.deepEqual(novas.map((x) => [x.CAMPO_ALTERADO, x.VALOR_ANTERIOR, x.VALOR_NOVO, x.ID_USUARIO]), [['DATA_LIMITE', '2026-11-05', '2026-11-08', AMANDA]]);
    assert.ok(pertoDeAgora(novas[0].DATA_ALTERACAO), `hora do servidor: ${novas[0].DATA_ALTERACAO}`);
    assert.equal(tarefa(t.ID).DATA_LIMITE, '2026-11-08');

    assert.ok(await editar(AMANDA, t.ID, { descricao: 'Orçamento revisado.' }) > 0);
    assert.deepEqual(logs(t.ID).slice(antes + 1).map((x) => x.CAMPO_ALTERADO), ['DESCRICAO']);

    assert.equal(await editar(AMANDA, t.ID, {}), 0, 'mesmos valores');
    assert.equal(logs(t.ID).length, antes + 2);
    assert.equal(fila(t.ID).length, 1, 'edicao com prazo vai para o Google');
  });

  await teste('RNF-002: falha ao gravar o log nao muda a atividade', async () => {
    const t = tarefaPorTitulo('Retornar orçamento');
    db.exec('ALTER TABLE ATIVIDADES_LOG RENAME TO ATIVIDADES_LOG_FORA');
    try {
      await assert.rejects(editar(AMANDA, t.ID, { prazo: '2026-11-20' }));
    } finally {
      db.exec('ALTER TABLE ATIVIDADES_LOG_FORA RENAME TO ATIVIDADES_LOG');
    }
    assert.equal(tarefa(t.ID).DATA_LIMITE, '2026-11-08');
  });

  await teste('C-006 / RN-003 / RN-014: concluir grava a conclusao, log, contador, fila e historico', async () => {
    const historico = async () => (await linhas('s360HistoricoLinhaTempo', {
      ...ESCOPO, clienteId: String(CLIENTE.HOSPITAL), ramo: '', tipo: 'ATIVIDADE', de: '', ate: '', pagina: '1',
    }, AMANDA)).map((h) => h.REF_ID);
    assert.ok(!(await historico()).includes(cotacao), 'aberta nao aparece no historico');
    db.exec(`UPDATE GOOGLE_AGENDA_FILA SET PROCESSADO_EM = '2026-10-30 09:00:00', TENTATIVAS = 2 WHERE ENTIDADE_ID = ${cotacao}`);
    const antes = await contador(AMANDA);

    assert.ok(await status(AMANDA, cotacao, 'CONCLUIDA') > 0);
    assert.ok(pertoDeAgora(tarefa(cotacao).CONCLUIDO_EM));
    assert.deepEqual(logs(cotacao).slice(-1).map((x) => [x.CAMPO_ALTERADO, x.VALOR_ANTERIOR, x.VALOR_NOVO]), [['STATUS', 'PENDENTE', 'CONCLUIDA']]);
    assert.equal(await contador(AMANDA), antes - 1);
    assert.deepEqual([fila(cotacao)[0].PROCESSADO_EM, fila(cotacao)[0].TENTATIVAS], [null, 0], 'fila volta a pendente');
    assert.ok((await historico()).includes(cotacao), 'concluida com cliente aparece no historico');

    assert.equal(await status(AMANDA, cotacao, 'CONCLUIDA'), 0, 'mesmo status = nada mudou');
    assert.equal(await status(AMANDA, cotacao, 'CANCELADA'), 0);
    assert.ok(await status(AMANDA, cotacao, 'EM_ANDAMENTO') > 0);
    assert.equal(tarefa(cotacao).CONCLUIDO_EM, null);
    assert.equal(await contador(AMANDA), antes);
  });

  await teste('C-009 / RN-002: coordenador ve a equipe so para leitura', async () => {
    const daAmanda = (await abertas(CAIO, { modo: 'TEAM' })).filter((t) => t.VENDEDOR_ID === AMANDA);
    assert.equal(daAmanda.length, (await abertas(AMANDA)).length);
    assert.ok(daAmanda.length > 0);
    assert.ok(daAmanda.every((t) => t.RESPONSAVEL === 'Amanda Reis' && t.SOMENTE_LEITURA === 1));
    assert.ok((await log(CAIO, cotacao, { modo: 'TEAM' })).length > 0, 'log visivel para o coordenador');
    assert.equal((await log(CAIO, cotacao)).length, 0, 'em Meu painel, so as proprias');
    assert.equal((await abertas(AMANDA, { modo: 'TEAM' })).length, 0, 'vendedora sem permissao de time');
    assert.ok((await abertas(AMANDA)).every((t) => t.SOMENTE_LEITURA === 0));
  });

  await teste('C-010 / RN-001: atividade de outro nunca e alterada, nem por GESTOR', async () => {
    const antes = tarefa(ATIVIDADE_BRENO);
    assert.equal(await status(AMANDA, ATIVIDADE_BRENO, 'CONCLUIDA'), 0);
    assert.equal(await editar(AMANDA, ATIVIDADE_BRENO, { titulo: 'Tomada' }), 0);
    assert.equal(await excluir(AMANDA, ATIVIDADE_BRENO), 0);
    db.exec(`INSERT INTO USUARIO_PAPEL (USER_ID, PAPEL, ATRIBUIDO_EM) VALUES (${CAIO}, 'GESTOR', '2026-10-30 08:00:00')`);
    assert.equal(await status(CAIO, ATIVIDADE_BRENO, 'CONCLUIDA'), 0);
    assert.equal(await editar(CAIO, ATIVIDADE_BRENO, { prazo: '2026-12-01' }), 0);
    assert.equal(await excluir(CAIO, ATIVIDADE_BRENO), 0);
    assert.deepEqual(tarefa(ATIVIDADE_BRENO), antes);
    assert.equal(logs(ATIVIDADE_BRENO).length, 0);
    assert.equal(fila(ATIVIDADE_BRENO).length, 0);
  });

  await teste('C-008 / RN-010: excluir apaga atividade e log, recalcula o contador e avisa o Google', async () => {
    const t = tarefaPorTitulo('Ligar para compras');
    assert.ok(await status(AMANDA, t.ID, 'EM_ANDAMENTO') > 0, 'gera log (a FK nao tem cascata)');
    const antes = await contador(AMANDA);
    assert.ok(await excluir(AMANDA, t.ID) > 0);
    assert.equal(tarefa(t.ID), undefined);
    assert.equal(logs(t.ID).length, 0);
    assert.equal(fila(t.ID).length, 1, 'o processador remove o evento (spec 003)');
    assert.equal(await contador(AMANDA), antes - 1);
    assert.equal(await excluir(AMANDA, t.ID), 0, 'segunda vez nao acha nada');
  });
}
