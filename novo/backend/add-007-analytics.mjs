// Spec 007 — Analytics, comparativo e redistribuicao de metas.
//
// NAO EXECUTE ESTE ARQUIVO DA MAQUINA LOCAL: so no sandbox:
//   cd novo/backend && node add-007-analytics.mjs && node add-000-perfil-acesso.mjs
//
// Nenhuma tabela nem coluna nova. Blocos do Analytics em SF SQL sobre o mesmo
// fragmento `linhas` (lib/007-analytics.mjs); a aba Metas le por uma SF
// JAVASCRIPT (meta recebida em lib/007-regras.mjs) e grava por SF SQL com a
// guarda "nenhuma linha do lote e invalida" em todas as instrucoes (tudo ou nada).

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';
import { SEM_BLOQUEIO, temPapel, COORDENADOR_ATIVO } from './lib/guardas.mjs';
import { cod, dia, pagina, nomeCliente, nomeUsuario, ramoDe, carteiraVisivel, vendaDoVendedor, BLOQUEADOS, escopoAlvo } from './lib/002-carteira.mjs';
import { source, preludio } from './lib/006-semanal.mjs';
import { P, linhas, filtroCliente, filtroRamo, filtroMetaEscopo, vendedoresDoEscopo } from './lib/007-analytics.mjs';
import { REGRAS } from './lib/007-regras.mjs';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const RECORTE = 'Recorte: modo, coordenador, vendedor, filial, depto, secao, hoje; de, ate (AAAA-MM-DD); ramos (|A|B|), clientes (,1,2,), produtos (,1,2,).';
const META = `(SELECT COALESCE(SUM(M.META_VALOR), 0) FROM METAS_BU_VENDEDOR M WHERE ${filtroMetaEscopo('M')})`;
const MES_DE = (m) => `CASE WHEN ${m}.MES < 10 THEN CONCAT(${m}.ANO, '-0', ${m}.MES) ELSE CONCAT(${m}.ANO, '-', ${m}.MES) END`;
const nomeSecao = (l) => `COALESCE((SELECT S_N.NOME_SECAO FROM SECAO S_N WHERE S_N.ID = ${cod(`${l}.CODSEC`)}), ${l}.SECAO, 'Sem seção')`;
const nomeDepto = (l) => `COALESCE((SELECT B_N.NOME FROM BU B_N WHERE ${cod('B_N.CODIGO')} = ${cod(`${l}.CODEPTO`)}), ${l}.DEPARTAMENTO, 'Sem departamento')`;

/* ─────────────── carteira (RN-007) ─────────────── */

const CARTEIRA_CTES = `WITH CART AS (
    SELECT DISTINCT CV.ID_CLIENTE FROM (${carteiraVisivel(P)}) CV
    WHERE ${filtroCliente('CV.ID_CLIENTE')} AND ${filtroRamo('CV.ID_CLIENTE')}),
  LP AS (${linhas()}),
  LA AS (${linhas("'{{deAnt}}'", "'{{ateAnt}}'")}),
  ATV AS (SELECT DISTINCT LP.CODCLI FROM LP WHERE LP.TIPO = 'V'),
  ANT AS (SELECT DISTINCT LA.CODCLI FROM LA WHERE LA.TIPO = 'V')`;

/* ─────────────── metas (RN-010..019) ─────────────── */

