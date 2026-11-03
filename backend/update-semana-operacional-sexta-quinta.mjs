import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

function decodeTokenPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '');
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

const tokenPayload = decodeTokenPayload(process.env.MITRA_TOKEN);
const baseURL = process.env.MITRA_BASE_URL || tokenPayload?.backURL || process.env.MITRA_BASE_URL_SPACE;

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const dryRun = process.argv.includes('--dry-run');
const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

function dateSql(alias, column) {
  return `STR_TO_DATE(LEFT(TRIM(CAST(${alias}.${column} AS CHAR)), 10), '%Y-%m-%d')`;
}

function monthStartOfSql(date) {
  return `DATE_SUB(${date}, INTERVAL (DAYOFMONTH(${date}) - 1) DAY)`;
}

function previousFridayOfSql(date) {
  return `DATE_SUB(${date}, INTERVAL ((WEEKDAY(${date}) + 3) % 7) DAY)`;
}

function firstFridayAfterMonthStartOfSql(date) {
  const monthStart = monthStartOfSql(date);
  const daysUntilFriday = `((4 - WEEKDAY(${monthStart}) + 7) % 7)`;
  const daysToNextFriday = `CASE WHEN ${daysUntilFriday} = 0 THEN 7 ELSE ${daysUntilFriday} END`;
  return `DATE_ADD(${monthStart}, INTERVAL (${daysToNextFriday}) DAY)`;
}

function weekStartOfSql(date) {
  return `GREATEST(${monthStartOfSql(date)}, ${previousFridayOfSql(date)})`;
}

function weekEndOfSql(date) {
  return `LEAST(LAST_DAY(${date}), DATE_ADD(${previousFridayOfSql(date)}, INTERVAL 6 DAY))`;
}

function weekNumberOfSql(date) {
  const weekStart = weekStartOfSql(date);
  const monthStart = monthStartOfSql(date);
  const firstFridayAfterMonthStart = firstFridayAfterMonthStartOfSql(date);
  return `CASE WHEN ${weekStart} = ${monthStart} THEN 1 ELSE 2 + FLOOR(DATEDIFF(${weekStart}, ${firstFridayAfterMonthStart}) / 7) END`;
}

function weekStartSql(alias, column) {
  return weekStartOfSql(dateSql(alias, column));
}

function weekEndSql(alias, column) {
  return weekEndOfSql(dateSql(alias, column));
}

function weekYearSql(alias, column) {
  return `CAST(DATE_FORMAT(${weekStartSql(alias, column)}, '%Y') AS UNSIGNED)`;
}

function weekMonthSql(alias, column) {
  return `MONTH(${weekStartSql(alias, column)})`;
}

function weekNumberSql(alias, column) {
  return weekNumberOfSql(dateSql(alias, column));
}

const CURRENT_WEEK_START = weekStartOfSql('CURRENT_DATE');
const CURRENT_WEEK_YEAR = `CAST(DATE_FORMAT(${CURRENT_WEEK_START}, '%Y') AS UNSIGNED)`;
const CURRENT_WEEK_NUMBER = weekNumberOfSql('CURRENT_DATE');

function legacyWeekStartOfSql(date) {
  return previousFridayOfSql(date);
}

function legacyWeekEndOfSql(date) {
  return `DATE_ADD(${legacyWeekStartOfSql(date)}, INTERVAL 6 DAY)`;
}

function legacyWeekYearOfSql(date) {
  return `CAST(DATE_FORMAT(${legacyWeekStartOfSql(date)}, '%Y') AS UNSIGNED)`;
}

function legacyWeekMonthOfSql(date) {
  return `MONTH(${legacyWeekStartOfSql(date)})`;
}

function legacyWeekNumberOfSql(date) {
  return `1 + FLOOR((DAY(${legacyWeekStartOfSql(date)}) - 1) / 7)`;
}

function nestedWeekStartOfSql(date) {
  return `GREATEST(${monthStartOfSql(date)}, ${weekStartOfSql(date)})`;
}

function faultyWeekEndWithWeekStartOfSql(date) {
  return `LEAST(LAST_DAY(${date}), DATE_ADD(${weekStartOfSql(date)}, INTERVAL 6 DAY))`;
}

function faultyWeekEndWithNestedWeekStartOfSql(date) {
  return `LEAST(LAST_DAY(${date}), DATE_ADD(${nestedWeekStartOfSql(date)}, INTERVAL 6 DAY))`;
}

