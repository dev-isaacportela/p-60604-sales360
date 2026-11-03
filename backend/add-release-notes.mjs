// Notas de versão (release notes): a equipe técnica cadastra as atualizações do sistema em
// /release-notes e, quando publica, cada usuário vê as novidades num popup ao entrar.
// Cria RELEASE_NOTES (as notas) e RELEASE_NOTES_LEITURA (quem já viu cada nota) e as SFs:
//   releaseNotesGestaoListar, releaseNotesSalvar, releaseNotesExcluir — só equipe técnica
//   releaseNotesPendentes, releaseNotesMarcarLidas — todo usuário logado (perfil Operacao Comercial)
// A equipe técnica é a mesma do Painel Dev (suportePainelPermissao).
import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
  listProfilesMitra,
  getProfileDetailsMitra,
  setProfileServerFunctionsMitra,
  setProfileSelectTablesMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

// Mesma lista do suportePainelPermissao (Painel Dev)
const EQUIPE_TECNICA = "('ti@benenutri.com', 'isaacportela0903@gmail.com')";
const AGORA = "DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s')";
const E_EQUIPE_TECNICA = `EXISTS (
  SELECT 1 FROM INT_USER EU
  WHERE EU.ID = :VAR_USER
    AND LOWER(COALESCE(EU.DESCR, '')) IN ${EQUIPE_TECNICA}
)`;

const DDL = [
  `CREATE TABLE IF NOT EXISTS RELEASE_NOTES (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  VERSAO VARCHAR(30),
  TIPO VARCHAR(20) NOT NULL DEFAULT 'NOVIDADE',
  TITULO VARCHAR(200) NOT NULL,
  CONTEUDO TEXT NOT NULL,
  PUBLICADO TINYINT(1) NOT NULL DEFAULT 0,
  DATA_PUBLICACAO VARCHAR(19),
  CRIADO_POR INT,
  CRIADO_EM VARCHAR(19),
  ATUALIZADO_EM VARCHAR(19),
  INDEX idx_release_notes_publicacao (PUBLICADO, DATA_PUBLICACAO)
)`,
  `CREATE TABLE IF NOT EXISTS RELEASE_NOTES_LEITURA (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  RELEASE_ID INT NOT NULL,
  USER_ID INT NOT NULL,
  LIDO_EM VARCHAR(19),
  UNIQUE KEY uk_release_leitura (RELEASE_ID, USER_ID)
)`,
];

const DEFINICOES = [
  {
    name: 'releaseNotesGestaoListar',
    type: 'SQL',
    description: 'Notas de versão: todas as notas (rascunhos e publicadas) com autor e quantas pessoas já viram. Só equipe técnica (Painel Dev).',
    code: `SELECT
  R.ID,
  R.VERSAO,
  R.TIPO,
  R.TITULO,
  R.CONTEUDO,
  R.PUBLICADO,
  R.DATA_PUBLICACAO,
  R.CRIADO_EM,
  R.ATUALIZADO_EM,
  COALESCE(NULLIF(TRIM(A.NOME), ''), A.DESCR, '') AS AUTOR,
  (SELECT COUNT(*) FROM RELEASE_NOTES_LEITURA L WHERE L.RELEASE_ID = R.ID) AS LEITURAS
FROM RELEASE_NOTES R
LEFT JOIN INT_USER A ON A.ID = R.CRIADO_POR
WHERE ${E_EQUIPE_TECNICA}
ORDER BY R.PUBLICADO ASC, COALESCE(R.DATA_PUBLICACAO, R.CRIADO_EM) DESC, R.ID DESC
LIMIT 200`,
  },
  {
    name: 'releaseNotesSalvar',
    type: 'SQL',
    description: 'Notas de versão: cria (id 0) ou altera uma nota. publicar 1 publica (vira popup para quem ainda não viu); 0 deixa como rascunho. Entrada: id, versao, tipo (NOVIDADE|MELHORIA|CORRECAO), titulo, conteudo, publicar. Só equipe técnica.',
    code: `INSERT INTO RELEASE_NOTES (ID, VERSAO, TIPO, TITULO, CONTEUDO, PUBLICADO, DATA_PUBLICACAO, CRIADO_POR, CRIADO_EM, ATUALIZADO_EM)
SELECT
  NULLIF({{id}}, 0),
  NULLIF(LEFT(TRIM('{{versao}}'), 30), ''),
  CASE WHEN '{{tipo}}' IN ('NOVIDADE', 'MELHORIA', 'CORRECAO') THEN '{{tipo}}' ELSE 'NOVIDADE' END,
  LEFT(TRIM('{{titulo}}'), 200),
  '{{conteudo}}',
  CASE WHEN {{publicar}} = 1 THEN 1 ELSE 0 END,
  CASE WHEN {{publicar}} = 1 THEN ${AGORA} ELSE NULL END,
  U.ID,
  ${AGORA},
  ${AGORA}
FROM INT_USER U
WHERE U.ID = :VAR_USER
  AND LOWER(COALESCE(U.DESCR, '')) IN ${EQUIPE_TECNICA}
  AND CHAR_LENGTH(TRIM('{{titulo}}')) > 0
  AND CHAR_LENGTH(TRIM('{{conteudo}}')) > 0
ON DUPLICATE KEY UPDATE
  VERSAO = VALUES(VERSAO),
  TIPO = VALUES(TIPO),
  TITULO = VALUES(TITULO),
  CONTEUDO = VALUES(CONTEUDO),
  DATA_PUBLICACAO = CASE WHEN VALUES(PUBLICADO) = 1 THEN COALESCE(DATA_PUBLICACAO, VALUES(DATA_PUBLICACAO)) ELSE NULL END,
  PUBLICADO = VALUES(PUBLICADO),
  ATUALIZADO_EM = VALUES(ATUALIZADO_EM)`,
  },
  {
    name: 'releaseNotesExcluir',
    type: 'SQL',
    description: 'Notas de versão: apaga uma nota. Entrada: id. Só equipe técnica.',
    code: `DELETE FROM RELEASE_NOTES
WHERE ID = {{id}}
  AND ${E_EQUIPE_TECNICA}`,
  },
  {
    name: 'releaseNotesPendentes',
    type: 'SQL',
    description: 'Notas de versão: as notas publicadas nos últimos 60 dias que o usuário logado ainda não viu (até 10, a mais recente primeiro). Alimenta o popup de novidades.',
    code: `SELECT
  R.ID,
  R.VERSAO,
  R.TIPO,
  R.TITULO,
  R.CONTEUDO,
  R.DATA_PUBLICACAO
FROM RELEASE_NOTES R
WHERE R.PUBLICADO = 1
  AND R.DATA_PUBLICACAO >= DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL 60 DAY, '%Y-%m-%dT%H:%i:%s')
  AND NOT EXISTS (
    SELECT 1 FROM RELEASE_NOTES_LEITURA L
    WHERE L.RELEASE_ID = R.ID AND L.USER_ID = :VAR_USER
  )
ORDER BY R.DATA_PUBLICACAO DESC, R.ID DESC
LIMIT 10`,
    perfil: true,
  },
  {
    name: 'releaseNotesMarcarLidas',
    type: 'SQL',
    description: "Notas de versão: registra que o usuário logado viu as notas do popup. Entrada: ids ('3,4,5').",
    code: `INSERT IGNORE INTO RELEASE_NOTES_LEITURA (RELEASE_ID, USER_ID, LIDO_EM)
SELECT R.ID, U.ID, ${AGORA}
FROM RELEASE_NOTES R
JOIN INT_USER U ON U.ID = :VAR_USER
WHERE R.PUBLICADO = 1
  AND FIND_IN_SET(R.ID, '{{ids}}') > 0`,
    perfil: true,
  },
];

