// Dados simulados do Comercial Externo 360 (sistema novo).
//
// O SCHEMA nao esta aqui: sai de schema-producao/ e dos add-NNN via
// schema.mjs. Aqui ficam os usuarios-base (ids 1..11, usados por todas as
// specs) e o carregador dos dados de cada spec, em seeds/NNN-*.mjs.
//
// Datas FIXAS em torno de 30/10/2026: os cenarios de ferias dependem de
// "hoje", e a tela/smoke passam `hoje` explicito (D-007), entao o banco nao
// precisa andar com o relogio.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSchema } from './schema.mjs';

const PASTA_SEEDS = join(dirname(fileURLToPath(import.meta.url)), 'seeds');
const SEEDS = await Promise.all(
  readdirSync(PASTA_SEEDS).filter((nome) => /^\d{3}-.+\.mjs$/.test(nome)).sort().map((nome) => import(`./seeds/${nome}`)),
);

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

  inserir('INT_USER', ['DESCR', 'NOME', 'ACCESS_LEVEL', 'ATIVO'],
    USUARIOS.map((u) => [u.email, u.nome, u.accessLevel || 'MEMBER', 1]));

  // Dados de domínio: um módulo por spec em seeds/NNN-*.mjs, em ordem de número.
  // Cada um exporta `semear(ctx)`; usuário extra entra por ctx.usuario() e
  // ganha o próximo id (os 11 de USUARIOS são sempre 1..11).
  const usuario = (nome, email, accessLevel = 'MEMBER') =>
    Number(db.prepare('INSERT INTO INT_USER (DESCR, NOME, ACCESS_LEVEL, ATIVO) VALUES (?, ?, ?, 1)').run(email, nome, accessLevel).lastInsertRowid);
  for (const modulo of SEEDS) modulo.semear({ db, inserir, ID, USUARIOS, usuario, counts });

  db.close();
  return counts;
}
