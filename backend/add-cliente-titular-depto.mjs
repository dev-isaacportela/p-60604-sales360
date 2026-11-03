// Titular por cliente x filial x depto x seção (Opção B).
// Cria CLIENTE_TITULAR_DEPTO (se faltar) e SINCRONIZA os titulares automáticos:
//  - remove AUTO que deixaram de ser candidato único e MANUAL cujo vendedor deixou de ser candidato;
//  - insere AUTO onde há um único candidato. Titular MANUAL válido nunca é tocado.
// Rotina diária equivalente: SFs titularesSincronizarLimpar/Inserir (add-titulares-sincronizacao.mjs).
// Empates não são gravados: sem titular, o cliente continua visível a todos da carteira.
// As DMLs vão com generateMigration: em PROD a sincronização roda com os dados de PROD.
import 'dotenv/config';
import { configureSdkMitra, runDdlMitra, runDmlMitra, runQueryMitra } from 'mitra-sdk';
import { SYNC_LIMPAR_SQL, SYNC_INSERIR_SQL } from './titulares-config.mjs';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS
});
const projectId = parseInt(process.env.MITRA_PROJECT_ID);



function relatarMigracao(r) {
  const x = r?.result || r || {};
  if (x.migration) console.log('  migração:', x.migration);
  if (x.migrationSkippedReason) console.log('  migração não gerada:', x.migrationSkippedReason);
}

async function main() {
  const existe = await runQueryMitra({ projectId, sql: "SELECT COUNT(*) N FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='CLIENTE_TITULAR_DEPTO'" });
  if (Number(existe.result.rows[0].N) === 0) {
    await runDdlMitra({
      projectId,
      sql: `CREATE TABLE CLIENTE_TITULAR_DEPTO (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        ID_CLIENTE INT NOT NULL,
        CODFILIAL VARCHAR(10) NOT NULL,
        CODEPTO VARCHAR(20) NOT NULL,
        ID_SECAO INT NOT NULL,
        VENDEDOR_ID INT NOT NULL,
        ORIGEM VARCHAR(20) DEFAULT 'AUTO',
        ATIVO BOOLEAN DEFAULT TRUE,
        CRIADO_EM VARCHAR(19),
        ATUALIZADO_EM VARCHAR(19),
        ALTERADO_POR INT NULL,
        UNIQUE KEY UK_TITULAR (ID_CLIENTE, CODFILIAL, CODEPTO, ID_SECAO),
        KEY IX_TITULAR_VEND (VENDEDOR_ID)
      )`
    });
    console.log('Tabela CLIENTE_TITULAR_DEPTO criada');
  }

  const del = await runDmlMitra({
    projectId,
    generateMigration: true,
    sql: SYNC_LIMPAR_SQL
  });
  console.log('Titulares inválidos removidos'); relatarMigracao(del);

  const ins = await runDmlMitra({
    projectId,
    generateMigration: true,
    sql: SYNC_INSERIR_SQL
  });
  console.log('AUTO novos inseridos'); relatarMigracao(ins);

  const r = await runQueryMitra({ projectId, sql: "SELECT COUNT(*) N, SUM(ORIGEM='MANUAL') MANUAIS, COUNT(DISTINCT ID_CLIENTE) CLI FROM CLIENTE_TITULAR_DEPTO" });
  console.log('Titulares:', r.result.rows[0]);
}
main().catch((e) => { console.error(e?.response?.data || e); process.exit(1); });