function normalizeOperationalExpressions(code) {
  let next = code;
  const dates = [
    dateSql('R', 'DATA_SAIDA'),
    dateSql('D', 'DATA_DEVOLUCAO'),
    dateSql('I', 'DTSAIDA'),
    'CURRENT_DATE',
  ];

  for (const date of dates) {
    next = replaceAllLiteral(next, faultyWeekEndWithNestedWeekStartOfSql(date), weekEndOfSql(date));
    next = replaceAllLiteral(next, faultyWeekEndWithWeekStartOfSql(date), weekEndOfSql(date));
    next = replaceAllLiteral(next, nestedWeekStartOfSql(date), weekStartOfSql(date));
  }

  return next;
}

function legacyWeekYearSql(alias, column) {
  return `YEAR(${legacyWeekStartOfSql(dateSql(alias, column))})`;
}

function replaceLegacyOperationalExpressions(code) {
  let next = code;
  const dates = [
    dateSql('R', 'DATA_SAIDA'),
    dateSql('D', 'DATA_DEVOLUCAO'),
    dateSql('I', 'DTSAIDA'),
    'CURRENT_DATE',
  ];

  for (const date of dates) {
    const legacyStart = legacyWeekStartOfSql(date);
    const legacyEnd = legacyWeekEndOfSql(date);
    const nextStart = weekStartOfSql(date);
    const nextEnd = weekEndOfSql(date);

    next = replaceAllLiteral(next, `${legacyStart} AS DATA_INICIO_SEMANA_OPERACIONAL`, `${nextStart} AS DATA_INICIO_SEMANA_OPERACIONAL`);
    next = replaceAllLiteral(next, `${legacyEnd} AS DATA_FIM_SEMANA_OPERACIONAL`, `${nextEnd} AS DATA_FIM_SEMANA_OPERACIONAL`);
    next = replaceAllLiteral(next, `DATE_FORMAT(MIN(${legacyStart}), '%Y-%m-%d') AS DATA_INICIO`, `DATE_FORMAT(MIN(${nextStart}), '%Y-%m-%d') AS DATA_INICIO`);
    next = replaceAllLiteral(next, `DATE_FORMAT(MAX(${legacyEnd}), '%Y-%m-%d') AS DATA_FIM`, `DATE_FORMAT(MAX(${nextEnd}), '%Y-%m-%d') AS DATA_FIM`);
    next = replaceAllLiteral(next, `DATE_FORMAT(${legacyStart}, '%Y-%m-01')`, `DATE_FORMAT(${nextStart}, '%Y-%m-01')`);
    next = replaceAllLiteral(next, legacyWeekYearOfSql(date), `CAST(DATE_FORMAT(${weekStartOfSql(date)}, '%Y') AS UNSIGNED)`);
    next = replaceAllLiteralGuarded(next, legacyWeekMonthOfSql(date), `MONTH(${weekStartOfSql(date)})`, 'DAYOF');
    next = replaceAllLiteral(next, legacyWeekNumberOfSql(date), weekNumberOfSql(date));
  }

  return normalizeOperationalExpressions(next);
}

function replaceLegacyOperationalYear(code) {
  let next = code;
  for (const [alias, column] of [['R', 'DATA_SAIDA'], ['D', 'DATA_DEVOLUCAO'], ['I', 'DTSAIDA']]) {
    next = replaceAllLiteral(next, legacyWeekYearSql(alias, column), weekYearSql(alias, column));
  }
  next = replaceAllLiteral(next, `YEAR(${CURRENT_WEEK_START})`, CURRENT_WEEK_YEAR);
  return next;
}

function replaceOnce(code, search, replacement, label) {
  const index = code.indexOf(search);
  if (index === -1) throw new Error(`Trecho nao encontrado: ${label}`);
  return code.slice(0, index) + replacement + code.slice(index + search.length);
}

function replaceAllLiteral(code, search, replacement) {
  return code.split(search).join(replacement);
}

// Substitui apenas ocorrencias que NAO estao precedidas por guardPrefix.
// Necessario porque 'MONTH(CURRENT_DATE)' e substring de 'DAYOFMONTH(CURRENT_DATE)'.
function replaceAllLiteralGuarded(code, search, replacement, guardPrefix) {
  let out = '';
  let cursor = 0;

  for (;;) {
    const index = code.indexOf(search, cursor);
    if (index === -1) {
      out += code.slice(cursor);
      return out;
    }
    const guarded =
      index >= guardPrefix.length && code.slice(index - guardPrefix.length, index) === guardPrefix;
    out += code.slice(cursor, index) + (guarded ? search : replacement);
    cursor = index + search.length;
  }
}

