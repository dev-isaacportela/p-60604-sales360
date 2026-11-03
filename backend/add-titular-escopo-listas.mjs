// Fase 3 (grupo 1) — aplica a titularidade (CLIENTE_TITULAR_DEPTO) nas listas de clientes.
// Regra: uma combinação cliente x filial x depto x seção sai do escopo quando o titular dela
// é alguém FORA do TARGET_USERS. Sem titular (empate pendente) => continua visível a todos.
// Escopo (TARGET_USERS / BU_VENDEDOR / EQUIPE_CLIENTE) não muda.
// Backups do código anterior: backups/sf-pre-titular/<id>.sql
import 'dotenv/config';
import { configureSdkMitra, readServerFunctionMitra, updateServerFunctionMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS
});
const projectId = parseInt(process.env.MITRA_PROJECT_ID);
const MARK = '/*TITULAR_DEPTO*/';

// Combinação (cliente, BU do vendedor) com titular de fora do alvo
const titularDeFora = (cli, bv) => `EXISTS (
      SELECT 1 FROM CLIENTE_TITULAR_DEPTO T_TIT
      WHERE T_TIT.ID_CLIENTE = ${cli}
        AND T_TIT.CODFILIAL = TRIM(COALESCE(CAST(${bv}.CODFILIAL AS CHAR), ''))
        AND T_TIT.CODEPTO = TRIM(CAST(${bv}.BU_CODIGO AS CHAR))
        AND T_TIT.ID_SECAO = ${bv}.ID_SECAO
        AND COALESCE(T_TIT.ATIVO, TRUE) = TRUE
        AND T_TIT.VENDEDOR_ID NOT IN (SELECT TU_TIT.USER_ID FROM TARGET_USERS TU_TIT)
    )`;

// 27/38/84 — CARTEIRA_ESCOPO: remove combinações tituladas por outro
const ANCORA_CARTEIRA = `  LEFT JOIN INPUT_SCOPE I ON 1 = 1
  WHERE ('{{idBu}}' = ''`;
const NOVO_CARTEIRA = `  LEFT JOIN INPUT_SCOPE I ON 1 = 1
  WHERE ${MARK} NOT ${titularDeFora('EC.ID_CLIENTE', 'BV')}
    AND ('{{idBu}}' = ''`;

// 128 — CARTEIRA_LOGADA_RAW: cliente sai quando TODAS as BUs do vendedor estão tituladas por outro;
// BASE_VENDAS: venda sai quando a seção dela tem titular de fora
const ANCORA_TEMP_CART = `  FROM EQUIPE_CLIENTE EC
  JOIN TARGET_USERS TU ON TU.USER_ID = EC.ID_VENDEDOR
),`;
const NOVO_TEMP_CART = `  FROM EQUIPE_CLIENTE EC
  JOIN TARGET_USERS TU ON TU.USER_ID = EC.ID_VENDEDOR
  WHERE ${MARK} NOT (
    EXISTS (SELECT 1 FROM BU_VENDEDOR B_T1 WHERE B_T1.VENDEDOR_ID = EC.ID_VENDEDOR AND COALESCE(B_T1.ATIVO, TRUE) = TRUE)
    AND NOT EXISTS (
      SELECT 1 FROM BU_VENDEDOR B_T2
      WHERE B_T2.VENDEDOR_ID = EC.ID_VENDEDOR AND COALESCE(B_T2.ATIVO, TRUE) = TRUE
        AND NOT ${titularDeFora('EC.ID_CLIENTE', 'B_T2')}
    )
  )
),`;
const ANCORA_TEMP_VENDAS = `  WHERE R.ATIVO = TRUE
    AND R.STATUS_INGESTAO = 'ATIVO'`;
const NOVO_TEMP_VENDAS = `  WHERE R.ATIVO = TRUE
    AND NOT EXISTS (
      SELECT 1 FROM CLIENTE_TITULAR_DEPTO T_TIT
      WHERE T_TIT.ID_CLIENTE = CL.ID_CLIENTE
        AND T_TIT.CODFILIAL = TRIM(COALESCE(CAST(R.CODFILIAL AS CHAR), ''))
        AND T_TIT.CODEPTO = TRIM(CAST(R.CODEPTO AS CHAR))
        AND (TRIM(CAST(T_TIT.ID_SECAO AS CHAR)) = TRIM(CAST(COALESCE(R.ID_SECAO, R.CODSECAO) AS CHAR))
          OR LPAD(TRIM(CAST(T_TIT.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(COALESCE(R.ID_SECAO, R.CODSECAO) AS CHAR)))
        AND COALESCE(T_TIT.ATIVO, TRUE) = TRUE
        AND T_TIT.VENDEDOR_ID NOT IN (SELECT TU_TIT.USER_ID FROM TARGET_USERS TU_TIT)
    )
    AND R.STATUS_INGESTAO = 'ATIVO'`;

const ALVOS = [
  { id: 27, trocas: [[ANCORA_CARTEIRA, NOVO_CARTEIRA]] },
  { id: 38, trocas: [[ANCORA_CARTEIRA, NOVO_CARTEIRA]] },
  { id: 84, trocas: [[ANCORA_CARTEIRA, NOVO_CARTEIRA]] },
  { id: 128, trocas: [[ANCORA_TEMP_CART, NOVO_TEMP_CART], [ANCORA_TEMP_VENDAS, NOVO_TEMP_VENDAS]] },
];

for (const alvo of ALVOS) {
  const sf = await readServerFunctionMitra({ projectId, serverFunctionId: alvo.id });
  let code = sf.result.code;
  if (code.includes(MARK)) { console.log(`${alvo.id} ${sf.result.name}: já aplicado`); continue; }
  for (const [de, para] of alvo.trocas) {
    const n = code.split(de).length - 1;
    if (n !== 1) throw new Error(`${alvo.id}: âncora encontrada ${n}x — abortando sem alterar`);
    code = code.replace(de, para);
  }
  await updateServerFunctionMitra({ projectId, serverFunctionId: alvo.id, code });
  console.log(`${alvo.id} ${sf.result.name}: atualizado`);
}
