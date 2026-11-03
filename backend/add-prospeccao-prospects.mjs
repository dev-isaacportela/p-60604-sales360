import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const TABLES = [
  `CREATE TABLE IF NOT EXISTS PROSPECTS (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    RAZAO_SOCIAL VARCHAR(300) NOT NULL,
    NOME_FANTASIA VARCHAR(300),
    CNPJ VARCHAR(20),
    SEGMENTO VARCHAR(120),
    PORTE VARCHAR(60),
    ORIGEM VARCHAR(100),
    CIDADE VARCHAR(160),
    UF VARCHAR(2),
    ENDERECO VARCHAR(500),
    STATUS_PIPELINE VARCHAR(40) DEFAULT 'NOVO',
    POTENCIAL DECIMAL(12,2) DEFAULT 0,
    PROBABILIDADE INT DEFAULT 10,
    OBSERVACOES TEXT,
    RESPONSAVEL_ID INT,
    COD_CLIENTE_TOTVS VARCHAR(60),
    CONVERTIDO_EM VARCHAR(19),
    CRIADO_EM VARCHAR(19),
    ATUALIZADO_EM VARCHAR(19),
    INDEX IDX_PROSPECT_STATUS (STATUS_PIPELINE),
    INDEX IDX_PROSPECT_RESPONSAVEL (RESPONSAVEL_ID),
    INDEX IDX_PROSPECT_CRIADO (CRIADO_EM)
  )`,
  `CREATE TABLE IF NOT EXISTS PROSPECT_CONTATOS (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    PROSPECT_ID INT NOT NULL,
    NOME VARCHAR(200) NOT NULL,
    CARGO VARCHAR(120),
    TELEFONE VARCHAR(40),
    EMAIL VARCHAR(200),
    PRINCIPAL BOOLEAN DEFAULT TRUE,
    CRIADO_EM VARCHAR(19),
    FOREIGN KEY (PROSPECT_ID) REFERENCES PROSPECTS(ID),
    INDEX IDX_PROSPECT_CONTATO (PROSPECT_ID)
  )`,
  `CREATE TABLE IF NOT EXISTS PROSPECT_VISITAS (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    PROSPECT_ID INT NOT NULL,
    EXECUTIVO_ID INT,
    DATA_VISITA VARCHAR(10) NOT NULL,
    HORA_INICIO VARCHAR(5),
    HORA_FIM VARCHAR(5),
    OBJETIVO VARCHAR(200),
    STATUS VARCHAR(30) DEFAULT 'AGENDADA',
    RESUMO TEXT,
    OBJECOES TEXT,
    PROXIMO_PASSO TEXT,
    DATA_PROXIMO_PASSO VARCHAR(10),
    CRIADO_EM VARCHAR(19),
    ATUALIZADO_EM VARCHAR(19),
    FOREIGN KEY (PROSPECT_ID) REFERENCES PROSPECTS(ID),
    INDEX IDX_PROSPECT_VISITA_DATA (DATA_VISITA),
    INDEX IDX_PROSPECT_VISITA_STATUS (STATUS),
    INDEX IDX_PROSPECT_VISITA_EXECUTIVO (EXECUTIVO_ID)
  )`,
];