// Repara codigo ja publicado onde o argumento de DAYOFMONTH(...) foi contaminado
// por substituicoes anteriores (ex: DAYOFMONTH(GREATEST(...)) no lugar de DAYOFMONTH(CURRENT_DATE)).
function repairCorruptedDayOfMonth(code) {
  const token = 'DAYOFMONTH(';
  let out = '';
  let cursor = 0;

  for (;;) {
    const index = code.indexOf(token, cursor);
    if (index === -1) {
      out += code.slice(cursor);
      return out;
    }

    const argStart = index + token.length;
    let depth = 1;
    let end = argStart;
    while (end < code.length && depth > 0) {
      const char = code[end];
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      end += 1;
    }

    const arg = code.slice(argStart, end - 1);
    const onlyCurrentDate =
      arg.includes('CURRENT_DATE') && !/R\.DATA_SAIDA|D\.DATA_DEVOLUCAO|I\.DTSAIDA/.test(arg);
    const fixed = arg !== 'CURRENT_DATE' && onlyCurrentDate ? 'CURRENT_DATE' : arg;

    out += code.slice(cursor, index) + token + fixed + ')';
    cursor = end;
  }
}

function normalizeCurrentDateDefaults(code) {
  return code
    .replace(
      /^(\s*)CASE WHEN '\{\{mes\}\}' = '' THEN .* ELSE CAST\('\{\{mes\}\}' AS UNSIGNED\) END AS MES_REF,$/gm,
      (_match, indent) => `${indent}CASE WHEN '{{mes}}' = '' THEN MONTH(${CURRENT_WEEK_START}) ELSE CAST('{{mes}}' AS UNSIGNED) END AS MES_REF,`,
    )
    .replace(
      /^(\s*)CASE WHEN '\{\{MES\}\}' = '' THEN .* ELSE CAST\('\{\{MES\}\}' AS UNSIGNED\) END AS MES_REF,$/gm,
      (_match, indent) => `${indent}CASE WHEN '{{MES}}' = '' THEN MONTH(${CURRENT_WEEK_START}) ELSE CAST('{{MES}}' AS UNSIGNED) END AS MES_REF,`,
    )
    .replace(
      /^(\s*)CASE WHEN '\{\{ano\}\}' = '' THEN .* ELSE CAST\('\{\{ano\}\}' AS UNSIGNED\) END AS ANO_REF,$/gm,
      (_match, indent) => `${indent}CASE WHEN '{{ano}}' = '' THEN ${CURRENT_WEEK_YEAR} ELSE CAST('{{ano}}' AS UNSIGNED) END AS ANO_REF,`,
    )
    .replace(
      /^(\s*)CASE WHEN '\{\{ANO\}\}' = '' THEN .* ELSE CAST\('\{\{ANO\}\}' AS UNSIGNED\) END AS ANO_REF,$/gm,
      (_match, indent) => `${indent}CASE WHEN '{{ANO}}' = '' THEN ${CURRENT_WEEK_YEAR} ELSE CAST('{{ANO}}' AS UNSIGNED) END AS ANO_REF,`,
    )
    .replace(
      /^(\s*)CASE WHEN '\{\{semanaNumero\}\}' = '' THEN .* ELSE CAST\('\{\{semanaNumero\}\}' AS UNSIGNED\) END AS SEMANA_REF,$/gm,
      (_match, indent) => `${indent}CASE WHEN '{{semanaNumero}}' = '' THEN ${CURRENT_WEEK_NUMBER} ELSE CAST('{{semanaNumero}}' AS UNSIGNED) END AS SEMANA_REF,`,
    )
    .replace(
      /^(\s*)CASE WHEN '\{\{ano\}\}' REGEXP '\^\[0-9\]\{4\}\$' THEN CAST\('\{\{ano\}\}' AS UNSIGNED\) ELSE .* END AS ANO_REF,$/gm,
      (_match, indent) => `${indent}CASE WHEN '{{ano}}' REGEXP '^[0-9]{4}$' THEN CAST('{{ano}}' AS UNSIGNED) ELSE ${CURRENT_WEEK_YEAR} END AS ANO_REF,`,
    );
}

function replaceCurrentDateDefaults(code) {
  return normalizeCurrentDateDefaults(replaceLegacyOperationalExpressions(replaceLegacyOperationalYear(replaceAllLiteral(
    replaceAllLiteralGuarded(
      replaceAllLiteral(code, 'CEIL(DAY(CURRENT_DATE) / 7)', CURRENT_WEEK_NUMBER),
      'MONTH(CURRENT_DATE)',
      `MONTH(${CURRENT_WEEK_START})`,
      'DAYOF',
    ),
    'YEAR(CURRENT_DATE)',
    CURRENT_WEEK_YEAR,
  ))));
}

