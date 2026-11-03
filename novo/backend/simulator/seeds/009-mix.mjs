// Dados da spec 009 (Mix Builder), conforme a tabela "Seed" do plan.
// Ids na faixa 9001+. Os codigos dos cenarios da spec viram: cliente 1520 ->
// 9001, 1777 -> 9002 (na carteira, sem a "Rede Sul") e 9005 (fora da carteira,
// C-018), 1600 -> 9003; produto 714 -> 9714, 715 -> 9715, 9001 -> 9001.
// Ana e Bruno daqui sao usuarios proprios da 009 (nao os da 001): a carteira
// de 800 clientes nao pode entrar nas contas de carteira de outra spec. Mesmas
// ferias da Ana da 001: 01/11-15/11, substituto Bruno.

const AGORA = '2026-10-30 08:00:00';

export function semear({ inserir, usuario }) {
  const ANA = usuario('Ana Mix', 'ana.mix@benenutri.local');
  const BRUNO = usuario('Bruno Mix', 'bruno.mix@benenutri.local');
  inserir('VENDEDOR_RCA', ['USER_ID', 'COD_RCA', 'COD_SUPERVISOR'], [[ANA, 9101, 900], [BRUNO, 9102, 900]]);
  inserir('FERIAS_VENDEDOR', ['COD_RCA', 'RCA', 'DT_INICIO', 'DT_FIM', 'COD_RCA_SUBSTITUTO', 'RCA_SUBSTITUTO', 'ATIVO'], [
    [9101, 'ANA MIX', '2026-11-01', '2026-11-15', 9102, 'BRUNO MIX', 1],
  ]);

  const clientes = [
    [9001, 'MERCADO BOM PRECO LTDA', 'Mercado Bom', '12.345.678/0001-90'],
    [9002, 'EMPORIO NORTE COMERCIO LTDA', 'Empório Norte', '23.456.789/0001-01'],
    [9003, 'INVERNO DISTRIBUIDORA LTDA', 'Inverno Distribuidora', '34.567.890/0001-12'],
    [9004, 'PADARIA REAL LTDA', 'Padaria Real', '45.678.901/0001-23'],
    [9005, 'ATACADO FORA DA CARTEIRA LTDA', 'Atacado Fora', '56.789.012/0001-34'],
    // RF-002: carteira de 800, sem teto no seletor.
    ...Array.from({ length: 800 }, (_, i) => [9101 + i, `CLIENTE CARTEIRA ${9101 + i} LTDA`, `Carteira ${9101 + i}`, null]),
  ];
  inserir('CLIENTES', ['ID', 'RAZAO_SOCIAL', 'NOME_FANTASIA', 'CNPJ', 'UF', 'STATUS', 'WINTHOR_CODCLI', 'CRIADO_EM'],
    clientes.map(([id, razao, fantasia, cnpj]) => [id, razao, fantasia, cnpj, 'DF', 'ATIVO', id, AGORA]));

  inserir('EQUIPE_CLIENTE', ['ID_CLIENTE', 'ID_VENDEDOR', 'CODFILIAL', 'ID_SECAO', 'CURVA_CLASSIFICACAO', 'CRIADO_EM'], [
    ...[9001, 9002, 9003, ...clientes.filter(([id]) => id >= 9101).map(([id]) => id)].map((id) => [id, ANA, '1', null, 'B', AGORA]),
    [9004, BRUNO, '1', null, 'A', AGORA],
  ]);

  // Catalogo. 9131 inativo nao aparece (RN-014).
  const produto = (codprod, nome, ativo = 1) => [codprod, `F${codprod}`, `789${codprod}`, nome, 1, 1, 101, ativo];
  inserir('PRODUTOS_CUSTOS', ['CODPROD', 'CODFAB', 'CODAUXILIAR', 'NOME', 'FORNECEDOR_ID', 'DEPARTAMENTO_ID', 'SECAO_ID', 'ATIVO'], [
    produto(9714, 'Dieta Enteral Plus 1L'),
    produto(9715, 'Suplemento Proteico 400g'),
    produto(9716, 'Módulo de Fibras 200g'),
    produto(9717, 'Espessante Instantâneo 125g'),
    produto(9718, 'AÇAÍ EM PÓ 100g'),
    produto(9001, 'Produto Novo Sem Custo'),
    ...Array.from({ length: 30 }, (_, i) => produto(9101 + i, `Whey Protein Sabor ${i + 1}`)),
    produto(9131, 'Whey Protein Descontinuado', 0),
  ]);

  // RN-007: 9717 tem padrao 0 e nao oferece a opcao. 9001 nao tem custo (C-005).
  inserir('CUSTO_PADRAO_PRODUTO', ['CODPROD', 'CUSTO', 'DATA_REF', 'ATUALIZADO_EM'], [
    [9714, 70, '2026-10-30T14:00:00', '2026-10-30T14:00:00'],
    [9715, 40, '2026-10-30T14:00:00', '2026-10-30T14:00:00'],
    [9716, 50, '2026-10-30T14:00:00', '2026-10-30T14:00:00'],
    [9717, 0, '2026-10-30T14:00:00', '2026-10-30T14:00:00'],
    [9718, 30, '2026-10-30T14:00:00', '2026-10-30T14:00:00'],
    ...Array.from({ length: 30 }, (_, i) => [9101 + i, 80, '2026-10-30T14:00:00', '2026-10-30T14:00:00']),
  ]);

  const politica = (item, codprod, cliente, custo, id, nome, status, inicio, fim) =>
    [item, codprod, cliente, custo, id, nome, status, null, inicio, fim, '2026-10-30T14:00:00'];
  inserir('CUSTO_ESPECIAL_PRODUTO', ['ITEM_ID', 'CODPROD', 'CLIENTE_ID', 'CUSTO', 'POLITICA_ID', 'POLITICA_NOME', 'STATUS', 'FILIAL_ID', 'DATA_INICIO', 'DATA_FIM', 'ATUALIZADO_EM'], [
    politica(9001, 9714, null, 60, 901, 'Rede Sul', 'ACTIVE', '2026-10-01', '2026-12-31'),      // C-003: so 9001 vinculado
    politica(9002, 9714, 9001, 58, 902, 'Promo Set', 'ACTIVE', '2026-09-01', '2026-09-30'),    // C-004: vencida
    politica(9003, 9714, 9001, 50, 903, 'Inativa', 'INACTIVE', '2026-10-01', '2026-12-31'),
    politica(9004, 9716, null, 45, 904, 'Geral', 'ACTIVE', '2026-01-01', '2026-12-31'),        // RN-008 (c)
    politica(9005, 9716, null, 44, 905, 'Só vinculado', 'ACTIVE', '2026-01-01', '2026-12-31'), // sem cliente, 1 vinculo
  ]);
  inserir('CUSTO_ESPECIAL_CLIENTES_BIG', ['CUSTO_ESPECIAL_ID', 'CLIENTE_ID'], [[9001, 9001], [9005, 9002]]);

  // C-016: 14:00 UTC = 11:00 em Brasilia.
  inserir('MIX_CUSTOS_SYNC', ['CHAVE', 'VALOR', 'ATUALIZADO_EM'], [
    ['LAST_SUCCESS_AT', '2026-10-30T14:00:00', '2026-10-30T14:00:00'],
    ['LAST_RESULT', 'ok', '2026-10-30T14:00:00'],
  ]);

  // C-019: 9715 tem endereco inseguro (vira "Sem foto"); 9001 nao tem.
  inserir('MIX_PRODUTO_FOTO', ['CODPROD', 'URL', 'NOME_ARQUIVO', 'BUSCADO_EM'], [
    [9714, 'https://fotos.benenutri.local/9714.jpg', '9714.jpg', '2026-10-30T12:00:00'],
    [9715, 'http://fotos.benenutri.local/9715.jpg', '9715.jpg', '2026-10-30T12:00:00'],
  ]);

  // Ana 23 mixes (C-009), Bruno 5. "Campanha Verao" = itens de C-007.
  const mixes = [
    [9001, 'Campanha Verão', 'Proposta de verão', 9001, ANA, 900, 1250, 28, '2026-10-29T16:00:00'],
    [9002, 'Inverno', null, 9003, ANA, 140, 200, 30, '2026-10-29T15:00:00'],
    ...Array.from({ length: 21 }, (_, i) =>
      [9003 + i, `Mix Ana ${i + 1}`, null, 9001, ANA, 70, 100, 30, `2026-10-${String(i + 1).padStart(2, '0')}T10:00:00`]),
    ...Array.from({ length: 5 }, (_, i) =>
      [9024 + i, `Mix Bruno ${i + 1}`, null, 9004, BRUNO, 40, 57.14, 30, `2026-10-${String(i + 1).padStart(2, '0')}T11:00:00`]),
  ];
  inserir('PRODUCT_MIX', ['ID', 'NOME', 'DESCRICAO', 'ID_CLIENTE', 'ID_USUARIO_CRIACAO', 'TOTAL_CUSTO', 'TOTAL_VENDA', 'MARGEM_MEDIA', 'DT_CRIACAO', 'ENVIADO_HISTORICO'],
    mixes.map((m) => [...m, 0]));

  const item = (mix, produto, qtd, tipo, custo, margem, preco) => [mix, produto, qtd, tipo, custo, margem, preco, null, null];
  inserir('PRODUCT_MIX_ITEMS', ['ID_MIX', 'ID_PRODUTO', 'QUANTIDADE', 'TIPO_CUSTO', 'CUSTO_UNITARIO', 'MARGEM_PERCENT', 'PRECO_VENDA', 'PRECO_CONCORRENTE', 'CMV_PERCENT'], [
    item(9001, 9714, 10, 'PADRAO', 70, 30, 100),
    item(9001, 9715, 4, 'PADRAO', 50, 20, 62.5),
    item(9002, 9714, 2, 'PADRAO', 70, 30, 100),
    ...Array.from({ length: 21 }, (_, i) => item(9003 + i, 9714, 1, 'PADRAO', 70, 30, 100)),
    ...Array.from({ length: 5 }, (_, i) => item(9024 + i, 9715, 1, 'PADRAO', 40, 30, 57.14)),
  ]);
}
