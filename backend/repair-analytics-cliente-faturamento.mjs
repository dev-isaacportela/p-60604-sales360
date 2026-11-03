import { spawnSync } from 'node:child_process';

const scripts = [
  'update-analytics-rca-evolucao-dias-uteis.mjs',
  'update-coordenador-escopo-telas-operacionais.mjs',
  'update-analytics-filtros-coordenador.mjs',
  'fix-analytics-scope-dimensions.mjs',
  'update-analytics-fornecedores-produtos.mjs',
  'update-analytics-visitas-prospeccao.mjs',
  'add-analytics-cliente-evolucao.mjs',
  'update-weekly-analytics-scope-bw.mjs',
];

for (const script of scripts) {
  console.log(`\n==> ${script}`);
  const result = spawnSync(process.execPath, [script], {
    cwd: new URL('.', import.meta.url),
    env: process.env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log('\nReparo de Analytics concluido.');
