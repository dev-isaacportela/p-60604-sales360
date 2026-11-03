// Smoke da spec 002 — carteira, disponiveis, historico, titulares.
// Rodado por ../smoke.mjs num banco descartavel so deste arquivo. A ordem
// importa: leituras primeiro, depois os testes que gravam.

import { HOJE, CLIENTE } from '../seeds/002-carteira.mjs';
import {
  temperatura, scoreRanking, curvaAuto, visitaPendente, classeTemperatura, indicadoresCarteira,
  temQueda, relevancia, palavrasBusca, camposBusca,
} from '../../lib/002-regras.mjs';
import { vendaDoVendedor, dia } from '../../lib/002-carteira.mjs';

export default async function ({ teste, chamar, linhas, banco, db, ID, toSqlite, assert }) {
  const { ANA, BRUNO, DIEGO } = ID;
  const CARLOS = banco("SELECT ID FROM INT_USER WHERE DESCR = 'carlos.teixeira@benenutri.local'")[0].ID;
  const AGORA = '2026-10-30T10:00:00';
  const ESCOPO = { modo: 'ME', coordenador: '', vendedor: '', filial: '', depto: '', secao: '', hoje: HOJE };

  const carteira = (userId, input = {}) => chamar('s360CarteiraCarregar', { ...ESCOPO, ...input }, userId);
  const todos = async (userId, input = {}) => {
    const saida = [];
    for (let pagina = 1; ; pagina += 1) {
      const r = await carteira(userId, { ...input, porPagina: 50, pagina });
      saida.push(...r.linhas);
      if (saida.length >= r.total || !r.linhas.length) return saida;
    }
  };
  const doCliente = async (userId, id, input = {}) => (await todos(userId, input)).find((l) => l.ID === id);
  const disponiveis = (userId, input = {}) => chamar('s360DisponiveisListar', { busca: '', pagina: 1, ...input }, userId);
  const afetadas = async (nome, input, userId) => (await chamar(nome, input, userId)).affectedRows;
  const recalcular = async (clienteId = '') => {
    await chamar('s360TitularesLimpar', { clienteId }, ANA);
    await chamar('s360TitularesInserir', { clienteId, agora: AGORA }, ANA);
  };
  const titulares = (userId, input = {}) =>
    linhas('s360TitularesListar', { situacao: '', filial: '', depto: '', busca: '', desde: '2025-10-30', pagina: '1', ...input }, userId);
  const definir = async (userId, input) => {
    const p = { codFilial: '1', codepto: '1', idSecao: '', agora: AGORA, ...input };
    return (await afetadas('s360TitularDefinirAtualizar', p, userId)) + (await afetadas('s360TitularDefinirInserir', p, userId));
  };
  const motivo = async (userId, input) => (await linhas('s360DisponivelMotivo', input, userId))[0]?.MOTIVO;
  const exec = (sql) => db.exec(sql);

  /* ─────────────── escopo e indicadores ─────────────── */

  await teste('RNT-003 (servidor): modo sem permissao nao devolve dado', async () => {
    assert.equal((await carteira(ANA, { modo: 'TEAM' })).total, 0);
    assert.equal((await carteira(ANA, { modo: 'ALL' })).total, 0);
    const time = await todos(CARLOS, { modo: 'TEAM' });
    assert.equal(time.length, 75, 'Carlos ve Ana (40) e Bruno (35)');
    const vendedorAna = await carteira(CARLOS, { modo: 'SELLER', vendedor: String(ANA) });
    assert.equal(vendedorAna.total, 40);
  });

  await teste('C-001 / RN-010: indicadores da carteira de Ana', async () => {
    const r = await carteira(ANA);
    assert.equal(r.total, 40, 'Pessoa Fisica fica fora (RN-001)');
    assert.deepEqual(
      { total: r.indicadores.total, ativos: r.indicadores.ativos, receita: r.indicadores.receita, ticket: r.indicadores.ticket },
      { total: 40, ativos: 32, receita: 120000, ticket: 3750 },
    );
    assert.equal(r.linhas.length, 10, '10 por pagina');
  });

  await teste('RF-017: soma das barras por ramo = total da carteira filtrada', async () => {
    const r = await carteira(ANA, { status: 'ATIVO' });
    assert.equal(r.ramos.reduce((s, x) => s + x.n, 0), r.total);
    assert.equal(r.total, 32);
  });

  await teste('C-002 / RN-006: visita pendente por curva', async () => {
    const r = await carteira(ANA, { pendentes: 1, porPagina: 50 });
    const ids = r.linhas.map((l) => l.ID);
    assert.ok(ids.includes(CLIENTE.X) && ids.includes(CLIENTE.Z));
    assert.ok(!ids.includes(CLIENTE.Y));
    assert.equal(r.linhas.find((l) => l.ID === CLIENTE.X).LIMITE_CURVA, 8);
    assert.equal(r.indicadores.pendentes, r.total);
    assert.equal(visitaPendente('D', 61), false);
    assert.equal(visitaPendente('D', 62), true);
    exec(`INSERT INTO VISITAS (CLIENTE_ID, VENDEDOR_ID, DATA_AGENDADA, STATUS) VALUES (${CLIENTE.X}, ${BRUNO}, '2026-10-29', 'CONCLUIDA')`);
    const x = await doCliente(ANA, CLIENTE.X);
    assert.equal(x.DIAS_SEM_VISITA, 9, 'visita de outro vendedor nao conta');
    assert.equal(x.PENDENTE, true);
  });

  await teste('C-003 / RN-007: temperatura de W = 92 Quente', async () => {
    const w = await doCliente(ANA, CLIENTE.W);
    const t = w.TEMPERATURA;
    assert.deepEqual([t.recencia, t.frequencia, t.tendencia, t.visitas, t.total, t.classe], [30, 25, 25, 12, 92, 'Quente']);
    assert.equal(t.ciclo, 20);
  });

  await teste('C-004 / RN-007: cliente sem historico e Frio (0)', async () => {
    const v = await doCliente(ANA, CLIENTE.V);
    assert.deepEqual([v.TEMPERATURA.tendencia, v.TEMPERATURA.total, v.TEMPERATURA.classe], [0, 0, 'Frio']);
    assert.equal(v.DIAS_SEM_VISITA, null);
    assert.equal(v.DIAS_ULTIMA_COMPRA, null);
  });

  await teste('RN-007 (bordas): tendencia e visita nao concluida', async () => {
    const tend = (atual60, anterior60) => temperatura({ atual60, anterior60 }).tendencia;
    assert.equal(tend(11000, 10000), 15, '+10% exatos');
    assert.equal(tend(11001, 10000), 25, '+10,01%');
    assert.equal(tend(7000, 10000), 5, '-30% exatos');
    assert.equal(tend(6999, 10000), 0, '-30,01%');
    assert.equal(tend(500, 0), 25, 'sem base anterior e com compra recente');
    assert.equal(tend(0, 0), 0, 'sem compra nos dois periodos');
    assert.equal((await doCliente(ANA, CLIENTE.Z)).DIAS_SEM_VISITA, null, 'visita AGENDADA ha 3 dias nao conta');
  });

  await teste('C-005 / RN-004 / RN-005: score, curva automatica e curva fixada', async () => {
    const k = await doCliente(ANA, CLIENTE.K);
    assert.equal(k.SCORE, 76);
    assert.equal(k.CURVA, 'B');
    assert.equal(scoreRanking({ compras90: 30000, visitas60: 5, diasCompra: 5, diasVisita: 5 }), 100);
    assert.equal(curvaAuto(100), 'A');
    assert.equal(scoreRanking({}), 4);
    assert.equal(curvaAuto(4), 'C');
    assert.equal(await afetadas('s360CarteiraCurvaFixar', { clienteId: String(CLIENTE.K), curva: 'D' }, ANA), 1);
    const kAna = await doCliente(ANA, CLIENTE.K);
    assert.deepEqual([kAna.CURVA, kAna.LIMITE_CURVA], ['D', 61]);
    assert.equal((await doCliente(CARLOS, CLIENTE.K, { modo: 'TEAM' })).CURVA, 'D', 'vale tambem no Time inteiro');
    assert.equal(await afetadas('s360CarteiraCurvaFixar', { clienteId: String(CLIENTE.K), curva: 'E' }, ANA), 0);
    assert.equal(await afetadas('s360CarteiraCurvaFixar', { clienteId: String(CLIENTE.K), curva: 'D' }, BRUNO), 0, 'so o dono fixa');
    await chamar('s360CarteiraCurvaFixar', { clienteId: String(CLIENTE.K), curva: '' }, ANA);
    assert.equal((await doCliente(ANA, CLIENTE.K)).CURVA, 'B', 'vazio volta a automatica');
  });

  await teste('RN-008: classificacao e score da carteira', async () => {
    assert.deepEqual([70, 69, 40, 39].map(classeTemperatura), ['Quente', 'Morno', 'Morno', 'Frio']);
    const linha = (total) => ({ STATUS: 'ATIVO', RECEITA_MES: 0, PENDENTE: false, TEMPERATURA: { total } });
    const ind = indicadoresCarteira([linha(92), linha(36)]);
    assert.deepEqual([ind.score, ind.classe], [64, 'Morno']);
  });

  await teste('C-006 / RN-013: ordenacao vale para a carteira inteira', async () => {
    const nomes = (await todos(ANA)).map((l) => l.NOME).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const r = await carteira(ANA, { ordem: 'NOME_AZ', pagina: 1 });
    assert.deepEqual(r.linhas.map((l) => l.NOME), nomes.slice(0, 10));
    const z = await carteira(ANA, { ordem: 'NOME_ZA', pagina: 1 });
    assert.equal(z.linhas[0].NOME, nomes[nomes.length - 1]);
  });

  await teste('C-007 / RN-018: busca inteligente', async () => {
    for (const busca of ['hospitl sao lucas', '12345678000190', 'cod 2471', '12.345.678/0001-90']) {
      const r = await carteira(ANA, { busca });
      assert.equal(r.linhas[0]?.ID, CLIENTE.HOSPITAL, busca);
    }
    const campos = camposBusca({ RAZAO_SOCIAL: 'HOSPITAL SÃO LUCAS LTDA' });
    assert.notEqual(relevancia(palavrasBusca('lukas'), campos), null, '1 letra trocada');
    assert.equal(relevancia(palavrasBusca('hsp'), campos), null, 'menos de 4 letras exige trecho exato');
    assert.equal((await carteira(ANA, { busca: 'hsp' })).total, 0);
  });

  await teste('RN-012: selo Queda (30% fixo) e sino de alertas', async () => {
    assert.equal(temQueda(6900, 10000), true);
    assert.equal(temQueda(7000, 10000), true, '30,0%');
    assert.equal(temQueda(7100, 10000), false);
    assert.equal(temQueda(5000, 0), false, 'sem compra no periodo anterior');
    assert.equal(temQueda(7500, 10000), false, '25,0%: o limite antigo por vendedor nao e lido');
    exec(`INSERT INTO IMP_VENDAS_DASHBOARD_TOTVS_RCA (NUMPED, DTSAIDA, CODFILIAL, CODCLI, CODEPTO, CODSEC, TOTAL) VALUES
      ('Q-1', '2026-09-10', '1', ${CLIENTE.V}, '1', '101', 10000), ('Q-2', '2026-10-10', '1', ${CLIENTE.V}, '1', '101', 6900)`);
    assert.equal((await doCliente(ANA, CLIENTE.V)).QUEDA, true);
    const comAlerta = Array.from({ length: 25 }, (_, i) => 2101 + i);
    const valores = comAlerta.flatMap((id) => Array.from({ length: 10 }, (_, n) => `(${ANA}, 1, ${id}, 'NAO_EXPLORADO', 'Alerta ${n}', 0)`));
    exec(`INSERT INTO ALERTAS_INTELIGENTES (ID_VENDEDOR, CODFILIAL, ID_CLIENTE, TIPO_ALERTA, TITULO, LIDO) VALUES ${valores.join(', ')}`);
    const lista = await todos(ANA);
    assert.deepEqual(lista.filter((l) => l.ALERTA).map((l) => l.ID).sort(), comAlerta);
  });

  /* ─────────────── historico e ficha ─────────────── */

  await teste('C-015 / RN-017: linha do tempo e pedidos de X', async () => {
    const tl = await linhas('s360HistoricoLinhaTempo', { ...ESCOPO, clienteId: String(CLIENTE.X), ramo: '', tipo: '', de: '', ate: '', pagina: '1' }, ANA);
    assert.equal(Number(tl[0].TOTAL), 7);
    const porTipo = tl.reduce((acc, l) => ({ ...acc, [l.TIPO]: (acc[l.TIPO] || 0) + 1 }), {});
    assert.deepEqual(porTipo, { VISITA: 3, ATIVIDADE: 2, RELATO: 1, MIX: 1 });
    assert.ok(tl.every((l, i) => !i || tl[i - 1].DATA >= l.DATA), 'mais recente primeiro');
    assert.deepEqual(tl.filter((l) => l.TIPO === 'MIX').map((l) => l.REF_ID), [2001], 'mix so salvo fica fora');
    const pedidos = (pagina) => linhas('s360HistoricoPedidos', { ...ESCOPO, clienteId: String(CLIENTE.X), ramo: '', de: '', ate: '', pagina }, ANA);
    const p1 = await pedidos('1');
    assert.equal(Number(p1[0].TOTAL), 30, 'os 4 da filial 2 nao entram');
    assert.equal(p1.length, 20);
    assert.equal((await pedidos('2')).length, 10);
    const itens = await linhas('s360HistoricoPedidoItens', { ...ESCOPO, clienteId: String(CLIENTE.X), numped: p1[0].NUMPED }, ANA);
    assert.equal(itens.length, 2);
    assert.equal(Number(itens[0].DESCONTO_PERC), 0);
    assert.equal((await linhas('s360HistoricoMixItens', { ...ESCOPO, mixId: '2001' }, ANA)).length, 2);
    assert.equal((await linhas('s360HistoricoMixItens', { ...ESCOPO, mixId: '2002' }, ANA)).length, 0);
    const semana = await linhas('s360HistoricoVisitasSemana', { desde: '2026-10-24', hoje: HOJE }, ANA);
    assert.ok(semana.every((v) => Number(v.RELATO_OK) === 1));
  });

  await teste('RN-017 (filtros): periodo vale para todos os registros', async () => {
    const valores = [
      ...Array.from({ length: 25 }, (_, i) => `('F-OUT-${i}', '2026-10-${String(i + 1).padStart(2, '0')}', '1', ${CLIENTE.Y}, '1', '101', 100)`),
      ...Array.from({ length: 20 }, (_, i) => `('F-SET-${i}', '2026-09-${String(i + 1).padStart(2, '0')}', '1', ${CLIENTE.Y}, '1', '101', 100)`),
    ];
    exec(`INSERT INTO IMP_VENDAS_DASHBOARD_TOTVS_RCA (NUMPED, DTSAIDA, CODFILIAL, CODCLI, CODEPTO, CODSEC, TOTAL) VALUES ${valores.join(', ')}`);
    const pedidos = (pagina, de = '', ate = '') =>
      linhas('s360HistoricoPedidos', { ...ESCOPO, clienteId: String(CLIENTE.Y), ramo: '', de, ate, pagina }, ANA);
    assert.equal(Number((await pedidos('1'))[0].TOTAL), 45, 'sem filtro: 3 paginas');
    assert.equal((await pedidos('3')).length, 5);
    const outubro = await pedidos('1', '2026-10-01', '2026-10-31');
    assert.equal(Number(outubro[0].TOTAL), 25);
    assert.equal(outubro.length, 20);
    assert.equal((await pedidos('2', '2026-10-01', '2026-10-31')).length, 5);
    const ramo = await linhas('s360HistoricoLinhaTempo', { ...ESCOPO, clienteId: '', ramo: 'CLINICA', tipo: '', de: '', ate: '', pagina: '1' }, ANA);
    assert.ok(ramo.length && ramo.every((l) => l.CLIENTE_ID === CLIENTE.W || l.CLIENTE_ID > 2100), 'filtro de ramo na carteira toda');
  });

  await teste('RN-014: ficha so leitura vinda do cadastro', async () => {
    const ficha = (userId, input = {}) => linhas('s360ClienteFicha', { ...ESCOPO, clienteId: String(CLIENTE.X), ...input }, userId);
    const [f] = await ficha(ANA);
    for (const campo of ['RAZAO_SOCIAL', 'NOME_FANTASIA', 'CNPJ', 'SEGMENTO', 'CIDADE', 'UF', 'TELEFONE', 'EMAIL', 'ENDERECO']) assert.ok(campo in f, campo);
    assert.equal((await ficha(BRUNO, { hoje: '2026-11-05' })).length, 1, 'substituto em ferias ativas');
    assert.equal((await ficha(CARLOS, { modo: 'TEAM' })).length, 1, 'coordenador');
    exec(`UPDATE CLIENTES SET TELEFONE = '(81) 3333-0000' WHERE ID = ${CLIENTE.X}`);
    assert.equal((await ficha(ANA))[0].TELEFONE, '(81) 3333-0000');
    assert.equal((await ficha(ANA, { clienteId: String(CLIENTE.FORA) })).length, 0);
  });

  await teste('C-012 / RN-001: substituto de ferias ve a carteira do titular', async () => {
    const em05 = await todos(BRUNO, { hoje: '2026-11-05' });
    assert.equal(em05.length, 75);
    assert.equal(em05.filter((l) => l.COBERTURA).length, 40);
    assert.ok(em05.filter((l) => l.COBERTURA).every((l) => !l.PODE_REMOVER));
    assert.equal((await carteira(BRUNO, { hoje: '2026-11-16' })).total, 35);
    exec("UPDATE FERIAS_VENDEDOR SET ATIVO = 0 WHERE DT_INICIO = '2026-11-01'");
    assert.equal((await carteira(BRUNO, { hoje: '2026-11-05' })).total, 35, 'sem ferias cadastradas nao ha cobertura');
    exec("UPDATE FERIAS_VENDEDOR SET ATIVO = 1 WHERE DT_INICIO = '2026-11-01'");
  });

  /* ─────────────── disponiveis ─────────────── */

  const q = { clienteId: String(CLIENTE.Q), codFilial: '1', codepto: '1', idSecao: '101' };

  await teste('C-008 / RN-019: disponiveis por escopo e adicionar', async () => {
    const antes = await disponiveis(ANA, { busca: 'comercial qualidade' });
    const linhasQ = antes.linhas.filter((l) => l.ID === CLIENTE.Q);
    assert.deepEqual(linhasQ.map((l) => l.ID_SECAO ?? null).sort(), [101, 102, null].sort());
    assert.ok(linhasQ.every((l) => l.ESCOPO.includes('Nutrição')));
    assert.ok(linhasQ.every((l) => !('CURVA' in l)), 'disponiveis nao mostram curva');
    assert.ok((await disponiveis(ANA)).total > 0, 'sem busca lista tudo, paginado');
    assert.equal(await afetadas('s360DisponivelAdicionar', { ...q, agora: AGORA }, ANA), 1);
    await recalcular(String(CLIENTE.Q));
    assert.equal((await carteira(ANA)).total, 41);
    const depois = (await disponiveis(ANA, { busca: 'comercial qualidade' })).linhas.filter((l) => l.ID === CLIENTE.Q);
    assert.deepEqual(depois.map((l) => l.ID_SECAO), [102]);
  });

  await teste('C-009: cliente ja tem responsavel no escopo', async () => {
    assert.equal(await afetadas('s360DisponivelAdicionar', { ...q, agora: AGORA }, BRUNO), 0);
    assert.equal(await motivo(BRUNO, q), 'JA_TEM_RESPONSAVEL');
    assert.equal(banco(`SELECT COUNT(*) AS N FROM EQUIPE_CLIENTE WHERE ID_CLIENTE = ${CLIENTE.Q} AND ID_SECAO = 101`)[0].N, 1);
    assert.equal(await afetadas('s360DisponivelAdicionar', { ...q, agora: AGORA }, ANA), 0);
    assert.equal(await motivo(ANA, q), 'JA_NA_CARTEIRA');
  });

  await teste('C-010: vendedor sem escopo ativo', async () => {
    const r = await disponiveis(DIEGO);
    assert.equal(r.semEscopo, true);
    assert.equal(r.linhas.length, 0);
    assert.equal(await motivo(DIEGO, q), 'SEM_ESCOPO');
  });

  await teste('RN-019 (PF): Pessoa Fisica nunca e listada nem adicionada', async () => {
    const r = await disponiveis(ANA, { busca: 'joao da silva' });
    assert.ok(!r.linhas.some((l) => l.ID === CLIENTE.PF_LIVRE));
    const pf = { ...q, clienteId: String(CLIENTE.PF_LIVRE) };
    assert.equal(await afetadas('s360DisponivelAdicionar', { ...pf, agora: AGORA }, ANA), 0);
    assert.equal(await motivo(ANA, pf), 'NAO_ENCONTRADO');
  });

  /* ─────────────── relato e prospect ─────────────── */

  await teste('C-016 / RN-016: relato avulso so para cliente da carteira', async () => {
    const relato = (userId, input = {}) => afetadas('s360RelatoRegistrar', {
      clienteId: String(CLIENTE.X), data: HOJE, hora: '15:30', tipo: 'Ligação', relato: 'Ligou pedindo prazo.', hoje: HOJE, agora: AGORA, ...input,
    }, userId);
    assert.equal(await relato(ANA, { clienteId: String(CLIENTE.FORA) }), 0, 'fora da carteira');
    assert.equal(await relato(ANA, { data: '2026-10-31' }), 0, 'data futura');
    assert.equal(await relato(ANA, { relato: 'x'.repeat(4001) }), 0, '4.001 caracteres');
    assert.equal(await relato(ANA, { tipo: 'Telegrama' }), 0, 'tipo fora da lista');
    assert.equal(await relato(ANA, { relato: 'x'.repeat(4000) }), 1);
    assert.equal(await relato(BRUNO, { hoje: '2026-11-05', data: '2026-11-05' }), 1, 'substituto em cliente do titular coberto');
    assert.equal(banco(`SELECT VENDEDOR_ID FROM RELATOS_CLIENTE ORDER BY ID DESC LIMIT 1`)[0].VENDEDOR_ID, BRUNO);
  });

  await teste('C-017 / RN-021: novo cliente prospecto', async () => {
    const base = { razaoSocial: 'PADARIA NOVA ERA LTDA', nomeFantasia: '', cnpj: '', segmento: '', porte: '', origem: '', cidade: '', uf: 'df',
      potencial: '', probabilidade: '', observacoes: '', agora: AGORA, responsavelId: String(BRUNO) };
    assert.equal(await afetadas('s360ProspectCriar', { ...base, razaoSocial: '  ' }, ANA), 0);
    assert.equal(await afetadas('s360ProspectCriar', { ...base, uf: 'DFX' }, ANA), 0);
    assert.equal(await afetadas('s360ProspectCriar', base, ANA), 1);
    const [p] = banco("SELECT * FROM PROSPECTS WHERE RAZAO_SOCIAL = 'PADARIA NOVA ERA LTDA'");
    assert.deepEqual([p.PROBABILIDADE, p.RESPONSAVEL_ID, p.UF, p.STATUS_PIPELINE], [10, ANA, 'DF', 'NOVO']);
    assert.equal(await afetadas('s360ProspectContatoCriar', { razaoSocial: base.razaoSocial, agora: AGORA, contato: 'Marta', cargo: 'Compras', telefone: '', email: '' }, ANA), 1);
    assert.equal(banco(`SELECT COUNT(*) AS N FROM PROSPECT_CONTATOS WHERE PROSPECT_ID = ${p.ID}`)[0].N, 1);
    assert.equal((await carteira(ANA, { busca: 'padaria nova era' })).total, 0, 'prospect nao entra na carteira');
  });

  /* ─────────────── titulares ─────────────── */

  await teste('C-013 / RN-002: titular definido pelo coordenador', async () => {
    exec(`INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, CODFILIAL, ID_SECAO) VALUES (${CLIENTE.H}, ${BRUNO}, '1', 101)`);
    await recalcular(String(CLIENTE.H));
    const secao101 = { secao: '101' };
    assert.ok(await doCliente(ANA, CLIENTE.H, secao101));
    assert.ok(await doCliente(BRUNO, CLIENTE.H, secao101), 'pendente: os dois veem');
    const [h] = (await titulares(CARLOS, { situacao: 'PENDENTE' })).filter((l) => l.ID_CLIENTE === CLIENTE.H);
    assert.equal(h.SECAO, 'Todas as seções (2)');
    exec(`INSERT INTO IMP_VENDAS_DASHBOARD_TOTVS_RCA (NUMPED, DTSAIDA, CODFILIAL, CODCLI, CODEPTO, CODSEC, TOTAL) VALUES ('H-1', '2026-10-20', '1', ${CLIENTE.H}, '1', '101', 1000)`);
    const receitaAna = (await carteira(ANA)).indicadores.receita;
    const receitaBruno = (await carteira(BRUNO)).indicadores.receita;
    assert.equal(await definir(CARLOS, { clienteId: String(CLIENTE.H), vendedorId: String(ANA) }), 2);
    assert.equal(await doCliente(BRUNO, CLIENTE.H, secao101), undefined, 'Bruno deixa de ver H na secao titulada');
    assert.equal((await carteira(ANA)).indicadores.receita, receitaAna, 'a venda ja contava para Ana');
    assert.equal((await carteira(BRUNO)).indicadores.receita, receitaBruno - 1000, 'e deixa de contar para Bruno');
    const soma = (vendedor) => db.prepare(toSqlite(`SELECT COALESCE(SUM(S.TOTAL), 0) AS V FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA S
      WHERE S.NUMPED = 'H-1' AND ${vendaDoVendedor('S', vendedor, dia('S.DTSAIDA'))}`)).get().V;
    assert.deepEqual([soma(ANA), soma(BRUNO)], [1000, 0]);
    const [manual] = (await titulares(CARLOS, { situacao: 'MANUAL' })).filter((l) => l.ID_CLIENTE === CLIENTE.H);
    assert.equal(manual.TITULAR, 'Ana Souza');
  });

  await teste('C-014 / RN-003: titular automatico e recalculo', async () => {
    await recalcular(String(CLIENTE.J));
    const [j] = (await titulares(CARLOS, { situacao: 'AUTO' })).filter((l) => l.ID_CLIENTE === CLIENTE.J);
    assert.equal(Number(j.TITULAR_ID), ANA);
    const manuaisAntes = banco("SELECT COUNT(*) AS N FROM CLIENTE_TITULAR_DEPTO WHERE ORIGEM = 'MANUAL'")[0].N;
    exec(`INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, CODFILIAL, ID_SECAO) VALUES (${CLIENTE.J}, ${BRUNO}, '1', 101)`);
    await recalcular();
    assert.equal(banco(`SELECT COUNT(*) AS N FROM CLIENTE_TITULAR_DEPTO WHERE ID_CLIENTE = ${CLIENTE.J} AND ID_SECAO = 101`)[0].N, 0);
    assert.ok((await titulares(CARLOS, { situacao: 'PENDENTE' })).some((l) => l.ID_CLIENTE === CLIENTE.J));
    assert.equal(banco("SELECT COUNT(*) AS N FROM CLIENTE_TITULAR_DEPTO WHERE ORIGEM = 'MANUAL'")[0].N, manuaisAntes, 'manual valido nao muda');
    const [totais] = await linhas('s360TitularesTotais', { filial: '', depto: '', busca: '' }, CARLOS);
    assert.ok(Number(totais.PENDENTES) >= 1 && Number(totais.COM_TITULAR) >= 1);
  });

  await teste('RN-002 (bloqueio): titular bloqueado nao tira o cliente de ninguem', async () => {
    exec(`INSERT INTO USUARIO_BLOQUEIO (USER_ID, BLOQUEADO) VALUES (${ANA}, 1)`);
    assert.ok(await doCliente(BRUNO, CLIENTE.H, { secao: '101' }), 'H volta para Bruno');
    const [h] = (await titulares(CARLOS)).filter((l) => l.ID_CLIENTE === CLIENTE.H);
    assert.ok(!String(h.CANDIDATOS).includes(`${ANA}:`), 'bloqueado nao e candidato');
    exec(`DELETE FROM USUARIO_BLOQUEIO WHERE USER_ID = ${ANA}`);
  });

  await teste('RN-020: agrupamento por secao e gestao so nas BUs do coordenador', async () => {
    exec(`INSERT INTO SECAO (ID, NOME_SECAO, ID_BU, ATIVO) VALUES (2901, 'Curativos especiais', 2, 1), (2902, 'Sondas', 2, 1)`);
    exec(`INSERT INTO BU_VENDEDOR (BU_CODIGO, VENDEDOR_ID, ATIVO, CODFILIAL, ID_SECAO) VALUES
      ('2', ${ANA}, 1, '1', 2901), ('2', ${ANA}, 1, '1', 2902), ('2', ${BRUNO}, 1, '1', 2901), ('2', ${BRUNO}, 1, '1', 2902),
      ('1', ${ANA}, 1, '2', 101)`);
    exec('INSERT INTO COORDENADORES_BU (COD_SUPERVISOR, CODFILIAL, CODEPTO) VALUES (2001, 1, 2)');
    const enf = (await titulares(CARLOS, { depto: '2' })).filter((l) => l.ID_CLIENTE === CLIENTE.H);
    assert.deepEqual(enf.map((l) => Number(l.ID_SECAO)).sort(), [2901, 2902], 'Enfermagem: uma linha por secao');
    assert.equal(await definir(CARLOS, { clienteId: String(CLIENTE.H), codepto: '2', vendedorId: String(BRUNO) }), 0, 'Enfermagem exige secao');
    assert.equal(await definir(CARLOS, { clienteId: String(CLIENTE.H), codepto: '2', idSecao: '2901', vendedorId: String(BRUNO) }), 1);
    assert.equal(await definir(CARLOS, { clienteId: String(CLIENTE.H), codFilial: '2', vendedorId: String(ANA) }), 0, 'F2 fora das BUs de Carlos');
    assert.equal(await definir(CARLOS, { clienteId: String(CLIENTE.H), vendedorId: String(DIEGO) }), 0, 'so candidato valido');
    const filtros = await linhas('s360TitularesFiltros', {}, CARLOS);
    assert.deepEqual(filtros.map((f) => `${f.CODFILIAL}/${f.CODEPTO}`), ['1/1', '1/2']);
    assert.equal((await linhas('s360TitularesFiltros', {}, ANA)).length, 0, 'vendedora nao gere titulares');
  });

  /* ─────────────── remocao ─────────────── */

  await teste('C-011 / RN-015: remover so o proprio vinculo', async () => {
    exec(`INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, CODFILIAL, ID_SECAO) VALUES (${CLIENTE.X}, ${BRUNO}, '1', 801)`);
    assert.equal(await afetadas('s360CarteiraRemover', { clienteId: String(CLIENTE.X) }, ANA), 1);
    const vinculos = (vendedor) => banco(`SELECT COUNT(*) AS N FROM EQUIPE_CLIENTE WHERE ID_CLIENTE = ${CLIENTE.X} AND ID_VENDEDOR = ${vendedor}`)[0].N;
    assert.deepEqual([vinculos(ANA), vinculos(BRUNO)], [0, 1]);
    assert.equal(await afetadas('s360CarteiraRemover', { clienteId: String(CLIENTE.Y) }, BRUNO), 0, 'substituto nao remove cliente do titular');
  });

  await teste('C-001 / RN-010: sem clientes ativos o ticket fica vazio', async () => {
    exec(`UPDATE CLIENTES SET STATUS = 'INATIVO'`);
    const ind = (await carteira(ANA)).indicadores;
    assert.deepEqual([ind.ativos, ind.ticket], [0, null]);
  });
}
