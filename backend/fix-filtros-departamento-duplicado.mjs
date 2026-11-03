import 'dotenv/config';
import { configureSdkMitra, readServerFunctionMitra, updateServerFunctionMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = parseInt(process.env.MITRA_PROJECT_ID);
const SF_ANALYTICS_RCA_FILTROS = 181;

// A CTE DEPARTAMENTOS fazia UNION entre "departamentos com venda" (rotulo real,
// vindo de IMP_VENDAS_DASHBOARD_TOTVS_RCA) e "departamentos do escopo" (rotulo
// generico "Departamento N"). Como os rotulos diferem, o UNION nao deduplicava:
// cada departamento voltava DUAS vezes no filtro, uma com o nome real e outra
// com o generico. Agora o UNION vira DEPARTAMENTOS_RAW, o ramo de escopo busca
// o nome real na tabela BU, e o agrupamento final devolve uma linha por
// departamento preferindo sempre o nome real.
const BLOCO_ANTIGO = `  UNION

  SELECT
    B.ID_BU AS VALUE,
    CONCAT('Departamento ', B.ID_BU) AS LABEL
  FROM BU_SCOPE B
),`;

const BLOCO_NOVO = `  UNION

  SELECT
    B.ID_BU AS VALUE,
    COALESCE(NULLIF(TRIM(CAST(BUT.NOME AS CHAR)), ''), CONCAT('Departamento ', B.ID_BU)) AS LABEL
  FROM BU_SCOPE B
  LEFT JOIN BU BUT ON TRIM(CAST(BUT.CODIGO AS CHAR)) = TRIM(CAST(B.ID_BU AS CHAR))
),
DEPARTAMENTOS AS (
  SELECT
    VALUE,
    COALESCE(
      MIN(CASE WHEN LABEL NOT LIKE 'Departamento %' THEN LABEL END),
      MIN(LABEL)
    ) AS LABEL
  FROM DEPARTAMENTOS_RAW
  GROUP BY VALUE
),`;

const atual = await readServerFunctionMitra({ projectId, serverFunctionId: SF_ANALYTICS_RCA_FILTROS });
const codeAtual = String(atual?.result?.code || '');

if (!codeAtual.includes('DEPARTAMENTOS AS (')) {
  throw new Error('CTE DEPARTAMENTOS nao encontrada na SF 181 — abortando sem alterar nada.');
}
if (codeAtual.includes('DEPARTAMENTOS_RAW')) {
  console.log('SF 181 ja corrigida (DEPARTAMENTOS_RAW presente). Nada a fazer.');
  process.exit(0);
}
if (!codeAtual.includes(BLOCO_ANTIGO)) {
  throw new Error('Bloco esperado do UNION generico nao encontrado — abortando sem alterar nada.');
}

const codeNovo = codeAtual
  .replace('DEPARTAMENTOS AS (', 'DEPARTAMENTOS_RAW AS (')
  .replace(BLOCO_ANTIGO, BLOCO_NOVO);

await updateServerFunctionMitra({
  projectId,
  serverFunctionId: SF_ANALYTICS_RCA_FILTROS,
  code: codeNovo,
  description: 'Filtros de Analytics por RCA (filial, departamento, secao, ramo, cliente) — um item por departamento, com o nome real da BU',
});

console.log('SF 181 analyticsRcaFiltros atualizada: filtro de Departamento sem duplicatas.');