async function main() {
  for (const sql of DDL) {
    const r = await runDdlMitra({ projectId, sql });
    console.log('ddl', r?.migration || r?.result?.migration || '', r?.migrationSkippedReason || r?.result?.migrationSkippedReason || '');
  }

  const existentes = (await listServerFunctionsMitra({ projectId }))?.result || [];
  const ids = {};
  for (const def of DEFINICOES) {
    const atual = existentes.find((sf) => sf.name === def.name);
    if (atual) {
      await updateServerFunctionMitra({ projectId, serverFunctionId: atual.id, code: def.code, description: def.description });
      ids[def.name] = atual.id;
    } else {
      const criada = await createServerFunctionMitra({ projectId, name: def.name, type: def.type, code: def.code, description: def.description });
      const id = criada?.result?.id ?? criada?.result?.serverFunctionId;
      if (!id) throw new Error(`nao consegui o id de ${def.name}: ${JSON.stringify(criada).slice(0, 300)}`);
      ids[def.name] = id;
    }
  }
  console.log(JSON.stringify(ids, null, 2));

  // Todo usuário do app vê o popup: as SFs do popup entram no perfil que já tem o Dica Pro (SF 137).
  for (const perfil of (await listProfilesMitra({ projectId }))?.result || []) {
    const detalhe = (await getProfileDetailsMitra({ projectId, profileId: perfil.id }))?.result || {};
    const sfs = (detalhe.serverFunctions || []).map((s) => s.id ?? s.serverFunctionId);
    if (!sfs.includes(137)) continue;
    const novas = DEFINICOES.filter((d) => d.perfil).map((d) => ids[d.name]).filter((id) => !sfs.includes(id));
    if (novas.length) await setProfileServerFunctionsMitra({ projectId, profileId: perfil.id, serverFunctionIds: [...sfs, ...novas] });
    const tabelas = (detalhe.selectTables || []).map((t) => t.tableName);
    const novasTabelas = ['RELEASE_NOTES', 'RELEASE_NOTES_LEITURA'].filter((t) => !tabelas.includes(t));
    if (novasTabelas.length) {
      await setProfileSelectTablesMitra({
        projectId,
        profileId: perfil.id,
        jdbcConnectionConfigId: 1, // banco do proprio projeto
        tables: [...tabelas, ...novasTabelas].map((tableName) => ({ tableName })),
      });
    }
    console.log(`perfil ${perfil.name}: +${novas.length} SF, +${novasTabelas.length} tabela(s)`);
  }
}

main().catch((error) => {
  console.error('Falha ao criar as notas de versão:');
  console.error(error?.message || error);
  process.exit(1);
});
