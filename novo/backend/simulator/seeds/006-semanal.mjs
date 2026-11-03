// Dados da spec 006 (acompanhamento semanal): tabela "Simulador" de
// docs/specs/006-acompanhamento-semanal/plan.md. Ids 6001+, filial 61 propria
// e vendedores proprios (nada nos usuarios 1..11 nem na Filial 1 das outras specs).
// As vendas entram "ja carregadas" no RAW da carga; a fonte do ERP fica vazia
// aqui (o smoke prepara a fonte nos testes da carga).

export const CLIENTE = {
  ALFA: 6001, BETA: 6002, GAMA: 6003, DELTA: 6004, EPSILON: 6005, ZETA: 6006, ETA: 6007,
  KAPPA: 6008, MEDIO: 6009, CURVA_B: 6010, CURVA_A: 6011, DUPLO: 6012, EQUIPE: 6013,
};
export const PRODUTO = { P1: 61001, P2: 61002, P3: 61003 };
export const FILIAL = '61';
export const SECAO = { A: 6101, B: 6102 };

export function semear({ inserir, usuario }) {
  const ALICE = usuario('Alice Moura', 'alice.moura@benenutri.local');
  const BERNARDO = usuario('Bernardo Reis', 'bernardo.reis@benenutri.local');
  const CECILIA = usuario('Cecília Paz', 'cecilia.paz@benenutri.local');

  inserir('FILIAL', ['CODFILIAL', 'NOME_FILIAL', 'UF', 'ATIVO'], [[FILIAL, 'Filial 61 · Brasília Sul', 'DF', 1]]);
  inserir('SECAO', ['ID', 'NOME_SECAO', 'ID_BU', 'ATIVO'], [[SECAO.A, 'Nutrição clínica', 1, 1], [SECAO.B, 'Nutrição esportiva', 1, 1]]);

  inserir('USUARIO_PAPEL', ['USER_ID', 'PAPEL', 'ATRIBUIDO_EM'], [[CECILIA, 'COORDENADOR', '2026-09-01 08:00:00']]);
  inserir('COORDENADORES', ['COD_SUPERVISOR', 'NOME', 'EMAIL', 'USER_ID', 'ATIVO'], [[6001, 'Cecília Paz', 'cecilia.paz@benenutri.local', CECILIA, 1]]);
  inserir('COORDENADORES_BU', ['COD_SUPERVISOR', 'CODFILIAL', 'CODEPTO'], [[6001, 61, 1]]);
  inserir('VENDEDOR_RCA', ['USER_ID', 'COD_RCA', 'COD_SUPERVISOR'], [[ALICE, 6001, 6001], [BERNARDO, 6002, 6001]]);

  // Alice: F61·Nutricao sem secao e F61·Nutricao secao 6101 (RN-002 escopo duplo).
  // Bernardo: so a secao 6102 (a venda de 6101 nunca e dele).
  inserir('BU_VENDEDOR', ['BU_CODIGO', 'VENDEDOR_ID', 'ATIVO', 'CODFILIAL', 'ID_SECAO', 'CRIADO_EM'], [
    ['1', ALICE, 1, FILIAL, null, '2026-08-01 08:00:00'],
    ['1', ALICE, 1, FILIAL, SECAO.A, '2026-08-01 08:00:00'],
    ['1', BERNARDO, 1, FILIAL, SECAO.B, '2026-08-01 08:00:00'],
  ]);
  // C-007: Alice de ferias de 01/10 a 15/10, Bernardo substituto.
  inserir('FERIAS_VENDEDOR', ['COD_RCA', 'RCA', 'DT_INICIO', 'DT_FIM', 'COD_RCA_SUBSTITUTO', 'RCA_SUBSTITUTO', 'ATIVO'], [
    [6001, 'Alice Moura', '2026-10-01', '2026-10-15', 6002, 'Bernardo Reis', 1],
  ]);

  /* ── carteira de Alice: 40 clientes, 12 sem venda em set e out (C-002) ── */
  const nomes = {
    [CLIENTE.ALFA]: 'ALFA NUTRIÇÃO', [CLIENTE.BETA]: 'BETA HOSPITALAR', [CLIENTE.GAMA]: 'GAMA CLÍNICA',
    [CLIENTE.DELTA]: 'DELTA SAÚDE', [CLIENTE.EPSILON]: 'ÉPSILON CUIDADOS', [CLIENTE.ZETA]: 'ZETA HOME CARE',
    [CLIENTE.ETA]: 'ETA FARMA', [CLIENTE.KAPPA]: 'KAPPA NUTRI',
  };
  const ids = Array.from({ length: 40 }, (_, i) => 6001 + i);
  inserir('CLIENTES', ['ID', 'RAZAO_SOCIAL', 'NOME_FANTASIA', 'CIDADE', 'UF', 'SEGMENTO', 'STATUS', 'CRIADO_EM', 'WINTHOR_CODCLI'],
    ids.map((id) => [id, `${nomes[id] ?? `CLIENTE SEMANAL ${id}`} LTDA`, nomes[id] ?? `CLIENTE SEMANAL ${id}`, 'Brasília', 'DF',
      id % 2 ? 'Hospitalar' : 'Clínica', 'ATIVO', '2026-01-10 08:00:00', id]));
  inserir('IMP_CLIENTES_TOTVS', ['CODCLI', 'CLIENTE', 'RAMO', 'UF', 'CIDADE'],
    ids.map((id) => [id, nomes[id] ?? `CLIENTE SEMANAL ${id}`, id % 2 ? 'HOSPITAL PRIVADO' : 'CLINICA MEDICA', 'DF', 'Brasília']));
  inserir('EQUIPE_CLIENTE', ['ID_CLIENTE', 'ID_VENDEDOR', 'CODFILIAL', 'ID_SECAO', 'CURVA_CLASSIFICACAO', 'CRIADO_EM'], [
    ...ids.map((id) => [id, ALICE, FILIAL, SECAO.A, id === CLIENTE.CURVA_B ? 'B' : null, '2026-02-01 08:00:00']),
    [CLIENTE.EQUIPE, BERNARDO, FILIAL, SECAO.B, null, '2026-02-01 08:00:00'],
  ]);
  // RN-010: na secao 6102 o titular do cliente "Equipe" e Bernardo.
  inserir('CLIENTE_TITULAR_DEPTO', ['ID_CLIENTE', 'CODFILIAL', 'CODEPTO', 'ID_SECAO', 'VENDEDOR_ID', 'ORIGEM', 'ATIVO', 'CRIADO_EM', 'ATUALIZADO_EM'], [
    [CLIENTE.EQUIPE, FILIAL, '1', SECAO.B, BERNARDO, 'MANUAL', 1, '2026-08-01 08:00:00', '2026-08-01 08:00:00'],
  ]);

  /* ── vendas ja carregadas (RAW valido e ativo) ── */
  const raw = [];
  let pedido = 0;
  const venda = (cli, data, total, { produto = PRODUTO.P1, qt = 1, secao = SECAO.A, numped = null, depto = '1' } = {}) => {
    const np = numped ?? `6${String(++pedido).padStart(5, '0')}`;
    raw.push([`${np}|${produto}|${FILIAL}`, np, FILIAL, produto, `Produto ${produto}`, cli, depto, secao, secao,
      qt, Math.round((total / qt) * 100) / 100, total, data, cli, 'ATIVO', 1, 'SEED', '2026-10-30 08:00:00', '2026-10-30 08:00:00']);
  };

  // C-001 Alfa: 1.200 na 2a sem de out x 1.000 na 2a sem de set.
  venda(CLIENTE.ALFA, '2026-10-05', 1200);
  venda(CLIENTE.ALFA, '2026-09-08', 1000);
  // C-009 Alfa, 3a sem de out (09-15/10): 2 pedidos (1.500 e 500); set (11-17/09): P1 6 un, P2 4 un.
  venda(CLIENTE.ALFA, '2026-10-10', 1500, { produto: PRODUTO.P1, qt: 10, numped: '650001' });
  venda(CLIENTE.ALFA, '2026-10-10', 500, { produto: PRODUTO.P3, qt: 2, numped: '650002' });
  venda(CLIENTE.ALFA, '2026-09-14', 600, { produto: PRODUTO.P1, qt: 6 });
  venda(CLIENTE.ALFA, '2026-09-14', 400, { produto: PRODUTO.P2, qt: 4 });

  // C-005 (hoje 20/10): 4a sem de set (18-24/09) x 4a de out (16-22/10).
  venda(CLIENTE.BETA, '2026-09-20', 1000); venda(CLIENTE.BETA, '2026-10-19', 900);
  venda(CLIENTE.GAMA, '2026-09-20', 1000); venda(CLIENTE.GAMA, '2026-10-19', 800);
  venda(CLIENTE.DELTA, '2026-09-20', 1000); venda(CLIENTE.DELTA, '2026-10-19', 1300);
  venda(CLIENTE.EPSILON, '2026-10-19', 500);
  // C-018: Beta fecha out com 4.000 contra 5.000 em set, sem compra na 6a sem.
  venda(CLIENTE.BETA, '2026-09-02', 4000); venda(CLIENTE.BETA, '2026-10-06', 3100);

  // C-003 Zeta: 1.000 na 2a sem de set e nada na 2a de out (compra na 5a).
  venda(CLIENTE.ZETA, '2026-09-08', 1000); venda(CLIENTE.ZETA, '2026-10-26', 300);
  // C-004 Eta: 2.000 em 10/10, devolucao de 300 em 12/10 (e uma sem secao, ignorada).
  venda(CLIENTE.ETA, '2026-10-10', 2000);
  // C-007/C-008 Kappa (secao 6102): 900 em 05/10 (ferias de Alice) e 400 em 20/10.
  venda(CLIENTE.KAPPA, '2026-10-05', 900, { secao: SECAO.B });
  venda(CLIENTE.KAPPA, '2026-10-20', 400, { secao: SECAO.B });
  // RN-006: 3.000 e 1.000 em duas semanas de ago-out; 5.000 em outra BU nao conta.
  venda(CLIENTE.MEDIO, '2026-08-07', 3000); venda(CLIENTE.MEDIO, '2026-10-01', 1000);
  venda(CLIENTE.MEDIO, '2026-10-01', 5000, { depto: '8' });
  // RN-009: sem curva e valor medio 15.000 -> A.
  venda(CLIENTE.CURVA_A, '2026-10-01', 15000);
  // RN-002 (escopo duplo): 500 na secao 6101 conta uma vez.
  venda(CLIENTE.DUPLO, '2026-10-01', 500);
  // RN-010: Alice 1.000 (6101) e Bernardo 500 (6102, titular) na 2a sem; set 1.000.
  venda(CLIENTE.EQUIPE, '2026-10-05', 1000);
  venda(CLIENTE.EQUIPE, '2026-10-05', 500, { secao: SECAO.B });
  venda(CLIENTE.EQUIPE, '2026-09-08', 1000);
  // Demais com compra em out (28 no total): 6010 e 6014..6028.
  for (const id of [CLIENTE.CURVA_B, ...Array.from({ length: 15 }, (_, i) => 6014 + i)]) venda(id, '2026-10-01', 1000);

  inserir('PEDIDOS_SEMANAIS_SYNC_RAW', ['CHAVE_NATURAL', 'NUMPED', 'CODFILIAL', 'CODPROD', 'DESCRICAO', 'CODCLI', 'CODEPTO',
    'CODSECAO', 'ID_SECAO', 'QT', 'VLUNIT', 'TOTAL', 'DATA_SAIDA', 'CLIENTE_ID', 'STATUS_INGESTAO', 'ATIVO', 'ULTIMA_EXECUCAO_ID',
    'CRIADO_EM', 'ATUALIZADO_EM'], raw);

  inserir('IMP_DEVOLUCOES_TOTVS', ['NOTA_DEVOLUCAO', 'NUMPED', 'DATA_VENDA', 'DATA_DEVOLUCAO', 'CODFILIAL', 'CODEPTO', 'CODSEC',
    'CODCLI', 'CODPROD', 'DESCRICAO', 'QT_DEVOLVIDA', 'VALOR_DEVOLVIDO'], [
    ['D6001', '600030', '2026-10-10', '2026-10-12', FILIAL, '1', String(SECAO.A), CLIENTE.ETA, PRODUTO.P1, 'Produto 61001', 1, 300],
    ['D6002', '600030', '2026-10-10', '2026-10-12', FILIAL, '1', '', CLIENTE.ETA, PRODUTO.P1, 'Produto 61001', 1, 100],
  ]);

  // RF-010: ultima carga concluida.
  inserir('ACOMP_SEMANAL_SYNC_LOG', ['EXECUCAO_ID', 'STATUS', 'INICIO_EM', 'FIM_EM', 'TOTAL_VALIDOS', 'MENSAGEM', 'CRIADO_EM'], [
    ['SEED20261030', 'SUCCESS', '2026-10-30 08:00:00', '2026-10-30 08:05:00', 39, 'Concluída', '2026-10-30 08:00:00'],
  ]);
}
