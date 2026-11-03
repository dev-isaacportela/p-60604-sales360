// Dados da spec 002 (carteira): tabela "Simulador" de
// docs/specs/002-carteira-clientes/plan.md. Ids de cliente na faixa 2001+.
// Datas relativas a HOJE = 30/10/2026 (o smoke passa esse `hoje`).
//
// Nao mexe no que o smoke da 001 conta: nenhuma tarefa pendente, alerta ou
// ferias novos para os usuarios-base. Dados de um teste so (250 alertas,
// pedidos de outubro, secoes de Enfermagem) entram no proprio smoke.

export const HOJE = '2026-10-30';

export const CLIENTE = {
  X: 2001, Y: 2002, Z: 2003, W: 2004, V: 2005, K: 2006, H: 2008, J: 2009,
  HOSPITAL: 2471, Q: 2301, PF_LIVRE: 2302, FORA: 2303, PF_ANA: 2304,
};

function antes(dias) {
  const [y, m, d] = HOJE.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - dias)).toISOString().slice(0, 10);
}

export function semear({ inserir, ID, usuario }) {
  const { ANA, BRUNO } = ID;

  // Coordenador da equipe F1 · Nutricao (C-013, RN-020).
  const CARLOS = usuario('Carlos Teixeira', 'carlos.teixeira@benenutri.local');
  inserir('USUARIO_PAPEL', ['USER_ID', 'PAPEL', 'ATRIBUIDO_EM'], [[CARLOS, 'COORDENADOR', '2026-10-01 08:00:00']]);
  inserir('COORDENADORES', ['COD_SUPERVISOR', 'NOME', 'EMAIL', 'USER_ID', 'ATIVO'], [
    [2001, 'Carlos Teixeira', 'carlos.teixeira@benenutri.local', CARLOS, 1],
  ]);
  inserir('COORDENADORES_BU', ['COD_SUPERVISOR', 'CODFILIAL', 'CODEPTO'], [[2001, 1, 1]]);

  // Escopos com secao (alem do F1 · Nutricao "todas" da 001): candidatos a titular.
  inserir('BU_VENDEDOR', ['BU_CODIGO', 'VENDEDOR_ID', 'ATIVO', 'CODFILIAL', 'ID_SECAO', 'CRIADO_EM'], [
    ['1', ANA, 1, '1', 101, '2026-10-01 08:00:00'],
    ['1', ANA, 1, '1', 102, '2026-10-01 08:00:00'],
    ['1', BRUNO, 1, '1', 101, '2026-10-01 08:00:00'],
  ]);

  const clientes = [];
  const ramos = [];
  const carteira = [];
  const vendas = [];
  const devolucoes = [];
  const visitas = [];
  const cliente = (id, razao, { fantasia = null, cnpj = null, cidade = 'Brasília', uf = 'DF', status = 'ATIVO', ramo = 'VAREJO', segmento = 'Varejo alimentar', telefone = '(61) 3000-0000' } = {}) => {
    clientes.push([id, razao, fantasia, cnpj, `Rua ${id}, Centro`, cidade, uf, segmento, status, telefone, `contato${id}@cliente.local`, '2026-01-10 08:00:00', id]);
    ramos.push([id, razao, ramo, uf, cidade]);
  };
  let pedido = 0;
  // Uma venda = um pedido de 2 itens em F1 · Nutricao (secao 101), salvo outra BU.
  const venda = (cli, diasAtras, valor, { filial = '1', depto = '1', secao = '101' } = {}) => {
    pedido += 1;
    const numped = `P${cli}-${String(pedido).padStart(4, '0')}`;
    const metade = Math.round(valor * 50) / 100;
    for (const [codprod, nome, total] of [[2001, 'Dieta enteral 1L', metade], [2002, 'Suplemento 400g', Math.round((valor - metade) * 100) / 100]]) {
      vendas.push([numped, antes(diasAtras), filial, codprod, nome, cli, depto, secao, 2, total / 2, total]);
    }
  };
  const visita = (cli, vendedor, diasAtras, status = 'CONCLUIDA', relato = 'Cliente atendido, pedido em andamento.') =>
    visitas.push([cli, vendedor, antes(diasAtras), '09:00', '10:00', 'PRESENCIAL', status, relato, 'Apresentar linha nova.', '2026-01-01 08:00:00']);

  /* ── carteira de Ana (40 clientes, 32 ativos) ── */
  cliente(CLIENTE.X, 'MERCADO SANTA CLARA LTDA', { fantasia: 'MERCADO SANTA CLARA', cnpj: '11.111.111/0001-11' });
  cliente(CLIENTE.Y, 'PADARIA BOM GOSTO LTDA', { fantasia: 'PADARIA BOM GOSTO' });
  cliente(CLIENTE.Z, 'EMPORIO VERDE LTDA', { fantasia: 'EMPÓRIO VERDE' });
  cliente(CLIENTE.W, 'CLINICA VIDA PLENA LTDA', { fantasia: 'CLÍNICA VIDA PLENA', ramo: 'CLINICA', segmento: 'Saúde' });
  cliente(CLIENTE.V, 'NOVO CLIENTE ALFA LTDA');
  cliente(CLIENTE.K, 'FARMACIA CENTRAL LTDA', { fantasia: 'FARMÁCIA CENTRAL', ramo: 'FARMACIA', segmento: 'Farmácia' });
  cliente(CLIENTE.HOSPITAL, 'HOSPITAL SÃO LUCAS LTDA', { cnpj: '12.345.678/0001-90', ramo: 'HOSPITALAR', segmento: 'Saúde', cidade: 'Goiânia', uf: 'GO' });
  cliente(CLIENTE.H, 'LANCHONETE PRIMAVERA LTDA', { fantasia: 'LANCHONETE PRIMAVERA' });
  cliente(CLIENTE.J, 'SORVETERIA POLO NORTE LTDA', { fantasia: 'SORVETERIA POLO NORTE', ramo: '' });
  for (const id of [CLIENTE.X, CLIENTE.Y, CLIENTE.Z, CLIENTE.W, CLIENTE.V, CLIENTE.K, CLIENTE.HOSPITAL, CLIENTE.H, CLIENTE.J]) {
    carteira.push([id, ANA, '1', 101, null]);
  }
  const ANA_EXTRA = Array.from({ length: 31 }, (_, i) => 2101 + i);
  ANA_EXTRA.forEach((id, i) => {
    const status = i < 5 ? 'INATIVO' : i < 8 ? 'EM_RISCO' : 'ATIVO';
    cliente(id, `CLIENTE ANA ${String(i + 1).padStart(2, '0')} LTDA`, { status, ramo: ['VAREJO', 'HOSPITALAR', 'CLINICA', 'FARMACIA'][i % 4] });
    carteira.push([id, ANA, '1', i % 2 ? 102 : 101, null]);
  });
  // Pessoa Fisica na carteira de Ana: nunca aparece (RN-001).
  cliente(CLIENTE.PF_ANA, 'MARIA DAS GRAÇAS', { ramo: 'PESSOA FISICA' });
  carteira.push([CLIENTE.PF_ANA, ANA, '1', 101, null]);

  // C-002: curva fixada A/B/C e visitas de Ana.
  carteira.find((c) => c[0] === CLIENTE.X)[4] = 'A';
  carteira.find((c) => c[0] === CLIENTE.Y)[4] = 'B';
  carteira.find((c) => c[0] === CLIENTE.Z)[4] = 'C';
  visita(CLIENTE.X, ANA, 9);
  visita(CLIENTE.X, ANA, 40);
  visita(CLIENTE.X, ANA, 70);
  visita(CLIENTE.Y, ANA, 10);
  visita(CLIENTE.W, ANA, 45);
  for (const d of [10, 25, 50]) visita(CLIENTE.K, ANA, d);
  visita(CLIENTE.Z, ANA, 3, 'AGENDADA', null); // agendada nao conta

  // C-003: W compra a cada 20 dias; 11.500 nos ultimos 60 x 10.000 nos 60 anteriores.
  for (const [d, v] of [[20, 6000], [40, 5500], [60, 4000], [80, 3000], [100, 3000], [120, 1000]]) venda(CLIENTE.W, d, v);
  // C-005: K, R$ 24.000 em 90 dias.
  for (const d of [10, 30, 60]) venda(CLIENTE.K, d, 8000);
  // C-015: X com 30 pedidos no escopo (a cada 7 dias) e 4 em outra filial.
  for (let i = 0; i < 30; i += 1) venda(CLIENTE.X, 3 + 7 * i, 500 + 10 * i);
  for (let i = 0; i < 4; i += 1) venda(CLIENTE.X, 5 + 7 * i, 900, { filial: '2' });
  // Hospital e alguns extras compram em outubro; devolucao de R$ 1.000 em outubro.
  venda(CLIENTE.HOSPITAL, 12, 15000);
  ANA_EXTRA.slice(8, 20).forEach((id, i) => venda(id, 5 + i, 2000 + 100 * i));
  devolucoes.push([CLIENTE.HOSPITAL, antes(8), '1', '1', '101', 1000]);

  // C-001: o liquido de outubro da carteira de Ana fecha em R$ 120.000.
  const outubro = (data) => data >= '2026-10-01' && data <= HOJE;
  const anaIds = new Set(carteira.filter((c) => c[1] === ANA).map((c) => c[0]));
  const brutoOut = vendas.filter((v) => anaIds.has(v[5]) && v[2] === '1' && outubro(v[1])).reduce((s, v) => s + v[10], 0);
  const devolOut = devolucoes.filter((d) => outubro(d[1])).reduce((s, d) => s + d[5], 0);
  venda(ANA_EXTRA[30], 2, Math.round((120000 - brutoOut + devolOut) * 100) / 100);

  /* ── carteira de Bruno (35, sem sobrepor a de Ana: C-012 = 35 + 40) ── */
  Array.from({ length: 35 }, (_, i) => 2201 + i).forEach((id, i) => {
    cliente(id, `CLIENTE BRUNO ${String(i + 1).padStart(2, '0')} LTDA`, { ramo: i % 3 ? 'VAREJO' : 'CLINICA' });
    carteira.push([id, BRUNO, '1', 101, null]);
    if (i < 10) venda(id, 15 + i, 1500);
  });

  /* ── sem dono ── */
  cliente(CLIENTE.Q, 'COMERCIAL QUALIDADE LTDA', { fantasia: 'COMERCIAL QUALIDADE' });
  cliente(CLIENTE.PF_LIVRE, 'JOÃO DA SILVA', { ramo: 'PESSOA FISICA' });
  cliente(CLIENTE.FORA, 'DISTRIBUIDORA DISTANTE LTDA');

  inserir('CLIENTES', ['ID', 'RAZAO_SOCIAL', 'NOME_FANTASIA', 'CNPJ', 'ENDERECO', 'CIDADE', 'UF', 'SEGMENTO', 'STATUS', 'TELEFONE', 'EMAIL', 'CRIADO_EM', 'WINTHOR_CODCLI'], clientes);
  inserir('IMP_CLIENTES_TOTVS', ['CODCLI', 'CLIENTE', 'RAMO', 'UF', 'CIDADE'], ramos);
  inserir('EQUIPE_CLIENTE', ['ID_CLIENTE', 'ID_VENDEDOR', 'CODFILIAL', 'ID_SECAO', 'CURVA_CLASSIFICACAO', 'CRIADO_EM'],
    carteira.map((c) => [...c, '2026-02-01 08:00:00']));
  inserir('IMP_VENDAS_DASHBOARD_TOTVS_RCA', ['NUMPED', 'DTSAIDA', 'CODFILIAL', 'CODPROD', 'DESCRICAO', 'CODCLI', 'CODEPTO', 'CODSEC', 'QT', 'VLUNIT', 'TOTAL'], vendas);
  inserir('IMP_DEVOLUCOES_TOTVS', ['CODCLI', 'DATA_DEVOLUCAO', 'CODFILIAL', 'CODEPTO', 'CODSEC', 'VALOR_DEVOLVIDO'], devolucoes);
  inserir('VISITAS', ['CLIENTE_ID', 'VENDEDOR_ID', 'DATA_AGENDADA', 'HORA_INICIO', 'HORA_FIM', 'TIPO', 'STATUS', 'RELATO', 'PLANEJAMENTO', 'CRIADO_EM'], visitas);

  /* ── historico de X (C-015) ── */
  inserir('TAREFAS', ['VENDEDOR_ID', 'TITULO', 'STATUS', 'DATA_LIMITE', 'CRIADO_EM', 'CLIENTE_ID', 'CONCLUIDO_EM'], [
    [ANA, 'Enviar tabela de preços', 'CONCLUIDA', antes(20), '2026-09-01 08:00:00', CLIENTE.X, `${antes(21)}T15:00:00`],
    [ANA, 'Confirmar entrega', 'CONCLUIDA', antes(5), '2026-09-01 08:00:00', CLIENTE.X, `${antes(6)}T11:30:00`],
  ]);
  inserir('RELATOS_CLIENTE', ['CLIENTE_ID', 'VENDEDOR_ID', 'DATA_CONTATO', 'HORA_CONTATO', 'TIPO_CONTATO', 'RELATO', 'CRIADO_EM'], [
    [CLIENTE.X, ANA, antes(15), '14:00', 'WhatsApp', 'Pediu catálogo de suplementos.', `${antes(15)} 14:05:00`],
  ]);
  inserir('PRODUTOS_CUSTOS', ['CODPROD', 'CODFAB', 'NOME', 'FORNECEDOR_ID', 'DEPARTAMENTO_ID', 'SECAO_ID', 'ATIVO'], [
    [2001, 'DE-1L', 'Dieta enteral 1L', 1, 1, 101, 1],
    [2002, 'SU-400', 'Suplemento 400g', 1, 1, 102, 1],
  ]);
  inserir('PRODUCT_MIX', ['ID', 'NOME', 'ID_CLIENTE', 'ID_USUARIO_CRIACAO', 'TOTAL_CUSTO', 'TOTAL_VENDA', 'MARGEM_MEDIA', 'DT_CRIACAO', 'ENVIADO_HISTORICO', 'DT_ENVIO_HISTORICO'], [
    [2001, 'Proposta outubro', CLIENTE.X, ANA, 800, 1200, 33.3, `${antes(12)}T10:00:00`, 1, `${antes(11)}T16:00:00`],
    [2002, 'Rascunho novembro', CLIENTE.X, ANA, 500, 700, 28.6, `${antes(2)}T10:00:00`, 0, null],
  ]);
  inserir('PRODUCT_MIX_ITEMS', ['ID_MIX', 'ID_PRODUTO', 'QUANTIDADE', 'TIPO_CUSTO', 'CUSTO_UNITARIO', 'MARGEM_PERCENT', 'PRECO_VENDA'], [
    [2001, 2001, 10, 'PADRAO', 50, 33.3, 75],
    [2001, 2002, 10, 'PADRAO', 30, 33.3, 45],
  ]);

  inserir('PROSPECTS', ['RAZAO_SOCIAL', 'NOME_FANTASIA', 'CIDADE', 'UF', 'STATUS_PIPELINE', 'POTENCIAL', 'PROBABILIDADE', 'RESPONSAVEL_ID', 'CRIADO_EM', 'ATUALIZADO_EM'], [
    ['RESTAURANTE SABOR NOVO LTDA', 'SABOR NOVO', 'Brasília', 'DF', 'NOVO', 5000, 10, ANA, '2026-10-20T09:00:00', '2026-10-20T09:00:00'],
  ]);
}
