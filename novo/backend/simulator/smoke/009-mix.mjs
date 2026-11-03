// Smoke da spec 009 — Mix Builder. Banco descartavel so deste arquivo.
// Ids do seed: docs/specs/009-mix-builder/plan.md, "Simulador".

export default async function ({ teste, chamar, linhas, banco, db, ID, toSqlite, assert }) {
  // Ana e Bruno do seed da 009 (usuarios proprios), achados pelo e-mail.
  const idPorEmail = (email) => Number(banco(`SELECT ID FROM INT_USER WHERE DESCR = '${email}'`)[0].ID);
  const ANA = idPorEmail('ana.mix@benenutri.local');
  const BRUNO = idPorEmail('bruno.mix@benenutri.local');
  const HOJE = '2026-10-30';
  const FERIAS = '2026-11-05';
  const DEPOIS = '2026-11-16';

  const itensC007 = [
    { p: 9714, q: 10, t: 'PADRAO', c: 70, m: 30, v: 100, k: 0 },
    { p: 9715, q: 4, t: 'PADRAO', c: 50, m: 20, v: 62.5, k: 0 },
  ];
  let segundo = 0;
  // `agora` muda a cada gravacao, como na tela (dois cliques nao caem no mesmo segundo).
  const agora = () => `2026-10-30T10:00:${String(segundo++).padStart(2, '0')}`;
  const criar = async (userId, mudancas = {}, hoje = HOJE) => (await chamar('s360MixCriar', {
    nome: 'Campanha Verão', descricao: '', clienteId: '9001', itens: JSON.stringify(itensC007), agora: agora(), hoje, ...mudancas,
  }, userId)).affectedRows;
  const contar = (userId) => Number(banco(`SELECT COUNT(*) AS N FROM PRODUCT_MIX WHERE ID_USUARIO_CRIACAO = ${userId}`)[0].N);
  const listar = (userId, offset = 0, hoje = HOJE) => linhas('s360MixListar', { offset: String(offset), hoje }, userId);
  const opcoes = async (clienteId, produtos, userId = ANA, hoje = HOJE) =>
    (await linhas('s360MixCustosOpcoes', { clienteId: String(clienteId), produtos, hoje }, userId))
      .map((o) => `${o.TIPO_CUSTO}:${Number(o.CUSTO)}${o.POLITICA_NOME ? `:${o.POLITICA_NOME}` : ''}`);
  const clientes = async (busca, userId = ANA, hoje = HOJE, buscaDigitos = '') =>
    (await linhas('s360MixClientesBuscar', { busca, buscaDigitos, hoje }, userId)).map((c) => Number(c.ID));
  const catalogo = async (busca) => linhas('s360MixCatalogoBuscar', { busca }, ANA);

  await teste('dialeto (D-904): JSON_TABLE, sem acento e LAST_INSERT_ID traduzidos', async () => {
    const sql = toSqlite(`SELECT JT.P, JT.Q FROM JSON_TABLE('[{"p":1,"q":2},{"p":3,"q":4}]', '$[*]' COLUMNS (P INT PATH '$.p', Q DECIMAL(12,4) PATH '$.q')) JT ORDER BY JT.P`);
    assert.deepEqual(db.prepare(sql).all().map((r) => [r.P, r.Q]), [[1, 2], [3, 4]]);
    const [r] = db.prepare(toSqlite(`SELECT CONVERT('açaí' USING utf8mb4) COLLATE utf8mb4_0900_ai_ci AS A`)).all();
    assert.equal(r.A, 'ACAI');
    assert.match(toSqlite('SELECT LAST_INSERT_ID()'), /last_insert_rowid\(\)/);
  });

  await teste('C-001: Ana cria o mix para 9001; totais 700/1.000/30 e mix no topo da lista', async () => {
    const antes = contar(ANA);
    const afetadas = await criar(ANA, { nome: 'Campanha Verão 2', itens: JSON.stringify([{ p: 9714, q: 10, t: 'PADRAO', c: 70, m: 30, v: 100, k: 0 }]) });
    assert.ok(afetadas > 0);
    assert.equal(contar(ANA), antes + 1);
    const [topo] = await listar(ANA);
    assert.equal(topo.NOME, 'Campanha Verão 2');
    assert.deepEqual([Number(topo.TOTAL_CUSTO), Number(topo.TOTAL_VENDA), Number(topo.MARGEM_MEDIA)], [700, 1000, 30]);
    assert.equal(topo.CLIENTE, '9001 - Mercado Bom');
    const itens = await linhas('s360MixItens', { mixId: String(topo.ID) }, ANA);
    assert.equal(itens.length, 1);
    assert.equal(Number(itens[0].QUANTIDADE), 10);
    assert.equal(Number(banco(`SELECT ID_USUARIO_CRIACAO AS U FROM PRODUCT_MIX WHERE ID = ${topo.ID}`)[0].U), ANA);
  });

  await teste('C-003 / RN-008: Rede Sul so para o cliente vinculado; fora da carteira nada', async () => {
    assert.deepEqual(await opcoes(9001, '9714'), ['PADRAO:70', 'ESPECIAL:60:Rede Sul']);
    assert.deepEqual(await opcoes(9002, '9714'), ['PADRAO:70']);
    assert.deepEqual(await opcoes(9005, '9714'), []);
  });

  await teste('C-004 / RN-008: politica vencida ou inativa nao e oferecida', async () => {
    assert.ok(!(await opcoes(9001, '9714')).some((o) => o.includes('Promo Set') || o.includes('Inativa')));
    assert.ok((await opcoes(9001, '9714', ANA, '2026-09-15')).includes('ESPECIAL:58:Promo Set'));
  });

  await teste('RN-008 (geral): sem cliente e sem vinculo vale para todos; com vinculo so para o vinculado', async () => {
    assert.deepEqual(await opcoes(9001, '9716'), ['PADRAO:50', 'ESPECIAL:45:Geral']);
    assert.deepEqual(await opcoes(9002, '9716'), ['PADRAO:50', 'ESPECIAL:44:Só vinculado', 'ESPECIAL:45:Geral']);
  });

  await teste('RN-007: custo padrao 0 nao e oferecido; produto sem custo nao volta nada', async () => {
    assert.deepEqual(await opcoes(9001, '9717'), []);
    assert.deepEqual(await opcoes(9001, '9001'), []);
    assert.deepEqual((await opcoes(9001, '9714,9715')).length, 3);
  });

  await teste('C-009 / RN-011: Ana ve 20 por pagina, total dos dela e nenhum de Bruno', async () => {
    const pagina1 = await listar(ANA);
    const total = contar(ANA);
    assert.equal(pagina1.length, 20);
    assert.equal(Number(pagina1[0].TOTAL), total);
    assert.ok(!pagina1.some((m) => m.NOME.startsWith('Mix Bruno')));
    assert.equal((await listar(ANA, 20)).length, total - 20);
    assert.equal((await listar(BRUNO)).length, 5);
  });

  await teste('C-010 / RN-011: substituto usa os clientes da titular, nunca os mixes dela', async () => {
    assert.ok(!(await clientes('Mercado', BRUNO, HOJE)).includes(9001));
    assert.ok((await clientes('Mercado', BRUNO, FERIAS)).includes(9001));
    assert.ok((await clientes('Padaria', BRUNO, FERIAS)).includes(9004));
    const antes = contar(BRUNO);
    assert.ok(await criar(BRUNO, { nome: 'Proposta do Bruno' }, FERIAS) > 0);
    assert.equal(contar(BRUNO), antes + 1);
    const lista = await listar(BRUNO, 0, FERIAS);
    assert.ok(lista.every((m) => !m.NOME.startsWith('Mix Ana') && m.NOME !== 'Inverno'));
    assert.equal(lista.find((m) => m.NOME === 'Proposta do Bruno').NA_CARTEIRA, 1);
    const mixAna = '9001';
    assert.equal((await linhas('s360MixItens', { mixId: mixAna }, BRUNO)).length, 0);
    assert.equal((await chamar('s360MixAtualizar', {
      mixId: mixAna, nome: 'Tomado', descricao: '', clienteId: '9001', itens: JSON.stringify(itensC007), agora: agora(), hoje: FERIAS,
    }, BRUNO)).affectedRows, 0);
    assert.equal((await chamar('s360MixExcluir', { mixId: mixAna }, BRUNO)).affectedRows, 0);
    assert.equal((await chamar('s360MixEnviarHistorico', { mixId: mixAna, agora: agora() }, BRUNO)).affectedRows, 0);
    assert.equal(banco(`SELECT NOME FROM PRODUCT_MIX WHERE ID = 9001`)[0].NOME, 'Campanha Verão');
    assert.ok(!(await clientes('Mercado', BRUNO, DEPOIS)).includes(9001));
    assert.equal(await criar(BRUNO, { nome: 'Depois das ferias' }, DEPOIS), 0);
    assert.deepEqual(await opcoes(9001, '9714', BRUNO, DEPOIS), []);
  });

  await teste('C-011: duplicar so grava ao salvar; a copia e de quem salvou', async () => {
    const antes = contar(ANA);
    const itens = (await linhas('s360MixItens', { mixId: '9001' }, ANA)).map((i) => ({
      p: Number(i.ID_PRODUTO), q: Number(i.QUANTIDADE), t: i.TIPO_CUSTO, c: Number(i.CUSTO_UNITARIO), m: Number(i.MARGEM_PERCENT), v: Number(i.PRECO_VENDA), k: 0,
    }));
    assert.equal(itens.length, 2);
    assert.equal(contar(ANA), antes);
    assert.ok(await criar(ANA, { nome: 'Campanha Verão - Cópia', itens: JSON.stringify(itens) }) > 0);
    assert.equal(contar(ANA), antes + 1);
    const [copia] = banco(`SELECT ID, ID_USUARIO_CRIACAO AS U FROM PRODUCT_MIX WHERE NOME = 'Campanha Verão - Cópia'`);
    assert.equal(Number(copia.U), ANA);
    assert.equal(banco(`SELECT COUNT(*) AS N FROM PRODUCT_MIX_ITEMS WHERE ID_MIX = ${copia.ID}`)[0].N, 2);
  });

  await teste('C-012 / RN-016: enviar grava data e hora; reenviar atualiza; nao enviado fica 0', async () => {
    assert.equal((await chamar('s360MixEnviarHistorico', { mixId: '9001', agora: '2026-10-30T14:00:00' }, ANA)).affectedRows, 1);
    let [m] = banco('SELECT ENVIADO_HISTORICO AS E, DT_ENVIO_HISTORICO AS D FROM PRODUCT_MIX WHERE ID = 9001');
    assert.deepEqual([Number(m.E), m.D], [1, '2026-10-30T14:00:00']);
    await chamar('s360MixEnviarHistorico', { mixId: '9001', agora: '2026-10-31T09:00:00' }, ANA);
    [m] = banco('SELECT DT_ENVIO_HISTORICO AS D FROM PRODUCT_MIX WHERE ID = 9001');
    assert.equal(m.D, '2026-10-31T09:00:00');
    const lista = await listar(ANA);
    assert.equal(lista.find((x) => Number(x.ID) === 9001).ENVIADO_HISTORICO, 1);
    assert.equal(lista.find((x) => Number(x.ID) === 9002).ENVIADO_HISTORICO, 0);
  });

  await teste('C-017: cliente que saiu da carteira -> lista marca, itens legiveis, atualizar recusado', async () => {
    db.exec(`DELETE FROM EQUIPE_CLIENTE WHERE ID_CLIENTE = 9003 AND ID_VENDEDOR = ${ANA}`);
    const inverno = (await listar(ANA)).find((m) => m.NOME === 'Inverno');
    assert.equal(inverno.NA_CARTEIRA, 0);
    assert.equal((await linhas('s360MixItens', { mixId: String(inverno.ID) }, ANA)).length, 1);
    assert.equal((await chamar('s360MixAtualizar', {
      mixId: String(inverno.ID), nome: 'Inverno', descricao: '', clienteId: '9003', itens: JSON.stringify(itensC007), agora: agora(), hoje: HOJE,
    }, ANA)).affectedRows, 0);
    assert.equal(banco(`SELECT COUNT(*) AS N FROM PRODUCT_MIX_ITEMS WHERE ID_MIX = ${inverno.ID}`)[0].N, 1);
  });

  await teste('C-018 / RN-012: gravar para cliente fora da carteira nao grava nada', async () => {
    const antes = banco('SELECT COUNT(*) AS N FROM PRODUCT_MIX')[0].N;
    assert.equal(await criar(ANA, { clienteId: '9005' }), 0);
    assert.equal(banco('SELECT COUNT(*) AS N FROM PRODUCT_MIX')[0].N, antes);
  });

  await teste('RN-013: itens invalidos nao gravam nada; totais vem do servidor', async () => {
    const mixes = () => banco('SELECT COUNT(*) AS N FROM PRODUCT_MIX')[0].N;
    const itensTotal = () => banco('SELECT COUNT(*) AS N FROM PRODUCT_MIX_ITEMS')[0].N;
    const [m0, i0] = [mixes(), itensTotal()];
    const ok = itensC007[0];
    const invalidos = [
      [ok, { ...ok }],
      [{ ...ok, q: 0 }],
      [{ ...ok, q: 1.5 }],
      [{ ...ok, v: -1 }],
      [{ ...ok, t: 'OUTRO' }],
      [],
      [ok, { ...itensC007[1], q: 0 }],
    ];
    for (const itens of invalidos) assert.equal(await criar(ANA, { itens: JSON.stringify(itens) }), 0, JSON.stringify(itens));
    assert.equal(await criar(ANA, { nome: '   ' }), 0);
    assert.deepEqual([mixes(), itensTotal()], [m0, i0]);

    assert.ok(await criar(ANA, { nome: 'Totais do servidor', totalVenda: '999', totalCusto: '1', margemMedia: '99' }) > 0);
    const [m] = banco(`SELECT ID, TOTAL_CUSTO AS C, TOTAL_VENDA AS V, MARGEM_MEDIA AS M FROM PRODUCT_MIX WHERE NOME = 'Totais do servidor'`);
    assert.deepEqual([m.C, m.V, m.M], [900, 1250, 28]);

    // Atualizar com item invalido tambem nao mexe em nada.
    assert.equal((await chamar('s360MixAtualizar', {
      mixId: String(m.ID), nome: 'Mudou', descricao: '', clienteId: '9001', itens: JSON.stringify([{ ...ok, q: 0 }]), agora: agora(), hoje: HOJE,
    }, ANA)).affectedRows, 0);
    assert.equal(banco(`SELECT NOME FROM PRODUCT_MIX WHERE ID = ${m.ID}`)[0].NOME, 'Totais do servidor');
    assert.equal(banco(`SELECT COUNT(*) AS N FROM PRODUCT_MIX_ITEMS WHERE ID_MIX = ${m.ID}`)[0].N, 2);

    // Atualizar valido substitui os itens e recalcula.
    assert.ok((await chamar('s360MixAtualizar', {
      mixId: String(m.ID), nome: 'Mudou', descricao: 'nova', clienteId: '9002', itens: JSON.stringify([{ ...ok, q: 2, k: 80 }]), agora: agora(), hoje: HOJE,
    }, ANA)).affectedRows > 0);
    const [n] = banco(`SELECT NOME, ID_CLIENTE AS CL, TOTAL_VENDA AS V FROM PRODUCT_MIX WHERE ID = ${m.ID}`);
    assert.deepEqual([n.NOME, n.CL, n.V], ['Mudou', 9002, 200]);
    const [it] = banco(`SELECT QUANTIDADE AS Q, PRECO_CONCORRENTE AS K, CMV_PERCENT AS X FROM PRODUCT_MIX_ITEMS WHERE ID_MIX = ${m.ID}`);
    assert.deepEqual([it.Q, it.K, it.X], [2, 80, 87.5]);

    // Excluir: itens e cabecalho somem.
    assert.ok((await chamar('s360MixExcluir', { mixId: String(m.ID) }, ANA)).affectedRows > 0);
    assert.equal(banco(`SELECT COUNT(*) AS N FROM PRODUCT_MIX WHERE ID = ${m.ID}`)[0].N, 0);
    assert.equal(banco(`SELECT COUNT(*) AS N FROM PRODUCT_MIX_ITEMS WHERE ID_MIX = ${m.ID}`)[0].N, 0);
  });

  await teste('RN-014: catalogo so ativo, ate 8, sem acento e por codigo; cliente por nome, codigo e CNPJ', async () => {
    const whey = await catalogo('whey');
    assert.equal(whey.length, 8);
    assert.ok(!whey.some((p) => p.NOME.includes('Descontinuado')));
    assert.ok(!(await catalogo('Descontinuado')).length);
    assert.equal((await catalogo('acai'))[0]?.NOME, 'AÇAÍ EM PÓ 100g');
    assert.equal((await catalogo('F9714'))[0]?.CODPROD, 9714);
    assert.equal((await catalogo('')).length, 0);
    assert.ok((await clientes('mercado')).includes(9001));
    assert.ok((await clientes('emporio')).includes(9002));
    assert.ok((await clientes('12345678000190', ANA, HOJE, '12345678000190')).includes(9001));
    assert.ok((await clientes('12.345.678/0001-90', ANA, HOJE, '12345678000190')).includes(9001));
    assert.ok((await clientes('9900')).includes(9900));
    assert.ok(!(await clientes('Atacado')).includes(9005));
  });

  await teste('C-019 / RN-017: so foto https chega a tela', async () => {
    assert.equal((await catalogo('Dieta'))[0].FOTO_URL, 'https://fotos.benenutri.local/9714.jpg');
    assert.equal((await catalogo('Suplemento'))[0].FOTO_URL, '');
    assert.equal((await catalogo('Produto Novo'))[0].FOTO_URL, '');
  });

  await teste('RN-014: status de custos devolve a ultima atualizacao (UTC)', async () => {
    const [s] = await linhas('s360MixCustosStatus', {}, ANA);
    assert.equal(s.ULTIMA_ATUALIZACAO, '2026-10-30T14:00:00');
  });
}
