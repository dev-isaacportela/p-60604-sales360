// Fluxo ponta a ponta em banco descartavel — a suite de testes do backend.
//
// Roda as SFs de verdade (o SQL literal dos add-NNN, o mesmo publicado) e
// verifica com assert o que a spec exige. Cada cenario C-00N e regra RN-00N
// que passa pelo backend tem um `teste()` com o id no titulo (mapa de testes
// em docs/specs/001-acesso-e-perfis/plan.md).
//
// Uso: cd novo/backend && npm run sim:smoke   (ou npm test, que roda check + smoke)

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SEED } from './config.mjs';
import { seedDatabase, ID } from './seed.mjs';
import { registerMysqlFunctions, toSqlite } from './mysql-dialect.mjs';
import { loadDefinitions, createRunner } from './runtime.mjs';

const DB = join(tmpdir(), `mitra-${SEED}-smoke.db`);
rmSync(DB, { force: true });
seedDatabase(DB, { reset: true });

const db = new DatabaseSync(DB);
registerMysqlFunctions(db);
const { byName } = await loadDefinitions();
const { cargaInicial } = await import('../add-001-acesso.mjs');
const execute = createRunner(db);

const chamar = (nome, input, userId) => {
  const definicao = byName.get(nome);
  assert.ok(definicao, `server function ${nome} nao existe em PUBLISH_ORDER`);
  return execute(definicao, input, userId);
};
const linhas = async (nome, input, userId) => (await chamar(nome, input, userId)).rows;
const sessao = async (userId) => (await linhas('s360SessaoObter', { hoje: '2026-10-30' }, userId))[0];
const papeis = (s) => String(s.PAPEIS).split(',').sort();
const banco = (sql) => db.prepare(sql).all().map((r) => ({ ...r }));

const AGORA = '2026-10-30T10:00:00';
const valido = { nome: 'Diego R.', modoAgenda: 'DIA', exibicaoAtividades: 'KANBAN', paginaInicial: '/clientes', agora: AGORA };
const salvar = async (userId, mudancas = {}) =>
  (await chamar('s360ConfiguracoesSalvar', { ...valido, ...mudancas }, userId)).affectedRows;

let feitos = 0;
const teste = async (titulo, fn) => {
  try {
    await fn();
  } catch (erro) {
    console.log(`  FALHOU  ${titulo}\n          ${erro.message}`);
    db.close();
    process.exit(1);
  }
  feitos += 1;
  console.log(`  ok  ${titulo}`);
};

await teste('RNT-012: a sessao e de quem chama (:VAR_USER), nunca do input', async () => {
  const [s] = await linhas('s360SessaoObter', { hoje: '2026-10-30', userId: ID.TANIA, email: 'tania.lopes@benenutri.local' }, ID.ANA);
  assert.equal(s.EMAIL, 'ana.souza@benenutri.local');
  assert.equal(Number(s.USER_ID), ID.ANA);
});

await teste('C-001 / RN-004: Ana entra com as preferencias gravadas', async () => {
  const s = await sessao(ID.ANA);
  assert.equal(s.NOME_EXIBICAO, 'Ana Souza');
  assert.deepEqual(papeis(s), ['VENDEDOR']);
  assert.equal(s.PAGINA_INICIAL, '/agenda');
  assert.equal(s.MODO_AGENDA, 'SEMANA');
  assert.equal(s.EXIBICAO_TAREFAS, 'LISTA');
  assert.equal(Number(s.BLOQUEADO), 0);
  assert.equal(Number(s.CONFIGURADO), 1);
});

await teste('C-006 / RN-016: bloqueado recebe BLOQUEADO = 1 e nada mais funciona; desbloqueado volta', async () => {
  assert.equal(Number((await sessao(ID.FABIO)).BLOQUEADO), 1);
  assert.equal((await linhas('s360ContadoresObter', {}, ID.FABIO)).length, 0);
  assert.equal((await linhas('s360FeriasMinhasObter', { hoje: '2026-10-30' }, ID.FABIO)).length, 0);
  assert.equal(await salvar(ID.FABIO), 0);
  assert.equal(banco(`SELECT NOME FROM INT_USER WHERE ID = ${ID.FABIO}`)[0].NOME, 'Fábio Nunes');
  db.exec(`UPDATE USUARIO_BLOQUEIO SET BLOQUEADO = 0 WHERE USER_ID = ${ID.FABIO}`);
  const [c] = await linhas('s360ContadoresObter', {}, ID.FABIO);
  assert.equal(Number(c.ATIVIDADES_PENDENTES), 1);
  db.exec(`UPDATE USUARIO_BLOQUEIO SET BLOQUEADO = 1 WHERE USER_ID = ${ID.FABIO}`);
});