const SQL_METAS = {
  acesso: `SELECT :VAR_USER AS EU,
    CASE WHEN ${temPapel('DIRETORIA', 'ADMIN')} THEN 1 ELSE 0 END AS DIRETORIA,
    CASE WHEN ${COORDENADOR_ATIVO} THEN 1 ELSE 0 END AS COORD,
    CASE WHEN ${SEM_BLOQUEIO} THEN 1 ELSE 0 END AS LIVRE`,

  // Universo do rateio: BUs de todos os coordenadores ativos (RN-010).
  coordenadores: `SELECT C.COD_SUPERVISOR, C.NOME, C.USER_ID, ${cod('CB.CODFILIAL')} AS CODFILIAL, ${cod('CB.CODEPTO')} AS CODEPTO,
    F.UF, F.NOME_FILIAL AS FILIAL, B.NOME AS DEPTO
  FROM COORDENADORES C
  JOIN COORDENADORES_BU CB ON CB.COD_SUPERVISOR = C.COD_SUPERVISOR
  LEFT JOIN FILIAL F ON ${cod('F.CODFILIAL')} = ${cod('CB.CODFILIAL')}
  LEFT JOIN BU B ON ${cod('B.CODIGO')} = ${cod('CB.CODEPTO')}
  WHERE C.ATIVO = 1`,

  planejamento: `SELECT BU.CODE AS UNIDADE, R.CODE AS UF, S.CODE AS RAMO, S.NAME AS RAMO_NOME, SUM(COALESCE(T.TARGET_VALUE, 0)) AS VALOR
  FROM INTG_MONTHLY_BILLING_TARGET T
  JOIN INTG_BUSINESS_UNIT BU ON BU.SOURCE_BUSINESS_UNIT_ID = T.SOURCE_BUSINESS_UNIT_ID
  JOIN INTG_REGION R ON R.SOURCE_REGION_ID = T.SOURCE_REGION_ID
  JOIN INTG_ACTIVITY_SEGMENT S ON S.SOURCE_ACTIVITY_SEGMENT_ID = T.SOURCE_ACTIVITY_SEGMENT_ID
  WHERE T.ACTIVE = 1 AND T.YEAR_REF = @@ano@@ AND T.MONTH_REF = @@mes@@
  GROUP BY BU.CODE, R.CODE, S.CODE, S.NAME`,

  // Peso: liquido da filial x departamento nos 12 meses anteriores (RNT-008).
  pesos: `SELECT ${cod('X.CODFILIAL')} AS CODFILIAL, ${cod('X.CODEPTO')} AS CODEPTO, SUM(X.V) AS LIQUIDO
  FROM (
    SELECT S.CODFILIAL, S.CODEPTO, COALESCE(S.TOTAL, 0) AS V FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA S
    WHERE ${dia('S.DTSAIDA')} >= '@@pesoIni@@' AND ${dia('S.DTSAIDA')} <= '@@pesoFim@@'
    UNION ALL
    SELECT D.CODFILIAL, D.CODEPTO, -COALESCE(D.VALOR_DEVOLVIDO, 0) FROM IMP_DEVOLUCOES_TOTVS D
    WHERE ${dia('D.DATA_DEVOLUCAO')} >= '@@pesoIni@@' AND ${dia('D.DATA_DEVOLUCAO')} <= '@@pesoFim@@'
  ) X
  GROUP BY ${cod('X.CODFILIAL')}, ${cod('X.CODEPTO')}`,

  // Vendedor x BU com escopo ativo e RCA; COORDENADOR = e outro coordenador.
  vendedores: `SELECT DISTINCT BV.VENDEDOR_ID, ${nomeUsuario('U')} AS NOME, ${cod('BV.CODFILIAL')} AS CODFILIAL, ${cod('BV.BU_CODIGO')} AS CODEPTO,
    CASE WHEN EXISTS (SELECT 1 FROM COORDENADORES C2 WHERE C2.USER_ID = BV.VENDEDOR_ID AND C2.ATIVO = 1 AND C2.USER_ID <> :VAR_USER)
      THEN 1 ELSE 0 END AS COORDENADOR
  FROM BU_VENDEDOR BV
  JOIN INT_USER U ON U.ID = BV.VENDEDOR_ID
  WHERE BV.ATIVO = 1 AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) <> ''
    AND EXISTS (SELECT 1 FROM VENDEDOR_RCA VR WHERE VR.USER_ID = BV.VENDEDOR_ID)
    AND BV.VENDEDOR_ID NOT IN ${BLOQUEADOS}`,

  metas: 'SELECT M.VENDEDOR_ID, M.CODFILIAL, M.CODEPTO, M.META_VALOR FROM METAS_BU_VENDEDOR M WHERE M.ANO = @@ano@@ AND M.MES = @@mes@@',

  // Liquido do vendedor por BU e ramo no mes (RNT-007), para realizado e ramos.
  realizado: `SELECT BV.VENDEDOR_ID, ${cod('L.CODFILIAL')} AS CODFILIAL, ${cod('L.CODEPTO')} AS CODEPTO, L.RAMO, SUM(L.VALOR) AS LIQUIDO
  FROM (
    SELECT S.CODCLI, S.CODFILIAL, S.CODEPTO, S.CODSEC, ${dia('S.DTSAIDA')} AS DIA, COALESCE(S.TOTAL, 0) AS VALOR,
      COALESCE(NULLIF(TRIM(S.RAMO_CLIENTE), ''), ${ramoDe('S.CODCLI')}) AS RAMO
    FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA S
    WHERE ${dia('S.DTSAIDA')} >= '@@ini@@' AND ${dia('S.DTSAIDA')} <= '@@fim@@'
    UNION ALL
    SELECT D.CODCLI, D.CODFILIAL, D.CODEPTO, D.CODSEC, ${dia('D.DATA_DEVOLUCAO')}, -COALESCE(D.VALOR_DEVOLVIDO, 0),
      COALESCE(NULLIF(TRIM(D.RAMO_CLIENTE), ''), ${ramoDe('D.CODCLI')})
    FROM IMP_DEVOLUCOES_TOTVS D
    WHERE ${dia('D.DATA_DEVOLUCAO')} >= '@@ini@@' AND ${dia('D.DATA_DEVOLUCAO')} <= '@@fim@@'
  ) L
  JOIN (SELECT DISTINCT B0.VENDEDOR_ID, ${cod('B0.CODFILIAL')} AS F, ${cod('B0.BU_CODIGO')} AS D FROM BU_VENDEDOR B0 WHERE B0.ATIVO = 1) BV
    ON BV.F = ${cod('L.CODFILIAL')} AND BV.D = ${cod('L.CODEPTO')}
  WHERE ${vendaDoVendedor('L', 'BV.VENDEDOR_ID', 'L.DIA')}
  GROUP BY BV.VENDEDOR_ID, ${cod('L.CODFILIAL')}, ${cod('L.CODEPTO')}, L.RAMO`,

  personalizadas: `SELECT R.VENDEDOR_ID, R.CODEPTO, R.RAMO_CODE, R.RAMO_NOME, R.UF, R.META_VALOR
  FROM METAS_BU_VENDEDOR_RAMO_UF R WHERE R.ANO = @@ano@@ AND R.MES = @@mes@@`,
};

