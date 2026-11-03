// Dados da spec 007 (Analytics e metas): tabela "Simulador" de
// docs/specs/007-analytics-metas/plan.md. Ids 7001+, filiais 71..78 proprias e
// vendedores proprios (nada nos usuarios 1..11; Gil, id 8, so e usado como
// diretoria em leitura). Hoje dos cenarios = 15/10/2026; metas de nov/2026.

export const CLIENTE = { NOVO1: 7001, NOVO2: 7002, TOP: 7003, X: 7004, RISCO1: 7026, DUMMY: 7099 };
export const PRODUTOS = Array.from({ length: 12 }, (_, i) => 7101 + i);
export const COORD = { CAIO: 7001, DALVA: 7002, ELOI: 7003 };

// Peso do rateio da meta de nov/2026 (liquido de nov/2025 a out/2026), exato.
export const PESOS_NOV = { '71|1': 1000000, '72|1': 2000000, '74|1': 1000000 };

export function semear({ inserir, usuario }) {
  const u = (nome) => usuario(nome, `${nome.split(' ')[0].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()}.${nome.split(' ')[1].toLowerCase()}@benenutri.local`);
  const AMELIA = u('Amélia Torres');
  const BENICIO = u('Benício Alves');
  const [VERA, HUGO, LIA, OTTO] = ['Vera Lins', 'Hugo Matos', 'Lia Neves', 'Otto Ramos'].map(u);
  const CAIO = u('Caio Prates');
  const DALVA = u('Dalva Rocha');
  const ELOI = u('Elói Santos');

  inserir('FILIAL', ['CODFILIAL', 'NOME_FILIAL', 'UF', 'ATIVO'],
    [71, 72, 73, 74, 75, 76, 77, 78].map((f) => [String(f), `Filial ${f} · ${f % 2 ? 'Brasília' : 'Goiânia'}`, f % 2 ? 'DF' : 'GO', 1]));

  inserir('USUARIO_PAPEL', ['USER_ID', 'PAPEL', 'ATRIBUIDO_EM'], [CAIO, DALVA, ELOI].map((id) => [id, 'COORDENADOR', '2026-09-01 08:00:00']));
  inserir('COORDENADORES', ['COD_SUPERVISOR', 'NOME', 'EMAIL', 'USER_ID', 'ATIVO'], [
    [COORD.CAIO, 'Caio Prates', 'caio.prates@benenutri.local', CAIO, 1],
    [COORD.DALVA, 'Dalva Rocha', 'dalva.rocha@benenutri.local', DALVA, 1],
    [COORD.ELOI, 'Elói Santos', 'eloi.santos@benenutri.local', ELOI, 1],
  ]);
  const medicamento = [71, 72, 73, 74, 75, 76, 77, 78];
  inserir('COORDENADORES_BU', ['COD_SUPERVISOR', 'CODFILIAL', 'CODEPTO'], [
    [COORD.CAIO, 71, 1], [COORD.CAIO, 72, 1], [COORD.CAIO, 74, 1],
    ...medicamento.map((f) => [COORD.DALVA, f, 8]), [COORD.DALVA, 73, 9],
    ...medicamento.map((f) => [COORD.ELOI, f, 8]),
  ]);
  const vendedores = [AMELIA, BENICIO, VERA, HUGO, LIA, OTTO];
  inserir('VENDEDOR_RCA', ['USER_ID', 'COD_RCA', 'COD_SUPERVISOR'], vendedores.map((id, i) => [id, 7001 + i, COORD.CAIO]));
  inserir('BU_VENDEDOR', ['BU_CODIGO', 'VENDEDOR_ID', 'ATIVO', 'CODFILIAL', 'ID_SECAO', 'CRIADO_EM'], [
    ...vendedores.map((id) => ['1', id, 1, '71', null, '2026-01-01 08:00:00']),
    ['8', BENICIO, 1, '72', null, '2026-01-01 08:00:00'],
    // Dalva tambem tem escopo de venda na BU de Caio (sem RCA): C-011, outro coordenador.
    ['1', DALVA, 1, '71', null, '2026-01-01 08:00:00'],
  ]);

  // Metas distribuidas de out/2026 (RNT-009).
  inserir('METAS_BU_VENDEDOR', ['CODFILIAL', 'CODEPTO', 'VENDEDOR_ID', 'MES', 'ANO', 'META_VALOR', 'CRIADO_POR'], [
    [71, 1, AMELIA, 10, 2026, 50000, String(CAIO)],
    ...[VERA, HUGO, LIA, OTTO].map((id) => [71, 1, id, 10, 2026, 10000, String(CAIO)]),
    [71, 1, BENICIO, 10, 2026, 15000, String(CAIO)],
    [72, 8, BENICIO, 10, 2026, 20000, String(DALVA)],
  ]);
  // C-007: lancamento manual antigo, que nao e lido.
  inserir('METAS_BU', ['CODFILIAL', 'CODEPTO', 'MES', 'ANO', 'META_VALOR', 'CRIADO_POR'], [[72, 1, 11, 2026, 250000, 'diretoria']]);

  /* ── planejamento estrategico de nov/2026 ── */
  inserir('INTG_BUSINESS_UNIT', ['SOURCE_BUSINESS_UNIT_ID', 'CODE', 'NAME', 'ACTIVE'], [
    [1, 'NUTRICAO', 'Nutrição', 1], [2, 'ENFERMAGEM', 'Enfermagem', 1], [8, 'MEDICAMENTO', 'Medicamento', 1], [9, 'ESTETICA_E_INJETAVEIS', 'Estética e Injetáveis', 1],
  ]);
  inserir('INTG_REGION', ['SOURCE_REGION_ID', 'CODE', 'NAME', 'ACTIVE'], [
    [1, 'DF', 'Distrito Federal', 1], [2, 'GO', 'Goiás', 1], [3, 'TO', 'Tocantins', 1], [5, 'Outros Estados', 'Outros Estados', 1],
  ]);
  inserir('INTG_ACTIVITY_SEGMENT', ['SOURCE_ACTIVITY_SEGMENT_ID', 'CODE', 'NAME', 'ACTIVE'], [
    [1, 'HOSPITAL_PRIVADO', 'Hospital Privado', 1], [2, 'CLINICA_MEDICA', 'Clínica Médica', 1], [3, 'HOME_CARE', 'Home Care', 1],
  ]);
  let alvo = 0;
  const plano = (bu, regiao, segmento, valor, mes = 11) => [++alvo, 2026, mes, bu, regiao, segmento, valor, 1];
  inserir('INTG_MONTHLY_BILLING_TARGET', ['SOURCE_MONTHLY_TARGET_ID', 'YEAR_REF', 'MONTH_REF', 'SOURCE_BUSINESS_UNIT_ID', 'SOURCE_REGION_ID',
    'SOURCE_ACTIVITY_SEGMENT_ID', 'TARGET_VALUE', 'ACTIVE'], [
    // C-006: Nutricao DF 100.000 (Hospital 60.000 + Clinica 40.000), GO 300.000, Outros Estados 40.000.
    plano(1, 1, 1, 60000), plano(1, 1, 2, 40000), plano(1, 2, 1, 200000), plano(1, 2, 3, 100000), plano(1, 5, 1, 40000),
    // C-008: Medicamento DF 500.000 e GO 300.000; RN-010: Estetica DF 90.000.
    plano(8, 1, 1, 500000), plano(8, 2, 1, 300000), plano(9, 1, 2, 90000),
    // Linha inativa nao conta.
    [++alvo, 2026, 11, 1, 1, 1, 999999, 0],
  ]);

  /* ── carteira de Amelia: 40 clientes (C-004) ── */
  const ramos = ['HOSPITAL PRIVADO', 'CLINICA MEDICA', 'HOME CARE'];
  const ids = Array.from({ length: 40 }, (_, i) => 7001 + i);
  const ramoDe = (id) => ramos[id % 3];
  inserir('CLIENTES', ['ID', 'RAZAO_SOCIAL', 'NOME_FANTASIA', 'CIDADE', 'UF', 'SEGMENTO', 'STATUS', 'CRIADO_EM', 'WINTHOR_CODCLI'],
    ids.map((id) => [id, `CLIENTE ANALYTICS ${id} LTDA`, `CLIENTE ANALYTICS ${id}`, 'Brasília', 'DF', id % 2 ? 'Saúde' : 'Varejo', 'ATIVO', '2025-01-10 08:00:00', id]));
  inserir('IMP_CLIENTES_TOTVS', ['CODCLI', 'CLIENTE', 'RAMO', 'UF', 'CIDADE'], ids.map((id) => [id, `CLIENTE ANALYTICS ${id}`, ramoDe(id), 'DF', 'Brasília']));
  inserir('EQUIPE_CLIENTE', ['ID_CLIENTE', 'ID_VENDEDOR', 'CODFILIAL', 'ID_SECAO', 'CURVA_CLASSIFICACAO', 'CRIADO_EM'], [
    ...ids.map((id) => [id, AMELIA, '71', null, null, '2025-02-01 08:00:00']),
    [7041, BENICIO, '71', null, null, '2025-02-01 08:00:00'],
    [7042, BENICIO, '72', null, null, '2025-02-01 08:00:00'],
  ]);
  inserir('CLIENTES', ['ID', 'RAZAO_SOCIAL', 'NOME_FANTASIA', 'CIDADE', 'UF', 'SEGMENTO', 'STATUS', 'CRIADO_EM', 'WINTHOR_CODCLI'], [
    [7041, 'HOSPITAL BENÍCIO NORTE LTDA', 'HOSPITAL BENÍCIO NORTE', 'Brasília', 'DF', 'Saúde', 'ATIVO', '2025-01-10 08:00:00', 7041],
    [7042, 'FARMÁCIA BENÍCIO SUL LTDA', 'FARMÁCIA BENÍCIO SUL', 'Goiânia', 'GO', 'Farmácia', 'ATIVO', '2025-01-10 08:00:00', 7042],
  ]);

  /* ── vendas e devolucoes (fonte do ERP) ── */
  const vendas = [];
  const devolucoes = [];
  const pesoNov = {};
  const noPeso = (f, d, data, valor) => {
    if (data >= '2025-11-01' && data <= '2026-10-31') pesoNov[`${f}|${d}`] = (pesoNov[`${f}|${d}`] || 0) + valor;
  };
  let np = 0;
  const venda = (cli, data, total, { filial = '71', depto = '1', secao = '101', produto = PRODUTOS[cli % 12], qt = 1, fornec = 70 + (cli % 3) } = {}) => {
    const numped = `7${String(++np).padStart(5, '0')}`;
    vendas.push([numped, data, filial, produto, `Produto ${produto}`, cli, `CLIENTE ANALYTICS ${cli}`, fornec, depto,
      depto === '8' ? 'MEDICAMENTO' : 'NUTRIÇÃO', secao, ramoDe(cli), qt, total / qt, total]);
    noPeso(filial, depto, data, total);
  };

  // C-001 / C-004: 25 ativos em out = 42.000 de bruto; 7001 e 7002 compram pela primeira vez.
  venda(CLIENTE.NOVO1, '2026-10-05', 5000);
  venda(CLIENTE.NOVO2, '2026-10-06', 3000);
  venda(CLIENTE.TOP, '2026-10-02', 12000, { produto: 7101, qt: 10 });
  venda(CLIENTE.TOP, '2026-08-20', 100);
  for (let id = 7004; id <= 7025; id += 1) {
    venda(id, '2026-10-08', 1000);
    venda(id, '2026-08-10', 100); // historia: nao sao "novos"
  }
  // Em risco: inativos em out que compraram em set (6).
  for (let id = 7026; id <= 7031; id += 1) venda(id, '2026-09-05', 800);
  // C-001: devolucao de 2.000 em out (venda original de agosto: mais de 30 dias).
  devolucoes.push(['D7001', '700003', '2026-08-20', '2026-10-09', '71', '1', '101', CLIENTE.TOP, 7101, 'Produto 7101', 2, 2000, ramoDe(CLIENTE.TOP)]);
  noPeso('71', '1', '2026-10-09', -2000);
  // C-015: X faturou 10.000 no 1o tri/2025 e 12.500 no 1o tri/2026.
  venda(CLIENTE.X, '2025-02-10', 10000);
  venda(CLIENTE.X, '2026-02-10', 12500);
  // C-005 / C-003: Benicio 30.000 em F71·Nutricao (Caio) e 20.000 em F72·Medicamento (Dalva).
  venda(7041, '2026-10-07', 30000);
  venda(7042, '2026-10-07', 20000, { filial: '72', depto: '8', secao: '801' });
  // Peso exato do rateio de nov/2026 (C-006): cliente fora de carteira.
  for (const [chave, alvoPeso] of Object.entries(PESOS_NOV)) {
    const [f, d] = chave.split('|');
    venda(CLIENTE.DUMMY, '2026-01-15', alvoPeso - (pesoNov[chave] || 0), { filial: f, depto: d });
  }

  inserir('IMP_VENDAS_DASHBOARD_TOTVS_RCA', ['NUMPED', 'DTSAIDA', 'CODFILIAL', 'CODPROD', 'DESCRICAO', 'CODCLI', 'CLIENTE', 'CODFORNEC', 'CODEPTO',
    'DEPARTAMENTO', 'CODSEC', 'RAMO_CLIENTE', 'QT', 'VLUNIT', 'TOTAL'], vendas);
  inserir('IMP_DEVOLUCOES_TOTVS', ['NOTA_DEVOLUCAO', 'NUMPED', 'DATA_VENDA', 'DATA_DEVOLUCAO', 'CODFILIAL', 'CODEPTO', 'CODSEC', 'CODCLI',
    'CODPROD', 'DESCRICAO', 'QT_DEVOLVIDA', 'VALOR_DEVOLVIDO', 'RAMO_CLIENTE'], devolucoes);
  inserir('IMP_FORNECEDORES_TOTVS', ['CODFORNEC', 'FORNECEDOR'], [[70, 'NUTRIMED'], [71, 'VITALAB'], [72, 'BIOFARMA']]);

  /* ── visitas (RN-009): 8 de cliente + 4 de prospeccao concluidas em 30 dias ── */
  const tipos = ['Positivação', 'Positivação', 'Positivação', 'Aumento de mix', 'Aumento de mix', 'Manutenção', 'Renegociação', 'Gerar demanda'];
  inserir('VISITAS', ['CLIENTE_ID', 'VENDEDOR_ID', 'DATA_AGENDADA', 'HORA_INICIO', 'HORA_FIM', 'TIPO', 'STATUS', 'CRIADO_EM'], [
    ...tipos.map((tipo, i) => [7004 + i, AMELIA, `2026-09-${String(20 + i).padStart(2, '0')}`, '09:00', '10:00', tipo, 'CONCLUIDA', '2026-09-01 08:00:00']),
    [7012, AMELIA, '2026-10-14', '09:00', '10:00', 'Positivação', 'AGENDADA', '2026-09-01 08:00:00'],
  ]);
  inserir('PROSPECT_VISITAS', ['PROSPECT_ID', 'EXECUTIVO_ID', 'DATA_VISITA', 'HORA_INICIO', 'HORA_FIM', 'OBJETIVO', 'STATUS', 'CRIADO_EM'],
    [1, 2, 3, 4].map((i) => [7000 + i, AMELIA, `2026-10-0${i}`, '14:00', '15:00', 'Positivação — apresentar a linha', 'CONCLUIDA', '2026-09-01 08:00:00']));
}