const LISTAR_PROSPECTS_SQL = `
WITH ULTIMA_VISITA AS (
  SELECT
    V.PROSPECT_ID,
    MAX(V.DATA_VISITA) AS ULTIMA_DATA,
    COUNT(*) AS TOTAL_VISITAS,
    SUM(CASE WHEN V.STATUS = 'AGENDADA' AND V.DATA_VISITA >= CURRENT_DATE THEN 1 ELSE 0 END) AS VISITAS_AGENDADAS
  FROM PROSPECT_VISITAS V
  GROUP BY V.PROSPECT_ID
), CONTATO_PRINCIPAL AS (
  SELECT C.*
  FROM PROSPECT_CONTATOS C
  JOIN (
    SELECT PROSPECT_ID, MIN(ID) AS ID
    FROM PROSPECT_CONTATOS
    WHERE COALESCE(PRINCIPAL, TRUE) = TRUE
    GROUP BY PROSPECT_ID
  ) M ON M.ID = C.ID
)
SELECT
  P.ID,
  P.RAZAO_SOCIAL,
  P.NOME_FANTASIA,
  P.CNPJ,
  P.SEGMENTO,
  P.PORTE,
  P.ORIGEM,
  P.CIDADE,
  P.UF,
  P.ENDERECO,
  P.STATUS_PIPELINE,
  COALESCE(P.POTENCIAL, 0) AS POTENCIAL,
  COALESCE(P.PROBABILIDADE, 0) AS PROBABILIDADE,
  P.OBSERVACOES,
  P.RESPONSAVEL_ID,
  COALESCE(NULLIF(F.NOME, ''), NULLIF(U.NOME, ''), U.DESCR, CONCAT('Executivo ', P.RESPONSAVEL_ID)) AS RESPONSAVEL_NOME,
  P.COD_CLIENTE_TOTVS,
  P.CONVERTIDO_EM,
  P.CRIADO_EM,
  P.ATUALIZADO_EM,
  CP.NOME AS CONTATO_NOME,
  CP.CARGO AS CONTATO_CARGO,
  CP.TELEFONE AS CONTATO_TELEFONE,
  CP.EMAIL AS CONTATO_EMAIL,
  COALESCE(UV.TOTAL_VISITAS, 0) AS TOTAL_VISITAS,
  COALESCE(UV.VISITAS_AGENDADAS, 0) AS VISITAS_AGENDADAS,
  COALESCE(UV.ULTIMA_DATA, '') AS ULTIMA_VISITA
FROM PROSPECTS P
LEFT JOIN ULTIMA_VISITA UV ON UV.PROSPECT_ID = P.ID
LEFT JOIN CONTATO_PRINCIPAL CP ON CP.PROSPECT_ID = P.ID
LEFT JOIN FUNCIONARIOS F ON F.ID = P.RESPONSAVEL_ID
LEFT JOIN INT_USER U ON U.ID = P.RESPONSAVEL_ID
WHERE ('{{status}}' = '' OR P.STATUS_PIPELINE = '{{status}}')
  AND (
    '{{busca}}' = ''
    OR P.RAZAO_SOCIAL LIKE '%{{busca}}%'
    OR COALESCE(P.NOME_FANTASIA, '') LIKE '%{{busca}}%'
    OR COALESCE(P.CNPJ, '') LIKE '%{{busca}}%'
    OR COALESCE(CP.NOME, '') LIKE '%{{busca}}%'
  )
ORDER BY
  CASE P.STATUS_PIPELINE
    WHEN 'NOVO' THEN 1
    WHEN 'VISITA_AGENDADA' THEN 2
    WHEN 'VISITADO' THEN 3
    WHEN 'NEGOCIACAO' THEN 4
    WHEN 'CONVERTIDO' THEN 5
    ELSE 6
  END,
  P.ATUALIZADO_EM DESC,
  P.ID DESC
LIMIT {{limit}} OFFSET {{offset}}
`;

const CONTAR_PROSPECTS_SQL = `
SELECT
  COUNT(*) AS TOTAL,
  SUM(CASE WHEN STATUS_PIPELINE = 'NOVO' THEN 1 ELSE 0 END) AS NOVOS,
  SUM(CASE WHEN STATUS_PIPELINE = 'VISITA_AGENDADA' THEN 1 ELSE 0 END) AS VISITAS_AGENDADAS,
  SUM(CASE WHEN STATUS_PIPELINE = 'NEGOCIACAO' THEN 1 ELSE 0 END) AS NEGOCIACAO,
  SUM(CASE WHEN STATUS_PIPELINE = 'CONVERTIDO' THEN 1 ELSE 0 END) AS CONVERTIDOS,
  SUM(CASE WHEN STATUS_PIPELINE = 'PERDIDO' THEN 1 ELSE 0 END) AS PERDIDOS,
  SUM(COALESCE(POTENCIAL, 0)) AS POTENCIAL_TOTAL
FROM PROSPECTS
WHERE ('{{status}}' = '' OR STATUS_PIPELINE = '{{status}}')
`;