async function corpoMetas() {
  const e = event || {};
  const ano = Number(e.ano);
  const mes = Number(e.mes);
  if (!(ano >= 2000 && ano <= 2100) || !(mes >= 1 && mes <= 12)) return { ok: false, error: 'Mês inválido.' };
  const iso = (d) => d.toISOString().slice(0, 10);
  const v = {
    ano, mes, coordenador: digitos(e.coordenador),
    ini: iso(new Date(Date.UTC(ano, mes - 1, 1))), fim: iso(new Date(Date.UTC(ano, mes, 0))),
    pesoIni: iso(new Date(Date.UTC(ano, mes - 13, 1))), pesoFim: iso(new Date(Date.UTC(ano, mes - 1, 0))),
  };
  const vazio = { ok: true, leitura: true, diretoria: false, coordenadores: [], bus: [], vendedores: [], base: [], ufs: [], personalizadas: [], realizadoRamo: [] };
  const [acesso = {}] = await consultar(SQL.acesso);
  const diretoria = Number(acesso.DIRETORIA) === 1;
  if (!Number(acesso.LIVRE) || (!diretoria && Number(acesso.COORD) !== 1)) return vazio;

  const [coords, plano, pesos, vend, metas, real, pers] = await Promise.all(
    ['coordenadores', 'planejamento', 'pesos', 'vendedores', 'metas', 'realizado', 'personalizadas']
      .map((k) => consultar(preencher(SQL[k], v))),
  );
  const chave = (f, d) => `${Number(f)}|${Number(d)}`;
  const visiveis = coords.filter((c) => (diretoria ? !v.coordenador || String(c.COD_SUPERVISOR) === v.coordenador : Number(c.USER_ID) === Number(acesso.EU)));
  const minhas = new Set(visiveis.map((c) => chave(c.CODFILIAL, c.CODEPTO)));
  const info = new Map(coords.map((c) => [chave(c.CODFILIAL, c.CODEPTO), c]));

  const planoUf = new Map();
  for (const p of plano) {
    const k = `${p.UNIDADE}|${p.UF}`;
    planoUf.set(k, { UNIDADE: p.UNIDADE, UF: p.UF, VALOR: (planoUf.get(k)?.VALOR || 0) + Number(p.VALOR || 0) });
  }
  const universo = [...info.values()].map((c) => ({ CODFILIAL: Number(c.CODFILIAL), CODEPTO: Number(c.CODEPTO), UF: c.UF }));
  const bus = metaRecebida({ planejamento: [...planoUf.values()], filiais: universo, pesos })
    .filter((b) => minhas.has(chave(b.CODFILIAL, b.CODEPTO)))
    .map((b) => {
      const c = info.get(chave(b.CODFILIAL, b.CODEPTO));
      return { ...b, FILIAL: c.FILIAL, DEPTO: c.DEPTO || `Departamento ${b.CODEPTO}` };
    })
    .sort((a, b) => a.CODFILIAL - b.CODFILIAL || a.CODEPTO - b.CODEPTO);

  const metaDe = new Map(metas.map((m) => [`${m.VENDEDOR_ID}|${chave(m.CODFILIAL, m.CODEPTO)}`, Number(m.META_VALOR) || 0]));
  const realDe = new Map();
  for (const r of real) {
    const k = `${r.VENDEDOR_ID}|${chave(r.CODFILIAL, r.CODEPTO)}`;
    realDe.set(k, (realDe.get(k) || 0) + Number(r.LIQUIDO || 0));
  }
  const vistos = new Set();
  const vendedores = vend
    .filter((x) => minhas.has(chave(x.CODFILIAL, x.CODEPTO)) && Number(x.COORDENADOR) !== 1)
    .filter((x) => { const k = `${x.VENDEDOR_ID}|${chave(x.CODFILIAL, x.CODEPTO)}`; if (vistos.has(k)) return false; vistos.add(k); return true; })
    .map((x) => {
      const k = `${x.VENDEDOR_ID}|${chave(x.CODFILIAL, x.CODEPTO)}`;
      return {
        VENDEDOR_ID: Number(x.VENDEDOR_ID), NOME: x.NOME, CODFILIAL: Number(x.CODFILIAL), CODEPTO: Number(x.CODEPTO),
        UF: info.get(chave(x.CODFILIAL, x.CODEPTO))?.UF ?? '',
        META: centavos(metaDe.get(k) || 0), REALIZADO: centavos(realDe.get(k) || 0),
      };
    })
    .sort((a, b) => String(a.NOME).localeCompare(String(b.NOME), 'pt-BR') || a.CODFILIAL - b.CODFILIAL);

  // Ramo/UF (RN-012): base do planejamento, UFs de cada vendedor, personalizadas e realizado.
  const ids = new Set(vendedores.map((x) => x.VENDEDOR_ID));
  const deptos = [...new Set(bus.map((b) => b.CODEPTO))];
  const base = plano.flatMap((p) => deptos.filter((d) => unidadeDoDepto(d) === p.UNIDADE)
    .map((d) => ({ CODEPTO: d, UF: p.UF, RAMO: p.RAMO, RAMO_NOME: p.RAMO_NOME, VALOR: Number(p.VALOR) || 0 })));
  const ufs = [...new Map(vendedores.map((x) => [`${x.VENDEDOR_ID}|${x.CODEPTO}|${x.UF}`, { VENDEDOR_ID: x.VENDEDOR_ID, CODEPTO: x.CODEPTO, UF: x.UF }])).values()];
  const ramoAgg = new Map();
  for (const r of real) {
    if (!ids.has(Number(r.VENDEDOR_ID)) || !minhas.has(chave(r.CODFILIAL, r.CODEPTO))) continue;
    const uf = info.get(chave(r.CODFILIAL, r.CODEPTO))?.UF ?? '';
    const ramo = ramoDoCliente(r.RAMO);
    const k = `${r.VENDEDOR_ID}|${Number(r.CODEPTO)}|${uf}|${ramo}`;
    const atual = ramoAgg.get(k) ?? { VENDEDOR_ID: Number(r.VENDEDOR_ID), CODEPTO: Number(r.CODEPTO), UF: uf, RAMO: ramo, RAMO_NOME: r.RAMO, LIQUIDO: 0 };
    atual.LIQUIDO = centavos(atual.LIQUIDO + Number(r.LIQUIDO || 0));
    ramoAgg.set(k, atual);
  }
  const personalizadas = pers.filter((p) => ids.has(Number(p.VENDEDOR_ID)) && deptos.includes(Number(p.CODEPTO)))
    .map((p) => ({ ...p, VENDEDOR_ID: Number(p.VENDEDOR_ID), CODEPTO: Number(p.CODEPTO), META_VALOR: Number(p.META_VALOR) || 0 }));
  const coordenadores = [...new Map(coords.map((c) => [String(c.COD_SUPERVISOR), { COD_SUPERVISOR: String(c.COD_SUPERVISOR), NOME: c.NOME }])).values()]
    .sort((a, b) => String(a.NOME).localeCompare(String(b.NOME), 'pt-BR'));

  return {
    ok: true, leitura: diretoria, diretoria, coordenadores: diretoria ? coordenadores : [],
    bus, vendedores, base, ufs, personalizadas, realizadoRamo: [...ramoAgg.values()],
  };
}

// Lote de gravacao (JSON da tela). Tipos simples: o simulador traduz para json_each.
const LOTE_METAS = `JSON_TABLE('{{metas}}', '$[*]' COLUMNS (
    VENDEDOR_ID INT PATH '$.vendedorId', CODFILIAL INT PATH '$.codFilial', CODEPTO INT PATH '$.codepto', VALOR DECIMAL(15,2) PATH '$.valor'))`;
const LOTE_RAMOS = `JSON_TABLE('{{ramosUf}}', '$[*]' COLUMNS (
    VENDEDOR_ID INT PATH '$.vendedorId', CODEPTO INT PATH '$.codepto', RAMO VARCHAR(120) PATH '$.ramo',
    RAMO_NOME VARCHAR(200) PATH '$.ramoNome', UF VARCHAR(30) PATH '$.uf', VALOR DECIMAL(15,2) PATH '$.valor',
    PERCENTUAL DECIMAL(10,4) PATH '$.percentual'))`;
const LOTE_LIMPAR = `JSON_TABLE('{{ramosLimpar}}', '$[*]' COLUMNS (VENDEDOR_ID INT PATH '$.vendedorId', CODEPTO INT PATH '$.codepto'))`;

