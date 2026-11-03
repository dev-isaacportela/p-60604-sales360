// Dados da spec 008 (alertas, prospeccao, prospects, direcionamento): tabela
// "Simulador" de docs/specs/008-alertas-prospeccao/plan.md. Ids 8001+.
// Tudo na filial 4 (Anapolis), que nenhuma outra spec usa, com usuarios
// proprios: nao mexe no que o smoke das outras specs conta.
// Datas em torno de 30/10/2026 (o smoke fixa o relogio e passa `hoje`).

export const EMAIL = {
  ALICE: 'alice.prado@benenutri.local',
  BENTO: 'bento.alves@benenutri.local',
  CELSO: 'celso.dias@benenutri.local',
  DORA: 'dora.freitas@benenutri.local',
};

export const CLIENTE = {
  X: 8001, Y: 8002, Z: 8003, Q: 8004, ACAI: 8006, K: 8010, L: 8011, M: 8012, W: 8013,
  V: 8014, U: 8015, T: 8016, R: 8017, PERDIDO: 8020, B1: 8030, LAR_SOL_ERP: 8040,
};

export const PROSPECT = { CLINICA_NOVA: 8101, LAR_SOL: 8102, PERDIDO: 8103, HORIZONTE: 8104 };

export const PRODUTO = { P: 8901, DIETA: 8902, ESPESSANTE: 8903, SERINGA: 8904 };

const RAMO = 'CLINICAS E HOSPITAIS';

