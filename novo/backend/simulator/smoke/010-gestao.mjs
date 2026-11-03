// Smoke da spec 010 — gestão, coordenação e diretoria (etapa 1).
// Rodado por ../smoke.mjs num banco descartável só deste arquivo.

export default async function ({ teste, chamar, linhas, banco, db, ID, assert }) {
  const id = (email) => Number(banco(`SELECT ID FROM INT_USER WHERE DESCR = '${email}@benenutri.local'`)[0].ID);
  const P = Object.fromEntries(['helena.duarte', 'igor.matos', 'julia.freitas', 'nina.alves', 'olga.pires', 'pedro.sales',
    'quesia.lemos', 'carlos.viana', 'davi.moura', 'rui.barros', 'sara.nunes', 'tereza.lima', 'ulisses.reis', 'vitor.gomes',
    'xavier.melo', 'yara.dias', 'joana.prates', 'renata.costa'].map((e) => [e.split('.')[0].toUpperCase(), id(e)]));
  const GESTOR = ID.PAULO; // GESTOR pelo legado (spec 001)
  const DIRETORIA = ID.GIL;
  const HOJE = '2026-10-30';
  const AGORA = '2026-10-30T10:00:00';
  const afetadas = async (nome, input, userId) => (await chamar(nome, input, userId)).affectedRows;
  const resumo = async (vendedorId = 0, userId = GESTOR) => (await linhas('s360PainelResumo', { hoje: HOJE, vendedorId }, userId))[0];
  const papeis = async (userId) => String((await linhas('s360SessaoObter', { hoje: HOJE }, userId))[0].PAPEIS).split(',').sort();
  const PAGINA = { busca: '', filtro: '', papel: '', limite: 50, offset: 0 };

  // "Toda a equipe" soma todo vendedor com RCA: isola os dados do Painel (plan, Simulador).
  for (const [tabela, chave] of [['PEDIDOS_SEMANAIS_SYNC_RAW', 'ID'], ['IMP_DEVOLUCOES_TOTVS', 'AUTO_ID'],
    ['METAS_BU_VENDEDOR', 'AUTO_ID'], ['TAREFAS', 'ID'], ['VISITAS', 'ID']]) {
    db.exec(`DELETE FROM ${tabela} WHERE ${chave} NOT BETWEEN 10001 AND 10999`);
  }

  /* ── Painel de Gestão ── */

  await teste('C-001: toda a equipe vê líquido contra a meta distribuída e vendas sem carteira à parte', async () => {
    const r = await resumo();
    assert.equal(Number(r.BRUTO), 50000);
    assert.equal(Number(r.DEVOLUCAO), 2000);
    assert.equal(Number(r.LIQUIDO), 48000);
    assert.equal(Number(r.META), 60000);
    assert.equal(Number(r.SEM_CARTEIRA_LIQUIDO), 3000);
    assert.equal(Number(r.SEM_CARTEIRA_CLIENTES), 2);
    assert.equal(r.ATUALIZADO_EM, '2026-10-30 06:00:00');
  });

  await teste('RN-005: meta da equipe = soma das metas distribuídas (20.000 + 25.000 + 15.000)', async () => {
    const metas = await Promise.all([P.HELENA, P.IGOR, P.JULIA].map(async (v) => Number((await resumo(v)).META)));
    assert.deepEqual(metas, [20000, 25000, 15000]);
  });

  await teste('RN-003: venda fora do escopo não conta; devolução de cliente da carteira desconta do vendedor e da equipe', async () => {
    const antes = await resumo(P.HELENA);
    assert.equal(Number(antes.BRUTO), 25000); // a venda de 2.000 em F1·Nutrição ficou de fora
    assert.equal(Number(antes.LIQUIDO), 24200);
    db.exec('DELETE FROM IMP_DEVOLUCOES_TOTVS WHERE AUTO_ID = 10001');
    assert.equal(Number((await resumo(P.HELENA)).LIQUIDO), 24400);
    assert.equal(Number((await resumo()).LIQUIDO), 48200);
    db.exec(`INSERT INTO IMP_DEVOLUCOES_TOTVS (AUTO_ID, NOTA_DEVOLUCAO, CODFILIAL, CODEPTO, CODCLI, DATA_DEVOLUCAO, VALOR_DEVOLVIDO)
             VALUES (10001, 'D10001', '6', '9', 10001, '2026-10-12', 200)`);
  });

  await teste('RNT-007 (férias): venda de cliente de Helena nas férias conta para Igor; o total da equipe conta a linha uma vez', async () => {
    assert.equal(Number((await resumo(P.IGOR)).BRUTO), 23000);
    assert.equal(Number((await resumo()).BRUTO), 50000);
  });

  await teste('C-002: Júlia sem meta distribuída devolve meta 0 e o líquido dela', async () => {
    db.exec(`DELETE FROM METAS_BU_VENDEDOR WHERE VENDEDOR_ID = ${P.JULIA}`);
    const r = await resumo(P.JULIA);
    assert.equal(Number(r.META), 0);
    assert.equal(Number(r.LIQUIDO), 5000);
    db.exec(`INSERT INTO METAS_BU_VENDEDOR (AUTO_ID, CODFILIAL, CODEPTO, VENDEDOR_ID, MES, ANO, META_VALOR) VALUES (10003, 6, 9, ${P.JULIA}, 10, 2026, 15000)`);
  });

  await teste('C-003: a fila põe o atrasado primeiro, com a ação da RN-007', async () => {
    const fila = await linhas('s360PainelFila', { hoje: HOJE, vendedorId: P.HELENA }, GESTOR);
    assert.deepEqual(fila.map((i) => [i.TIPO, i.DATA, i.ACAO]), [
      ['TAREFA', '2026-10-28', 'Cobrar conclusão imediata'],
      ['VISITA', '2026-10-29', 'Reagendar ou concluir hoje'],
      ['VISITA', '2026-11-03', 'Confirmar agenda com cliente'],
    ]);
  });

  await teste('RN-007: em andamento com prazo futuro, visitas pendentes, clientes ativos e limite de 60', async () => {
    const [igor] = await linhas('s360PainelFila', { hoje: HOJE, vendedorId: P.IGOR }, GESTOR);
    assert.equal(igor.ACAO, 'Acompanhar andamento');
    const [julia] = await linhas('s360PainelFila', { hoje: HOJE, vendedorId: P.JULIA }, GESTOR);
    assert.equal(julia.ACAO, 'Priorizar na próxima rotina');
    const helena = await resumo(P.HELENA);
    assert.equal(Number(helena.VISITAS_PENDENTES), 1);
    assert.equal(Number(helena.CLIENTES_ATIVOS), 3);
    for (let n = 0; n < 70; n += 1) {
      db.exec(`INSERT INTO TAREFAS (ID, VENDEDOR_ID, TITULO, STATUS, DATA_LIMITE) VALUES (${10100 + n}, ${P.JULIA}, 'Extra ${n}', 'PENDENTE', '2026-11-20')`);
    }
    assert.equal((await linhas('s360PainelFila', { hoje: HOJE, vendedorId: 0 }, GESTOR)).length, 60);
    db.exec('DELETE FROM TAREFAS WHERE ID BETWEEN 10100 AND 10169');
  });

  /* ── Comissões ── */

  await teste('C-010 / RN-011: comissão calculada no servidor; mesma vendedora + mês + ano é recusada; exclusão', async () => {
    const nova = { vendedorId: P.HELENA, mes: 10, ano: 2026, vendas: 50000, percentual: 3 };
    assert.equal(await afetadas('s360ComissaoCriar', nova, GESTOR), 1);
    assert.equal(await afetadas('s360ComissaoCriar', nova, GESTOR), 0);
    const [c] = await linhas('s360ComissaoListar', { ...PAGINA, busca: 'Helena' }, GESTOR);
    assert.equal(Number(c.VALOR_COMISSAO), 1500);
    assert.equal(Number(c.TOTAL), 1);
    assert.equal(await afetadas('s360ComissaoAtualizar', { ...nova, id: c.ID, vendas: 12345.67, percentual: 2.5 }, GESTOR), 1);
    assert.equal(Number((await linhas('s360ComissaoListar', { ...PAGINA, busca: 'Helena' }, GESTOR))[0].VALOR_COMISSAO), 308.64);
    assert.equal(await afetadas('s360ComissaoExcluir', { id: c.ID }, ID.ANA), 0);
    assert.equal(await afetadas('s360ComissaoExcluir', { id: c.ID }, GESTOR), 1);
  });

  /* ── BUs e escopos ── */

  await teste('C-011 / RN-012: BU só com código numérico do ERP e sem repetir', async () => {
    const criar = (codigo, nome) => afetadas('s360BuCriar', { codigo, nome, agora: AGORA }, GESTOR);
    assert.equal(await criar('NUTRI', 'Nutrição'), 0);
    assert.equal(await criar('12', 'Odonto'), 0);
    assert.equal(await criar('015', 'Estética'), 0);
    assert.equal(await criar('15', 'Estética'), 1);
    const bu = (await linhas('s360BuListar', {}, GESTOR)).find((b) => b.CODIGO === '15');
    assert.equal(bu.NOME, 'Estética');
    assert.equal(Number(bu.VENDEDORES), 0);
  });

  const escopo = (secoes, extra = {}) => ({ vendedorId: P.NINA, buCodigo: '1', codfilial: '1', secoes, agora: AGORA, ...extra });
  const ativosNina = () => banco(`SELECT ID, ID_SECAO FROM BU_VENDEDOR WHERE VENDEDOR_ID = ${P.NINA} AND BU_CODIGO = '1' AND ATIVO = 1 ORDER BY ID_SECAO`);

  await teste('C-012 / RN-013: três seções com uma já ativa → 2 vinculadas e 1 já existia; repetir não muda nada', async () => {
    assert.equal(await afetadas('s360EscopoReativar', escopo('10001,10002,10003'), GESTOR), 0);
    assert.equal(await afetadas('s360EscopoIncluir', escopo('10001,10002,10003'), GESTOR), 2);
    assert.deepEqual(ativosNina().map((e) => e.ID_SECAO), [10001, 10002, 10003]);
    assert.equal(await afetadas('s360EscopoReativar', escopo('10002'), GESTOR), 0);
    assert.equal(await afetadas('s360EscopoIncluir', escopo('10002'), GESTOR), 0);
  });

  await teste('C-013: desvincular inativa; recadastrar a mesma combinação reativa a mesma linha', async () => {
    const terceira = ativosNina().find((e) => e.ID_SECAO === 10003);
    assert.equal(await afetadas('s360EscopoDesvincular', { id: terceira.ID, agora: AGORA }, GESTOR), 1);
    assert.equal(ativosNina().length, 2);
    assert.equal(await afetadas('s360EscopoReativar', escopo('10003'), GESTOR), 1);
    assert.equal(await afetadas('s360EscopoIncluir', escopo('10003'), GESTOR), 0);
    assert.equal(ativosNina().find((e) => e.ID_SECAO === 10003).ID, terceira.ID);
    const lista = await linhas('s360EscopoListar', { ...PAGINA, busca: 'Nina' }, GESTOR);
    assert.equal(Number(lista[0].TOTAL), 4);
  });

  await teste('RN-012: BU inativa não aceita escopo novo; o existente segue ativo', async () => {
    assert.equal(await afetadas('s360BuStatusDefinir', { codigo: '13', ativo: 0, agora: AGORA }, GESTOR), 1);
    assert.equal(await afetadas('s360EscopoIncluir', escopo('10001', { buCodigo: '13' }), GESTOR), 0);
    assert.equal(await afetadas('s360EscopoIncluir', escopo('', { vendedorId: P.QUESIA, buCodigo: '13' }), GESTOR), 0);
    assert.equal(banco(`SELECT ATIVO FROM BU_VENDEDOR WHERE VENDEDOR_ID = ${P.NINA} AND BU_CODIGO = '13'`)[0].ATIVO, 1);
  });

  /* ── Governança RCA ── */

  const auditorias = () => banco('SELECT * FROM VENDEDOR_RCA_AUDITORIA ORDER BY ID');

  await teste('C-014: RCA de outra pessoa é recusado e não gera auditoria', async () => {
    const mudanca = { userId: P.PEDRO, codRca: 10936, codSupervisor: 10012, observacao: '', agora: AGORA };
    assert.equal(await afetadas('s360RcaAuditar', mudanca, GESTOR), 0);
    assert.equal(await afetadas('s360RcaVincular', mudanca, GESTOR), 0);
    assert.equal(auditorias().length, 0);
    assert.equal(banco(`SELECT COD_RCA FROM VENDEDOR_RCA WHERE USER_ID = ${P.PEDRO}`)[0].COD_RCA, 10940);
  });

  await teste('RN-014: trocar 10936 → 10937 audita os valores lidos do servidor, não os da tela', async () => {
    const mudanca = { userId: P.OLGA, codRca: 10937, codSupervisor: 10012, observacao: 'troca', agora: AGORA, anterior: 999 };
    assert.equal(await afetadas('s360RcaVincular', mudanca, GESTOR), 0); // sem auditoria, não grava
    assert.equal(await afetadas('s360RcaAuditar', mudanca, GESTOR), 1);
    assert.ok(await afetadas('s360RcaVincular', mudanca, GESTOR) > 0);
    const [a] = auditorias();
    assert.deepEqual([a.COD_RCA_ANTERIOR, a.COD_RCA_NOVO, a.ALTERADO_POR], [10936, 10937, GESTOR]);
    assert.equal(banco(`SELECT COD_RCA FROM VENDEDOR_RCA WHERE USER_ID = ${P.OLGA}`)[0].COD_RCA, 10937);
    assert.equal(await afetadas('s360RcaAuditar', mudanca, GESTOR), 0); // nada muda
  });

  await teste('C-015: remover o vínculo deixa o usuário sem RCA, com auditoria anterior 10940/10012', async () => {
    const agora = '2026-10-30T11:00:00';
    assert.equal(await afetadas('s360RcaAuditar', { userId: P.PEDRO, codRca: 0, codSupervisor: 0, observacao: '', agora }, GESTOR), 1);
    assert.equal(await afetadas('s360RcaRemover', { userId: P.PEDRO, agora }, GESTOR), 1);
    assert.equal(banco(`SELECT COUNT(*) AS N FROM VENDEDOR_RCA WHERE USER_ID = ${P.PEDRO}`)[0].N, 0);
    const a = auditorias().at(-1);
    assert.deepEqual([a.COD_RCA_ANTERIOR, a.COD_SUPERVISOR_ANTERIOR, a.COD_RCA_NOVO, a.COD_SUPERVISOR_NOVO, a.ALTERADO_POR, a.ALTERADO_EM],
      [10940, 10012, null, null, GESTOR, '2026-10-30 11:00:00']);
    const lista = await linhas('s360RcaAuditoriaListar', {}, GESTOR);
    assert.equal(lista[0].USUARIO, 'Pedro Sales');
  });

  /* ── Coordenadores e papéis ── */

  const coordenador = (extra = {}) => ({ codSupervisor: '10046', nome: 'Davi Moura', email: 'davi.moura@benenutri.local', userId: id('davi.moura'), ativo: 1, ...extra });

  await teste('C-016 / RN-015: cadastro e duas BUs; código não numérico e cadastros ativos repetidos são recusados', async () => {
    assert.equal(await afetadas('s360CoordenadorCriar', coordenador({ codSupervisor: '45A' }), DIRETORIA), 0);
    assert.equal(await afetadas('s360CoordenadorCriar', coordenador({ userId: 0 }), DIRETORIA), 0); // ativo sem usuário
    assert.equal(await afetadas('s360CoordenadorCriar', coordenador({ codSupervisor: '10047', userId: P.CARLOS }), DIRETORIA), 0);
    assert.equal(await afetadas('s360CoordenadorCriar', coordenador(), GESTOR), 0); // só diretoria
    assert.equal(await afetadas('s360CoordenadorCriar', coordenador(), DIRETORIA), 1);
    assert.equal(await afetadas('s360CoordenadorBuIncluir', { codSupervisor: '10046', bus: '1:1,2:1' }, DIRETORIA), 2);
    assert.equal(await afetadas('s360CoordenadorBuIncluir', { codSupervisor: '10046', bus: '1:1,2:1' }, DIRETORIA), 0);
    const davi = (await linhas('s360CoordenadorListar', {}, DIRETORIA)).find((c) => Number(c.COD_SUPERVISOR) === 10046);
    assert.deepEqual(String(davi.BUS).split(',').sort(), ['1:1', '2:1']);
    assert.equal(await afetadas('s360CoordenadorBuRemover', { codSupervisor: '10046', bus: '1:1' }, DIRETORIA), 1);
    assert.equal(await afetadas('s360CoordenadorStatusDefinir', { codSupervisor: '10046', ativo: 0 }, DIRETORIA), 1);
    // Segundo cadastro do Carlos, inativo, não pode ser ativado: ele já tem um ativo.
    assert.equal(await afetadas('s360CoordenadorCriar', coordenador({ codSupervisor: '10048', userId: P.CARLOS, ativo: 0, nome: 'Carlos 2' }), DIRETORIA), 1);
    assert.equal(await afetadas('s360CoordenadorStatusDefinir', { codSupervisor: '10048', ativo: 1 }, DIRETORIA), 0);
    assert.equal(await afetadas('s360CoordenadorAtualizar', coordenador({ codSupervisor: '10048', userId: P.CARLOS, ativo: 1, nome: 'Carlos 2' }), DIRETORIA), 0);
  });

  const salvarPapeis = async (userId, m) => {
    const input = { userId, diretoria: 0, coordenador: 0, vendedor: 0, ...m, agora: AGORA };
    await chamar('s360PapelIncluir', input, DIRETORIA);
    await chamar('s360PapelRemover', input, DIRETORIA);
    await chamar('s360PapelLegadoSincronizar', input, DIRETORIA);
  };

  await teste('C-017: marcar Coordenador para quem é GESTOR mantém GESTOR', async () => {
    await salvarPapeis(P.RUI, { coordenador: 1 });
    assert.deepEqual(await papeis(P.RUI), ['COORDENADOR', 'GESTOR']);
    const [r] = await linhas('s360PapelListar', { ...PAGINA, busca: 'Rui' }, DIRETORIA);
    assert.deepEqual(String(r.PAPEIS).split(',').sort(), ['COORDENADOR', 'GESTOR']);
  });

  await teste('RN-016 / D-010-2: desmarcar tira o papel nas duas tabelas; GESTOR e ADMIN não mudam por esta tela', async () => {
    await salvarPapeis(P.RUI, {});
    assert.deepEqual(await papeis(P.RUI), ['GESTOR']);
    await salvarPapeis(ID.TANIA, {});
    assert.deepEqual(await papeis(ID.TANIA), ['ADMIN']);
    db.exec(`INSERT INTO USUARIO_CARGO (USER_ID, CARGO) VALUES (${P.SARA}, 'COORDENADOR')`);
    assert.deepEqual(await papeis(P.SARA), ['COORDENADOR']);
    await salvarPapeis(P.SARA, { vendedor: 1 }); // COORDENADOR só no legado
    assert.deepEqual(await papeis(P.SARA), ['VENDEDOR']);
    assert.equal(banco(`SELECT CARGO FROM USUARIO_CARGO WHERE USER_ID = ${P.SARA}`)[0].CARGO, 'VENDEDOR');
    await salvarPapeis(P.SARA, { diretoria: 1, vendedor: 1 });
    assert.equal(banco(`SELECT CARGO FROM USUARIO_CARGO WHERE USER_ID = ${P.SARA}`)[0].CARGO, 'DIRETORIA');
    assert.equal(banco(`SELECT CARGO FROM USUARIO_CARGO WHERE USER_ID = ${ID.PAULO}`)[0].CARGO, 'GESTOR');
    await salvarPapeis(ID.PAULO, {});
    assert.equal(banco(`SELECT CARGO FROM USUARIO_CARGO WHERE USER_ID = ${ID.PAULO}`)[0].CARGO, 'GESTOR');
    const [cards] = await linhas('s360PapelResumo', {}, DIRETORIA);
    assert.ok(Number(cards.DIRETORIA) >= 2 && Number(cards.OUTROS) >= 2);
  });

  /* ── Férias ── */

  const ferias = (titularId, substitutoId, inicio, fim) => afetadas('s360FeriasCadastrar', { titularId, substitutoId, inicio, fim }, P.CARLOS);

  await teste('C-021: férias sobrepostas do mesmo titular são recusadas', async () => {
    assert.equal(await ferias(P.TEREZA, P.ULISSES, '2026-11-10', '2026-11-20'), 0);
  });

  await teste('RN-020: substituto sem RCA, igual ao titular, datas invertidas, conflitos de substituição e fora da equipe', async () => {
    assert.equal(await ferias(P.JOANA, P.YARA, '2026-12-20', '2026-12-30'), 0);
    assert.equal(await ferias(P.JOANA, P.JOANA, '2026-12-20', '2026-12-30'), 0);
    assert.equal(await ferias(P.JOANA, P.TEREZA, '2026-12-30', '2026-12-20'), 0);
    assert.equal(await ferias(P.XAVIER, P.JOANA, '2026-11-01', '2026-11-05'), 0); // Xavier substitui Vítor
    assert.equal(await ferias(P.JOANA, P.VITOR, '2026-10-25', '2026-10-28'), 0); // Vítor está de férias
    assert.equal(await ferias(P.RENATA, P.JOANA, '2026-12-20', '2026-12-30'), 0); // fora da equipe de Carlos
    assert.equal(await ferias(P.JOANA, P.TEREZA, '2026-12-20', '2026-12-30'), 1);
    assert.equal(await afetadas('s360FeriasCadastrar', { titularId: P.RENATA, substitutoId: P.JOANA, inicio: '2027-01-05', fim: '2027-01-09' }, DIRETORIA), 1);
  });

  await teste('C-022: encerrar ativa termina hoje; encerrar futura cancela sem fim antes do início', async () => {
    const lista = await linhas('s360FeriasListar', { hoje: HOJE }, P.CARLOS);
    const vitor = lista.find((f) => f.TITULAR === 'Vítor Gomes');
    const futura = lista.find((f) => f.TITULAR === 'Tereza Lima' && f.DT_INICIO === '2026-12-01');
    assert.equal(vitor.ESTADO, 'ATIVA');
    assert.equal(futura.ESTADO, 'FUTURA');
    assert.equal(await afetadas('s360FeriasEncerrar', { id: vitor.ID, hoje: HOJE }, P.CARLOS), 1);
    assert.equal(await afetadas('s360FeriasEncerrar', { id: futura.ID, hoje: HOJE }, P.CARLOS), 1);
    const [v] = banco(`SELECT DT_FIM, ATIVO FROM FERIAS_VENDEDOR WHERE AUTO_ID = ${vitor.ID}`);
    const [t] = banco(`SELECT DT_FIM, ATIVO FROM FERIAS_VENDEDOR WHERE AUTO_ID = ${futura.ID}`);
    assert.deepEqual([v.DT_FIM, v.ATIVO, t.DT_FIM, t.ATIVO], ['2026-10-30', 1, '2026-12-15', 0]);
  });

  /* ── Executivas ── */

  const executivas = async (userId, extra = {}) => linhas('s360ExecutivaListar', { ...PAGINA, ...extra }, userId);

  await teste('RN-021: Carlos vê a equipe, sem diretoria, sem coordenador ativo e sem ele mesmo', async () => {
    const nomes = (await executivas(P.CARLOS)).map((e) => e.NOME);
    assert.ok(nomes.includes('Joana Prates') && nomes.includes('Ana Souza'));
    for (const fora of ['Gil Prado', 'Carlos Viana', 'Renata Costa']) assert.ok(!nomes.includes(fora), fora);
    const globais = (await executivas(DIRETORIA)).map((e) => e.NOME);
    assert.ok(globais.includes('Renata Costa') && !globais.includes('Gil Prado'));
  });

  await teste('C-023: Carlos desativa Joana; ela é recusada em tudo e a carteira não muda', async () => {
    await chamar('s360ExecutivaAcessoGarantir', { userId: P.JOANA }, P.CARLOS);
    const carteira = banco(`SELECT COUNT(*) AS N FROM EQUIPE_CLIENTE WHERE ID_VENDEDOR = ${P.JOANA}`)[0].N;
    assert.equal(await afetadas('s360ExecutivaAcessoAlterar', { userId: P.JOANA, bloqueado: 1, motivo: 'Desligamento', agora: AGORA }, P.CARLOS), 1);
    const [b] = banco(`SELECT * FROM USUARIO_BLOQUEIO WHERE USER_ID = ${P.JOANA}`);
    assert.deepEqual([b.BLOQUEADO, b.MOTIVO, b.ATUALIZADO_POR, b.ATUALIZADO_EM], [1, 'Desligamento', P.CARLOS, '2026-10-30 10:00:00']);
    assert.equal(Number((await linhas('s360SessaoObter', { hoje: HOJE }, P.JOANA))[0].BLOQUEADO), 1);
    assert.equal((await linhas('s360ContadoresObter', {}, P.JOANA)).length, 0);
    const [primeira] = await executivas(P.CARLOS);
    assert.equal(primeira.NOME, 'Joana Prates'); // desativadas primeiro
    assert.equal((await executivas(P.CARLOS, { filtro: 'DESATIVADAS' })).length, 1);
    assert.equal(banco(`SELECT COUNT(*) AS N FROM EQUIPE_CLIENTE WHERE ID_VENDEDOR = ${P.JOANA}`)[0].N, carteira);
  });

  await teste('RN-022: motivo acima de 500 é recusado; reativar libera na hora', async () => {
    assert.equal(await afetadas('s360ExecutivaAcessoAlterar', { userId: P.JOANA, bloqueado: 1, motivo: 'x'.repeat(600), agora: AGORA }, P.CARLOS), 0);
    assert.equal(await afetadas('s360ExecutivaAcessoAlterar', { userId: P.JOANA, bloqueado: 0, motivo: '', agora: AGORA }, P.CARLOS), 1);
    assert.equal((await linhas('s360ContadoresObter', {}, P.JOANA)).length, 1);
  });

  await teste('C-024: executiva fora das BUs do coordenador não aparece e o pedido forçado é recusado', async () => {
    await chamar('s360ExecutivaAcessoGarantir', { userId: P.RENATA }, P.CARLOS);
    await chamar('s360ExecutivaAcessoGarantir', { userId: P.RENATA }, DIRETORIA);
    assert.equal(await afetadas('s360ExecutivaAcessoAlterar', { userId: P.RENATA, bloqueado: 1, motivo: '', agora: AGORA }, P.CARLOS), 0);
    assert.equal(banco(`SELECT BLOQUEADO FROM USUARIO_BLOQUEIO WHERE USER_ID = ${P.RENATA}`)[0].BLOQUEADO, 0);
  });

  /* ── RN-001: matriz papel × tela ── */

  await teste('RN-001: cada tela recusa os perfis fora da linha e libera os da linha', async () => {
    await chamar('s360ComissaoCriar', { vendedorId: P.IGOR, mes: 9, ano: 2026, vendas: 1000, percentual: 1 }, GESTOR);
    const carga = [
      ['s360PainelResumo', { hoje: HOJE, vendedorId: 0 }, GESTOR],
      ['s360ComissaoListar', PAGINA, GESTOR],
      ['s360BuListar', {}, GESTOR],
      ['s360EscopoListar', PAGINA, GESTOR],
      ['s360RcaVinculoListar', PAGINA, ID.TANIA],
      ['s360CoordenadorListar', {}, DIRETORIA],
      ['s360PapelListar', PAGINA, ID.TANIA],
      ['s360FeriasPessoas', {}, P.CARLOS],
      ['s360ExecutivaListar', PAGINA, P.CARLOS],
    ];
    for (const [nome, input, permitido] of carga) {
      assert.equal((await linhas(nome, input, ID.ANA)).length, 0, `${nome} como vendedora`);
      assert.ok((await linhas(nome, input, permitido)).length > 0, `${nome} como permitido`);
    }
    // Gestão não abre telas de diretoria, nem diretoria as de gestão.
    assert.equal((await linhas('s360CoordenadorListar', {}, GESTOR)).length, 0);
    assert.equal((await linhas('s360PainelResumo', { hoje: HOJE, vendedorId: 0 }, DIRETORIA)).length, 0);
    // COORDENADOR sem cadastro ativo (Rita, spec 001) não abre as telas do coordenador.
    assert.equal((await linhas('s360FeriasPessoas', {}, ID.RITA)).length, 0);
    assert.equal((await linhas('s360ExecutivaListar', PAGINA, ID.RITA)).length, 0);
    // Bloqueado não lê nada (RN-016 da 001).
    assert.equal((await linhas('s360PainelResumo', { hoje: HOJE, vendedorId: 0 }, ID.FABIO)).length, 0);
  });
}
