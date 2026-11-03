import 'dotenv/config';
import { configureSdkMitra, readServerFunctionMitra, runQueryMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS || process.env.MITRA_BASE_URL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const userId = Number(process.argv[2] || 15);
const mes = String(process.argv[3] || 5);
const ano = String(process.argv[4] || 2026);
const dataInicio = `${ano}-${mes.padStart(2, '0')}-01`;
const dataFim = `${ano}-${mes.padStart(2, '0')}-${new Date(Number(ano), Number(mes), 0).getDate()}`;

const inputOverview = {
  scopeMode: 'ME',
  scopeUserId: '',
  scopeCodRca: '',
  scopeCodFilial: '',
  scopeCodepto: '',
  scopeIdSecao: '',
  dataInicio,
  dataFim,
  filiais: '',
  departamentos: '',
  secoes: '',
  ramos: '',
  limit: '50',
  offset: '0',
};

const inputSemana = {
  vendedorId: String(userId),
  scopeMode: 'ME',
  scopeUserId: '',
  scopeCodRca: '',
  scopeCodFilial: '',
  scopeCodepto: '',
  scopeIdSecao: '',
  ramoCliente: '',
  mes,
  ano,
  semanaNumero: '3',
};

function escapeValue(value) {
  return String(value ?? '').replace(/'/g, "''");
}

function materialize(sql, input) {
  let code = sql.replace(/:VAR_USER/g, String(userId));
  for (const [key, value] of Object.entries(input)) {
    code = code.replaceAll(`{{${key}}}`, escapeValue(value));
  }
  code = code.replace(/'\{\{[^}]+\}\}'/g, "''");
  code = code.replace(/\{\{[^}]+\}\}/g, '');
  return code;
}

async function runRows(sql) {
  const res = await runQueryMitra({ projectId, sql });
  return res?.result?.rows || [];
}

async function main() {
  const [overviewFn, semanaFn] = await Promise.all([
    readServerFunctionMitra({ projectId, serverFunctionId: 182 }),
    readServerFunctionMitra({ projectId, serverFunctionId: 104 }),
  ]);

  const overviewSql = materialize(overviewFn.result.code, inputOverview);
  const semanaSql = materialize(semanaFn.result.code, inputSemana);

  const [overviewRows, semanaRows] = await Promise.all([
    runRows(overviewSql),
    runRows(semanaSql),
  ]);

  const overview = overviewRows[0] || {};
  const semanaTotal = semanaRows.reduce((sum, row) => sum + Number(row.FECHAMENTO_MES || 0), 0);

  const semanaPorCliente = semanaRows.map((row) => ({
    clienteId: row.CLIENTE_ID,
    cliente: row.CLIENTE,
    totalSemana: Number(row.FECHAMENTO_MES || 0),
    vendedorId: row.VENDEDOR_ID,
    ramo: row.RAMO_CLIENTE,
  })).sort((a, b) => Math.abs(b.totalSemana) - Math.abs(a.totalSemana));

  const brutoPorClienteSql = `
    WITH CARTEIRA AS (
      SELECT DISTINCT C.ID AS CLIENTE_ID, COALESCE(C.WINTHOR_CODCLI, C.ID) AS CODCLI
      FROM EQUIPE_CLIENTE EC
      JOIN CLIENTES C ON C.ID = EC.ID_CLIENTE
      WHERE EC.ID_VENDEDOR = ${userId}
    ), BU AS (
      SELECT DISTINCT
        TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) AS CODFILIAL,
        TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO,
        BV.ID_SECAO
      FROM BU_VENDEDOR BV
      WHERE BV.VENDEDOR_ID = ${userId}
        AND COALESCE(BV.ATIVO, TRUE) = TRUE
    )
    SELECT
      C.CLIENTE_ID,
      CL.NOME_FANTASIA AS CLIENTE,
      ROUND(SUM(COALESCE(V.TOTAL, 0)), 2) AS TOTAL_BRUTO,
      COUNT(DISTINCT V.NUMPED) AS PEDIDOS,
      GROUP_CONCAT(DISTINCT CONCAT(V.CODFILIAL, '/', V.CODEPTO, '/', V.CODSEC) ORDER BY V.CODFILIAL, V.CODEPTO, V.CODSEC SEPARATOR ', ') AS ESCOPO_VENDA
    FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA V
    JOIN CARTEIRA C ON TRIM(CAST(C.CODCLI AS CHAR)) = TRIM(CAST(V.CODCLI AS CHAR))
    JOIN BU B ON B.CODFILIAL = TRIM(COALESCE(CAST(V.CODFILIAL AS CHAR), ''))
      AND B.CODEPTO = TRIM(CAST(V.CODEPTO AS CHAR))
      AND (
        B.ID_SECAO IS NULL
        OR TRIM(CAST(B.ID_SECAO AS CHAR)) = TRIM(CAST(V.CODSEC AS CHAR))
        OR LPAD(TRIM(CAST(B.ID_SECAO AS CHAR)), 2, '0') = TRIM(CAST(V.CODSEC AS CHAR))
      )
    LEFT JOIN CLIENTES CL ON CL.ID = C.CLIENTE_ID
    WHERE V.DTSAIDA >= '${dataInicio}' AND V.DTSAIDA <= '${dataFim}'
    GROUP BY C.CLIENTE_ID, CL.NOME_FANTASIA
    ORDER BY TOTAL_BRUTO DESC
  `;

  const brutoPorCliente = await runRows(brutoPorClienteSql);
  const semanaMap = new Map(semanaPorCliente.map((row) => [String(row.clienteId), row.totalSemana]));
  const comparativoCliente = brutoPorCliente.map((row) => ({
    clienteId: row.CLIENTE_ID,
    cliente: row.CLIENTE,
    totalOverviewBruto: Number(row.TOTAL_BRUTO || 0),
    totalSemana: Number(semanaMap.get(String(row.CLIENTE_ID)) || 0),
    diferencaSemanaMenosOverview: Number((Number(semanaMap.get(String(row.CLIENTE_ID)) || 0) - Number(row.TOTAL_BRUTO || 0)).toFixed(2)),
    pedidos: row.PEDIDOS,
    escopoVenda: row.ESCOPO_VENDA,
  })).sort((a, b) => Math.abs(b.diferencaSemanaMenosOverview) - Math.abs(a.diferencaSemanaMenosOverview));

  console.log(JSON.stringify({
    parametros: { userId, mes, ano, dataInicio, dataFim },
    overview: {
      faturamentoBruto: Number(overview.FATURAMENTO_BRUTO || 0),
      totalDevolvido: Number(overview.TOTAL_DEVOLVIDO || 0),
      faturamentoLiquido: Number(overview.FATURAMENTO_LIQUIDO || 0),
      clientesComCompra: Number(overview.CLIENTES_COM_COMPRA || 0),
    },
    minhaSemana: {
      linhas: semanaRows.length,
      fechamentoMes: Number(semanaTotal.toFixed(2)),
    },
    diferencaSemanaMenosOverviewBruto: Number((semanaTotal - Number(overview.FATURAMENTO_BRUTO || 0)).toFixed(2)),
    diferencaSemanaMenosOverviewLiquido: Number((semanaTotal - Number(overview.FATURAMENTO_LIQUIDO || 0)).toFixed(2)),
    topClientesSemana: semanaPorCliente.slice(0, 20),
    comparativoCliente,
  }, null, 2));
}

main().catch((error) => {
  console.error('Falha no diagnóstico:');
  console.error(error?.message || error);
  process.exit(1);
});
