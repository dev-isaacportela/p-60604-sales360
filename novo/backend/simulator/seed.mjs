// Dados simulados do Comercial Externo 360 (sistema novo).
//
// O SCHEMA nao esta aqui: sai de schema-producao.mjs e dos add-NNN via
// schema.mjs. Aqui so o DADO, um usuario por cenario da spec (tabela "Seed"
// de docs/specs/001-acesso-e-perfis/plan.md).
//
// Datas FIXAS em torno de 30/10/2026: os cenarios de ferias dependem de
// "hoje", e a tela/smoke passam `hoje` explicito (D-007), entao o banco nao
// precisa andar com o relogio.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { createSchema } from './schema.mjs';

// A ordem define o INT_USER.ID (1-based) — o smoke usa esses ids.
export const USUARIOS = [
  { nome: 'Ana Souza', email: 'ana.souza@benenutri.local' },        // 1  C-001 C-009 C-010 C-012
  { nome: 'Bruno Lima', email: 'bruno.lima@benenutri.local' },      // 2  C-010 RN-012 (substituto)
  { nome: 'Carla Mendes', email: 'carla.mendes@benenutri.local' },  // 3  C-011
  { nome: 'Diego Ramos', email: 'diego.ramos@benenutri.local' },    // 4  C-004 C-013 (sem preferencias)
  { nome: 'Eva Castro', email: 'eva.castro@benenutri.local' },      // 5  C-005 C-014
  { nome: 'Fábio Nunes', email: 'fabio.nunes@benenutri.local' },    // 6  C-006 (bloqueado)
  { nome: 'Fernando Alves', email: 'fernando.alves@benenutri.local' }, // 7  C-015 (nao configurado)
  { nome: 'Gil Prado', email: 'gil.prado@benenutri.local' },        // 8  C-007 (diretoria + coordenador ativo)
  { nome: 'Paulo Reis', email: 'paulo.reis@benenutri.local' },      // 9  RN-005 RN-013 (uniao de papeis)
  { nome: 'Rita Gomes', email: 'rita.gomes@benenutri.local' },      // 10 RN-006 (coordenadora sem cadastro)
  { nome: 'Tânia Lopes', email: 'tania.lopes@benenutri.local', accessLevel: 'ADMIN' }, // 11 RN-005 (ADMIN = TI)
];

export const ID = Object.fromEntries(USUARIOS.map((u, i) => [u.nome.split(' ')[0].normalize('NFD').replace(/\p{M}/gu, '').toUpperCase(), i + 1]));