function ensureSem6BwColumns(code) {
  let next = code;

  if (!/\bAS\s+SEM_6\b/i.test(next)) {
    next = replaceAllLiteral(
      next,
      '    SUM(CASE WHEN SEMANA_NUMERO = 5 THEN VALOR ELSE 0 END) AS SEM_5,\n    SUM(VALOR) AS FECHAMENTO_MES',
      '    SUM(CASE WHEN SEMANA_NUMERO = 5 THEN VALOR ELSE 0 END) AS SEM_5,\n    SUM(CASE WHEN SEMANA_NUMERO = 6 THEN VALOR ELSE 0 END) AS SEM_6,\n    SUM(VALOR) AS FECHAMENTO_MES',
    );
  }

  if (!/\bAS\s+SEM_6_ANT\b/i.test(next)) {
    next = replaceAllLiteral(
      next,
      '    SUM(CASE WHEN SEMANA_NUMERO = 5 THEN VALOR ELSE 0 END) AS SEM_5_ANT,\n    SUM(VALOR) AS FECHAMENTO_MES_ANTERIOR',
      '    SUM(CASE WHEN SEMANA_NUMERO = 5 THEN VALOR ELSE 0 END) AS SEM_5_ANT,\n    SUM(CASE WHEN SEMANA_NUMERO = 6 THEN VALOR ELSE 0 END) AS SEM_6_ANT,\n    SUM(VALOR) AS FECHAMENTO_MES_ANTERIOR',
    );
  }

  if (!/\bAS\s+DELTA_BW_SEM_6\b/i.test(next)) {
    next = replaceAllLiteral(
      next,
      '  COALESCE(SM.SEM_5, 0) AS SEM_5,\n  CASE WHEN COALESCE(SA3.SEM_5_ANT, 0) = 0 THEN -1 ELSE ROUND((COALESCE(SM.SEM_5, 0) - SA3.SEM_5_ANT) / SA3.SEM_5_ANT, 4) END AS DELTA_BW_SEM_5,\n  COALESCE(SM.FECHAMENTO_MES, 0) AS FECHAMENTO_MES',
      '  COALESCE(SM.SEM_5, 0) AS SEM_5,\n  CASE WHEN COALESCE(SA3.SEM_5_ANT, 0) = 0 THEN -1 ELSE ROUND((COALESCE(SM.SEM_5, 0) - SA3.SEM_5_ANT) / SA3.SEM_5_ANT, 4) END AS DELTA_BW_SEM_5,\n  COALESCE(SM.SEM_6, 0) AS SEM_6,\n  CASE WHEN COALESCE(SA3.SEM_6_ANT, 0) = 0 THEN -1 ELSE ROUND((COALESCE(SM.SEM_6, 0) - SA3.SEM_6_ANT) / SA3.SEM_6_ANT, 4) END AS DELTA_BW_SEM_6,\n  COALESCE(SM.FECHAMENTO_MES, 0) AS FECHAMENTO_MES',
    );
  }

  return next;
}

