// Dados da spec 003 (agenda): tabela "Simulador" de
// docs/specs/003-agenda-visitas/plan.md. Ids na faixa 3001+.
//
// Usuarios proprios (D-309) numa BU que so eles usam (Filial 6 · Estetica e
// Injetaveis): visitas e carteira novas nao mudam os numeros das outras specs.
// Compromissos na semana de 02 a 08/11/2026, para a tela; o smoke apaga e
// monta os proprios.

const EM = '2026-10-01 08:00:00';

export const EMAIL = {
  ANA: 'ana.agenda@benenutri.local',
  BRUNO: 'bruno.agenda@benenutri.local',
  CARLA: 'carla.agenda@benenutri.local',
  CARLOS: 'carlos.agenda@benenutri.local',
};

export const CLIENTE = { MERCADO_SOL: 3001, ANA_FIM: 3010, BRUNO: 3011, CARLA: 3016, FORA: 3020 };
export const PROSPECT = { ATIVO: 3001, NOVO: 3002, CONVERTIDO: 3003, PERDIDO: 3004 };

export function semear({ inserir, usuario }) {
  const ANA = usuario('Ana Agenda', EMAIL.ANA);
  const BRUNO = usuario('Bruno Agenda', EMAIL.BRUNO);
  const CARLA = usuario('Carla Agenda', EMAIL.CARLA);
  const CARLOS = usuario('Carlos Agenda', EMAIL.CARLOS);

  inserir('USUARIO_PAPEL', ['USER_ID', 'PAPEL', 'ATRIBUIDO_EM'], [
    ...[ANA, BRUNO, CARLA].map((id) => [id, 'VENDEDOR', EM]),
    [CARLOS, 'COORDENADOR', EM],
  ]);
  inserir('COORDENADORES', ['COD_SUPERVISOR', 'NOME', 'EMAIL', 'USER_ID', 'ATIVO'], [[3001, 'Carlos Agenda', EMAIL.CARLOS, CARLOS, 1]]);
  inserir('COORDENADORES_BU', ['COD_SUPERVISOR', 'CODFILIAL', 'CODEPTO'], [[3001, 6, 9]]);
  inserir('VENDEDOR_RCA', ['USER_ID', 'COD_RCA', 'COD_SUPERVISOR'], [[ANA, 3101, 3001], [BRUNO, 3102, 3001], [CARLA, 3103, 3001]]);
  inserir('BU_VENDEDOR', ['BU_CODIGO', 'VENDEDOR_ID', 'ATIVO', 'CODFILIAL', 'ID_SECAO', 'CRIADO_EM'],
    [ANA, BRUNO, CARLA].map((id) => ['9', id, 1, '6', null, EM]));

  // C-012: Ana de ferias de 01/11 a 15/11 com Bruno.
  inserir('FERIAS_VENDEDOR', ['COD_RCA', 'RCA', 'DT_INICIO', 'DT_FIM', 'COD_RCA_SUBSTITUTO', 'RCA_SUBSTITUTO', 'ATIVO'], [
    [3101, 'ANA AGENDA', '2026-11-01', '2026-11-15', 3102, 'BRUNO AGENDA', 1],
  ]);

  // Clientes: 3001-3010 de Ana, 3011-3015 de Bruno, 3016-3018 de Carla, 3020 de ninguem.
  const nomes = {
    3001: 'Mercado Sol', 3002: 'Clínica Bela Pele', 3003: 'Estética Vida', 3004: 'Spa Lótus', 3005: 'Dermato Center',
    3006: 'Instituto Renova', 3007: 'Clínica Harmonia', 3008: 'Studio Facial', 3009: 'Beleza & Cia', 3010: 'Clínica Aurora',
    3011: 'Clínica Palmas Sul', 3012: 'Estética Norte', 3013: 'Spa Jalapão', 3014: 'Clínica Tocantins', 3015: 'Pele Nova',
    3016: 'Clínica Serra', 3017: 'Estética Lago', 3018: 'Spa Cerrado', 3020: 'Clínica Sem Dono',
  };
  inserir('CLIENTES', ['ID', 'RAZAO_SOCIAL', 'NOME_FANTASIA', 'CNPJ', 'ENDERECO', 'CIDADE', 'UF', 'SEGMENTO', 'STATUS', 'CRIADO_EM', 'WINTHOR_CODCLI'],
    Object.entries(nomes).map(([id, nome]) => [Number(id), `${nome.toUpperCase()} LTDA`, nome, `30.${id}.000/0001-${String(Number(id) % 100).padStart(2, '0')}`,
      `Quadra ${id}, Centro`, 'Palmas', 'TO', 'Estética', 'ATIVO', EM, Number(id)]));
  const dono = (id) => (id <= 3010 ? ANA : id <= 3015 ? BRUNO : CARLA);
  inserir('EQUIPE_CLIENTE', ['ID_CLIENTE', 'ID_VENDEDOR', 'CRIADO_EM', 'CODFILIAL', 'ID_SECAO'],
    Object.keys(nomes).map(Number).filter((id) => id !== CLIENTE.FORA).map((id) => [id, dono(id), EM, '6', null]));

  inserir('PROSPECTS', ['ID', 'RAZAO_SOCIAL', 'NOME_FANTASIA', 'CIDADE', 'UF', 'STATUS_PIPELINE', 'RESPONSAVEL_ID', 'CRIADO_EM', 'ATUALIZADO_EM'], [
    [PROSPECT.ATIVO, 'CLINICA NOVA ERA LTDA', 'Clínica Nova Era', 'Palmas', 'TO', 'VISITA_AGENDADA', ANA, EM, EM],
    [PROSPECT.NOVO, 'ESTETICA PRIME LTDA', 'Estética Prime', 'Palmas', 'TO', 'NOVO', ANA, EM, EM],
    [PROSPECT.CONVERTIDO, 'SPA JA CLIENTE LTDA', 'Spa Já Cliente', 'Palmas', 'TO', 'CONVERTIDO', ANA, EM, EM],
    [PROSPECT.PERDIDO, 'CLINICA DESISTIU LTDA', 'Clínica Desistiu', 'Palmas', 'TO', 'PERDIDO', ANA, EM, EM],
  ]);

  // Semana de 02 a 08/11/2026 para a tela.
  inserir('VISITAS', ['ID', 'CLIENTE_ID', 'VENDEDOR_ID', 'DATA_AGENDADA', 'HORA_INICIO', 'HORA_FIM', 'TIPO', 'STATUS', 'CHECKIN_HORA', 'CHECKOUT_HORA', 'RELATO', 'PLANEJAMENTO', 'CRIADO_EM'], [
    [3001, 3002, ANA, '2026-11-02', '09:00', '10:00', 'Aumento de mix', 'CONCLUIDA', '2026-11-02 09:04:00', '2026-11-02 09:55:00', 'Cliente aprovou 3 itens novos.', 'Apresentar a linha de dermocosméticos.', EM],
    [3002, 3003, ANA, '2026-11-03', '10:00', '11:00', 'Positivação', 'AGENDADA', null, null, null, 'Levar amostras.', EM],
    [3003, 3001, ANA, '2026-11-05', '09:00', '10:00', 'Aumento de mix', 'AGENDADA', null, null, null, 'Levar catálogo.', EM],
    [3004, 3004, ANA, '2026-11-04', '15:00', '16:00', 'Financeiro', 'CANCELADA', null, null, 'Cancelamento em 30/10/2026 10:00:\nCliente fechado na data.', null, EM],
    [3005, 3011, BRUNO, '2026-11-03', '09:00', '10:00', 'Manutenção', 'EM_ANDAMENTO', '2026-11-03 09:02:00', null, null, 'Revisar pedido do mês.', EM],
    [3006, 3016, CARLA, '2026-11-04', '10:00', '11:00', 'Gerar demanda', 'AGENDADA', null, null, null, null, EM],
  ]);
  inserir('PROSPECT_VISITAS', ['ID', 'PROSPECT_ID', 'EXECUTIVO_ID', 'DATA_VISITA', 'HORA_INICIO', 'HORA_FIM', 'OBJETIVO', 'STATUS', 'CRIADO_EM', 'ATUALIZADO_EM'], [
    [3001, PROSPECT.ATIVO, ANA, '2026-11-04', '09:00', '10:00', 'Apresentação comercial — Conhecer a operação e o volume mensal.', 'AGENDADA', EM, EM],
  ]);
  inserir('AGENDA_INTERNA', ['ID', 'TITULO', 'DESCRICAO', 'DATA_AGENDADA', 'HORA_INICIO', 'HORA_FIM', 'TIPO', 'ORIGEM_DESLOCAMENTO', 'DESTINO_DESLOCAMENTO', 'STATUS', 'CRIADOR_ID', 'CRIADO_EM', 'ATUALIZADO_EM'], [
    [3001, 'Alinhamento de mix', 'Pauta: lançamentos de novembro.', '2026-11-06', '14:00', '15:00', 'Reunião interna', null, null, 'AGENDADA', ANA, EM, EM],
    [3002, 'Palmas → Gurupi', null, '2026-11-09', '07:00', '09:00', 'Deslocamento', 'Palmas', 'Gurupi', 'AGENDADA', ANA, EM, EM],
    [3003, 'Reunião de equipe', null, '2026-11-03', '08:00', '08:45', 'Reunião interna', null, null, 'AGENDADA', CARLOS, EM, EM],
  ]);
  inserir('AGENDA_INTERNA_PARTICIPANTES', ['AGENDA_ID', 'VENDEDOR_ID', 'CRIADO_EM'], [
    [3001, BRUNO, EM], [3001, CARLA, EM], [3002, BRUNO, EM], [3003, ANA, EM], [3003, BRUNO, EM],
  ]);
}