await teste('RN-005: papeis acumulam pela uniao do cadastro novo com o legado', async () => {
  assert.deepEqual(papeis(await sessao(ID.PAULO)), ['COORDENADOR', 'GESTOR']);
  assert.deepEqual(papeis(await sessao(ID.GIL)), ['COORDENADOR', 'DIRETORIA']);
  assert.deepEqual(papeis(await sessao(ID.TANIA)), ['ADMIN']);
});

await teste('RN-005: sem papel nenhum, a pessoa e VENDEDOR', async () => {
  assert.deepEqual(papeis(await sessao(ID.FERNANDO)), ['VENDEDOR']);
});

await teste('RN-006: coordenador vale pelo cadastro ativo, nao pelo papel', async () => {
  assert.equal(Number((await sessao(ID.RITA)).COORDENADOR_ATIVO), 0);
  assert.equal(Number((await sessao(ID.GIL)).COORDENADOR_ATIVO), 1);
  db.exec(`UPDATE COORDENADORES SET ATIVO = 0 WHERE USER_ID = ${ID.GIL}`);
  assert.equal(Number((await sessao(ID.GIL)).COORDENADOR_ATIVO), 0);
  db.exec(`UPDATE COORDENADORES SET ATIVO = 1 WHERE USER_ID = ${ID.GIL}`);
});

await teste('C-009 / RN-008: contadores de Ana; concluir uma tarefa baixa o contador', async () => {
  let [c] = await linhas('s360ContadoresObter', {}, ID.ANA);
  assert.equal(Number(c.ATIVIDADES_PENDENTES), 3);
  assert.equal(Number(c.ALERTAS_NAO_LIDOS), 4);
  db.exec(`UPDATE TAREFAS SET STATUS = 'CONCLUIDA' WHERE VENDEDOR_ID = ${ID.ANA} AND STATUS = 'EM_ANDAMENTO'`);
  [c] = await linhas('s360ContadoresObter', {}, ID.ANA);
  assert.equal(Number(c.ATIVIDADES_PENDENTES), 2);
});

await teste('C-010: preferencia KANBAN de Bruno chega na sessao', async () => {
  assert.equal((await sessao(ID.BRUNO)).EXIBICAO_TAREFAS, 'KANBAN');
});

await teste('C-011 / RN-011: Painel de Gestao como pagina inicial so para GESTOR ou ADMIN', async () => {
  assert.equal(await salvar(ID.CARLA, { nome: 'Carla Mendes', paginaInicial: '/painel-gestao' }), 0);
  assert.ok(await salvar(ID.PAULO, { nome: 'Paulo Reis', paginaInicial: '/painel-gestao' }) > 0);
  assert.ok(await salvar(ID.TANIA, { nome: 'Tânia Lopes', paginaInicial: '/painel-gestao' }) > 0);
});

await teste('RN-011: pagina inicial fora da lista (tela cancelada) e recusada', async () => {
  assert.equal(await salvar(ID.EVA, { nome: 'Eva Castro', paginaInicial: '/ajuda' }), 0);
  assert.equal(await salvar(ID.EVA, { nome: 'Eva Castro', paginaInicial: '/solicitacoes-compras' }), 0);
});

await teste('C-012 / RN-012: ferias de Ana como titular, antes, durante e depois', async () => {
  let f = await linhas('s360FeriasMinhasObter', { hoje: '2026-10-30' }, ID.ANA);
  assert.equal(f.length, 1);
  assert.deepEqual({ ...f[0] }, { PAPEL_FERIAS: 'TITULAR', ESTADO: 'FUTURA', DT_INICIO: '2026-11-01', DT_FIM: '2026-11-15', OUTRA_PESSOA: 'Bruno Lima' });
  f = await linhas('s360FeriasMinhasObter', { hoje: '2026-11-05' }, ID.ANA);
  assert.equal(f[0].ESTADO, 'ATIVA');
  assert.equal(f[0].PAPEL_FERIAS, 'TITULAR');
  f = await linhas('s360FeriasMinhasObter', { hoje: '2026-11-16' }, ID.ANA);
  assert.equal(f.length, 0, 'ferias inativas de dezembro nao contam');
});

await teste('RN-012 (substituto): Bruno ve que cobre Ana', async () => {
  const f = await linhas('s360FeriasMinhasObter', { hoje: '2026-11-05' }, ID.BRUNO);
  assert.equal(f.length, 1);
  assert.equal(f[0].PAPEL_FERIAS, 'SUBSTITUTO');
  assert.equal(f[0].ESTADO, 'ATIVA');
  assert.equal(f[0].OUTRA_PESSOA, 'Ana Souza');
  assert.equal(f[0].DT_FIM, '2026-11-15');
});

