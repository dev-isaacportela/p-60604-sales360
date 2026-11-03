// Spec 003 — regra de tela da Agenda (T-095).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formularioInicial, validar, validarReagendar, validarConclusao, validarCheckout, validarCancelar, mensagemConflito,
  acoes, acaoPrincipal, periodo, navegar, semanaDe, mesEmSemanas, salvarAtividades, atividadeVazia, textoSimples,
  relatoInterno, participantes, meta, posicaoAgora, duracao, turno, MSG,
} from '../src/lib/agenda.ts';

const HOJE = '2026-11-04';

test('RN-001: formulários nascem com o tipo padrão, a data de hoje e 08:00–09:00', () => {
  const v = formularioInicial('VISITA', HOJE);
  assert.deepEqual([v.tipoCompromisso, v.data, v.inicio, v.fim], ['Aumento de mix', HOJE, '08:00', '09:00']);
  assert.equal(formularioInicial('PROSPECCAO', HOJE).tipoCompromisso, 'Prospecção');
  assert.equal(formularioInicial('INTERNA', HOJE).tipoCompromisso, 'Reunião interna');
  assert.equal(formularioInicial('DESLOCAMENTO', HOJE).tipoCompromisso, 'Deslocamento');
});

test('C-002: nenhum cliente vem pré-selecionado; criar sem cliente avisa', () => {
  const v = formularioInicial('VISITA', HOJE);
  assert.equal(v.clienteId, '');
  assert.equal(validar(v, HOJE), 'Selecione o cliente da visita.');
  assert.equal(validar(formularioInicial('PROSPECCAO', HOJE), HOJE), 'Selecione o prospect da visita.');
  assert.equal(validar({ ...v, clienteId: '3001' }, HOJE), null);
});

test('RN-002: horário, título e trajeto', () => {
  const v = { ...formularioInicial('VISITA', HOJE), clienteId: '3001' };
  assert.equal(validar({ ...v, inicio: '09:00', fim: '09:00' }, HOJE), 'O horário de fim deve ser maior que o horário de início.');
  assert.equal(validar({ ...v, data: '' }, HOJE), 'Preencha data, horário e tipo.');
  const r = formularioInicial('INTERNA', HOJE);
  assert.equal(validar(r, HOJE), 'Informe o título da agenda interna.');
  assert.equal(validar({ ...r, titulo: 'x'.repeat(201) }, HOJE), 'O título passou do limite de 200 caracteres.');
  assert.equal(validar({ ...r, titulo: 'x'.repeat(200) }, HOJE), null);
  assert.equal(validar({ ...formularioInicial('DESLOCAMENTO', HOJE), origem: 'Recife' }, HOJE), 'Informe a origem e o destino do deslocamento.');
});

test('RN-003 / RN-008: retroativo de 5 dias e limite de texto', () => {
  const v = { ...formularioInicial('VISITA', '2026-11-10'), clienteId: '3001' };
  assert.equal(validar({ ...v, data: '2026-11-04' }, '2026-11-10'), MSG.retro);
  assert.equal(validar({ ...v, data: '2026-11-05' }, '2026-11-10'), null);
  assert.equal(validar({ ...v, texto: 'a'.repeat(20001) }, '2026-11-10'), 'O texto passou do limite de 20.000 caracteres.');
  assert.equal(validar({ ...v, texto: 'a'.repeat(20000) }, '2026-11-10'), null);
});

test('RN-009 / C-007: mudar a data pede motivo; mudar só a hora não', () => {
  const item = { ORIGEM: 'VISITA', DATA: '2026-11-05' };
  const f = { ...formularioInicial('VISITA', HOJE), clienteId: '3001', data: '2026-11-05' };
  assert.equal(validarReagendar(item, { ...f, data: '2026-11-06' }, '', HOJE), 'Ao alterar a data da visita, informe o motivo no relato.');
  assert.equal(validarReagendar(item, { ...f, data: '2026-11-06' }, 'Cliente pediu outro dia', HOJE), null);
  assert.equal(validarReagendar(item, { ...f, inicio: '10:00', fim: '11:00' }, '', HOJE), null);
  assert.equal(validarReagendar({ ORIGEM: 'VISITA', DATA: '2026-11-01' }, { ...f, data: '2026-11-01' }, '', '2026-11-10'), null);
});