export function semear({ inserir, usuario }) {
  const ALICE = usuario('Alice Prado', EMAIL.ALICE);
  const BENTO = usuario('Bento Alves', EMAIL.BENTO);
  const CELSO = usuario('Celso Dias', EMAIL.CELSO);
  const DORA = usuario('Dora Freitas', EMAIL.DORA);

  inserir('USUARIO_PAPEL', ['USER_ID', 'PAPEL', 'ATRIBUIDO_EM'], [
    [CELSO, 'COORDENADOR', '2026-10-01 08:00:00'],
    [DORA, 'COORDENADOR', '2026-10-01 08:00:00'],
  ]);
  inserir('COORDENADORES', ['COD_SUPERVISOR', 'NOME', 'EMAIL', 'USER_ID', 'ATIVO'], [
    [8001, 'Celso Dias', EMAIL.CELSO, CELSO, 1],
    [8002, 'Dora Freitas', EMAIL.DORA, DORA, 1],
  ]);
  // Celso: F4 Nutricao e Medicamento. Dora: F2 Nutricao (RN-009, o smoke da a Alice esse escopo).
  inserir('COORDENADORES_BU', ['COD_SUPERVISOR', 'CODFILIAL', 'CODEPTO'], [[8001, 4, 1], [8001, 4, 8], [8002, 2, 1]]);
  inserir('VENDEDOR_RCA', ['USER_ID', 'COD_RCA', 'COD_SUPERVISOR'], [[ALICE, 8001, 8001], [BENTO, 8002, 8001]]);
  inserir('BU_VENDEDOR', ['BU_CODIGO', 'VENDEDOR_ID', 'ATIVO', 'CODFILIAL', 'ID_SECAO', 'CRIADO_EM'], [
    ['1', ALICE, 1, '4', null, '2026-10-01 08:00:00'],
    ['8', ALICE, 1, '4', null, '2026-10-01 08:00:00'],
    ['1', BENTO, 1, '4', null, '2026-10-01 08:00:00'],
  ]);
  // C-014: Bento substitui Alice de 01/11 a 15/11.
  inserir('FERIAS_VENDEDOR', ['COD_RCA', 'RCA', 'DT_INICIO', 'DT_FIM', 'COD_RCA_SUBSTITUTO', 'RCA_SUBSTITUTO', 'ATIVO'], [
    [8001, 'Alice Prado', '2026-11-01', '2026-11-15', 8002, 'Bento Alves', 1],
  ]);

  const clientes = [
    [CLIENTE.X, 'DISTRIBUIDORA XAVIER LTDA', 'Xavier Nutrição', '11.111.111/0001-11', 'Anápolis'],
    [CLIENTE.Y, 'CLINICA YARA LTDA', 'Clínica Yara', '22.222.222/0001-22', 'Anápolis'],
    [CLIENTE.Z, 'FARMACIA ZELIA ME', 'Farmácia Zélia', '33.333.333/0001-33', 'Goiânia'],
    [CLIENTE.Q, 'HOSPITAL QUATRO S/A', 'Hospital Quatro', '44.444.444/0001-44', 'Anápolis'],
    [CLIENTE.ACAI, 'AÇAÍ LTDA', 'Açaí Saudável', '12.345.678/0001-90', 'Anápolis'],
    [CLIENTE.K, 'CASA DE REPOUSO KAIROS', 'Kairós', '55.555.555/0001-55', 'Anápolis'],
    [CLIENTE.L, 'LAR LUZ DO SOL', 'Lar Luz', '66.666.666/0001-66', 'Goiânia'],
    [CLIENTE.M, 'MEDICAL CENTER MORAIS', 'Medical Morais', '77.777.777/0001-77', 'Anápolis'],
    [CLIENTE.W, 'HOSPITAL WANDERLEY', 'Hospital Wanderley', '88.888.888/0001-88', 'Anápolis'],
    [CLIENTE.V, 'CLINICA VIDA', 'Clínica Vida', '99.999.999/0001-99', 'Pirenópolis'],
    [CLIENTE.U, 'UNIDADE SAUDE URUANA', 'Saúde Uruana', '10.101.010/0001-10', 'Uruana'],
    [CLIENTE.T, 'TERAPIA TOTAL LTDA', 'Terapia Total', '20.202.020/0001-20', 'Anápolis'],
    [CLIENTE.R, 'REDE RENASCER', 'Renascer', '30.303.030/0001-30', 'Anápolis'],
    [CLIENTE.PERDIDO, 'MERCADO PERDIDO LTDA', 'Mercado Perdido', '40.404.040/0001-40', 'Anápolis'],
    [CLIENTE.B1, 'BOTICA BENTO', 'Botica Bento', '50.505.050/0001-50', 'Anápolis'],
    [CLIENTE.LAR_SOL_ERP, 'LAR SOL LTDA', 'Lar Sol', '60.606.060/0001-60', 'Anápolis'],
  ];
  inserir('CLIENTES', ['ID', 'WINTHOR_CODCLI', 'RAZAO_SOCIAL', 'NOME_FANTASIA', 'CNPJ', 'CIDADE', 'UF', 'STATUS'],
    clientes.map(([id, razao, fantasia, cnpj, cidade]) => [id, id, razao, fantasia, cnpj, cidade, 'GO', 'ATIVO']));
  inserir('IMP_CLIENTES_TOTVS', ['CODCLI', 'CLIENTE', 'RAMO', 'UF', 'CIDADE'],
    clientes.map(([id, razao, , , cidade]) => [id, razao, RAMO, 'GO', cidade]));

  const daAlice = Object.values(CLIENTE).filter((id) => ![CLIENTE.B1, CLIENTE.LAR_SOL_ERP].includes(id));
  inserir('EQUIPE_CLIENTE', ['ID_CLIENTE', 'ID_VENDEDOR', 'CODFILIAL', 'ID_SECAO', 'CURVA_CLASSIFICACAO', 'CRIADO_EM'], [
    ...daAlice.map((id) => [id, ALICE, '4', null, id === CLIENTE.W ? 'A' : null, '2026-10-01 08:00:00']),
    [CLIENTE.B1, BENTO, '4', null, null, '2026-10-01 08:00:00'],
  ]);

  // Vendas (bruto). [cliente, dia, valor, depto, produto]
  let pedido = 8000;
  const vendas = [
    // C-013: K, ciclo 20 (03/08 a 02/10, 4 compras), 2 compras na semana 4 do mes.
    ...['2026-08-03', '2026-08-21', '2026-09-18', '2026-10-02'].map((d) => [CLIENTE.K, d, 1500, '1', PRODUTO.DIETA]),
    // C-013: L, ultima compra em 12/07 (100 dias antes de 20/10).
    [CLIENTE.L, '2026-05-10', 900, '1', PRODUTO.DIETA], [CLIENTE.L, '2026-07-12', 900, '1', PRODUTO.DIETA],
    // C-014: M so compra em Medicamento.
    [CLIENTE.M, '2026-09-10', 700, '8', PRODUTO.SERINGA], [CLIENTE.M, '2026-10-01', 700, '8', PRODUTO.SERINGA],
    // C-019: W (curva A), 01/09, 21/09, 11/10.
    ...['2026-09-01', '2026-09-21', '2026-10-11'].map((d) => [CLIENTE.W, d, 8000, '1', PRODUTO.DIETA]),
    // C-002: produto P comprado em mar, mai e jun.
    [CLIENTE.PERDIDO, '2026-03-10', 900, '1', PRODUTO.P], [CLIENTE.PERDIDO, '2026-05-12', 600, '1', PRODUTO.P],
    [CLIENTE.PERDIDO, '2026-06-15', 300, '1', PRODUTO.P], [CLIENTE.PERDIDO, '2026-10-05', 400, '1', PRODUTO.DIETA],
    // Tela: compras recentes do resto da carteira.
    [CLIENTE.X, '2026-10-10', 2000, '1', PRODUTO.DIETA], [CLIENTE.Y, '2026-10-14', 1200, '1', PRODUTO.ESPESSANTE],
    [CLIENTE.Z, '2026-09-25', 800, '1', PRODUTO.DIETA], [CLIENTE.Q, '2026-10-20', 3000, '8', PRODUTO.SERINGA],
    [CLIENTE.ACAI, '2026-10-08', 500, '1', PRODUTO.ESPESSANTE], [CLIENTE.B1, '2026-10-15', 1000, '1', PRODUTO.DIETA],
  ];
  const nomes = { [PRODUTO.P]: 'SUPLEMENTO P 400G', [PRODUTO.DIETA]: 'DIETA ENTERAL 1L', [PRODUTO.ESPESSANTE]: 'ESPESSANTE 125G', [PRODUTO.SERINGA]: 'SERINGA 10ML' };
  inserir('IMP_VENDAS_DASHBOARD_TOTVS_RCA', ['NUMPED', 'DTSAIDA', 'CODFILIAL', 'CODPROD', 'DESCRICAO', 'CODCLI', 'CLIENTE', 'CODEPTO', 'CODSEC', 'QT', 'VLUNIT', 'TOTAL'],
    vendas.map(([cli, d, valor, depto, prod]) => [String((pedido += 1)), d, '4', prod, nomes[prod], cli, `Cliente ${cli}`, depto, depto === '1' ? '101' : '801', 1, valor, valor]));

  // C-001/C-004/C-007: 12 alertas de Alice, 8 nao lidos (5 Nutricao, 3 Medicamento), 4 lidos; Y com 3 nao lidos.
  const prod = (p) => `${p} - ${nomes[p]}`;
  const alerta = (cli, depto, tipo, titulo, valor, prioridade, lido, produto = null) =>
    [ALICE, 4, null, cli, clientes.find((c) => c[0] === cli)[2], tipo, titulo, 'Gerado pela rotina diária.', valor, prioridade, lido,
      '2026-10-20 06:10:00', lido ? '2026-10-21 09:00:00' : null, '2026-10', produto, depto, RAMO];
  inserir('ALERTAS_INTELIGENTES', ['ID_VENDEDOR', 'CODFILIAL', 'ID_SECAO', 'ID_CLIENTE', 'NOME_CLIENTE', 'TIPO_ALERTA', 'TITULO', 'DESCRICAO',
    'VALOR_REFERENCIA', 'PRIORIDADE', 'LIDO', 'DATA_GERACAO', 'DATA_LEITURA', 'MES_REFERENCIA', 'PRODUTO_REFERENCIA', 'CODEPTO', 'RAMO_CLIENTE'], [
    alerta(CLIENTE.X, '1', 'PRODUTO_PERDIDO', `Cliente parou de comprar ${prod(PRODUTO.P)}`, 600, 'ALTA', 0, prod(PRODUTO.P)),
    alerta(CLIENTE.X, '1', 'REPOSICAO', `Reposição prevista: ${prod(PRODUTO.DIETA)}`, 0, 'MEDIA', 0, prod(PRODUTO.DIETA)),
    alerta(CLIENTE.Y, '1', 'NAO_EXPLORADO', `Produto não explorado: ${prod(PRODUTO.ESPESSANTE)}`, 200, 'BAIXA', 0, prod(PRODUTO.ESPESSANTE)),
    alerta(CLIENTE.Y, '1', 'VOLUME_CRESCENTE', 'Volume de compras em alta', 13000, 'MEDIA', 0),
    alerta(CLIENTE.Y, '8', 'PRODUTO_PERDIDO', `Cliente parou de comprar ${prod(PRODUTO.SERINGA)}`, 450, 'ALTA', 0, prod(PRODUTO.SERINGA)),
    alerta(CLIENTE.Z, '1', 'SAZONALIDADE', `Época de compra: ${prod(PRODUTO.DIETA)}`, 800, 'ALTA', 0, prod(PRODUTO.DIETA)),
    alerta(CLIENTE.Q, '8', 'PEDIDO_INCOMPLETO', 'Pedido 8123 abaixo do habitual', 400, 'MEDIA', 0),
    alerta(CLIENTE.Q, '8', 'NAO_EXPLORADO', `Produto não explorado: ${prod(PRODUTO.SERINGA)}`, 150, 'BAIXA', 0, prod(PRODUTO.SERINGA)),
    alerta(CLIENTE.X, '1', 'PRODUTO_PERDIDO', `Cliente parou de comprar ${prod(PRODUTO.ESPESSANTE)}`, 300, 'ALTA', 1, prod(PRODUTO.ESPESSANTE)),
    alerta(CLIENTE.X, '1', 'REPOSICAO', `Reposição prevista: ${prod(PRODUTO.ESPESSANTE)}`, 0, 'MEDIA', 1, prod(PRODUTO.ESPESSANTE)),
    alerta(CLIENTE.Z, '1', 'VOLUME_CRESCENTE', 'Volume de compras em alta', 9000, 'MEDIA', 1),
    alerta(CLIENTE.Q, '8', 'SAZONALIDADE', `Época de compra: ${prod(PRODUTO.SERINGA)}`, 500, 'ALTA', 1, prod(PRODUTO.SERINGA)),
  ]);

  // C-018: 11 compromissos de Alice na semana de 26/10 (8 concluidos, 2 reagendados,
  // 1 agendado vencido em 27/10, 1 agendado em 30/10, 1 cancelado).
  const reagendado = 'Reagendamento em 20/10/2026 09:00:\nCliente pediu outro dia.\n\nVisita feita, pedido encaminhado.';
  const visita = (cli, d, status, relato, ini = '09:00', fim = '10:00') => [cli, ALICE, d, ini, fim, 'Positivação', status, relato, '2026-10-19 08:00:00'];
  inserir('VISITAS', ['CLIENTE_ID', 'VENDEDOR_ID', 'DATA_AGENDADA', 'HORA_INICIO', 'HORA_FIM', 'TIPO', 'STATUS', 'RELATO', 'CRIADO_EM'], [
    visita(CLIENTE.X, '2026-10-26', 'CONCLUIDA', reagendado),
    visita(CLIENTE.Y, '2026-10-26', 'CONCLUIDA', 'Visita feita.', '11:00', '12:00'),
    visita(CLIENTE.Z, '2026-10-27', 'CONCLUIDA', reagendado),
    visita(CLIENTE.Q, '2026-10-27', 'CONCLUIDA', 'Visita feita.', '14:00', '15:00'),
    visita(CLIENTE.M, '2026-10-27', 'AGENDADA', null, '16:00', '17:00'),
    visita(CLIENTE.ACAI, '2026-10-28', 'CONCLUIDA', 'Visita feita.'),
    visita(CLIENTE.K, '2026-10-28', 'CONCLUIDA', 'Visita feita.', '11:00', '12:00'),
    visita(CLIENTE.W, '2026-10-29', 'CONCLUIDA', 'Visita feita.'),
    visita(CLIENTE.PERDIDO, '2026-10-29', 'CANCELADA', 'Cancelada: cliente fechado.', '14:00', '15:00'),
    // C-020: V concluida em 15/09; T so com check-in em 20/10; R concluida em 10/10; U nunca.
    visita(CLIENTE.V, '2026-09-15', 'CONCLUIDA', 'Visita feita.'),
    visita(CLIENTE.T, '2026-10-20', 'EM_ANDAMENTO', null),
    visita(CLIENTE.R, '2026-10-10', 'CONCLUIDA', 'Visita feita.'),
  ]);

  inserir('PROSPECTS', ['ID', 'RAZAO_SOCIAL', 'NOME_FANTASIA', 'SEGMENTO', 'CIDADE', 'UF', 'STATUS_PIPELINE', 'POTENCIAL', 'PROBABILIDADE', 'RESPONSAVEL_ID', 'CRIADO_EM', 'ATUALIZADO_EM'], [
    [PROSPECT.CLINICA_NOVA, 'CLINICA NOVA LTDA', 'Clínica Nova', 'Clínica', 'Anápolis', 'GO', 'NEGOCIACAO', 1500.5, 40, ALICE, '2026-10-01 10:00:00', '2026-10-20 10:00:00'],
    [PROSPECT.LAR_SOL, 'LAR SOL LTDA', 'Lar Sol', 'Casa de repouso', 'Anápolis', 'GO', 'NOVO', 3000, 10, ALICE, '2026-10-05 10:00:00', '2026-10-05 10:00:00'],
    [PROSPECT.PERDIDO, 'HOSPITAL ESPERANCA', 'Hospital Esperança', 'Hospital', 'Goiânia', 'GO', 'PERDIDO', 8000, 0, ALICE, '2026-09-01 10:00:00', '2026-10-02 10:00:00'],
    [PROSPECT.HORIZONTE, 'CLINICA HORIZONTE', 'Clínica Horizonte', 'Clínica', 'Anápolis', 'GO', 'VISITADO', 2000, 30, ALICE, '2026-10-10 10:00:00', '2026-10-28 10:00:00'],
  ]);
  inserir('PROSPECT_CONTATOS', ['PROSPECT_ID', 'NOME', 'CARGO', 'TELEFONE', 'EMAIL', 'PRINCIPAL', 'CRIADO_EM'], [
    [PROSPECT.CLINICA_NOVA, 'Maria Lima', 'Compras', '(62) 3333-0001', 'maria@clinicanova.local', 1, '2026-10-01 10:00:00'],
    [PROSPECT.LAR_SOL, 'João Reis', 'Administrador', '(62) 3333-0002', null, 1, '2026-10-05 10:00:00'],
  ]);
  inserir('PROSPECT_VISITAS', ['PROSPECT_ID', 'EXECUTIVO_ID', 'DATA_VISITA', 'HORA_INICIO', 'HORA_FIM', 'OBJETIVO', 'STATUS', 'RESUMO', 'OBJECOES', 'PROXIMO_PASSO', 'DATA_PROXIMO_PASSO', 'CRIADO_EM', 'ATUALIZADO_EM'], [
    [PROSPECT.HORIZONTE, ALICE, '2026-10-28', '15:00', '16:00', 'Apresentação comercial', 'CONCLUIDA', 'Apresentação feita ao diretor.', 'Preço', 'Enviar proposta', '2026-11-04', '2026-10-20 08:00:00', '2026-10-28 16:00:00'],
    [PROSPECT.HORIZONTE, ALICE, '2026-10-30', '15:00', '16:00', 'Follow-up de prospecção', 'AGENDADA', null, null, null, null, '2026-10-28 16:00:00', '2026-10-28 16:00:00'],
  ]);

  // Fila do dia ja processada (estado de producao; a rotina so roda no sandbox).
  inserir('ALERTAS_PROCESSAMENTO', ['RUN_ID', 'VENDEDOR_ID', 'STATUS', 'CRIADO_EM', 'INICIADO_EM', 'FINALIZADO_EM', 'DURACAO_MS', 'TOTAL_ALERTAS_ATIVOS'], [
    ['ALERTAS-2026-10-30', ALICE, 'CONCLUIDO', '2026-10-30 06:00:00', '2026-10-30 06:00:00', '2026-10-30 06:00:02', 2100, 0],
    ['ALERTAS-2026-10-30', BENTO, 'CONCLUIDO', '2026-10-30 06:00:00', '2026-10-30 06:00:02', '2026-10-30 06:00:03', 900, 0],
  ]);
}