function weeklyOperationalCtes() {
  return `RAW_OPERACIONAL AS (
  SELECT
    R.*,
    ${weekStartSql('R', 'DATA_SAIDA')} AS DATA_INICIO_SEMANA_OPERACIONAL,
    ${weekEndSql('R', 'DATA_SAIDA')} AS DATA_FIM_SEMANA_OPERACIONAL,
    ${weekYearSql('R', 'DATA_SAIDA')} AS ANO_OPERACIONAL,
    ${weekMonthSql('R', 'DATA_SAIDA')} AS MES_OPERACIONAL,
    ${weekNumberSql('R', 'DATA_SAIDA')} AS SEMANA_NUMERO_OPERACIONAL
  FROM PEDIDOS_SEMANAIS_SYNC_RAW R
  WHERE CAST(R.DATA_SAIDA AS CHAR) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
    AND R.ATIVO = TRUE
    AND R.STATUS_INGESTAO = 'ATIVO'
    AND R.CLIENTE_ID IS NOT NULL
    AND R.CODFILIAL IS NOT NULL
    AND R.CODFILIAL <> ''
    AND R.CODEPTO IS NOT NULL
    AND R.CODEPTO <> ''
    AND R.ID_SECAO IS NOT NULL
),
PEDIDOS_SEMANAIS_SYNC_OPERACIONAL AS (
  SELECT
    R.CLIENTE_ID,
    0 AS VENDEDOR_ID,
    R.CODFILIAL,
    R.CODEPTO,
    R.ID_SECAO,
    MAX(R.SEGMENTO) AS SEGMENTO,
    ROUND(SUM(COALESCE(R.TOTAL, R.VALOR, 0)), 2) AS VALOR,
    ROUND(SUM(COALESCE(R.QT, 0)), 6) AS QT,
    R.SEMANA_NUMERO_OPERACIONAL AS SEMANA_NUMERO,
    R.MES_OPERACIONAL AS MES,
    R.ANO_OPERACIONAL AS ANO,
    TRUE AS ATIVO
  FROM RAW_OPERACIONAL R
  GROUP BY R.CLIENTE_ID, R.CODFILIAL, R.CODEPTO, R.ID_SECAO, R.ANO_OPERACIONAL, R.MES_OPERACIONAL, R.SEMANA_NUMERO_OPERACIONAL
),
PERFIL_COMPRA_CLIENTE_OPERACIONAL AS (
  SELECT
    BASE.CLIENTE_ID,
    BASE.FREQUENCIA,
    BASE.SEMANA_PADRAO,
    BASE.TICKET_MEDIO_3M
  FROM (
    SELECT
      PS.CLIENTE_ID,
      CASE
        WHEN COUNT(DISTINCT CONCAT(PS.ANO, '-', LPAD(PS.MES, 2, '0'), '-', PS.SEMANA_NUMERO)) >= 9 THEN 'SEMANAL'
        WHEN COUNT(DISTINCT CONCAT(PS.ANO, '-', LPAD(PS.MES, 2, '0'), '-', PS.SEMANA_NUMERO)) >= 4 THEN 'QUINZENAL'
        ELSE 'MENSAL'
      END AS FREQUENCIA,
      (
        SELECT P2.SEMANA_NUMERO
        FROM PEDIDOS_SEMANAIS_SYNC_OPERACIONAL P2
        WHERE P2.CLIENTE_ID = PS.CLIENTE_ID
          AND STR_TO_DATE(CONCAT(P2.ANO, '-', LPAD(P2.MES, 2, '0'), '-01'), '%Y-%m-%d') >= DATE_SUB(DATE_FORMAT(${CURRENT_WEEK_START}, '%Y-%m-01'), INTERVAL 2 MONTH)
        GROUP BY P2.SEMANA_NUMERO
        ORDER BY COUNT(*) DESC, P2.SEMANA_NUMERO
        LIMIT 1
      ) AS SEMANA_PADRAO,
      ROUND(AVG(PS.VALOR), 2) AS TICKET_MEDIO_3M
    FROM PEDIDOS_SEMANAIS_SYNC_OPERACIONAL PS
    WHERE PS.ATIVO = TRUE
      AND STR_TO_DATE(CONCAT(PS.ANO, '-', LPAD(PS.MES, 2, '0'), '-01'), '%Y-%m-%d') >= DATE_SUB(DATE_FORMAT(${CURRENT_WEEK_START}, '%Y-%m-01'), INTERVAL 2 MONTH)
    GROUP BY PS.CLIENTE_ID
  ) BASE
)`;
}

function ensureRawDateFilter(code) {
  const filter = "    AND CAST(R.DATA_SAIDA AS CHAR) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}'";
  if (code.includes(filter.trim())) return code;
  return code.replace(
    "    AND R.STATUS_INGESTAO = 'ATIVO'",
    "    AND R.STATUS_INGESTAO = 'ATIVO'\n" + filter,
  );
}

function replaceRawSelectTriple(code) {
  const search = `    R.ANO,
    R.MES,
    R.SEMANA_NUMERO,`;
  const replacement = `    ${weekYearSql('R', 'DATA_SAIDA')} AS ANO,
    ${weekMonthSql('R', 'DATA_SAIDA')} AS MES,
    ${weekNumberSql('R', 'DATA_SAIDA')} AS SEMANA_NUMERO,`;
  return replaceAllLiteral(code, search, replacement);
}

function replaceDevolucaoOperationalWeek(code) {
  let next = code;
  const oldYear = "CAST(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 4) AS UNSIGNED)";
  const oldMonth = "CAST(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 6, 2) AS UNSIGNED)";
  const oldWeek = "LEAST(5, GREATEST(1, CEIL(CAST(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 9, 2) AS UNSIGNED) / 7)))";

  next = replaceAllLiteral(next, oldYear, weekYearSql('D', 'DATA_DEVOLUCAO'));
  next = replaceAllLiteral(next, oldMonth, weekMonthSql('D', 'DATA_DEVOLUCAO'));
  next = replaceAllLiteral(next, oldWeek, weekNumberSql('D', 'DATA_DEVOLUCAO'));
  next = replaceAllLiteral(
    next,
    "MIN(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 10)) AS DATA_INICIO",
    `DATE_FORMAT(MIN(${weekStartSql('D', 'DATA_DEVOLUCAO')}), '%Y-%m-%d') AS DATA_INICIO`,
  );
  next = replaceAllLiteral(
    next,
    "MAX(SUBSTRING(CAST(D.DATA_DEVOLUCAO AS CHAR), 1, 10)) AS DATA_FIM",
    `DATE_FORMAT(MAX(${weekEndSql('D', 'DATA_DEVOLUCAO')}), '%Y-%m-%d') AS DATA_FIM`,
  );
  return next;
}