// Quem grava coordena a BU (filial + departamento); sem filial = qualquer filial do departamento.
const coordena = (filial, depto) => `EXISTS (
      SELECT 1 FROM COORDENADORES C_W JOIN COORDENADORES_BU CB_W ON CB_W.COD_SUPERVISOR = C_W.COD_SUPERVISOR
      WHERE C_W.USER_ID = :VAR_USER AND C_W.ATIVO = 1
        AND ${filial ? `${cod('CB_W.CODFILIAL')} = ${filial}` : '1 = 1'} AND ${cod('CB_W.CODEPTO')} = ${depto})`;
// O vendedor tem escopo ativo na BU (e numa BU do coordenador, quando sem filial).
const temEscopo = (vendedor, filial, depto) => `EXISTS (
      SELECT 1 FROM BU_VENDEDOR BV_W
      WHERE BV_W.VENDEDOR_ID = ${vendedor} AND BV_W.ATIVO = 1 AND ${cod('BV_W.BU_CODIGO')} = ${depto}
        AND ${filial ? `${cod('BV_W.CODFILIAL')} = ${filial}` : `EXISTS (
          SELECT 1 FROM COORDENADORES C_X JOIN COORDENADORES_BU CB_X ON CB_X.COD_SUPERVISOR = C_X.COD_SUPERVISOR
          WHERE C_X.USER_ID = :VAR_USER AND C_X.ATIVO = 1
            AND ${cod('CB_X.CODFILIAL')} = ${cod('BV_W.CODFILIAL')} AND ${cod('CB_X.CODEPTO')} = ${depto})`})`;
const outroCoordenador = (vendedor) => `EXISTS (SELECT 1 FROM COORDENADORES C_O WHERE C_O.USER_ID = ${vendedor} AND C_O.ATIVO = 1 AND C_O.USER_ID <> :VAR_USER)`;

const MOTIVOS = `
  SELECT 'SOMENTE_LEITURA' AS MOTIVO, NULL AS CODFILIAL, NULL AS CODEPTO, NULL AS VENDEDOR_ID, 1 AS ORDEM FROM (SELECT 1 AS X) D1
  WHERE ${temPapel('DIRETORIA', 'ADMIN')} OR NOT ${COORDENADOR_ATIVO} OR NOT ${SEM_BLOQUEIO}
  UNION ALL SELECT 'MES_INVALIDO', NULL, NULL, NULL, 2 FROM (SELECT 1 AS X) D2
  WHERE NOT (${cod("'{{ano}}'")} BETWEEN 2000 AND 2100 AND ${cod("'{{mes}}'")} BETWEEN 1 AND 12)
  UNION ALL SELECT 'BU_NAO_COORDENADA', J.CODFILIAL, J.CODEPTO, J.VENDEDOR_ID, 3 FROM ${LOTE_METAS} J
  WHERE NOT ${coordena('J.CODFILIAL', 'J.CODEPTO')}
  UNION ALL SELECT 'BU_NAO_COORDENADA', NULL, J.CODEPTO, J.VENDEDOR_ID, 3 FROM ${LOTE_RAMOS} J WHERE NOT ${coordena('', 'J.CODEPTO')}
  UNION ALL SELECT 'BU_NAO_COORDENADA', NULL, J.CODEPTO, J.VENDEDOR_ID, 3 FROM ${LOTE_LIMPAR} J WHERE NOT ${coordena('', 'J.CODEPTO')}
  UNION ALL SELECT 'SEM_ESCOPO', J.CODFILIAL, J.CODEPTO, J.VENDEDOR_ID, 4 FROM ${LOTE_METAS} J
  WHERE NOT ${temEscopo('J.VENDEDOR_ID', 'J.CODFILIAL', 'J.CODEPTO')}
  UNION ALL SELECT 'SEM_ESCOPO', NULL, J.CODEPTO, J.VENDEDOR_ID, 4 FROM ${LOTE_RAMOS} J WHERE NOT ${temEscopo('J.VENDEDOR_ID', '', 'J.CODEPTO')}
  UNION ALL SELECT 'VENDEDOR_COORDENADOR', J.CODFILIAL, J.CODEPTO, J.VENDEDOR_ID, 5 FROM ${LOTE_METAS} J WHERE ${outroCoordenador('J.VENDEDOR_ID')}
  UNION ALL SELECT 'VENDEDOR_COORDENADOR', NULL, J.CODEPTO, J.VENDEDOR_ID, 5 FROM ${LOTE_RAMOS} J WHERE ${outroCoordenador('J.VENDEDOR_ID')}
  UNION ALL SELECT 'VALOR_INVALIDO', J.CODFILIAL, J.CODEPTO, J.VENDEDOR_ID, 6 FROM ${LOTE_METAS} J WHERE J.VALOR IS NULL OR J.VALOR < 0
  UNION ALL SELECT 'VALOR_INVALIDO', NULL, J.CODEPTO, J.VENDEDOR_ID, 6 FROM ${LOTE_RAMOS} J WHERE J.VALOR IS NULL OR J.VALOR < 0 OR J.RAMO IS NULL OR J.UF IS NULL`;

// Guarda de TODAS as instrucoes de escrita: nenhum motivo de recusa.
const LOTE_OK = `NOT EXISTS (SELECT 1 FROM (${MOTIVOS}) MV)`;
const AGORA = `DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 HOUR), '%Y-%m-%d %H:%i:%s')`;

/* ─────────────── definicoes ─────────────── */