const LISTAR_VISITAS_SQL = `
SELECT
  V.ID,
  V.PROSPECT_ID,
  P.RAZAO_SOCIAL,
  P.NOME_FANTASIA,
  P.STATUS_PIPELINE,
  V.EXECUTIVO_ID,
  COALESCE(NULLIF(F.NOME, ''), NULLIF(U.NOME, ''), U.DESCR, CONCAT('Executivo ', V.EXECUTIVO_ID)) AS EXECUTIVO_NOME,
  V.DATA_VISITA,
  V.HORA_INICIO,
  V.HORA_FIM,
  V.OBJETIVO,
  V.STATUS,
  V.RESUMO,
  V.OBJECOES,
  V.PROXIMO_PASSO,
  V.DATA_PROXIMO_PASSO,
  V.CRIADO_EM,
  V.ATUALIZADO_EM
FROM PROSPECT_VISITAS V
JOIN PROSPECTS P ON P.ID = V.PROSPECT_ID
LEFT JOIN FUNCIONARIOS F ON F.ID = V.EXECUTIVO_ID
LEFT JOIN INT_USER U ON U.ID = V.EXECUTIVO_ID
WHERE V.DATA_VISITA BETWEEN '{{dataInicio}}' AND '{{dataFim}}'
  AND ('{{status}}' = '' OR V.STATUS = '{{status}}')
ORDER BY V.DATA_VISITA ASC, V.HORA_INICIO ASC, V.ID ASC
LIMIT {{limit}} OFFSET {{offset}}
`;

const CRIAR_PROSPECT_SQL = `
INSERT INTO PROSPECTS (
  RAZAO_SOCIAL,
  NOME_FANTASIA,
  CNPJ,
  SEGMENTO,
  PORTE,
  ORIGEM,
  CIDADE,
  UF,
  ENDERECO,
  STATUS_PIPELINE,
  POTENCIAL,
  PROBABILIDADE,
  OBSERVACOES,
  RESPONSAVEL_ID,
  CRIADO_EM,
  ATUALIZADO_EM
) VALUES (
  '{{razaoSocial}}',
  COALESCE(NULLIF('{{nomeFantasia}}', ''), '{{razaoSocial}}'),
  '{{cnpj}}',
  '{{segmento}}',
  '{{porte}}',
  '{{origem}}',
  '{{cidade}}',
  UPPER('{{uf}}'),
  '{{endereco}}',
  'NOVO',
  COALESCE(NULLIF('{{potencial}}', ''), 0),
  LEAST(100, GREATEST(0, COALESCE(NULLIF('{{probabilidade}}', ''), 10))),
  '{{observacoes}}',
  CASE WHEN '{{userId}}' = '' THEN NULL ELSE CAST('{{userId}}' AS UNSIGNED) END,
  '{{criadoEm}}',
  '{{criadoEm}}'
);

INSERT INTO PROSPECT_CONTATOS (
  PROSPECT_ID,
  NOME,
  CARGO,
  TELEFONE,
  EMAIL,
  PRINCIPAL,
  CRIADO_EM
)
SELECT
  LAST_INSERT_ID(),
  '{{contatoNome}}',
  '{{contatoCargo}}',
  '{{contatoTelefone}}',
  '{{contatoEmail}}',
  TRUE,
  '{{criadoEm}}'
WHERE '{{contatoNome}}' <> '';

SELECT 'CRIADO' AS STATUS;
`;

const ATUALIZAR_STATUS_JS = `
const { runDmlMitra } = require('mitra-sdk');
const projectId = Number(process.env.MITRA_PROJECT_ID);
function esc(value, max = 8000) { return String(value ?? '').trim().slice(0, max).replace(/'/g, "''"); }
async function run() {
  const id = Number(event.prospectId || 0);
  const status = esc(event.status, 40);
  if (!id || !status) throw new Error('Prospect e status são obrigatórios.');
  const allowed = ['NOVO', 'VISITA_AGENDADA', 'VISITADO', 'NEGOCIACAO', 'CONVERTIDO', 'PERDIDO'];
  if (!allowed.includes(status)) throw new Error('Status inválido.');
  const now = new Date().toISOString().slice(0, 19);
  await runDmlMitra({ projectId, sql: "UPDATE PROSPECTS SET STATUS_PIPELINE = '" + status + "', ATUALIZADO_EM = '" + now + "' WHERE ID = " + id + " LIMIT 1" });
  return { rows: [{ STATUS: 'ATUALIZADO', ATUALIZADO_EM: now }] };
}
return run();
`;