function transformSf104(code) {
  let next = replaceCurrentDateDefaults(code);

  if (!/PEDIDOS_SEMANAIS_SYNC_OPERACIONAL/i.test(next)) {
    next = replaceOnce(
      next,
      '),\nPERIODO_ANTERIOR AS (',
      `),\n${weeklyOperationalCtes()},\nPERIODO_ANTERIOR AS (`,
      'SF 104: inserir CTEs operacionais',
    );
  }

  next = replaceAllLiteral(next, 'FROM PEDIDOS_SEMANAIS_SYNC PS', 'FROM PEDIDOS_SEMANAIS_SYNC_OPERACIONAL PS');
  next = replaceAllLiteral(next, 'LEFT JOIN PERFIL_COMPRA_CLIENTE PC', 'LEFT JOIN PERFIL_COMPRA_CLIENTE_OPERACIONAL PC');
  return ensureSem6BwColumns(next);
}

function transformSf105(code) {
  let next = replaceCurrentDateDefaults(code);

  if (!/PEDIDOS_SEMANAIS_SYNC_OPERACIONAL/i.test(next)) {
    next = replaceOnce(
      next,
      "    )\n    SELECT\n      PC.CLIENTE_ID,",
      `    ),\n    ${weeklyOperationalCtes().replace(/\n/g, '\n    ')}\n    SELECT\n      PC.CLIENTE_ID,`,
      'SF 105: inserir CTEs operacionais',
    );
  }

  next = replaceAllLiteral(next, 'FROM PERFIL_COMPRA_CLIENTE PC', 'FROM PERFIL_COMPRA_CLIENTE_OPERACIONAL PC');
  next = replaceAllLiteral(next, 'FROM PEDIDOS_SEMANAIS_SYNC PSW', 'FROM PEDIDOS_SEMANAIS_SYNC_OPERACIONAL PSW');
  return next;
}

function transformSf107(code) {
  let next = code;
  next = replaceAllLiteral(
    next,
    "CASE WHEN I.DTSAIDA REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN CAST(SUBSTRING(I.DTSAIDA, 1, 4) AS UNSIGNED) ELSE NULL END AS ANO",
    `CASE WHEN CAST(I.DTSAIDA AS CHAR) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN ${weekYearSql('I', 'DTSAIDA')} ELSE NULL END AS ANO`,
  );
  next = replaceAllLiteral(
    next,
    "CASE WHEN I.DTSAIDA REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN CAST(SUBSTRING(I.DTSAIDA, 6, 2) AS UNSIGNED) ELSE NULL END AS MES",
    `CASE WHEN CAST(I.DTSAIDA AS CHAR) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN ${weekMonthSql('I', 'DTSAIDA')} ELSE NULL END AS MES`,
  );
  next = replaceAllLiteral(
    next,
    "CASE WHEN I.DTSAIDA REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN LEAST(5, GREATEST(1, CEIL(CAST(SUBSTRING(I.DTSAIDA, 9, 2) AS UNSIGNED) / 7))) ELSE NULL END AS SEMANA_NUMERO",
    `CASE WHEN CAST(I.DTSAIDA AS CHAR) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN ${weekNumberSql('I', 'DTSAIDA')} ELSE NULL END AS SEMANA_NUMERO`,
  );
  next = replaceAllLiteral(next, 'R.SEMANA_NUMERO BETWEEN 1 AND 5', 'R.SEMANA_NUMERO BETWEEN 1 AND 6');
  next = replaceLegacyOperationalExpressions(replaceLegacyOperationalYear(next));
  return next;
}