export const definitions = [
  {
    name: 's360AnalyticsResumo',
    type: 'SQL',
    description: `Overview: meta do periodo, bruto, devolvido e liquido (RF-003, RN-003/004). ${RECORTE}`,
    code: `SELECT ${META} AS META,
  COALESCE(SUM(L.BRUTO), 0) AS BRUTO, COALESCE(SUM(L.DEVOLVIDO), 0) AS DEVOLVIDO, COALESCE(SUM(L.LIQUIDO), 0) AS LIQUIDO
FROM (${linhas()}) L`,
  },
  {
    name: 's360AnalyticsEvolucao',
    type: 'SQL',
    description: `Evolucao: liquido por dia (porDia = 1) ou mes (TIPO L) e meta por mes (TIPO M) (RF-004, RN-006). ${RECORTE}`,
    code: `SELECT 'L' AS TIPO, CASE WHEN '{{porDia}}' = '1' THEN L.DIA ELSE SUBSTRING(L.DIA, 1, 7) END AS CHAVE, SUM(L.LIQUIDO) AS VALOR
FROM (${linhas()}) L
GROUP BY CASE WHEN '{{porDia}}' = '1' THEN L.DIA ELSE SUBSTRING(L.DIA, 1, 7) END
UNION ALL
SELECT 'M', ${MES_DE('M')}, SUM(M.META_VALOR)
FROM METAS_BU_VENDEDOR M
WHERE ${filtroMetaEscopo('M')}
GROUP BY M.ANO, M.MES`,
  },
  {
    name: 's360AnalyticsProdutos',
    type: 'SQL',
    description: `Rankings de produto, fornecedor, ramo, segmento, departamento e secao, sempre liquido (RF-005/010, RN-008). ${RECORTE}`,
    code: `WITH LP AS (${linhas()}),
PR AS (
  SELECT LP.CODPROD, MAX(LP.PRODUTO) AS NOME, SUM(LP.LIQUIDO) AS VALOR, SUM(LP.QT) AS QT,
    SUM(LP.BRUTO) AS BRUTO, SUM(LP.DEVOLVIDO) AS DEVOLVIDO, MAX(LP.CODFORNEC) AS CODFORNEC
  FROM LP GROUP BY LP.CODPROD),
RP AS (SELECT LP.RAMO, LP.CODPROD, MAX(LP.PRODUTO) AS NOME, SUM(LP.LIQUIDO) AS VALOR, SUM(LP.QT) AS QT FROM LP GROUP BY LP.RAMO, LP.CODPROD)
SELECT G.GRUPO, G.CHAVE, G.NOME, G.RAMO, G.VALOR, G.QT, G.BRUTO, G.DEVOLVIDO, G.POS FROM (
  SELECT 'VALOR' AS GRUPO, CAST(PR.CODPROD AS CHAR) AS CHAVE, PR.NOME, NULL AS RAMO, PR.VALOR, PR.QT, PR.BRUTO, PR.DEVOLVIDO,
    ROW_NUMBER() OVER (ORDER BY PR.VALOR DESC, PR.CODPROD) AS POS FROM PR
  UNION ALL
  SELECT 'QTD', CAST(PR.CODPROD AS CHAR), PR.NOME, NULL, PR.VALOR, PR.QT, PR.BRUTO, PR.DEVOLVIDO,
    ROW_NUMBER() OVER (ORDER BY PR.QT DESC, PR.CODPROD) FROM PR
  UNION ALL
  SELECT 'DEVOLUCAO', CAST(PR.CODPROD AS CHAR), PR.NOME, NULL, PR.DEVOLVIDO, PR.QT, PR.BRUTO, PR.DEVOLVIDO,
    ROW_NUMBER() OVER (ORDER BY PR.DEVOLVIDO DESC, PR.CODPROD) FROM PR WHERE PR.DEVOLVIDO > 0
  UNION ALL
  SELECT 'FORNECEDOR', CAST(PR.CODFORNEC AS CHAR),
    COALESCE(MAX(F.FORNECEDOR), CASE WHEN PR.CODFORNEC IS NULL THEN 'Sem fornecedor' ELSE CONCAT('Fornecedor ', PR.CODFORNEC) END),
    NULL, SUM(PR.VALOR), SUM(PR.QT), SUM(PR.BRUTO), SUM(PR.DEVOLVIDO),
    ROW_NUMBER() OVER (ORDER BY SUM(PR.VALOR) DESC, PR.CODFORNEC)
  FROM PR LEFT JOIN IMP_FORNECEDORES_TOTVS F ON F.CODFORNEC = PR.CODFORNEC GROUP BY PR.CODFORNEC
  UNION ALL
  SELECT 'RAMO', LP.RAMO, LP.RAMO, LP.RAMO, SUM(LP.LIQUIDO), SUM(LP.QT), SUM(LP.BRUTO), SUM(LP.DEVOLVIDO),
    ROW_NUMBER() OVER (ORDER BY SUM(LP.LIQUIDO) DESC, LP.RAMO) FROM LP GROUP BY LP.RAMO
  UNION ALL
  SELECT 'SEGMENTO', COALESCE(NULLIF(TRIM(C.SEGMENTO), ''), 'Sem segmento'), COALESCE(NULLIF(TRIM(C.SEGMENTO), ''), 'Sem segmento'), NULL,
    SUM(LP.LIQUIDO), SUM(LP.QT), SUM(LP.BRUTO), SUM(LP.DEVOLVIDO),
    ROW_NUMBER() OVER (ORDER BY SUM(LP.LIQUIDO) DESC) FROM LP LEFT JOIN CLIENTES C ON C.ID = LP.CODCLI
  GROUP BY COALESCE(NULLIF(TRIM(C.SEGMENTO), ''), 'Sem segmento')
  UNION ALL
  SELECT 'RAMO_TOP3', CAST(RP.CODPROD AS CHAR), RP.NOME, RP.RAMO, RP.VALOR, RP.QT, NULL, NULL,
    ROW_NUMBER() OVER (PARTITION BY RP.RAMO ORDER BY RP.VALOR DESC, RP.CODPROD) FROM RP
  UNION ALL
  SELECT 'DEPTO', CAST(${cod('LP.CODEPTO')} AS CHAR), MAX(${nomeDepto('LP')}), NULL, SUM(LP.LIQUIDO), SUM(LP.QT), SUM(LP.BRUTO), SUM(LP.DEVOLVIDO),
    ROW_NUMBER() OVER (ORDER BY SUM(LP.LIQUIDO) DESC) FROM LP GROUP BY ${cod('LP.CODEPTO')}
  UNION ALL
  SELECT 'SECAO', CAST(${cod('LP.CODSEC')} AS CHAR), MAX(${nomeSecao('LP')}), NULL, SUM(LP.LIQUIDO), SUM(LP.QT), SUM(LP.BRUTO), SUM(LP.DEVOLVIDO),
    ROW_NUMBER() OVER (ORDER BY SUM(LP.LIQUIDO) DESC) FROM LP GROUP BY ${cod('LP.CODSEC')}
) G
WHERE (G.GRUPO IN ('VALOR', 'QTD') AND G.POS <= 10) OR (G.GRUPO = 'DEVOLUCAO' AND G.POS <= 50)
  OR (G.GRUPO IN ('DEPTO', 'SECAO') AND G.POS <= 20) OR (G.GRUPO = 'RAMO_TOP3' AND G.POS <= 3)
  OR G.GRUPO IN ('FORNECEDOR', 'RAMO', 'SEGMENTO')
ORDER BY G.GRUPO, G.RAMO, G.POS`,
  },
  {
    name: 's360AnalyticsClientes',
    type: 'SQL',
    description: `Top 10 clientes por liquido, com o liquido do recorte inteiro (RF-009, RN-008). ${RECORTE}`,
    code: `SELECT T.* FROM (
  SELECT L.CODCLI, MAX(${nomeCliente('C')}) AS CLIENTE, SUM(L.BRUTO) AS BRUTO, SUM(L.DEVOLVIDO) AS DEVOLVIDO, SUM(L.LIQUIDO) AS LIQUIDO,
    COUNT(DISTINCT CASE WHEN L.TIPO = 'V' THEN L.NUMPED END) AS PEDIDOS,
    SUM(SUM(L.LIQUIDO)) OVER () AS TOTAL_LIQUIDO,
    ROW_NUMBER() OVER (ORDER BY SUM(L.LIQUIDO) DESC, L.CODCLI) AS POS
  FROM (${linhas()}) L
  LEFT JOIN CLIENTES C ON C.ID = L.CODCLI
  GROUP BY L.CODCLI
) T
WHERE T.POS <= 10
ORDER BY T.POS`,
  },
  {
    name: 's360AnalyticsEvolucaoCliente',
    type: 'SQL',
    description: `Liquido por mes dos clientes marcados no filtro (RF-009). ${RECORTE}`,
    code: `SELECT L.CODCLI, MAX(${nomeCliente('C')}) AS CLIENTE, SUBSTRING(L.DIA, 1, 7) AS MES, SUM(L.LIQUIDO) AS LIQUIDO
FROM (${linhas()}) L
LEFT JOIN CLIENTES C ON C.ID = L.CODCLI
WHERE '{{clientes}}' <> ''
GROUP BY L.CODCLI, SUBSTRING(L.DIA, 1, 7)
ORDER BY L.CODCLI, MES`,
  },
  {
    name: 's360AnalyticsCarteira',
    type: 'SQL',
    description: `Analise de carteira: carteira, ativos, inativos, em risco, novos e liquido (RF-007, RN-007). ${RECORTE} deAnt, ateAnt.`,
    code: `${CARTEIRA_CTES},
  PRIM AS (
    SELECT S.CODCLI, MIN(${dia('S.DTSAIDA')}) AS PRIMEIRA FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA S
    WHERE S.CODCLI IN (SELECT CART.ID_CLIENTE FROM CART) GROUP BY S.CODCLI)
SELECT
  (SELECT COUNT(*) FROM CART) AS CARTEIRA,
  (SELECT COUNT(*) FROM CART WHERE CART.ID_CLIENTE IN (SELECT ATV.CODCLI FROM ATV)) AS ATIVOS,
  (SELECT COUNT(*) FROM CART WHERE CART.ID_CLIENTE NOT IN (SELECT ATV.CODCLI FROM ATV)) AS INATIVOS,
  (SELECT COUNT(*) FROM CART WHERE CART.ID_CLIENTE NOT IN (SELECT ATV.CODCLI FROM ATV) AND CART.ID_CLIENTE IN (SELECT ANT.CODCLI FROM ANT)) AS EM_RISCO,
  (SELECT COUNT(*) FROM CART JOIN PRIM ON PRIM.CODCLI = CART.ID_CLIENTE
    WHERE CART.ID_CLIENTE IN (SELECT ATV.CODCLI FROM ATV) AND PRIM.PRIMEIRA >= '{{de}}' AND PRIM.PRIMEIRA <= '{{ate}}') AS NOVOS,
  (SELECT COALESCE(SUM(LP.LIQUIDO), 0) FROM LP) AS LIQUIDO`,
  },
  {
    name: 's360AnalyticsCarteiraLista',
    type: 'SQL',
    description: `Lista paginada (20) de Inativos ou Em risco com dias sem compra (RF-007, RNFT-001). ${RECORTE} deAnt, ateAnt, situacao, pagina.`,
    code: `${CARTEIRA_CTES},
  ULT AS (
    SELECT S.CODCLI, MAX(${dia('S.DTSAIDA')}) AS ULTIMO FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA S
    WHERE S.CODCLI IN (SELECT CART.ID_CLIENTE FROM CART) AND ${dia('S.DTSAIDA')} <= '{{ate}}'
      AND EXISTS (SELECT 1 FROM (${escopoAlvo(P)}) A_U
        WHERE ${cod('A_U.CODFILIAL')} = ${cod('S.CODFILIAL')} AND ${cod('A_U.CODEPTO')} = ${cod('S.CODEPTO')})
    GROUP BY S.CODCLI)
SELECT N.* FROM (
  SELECT C.ID AS CODCLI, ${nomeCliente('C')} AS CLIENTE, ${ramoDe('C.ID')} AS RAMO, ULT.ULTIMO,
    CASE WHEN ULT.ULTIMO IS NULL THEN NULL
      ELSE DATEDIFF(CASE WHEN '{{hoje}}' < '{{ate}}' THEN '{{hoje}}' ELSE '{{ate}}' END, ULT.ULTIMO) END AS DIAS_SEM_COMPRA,
    COUNT(*) OVER () AS TOTAL,
    ROW_NUMBER() OVER (ORDER BY CASE WHEN ULT.ULTIMO IS NULL THEN 0 ELSE 1 END, ULT.ULTIMO, ${nomeCliente('C')}) AS RN
  FROM CART
  JOIN CLIENTES C ON C.ID = CART.ID_CLIENTE
  LEFT JOIN ULT ON ULT.CODCLI = C.ID
  WHERE CART.ID_CLIENTE NOT IN (SELECT ATV.CODCLI FROM ATV)
    AND ('{{situacao}}' <> 'EM_RISCO' OR CART.ID_CLIENTE IN (SELECT ANT.CODCLI FROM ANT))
) N
WHERE N.RN > (${pagina()} - 1) * 20 AND N.RN <= ${pagina()} * 20
ORDER BY N.RN`,
  },
  {
    name: 's360AnalyticsVisitas',
    type: 'SQL',
    description: 'Visitas concluidas (cliente e prospeccao) dos vendedores do escopo, por tipo (RF-008, RN-009). Escopo + de, ate.',
    code: `SELECT 'CLIENTE' AS ORIGEM, COALESCE(V.TIPO, '') AS TIPO, COUNT(*) AS N
FROM VISITAS V
WHERE V.STATUS = 'CONCLUIDA' AND V.DATA_AGENDADA >= '{{de}}' AND V.DATA_AGENDADA <= '{{ate}}'
  AND V.VENDEDOR_ID IN (${vendedoresDoEscopo})
GROUP BY COALESCE(V.TIPO, '')
UNION ALL
SELECT 'PROSPECCAO', COALESCE(PV.OBJETIVO, ''), COUNT(*)
FROM PROSPECT_VISITAS PV
WHERE PV.STATUS = 'CONCLUIDA' AND PV.DATA_VISITA >= '{{de}}' AND PV.DATA_VISITA <= '{{ate}}'
  AND PV.EXECUTIVO_ID IN (${vendedoresDoEscopo})
GROUP BY COALESCE(PV.OBJETIVO, '')`,
  },
  {
    name: 's360AnalyticsDevolucoes',
    type: 'SQL',
    description: `Devolucoes do periodo: totais, 4 maiores (TOP) e pagina de 50 (LINHA) (RF-006). ${RECORTE} pagina.`,
    code: `WITH DV AS (
  SELECT L.CODCLI, ${nomeCliente('C')} AS CLIENTE, L.CODPROD, L.PRODUTO, L.NUMPED, L.DIA, L.DATA_VENDA, L.DEVOLVIDO, -L.QT AS QT,
    CASE WHEN COALESCE(L.DATA_VENDA, '') = '' THEN NULL ELSE DATEDIFF(L.DIA, L.DATA_VENDA) END AS DIAS
  FROM (${linhas()}) L
  LEFT JOIN CLIENTES C ON C.ID = L.CODCLI
  WHERE L.TIPO = 'D'),
TT AS (SELECT COUNT(*) AS REGISTROS, COALESCE(SUM(DV.DEVOLVIDO), 0) AS VALOR_TOTAL,
  COALESCE(SUM(CASE WHEN DV.DIAS > 30 THEN 1 ELSE 0 END), 0) AS ACIMA_30 FROM DV),
NN AS (SELECT DV.*, ROW_NUMBER() OVER (ORDER BY DV.DIA DESC, DV.NUMPED, DV.CODPROD) AS RN,
  ROW_NUMBER() OVER (ORDER BY DV.DEVOLVIDO DESC, DV.DIA DESC, DV.CODPROD) AS RV FROM DV)
SELECT 'TOTAL' AS PARTE, NULL AS CODCLI, NULL AS CLIENTE, NULL AS CODPROD, NULL AS PRODUTO, NULL AS NUMPED, NULL AS DIA,
  NULL AS DATA_VENDA, NULL AS DIAS, NULL AS VALOR, NULL AS QT, 0 AS ORDEM, TT.REGISTROS, TT.VALOR_TOTAL, TT.ACIMA_30 FROM TT
UNION ALL
SELECT 'TOP', NN.CODCLI, NN.CLIENTE, NN.CODPROD, NN.PRODUTO, NN.NUMPED, NN.DIA, NN.DATA_VENDA, NN.DIAS, NN.DEVOLVIDO, NN.QT, NN.RV,
  TT.REGISTROS, TT.VALOR_TOTAL, TT.ACIMA_30 FROM NN JOIN TT ON 1 = 1 WHERE NN.RV <= 4
UNION ALL
SELECT 'LINHA', NN.CODCLI, NN.CLIENTE, NN.CODPROD, NN.PRODUTO, NN.NUMPED, NN.DIA, NN.DATA_VENDA, NN.DIAS, NN.DEVOLVIDO, NN.QT, NN.RN,
  TT.REGISTROS, TT.VALOR_TOTAL, TT.ACIMA_30 FROM NN JOIN TT ON 1 = 1
WHERE NN.RN > (${pagina()} - 1) * 50 AND NN.RN <= ${pagina()} * 50
ORDER BY PARTE, ORDEM`,
  },
  {
    name: 's360AnalyticsComparativo',
    type: 'SQL',
    description: `Comparativo modular: todos os itens da categoria (CLIENTE, RAMO, SECAO, PRODUTO, DEPTO) com a metrica (FATURAMENTO, PEDIDOS em Cliente/Ramo, QUANTIDADE em Produto) (RF-011, RN-016). ${RECORTE} categoria, metrica.`,
    code: `SELECT G.CHAVE, MAX(G.NOME) AS NOME,
  CASE WHEN '{{metrica}}' = 'PEDIDOS' AND '{{categoria}}' IN ('CLIENTE', 'RAMO')
    THEN COUNT(DISTINCT CASE WHEN G.TIPO = 'V' THEN G.NUMPED END)
    WHEN '{{metrica}}' = 'QUANTIDADE' AND '{{categoria}}' = 'PRODUTO' THEN SUM(G.QT)
    ELSE SUM(G.LIQUIDO) END AS VALOR
FROM (
  SELECT L.TIPO, L.NUMPED, L.QT, L.LIQUIDO,
    CASE '{{categoria}}' WHEN 'CLIENTE' THEN CAST(L.CODCLI AS CHAR) WHEN 'RAMO' THEN L.RAMO
      WHEN 'SECAO' THEN CAST(${cod('L.CODSEC')} AS CHAR) WHEN 'PRODUTO' THEN CAST(L.CODPROD AS CHAR)
      ELSE CAST(${cod('L.CODEPTO')} AS CHAR) END AS CHAVE,
    CASE '{{categoria}}' WHEN 'CLIENTE' THEN ${nomeCliente('C')} WHEN 'RAMO' THEN L.RAMO
      WHEN 'SECAO' THEN ${nomeSecao('L')} WHEN 'PRODUTO' THEN L.PRODUTO
      ELSE ${nomeDepto('L')} END AS NOME
  FROM (${linhas()}) L
  LEFT JOIN CLIENTES C ON C.ID = L.CODCLI
) G
GROUP BY G.CHAVE
ORDER BY VALOR DESC, G.CHAVE`,
  },
  {
    name: 's360MetasCarregar',
    type: 'JAVASCRIPT',
    description: 'Aba Metas: meta recebida por Filial/BU, vendedores x BU, base e personalizacoes por ramo/UF (RF-013..017, RN-010..014). Params: ano, mes, coordenador (diretoria; vazio = todos).',
    code: [source(preludio), `const SQL = ${JSON.stringify(SQL_METAS)};`, REGRAS.map(String).join('\n\n'), source(corpoMetas)].join('\n\n'),
  },
  {
    name: 's360MetasSalvar',
    type: 'SQL',
    description: 'Grava metas do vendedor x BU e ramos/UF personalizados, tudo ou nada (RF-017/018/020, RN-012/019). Params: ano, mes, metas [{vendedorId, codFilial, codepto, valor}], ramosUf [{vendedorId, codepto, ramo, ramoNome, uf, valor, percentual}], ramosLimpar [{vendedorId, codepto}]. Devolve affectedRows; 0 = recusado (ver s360MetasMotivo).',
    code: `UPDATE METAS_BU_VENDEDOR
SET META_VALOR = (SELECT J.VALOR FROM ${LOTE_METAS} J
    WHERE J.VENDEDOR_ID = METAS_BU_VENDEDOR.VENDEDOR_ID AND J.CODFILIAL = METAS_BU_VENDEDOR.CODFILIAL AND J.CODEPTO = METAS_BU_VENDEDOR.CODEPTO),
  CRIADO_POR = CAST(:VAR_USER AS CHAR), UPDATED_AT = ${AGORA}
WHERE METAS_BU_VENDEDOR.ANO = ${cod("'{{ano}}'")} AND METAS_BU_VENDEDOR.MES = ${cod("'{{mes}}'")}
  AND EXISTS (SELECT 1 FROM ${LOTE_METAS} J
    WHERE J.VENDEDOR_ID = METAS_BU_VENDEDOR.VENDEDOR_ID AND J.CODFILIAL = METAS_BU_VENDEDOR.CODFILIAL AND J.CODEPTO = METAS_BU_VENDEDOR.CODEPTO)
  AND ${LOTE_OK};
INSERT INTO METAS_BU_VENDEDOR (CODFILIAL, CODEPTO, VENDEDOR_ID, MES, ANO, META_VALOR, CRIADO_POR, CREATED_AT, UPDATED_AT)
SELECT J.CODFILIAL, J.CODEPTO, J.VENDEDOR_ID, ${cod("'{{mes}}'")}, ${cod("'{{ano}}'")}, J.VALOR, CAST(:VAR_USER AS CHAR), ${AGORA}, ${AGORA}
FROM ${LOTE_METAS} J
WHERE NOT EXISTS (SELECT 1 FROM METAS_BU_VENDEDOR M2
    WHERE M2.VENDEDOR_ID = J.VENDEDOR_ID AND M2.CODFILIAL = J.CODFILIAL AND M2.CODEPTO = J.CODEPTO
      AND M2.ANO = ${cod("'{{ano}}'")} AND M2.MES = ${cod("'{{mes}}'")})
  AND ${LOTE_OK};
DELETE FROM METAS_BU_VENDEDOR_RAMO_UF
WHERE METAS_BU_VENDEDOR_RAMO_UF.ANO = ${cod("'{{ano}}'")} AND METAS_BU_VENDEDOR_RAMO_UF.MES = ${cod("'{{mes}}'")}
  AND EXISTS (SELECT 1 FROM ${LOTE_LIMPAR} J
    WHERE J.VENDEDOR_ID = METAS_BU_VENDEDOR_RAMO_UF.VENDEDOR_ID AND J.CODEPTO = METAS_BU_VENDEDOR_RAMO_UF.CODEPTO)
  AND ${LOTE_OK};
INSERT INTO METAS_BU_VENDEDOR_RAMO_UF (CODFILIAL, CODEPTO, VENDEDOR_ID, MES, ANO, RAMO_CODE, RAMO_NOME, UF, PERCENTUAL_META, META_VALOR, CRIADO_POR, CREATED_AT, UPDATED_AT)
SELECT 0, J.CODEPTO, J.VENDEDOR_ID, ${cod("'{{mes}}'")}, ${cod("'{{ano}}'")}, J.RAMO, J.RAMO_NOME, J.UF, COALESCE(J.PERCENTUAL, 0), J.VALOR,
  CAST(:VAR_USER AS CHAR), ${AGORA}, ${AGORA}
FROM ${LOTE_RAMOS} J
WHERE ${LOTE_OK}`,
  },
  {
    name: 's360MetasMotivo',
    type: 'SQL',
    description: 'Primeiro motivo de recusa do lote de s360MetasSalvar (mesmos params): SOMENTE_LEITURA, MES_INVALIDO, BU_NAO_COORDENADA, SEM_ESCOPO, VENDEDOR_COORDENADOR, VALOR_INVALIDO; com o nome da filial, do departamento e do vendedor.',
    code: `SELECT MV.MOTIVO, MV.CODFILIAL, MV.CODEPTO, MV.VENDEDOR_ID,
  (SELECT B.NOME FROM BU B WHERE ${cod('B.CODIGO')} = MV.CODEPTO) AS DEPTO,
  (SELECT ${nomeUsuario('U')} FROM INT_USER U WHERE U.ID = MV.VENDEDOR_ID) AS VENDEDOR
FROM (${MOTIVOS}) MV
ORDER BY MV.ORDEM
LIMIT 1`,
  },
];

/* ─────────────── publicacao ─────────────── */

function isEntrypoint() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

function functionId(item) {
  return item?.id ?? item?.serverFunctionId ?? item?.result?.serverFunctionId ?? item?.result?.id;
}

async function upsert() {
  const lista = await listServerFunctionsMitra({ projectId });
  const porNome = new Map((lista?.result ?? []).map((fn) => [fn.name, fn]));
  for (const definition of definitions) {
    const existente = porNome.get(definition.name);
    if (existente) {
      const id = functionId(existente);
      await updateServerFunctionMitra({ projectId, serverFunctionId: id, code: definition.code, description: definition.description });
      console.log(`  atualizada  ${definition.name} (${id})`);
      continue;
    }
    const criada = await createServerFunctionMitra({
      projectId, name: definition.name, type: definition.type, code: definition.code, description: definition.description,
    });
    console.log(`  criada      ${definition.name} (${functionId(criada)})`);
  }
}

if (isEntrypoint()) {
  if (!projectId) throw new Error('MITRA_PROJECT_ID ausente no .env');
  console.log(`Publicando ${definitions.length} server functions (spec 007)...`);
  await upsert();
  console.log('\nPronto. Agora: node add-000-perfil-acesso.mjs && npm run sync:function-map');
}