export function seedDatabase(dbPath, { reset = false } = {}) {
  if (reset) {
    for (const sufixo of ['', '-wal', '-shm']) rmSync(`${dbPath}${sufixo}`, { force: true });
  }
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  createSchema(db);
  const counts = {};
  const inserir = (tabela, colunas, linhas) => {
    const stmt = db.prepare(`INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})`);
    for (const linha of linhas) stmt.run(...linha);
    counts[tabela] = (counts[tabela] || 0) + linhas.length;
  };
  const { ANA, BRUNO, CARLA, DIEGO, EVA, FABIO, FERNANDO, GIL, PAULO, RITA, TANIA } = ID;

  inserir('INT_USER', ['DESCR', 'NOME', 'ACCESS_LEVEL', 'ATIVO'],
    USUARIOS.map((u) => [u.email, u.nome, u.accessLevel || 'MEMBER', 1]));

  // Papeis novos (acumulam) e o legado de um papel por pessoa (D-003).
  inserir('USUARIO_PAPEL', ['USER_ID', 'PAPEL', 'ATRIBUIDO_EM'], [
    ...[ANA, BRUNO, CARLA, DIEGO, EVA, FABIO].map((id) => [id, 'VENDEDOR', '2026-10-01 08:00:00']),
    [GIL, 'DIRETORIA', '2026-10-01 08:00:00'],
    [PAULO, 'COORDENADOR', '2026-10-01 08:00:00'],
    [RITA, 'COORDENADOR', '2026-10-01 08:00:00'],
    [TANIA, 'ADMIN', '2026-10-01 08:00:00'],
  ]);
  inserir('USUARIO_CARGO', ['USER_ID', 'CARGO'], [[GIL, 'COORDENADOR'], [PAULO, 'GESTOR']]);
  inserir('COORDENADORES', ['COD_SUPERVISOR', 'NOME', 'EMAIL', 'USER_ID', 'ATIVO'], [
    [900, 'Gil Prado', USUARIOS[GIL - 1].email, GIL, 1],
  ]);

  // Configuracao comercial (RN-017). Fernando fica sem nada.
  inserir('VENDEDOR_RCA', ['USER_ID', 'COD_RCA', 'COD_SUPERVISOR'], [
    [ANA, 101, 900], [BRUNO, 102, 900], [DIEGO, 103, 900], [EVA, 104, 900], [FABIO, 105, 900], [CARLA, 106, 900],
  ]);
  inserir('BU_VENDEDOR', ['BU_CODIGO', 'VENDEDOR_ID', 'ATIVO', 'CODFILIAL', 'ID_SECAO', 'CRIADO_EM'], [
    ['1', ANA, 1, '1', null, '2026-10-01 08:00:00'],
    ['1', BRUNO, 1, '1', null, '2026-10-01 08:00:00'],
  ]);

  // Preferencias no formato do antigo (D-005). Diego e Fernando sem linha.
  inserir('USUARIO_PREFERENCIAS', ['USER_ID', 'MODO_AGENDA', 'EXIBICAO_TAREFAS', 'PAGINA_INICIAL', 'ATUALIZADO_EM'], [
    [ANA, 'SEMANA', 'LISTA', '/agenda', '2026-10-20 09:00:00'],
    [BRUNO, 'SEMANA', 'KANBAN', '/', '2026-10-20 09:00:00'],
    [CARLA, 'SEMANA', 'LISTA', '/painel-gestao', '2026-10-20 09:00:00'],
    ...[EVA, FABIO, GIL, PAULO, RITA, TANIA].map((id) => [id, 'SEMANA', 'LISTA', '/', '2026-10-20 09:00:00']),
  ]);

  inserir('USUARIO_BLOQUEIO', ['USER_ID', 'BLOQUEADO', 'MOTIVO', 'ATUALIZADO_POR', 'ATUALIZADO_EM'], [
    [FABIO, 1, 'Desligado', GIL, '2026-10-25 10:00:00'],
    [EVA, 0, null, GIL, '2026-10-25 10:00:00'],
  ]);

  // Ana: 2 PENDENTE + 1 EM_ANDAMENTO contam; 4 CONCLUIDA nao (C-009).
  inserir('TAREFAS', ['VENDEDOR_ID', 'TITULO', 'STATUS', 'DATA_LIMITE', 'CRIADO_EM'], [
    [ANA, 'Ligar para Mercado Bom Preço', 'PENDENTE', '2026-10-31', '2026-10-28 09:00:00'],
    [ANA, 'Enviar tabela ao Empório Central', 'PENDENTE', '2026-11-03', '2026-10-28 09:10:00'],
    [ANA, 'Negociar prazo com Atacado Sul', 'EM_ANDAMENTO', '2026-11-04', '2026-10-27 15:00:00'],
    ...[1, 2, 3, 4].map((n) => [ANA, `Follow-up concluído ${n}`, 'CONCLUIDA', '2026-10-20', '2026-10-15 09:00:00']),
    [BRUNO, 'Visitar Padaria Real', 'PENDENTE', '2026-11-02', '2026-10-29 10:00:00'],
    [FABIO, 'Tarefa de quem foi bloqueado', 'PENDENTE', '2026-11-02', '2026-10-20 10:00:00'],
  ]);

  // Ana: 4 nao lidos + 2 lidos.
  inserir('ALERTAS_INTELIGENTES', ['ID_VENDEDOR', 'CODFILIAL', 'ID_CLIENTE', 'NOME_CLIENTE', 'TIPO_ALERTA', 'TITULO', 'LIDO'], [
    ...[1, 2, 3, 4].map((n) => [ANA, 1, 1000 + n, `Cliente ${n}`, 'NAO_EXPLORADO', `Alerta ${n}`, 0]),
    ...[5, 6].map((n) => [ANA, 1, 1000 + n, `Cliente ${n}`, 'NAO_EXPLORADO', `Alerta ${n}`, 1]),
    [FABIO, 1, 2001, 'Cliente F', 'NAO_EXPLORADO', 'Alerta F', 0],
  ]);

  // Ana sai 01/11–15/11 com Bruno; ferias antigas e inativas nao contam (C-012).
  inserir('FERIAS_VENDEDOR', ['COD_RCA', 'RCA', 'DT_INICIO', 'DT_FIM', 'COD_RCA_SUBSTITUTO', 'RCA_SUBSTITUTO', 'ATIVO'], [
    [101, 'ANA SOUZA', '2026-11-01', '2026-11-15', 102, 'BRUNO LIMA', 1],
    [101, 'ANA SOUZA', '2026-07-01', '2026-07-10', 103, 'DIEGO RAMOS', 1],
    [101, 'ANA SOUZA', '2026-12-01', '2026-12-10', 104, 'EVA CASTRO', 0],
  ]);

  db.close();
  return counts;
}