function transformSf109(code) {
  let next = code;
  next = ensureRawDateFilter(next);
  next = replaceRawSelectTriple(next);
  next = replaceAllLiteral(
    next,
    '    MIN(R.DATA_SAIDA) AS DATA_INICIO,\n    MAX(R.DATA_SAIDA) AS DATA_FIM,',
    `    DATE_FORMAT(MIN(${weekStartSql('R', 'DATA_SAIDA')}), '%Y-%m-%d') AS DATA_INICIO,\n    DATE_FORMAT(MAX(${weekEndSql('R', 'DATA_SAIDA')}), '%Y-%m-%d') AS DATA_FIM,`,
  );
  next = replaceAllLiteral(
    next,
    "    AND R.ANO = CASE WHEN '{{ANO}}' = '' THEN YEAR(CURRENT_DATE) ELSE CAST('{{ANO}}' AS UNSIGNED) END",
    `    AND ${weekYearSql('R', 'DATA_SAIDA')} = CASE WHEN '{{ANO}}' = '' THEN ${CURRENT_WEEK_YEAR} ELSE CAST('{{ANO}}' AS UNSIGNED) END`,
  );
  next = replaceAllLiteral(
    next,
    "    AND ('{{MES}}' = '' OR R.MES = CAST('{{MES}}' AS UNSIGNED))",
    `    AND ('{{MES}}' = '' OR ${weekMonthSql('R', 'DATA_SAIDA')} = CAST('{{MES}}' AS UNSIGNED))`,
  );
  next = replaceAllLiteral(
    next,
    'GROUP BY R.ANO, R.MES, R.SEMANA_NUMERO',
    `GROUP BY ${weekYearSql('R', 'DATA_SAIDA')}, ${weekMonthSql('R', 'DATA_SAIDA')}, ${weekNumberSql('R', 'DATA_SAIDA')}`,
  );
  next = replaceDevolucaoOperationalWeek(next);
  next = replaceCurrentDateDefaults(next);
  return next;
}

function transformSf110(code) {
  let next = replaceCurrentDateDefaults(code);
  next = ensureRawDateFilter(next);
  next = replaceAllLiteral(
    next,
    "    CAST('{{ANO}}' AS UNSIGNED) AS ANO_REF,",
    `    CASE WHEN '{{ANO}}' = '' THEN ${CURRENT_WEEK_YEAR} ELSE CAST('{{ANO}}' AS UNSIGNED) END AS ANO_REF,`,
  );
  next = replaceRawSelectTriple(next);
  next = replaceAllLiteral(
    next,
    '      (R.ANO = PC.ANO_REF AND R.MES = PC.MES_REF)\n      OR (R.ANO = PC.ANO_ANT AND R.MES = PC.MES_ANT)',
    `      (${weekYearSql('R', 'DATA_SAIDA')} = PC.ANO_REF AND ${weekMonthSql('R', 'DATA_SAIDA')} = PC.MES_REF)\n      OR (${weekYearSql('R', 'DATA_SAIDA')} = PC.ANO_ANT AND ${weekMonthSql('R', 'DATA_SAIDA')} = PC.MES_ANT)`,
  );
  next = replaceAllLiteral(
    next,
    'GROUP BY R.CODPROD, R.ANO, R.MES, R.SEMANA_NUMERO',
    `GROUP BY R.CODPROD, ${weekYearSql('R', 'DATA_SAIDA')}, ${weekMonthSql('R', 'DATA_SAIDA')}, ${weekNumberSql('R', 'DATA_SAIDA')}`,
  );
  return next;
}

function transformSf111(code) {
  let next = replaceCurrentDateDefaults(code);
  next = ensureRawDateFilter(next);
  next = replaceAllLiteral(
    next,
    "    AND R.ANO = CAST('{{ANO}}' AS UNSIGNED)",
    `    AND ${weekYearSql('R', 'DATA_SAIDA')} = CAST('{{ANO}}' AS UNSIGNED)`,
  );
  next = replaceAllLiteral(
    next,
    '    AND R.SEMANA_NUMERO = {{SEMANA_NUMERO}}',
    `    AND ${weekNumberSql('R', 'DATA_SAIDA')} = {{SEMANA_NUMERO}}`,
  );
  next = replaceAllLiteral(
    next,
    "    AND ('{{MES}}' = '' OR R.MES = CAST('{{MES}}' AS UNSIGNED))",
    `    AND ('{{MES}}' = '' OR ${weekMonthSql('R', 'DATA_SAIDA')} = CAST('{{MES}}' AS UNSIGNED))`,
  );
  next = replaceDevolucaoOperationalWeek(next);
  return next;
}

function transformSf146(code) {
  let next = replaceCurrentDateDefaults(code);
  next = ensureRawDateFilter(next);
  next = replaceAllLiteral(next, 'ELSE 2026 END AS ANO_REF', `ELSE ${CURRENT_WEEK_YEAR} END AS ANO_REF`);
  if (next.includes('    R.SEMANA_NUMERO,')) {
    next = replaceOnce(
      next,
      '    R.SEMANA_NUMERO,',
      `    ${weekNumberSql('R', 'DATA_SAIDA')} AS SEMANA_NUMERO,`,
      'SF 146: semana operacional no SELECT base',
    );
  }
  next = replaceAllLiteral(next, 'R.ANO', weekYearSql('R', 'DATA_SAIDA'));
  next = replaceAllLiteral(next, 'R.MES', weekMonthSql('R', 'DATA_SAIDA'));
  next = replaceAllLiteral(next, 'R.SEMANA_NUMERO', weekNumberSql('R', 'DATA_SAIDA'));
  return next;
}

