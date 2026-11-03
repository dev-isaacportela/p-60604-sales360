// Fluxo ponta a ponta em banco descartável — a suíte de testes do backend.
//
// Roda as SFs de verdade (o SQL literal dos add-NNN, o mesmo publicado) e
// verifica com assert o que a spec exige. Cada spec tem o seu arquivo em
// smoke/NNN-*.mjs, que exporta uma função async recebendo os helpers abaixo;
// cada cenário C-00N e regra RN-00N que passa pelo backend vira um `teste()`
// com o id no título. Cada arquivo roda num banco novo, só dele.
//
// Uso: cd novo/backend && npm run sim:smoke            (todas as specs)
//      cd novo/backend && npm run sim:smoke -- 002     (só os arquivos com "002" no nome)

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEED } from './config.mjs';
import { seedDatabase, ID } from './seed.mjs';
import { registerMysqlFunctions, toSqlite } from './mysql-dialect.mjs';
import { loadDefinitions, createRunner } from './runtime.mjs';

const PASTA = join(dirname(fileURLToPath(import.meta.url)), 'smoke');
const filtro = process.argv[2] ?? '';
const arquivos = readdirSync(PASTA).filter((nome) => /^\d{3}-.+\.mjs$/.test(nome) && nome.includes(filtro)).sort();
const { byName } = await loadDefinitions();

let feitos = 0;
for (const arquivo of arquivos) {
  // pid no nome: duas sessões rodando o smoke ao mesmo tempo não dividem banco.
  const caminho = join(tmpdir(), `mitra-${SEED}-smoke-${process.pid}-${arquivo}.db`);
  seedDatabase(caminho, { reset: true });
  const db = new DatabaseSync(caminho);
  registerMysqlFunctions(db);
  const execute = createRunner(db);

  const chamar = (nome, input, userId) => {
    const definicao = byName.get(nome);
    assert.ok(definicao, `server function ${nome} nao existe em nenhum add-NNN`);
    return execute(definicao, input, userId);
  };
  const linhas = async (nome, input, userId) => (await chamar(nome, input, userId)).rows;
  const banco = (sql) => db.prepare(sql).all().map((r) => ({ ...r }));
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

  console.log(`\n  ${arquivo}`);
  const modulo = await import(`./smoke/${arquivo}`);
  await modulo.default({ teste, chamar, linhas, banco, execute, db, ID, toSqlite, assert });
  db.close();
  for (const sufixo of ['', '-wal', '-shm']) rmSync(`${caminho}${sufixo}`, { force: true });
}

console.log(`\n  ${feitos} verificacoes passaram em ${arquivos.length} arquivo(s).`);
