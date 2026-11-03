import 'dotenv/config';
import {
  configureSdkMitra,
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

const sqlCarteiraComRanking = `
  SELECT
    B.ID,
    B.RAZAO_SOCIAL,
    B.NOME_FANTASIA,
    B.CNPJ,
    B.CIDADE,
    B.UF,
    B.SEGMENTO,
    B.STATUS,
    B.ID_BU,
    B.IS_COBERTURA,
    B.TAG_COBERTURA,
    B.COMPRAS_90D,
    B.VISITAS_60D,
    B.DIAS_ULTIMA_COMPRA,
    B.DIAS_SEM_VISITA,
    ROUND(
      (LEAST(100, (B.COMPRAS_90D / 30000) * 100) * 0.45)
      + (LEAST(100, B.VISITAS_60D * 20) * 0.25)
      + ((CASE
          WHEN B.DIAS_ULTIMA_COMPRA <= 7 THEN 100
          WHEN B.DIAS_ULTIMA_COMPRA <= 15 THEN 85
          WHEN B.DIAS_ULTIMA_COMPRA <= 30 THEN 65
          WHEN B.DIAS_ULTIMA_COMPRA <= 45 THEN 40
          ELSE 15
        END) * 0.20)
      + ((CASE
          WHEN B.DIAS_SEM_VISITA <= 7 THEN 100
          WHEN B.DIAS_SEM_VISITA <= 15 THEN 80
          WHEN B.DIAS_SEM_VISITA <= 30 THEN 55
          WHEN B.DIAS_SEM_VISITA <= 45 THEN 30
          ELSE 10
        END) * 0.10),
      1
    ) AS SCORE_RANKING,
    CASE
      WHEN ROUND(
        (LEAST(100, (B.COMPRAS_90D / 30000) * 100) * 0.45)
        + (LEAST(100, B.VISITAS_60D * 20) * 0.25)
        + ((CASE
            WHEN B.DIAS_ULTIMA_COMPRA <= 7 THEN 100
            WHEN B.DIAS_ULTIMA_COMPRA <= 15 THEN 85
            WHEN B.DIAS_ULTIMA_COMPRA <= 30 THEN 65
            WHEN B.DIAS_ULTIMA_COMPRA <= 45 THEN 40
            ELSE 15
          END) * 0.20)
        + ((CASE
            WHEN B.DIAS_SEM_VISITA <= 7 THEN 100
            WHEN B.DIAS_SEM_VISITA <= 15 THEN 80
            WHEN B.DIAS_SEM_VISITA <= 30 THEN 55
            WHEN B.DIAS_SEM_VISITA <= 45 THEN 30
            ELSE 10
          END) * 0.10),
        1
      ) >= 80 THEN 'A'
      WHEN ROUND(
        (LEAST(100, (B.COMPRAS_90D / 30000) * 100) * 0.45)
        + (LEAST(100, B.VISITAS_60D * 20) * 0.25)
        + ((CASE
            WHEN B.DIAS_ULTIMA_COMPRA <= 7 THEN 100
            WHEN B.DIAS_ULTIMA_COMPRA <= 15 THEN 85
            WHEN B.DIAS_ULTIMA_COMPRA <= 30 THEN 65
            WHEN B.DIAS_ULTIMA_COMPRA <= 45 THEN 40
            ELSE 15
          END) * 0.20)
        + ((CASE
            WHEN B.DIAS_SEM_VISITA <= 7 THEN 100
            WHEN B.DIAS_SEM_VISITA <= 15 THEN 80
            WHEN B.DIAS_SEM_VISITA <= 30 THEN 55
            WHEN B.DIAS_SEM_VISITA <= 45 THEN 30
            ELSE 10
          END) * 0.10),
        1
      ) >= 55 THEN 'B'
      ELSE 'C'
    END AS RANKING
  FROM (
    SELECT
      C.ID,
      C.RAZAO_SOCIAL,
      C.NOME_FANTASIA,
      C.CNPJ,
      C.CIDADE,
      C.UF,
      C.SEGMENTO,
      C.STATUS,
      MIN(COALESCE(NULLIF(TRIM(EC.ID_BU), ''), 'PADRAO')) AS ID_BU,
      CASE
        WHEN SUM(CASE WHEN EC.ID_VENDEDOR = :VAR_USER THEN 1 ELSE 0 END) > 0 THEN 0
        ELSE 1
      END AS IS_COBERTURA,
      CASE
        WHEN SUM(CASE WHEN EC.ID_VENDEDOR = :VAR_USER THEN 1 ELSE 0 END) > 0 THEN ''
        ELSE 'COBERTURA'
      END AS TAG_COBERTURA,
      COALESCE(IA.COMPRAS_90D, 0) AS COMPRAS_90D,
      COALESCE(VIA.VISITAS_60D, 0) AS VISITAS_60D,
      COALESCE(IA.DIAS_ULTIMA_COMPRA, 999) AS DIAS_ULTIMA_COMPRA,
      COALESCE(VIA.DIAS_SEM_VISITA, 999) AS DIAS_SEM_VISITA
    FROM CLIENTES C
    JOIN EQUIPE_CLIENTE EC ON EC.ID_CLIENTE = C.ID
    LEFT JOIN FUNCIONARIOS F ON F.ID = EC.ID_VENDEDOR
    LEFT JOIN (
      SELECT
        ECD.ID_CLIENTE,
        COALESCE(
          MAX(CASE WHEN ECD.ID_VENDEDOR = :VAR_USER THEN ECD.ID_VENDEDOR ELSE NULL END),
          MIN(ECD.ID_VENDEDOR)
        ) AS OWNER_USER_ID
      FROM EQUIPE_CLIENTE ECD
      LEFT JOIN FUNCIONARIOS FD ON FD.ID = ECD.ID_VENDEDOR
      WHERE ECD.ID_VENDEDOR = :VAR_USER
        OR FD.ID_SUBSTITUTO = :VAR_USER
      GROUP BY ECD.ID_CLIENTE
    ) OWN ON OWN.ID_CLIENTE = C.ID
    LEFT JOIN (
      SELECT USER_ID, MIN(COD_RCA) AS COD_RCA
      FROM VENDEDOR_RCA
      GROUP BY USER_ID
    ) VR ON VR.USER_ID = OWN.OWNER_USER_ID
    LEFT JOIN (
      SELECT
        VT.CODCLI,
        VT.COD_RCA,
        ROUND(
          SUM(
            CASE
              WHEN SUBSTRING(VT.DTSAIDA, 1, 10) >= SUBSTRING(DATE_SUB(CURRENT_DATE, INTERVAL 90 DAY), 1, 10)
                THEN COALESCE(VT.TOTAL, 0)
              ELSE 0
            END
          ),
          2
        ) AS COMPRAS_90D,
        DATEDIFF(
          CURRENT_DATE,
          MAX(SUBSTRING(VT.DTSAIDA, 1, 10))
        ) AS DIAS_ULTIMA_COMPRA
      FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA VT
      GROUP BY VT.CODCLI, VT.COD_RCA
    ) IA ON IA.CODCLI = C.ID AND IA.COD_RCA = VR.COD_RCA
    LEFT JOIN (
      SELECT
        V.CLIENTE_ID,
        SUM(
          CASE
            WHEN V.STATUS = 'CONCLUIDA'
              AND SUBSTRING(V.DATA_AGENDADA, 1, 10) >= SUBSTRING(DATE_SUB(CURRENT_DATE, INTERVAL 60 DAY), 1, 10)
              THEN 1
            ELSE 0
          END
        ) AS VISITAS_60D,
        DATEDIFF(
          CURRENT_DATE,
          MAX(CASE WHEN V.STATUS = 'CONCLUIDA' THEN SUBSTRING(V.DATA_AGENDADA, 1, 10) END)
        ) AS DIAS_SEM_VISITA
      FROM VISITAS V
      GROUP BY V.CLIENTE_ID
    ) VIA ON VIA.CLIENTE_ID = C.ID
    WHERE (
        EC.ID_VENDEDOR = :VAR_USER
        OR F.ID_SUBSTITUTO = :VAR_USER
      )
      AND ('{{idBu}}' = '' OR COALESCE(NULLIF(TRIM(EC.ID_BU), ''), 'PADRAO') = '{{idBu}}')
      AND (
        '{{busca}}' = ''
        OR C.NOME_FANTASIA LIKE '%{{busca}}%'
        OR C.RAZAO_SOCIAL LIKE '%{{busca}}%'
        OR C.CNPJ LIKE '%{{busca}}%'
        OR CAST(C.ID AS CHAR) LIKE '%{{busca}}%'
      )
      AND ('{{segmento}}' = '' OR C.SEGMENTO = '{{segmento}}')
      AND ('{{status}}' = '' OR C.STATUS = '{{status}}')
      AND ('{{cidade}}' = '' OR C.CIDADE LIKE '%{{cidade}}%')
      AND ('{{uf}}' = '' OR C.UF = '{{uf}}')
    GROUP BY
      C.ID,
      C.RAZAO_SOCIAL,
      C.NOME_FANTASIA,
      C.CNPJ,
      C.CIDADE,
      C.UF,
      C.SEGMENTO,
      C.STATUS,
      IA.COMPRAS_90D,
      IA.DIAS_ULTIMA_COMPRA,
      VIA.VISITAS_60D,
      VIA.DIAS_SEM_VISITA
  ) B
  ORDER BY B.NOME_FANTASIA
  LIMIT {{limit}} OFFSET {{offset}}
`;

const sfDefinition = {
  name: 'minhaCarteiraClientesRanking',
  description: 'Lista carteira com score matemático de ranking baseado em compras e visitas.',
  code: sqlCarteiraComRanking,
};

function extractSfId(response) {
  return (
    response?.result?.serverFunctionId
    || response?.serverFunctionId
    || response?.result?.id
    || response?.id
    || null
  );
}

async function upsertSf(definition, existingList) {
  const existing = existingList.find((sf) => sf.name === definition.name);
  if (existing) {
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: existing.id,
      code: definition.code,
      description: definition.description,
    });
    return existing.id;
  }

  const created = await createServerFunctionMitra({
    projectId,
    name: definition.name,
    type: 'SQL',
    code: definition.code,
    description: definition.description,
  });

  return extractSfId(created);
}

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || [];
  const sfId = await upsertSf(sfDefinition, existing);

  console.log('SF de ranking matemático da carteira configurada com sucesso.');
  console.log(JSON.stringify({ sfId, name: sfDefinition.name }, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar SF de ranking matemático:');
  console.error(error?.message || error);
  process.exit(1);
});