function assertOperationalWeek(code, id) {
  if (!/WEEKDAY\s*\(/i.test(code) || !/GREATEST\s*\(/i.test(code)) {
    throw new Error(`SF ${id}: regra sexta-quinta mensal recortada nao encontrada no codigo transformado.`);
  }
  if ((id === 109 || id === 110 || id === 111 || id === 146) && /\bR\.(ANO|MES|SEMANA_NUMERO)\b/i.test(code)) {
    throw new Error(`SF ${id}: ainda ha filtro ou agrupamento pela semana antiga da raw.`);
  }
  if ((id === 109 || id === 111) && !/VALOR_DEVOLVIDO/i.test(code)) {
    throw new Error(`SF ${id}: faturamento liquido de devolucoes foi perdido.`);
  }
  if (id === 104 && (!/\bSEM_6\b/i.test(code) || !/\bDELTA_BW_SEM_6\b/i.test(code))) {
    throw new Error('SF 104: coluna SEM_6 nao foi adicionada ao B/W semanal.');
  }
}

function extractCreatedId(response) {
  return response?.result?.serverFunctionId || response?.result?.id || response?.serverFunctionId || response?.id || null;
}

async function createBackup(current, serverFunctionId) {
  const backupName = `${current.name}-backup-${timestamp}`.slice(0, 120);
  const created = await createServerFunctionMitra({
    projectId,
    name: backupName,
    type: current.type,
    code: current.code,
    description: `Backup automatico da SF ${serverFunctionId} antes do ajuste de semana sexta-quinta recortada ao mes em ${timestamp}.`,
  });

  return Number(extractCreatedId(created) || 0);
}

const targets = [
  { id: 104, transform: transformSf104, description: 'Calcula B/W semanal com semanas sexta-quinta recortadas ao mes, incluindo sexta semana parcial quando houver.' },
  { id: 105, transform: transformSf105, description: 'Lista clientes esperados sem pedido na semana sexta-quinta recortada ao mes, restritos ao escopo do usuario.' },
  { id: 107, transform: transformSf107, description: 'Dispara sincronizacao manual do acompanhamento semanal usando semanas sexta-quinta recortadas ao mes.' },
  { id: 109, transform: transformSf109, description: 'Detalha semanas do cliente com faturamento liquido e semanas sexta-quinta recortadas ao mes.' },
  { id: 110, transform: transformSf110, description: 'Detalha itens da semana usando semanas sexta-quinta recortadas ao mes.' },
  { id: 111, transform: transformSf111, description: 'Resume pedidos da semana com faturamento liquido e semanas sexta-quinta recortadas ao mes.' },
  { id: 146, transform: transformSf146, description: 'Admin: lista compras semanais por vendedor usando semanas sexta-quinta recortadas ao mes.' },
];

async function updateTarget(target) {
  const response = await readServerFunctionMitra({ projectId, serverFunctionId: target.id });
  const current = response?.result || {};
  const code = String(current.code || '');
  if (!code) throw new Error(`SF ${target.id}: codigo atual vazio ou nao encontrado.`);

  const nextCode = target.transform(repairCorruptedDayOfMonth(code));
  assertOperationalWeek(nextCode, target.id);

  if (nextCode === code) {
    return { id: target.id, name: current.name, changed: false, backupId: null };
  }

  if (dryRun) {
    return { id: target.id, name: current.name, changed: true, backupId: null, dryRun: true };
  }

  const backupId = await createBackup({ ...current, code }, target.id);
  if (!backupId) throw new Error(`SF ${target.id}: backup nao retornou ID.`);

  await updateServerFunctionMitra({
    projectId,
    serverFunctionId: target.id,
    code: nextCode,
    description: target.description,
  });

  return { id: target.id, name: current.name, changed: true, backupId };
}

async function main() {
  if (!projectId) throw new Error('MITRA_PROJECT_ID nao configurado.');

  const results = [];
  for (const target of targets) {
    results.push(await updateTarget(target));
  }

  console.log(JSON.stringify({ dryRun, timestamp, results }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao atualizar semana operacional sexta-quinta:');
  console.error(error?.message || error);
  process.exit(1);
});
