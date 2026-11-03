// Cria ACOMP_SEMANAL_SYNC_ERRO_ATUAL: uma linha por erro de ingestao (CHAVE_NATURAL + TIPO_ERRO),
// com contador de ocorrencias e situacao ABERTO/RESOLVIDO. Substitui a gravacao em ACOMP_SEMANAL_SYNC_ERRO,
// que regravava todos os erros a cada execucao da sincronizacao (SF 107) e nunca era limpa.
// A SF 107 e publicada a partir de acompanhamento-semanal-sincronizar-manual-escopo.sf.js
// (node add-acompanhamento-semanal-sync-manual-sf.mjs).
import 'dotenv/config';
import { configureSdkMitra, runDdlMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

async function main() {
  const res = await runDdlMitra({
    projectId,
    sql: `CREATE TABLE IF NOT EXISTS ACOMP_SEMANAL_SYNC_ERRO_ATUAL (
      ID INT AUTO_INCREMENT PRIMARY KEY,
      CHAVE_NATURAL VARCHAR(255) NOT NULL,
      TIPO_ERRO VARCHAR(50) NOT NULL,
      CODCLI INT,
      COD_RCA INT,
      NUMPED VARCHAR(30),
      CODPROD INT,
      CODFILIAL VARCHAR(10),
      CODEPTO VARCHAR(50),
      CODSECAO INT,
      DETALHE VARCHAR(500),
      SITUACAO VARCHAR(20) NOT NULL DEFAULT 'ABERTO',
      QTD_OCORRENCIAS INT NOT NULL DEFAULT 1,
      PRIMEIRA_EXECUCAO_ID VARCHAR(32),
      ULTIMA_EXECUCAO_ID VARCHAR(32),
      PRIMEIRA_OCORRENCIA_EM VARCHAR(19),
      ULTIMA_OCORRENCIA_EM VARCHAR(19),
      RESOLVIDO_EM VARCHAR(19),
      UNIQUE KEY UX_ACOMP_SYNC_ERRO_ATUAL (CHAVE_NATURAL, TIPO_ERRO),
      KEY IX_ACOMP_SYNC_ERRO_ATUAL_SIT (SITUACAO, RESOLVIDO_EM),
      KEY IX_ACOMP_SYNC_ERRO_ATUAL_EXEC (ULTIMA_EXECUCAO_ID)
    )`,
  });
  console.log('Tabela ACOMP_SEMANAL_SYNC_ERRO_ATUAL: OK');
  console.log('migration:', res?.migration ?? res?.result?.migration ?? null,
    '| migrationSkippedReason:', res?.migrationSkippedReason ?? res?.result?.migrationSkippedReason ?? null);
}

main().catch((error) => {
  console.error('Falha ao criar ACOMP_SEMANAL_SYNC_ERRO_ATUAL:', error?.message || error);
  process.exit(1);
});
