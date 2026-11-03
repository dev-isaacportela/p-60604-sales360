// Smoke da spec 005 (dashboard): tabela Testes de docs/specs/005-dashboard/plan.md.
// Cada teste monta os dados do cenario (datas da spec) sobre os usuarios da
// 005; o relogio do banco e fixado quando a regra usa o do servidor.

import { registerMysqlFunctions } from '../mysql-dialect.mjs';
import { EMAIL, BU } from '../seeds/005-dashboard.mjs';

export default async function smoke({ teste, chamar, linhas, banco, db, ID, assert }) {
  let relogio = new Date();
  registerMysqlFunctions(db, { now: () => relogio });
  const em = (quando) => { relogio = new Date(`${quando.replace(' ', 'T')}:00-03:00`); };

  const id = (email) => banco(`SELECT ID FROM INT_USER WHERE DESCR = '${email}'`)[0].ID;
  const DALVA = id(EMAIL.DALVA);
  const DAVI = id(EMAIL.DAVI);
  const DORA = id(EMAIL.DORA);
  const CAETANO = id(EMAIL.CAETANO);
  const GIL = ID.GIL; // diretoria
  const meus = [DALVA, DAVI, DORA, CAETANO].join(', ');

  const limparAgenda = () => db.exec(`DELETE FROM VISITAS WHERE VENDEDOR_ID IN (${meus});
    DELETE FROM PROSPECT_VISITAS WHERE EXECUTIVO_ID IN (${meus});
    DELETE FROM AGENDA_INTERNA_PARTICIPANTES WHERE AGENDA_ID IN (SELECT ID FROM AGENDA_INTERNA WHERE CRIADOR_ID IN (${meus}));
    DELETE FROM AGENDA_INTERNA WHERE CRIADOR_ID IN (${meus});`);
  const limparVendas = () => db.exec(`DELETE FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA WHERE CODEPTO = '${BU}';
    DELETE FROM IMP_DEVOLUCOES_TOTVS WHERE CODEPTO = '${BU}';`);
  limparAgenda();
  limparVendas();
  db.exec(`DELETE FROM ALERTAS_INTELIGENTES WHERE ID_VENDEDOR IN (${meus});`);

  const ins = (tabela, linha) => {
    const cols = Object.keys(linha);
    return Number(db.prepare(`INSERT INTO ${tabela} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...Object.values(linha)).lastInsertRowid);
  };
  let cliente = 5001;
  const visita = (vendedor, data, status, extra = {}) => ins('VISITAS', {
    CLIENTE_ID: extra.cliente ?? cliente, VENDEDOR_ID: vendedor, DATA_AGENDADA: data, HORA_INICIO: extra.inicio ?? '09:00', HORA_FIM: extra.fim ?? '10:00',
    TIPO: 'Aumento de mix', STATUS: status, CHECKOUT_HORA: extra.checkout ?? null,
  });
  const prospeccao = (vendedor, data, status) => ins('PROSPECT_VISITAS', {
    PROSPECT_ID: 5001, EXECUTIVO_ID: vendedor, DATA_VISITA: data, HORA_INICIO: '11:00', HORA_FIM: '12:00', OBJETIVO: 'Prospecção', STATUS: status, ATUALIZADO_EM: `${data} 12:05:00`,
  });
  const interno = (criador, data, tipo, status, participantes = []) => {
    const aid = ins('AGENDA_INTERNA', { TITULO: tipo, DATA_AGENDADA: data, HORA_INICIO: '07:00', HORA_FIM: '08:00', TIPO: tipo, STATUS: status, CRIADOR_ID: criador });
    for (const p of participantes) ins('AGENDA_INTERNA_PARTICIPANTES', { AGENDA_ID: aid, VENDEDOR_ID: p });
    return aid;
  };
  const venda = (cli, filial, data, total) => ins('IMP_VENDAS_DASHBOARD_TOTVS_RCA', { CODCLI: cli, CODFILIAL: filial, CODEPTO: BU, DTSAIDA: data, TOTAL: total });
  const devolucao = (cli, filial, data, valor) => ins('IMP_DEVOLUCOES_TOTVS', { CODCLI: cli, CODFILIAL: filial, CODEPTO: BU, DATA_DEVOLUCAO: data, VALOR_DEVOLVIDO: valor });
  const alerta = (vendedor, prioridade, geracao, extra = {}) => ins('ALERTAS_INTELIGENTES', {
    ID_VENDEDOR: vendedor, CODFILIAL: extra.filial ?? 3, ID_CLIENTE: 5001, TIPO_ALERTA: 'SEM_COMPRA', TITULO: `Alerta ${geracao}`,
    PRIORIDADE: prioridade, LIDO: extra.lido ?? 0, DATA_GERACAO: geracao, CODEPTO: BU,
  });

  const ESC = (modo = 'ME', extra = {}) => ({ modo, coordenador: '', vendedor: '', filial: '', depto: '', secao: '', hoje: '', ...extra });
  const listar = (user, de, ate, modo = 'ME') => linhas('s360AgendaListar', { ...ESC(modo), de, ate }, user);
  const resumo = async (user, segunda, modo = 'ME', extra = {}) => {
    const sexta = `${segunda.slice(0, 8)}${String(Number(segunda.slice(8)) + 4).padStart(2, '0')}`;
    const domingo = `${segunda.slice(0, 8)}${String(Number(segunda.slice(8)) + 6).padStart(2, '0')}`;
    return (await linhas('s360AgendaResumo', { ...ESC(modo, extra), segunda, sexta, domingo }, user))[0];
  };
  const mes = async (user, modo = 'ME', extra = {}, inicio = '2026-11-01', fim = '2026-11-30') =>
    (await linhas('s360DashboardMes', { ...ESC(modo, extra), inicio, fim }, user))[0];
  const salvar = async (user, perfil, valor, vigencia) =>
    (await chamar('s360MetaVisitasSalvar', { perfil, valor: String(valor), vigencia }, user)).affectedRows ?? 0;

  /* ─────────────── agenda (SFs da 003) ─────────────── */

  await teste('C-002 / RN-002: 3 visitas (1 cancelada) + 1 prospecção + 1 interna hoje → 4 compromissos', async () => {
    em('2026-11-20 08:30');
    visita(DALVA, '2026-11-20', 'AGENDADA', { inicio: '08:00', fim: '08:45' });
    visita(DALVA, '2026-11-20', 'CONCLUIDA', { inicio: '09:00', fim: '09:45' });
    visita(DALVA, '2026-11-20', 'CANCELADA', { inicio: '10:00', fim: '10:45' });
    prospeccao(DALVA, '2026-11-20', 'AGENDADA');
    interno(DALVA, '2026-11-20', 'Reunião interna', 'AGENDADA');
    const hoje = await listar(DALVA, '2026-11-20', '2026-11-20');
    assert.equal(hoje.length, 5);
    assert.equal(hoje.filter((i) => i.STATUS !== 'CANCELADA').length, 4);
    limparAgenda();
  });

  await teste('C-003 / RN-003 / RN-004: semana de 09 a 13/11 → realizadas 13, meta 16', async () => {
    em('2026-11-13 10:00');
    for (let i = 0; i < 10; i++) visita(DALVA, `2026-11-${String(9 + (i % 5)).padStart(2, '0')}`, 'CONCLUIDA', { inicio: `${String(8 + Math.floor(i / 5) * 2).padStart(2, '0')}:00`, fim: `${String(9 + Math.floor(i / 5) * 2).padStart(2, '0')}:00` });
    prospeccao(DALVA, '2026-11-10', 'CONCLUIDA');
    prospeccao(DALVA, '2026-11-11', 'CONCLUIDA');
    interno(DALVA, '2026-11-12', 'Deslocamento', 'CONCLUIDA');
    interno(DALVA, '2026-11-13', 'Reunião interna', 'CONCLUIDA');
    visita(DALVA, '2026-11-12', 'EM_ANDAMENTO', { inicio: '15:00', fim: '16:00' });
    visita(DALVA, '2026-11-13', 'EM_ANDAMENTO', { inicio: '15:00', fim: '16:00' });
    visita(DALVA, '2026-11-14', 'CONCLUIDA');
    visita(DALVA, '2026-11-15', 'CONCLUIDA');
    const r = await resumo(DALVA, '2026-11-09');
    assert.equal(Number(r.REALIZADO), 13);
    assert.equal(Number(r.META), 16);
    assert.equal(Number((await resumo(DALVA, '2026-11-16')).REALIZADO), 0, 'domingo 15/11 fora da semana de 16/11');
    limparAgenda();
  });

  await teste('C-004: Time inteiro com 3 vendedores e o coordenador → meta 56; deslocamento com 2 pessoas soma 2', async () => {
    em('2026-11-13 10:00');
    interno(DALVA, '2026-11-11', 'Deslocamento', 'CONCLUIDA', [DAVI]);
    const r = await resumo(CAETANO, '2026-11-09', 'TEAM');
    assert.equal(Number(r.PESSOAS), 4);
    assert.equal(Number(r.COORDENADORES), 1);
    assert.equal(Number(r.META), 56);
    assert.equal(Number(r.REALIZADO), 2);
    limparAgenda();
  });

  await teste('RN-005 / RF-004: meta 14 a partir de 16/11 vale só da semana seguinte; só a diretoria muda', async () => {
    em('2026-11-12 10:00');
    assert.equal(await salvar(DALVA, 'VENDEDOR', 14, '2026-11-16'), 0, 'vendedor nao configura');
    assert.equal(await salvar(GIL, 'VENDEDOR', 14, '2026-11-23'), 0, 'mais de 7 dias');
    assert.equal(await salvar(GIL, 'VENDEDOR', 14, '2026-11-17'), 0, 'nao e segunda');
    assert.equal(await salvar(GIL, 'VENDEDOR', 0, '2026-11-16'), 0, 'zero');
    assert.equal(await salvar(GIL, 'VENDEDOR', 'x', '2026-11-16'), 0, 'texto');
    assert.equal(await salvar(GIL, 'VENDEDOR', 13, '2026-11-16'), 1);
    assert.equal(await salvar(GIL, 'VENDEDOR', 14, '2026-11-16'), 1, 'troca a mudanca ja marcada');
    assert.equal(banco("SELECT COUNT(*) AS N FROM META_SEMANAL_VISITAS WHERE VIGENCIA_INICIO = '2026-11-16'")[0].N, 1);
    assert.equal(Number((await resumo(DALVA, '2026-11-09')).META), 16);
    assert.equal(Number((await resumo(DALVA, '2026-11-16')).META), 14);
    assert.equal(Number((await resumo(CAETANO, '2026-11-16', 'TEAM')).META), 14 * 3 + 8);

    const [g] = await linhas('s360MetaVisitasObter', { segunda: '2026-11-09' }, GIL);
    assert.deepEqual([Number(g.VENDEDOR), Number(g.COORDENADOR), g.PROX_VIGENCIA, Number(g.PROX_VENDEDOR), Number(g.PROX_COORDENADOR), Number(g.PODE_EDITAR)],
      [16, 8, '2026-11-16', 14, 8, 1]);
    const [d] = await linhas('s360MetaVisitasObter', { segunda: '2026-11-16' }, DALVA);
    assert.deepEqual([Number(d.VENDEDOR), d.PROX_VIGENCIA, Number(d.PODE_EDITAR)], [14, null, 0]);

    const vazio = await resumo(CAETANO, '2026-11-09', 'SELLER', { vendedor: '999999' });
    assert.deepEqual([Number(vazio.PESSOAS), Number(vazio.META)], [0, 0], 'filtro sem pessoas');
    db.exec("DELETE FROM META_SEMANAL_VISITAS WHERE VIGENCIA_INICIO > '2000-01-03'");
  });

  /* ─────────────── faturamento ─────────────── */

  await teste('C-005 / RN-006: bruto 70.000 − devolução 5.000 = 65.000; meta distribuída 100.000', async () => {
    venda(5001, '3', '2026-11-05', 40000);
    venda(5002, '3', '2026-11-19', 30000);
    devolucao(5001, '3', '2026-11-10', 5000);
    venda(5001, '3', '2026-10-30', 9999); // outubro
    const m = await mes(DALVA);
    assert.deepEqual([Number(m.BRUTO), Number(m.DEVOLUCOES), Number(m.LIQUIDO), Number(m.META)], [70000, 5000, 65000, 100000]);
  });

  await teste('RNT-007: venda fora da carteira ou de filial sem escopo não entra', async () => {
    venda(5099, '3', '2026-11-06', 1234); // cliente de ninguem
    venda(5001, '4', '2026-11-06', 4321); // Dalva sem escopo na Filial 4
    assert.equal(Number((await mes(DALVA)).BRUTO), 70000);
  });

  await teste('D-503: venda de cliente na carteira de dois vendedores conta uma vez no total do time', async () => {
    const ec = ins('EQUIPE_CLIENTE', { ID_CLIENTE: 5001, ID_VENDEDOR: DAVI, CODFILIAL: '3' });
    assert.equal(Number((await mes(DAVI)).BRUTO), 40000);
    assert.equal(Number((await mes(CAETANO, 'TEAM')).BRUTO), 70000);
    db.exec(`DELETE FROM EQUIPE_CLIENTE WHERE ID = ${ec}`);
  });

  await teste('C-007: sem distribuição no mês → META nula (nada de cadastro legado)', async () => {
    const m = await mes(DORA);
    assert.equal(m.META, null);
  });

  await teste('RN-006 (recorte): filtro Filial 3 · Hospitalar soma só as distribuições dessa BU', async () => {
    ins('METAS_BU_VENDEDOR', { CODFILIAL: 4, CODEPTO: 15, VENDEDOR_ID: DALVA, MES: 11, ANO: 2026, META_VALOR: 20000 });
    assert.equal(Number((await mes(CAETANO, 'TEAM')).META), 200000);
    assert.equal(Number((await mes(CAETANO, 'TEAM', { filial: '3', depto: '15' })).META), 180000);
    assert.equal((await mes(CAETANO, 'TEAM', { filial: '4' })).META, null, 'Dalva nao tem escopo na Filial 4: fora do filtro');
    db.exec(`DELETE FROM METAS_BU_VENDEDOR WHERE CODFILIAL = 4 AND VENDEDOR_ID = ${DALVA}`);
  });

  await teste('C-008 / RN-009: líquido por dia e soma do mês = líquido do card', async () => {
    limparVendas();
    for (const [data, v] of [['2026-11-04', 3000], ['2026-11-06', 2000], ['2026-11-09', 5000], ['2026-11-10', 4000], ['2026-11-11', 9000], ['2026-11-12', 6000]]) venda(5003, '3', data, v);
    devolucao(5003, '3', '2026-11-11', 1000);
    const dias = await linhas('s360DashboardVendasDiarias', { ...ESC(), de: '2026-11-04', ate: '2026-11-12' }, DALVA);
    assert.deepEqual(dias.map((d) => [d.DIA, Number(d.LIQUIDO)]),
      [['2026-11-04', 3000], ['2026-11-06', 2000], ['2026-11-09', 5000], ['2026-11-10', 4000], ['2026-11-11', 8000], ['2026-11-12', 6000]]);
    const doMes = await linhas('s360DashboardVendasDiarias', { ...ESC(), de: '2026-11-01', ate: '2026-11-30' }, DALVA);
    assert.equal(doMes.reduce((s, d) => s + Number(d.LIQUIDO), 0), Number((await mes(DALVA)).LIQUIDO));
  });

  await teste('RF-010: ATUALIZADO_EM = fim da última execução concluída', async () => {
    assert.equal((await mes(DALVA)).ATUALIZADO_EM, '2026-11-03 07:05:00');
  });

  /* ─────────────── resumo da semana, alertas e atividades ─────────────── */

  await teste('C-009 / RN-012: as cinco da semana, com status e check-out para o relato', async () => {
    visita(DALVA, '2026-11-10', 'CONCLUIDA', { checkout: '2026-11-11 08:00:00' });
    visita(DALVA, '2026-11-10', 'AGENDADA', { inicio: '14:00', fim: '15:00' });
    visita(DALVA, '2026-11-13', 'AGENDADA');
    visita(DALVA, '2026-11-09', 'CANCELADA');
    prospeccao(DALVA, '2026-11-09', 'CONCLUIDA');
    const semana = (await listar(DALVA, '2026-11-09', '2026-11-15')).filter((i) => i.ORIGEM !== 'INTERNA');
    assert.equal(semana.length, 5);
    const concluida = semana.find((i) => i.ORIGEM === 'VISITA' && i.STATUS === 'CONCLUIDA');
    assert.equal(concluida.CHECKOUT_HORA.slice(0, 10), '2026-11-11');
    assert.ok(semana.find((i) => i.ORIGEM === 'PROSPECCAO').CHECKOUT_HORA);
    limparAgenda();
  });

  await teste('C-010 / RN-010: 7 altos + 3 médios não lidos → os 5 altos mais recentes', async () => {
    for (let i = 1; i <= 7; i++) alerta(DALVA, 'ALTA', `2026-11-0${i} 08:00:00`);
    for (let i = 1; i <= 3; i++) alerta(DALVA, 'MEDIA', `2026-11-09 0${i}:00:00`);
    alerta(DALVA, 'ALTA', '2026-11-09 09:00:00', { lido: 1 });
    const a = await linhas('s360DashboardAlertas', ESC(), DALVA);
    assert.deepEqual(a.map((x) => x.TITULO), [7, 6, 5, 4, 3].map((d) => `Alerta 2026-11-0${d} 08:00:00`));
    assert.equal((await linhas('s360DashboardAlertas', ESC('TEAM'), CAETANO)).length, 5, 'coordenador ve os da equipe');
  });

  await teste('RN-010: alerta alto de outra BU do vendedor fora do recorte aberto não aparece', async () => {
    const bv = ins('BU_VENDEDOR', { BU_CODIGO: BU, VENDEDOR_ID: DALVA, ATIVO: 1, CODFILIAL: '4' });
    alerta(DALVA, 'ALTA', '2026-11-10 08:00:00', { filial: 4 });
    assert.equal((await linhas('s360DashboardAlertas', ESC(), DALVA))[0].TITULO, 'Alerta 2026-11-10 08:00:00');
    assert.ok(!(await linhas('s360DashboardAlertas', ESC('ME', { filial: '3' }), DALVA)).some((x) => x.TITULO === 'Alerta 2026-11-10 08:00:00'));
    db.exec(`DELETE FROM BU_VENDEDOR WHERE ID = ${bv}`);
    assert.ok(!(await linhas('s360DashboardAlertas', ESC(), DALVA)).some((x) => x.TITULO === 'Alerta 2026-11-10 08:00:00'), 'sem escopo na filial 4');
  });

  await teste('RN-011: atividades abertas sem a concluída (SF da 004)', async () => {
    const abertas = await linhas('s360AtividadesAbertas', { ...ESC(), status: '', prioridade: '', prazo: '' }, DALVA);
    assert.deepEqual(abertas.map((a) => a.ID).sort(), [5001, 5002, 5003, 5004]);
  });
}
