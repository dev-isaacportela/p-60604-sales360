// Smoke da spec 003 (agenda, etapa 1): tabela Testes de
// docs/specs/003-agenda-visitas/plan.md. O relogio do banco e fixado por
// teste (em('AAAA-MM-DD HH:MM'), hora de Brasilia): toda regra de data das SFs
// usa esse relogio, nunca um valor vindo da tela.

import { registerMysqlFunctions } from '../mysql-dialect.mjs';
import { EMAIL, CLIENTE, PROSPECT } from '../seeds/003-agenda.mjs';

export default async function smoke({ teste, chamar, linhas, banco, db, assert }) {
  let relogio = new Date();
  registerMysqlFunctions(db, { now: () => relogio });
  const em = (quando) => { relogio = new Date(`${quando.replace(' ', 'T')}:00-03:00`); };

  const id = (email) => banco(`SELECT ID FROM INT_USER WHERE DESCR = '${email}'`)[0].ID;
  const ANA = id(EMAIL.ANA);
  const BRUNO = id(EMAIL.BRUNO);
  const CARLA = id(EMAIL.CARLA);
  const CARLOS = id(EMAIL.CARLOS);
  const SOL = CLIENTE.MERCADO_SOL;

  // Agenda limpa: os compromissos do seed sao para a tela.
  const meus = [ANA, BRUNO, CARLA, CARLOS].join(', ');
  db.exec(`DELETE FROM VISITAS WHERE VENDEDOR_ID IN (${meus});
    DELETE FROM PROSPECT_VISITAS WHERE EXECUTIVO_ID IN (${meus});
    DELETE FROM AGENDA_INTERNA_PARTICIPANTES;
    DELETE FROM AGENDA_INTERNA;`);

  const afetadas = async (nome, input, user) => (await chamar(nome, input, user)).affectedRows ?? 0;
  const json = (ids) => JSON.stringify(ids.map((x) => ({ id: x })));
  const ESC = (modo = 'ME') => ({ modo, coordenador: '', vendedor: '', filial: '', depto: '', secao: '', hoje: '' });
  const ultimo = (tabela) => banco(`SELECT MAX(ID) AS ID FROM ${tabela}`)[0].ID;
  const visita = (vid) => banco(`SELECT * FROM VISITAS WHERE ID = ${vid}`)[0];
  const interno = (aid) => banco(`SELECT * FROM AGENDA_INTERNA WHERE ID = ${aid}`)[0];

  const criarVisita = (user, data, inicio, fim, extra = {}) => afetadas('s360VisitaCriar', {
    clienteId: String(extra.cliente ?? SOL), vendedores: json(extra.vendedores ?? []), data, inicio, fim,
    tipo: extra.tipo ?? 'Aumento de mix', planejamento: extra.planejamento ?? '',
  }, user);
  const criarInterno = (user, tipo, data, inicio, fim, extra = {}) => afetadas('s360InternoCriar', {
    tipo, titulo: extra.titulo ?? '', descricao: extra.descricao ?? '', origemDesloc: extra.origem ?? '', destinoDesloc: extra.destino ?? '',
    data, inicio, fim, participantes: json(extra.participantes ?? []),
  }, user);
  const acao = (nome, user, origem, item, extra = {}) => afetadas(nome, { origem, id: String(item), ...extra }, user);
  const reagendar = (user, origem, item, data, inicio, fim, extra = {}) => acao('s360AgendaReagendar', user, origem, item, {
    data, inicio, fim, tipo: extra.tipo ?? 'Aumento de mix', planejamento: extra.planejamento ?? '', motivo: extra.motivo ?? '',
    titulo: extra.titulo ?? '', descricao: extra.descricao ?? '', origemDesloc: extra.origem ?? '', destinoDesloc: extra.destino ?? '',
  });
  const listar = (user, de, ate, modo = 'ME') => linhas('s360AgendaListar', { ...ESC(modo), de, ate }, user);
  const resumo = async (user, segunda, sexta, domingo, modo = 'ME') =>
    (await linhas('s360AgendaResumo', { ...ESC(modo), segunda, sexta, domingo }, user))[0];
  const conflito = async (user, pessoas, data, inicio, fim, origem = '', item = '') =>
    (await linhas('s360AgendaConflito', { pessoas: json(pessoas), data, inicio, fim, origem, id: String(item) }, user))[0];

  /* ── criar, retroativo e conflito ── */

  let v1;
  await teste('C-001: visita de Ana ao Mercado Sol em 05/11 09:00–10:00 é Agendada e aparece na semana', async () => {
    em('2026-11-04 10:00');
    assert.equal(await criarVisita(ANA, '2026-11-05', '09:00', '10:00'), 1);
    v1 = ultimo('VISITAS');
    const v = visita(v1);
    assert.equal(v.VENDEDOR_ID, ANA);
    assert.equal(v.STATUS, 'AGENDADA');
    assert.equal(v.CRIADO_EM, '2026-11-04 10:00:00');
    const itens = await listar(ANA, '2026-11-02', '2026-11-08');
    assert.equal(itens.length, 1);
    assert.equal(itens[0].TITULO, 'Mercado Sol');
    assert.equal(itens[0].PODE_OPERAR, 1);
    assert.equal((await resumo(ANA, '2026-11-02', '2026-11-06', '2026-11-08')).AGENDADAS, 1);
  });

  await teste('C-003: em 10/11, visita em 04/11 é recusada pelo servidor e em 05/11 é criada', async () => {
    em('2026-11-10 08:00');
    assert.equal(await criarVisita(ANA, '2026-11-04', '13:00', '14:00'), 0);
    assert.equal(await criarVisita(ANA, '2026-11-05', '13:00', '14:00'), 1);
  });

  await teste('C-004: sobreposição recusa; encostar no fim e cancelada não conflitam; deslocamento bloqueia reunião', async () => {
    em('2026-11-10 08:00');
    assert.equal(await criarVisita(ANA, '2026-11-12', '09:00', '10:00'), 1);
    assert.equal(await afetadas('s360ProspeccaoCriar', {
      prospectId: String(PROSPECT.ATIVO), vendedores: '[]', data: '2026-11-12', inicio: '10:00', fim: '11:00', tipo: 'Prospecção', objetivo: '',
    }, ANA), 1);
    assert.equal(await acao('s360AgendaCancelar', ANA, 'PROSPECCAO', ultimo('PROSPECT_VISITAS'), { motivo: 'Prospect remarcou' }), 1);
    assert.equal(await criarInterno(ANA, 'Deslocamento', '2026-11-12', '11:00', '12:00', { origem: 'Palmas', destino: 'Gurupi' }), 1);

    assert.equal(await criarVisita(ANA, '2026-11-12', '09:30', '10:30'), 0);
    const c1 = await conflito(ANA, [ANA], '2026-11-12', '09:30', '10:30');
    assert.deepEqual([c1.ORIGEM_EXISTENTE, c1.HORA_INICIO, c1.HORA_FIM, c1.EH_VOCE], ['VISITA', '09:00', '10:00', 1]);
    assert.equal(await criarVisita(ANA, '2026-11-12', '10:00', '11:00'), 1);
    assert.equal(await criarInterno(ANA, 'Reunião interna', '2026-11-12', '11:30', '12:30', { titulo: 'Pauta' }), 0);
    const c2 = await conflito(ANA, [ANA], '2026-11-12', '11:30', '12:30');
    assert.deepEqual([c2.ORIGEM_EXISTENTE, c2.TIPO_EXISTENTE, c2.HORA_INICIO], ['INTERNA', 'Deslocamento', '11:00']);
  });

  /* ── check-in, check-out, reagendar, cancelar ── */

  await teste('C-005: check-in grava a hora do servidor; check-out exige relato e soma no realizado', async () => {
    em('2026-11-05 09:05');
    assert.equal(await acao('s360AgendaCheckin', ANA, 'VISITA', v1), 1);
    assert.equal(visita(v1).STATUS, 'EM_ANDAMENTO');
    assert.equal(visita(v1).CHECKIN_HORA, '2026-11-05 09:05:00');
    em('2026-11-05 09:50');
    assert.equal(await acao('s360AgendaCheckout', ANA, 'VISITA', v1, { relato: '   ' }), 0);
    assert.equal(await acao('s360AgendaCheckout', ANA, 'VISITA', v1, { relato: 'Cliente aprovou 3 itens novos' }), 1);
    const v = visita(v1);
    assert.equal(v.STATUS, 'CONCLUIDA');
    assert.equal(v.CHECKOUT_HORA, '2026-11-05 09:50:00');
    assert.equal(v.RELATO, 'Cliente aprovou 3 itens novos');
    assert.equal((await resumo(ANA, '2026-11-02', '2026-11-06', '2026-11-08')).REALIZADO, 1);
  });

  await teste('C-007: mudar a data exige motivo; o cabeçalho do reagendamento fica depois do check-out', async () => {
    em('2026-11-04 10:00');
    assert.equal(await criarVisita(ANA, '2026-11-05', '11:00', '12:00', { planejamento: 'Levar catálogo' }), 1);
    const v2 = ultimo('VISITAS');
    assert.equal(await reagendar(ANA, 'VISITA', v2, '2026-11-06', '11:00', '12:00', { planejamento: 'Levar catálogo' }), 0);
    em('2026-11-04 14:30');
    assert.equal(await reagendar(ANA, 'VISITA', v2, '2026-11-06', '11:00', '12:00', { planejamento: 'Levar catálogo', motivo: 'Cliente pediu outro dia' }), 1);
    assert.equal(visita(v2).DATA_AGENDADA, '2026-11-06');
    assert.ok(visita(v2).RELATO.endsWith('Reagendamento em 04/11/2026 14:30:\nCliente pediu outro dia'), visita(v2).RELATO);
    em('2026-11-06 11:02');
    assert.equal(await acao('s360AgendaCheckin', ANA, 'VISITA', v2), 1);
    assert.equal(await acao('s360AgendaCheckout', ANA, 'VISITA', v2, { relato: 'Pedido fechado' }), 1);
    const relato = visita(v2).RELATO;
    assert.ok(relato.includes('Reagendamento em 04/11/2026 14:30:\nCliente pediu outro dia'));
    assert.ok(relato.endsWith('\n\nPedido fechado'));
  });

  let agendada;
  let andamento;
  let concluida;
  await teste('C-008: cancelar exige motivo e só vale para Agendada', async () => {
    em('2026-11-10 08:00');
    for (const [ini, fim] of [['08:00', '09:00'], ['10:00', '11:00'], ['14:00', '15:00']]) assert.equal(await criarVisita(ANA, '2026-11-13', ini, fim), 1);
    concluida = ultimo('VISITAS');
    andamento = concluida - 1;
    agendada = concluida - 2;
    await acao('s360AgendaCheckin', ANA, 'VISITA', andamento);
    await acao('s360AgendaCheckin', ANA, 'VISITA', concluida);
    await acao('s360AgendaCheckout', ANA, 'VISITA', concluida, { relato: 'Feito' });
    assert.equal(await acao('s360AgendaCancelar', ANA, 'VISITA', agendada, { motivo: '' }), 0);
    assert.equal(await acao('s360AgendaCancelar', ANA, 'VISITA', agendada, { motivo: 'Cliente fechado' }), 1);
    assert.equal(visita(agendada).STATUS, 'CANCELADA');
    assert.ok(visita(agendada).RELATO.startsWith('Cancelamento em 10/11/2026 08:00:\nCliente fechado'));
    assert.equal(await acao('s360AgendaCancelar', ANA, 'VISITA', andamento, { motivo: 'x' }), 0);
    assert.equal(await acao('s360AgendaCancelar', ANA, 'VISITA', concluida, { motivo: 'x' }), 0);
  });

  /* ── interno e deslocamento ── */

  let desloc;
  await teste('C-009: deslocamento só conclui a partir do dia, com relato, e conta para Ana e Bruno', async () => {
    em('2026-11-06 10:00');
    assert.equal(await criarInterno(ANA, 'Deslocamento', '2026-11-09', '07:00', '09:00', { origem: 'Recife', destino: 'Caruaru', participantes: [BRUNO] }), 2);
    desloc = ultimo('AGENDA_INTERNA');
    assert.equal(interno(desloc).TITULO, 'Recife → Caruaru');
    assert.equal(await afetadas('s360InternoConcluir', { id: String(desloc), relato: 'Chegada às 08:50' }, ANA), 0);
    em('2026-11-09 08:55');
    assert.equal(await afetadas('s360InternoConcluir', { id: String(desloc), relato: '' }, ANA), 0);
    assert.equal(await afetadas('s360InternoConcluir', { id: String(desloc), relato: 'x'.repeat(20001) }, ANA), 0);
    assert.equal(await afetadas('s360InternoConcluir', { id: String(desloc), relato: 'Chegada às 08:50, rota pela BR-232' }, ANA), 1);
    assert.equal(interno(desloc).STATUS, 'CONCLUIDA');
    assert.ok(interno(desloc).DESCRICAO.startsWith('Conclusão em 09/11/2026 08:55:\nChegada às 08:50'));
  });

  let reuniao;
  await teste('C-010: participante vê sem operar; quem é retirado deixa de ver', async () => {
    em('2026-11-05 10:00');
    assert.equal(await criarInterno(ANA, 'Reunião interna', '2026-11-10', '14:00', '15:00', { titulo: 'Alinhamento de mix', participantes: [BRUNO, CARLA] }), 3);
    reuniao = ultimo('AGENDA_INTERNA');
    const doBruno = (await listar(BRUNO, '2026-11-09', '2026-11-15')).find((i) => i.ORIGEM === 'INTERNA' && i.ID === reuniao);
    assert.ok(doBruno);
    assert.equal(doBruno.PODE_OPERAR, 0);
    assert.equal(doBruno.PARTICIPANTES.split('|').length, 2);
    assert.equal(await reagendar(BRUNO, 'INTERNA', reuniao, '2026-11-10', '15:00', '16:00', { tipo: 'Reunião interna', titulo: 'Outra' }), 0);
    assert.equal(await afetadas('s360InternoParticipanteRetirar', { id: String(reuniao), pessoaId: String(CARLA) }, ANA), 1);
    assert.ok(!(await listar(CARLA, '2026-11-09', '2026-11-15')).some((i) => i.ORIGEM === 'INTERNA' && i.ID === reuniao));
  });

  await teste('RN-004: participante ocupado bloqueia a própria visita, o convite e a inclusão', async () => {
    em('2026-11-05 10:00');
    assert.equal(await criarVisita(BRUNO, '2026-11-10', '14:30', '15:30', { cliente: CLIENTE.BRUNO }), 0);
    assert.equal(await criarVisita(BRUNO, '2026-11-24', '09:30', '10:30', { cliente: CLIENTE.BRUNO }), 1);
    assert.equal(await criarInterno(ANA, 'Reunião interna', '2026-11-24', '09:00', '10:00', { titulo: 'Com Bruno', participantes: [BRUNO] }), 0);
    const c = await conflito(ANA, [ANA, BRUNO], '2026-11-24', '09:00', '10:00');
    assert.equal(c.PESSOA_ID, BRUNO);
    assert.equal(c.NOME, 'Bruno Agenda');
    assert.equal(await criarInterno(ANA, 'Deslocamento', '2026-11-24', '09:00', '11:00', { origem: 'Palmas', destino: 'Porto Nacional' }), 1);
    assert.equal(await afetadas('s360InternoParticipanteIncluir', { id: String(ultimo('AGENDA_INTERNA')), pessoaId: String(BRUNO) }, ANA), 0);
  });

  await teste('RN-004: reagendar feito pelo substituto compara com a agenda do dono', async () => {
    em('2026-11-05 10:00');
    assert.equal(await criarVisita(ANA, '2026-11-23', '09:00', '10:00'), 1);
    const daAna = ultimo('VISITAS');
    assert.equal(await criarVisita(ANA, '2026-11-23', '14:00', '15:00'), 1);
    assert.equal(await criarVisita(BRUNO, '2026-11-23', '11:00', '12:00', { cliente: CLIENTE.BRUNO }), 1);
    assert.equal(await reagendar(BRUNO, 'VISITA', daAna, '2026-11-23', '11:00', '12:00'), 1);
    assert.equal(await reagendar(BRUNO, 'VISITA', daAna, '2026-11-23', '14:30', '15:30'), 0);
  });

  await teste('RN-010: interno cancela sem motivo pelo criador; participante não cancela', async () => {
    em('2026-11-05 10:00');
    assert.equal(await criarInterno(ANA, 'Outros', '2026-11-26', '08:00', '09:00', { titulo: 'Treinamento', participantes: [BRUNO] }), 2);
    const item = ultimo('AGENDA_INTERNA');
    assert.equal(await acao('s360AgendaCancelar', BRUNO, 'INTERNA', item, { motivo: '' }), 0);
    assert.equal(await acao('s360AgendaCancelar', ANA, 'INTERNA', item, { motivo: '' }), 1);
    assert.equal(interno(item).STATUS, 'CANCELADA');
  });

  await teste('RN-011 / C-009: deslocamento conta para Ana e Bruno; reunião e deslocamento de sábado não contam', async () => {
    em('2026-11-10 15:10');
    assert.equal(await afetadas('s360InternoConcluir', { id: String(reuniao), relato: '' }, ANA), 1);
    assert.equal(await criarInterno(ANA, 'Deslocamento', '2026-11-14', '08:00', '09:00', { origem: 'Palmas', destino: 'Araguaína' }), 1);
    const sabado = ultimo('AGENDA_INTERNA');
    em('2026-11-14 09:10');
    assert.equal(await afetadas('s360InternoConcluir', { id: String(sabado), relato: 'Cheguei' }, ANA), 1);
    // Depois das ferias de Ana (16/11): cada um so com a propria meta.
    // Ana: deslocamento de 09/11 + visita concluida do C-008 (13/11); a
    // reuniao de 10/11 e o deslocamento de sabado 14/11 ficam fora.
    em('2026-11-16 08:00');
    assert.equal((await resumo(ANA, '2026-11-09', '2026-11-13', '2026-11-15')).REALIZADO, 2);
    assert.equal((await resumo(BRUNO, '2026-11-09', '2026-11-13', '2026-11-15')).REALIZADO, 1);
  });

  /* ── varios vendedores, ferias, coordenador ── */

  await teste('C-011: visita para Ana e Bruno é tudo ou nada; cliente basta estar na carteira de quem cria', async () => {
    em('2026-11-04 10:00');
    assert.equal(await criarVisita(BRUNO, '2026-11-19', '09:00', '10:00', { cliente: CLIENTE.BRUNO }), 1);
    const antes = ultimo('VISITAS');
    assert.equal(await criarVisita(ANA, '2026-11-19', '09:00', '10:00', { vendedores: [ANA, BRUNO] }), 0);
    assert.equal(ultimo('VISITAS'), antes);
    assert.equal((await conflito(ANA, [ANA, BRUNO], '2026-11-19', '09:00', '10:00')).PESSOA_ID, BRUNO);
    assert.equal(await criarVisita(ANA, '2026-11-19', '10:00', '11:00', { vendedores: [ANA, BRUNO] }), 2);
    const donos = banco(`SELECT VENDEDOR_ID FROM VISITAS WHERE DATA_AGENDADA = '2026-11-19' AND HORA_INICIO = '10:00' ORDER BY VENDEDOR_ID`).map((r) => r.VENDEDOR_ID);
    assert.deepEqual(donos, [ANA, BRUNO].sort((a, b) => a - b));
  });

  await teste('RN-013: cliente fora da carteira de quem cria → nada gravado; criada por Ana só para Bruno → 1 de Bruno', async () => {
    em('2026-11-04 10:00');
    assert.equal(await criarVisita(ANA, '2026-11-27', '09:00', '10:00', { cliente: CLIENTE.FORA }), 0);
    assert.equal(await criarVisita(ANA, '2026-11-27', '09:00', '10:00', { vendedores: [BRUNO] }), 1);
    assert.equal(visita(ultimo('VISITAS')).VENDEDOR_ID, BRUNO);
  });

  let deAna20;
  let deAna21;
  await teste('C-012: com férias ativas Bruno vê e opera a agenda de Ana; depois delas, não', async () => {
    em('2026-11-05 10:00');
    assert.equal(await criarVisita(ANA, '2026-11-20', '09:00', '10:00'), 1);
    deAna20 = ultimo('VISITAS');
    assert.equal(await criarVisita(ANA, '2026-11-21', '10:00', '11:00'), 1);
    deAna21 = ultimo('VISITAS');
    const item = (await listar(BRUNO, '2026-11-16', '2026-11-22')).find((i) => i.ID === deAna20 && i.ORIGEM === 'VISITA');
    assert.equal(item.DONO, 'Ana Agenda');
    assert.equal(item.PODE_OPERAR, 1);
    assert.equal(await acao('s360AgendaCheckin', BRUNO, 'VISITA', deAna20), 1);
    em('2026-11-16 08:00');
    assert.equal((await listar(BRUNO, '2026-11-16', '2026-11-22')).filter((i) => i.DONO_ID === ANA).length, 0);
    assert.equal(await acao('s360AgendaCheckin', BRUNO, 'VISITA', deAna21), 0);
  });

  await teste('RN-012: férias desativadas não dão acesso ao substituto', async () => {
    em('2026-11-05 10:00');
    db.exec("UPDATE FERIAS_VENDEDOR SET ATIVO = 0 WHERE COD_RCA = 3101");
    assert.equal((await listar(BRUNO, '2026-11-16', '2026-11-22')).filter((i) => i.DONO_ID === ANA).length, 0);
    assert.equal(await acao('s360AgendaCheckin', BRUNO, 'VISITA', deAna21), 0);
    db.exec("UPDATE FERIAS_VENDEDOR SET ATIVO = 1 WHERE COD_RCA = 3101");
  });

  await teste('C-013: coordenador vê a equipe sem operar e cria a própria agenda; Ana só vê a dela', async () => {
    em('2026-11-05 10:00');
    const daEquipe = (await listar(CARLOS, '2026-11-16', '2026-11-22', 'TEAM')).filter((i) => i.DONO_ID === ANA);
    assert.ok(daEquipe.length >= 2);
    assert.ok(daEquipe.every((i) => i.PODE_OPERAR === 0));
    assert.equal(await acao('s360AgendaCheckin', CARLOS, 'VISITA', deAna21), 0);
    assert.equal(await reagendar(CARLOS, 'VISITA', deAna21, '2026-11-21', '15:00', '16:00'), 0);
    assert.equal(await acao('s360AgendaCancelar', CARLOS, 'VISITA', deAna21, { motivo: 'x' }), 0);
    assert.equal(await criarVisita(CARLOS, '2026-11-20', '15:00', '16:00'), 1);
    assert.equal(visita(ultimo('VISITAS')).VENDEDOR_ID, CARLOS);
    assert.equal(await criarVisita(BRUNO, '2026-11-22', '09:00', '10:00', { cliente: CLIENTE.BRUNO }), 1);
    const daAna = await listar(ANA, '2026-11-16', '2026-11-22');
    assert.ok(daAna.length > 0);
    assert.ok(daAna.every((i) => i.DONO_ID === ANA || i.ORIGEM === 'INTERNA'));
    assert.equal((await listar(ANA, '2026-11-16', '2026-11-22', 'TEAM')).filter((i) => i.DONO_ID !== ANA).length, 0);
  });

  await teste('RF-014: meta do time de Carlos = 3 vendedores × 16 + coordenador 8', async () => {
    em('2026-11-05 10:00');
    const r = await resumo(CARLOS, '2026-11-02', '2026-11-06', '2026-11-08', 'TEAM');
    assert.deepEqual([r.META, r.PESSOAS, r.COORDENADORES], [56, 4, 1]);
    assert.equal((await resumo(ANA, '2026-11-02', '2026-11-06', '2026-11-08')).META, 16);
  });

  /* ── regras de status e texto ── */

  await teste('RN-003: editar planejamento de visita antiga sem mudar a data é aceito', async () => {
    db.exec(`INSERT INTO VISITAS (CLIENTE_ID, VENDEDOR_ID, DATA_AGENDADA, HORA_INICIO, HORA_FIM, TIPO, STATUS) VALUES (${SOL}, ${ANA}, '2026-11-01', '09:00', '10:00', 'Aumento de mix', 'AGENDADA')`);
    em('2026-11-10 08:00');
    assert.equal(await reagendar(ANA, 'VISITA', ultimo('VISITAS'), '2026-11-01', '09:00', '10:00', { planejamento: 'Novo plano' }), 1);
    assert.equal(visita(ultimo('VISITAS')).PLANEJAMENTO, 'Novo plano');
  });

  await teste('RN-005: concluir cancelado e editar relato de agendado não gravam', async () => {
    assert.equal(await acao('s360AgendaCheckout', ANA, 'VISITA', agendada, { relato: 'x' }), 0);
    assert.equal(await acao('s360AgendaCheckin', ANA, 'VISITA', agendada), 0);
    assert.equal(await acao('s360AgendaRelatoEditar', ANA, 'VISITA', deAna21, { relato: 'x' }), 0);
    assert.equal(await acao('s360AgendaRelatoEditar', ANA, 'VISITA', concluida, { relato: 'Relato revisto' }), 1);
  });

  await teste('RN-006: check-in de Em andamento não grava; de data futura grava com a hora do servidor', async () => {
    assert.equal(await acao('s360AgendaCheckin', ANA, 'VISITA', andamento), 0);
    em('2026-11-04 09:00');
    assert.equal(await criarVisita(ANA, '2026-11-05', '15:00', '16:00'), 1);
    em('2026-11-04 09:01');
    assert.equal(await acao('s360AgendaCheckin', ANA, 'VISITA', ultimo('VISITAS'), { agora: '2026-11-04 11:01:00' }), 1);
    assert.equal(visita(ultimo('VISITAS')).CHECKIN_HORA, '2026-11-04 09:01:00');
  });

  await teste('RN-007: check-out de Agendada sem check-in não grava', async () => {
    assert.equal(await acao('s360AgendaCheckout', ANA, 'VISITA', deAna21, { relato: 'x' }), 0);
  });

  await teste('RN-008: relato de 20.001 recusado; 20.000 íntegro com quebras de linha', async () => {
    em('2026-11-04 09:00');
    assert.equal(await criarVisita(ANA, '2026-11-05', '17:00', '18:00'), 1);
    const vid = ultimo('VISITAS');
    await acao('s360AgendaCheckin', ANA, 'VISITA', vid);
    assert.equal(await acao('s360AgendaCheckout', ANA, 'VISITA', vid, { relato: 'a'.repeat(20001) }), 0);
    const texto = `linha 1\nlinha 2\n${'b'.repeat(20000 - 16)}`;
    assert.equal(texto.length, 20000);
    assert.equal(await acao('s360AgendaCheckout', ANA, 'VISITA', vid, { relato: texto }), 1);
    assert.equal(visita(vid).RELATO, texto);
  });

  await teste('RN-009: mudar só a hora não exige motivo nem acrescenta cabeçalho', async () => {
    em('2026-11-04 09:00');
    assert.equal(await criarVisita(ANA, '2026-11-25', '09:00', '10:00'), 1);
    const vid = ultimo('VISITAS');
    assert.equal(await reagendar(ANA, 'VISITA', vid, '2026-11-25', '10:00', '11:00'), 1);
    assert.equal(visita(vid).HORA_INICIO, '10:00');
    assert.equal(visita(vid).RELATO, null);
  });

  await teste('RN-022 (008): agendar leva o prospect Novo a Visita agendada; concluir, a Visitado', async () => {
    em('2026-11-04 09:00');
    const etapa = () => banco(`SELECT STATUS_PIPELINE FROM PROSPECTS WHERE ID = ${PROSPECT.NOVO}`)[0].STATUS_PIPELINE;
    assert.ok(await afetadas('s360ProspeccaoCriar', {
      prospectId: String(PROSPECT.NOVO), vendedores: '[]', data: '2026-11-04', inicio: '11:00', fim: '12:00', tipo: 'Diagnóstico inicial', objetivo: 'Entender a demanda',
    }, ANA) >= 1);
    assert.equal(etapa(), 'VISITA_AGENDADA');
    const pv = ultimo('PROSPECT_VISITAS');
    assert.equal(banco(`SELECT OBJETIVO FROM PROSPECT_VISITAS WHERE ID = ${pv}`)[0].OBJETIVO, 'Diagnóstico inicial — Entender a demanda');
    const item = (await listar(ANA, '2026-11-02', '2026-11-08')).find((i) => i.ORIGEM === 'PROSPECCAO' && i.ID === pv);
    assert.deepEqual([item.TIPO, item.PLANEJAMENTO], ['Diagnóstico inicial', 'Entender a demanda']);
    assert.equal(await acao('s360AgendaCheckin', ANA, 'PROSPECCAO', pv), 1);
    assert.ok(await acao('s360AgendaCheckout', ANA, 'PROSPECCAO', pv, { relato: 'Pediu proposta' }) >= 1);
    assert.equal(etapa(), 'VISITADO');
    assert.equal(await afetadas('s360ProspeccaoCriar', {
      prospectId: String(PROSPECT.CONVERTIDO), vendedores: '[]', data: '2026-11-04', inicio: '14:00', fim: '15:00', tipo: 'Prospecção', objetivo: '',
    }, ANA), 0);
    assert.equal(await afetadas('s360ProspeccaoCriar', {
      prospectId: String(PROSPECT.ATIVO), vendedores: '[]', data: '2026-11-04', inicio: '14:00', fim: '15:00', tipo: 'Prospecção', objetivo: 'o'.repeat(190),
    }, ANA), 0);
  });

  await teste('RF-005 / RF-004: busca de prospects ativos e de clientes da carteira', async () => {
    em('2026-11-04 09:00');
    const prospects = (await linhas('s360AgendaProspects', { busca: '' }, ANA)).map((p) => p.ID);
    assert.ok(prospects.includes(PROSPECT.ATIVO));
    assert.ok(!prospects.includes(PROSPECT.CONVERTIDO) && !prospects.includes(PROSPECT.PERDIDO));
    assert.equal((await linhas('s360AgendaClientes', { busca: 's' }, ANA)).length, 0);
    const clientes = await linhas('s360AgendaClientes', { busca: 'mercado sol' }, ANA);
    assert.deepEqual(clientes.map((c) => c.ID), [SOL]);
    assert.deepEqual((await linhas('s360AgendaClientes', { busca: 'clinica sem dono' }, ANA)).length, 0);
    // Bruno, substituto: a carteira de Ana tambem.
    assert.ok((await linhas('s360AgendaClientes', { busca: 'mercado' }, BRUNO)).some((c) => c.ID === SOL));
  });

  /* ── atividade e historico ── */

  await teste('RN-007: atividade do check-out é do usuário, com o cliente da visita; sem título é recusada', async () => {
    const criar = (titulo) => afetadas('s360AgendaAtividadeCriar', {
      visitaId: String(v1), titulo, descricao: 'Enviar tabela', prioridade: 'ALTA', dataLimite: '2026-11-12',
    }, ANA);
    assert.equal(await criar(''), 0);
    assert.equal(await criar('Enviar proposta'), 1);
    const t = banco(`SELECT * FROM TAREFAS ORDER BY ID DESC LIMIT 1`)[0];
    assert.deepEqual([t.VENDEDOR_ID, t.CLIENTE_ID, t.STATUS, t.PRIORIDADE], [ANA, SOL, 'PENDENTE', 'ALTA']);
    assert.equal(await afetadas('s360AgendaAtividadeCriar', { visitaId: String(deAna21), titulo: 'x', prioridade: 'ALTA' }, ANA), 0);
  });

  await teste('C-017: histórico com 15 visitas, 4 atividades e 9 pedidos mostra os contadores e 10 eventos', async () => {
    const cli = 3005;
    for (let n = 1; n <= 15; n += 1) db.exec(`INSERT INTO VISITAS (CLIENTE_ID, VENDEDOR_ID, DATA_AGENDADA, HORA_INICIO, HORA_FIM, STATUS) VALUES (${cli}, ${ANA}, '2026-10-${String(n).padStart(2, '0')}', '09:00', '10:00', 'CONCLUIDA')`);
    for (let n = 1; n <= 4; n += 1) db.exec(`INSERT INTO TAREFAS (VENDEDOR_ID, TITULO, STATUS, CLIENTE_ID, CRIADO_EM) VALUES (${ANA}, 'Atividade ${n}', 'PENDENTE', ${cli}, '2026-10-2${n} 09:00:00')`);
    for (let n = 1; n <= 9; n += 1) {
      for (const item of [1, 2]) db.exec(`INSERT INTO IMP_VENDAS_DASHBOARD_TOTVS_RCA (NUMPED, DTSAIDA, CODFILIAL, CODPROD, CODCLI, CODEPTO, TOTAL) VALUES ('P3005-${n}', '2026-09-${String(n).padStart(2, '0')}', '6', ${item}, ${cli}, '9', 100)`);
    }
    const [r] = await linhas('s360AgendaHistoricoResumo', { clienteId: String(cli) }, ANA);
    assert.deepEqual([r.VISITAS, r.TAREFAS, r.VENDAS], [15, 4, 9]);
    const eventos = await linhas('s360AgendaHistoricoEventos', { clienteId: String(cli) }, ANA);
    assert.equal(eventos.length, 10);
    assert.equal(eventos[0].TIPO, 'TAREFA');
    assert.equal((await linhas('s360AgendaHistoricoResumo', { clienteId: String(CLIENTE.FORA) }, ANA)).length, 0);
  });
}