test('C-005 / C-008 / RN-010: relato do check-out e motivo do cancelamento', () => {
  assert.equal(validarCheckout('  '), 'Para finalizar a visita, preencha o relato.');
  assert.equal(validarCheckout('ok'), null);
  assert.equal(validarCancelar({ ORIGEM: 'VISITA' }, ''), 'Informe o motivo do cancelamento da visita.');
  assert.equal(validarCancelar({ ORIGEM: 'INTERNA' }, ''), null);
});

test('C-009 / RN-011: deslocamento só conclui no dia e com relato; reunião dispensa', () => {
  const desloc = { ORIGEM: 'INTERNA', TIPO: 'Deslocamento', DATA: '2026-11-09' };
  assert.equal(validarConclusao(desloc, 'ok', '2026-11-06'), 'O deslocamento só pode ser concluído a partir do dia agendado.');
  assert.equal(validarConclusao(desloc, '', '2026-11-09'), 'Para concluir o deslocamento, preencha o relato.');
  assert.equal(validarConclusao(desloc, 'Chegada às 08:50', '2026-11-09'), null);
  assert.equal(validarConclusao({ ORIGEM: 'INTERNA', TIPO: 'Reunião interna', DATA: '2026-11-20' }, '', HOJE), null);
});

test('C-004: mensagem de conflito cita o tipo existente e a pessoa', () => {
  assert.equal(mensagemConflito({ ORIGEM_EXISTENTE: 'VISITA', EH_VOCE: 1, HORA_INICIO: '09:00', HORA_FIM: '10:00' }),
    'Já existe uma visita agendada para você das 09:00 às 10:00 neste dia. Escolha outro horário.');
  assert.equal(mensagemConflito({ ORIGEM_EXISTENTE: 'INTERNA', EH_VOCE: 1, HORA_INICIO: '11:00', HORA_FIM: '12:00' }),
    'Já existe um compromisso interno agendado para você das 11:00 às 12:00 neste dia. Escolha outro horário.');
  assert.equal(mensagemConflito({ ORIGEM_EXISTENTE: 'PROSPECCAO', EH_VOCE: 0, NOME: 'Bruno Lima', HORA_INICIO: '09:00', HORA_FIM: '10:00' }),
    'Já existe uma visita de prospecção agendada para Bruno Lima das 09:00 às 10:00 neste dia. Escolha outro horário.');
});

test('RN-005 / C-008 / C-013: ações por status e por quem opera', () => {
  const rotulos = (item) => acoes(item).map((a) => a.rotulo);
  const visita = { ORIGEM: 'VISITA', PODE_OPERAR: 1 };
  assert.deepEqual(rotulos({ ...visita, STATUS: 'AGENDADA' }), ['Iniciar (Check-in)', 'Editar / Reagendar', 'Cancelar', 'Ver Planejamento', 'Ver Relato']);
  assert.deepEqual(rotulos({ ...visita, STATUS: 'EM_ANDAMENTO' }), ['Encerrar visita', 'Ver Planejamento', 'Ver Relato']);
  assert.deepEqual(rotulos({ ...visita, STATUS: 'CONCLUIDA' }), ['Editar Relato', 'Ver Planejamento', 'Ver Relato']);
  assert.deepEqual(rotulos({ ...visita, STATUS: 'CANCELADA' }), ['Ver Planejamento', 'Ver Relato']);
  assert.deepEqual(rotulos({ ...visita, STATUS: 'AGENDADA', PODE_OPERAR: 0 }), ['Ver Planejamento', 'Ver Relato']);
  assert.equal(acaoPrincipal({ ORIGEM: 'INTERNA', TIPO: 'Deslocamento', STATUS: 'AGENDADA', PODE_OPERAR: 1 }).rotulo, 'Concluir deslocamento');
  assert.equal(acaoPrincipal({ ORIGEM: 'INTERNA', TIPO: 'Reunião interna', STATUS: 'AGENDADA', PODE_OPERAR: 1 }).rotulo, 'Concluir');
  assert.equal(acoes({ ORIGEM: 'PROSPECCAO', STATUS: 'CANCELADA' })[0].rotulo, 'Ver objetivo');
  assert.equal(acoes({ ORIGEM: 'INTERNA', STATUS: 'CANCELADA' })[0].rotulo, 'Ver detalhes');
});