await teste('C-013 / RN-014: Diego sem preferencias — garantir, recusar invalido, gravar valido', async () => {
  const contar = () => banco(`SELECT COUNT(*) AS N FROM USUARIO_PREFERENCIAS WHERE USER_ID = ${ID.DIEGO}`)[0].N;
  assert.equal(contar(), 0);
  assert.equal((await sessao(ID.DIEGO)).MODO_AGENDA, 'SEMANA', 'sem linha valem os padroes');
  await chamar('s360ConfiguracoesGarantir', { agora: AGORA }, ID.DIEGO);
  assert.equal(contar(), 1);
  assert.equal(await salvar(ID.DIEGO, { modoAgenda: 'ANO' }), 0);
  assert.equal(await salvar(ID.DIEGO, { exibicaoAtividades: 'GRADE' }), 0);
  assert.equal(banco(`SELECT NOME FROM INT_USER WHERE ID = ${ID.DIEGO}`)[0].NOME, 'Diego Ramos', 'recusa nao grava o nome');
  assert.ok(await salvar(ID.DIEGO) > 0);
  const s = await sessao(ID.DIEGO);
  assert.deepEqual([s.NOME_EXIBICAO, s.MODO_AGENDA, s.EXIBICAO_TAREFAS, s.PAGINA_INICIAL], ['Diego R.', 'DIA', 'KANBAN', '/clientes']);
  assert.equal(banco(`SELECT ATUALIZADO_EM FROM USUARIO_PREFERENCIAS WHERE USER_ID = ${ID.DIEGO}`)[0].ATUALIZADO_EM, '2026-10-30 10:00:00');
  await chamar('s360ConfiguracoesGarantir', { agora: AGORA }, ID.DIEGO);
  assert.equal(contar(), 1, 'garantir de novo nao duplica');
});

await teste('RN-010: nome vazio volta ao nome da conta; mais de 120 caracteres e recusado', async () => {
  assert.equal(await salvar(ID.EVA, { nome: 'x'.repeat(121) }), 0);
  assert.ok(await salvar(ID.EVA, { nome: 'x'.repeat(120) }) > 0);
  assert.ok(await salvar(ID.EVA, { nome: '   ' }) > 0);
  assert.equal((await sessao(ID.EVA)).NOME_EXIBICAO, 'eva.castro@benenutri.local');
  assert.ok(await salvar(ID.EVA, { nome: "Eva D'Ávila" }) > 0, 'aspas no nome sao dado, nao SQL');
  assert.equal((await sessao(ID.EVA)).NOME_EXIBICAO, "Eva D'Ávila");
});

await teste('C-015 / RN-017: Fernando sem RCA nem escopo esta nao configurado', async () => {
  assert.equal(Number((await sessao(ID.FERNANDO)).CONFIGURADO), 0);
  assert.equal(Number((await sessao(ID.GIL)).CONFIGURADO), 0, 'a tela decide o aviso pelos papeis');
  assert.equal(Number((await sessao(ID.CARLA)).CONFIGURADO), 1);
});

await teste('RNT-001: carga inicial copia USUARIO_CARGO para USUARIO_PAPEL uma vez so', async () => {
  const total = () => banco('SELECT COUNT(*) AS N FROM USUARIO_PAPEL')[0].N;
  const antes = total();
  db.prepare(toSqlite(cargaInicial('2026-10-30 10:00:00'))).run();
  assert.equal(total(), antes + 2, 'Gil COORDENADOR e Paulo GESTOR');
  db.prepare(toSqlite(cargaInicial('2026-10-30 10:00:00'))).run();
  assert.equal(total(), antes + 2, 'rodar de novo nao duplica');
});

await teste('dialeto (T-084): UPDATE ... JOIN e tudo ou nada', async () => {
  const definicao = { type: 'SQL', code: `UPDATE INT_USER U JOIN USUARIO_PREFERENCIAS P ON P.USER_ID = U.ID
SET U.NOME = 'Nao pode gravar', P.USER_ID = NULL WHERE U.ID = :VAR_USER` };
  await assert.rejects(() => execute(definicao, {}, ID.BRUNO));
  assert.equal(banco(`SELECT NOME FROM INT_USER WHERE ID = ${ID.BRUNO}`)[0].NOME, 'Bruno Lima');
  assert.equal(banco(`SELECT COUNT(*) AS N FROM USUARIO_PREFERENCIAS WHERE USER_ID = ${ID.BRUNO}`)[0].N, 1);
});

console.log(`\n  ${feitos} verificacoes passaram.`);
db.close();