const AGENDAR_VISITA_SQL = `
INSERT INTO PROSPECT_VISITAS (
  PROSPECT_ID,
  EXECUTIVO_ID,
  DATA_VISITA,
  HORA_INICIO,
  HORA_FIM,
  OBJETIVO,
  STATUS,
  CRIADO_EM,
  ATUALIZADO_EM
) VALUES (
  {{prospectId}},
  CASE WHEN '{{userId}}' = '' THEN NULL ELSE CAST('{{userId}}' AS UNSIGNED) END,
  '{{dataVisita}}',
  '{{horaInicio}}',
  '{{horaFim}}',
  '{{objetivo}}',
  'AGENDADA',
  '{{criadoEm}}',
  '{{criadoEm}}'
);

UPDATE PROSPECTS
SET STATUS_PIPELINE = 'VISITA_AGENDADA',
    ATUALIZADO_EM = '{{criadoEm}}'
WHERE ID = {{prospectId}}
LIMIT 1;

SELECT 'AGENDADA' AS STATUS;
`;

const REGISTRAR_RESULTADO_JS = `
const { runDmlMitra } = require('mitra-sdk');
const projectId = Number(process.env.MITRA_PROJECT_ID);
function esc(value, max = 8000) { return String(value ?? '').trim().slice(0, max).replace(/'/g, "''"); }
async function run() {
  const visitaId = Number(event.visitaId || 0);
  const prospectId = Number(event.prospectId || 0);
  if (!visitaId || !prospectId) throw new Error('Visita e prospect são obrigatórios.');
  const now = new Date().toISOString().slice(0, 19);
  await runDmlMitra({ projectId, sql: "UPDATE PROSPECT_VISITAS SET STATUS = 'CONCLUIDA', RESUMO = '" + esc(event.resumo) + "', OBJECOES = '" + esc(event.objecoes) + "', PROXIMO_PASSO = '" + esc(event.proximoPasso) + "', DATA_PROXIMO_PASSO = '" + esc(event.dataProximoPasso, 10) + "', ATUALIZADO_EM = '" + now + "' WHERE ID = " + visitaId + " LIMIT 1" });
  await runDmlMitra({ projectId, sql: "UPDATE PROSPECTS SET STATUS_PIPELINE = 'VISITADO', ATUALIZADO_EM = '" + now + "' WHERE ID = " + prospectId + " AND STATUS_PIPELINE <> 'CONVERTIDO' LIMIT 1" });
  return { rows: [{ STATUS: 'REGISTRADO', ATUALIZADO_EM: now }] };
}
return run();
`;

const ATUALIZAR_VISITA_SQL = `
UPDATE PROSPECT_VISITAS
SET
  DATA_VISITA = '{{dataVisita}}',
  HORA_INICIO = '{{horaInicio}}',
  HORA_FIM = '{{horaFim}}',
  OBJETIVO = '{{objetivo}}',
  RESUMO = '{{relato}}',
  ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
WHERE ID = {{visitaId}}
LIMIT 1
`;

const CANCELAR_VISITA_SQL = `
UPDATE PROSPECT_VISITAS
SET
  STATUS = 'CANCELADA',
  RESUMO = '{{relato}}',
  ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
WHERE ID = {{visitaId}}
LIMIT 1
`;

const CHECKIN_VISITA_SQL = `
UPDATE PROSPECT_VISITAS
SET
  STATUS = 'EM_ANDAMENTO',
  ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
WHERE ID = {{visitaId}}
  AND STATUS = 'AGENDADA'
LIMIT 1
`;

const CHECKOUT_VISITA_SQL = `
UPDATE PROSPECT_VISITAS
SET
  STATUS = 'CONCLUIDA',
  RESUMO = '{{relato}}',
  ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
WHERE ID = {{visitaId}}
LIMIT 1;

UPDATE PROSPECTS
SET
  STATUS_PIPELINE = 'VISITADO',
  ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
WHERE ID = {{prospectId}}
  AND STATUS_PIPELINE <> 'CONVERTIDO'
LIMIT 1;

SELECT 'CONCLUIDA' AS STATUS;
`;