test('RF-001: períodos e navegação nas três visões', () => {
  assert.deepEqual(periodo('SEMANA', '2026-11-04'), { de: '2026-11-02', ate: '2026-11-08' });
  assert.deepEqual(periodo('SEMANA', '2026-11-08'), { de: '2026-11-02', ate: '2026-11-08' });
  assert.deepEqual(periodo('DIA', '2026-11-04'), { de: '2026-11-04', ate: '2026-11-04' });
  assert.deepEqual(periodo('MES', '2026-11-04'), { de: '2026-10-26', ate: '2026-12-06' });
  assert.equal(mesEmSemanas('2026-11-04').length, 6);
  assert.deepEqual(semanaDe('2026-11-04'), { segunda: '2026-11-02', sexta: '2026-11-06', domingo: '2026-11-08' });
  assert.equal(navegar('MES', '2026-10-31', 1), '2026-11-30');
  assert.equal(navegar('SEMANA', '2026-11-04', -1), '2026-10-28');
  assert.equal(navegar('DIA', '2026-12-31', 1), '2027-01-01');
});

test('C-006: atividade que falha não desfaz a visita; sem título é ignorada', async () => {
  const lista = [{ ...atividadeVazia(), titulo: 'Enviar proposta' }, { ...atividadeVazia(), titulo: 'Ligar' }, atividadeVazia()];
  const chamadas = [];
  const r = await salvarAtividades(lista, async (a) => {
    chamadas.push(a.titulo);
    if (a.titulo === 'Ligar') throw new Error('falhou');
    return 1;
  });
  assert.deepEqual(chamadas, ['Enviar proposta', 'Ligar']);
  assert.equal(r.criadas, 1);
  assert.deepEqual(r.pendentes.map((a) => a.titulo), ['Ligar']);
  assert.equal(r.mensagem, 'Visita encerrada, mas 1 atividade(s) não foram salvas. Revise e tente novamente.');
  assert.equal((await salvarAtividades([], async () => 1)).mensagem, null);
});

test('D-304 / D-305: relato antigo em HTML vira texto; relato do interno sai da descrição', () => {
  assert.equal(textoSimples('<p>Linha 1</p><p>Linha&nbsp;2<br>fim</p>'), 'Linha 1\nLinha 2\nfim');
  assert.equal(textoSimples('a < b\nc'), 'a < b\nc');
  assert.equal(relatoInterno('Pauta\n\nConclusão em 09/11/2026 08:55:\nChegada'), 'Conclusão em 09/11/2026 08:55:\nChegada');
  assert.equal(relatoInterno('Pauta'), '');
  assert.deepEqual(participantes('2:Bruno|3:Carla'), [{ id: 2, nome: 'Bruno' }, { id: 3, nome: 'Carla' }]);
});

test('RF-014: meta semanal com restantes e percentual', () => {
  assert.deepEqual(meta({ REALIZADO: 13, META: 16 }), { realizadas: 13, meta: 16, restantes: 3, percentual: 81 });
  assert.deepEqual(meta({ REALIZADO: 20, META: 16 }).restantes, 0);
  assert.equal(meta(null).percentual, 0);
});

test('Visão Dia: linha de agora entra antes do primeiro compromisso que ainda não começou', () => {
  const itens = [{ HORA_INICIO: '08:00' }, { HORA_INICIO: '09:00' }, { HORA_INICIO: '13:00' }];
  assert.equal(posicaoAgora(itens, '08:30'), 1);
  assert.equal(posicaoAgora(itens, '07:00'), 0);
  assert.equal(posicaoAgora(itens, '18:00'), -1);
});

test('Visão Dia: duração e turno do compromisso', () => {
  assert.equal(duracao('08:00', '08:45'), '45 min');
  assert.equal(duracao('09:00', '10:00'), '1h');
  assert.equal(duracao('13:00', '14:30'), '1h30');
  assert.equal(duracao('10:00', '09:00'), '');
  assert.deepEqual(['08:00', '12:00', '18:30'].map(turno), ['Manhã', 'Tarde', 'Noite']);
});
