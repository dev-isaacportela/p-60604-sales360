// Dados da spec 004 (atividades): tabela "Simulador" de
// docs/specs/004-tarefas/plan.md. Hoje = 30/10/2026.
//
// Usuarios proprios (ctx.usuario): nada nos 11 usuarios-base, para nao mexer
// nas contagens da 001 e da 002. Escopo na filial 6 com a BU 14, que nenhuma
// outra spec usa. Ids escolhidos na faixa 4001+.

export const HOJE = '2026-10-30';
export const EMAIL = {
  AMANDA: 'amanda.reis@benenutri.local',
  BIA: 'bia.lopes@benenutri.local',
  ELISA: 'elisa.prado@benenutri.local',
  BRENO: 'breno.costa@benenutri.local',
  CAIO: 'caio.mendes@benenutri.local',
};
export const CLIENTE = { HOSPITAL: 4471, BOA_VIDA: 4002, FORA: 4090 };
export const ATIVIDADE_BRENO = 4812;

const EM = '2026-10-01 08:00:00';

export function semear({ inserir, usuario }) {
  const AMANDA = usuario('Amanda Reis', EMAIL.AMANDA);
  const BIA = usuario('Bia Lopes', EMAIL.BIA);
  const ELISA = usuario('Elisa Prado', EMAIL.ELISA);
  const BRENO = usuario('Breno Costa', EMAIL.BRENO);
  const CAIO = usuario('Caio Mendes', EMAIL.CAIO);
  const vendedores = [AMANDA, BIA, ELISA, BRENO];

  /* ── escopo: filial 6 · BU 14 (todas as secoes), coordenador Caio ── */
  inserir('BU', ['CODIGO', 'NOME', 'ATIVO'], [['14', 'Oftalmologia', 1]]);
  inserir('USUARIO_PAPEL', ['USER_ID', 'PAPEL', 'ATRIBUIDO_EM'], [
    ...vendedores.map((id) => [id, 'VENDEDOR', EM]),
    [CAIO, 'COORDENADOR', EM],
  ]);
  inserir('COORDENADORES', ['COD_SUPERVISOR', 'NOME', 'EMAIL', 'USER_ID', 'ATIVO'], [[4001, 'Caio Mendes', EMAIL.CAIO, CAIO, 1]]);
  inserir('COORDENADORES_BU', ['COD_SUPERVISOR', 'CODFILIAL', 'CODEPTO'], [[4001, 6, 14]]);
  inserir('VENDEDOR_RCA', ['USER_ID', 'COD_RCA', 'COD_SUPERVISOR'], vendedores.map((id, i) => [id, 4001 + i, 4001]));
  inserir('BU_VENDEDOR', ['BU_CODIGO', 'VENDEDOR_ID', 'ATIVO', 'CODFILIAL', 'ID_SECAO', 'CRIADO_EM'],
    vendedores.map((id) => ['14', id, 1, '6', null, EM]));

  /* ── clientes: carteira de Amanda + um fora de toda carteira ── */
  const clientes = [
    [CLIENTE.HOSPITAL, 'HOSPITAL SÃO LUCAS LTDA', null, '45.678.901/0001-23', 'Palmas', 'TO'],
    [CLIENTE.BOA_VIDA, 'CLINICA BOA VIDA LTDA', 'CLÍNICA BOA VIDA', '45.678.902/0001-04', 'Palmas', 'TO'],
    [4003, 'OTICA VISAO CLARA LTDA', 'ÓTICA VISÃO CLARA', null, 'Palmas', 'TO'],
    [4004, 'CENTRO DE OLHOS DO NORTE LTDA', 'CENTRO DE OLHOS DO NORTE', null, 'Araguaína', 'TO'],
    [4005, 'HOSPITAL DE OLHOS PALMAS LTDA', null, null, 'Palmas', 'TO'],
    [4006, 'CLINICA LUZ LTDA', 'CLÍNICA LUZ', null, 'Gurupi', 'TO'],
    [4007, 'FARMACIA DO CERRADO LTDA', 'FARMÁCIA DO CERRADO', null, 'Palmas', 'TO'],
    [4008, 'LABORATORIO TOCANTINS LTDA', null, null, 'Porto Nacional', 'TO'],
    [CLIENTE.FORA, 'HOSPITAL DISTANTE LTDA', null, null, 'Belém', 'PA'],
  ];
  inserir('CLIENTES', ['ID', 'RAZAO_SOCIAL', 'NOME_FANTASIA', 'CNPJ', 'ENDERECO', 'CIDADE', 'UF', 'SEGMENTO', 'STATUS', 'TELEFONE', 'EMAIL', 'CRIADO_EM', 'WINTHOR_CODCLI'],
    clientes.map(([id, razao, fantasia, cnpj, cidade, uf]) => [id, razao, fantasia, cnpj, `Rua ${id}, Centro`, cidade, uf, 'Saúde', 'ATIVO', '(63) 3000-0000', `contato${id}@cliente.local`, EM, id]));
  inserir('IMP_CLIENTES_TOTVS', ['CODCLI', 'CLIENTE', 'RAMO', 'UF', 'CIDADE'],
    clientes.map(([id, razao, , , cidade, uf]) => [id, razao, 'HOSPITALAR', uf, cidade]));
  inserir('EQUIPE_CLIENTE', ['ID_CLIENTE', 'ID_VENDEDOR', 'CODFILIAL', 'ID_SECAO', 'CURVA_CLASSIFICACAO', 'CRIADO_EM'],
    clientes.filter(([id]) => id !== CLIENTE.FORA).map(([id]) => [id, AMANDA, '6', null, null, EM]));

  /* ── atividades ── */
  const T = ['VENDEDOR_ID', 'TITULO', 'DESCRICAO', 'STATUS', 'PRIORIDADE', 'DATA_LIMITE', 'CRIADO_EM', 'CLIENTE_ID', 'CONCLUIDO_EM'];
  const concluidas = (dono, n, prefixo) => Array.from({ length: n }, (_, i) => {
    const dia = String(1 + (i % 28)).padStart(2, '0');
    return [dono, `${prefixo} ${i + 1}`, null, 'CONCLUIDA', 'MEDIA', `2026-10-${dia}`, '2026-09-20 08:00:00', null, `2026-10-${dia} ${String(8 + (i % 10)).padStart(2, '0')}:00:00`];
  });

  // Amanda: contador 3 (RN-011), C-001, C-003, C-006, C-007, C-008.
  inserir('TAREFAS', T, [
    [AMANDA, 'Ligar para compras', 'Confirmar o pedido de colírios.', 'PENDENTE', 'ALTA', '2026-11-04', '2026-10-27 09:00:00', CLIENTE.HOSPITAL, null],
    [AMANDA, 'Retornar orçamento', 'Orçamento de lentes intraoculares.', 'PENDENTE', 'MEDIA', '2026-11-05', '2026-10-28 10:00:00', CLIENTE.BOA_VIDA, null],
    [AMANDA, 'Negociar prazo de pagamento', null, 'EM_ANDAMENTO', 'BAIXA', '2026-11-06', '2026-10-26 15:00:00', 4003, null],
    ...concluidas(AMANDA, 5, 'Follow-up de visita'),
  ]);

  // Bia: C-005 (ordem das abertas e 25 concluidas).
  inserir('TAREFAS', T, [
    [BIA, 'Cobrar retorno da cotação', null, 'EM_ANDAMENTO', 'MEDIA', '2026-11-02', '2026-10-20 08:00:00', null, null],
    [BIA, 'Enviar catálogo novo', null, 'EM_ANDAMENTO', 'ALTA', '2026-11-01', '2026-10-21 08:00:00', null, null],
    [BIA, 'Apresentar proposta', null, 'PENDENTE', 'MEDIA', '2026-11-04', '2026-10-22 08:00:00', null, null],
    [BIA, 'Atividade antiga sem prazo', null, 'PENDENTE', 'BAIXA', null, '2025-06-01 08:00:00', null, null],
    ...concluidas(BIA, 25, 'Concluída'),
  ]);

  // Elisa: C-011 (12 atividades, 3 com prazo 05/11, 5 Alta).
  inserir('TAREFAS', T, Array.from({ length: 12 }, (_, i) => [
    ELISA, `Atividade ${i + 1}`, null, i % 2 ? 'EM_ANDAMENTO' : 'PENDENTE',
    i >= 3 && i < 8 ? 'ALTA' : i < 3 ? 'MEDIA' : 'BAIXA',
    i < 3 ? '2026-11-05' : `2026-11-${String(10 + i).padStart(2, '0')}`,
    '2026-10-20 08:00:00', null, null,
  ]));

  // Breno: a atividade 4812 (C-010).
  inserir('TAREFAS', ['ID', ...T], [
    [ATIVIDADE_BRENO, BRENO, 'Visitar oftalmologista parceiro', null, 'PENDENTE', 'MEDIA', '2026-11-07', '2026-10-25 08:00:00', null, null],
  ]);
}