const MARCAR_CONVERTIDO_JS = `
const { runDmlMitra } = require('mitra-sdk');
const projectId = Number(process.env.MITRA_PROJECT_ID);
function esc(value, max = 8000) { return String(value ?? '').trim().slice(0, max).replace(/'/g, "''"); }
async function run() {
  const prospectId = Number(event.prospectId || 0);
  const codigo = esc(event.codigoCliente, 60);
  if (!prospectId || !codigo) throw new Error('Informe o prospect e o código do cliente real.');
  const now = new Date().toISOString().slice(0, 19);
  await runDmlMitra({ projectId, sql: "UPDATE PROSPECTS SET STATUS_PIPELINE = 'CONVERTIDO', COD_CLIENTE_TOTVS = '" + codigo + "', CONVERTIDO_EM = '" + now + "', ATUALIZADO_EM = '" + now + "' WHERE ID = " + prospectId + " LIMIT 1" });
  return { rows: [{ STATUS: 'CONVERTIDO', CONVERTIDO_EM: now }] };
}
return run();
`;

const FUNCTIONS = [
  { name: 'prospectsListar', type: 'SQL', code: LISTAR_PROSPECTS_SQL, description: 'Lista prospects temporarios com contato principal e resumo de visitas.' },
  { name: 'prospectsContar', type: 'SQL', code: CONTAR_PROSPECTS_SQL, description: 'Conta prospects por etapa do pipeline e potencial total.' },
  { name: 'prospectsVisitasListar', type: 'SQL', code: LISTAR_VISITAS_SQL, description: 'Lista visitas de prospeccao por periodo.' },
  { name: 'prospectsCriarSql', type: 'SQL', code: CRIAR_PROSPECT_SQL, description: 'Cria prospect temporario e contato principal por SQL para usuarios business.' },
  { name: 'prospectsAtualizarStatus', type: 'JAVASCRIPT', code: ATUALIZAR_STATUS_JS, description: 'Atualiza etapa do pipeline de um prospect.' },
  { name: 'prospectsAgendarVisitaSql', type: 'SQL', code: AGENDAR_VISITA_SQL, description: 'Agenda visita para prospect temporario por SQL para usuarios business.' },
  { name: 'prospectsRegistrarResultadoVisita', type: 'JAVASCRIPT', code: REGISTRAR_RESULTADO_JS, description: 'Registra resultado da visita de prospeccao.' },
  { name: 'prospectsAtualizarVisita', type: 'SQL', code: ATUALIZAR_VISITA_SQL, description: 'Atualiza ou reagenda visita de prospeccao por SQL para usuarios business.' },
  { name: 'prospectsCancelarVisita', type: 'SQL', code: CANCELAR_VISITA_SQL, description: 'Cancela visita de prospeccao com motivo por SQL para usuarios business.' },
  { name: 'prospectsCheckinVisita', type: 'SQL', code: CHECKIN_VISITA_SQL, description: 'Inicia visita de prospeccao por SQL para usuarios business.' },
  { name: 'prospectsCheckoutVisita', type: 'SQL', code: CHECKOUT_VISITA_SQL, description: 'Finaliza visita de prospeccao com relato por SQL para usuarios business.' },
  { name: 'prospectsMarcarConvertido', type: 'JAVASCRIPT', code: MARCAR_CONVERTIDO_JS, description: 'Marca prospect como convertido apos cadastro real no ERP.' },
];

async function upsertFunction(def, existingList) {
  const existing = existingList.find((item) => item.name === def.name);
  if (existing) {
    await updateServerFunctionMitra({ projectId, serverFunctionId: existing.id, code: def.code, description: def.description });
    return existing.id;
  }
  const created = await createServerFunctionMitra({ projectId, name: def.name, type: def.type, code: def.code, description: def.description });
  return created?.result?.serverFunctionId || created?.result?.id || created?.serverFunctionId || created?.id;
}

async function main() {
  for (const sql of TABLES) await runDdlMitra({ projectId, sql });
  const listed = await listServerFunctionsMitra({ projectId });
  const existingList = listed?.result || [];
  const ids = {};
  for (const def of FUNCTIONS) ids[def.name] = await upsertFunction(def, existingList);
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Falha ao configurar prospeccao de prospects:');
  console.error(error?.message || error);
  process.exit(1);
});
