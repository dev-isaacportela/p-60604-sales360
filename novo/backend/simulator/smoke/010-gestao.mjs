// Smoke da spec 010 — gestão, coordenação e diretoria (etapa 1).
// Rodado por ../smoke.mjs num banco descartável só deste arquivo.

import { definitions } from '../../add-010-gestao.mjs';

export default async function ({ teste, chamar, linhas, banco, db, ID, assert }) {
  const id = (email) => Number(banco(`SELECT ID FROM INT_USER WHERE DESCR = '${email}@benenutri.local'`)[0].ID);
  const P = Object.fromEntries(['nina.alves', 'olga.pires', 'pedro.sales',
    'quesia.lemos', 'carlos.viana', 'davi.moura', 'rui.barros', 'sara.nunes', 'tereza.lima', 'ulisses.reis', 'vitor.gomes',
    'xavier.melo', 'yara.dias', 'joana.prates', 'renata.costa'].map((e) => [e.split('.')[0].toUpperCase(), id(e)]));
  const GESTOR = ID.PAULO; // GESTOR pelo legado (spec 001)
  const DIRETORIA = ID.GIL;
  const HOJE = '2026-10-30';
  const AGORA = '2026-10-30T10:00:00';
  const afetadas = async (nome, input, userId) => (await chamar(nome, input, userId)).affectedRows;
  const papeis = async (userId) => String((await linhas('s360SessaoObter', { hoje: HOJE }, userId))[0].PAPEIS).split(',').sort();
  const PAGINA = { busca: '', filtro: '', papel: '', limite: 50, offset: 0 };

  /* ── Usuários: escopos ── */

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

  await teste('RN-012: BU inativa (vem do ERP) não aceita escopo novo; o existente segue ativo; nenhuma SF grava BU', async () => {
    assert.ok(definitions.every((d) => !/(INSERT INTO|UPDATE|DELETE FROM|REPLACE INTO)s+BU/.test(d.code)));
    db.exec("UPDATE BU SET ATIVO = 0 WHERE TRIM(CODIGO) = '13'"); // carga do ERP (RN-024)
    assert.equal(await afetadas('s360EscopoIncluir', escopo('10001', { buCodigo: '13' }), GESTOR), 0);
    assert.equal(await afetadas('s360EscopoIncluir', escopo('', { vendedorId: P.QUESIA, buCodigo: '13' }), GESTOR), 0);
    assert.equal(banco(`SELECT ATIVO FROM BU_VENDEDOR WHERE VENDEDOR_ID = ${P.NINA} AND BU_CODIGO = '13'`)[0].ATIVO, 1);
  });

  /* ── Usuários: vínculo RCA ── */

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
    const carga = [
      ['s360EscopoListar', PAGINA, GESTOR],
      ['s360PapelListar', PAGINA, GESTOR],
      ['s360CoordenadorListar', {}, DIRETORIA],
      ['s360PapelListar', PAGINA, DIRETORIA],
      ['s360PapelResumo', {}, DIRETORIA],
      ['s360FeriasPessoas', {}, P.CARLOS],
      ['s360ExecutivaListar', PAGINA, P.CARLOS],
    ];
    for (const [nome, input, permitido] of carga) {
      assert.equal((await linhas(nome, input, ID.ANA)).length, 0, `${nome} como vendedora`);
      assert.ok((await linhas(nome, input, permitido)).length > 0, `${nome} como permitido`);
    }
    // Gestão não abre telas de diretoria, nem diretoria as de gestão.
    assert.equal((await linhas('s360CoordenadorListar', {}, GESTOR)).length, 0);
    assert.equal((await linhas('s360RcaAuditoriaListar', {}, DIRETORIA)).length, 0);
    assert.ok((await linhas('s360RcaAuditoriaListar', {}, GESTOR)).length > 0);
    // Usuários: cada papel grava só a sua parte.
    assert.equal((await linhas('s360PapelResumo', {}, GESTOR)).length, 0);
    assert.equal(await afetadas('s360PapelIncluir', { userId: ID.BRUNO, diretoria: 1, coordenador: 0, vendedor: 1, agora: AGORA }, GESTOR), 0);
    assert.equal(await afetadas('s360RcaAuditar', { userId: ID.BRUNO, codRca: 10941, codSupervisor: 0, observacao: '', agora: AGORA }, DIRETORIA), 0);
    assert.equal(await afetadas('s360EscopoIncluir', escopo('', { vendedorId: ID.BRUNO, buCodigo: '12', codfilial: '2' }), DIRETORIA), 0);
    assert.equal(await afetadas('s360EscopoIncluir', escopo('', { vendedorId: ID.BRUNO, buCodigo: '12', codfilial: '2' }), GESTOR), 1);
    assert.equal(await afetadas('s360RcaAuditar', { userId: ID.BRUNO, codRca: 10941, codSupervisor: 0, observacao: '', agora: AGORA }, GESTOR), 1);
    // COORDENADOR sem cadastro ativo (Rita, spec 001) não abre as telas do coordenador.
    assert.equal((await linhas('s360FeriasPessoas', {}, ID.RITA)).length, 0);
    assert.equal((await linhas('s360ExecutivaListar', PAGINA, ID.RITA)).length, 0);
    // Bloqueado não lê nada (RN-016 da 001).
    assert.equal((await linhas('s360PapelListar', PAGINA, ID.FABIO)).length, 0);
  });
}
