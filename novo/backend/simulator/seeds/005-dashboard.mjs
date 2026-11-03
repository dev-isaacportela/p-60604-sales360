// Dados da spec 005 (dashboard), ids 5001+. Usuarios proprios numa BU que so
// eles usam (Filiais 3 e 4 · Hospitalar 5): nada nos usuarios 1..11, para
// nao mudar os numeros das outras specs. Semana de 02 a 06/11/2026 (hoje =
// 03/11) para a tela; o smoke apaga e monta os proprios dados.
//
// A carga inicial da meta semanal (16/8) e de todo banco: a Agenda (003) le
// a mesma tabela.

import { META_INICIAL } from '../../lib/005-dashboard.mjs';

const EM = '2026-10-01 08:00:00';

export const EMAIL = {
  DALVA: 'dalva.dash@benenutri.local',
  DAVI: 'davi.dash@benenutri.local',
  DORA: 'dora.dash@benenutri.local',
  CAETANO: 'caetano.dash@benenutri.local',
};
export const SUPERVISOR = 5001;
export const BU = '5'; // codigo proprio: o 15 e da 010 (Ortopedia)

export function semear({ inserir, usuario }) {
  inserir('META_SEMANAL_VISITAS', ['PERFIL', 'VALOR', 'VIGENCIA_INICIO'], META_INICIAL);

  const DALVA = usuario('Dalva Dash', EMAIL.DALVA);
  const DAVI = usuario('Davi Dash', EMAIL.DAVI);
  const DORA = usuario('Dora Dash', EMAIL.DORA);
  const CAETANO = usuario('Caetano Dash', EMAIL.CAETANO);
  const vendedores = [DALVA, DAVI, DORA];

  inserir('BU', ['CODIGO', 'NOME', 'ATIVO'], [[BU, 'Hospitalar', 1]]);
  inserir('USUARIO_PAPEL', ['USER_ID', 'PAPEL', 'ATRIBUIDO_EM'], [
    ...vendedores.map((id) => [id, 'VENDEDOR', EM]),
    [CAETANO, 'COORDENADOR', EM],
  ]);
  inserir('COORDENADORES', ['COD_SUPERVISOR', 'NOME', 'EMAIL', 'USER_ID', 'ATIVO'], [[SUPERVISOR, 'Caetano Dash', EMAIL.CAETANO, CAETANO, 1]]);
  inserir('COORDENADORES_BU', ['COD_SUPERVISOR', 'CODFILIAL', 'CODEPTO'], [[SUPERVISOR, 3, Number(BU)], [SUPERVISOR, 4, Number(BU)]]);
  inserir('VENDEDOR_RCA', ['USER_ID', 'COD_RCA', 'COD_SUPERVISOR'], vendedores.map((id, i) => [id, 5101 + i, SUPERVISOR]));
  inserir('BU_VENDEDOR', ['BU_CODIGO', 'VENDEDOR_ID', 'ATIVO', 'CODFILIAL', 'ID_SECAO', 'CRIADO_EM'], [
    [BU, DALVA, 1, '3', null, EM], [BU, DAVI, 1, '3', null, EM], [BU, DORA, 1, '4', null, EM],
  ]);

  // Clientes: 5001-5006 de Dalva, 5007-5008 de Davi (Filial 3), 5009-5010 de Dora (Filial 4).
  const nomes = {
    5001: 'Hospital Central', 5002: 'Clínica São Bento', 5003: 'Hospital do Lago', 5004: 'Policlínica Norte', 5005: 'Casa de Saúde Vida',
    5006: 'Hospital Esperança', 5007: 'Clínica Santa Luzia', 5008: 'Hospital Regional', 5009: 'Clínica Anápolis', 5010: 'Hospital Goiás',
  };
  inserir('CLIENTES', ['ID', 'RAZAO_SOCIAL', 'NOME_FANTASIA', 'CIDADE', 'UF', 'SEGMENTO', 'STATUS', 'CRIADO_EM', 'WINTHOR_CODCLI'],
    Object.entries(nomes).map(([id, nome]) => [Number(id), `${nome.toUpperCase()} LTDA`, nome, 'Taguatinga', 'DF', 'Hospitalar', 'ATIVO', EM, Number(id)]));
  const dono = (id) => (id <= 5006 ? [DALVA, '3'] : id <= 5008 ? [DAVI, '3'] : [DORA, '4']);
  inserir('EQUIPE_CLIENTE', ['ID_CLIENTE', 'ID_VENDEDOR', 'CRIADO_EM', 'CODFILIAL', 'ID_SECAO'],
    Object.keys(nomes).map(Number).map((id) => [id, ...dono(id).slice(0, 1), EM, dono(id)[1], null]));

  // Vendas dos ultimos 7 dias uteis (26/10 a 03/11) e uma devolucao em novembro.
  const venda = (n, cliente, filial, data, total) => [`5${String(n).padStart(4, '0')}`, data, filial, cliente, BU, total];
  inserir('IMP_VENDAS_DASHBOARD_TOTVS_RCA', ['NUMPED', 'DTSAIDA', 'CODFILIAL', 'CODCLI', 'CODEPTO', 'TOTAL'], [
    venda(1, 5001, '3', '2026-10-26', 3000), venda(2, 5002, '3', '2026-10-28', 2500), venda(3, 5003, '3', '2026-10-29', 4200),
    venda(4, 5001, '3', '2026-10-30', 3800), venda(5, 5004, '3', '2026-11-02', 5000), venda(6, 5003, '3', '2026-11-03', 6200),
    venda(7, 5007, '3', '2026-11-02', 3000), venda(8, 5008, '3', '2026-11-03', 2000), venda(9, 5009, '4', '2026-11-03', 1500),
  ]);
  inserir('IMP_DEVOLUCOES_TOTVS', ['NUMPED', 'DATA_DEVOLUCAO', 'CODFILIAL', 'CODCLI', 'CODEPTO', 'VALOR_DEVOLVIDO'], [
    ['50005', '2026-11-02', '3', 5004, BU, 800],
  ]);
  inserir('METAS_BU_VENDEDOR', ['CODFILIAL', 'CODEPTO', 'VENDEDOR_ID', 'MES', 'ANO', 'META_VALOR', 'CRIADO_POR'], [
    [3, Number(BU), DALVA, 11, 2026, 100000, 'planejamento'], [3, Number(BU), DAVI, 11, 2026, 80000, 'planejamento'],
  ]);
  // ACOMP_SEMANAL_SYNC_LOG (ultima carga do ERP) e global e e da 006: o smoke da 005 insere as execucoes dele.

  // Agenda da semana de 02 a 06/11.
  inserir('VISITAS', ['ID', 'CLIENTE_ID', 'VENDEDOR_ID', 'DATA_AGENDADA', 'HORA_INICIO', 'HORA_FIM', 'TIPO', 'STATUS', 'CHECKIN_HORA', 'CHECKOUT_HORA', 'RELATO', 'CRIADO_EM'], [
    [5001, 5001, DALVA, '2026-11-02', '09:00', '10:00', 'Aumento de mix', 'CONCLUIDA', '2026-11-02 09:02:00', '2026-11-02 09:58:00', 'Pedido de reposição combinado.', EM],
    [5002, 5002, DALVA, '2026-11-02', '14:00', '15:00', 'Positivação', 'CONCLUIDA', '2026-11-02 14:05:00', '2026-11-03 08:10:00', 'Novo comprador apresentado.', EM],
    [5003, 5003, DALVA, '2026-11-03', '08:30', '09:15', 'Manutenção', 'CONCLUIDA', '2026-11-03 08:31:00', '2026-11-03 09:12:00', 'Sem pendências.', EM],
    [5004, 5004, DALVA, '2026-11-03', '10:30', '11:30', 'Gerar demanda', 'AGENDADA', null, null, null, EM],
    [5005, 5005, DALVA, '2026-11-03', '15:00', '16:00', 'Financeiro', 'CANCELADA', null, null, 'Cliente remarcou.', EM],
    [5006, 5006, DALVA, '2026-11-05', '09:00', '10:00', 'Aumento de mix', 'AGENDADA', null, null, null, EM],
    [5007, 5007, DAVI, '2026-11-03', '09:00', '10:00', 'Positivação', 'AGENDADA', null, null, null, EM],
    [5008, 5008, DAVI, '2026-11-02', '10:00', '11:00', 'Manutenção', 'CONCLUIDA', '2026-11-02 10:01:00', '2026-11-02 10:50:00', 'Ok.', EM],
  ]);
  inserir('PROSPECTS', ['ID', 'RAZAO_SOCIAL', 'NOME_FANTASIA', 'CIDADE', 'UF', 'STATUS_PIPELINE', 'RESPONSAVEL_ID', 'CRIADO_EM', 'ATUALIZADO_EM'], [
    [5001, 'HOSPITAL NOVO HORIZONTE LTDA', 'Hospital Novo Horizonte', 'Taguatinga', 'DF', 'VISITA_AGENDADA', DALVA, EM, EM],
  ]);
  inserir('PROSPECT_VISITAS', ['ID', 'PROSPECT_ID', 'EXECUTIVO_ID', 'DATA_VISITA', 'HORA_INICIO', 'HORA_FIM', 'OBJETIVO', 'STATUS', 'CRIADO_EM', 'ATUALIZADO_EM'], [
    [5001, 5001, DALVA, '2026-11-02', '16:00', '17:00', 'Prospecção — Conhecer o almoxarifado.', 'CONCLUIDA', EM, '2026-11-02 17:05:00'],
    [5002, 5001, DALVA, '2026-11-03', '13:00', '14:00', 'Apresentação comercial', 'AGENDADA', EM, EM],
  ]);
  inserir('AGENDA_INTERNA', ['ID', 'TITULO', 'DATA_AGENDADA', 'HORA_INICIO', 'HORA_FIM', 'TIPO', 'ORIGEM_DESLOCAMENTO', 'DESTINO_DESLOCAMENTO', 'STATUS', 'CRIADOR_ID', 'CRIADO_EM', 'ATUALIZADO_EM'], [
    [5001, 'Taguatinga → Anápolis', '2026-11-02', '07:00', '08:30', 'Deslocamento', 'Taguatinga', 'Anápolis', 'CONCLUIDA', DALVA, EM, EM],
    [5002, 'Reunião de equipe', '2026-11-03', '17:00', '18:00', 'Reunião interna', null, null, 'AGENDADA', CAETANO, EM, EM],
  ]);
  inserir('AGENDA_INTERNA_PARTICIPANTES', ['AGENDA_ID', 'VENDEDOR_ID', 'CRIADO_EM'], [
    [5001, DAVI, EM], [5002, DALVA, EM], [5002, DAVI, EM], [5002, DORA, EM],
  ]);

  inserir('TAREFAS', ['ID', 'VENDEDOR_ID', 'TITULO', 'DESCRICAO', 'STATUS', 'PRIORIDADE', 'DATA_LIMITE', 'CRIADO_EM', 'CLIENTE_ID'], [
    [5001, DALVA, 'Enviar proposta de reposição', 'Itens da visita de 02/11.', 'PENDENTE', 'ALTA', '2026-10-30', EM, 5001],
    [5002, DALVA, 'Ligar para o setor de compras', '', 'EM_ANDAMENTO', 'MEDIA', '2026-11-05', EM, 5002],
    [5003, DALVA, 'Revisar tabela de preços', null, 'PENDENTE', 'BAIXA', null, EM, null],
    [5004, DALVA, 'Confirmar entrega', 'Conferir a nota com o almoxarifado.', 'PENDENTE', 'MEDIA', '2026-11-10', EM, 5003],
    [5005, DALVA, 'Cadastro atualizado', null, 'CONCLUIDA', 'MEDIA', '2026-10-20', EM, 5004],
  ]);

  const alerta = (id, vendedor, prioridade, lido, geracao, cliente) =>
    [id, vendedor, 3, null, cliente, nomes[cliente], 'SEM_COMPRA', `Sem compra há 45 dias (${nomes[cliente]})`, prioridade, lido, geracao, BU];
  inserir('ALERTAS_INTELIGENTES', ['ID', 'ID_VENDEDOR', 'CODFILIAL', 'ID_SECAO', 'ID_CLIENTE', 'NOME_CLIENTE', 'TIPO_ALERTA', 'TITULO', 'PRIORIDADE', 'LIDO', 'DATA_GERACAO', 'CODEPTO'], [
    ...[5001, 5002, 5003, 5004, 5005, 5006].map((c, i) => alerta(5001 + i, DALVA, 'ALTA', 0, `2026-11-0${1 + (i % 3)} 0${6 + i}:00:00`, c)),
    alerta(5007, DALVA, 'MEDIA', 0, '2026-11-03 06:00:00', 5001),
    alerta(5008, DALVA, 'MEDIA', 0, '2026-11-03 06:30:00', 5002),
    alerta(5009, DALVA, 'ALTA', 1, '2026-11-03 07:00:00', 5003),
  ]);
}
