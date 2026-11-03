// Spec 002 — carteira de clientes, disponiveis, historico, titulares.
//
// NAO EXECUTE ESTE ARQUIVO DA MAQUINA LOCAL: o mitra-sdk nao gera migration;
// rodar daqui aplica em producao sem historia. So no sandbox:
//   cd novo/backend && node add-002-carteira.mjs && node add-000-perfil-acesso.mjs
//
// Nenhuma tabela nem coluna nova: so SFs `s360*` (upsert por nome). As duas
// SFs JAVASCRIPT leem por runQueryMitra e calculam com lib/002-regras.mjs; toda
// escrita e SF SQL (usuario business nao usa runDml).
//
// `definitions` e exportado para o simulador executar o mesmo codigo publicado.
// Nomes aqui sao o contrato com novo/frontend/src/lib/server-functions.ts.

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';
import { SEM_BLOQUEIO, temPapel, COORDENADOR_ATIVO } from './lib/guardas.mjs';
import {
  cod, num, pagina, dia, nomeUsuario, nomeCliente, semAcento, ramoDe, naoPessoaFisica,
  DEPTOS_POR_SECAO, BLOQUEADOS, titularesCobertos, ESCOPO_SQL, ESCOPO_MARCADO,
  carteiraVisivel, vendaConta, ehCandidato, candidatos, responsavelNoEscopo, podeGerir,
} from './lib/002-carteira.mjs';
import { REGRAS } from './lib/002-regras.mjs';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const POR_SECAO = DEPTOS_POR_SECAO.join(', ');
const TIPOS_RELATO = `'Ligação', 'WhatsApp', 'E-mail', 'Reunião on-line', 'Outro'`;

/* ─────────────── SF JAVASCRIPT: preludio comum ─────────────── */

export function source(fn) {
  const texto = fn.toString();
  return texto.slice(texto.indexOf('{') + 1, texto.lastIndexOf('}')).trim();
}

// Funcoes do preludio publicado (sem import: viram texto no corpo da SF).
export function preludio() {
  const { runQueryMitra } = require('mitra-sdk');
  const projectId = Number(process.env.MITRA_PROJECT_ID || event.projectId);
  // runQueryMitra nao liga {{param}}: o valor vai escapado no texto.
  const esc = (v) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\\/g, '\\\\').replace(/'/g, "''");
  const digitos = (v) => String(v ?? '').replace(/\D/g, '').slice(0, 12);
  const preencher = (sql, valores) => sql.replace(/@@(\w+)@@/g, (_, k) => esc(valores[k]));
  function linhasDe(resposta) {
    let saida = resposta?.result ?? resposta;
    if (typeof saida === 'string') { try { saida = JSON.parse(saida); } catch { return []; } }
    if (saida?.output) saida = saida.output;
    return saida?.rows ?? saida?.result?.rows ?? saida?.result ?? [];
  }
  async function consultar(sql) {
    return linhasDe(await runQueryMitra({ projectId, sql }));
  }
}

const corpoJs = (sql, corpo) => [
  source(preludio),
  `const SQL = ${JSON.stringify(sql)};`,
  REGRAS.map(String).join('\n\n'),
  source(corpo),
].join('\n\n');

/* ─────────────── s360CarteiraCarregar ─────────────── */

const CART = carteiraVisivel(ESCOPO_MARCADO);

export const SQL_CARTEIRA = {
  clientes: `SELECT C.ID, C.WINTHOR_CODCLI, C.RAZAO_SOCIAL, C.NOME_FANTASIA, ${nomeCliente('C')} AS NOME,
    C.CNPJ, C.CIDADE, C.UF, C.SEGMENTO, C.STATUS,
    ${ramoDe('C.ID')} AS RAMO,
    MAX(CV.CURVA) AS CURVA_MANUAL,
    MIN(CV.COBERTURA) AS COBERTURA,
    CASE WHEN EXISTS (SELECT 1 FROM EQUIPE_CLIENTE EC_P WHERE EC_P.ID_CLIENTE = C.ID AND EC_P.ID_VENDEDOR = :VAR_USER) THEN 1 ELSE 0 END AS PODE_REMOVER,
    CASE WHEN EXISTS (SELECT 1 FROM ALERTAS_INTELIGENTES AL WHERE AL.ID_CLIENTE = C.ID AND AL.ID_VENDEDOR = :VAR_USER AND AL.LIDO = 0) THEN 1 ELSE 0 END AS ALERTA
  FROM (${CART}) CV
  JOIN CLIENTES C ON C.ID = CV.ID_CLIENTE
  GROUP BY C.ID, C.WINTHOR_CODCLI, C.RAZAO_SOCIAL, C.NOME_FANTASIA, C.CNPJ, C.CIDADE, C.UF, C.SEGMENTO, C.STATUS`,

  // Liquido = vendas - devolucoes (RNT-008); datas do dia de saida e da devolucao.
  vendas: `SELECT L.CODCLI,
    SUM(CASE WHEN L.DIA >= '@@d90@@' THEN L.VALOR ELSE 0 END) AS C90,
    SUM(CASE WHEN L.DIA >= '@@d60@@' THEN L.VALOR ELSE 0 END) AS A60,
    SUM(CASE WHEN L.DIA >= '@@d120@@' AND L.DIA < '@@d60@@' THEN L.VALOR ELSE 0 END) AS P60,
    SUM(CASE WHEN L.DIA >= '@@mes@@' THEN L.VALOR ELSE 0 END) AS MES,
    SUM(CASE WHEN L.DIA >= '@@mesAntIni@@' AND L.DIA <= '@@mesAntFim@@' THEN L.VALOR ELSE 0 END) AS MES_ANT,
    MAX(CASE WHEN L.TIPO = 'V' THEN L.DIA END) AS ULTIMA,
    MIN(CASE WHEN L.TIPO = 'V' THEN L.DIA END) AS PRIMEIRA,
    COUNT(DISTINCT CASE WHEN L.TIPO = 'V' THEN L.DIA END) AS NDIAS
  FROM (
    SELECT 'V' AS TIPO, S.CODCLI, ${dia('S.DTSAIDA')} AS DIA, S.TOTAL AS VALOR
    FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA S
    WHERE S.CODCLI IN (SELECT CV0.ID_CLIENTE FROM (${CART}) CV0)
      AND EXISTS (SELECT 1 FROM (${CART}) CV1 WHERE ${vendaConta('S', 'CV1')})
    UNION ALL
    SELECT 'D', D.CODCLI, ${dia('D.DATA_DEVOLUCAO')}, -D.VALOR_DEVOLVIDO
    FROM IMP_DEVOLUCOES_TOTVS D
    WHERE D.CODCLI IN (SELECT CV2.ID_CLIENTE FROM (${CART}) CV2)
      AND EXISTS (SELECT 1 FROM (${CART}) CV3 WHERE ${vendaConta('D', 'CV3')})
  ) L
  WHERE L.DIA <= '@@hoje@@'
  GROUP BY L.CODCLI`,

  // So visita CONCLUIDA pelo dono da carteira conta (RN-006/007/011).
  visitas: `SELECT V.CLIENTE_ID, MAX(V.DATA_AGENDADA) AS ULTIMA,
    SUM(CASE WHEN V.DATA_AGENDADA >= '@@d60@@' THEN 1 ELSE 0 END) AS N60
  FROM VISITAS V
  WHERE V.STATUS = 'CONCLUIDA' AND V.DATA_AGENDADA <= '@@hoje@@'
    AND EXISTS (SELECT 1 FROM (${CART}) CV WHERE CV.ID_CLIENTE = V.CLIENTE_ID AND CV.VENDEDOR_ID = V.VENDEDOR_ID)
  GROUP BY V.CLIENTE_ID`,
};

async function corpoCarteira() {
  const e = event || {};
  const hoje = /^\d{4}-\d{2}-\d{2}$/.test(String(e.hoje)) ? String(e.hoje) : '';
  if (!hoje) return { ok: false, error: 'Data de referência inválida.' };
  const valores = {
    modo: ['ME', 'TEAM', 'SELLER', 'ALL', 'COORD'].includes(e.modo) ? e.modo : 'ME',
    coordenador: digitos(e.coordenador), vendedor: digitos(e.vendedor),
    filial: digitos(e.filial), depto: digitos(e.depto), secao: digitos(e.secao),
    ...janelas(hoje),
  };
  const [clientes, vendas, visitas] = await Promise.all(
    ['clientes', 'vendas', 'visitas'].map((chave) => consultar(preencher(SQL[chave], valores))),
  );
  return montarCarteira({
    clientes, vendas, visitas, hoje,
    filtros: {
      busca: String(e.busca ?? '').slice(0, 120), ramo: String(e.ramo ?? ''), status: String(e.status ?? ''),
      ordem: String(e.ordem ?? ''), pendentes: e.pendentes, pagina: e.pagina, porPagina: e.porPagina,
    },
  });
}

/* ─────────────── s360DisponiveisListar ─────────────── */

const ESCOPOS_DO_USUARIO = `SELECT TRIM(CAST(BV.CODFILIAL AS CHAR)) AS CODFILIAL, TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO, BV.ID_SECAO,
    CONCAT(COALESCE(F.NOME_FILIAL, CONCAT('Filial ', TRIM(CAST(BV.CODFILIAL AS CHAR)))), ' · ',
      COALESCE(B.NOME, CONCAT('Departamento ', TRIM(CAST(BV.BU_CODIGO AS CHAR)))), ' · ',
      COALESCE(S.NOME_SECAO, 'Todas as seções')) AS ESCOPO
  FROM BU_VENDEDOR BV
  LEFT JOIN FILIAL F ON ${cod('F.CODFILIAL')} = ${cod('BV.CODFILIAL')}
  LEFT JOIN BU B ON ${cod('B.CODIGO')} = ${cod('BV.BU_CODIGO')}
  LEFT JOIN SECAO S ON S.ID = BV.ID_SECAO
  WHERE BV.VENDEDOR_ID = :VAR_USER AND BV.ATIVO = 1
    AND TRIM(COALESCE(CAST(BV.CODFILIAL AS CHAR), '')) <> ''
    AND ${SEM_BLOQUEIO}`;

// Texto onde o pre-filtro da busca procura: os campos da RN-018, sem acento,
// CNPJ tambem sem pontuacao.
const TEXTO_BUSCA = semAcento(`CONCAT(COALESCE(C.NOME_FANTASIA, ''), ' ', COALESCE(C.RAZAO_SOCIAL, ''), ' ',
    REPLACE(REPLACE(REPLACE(COALESCE(C.CNPJ, ''), '.', ''), '/', ''), '-', ''), ' ', CAST(C.ID AS CHAR), ' ',
    COALESCE(C.CIDADE, ''), ' ', COALESCE(C.UF, ''), ' ', COALESCE(C.SEGMENTO, ''), ' ', ${ramoDe('C.ID')})`);

const SQL_DISPONIVEIS = {
  escopos: `SELECT COUNT(*) AS N FROM (${ESCOPOS_DO_USUARIO}) E`,
  // /*FILTRO*/ e /*PAGINA*/ sao montados no corpo (pedacos so [A-Z0-9]).
  lista: `SELECT C.ID, C.WINTHOR_CODCLI, C.RAZAO_SOCIAL, C.NOME_FANTASIA, ${nomeCliente('C')} AS NOME,
    C.CNPJ, C.CIDADE, C.UF, C.SEGMENTO, C.STATUS, ${ramoDe('C.ID')} AS RAMO,
    E.CODFILIAL, E.CODEPTO, E.ID_SECAO, E.ESCOPO, COUNT(*) OVER () AS TOTAL
  FROM (${ESCOPOS_DO_USUARIO}) E
  JOIN CLIENTES C ON 1 = 1
  WHERE ${naoPessoaFisica('C.ID')}
    AND NOT ${responsavelNoEscopo('C.ID', 'E.CODFILIAL', 'E.CODEPTO', 'E.ID_SECAO')}
    /*FILTRO*/
  ORDER BY NOME, C.ID, E.CODFILIAL, E.CODEPTO, E.ID_SECAO
  /*PAGINA*/`,
  texto: TEXTO_BUSCA,
};

async function corpoDisponiveis() {
  const e = event || {};
  const POR_PAGINA = 10;
  const [{ N } = {}] = await consultar(SQL.escopos);
  if (!Number(N)) return { ok: true, semEscopo: true, total: 0, pagina: 1, linhas: [] };
  const busca = String(e.busca ?? '').slice(0, 120);
  const palavras = palavrasBusca(busca);
  const pagina = Math.max(1, Number(e.pagina) || 1);
  if (!palavras.length) {
    const linhas = await consultar(SQL.lista.replace('/*FILTRO*/', '')
      .replace('/*PAGINA*/', `LIMIT ${POR_PAGINA} OFFSET ${(pagina - 1) * POR_PAGINA}`));
    return { ok: true, semEscopo: false, total: Number(linhas[0]?.TOTAL || 0), pagina, linhas };
  }
  // Pre-filtro: cada palavra tem ao menos um pedaco intacto; a RN-018 decide no JS.
  // ponytail: 2000 candidatos no maximo; busca de 1-2 letras curtas em base enorme pode cortar.
  const filtro = palavras.map((p) => `AND (${pedacosBusca(p).map((x) => `${SQL.texto} LIKE '%${esc(x)}%'`).join(' OR ')})`).join('\n    ');
  const candidatos = await consultar(SQL.lista.replace('/*FILTRO*/', filtro).replace('/*PAGINA*/', 'LIMIT 2000'));
  return { ok: true, semEscopo: false, ...filtrarDisponiveis(candidatos, busca, pagina, POR_PAGINA) };
}

/* ─────────────── historico (fragmentos) ─────────────── */

const CART_SQL = carteiraVisivel(ESCOPO_SQL);

const filtroCliente = (alias) => `(${num('clienteId')} IS NULL OR ${alias} = ${num('clienteId')})`;
const filtroRamo = (cliente) => `('{{ramo}}' = '' OR ${ramoDe(cliente)} = '{{ramo}}')`;
const filtroPeriodo = (data) => `('{{de}}' = '' OR ${data} >= '{{de}}') AND ('{{ate}}' = '' OR ${data} <= '{{ate}}')`;
const paginaDe = (n) => `N.RN > (${pagina()} - 1) * ${n} AND N.RN <= ${pagina()} * ${n}`;

/* ─────────────── titulares (fragmentos) ─────────────── */

const GESTAO = `GESTAO AS (
  SELECT DISTINCT ${cod('BV.CODFILIAL')} AS FIL, ${cod('BV.BU_CODIGO')} AS DEP
  FROM BU_VENDEDOR BV
  WHERE BV.ATIVO = 1 AND ${temPapel('DIRETORIA', 'ADMIN')}
  UNION
  SELECT ${cod('CB.CODFILIAL')}, ${cod('CB.CODEPTO')}
  FROM COORDENADORES_BU CB
  JOIN COORDENADORES C ON C.COD_SUPERVISOR = CB.COD_SUPERVISOR
  WHERE C.USER_ID = :VAR_USER AND C.ATIVO = 1
)`;

const grupo = (alias) => `CASE WHEN ${cod(`${alias}.CODEPTO`)} IN (${POR_SECAO}) THEN ${alias}.ID_SECAO END`;

// Combinacoes sob gestao -> grupos (Enfermagem por secao; demais por departamento) -> situacao.
const TITULARES_BASE = `${GESTAO},
CAND AS (
  SELECT K.* FROM (${candidatos('NULL')}) K
  WHERE EXISTS (SELECT 1 FROM GESTAO G WHERE G.FIL = ${cod('K.CODFILIAL')} AND G.DEP = ${cod('K.CODEPTO')})
    AND ('{{filial}}' = '' OR ${cod('K.CODFILIAL')} = ${cod("'{{filial}}'")})
    AND ('{{depto}}' = '' OR ${cod('K.CODEPTO')} = ${cod("'{{depto}}'")})
    AND ${SEM_BLOQUEIO}
),
COMBO AS (
  SELECT K.ID_CLIENTE, K.CODFILIAL, K.CODEPTO, K.ID_SECAO, ${grupo('K')} AS GRUPO,
    COUNT(DISTINCT K.VENDEDOR_ID) AS N_CAND, MAX(T.VENDEDOR_ID) AS TIT_ID, MAX(T.ORIGEM) AS ORIGEM
  FROM CAND K
  LEFT JOIN CLIENTE_TITULAR_DEPTO T ON T.ID_CLIENTE = K.ID_CLIENTE
    AND ${cod('T.CODFILIAL')} = ${cod('K.CODFILIAL')} AND ${cod('T.CODEPTO')} = ${cod('K.CODEPTO')}
    AND T.ID_SECAO = K.ID_SECAO AND T.ATIVO = 1 AND T.VENDEDOR_ID NOT IN ${BLOQUEADOS}
  GROUP BY K.ID_CLIENTE, K.CODFILIAL, K.CODEPTO, K.ID_SECAO
),
GRUPOS AS (
  SELECT CO.ID_CLIENTE, CO.CODFILIAL, CO.CODEPTO, CO.GRUPO, COUNT(*) AS N_SECOES,
    SUM(CASE WHEN CO.TIT_ID IS NULL AND CO.N_CAND > 1 THEN 1 ELSE 0 END) AS PEND,
    SUM(CASE WHEN CO.TIT_ID IS NULL THEN 1 ELSE 0 END) AS SEM_TIT,
    COUNT(DISTINCT CO.TIT_ID) AS N_TIT, MAX(CO.TIT_ID) AS TIT_ID, MAX(CO.ORIGEM) AS ORIGEM
  FROM COMBO CO
  GROUP BY CO.ID_CLIENTE, CO.CODFILIAL, CO.CODEPTO, CO.GRUPO
),
BASE AS (
  SELECT G.*, ${nomeCliente('C')} AS CLIENTE,
    CASE WHEN G.PEND > 0 THEN 'PENDENTE'
         WHEN G.SEM_TIT = 0 AND G.N_TIT = 1 THEN COALESCE(G.ORIGEM, 'AUTO')
         WHEN G.SEM_TIT = 0 THEN 'MISTO'
         ELSE 'SEM_TITULAR' END AS SITUACAO
  FROM GRUPOS G
  JOIN CLIENTES C ON C.ID = G.ID_CLIENTE
  WHERE ('{{busca}}' = ''
    OR ${semAcento("CONCAT(COALESCE(C.NOME_FANTASIA, ''), ' ', COALESCE(C.RAZAO_SOCIAL, ''))")} LIKE CONCAT('%', ${semAcento("'{{busca}}'")}, '%')
    OR CAST(C.ID AS CHAR) = TRIM('{{busca}}'))
)`;

// Vendas liquidas dos ultimos 12 meses por combinacao, so dos clientes candidatos.
const VENDA_12M = `V12 AS (
  SELECT L.CODCLI, L.FIL, L.DEP, L.SEC, SUM(L.VALOR) AS VALOR FROM (
    SELECT S.CODCLI, ${cod('S.CODFILIAL')} AS FIL, ${cod('S.CODEPTO')} AS DEP, ${cod('S.CODSEC')} AS SEC, S.TOTAL AS VALOR
    FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA S
    WHERE ${dia('S.DTSAIDA')} >= '{{desde}}' AND S.CODCLI IN (SELECT ID_CLIENTE FROM CAND)
    UNION ALL
    SELECT D.CODCLI, ${cod('D.CODFILIAL')}, ${cod('D.CODEPTO')}, ${cod('D.CODSEC')}, -D.VALOR_DEVOLVIDO
    FROM IMP_DEVOLUCOES_TOTVS D
    WHERE ${dia('D.DATA_DEVOLUCAO')} >= '{{desde}}' AND D.CODCLI IN (SELECT ID_CLIENTE FROM CAND)
  ) L
  GROUP BY L.CODCLI, L.FIL, L.DEP, L.SEC
)`;

// Combinacao pedida na definicao do titular: Enfermagem exige secao; nos
// demais departamentos, secao vazia = todas as secoes do vendedor.
const secaoPedida = (coluna) => `((${num('idSecao')} IS NOT NULL AND ${coluna} = ${num('idSecao')})
    OR (${num('idSecao')} IS NULL AND ${cod("'{{codepto}}'")} NOT IN (${POR_SECAO})))`;

/* ─────────────── recalculo de titulares (RN-003) ─────────────── */

const T = 'CLIENTE_TITULAR_DEPTO';
// A tela manda `agora` (D-007 da 001); a rotina diaria nao tem tela, entao cai no relogio do banco.
const AGORA_OU_RELOGIO = `COALESCE(NULLIF('{{agora}}', ''), DATE_FORMAT(NOW(), '%Y-%m-%dT%H:%i:%s'))`;
const LIMPAR_TITULARES = `DELETE FROM ${T}
WHERE (${num('clienteId')} IS NULL OR ${T}.ID_CLIENTE = ${num('clienteId')})
  AND ${SEM_BLOQUEIO}
  AND (
    NOT ${ehCandidato(`${T}.ID_CLIENTE`, `${T}.CODFILIAL`, `${T}.CODEPTO`, `${T}.ID_SECAO`, `BV_K.VENDEDOR_ID = ${T}.VENDEDOR_ID`)}
    OR (${T}.ORIGEM = 'AUTO'
      AND ${ehCandidato(`${T}.ID_CLIENTE`, `${T}.CODFILIAL`, `${T}.CODEPTO`, `${T}.ID_SECAO`, `BV_K.VENDEDOR_ID <> ${T}.VENDEDOR_ID`)})
  )`;

const INSERIR_TITULARES = `INSERT INTO CLIENTE_TITULAR_DEPTO (ID_CLIENTE, CODFILIAL, CODEPTO, ID_SECAO, VENDEDOR_ID, ORIGEM, ATIVO, CRIADO_EM, ATUALIZADO_EM)
SELECT U.ID_CLIENTE, U.CODFILIAL, U.CODEPTO, U.ID_SECAO, U.VENDEDOR_ID, 'AUTO', 1, ${AGORA_OU_RELOGIO}, ${AGORA_OU_RELOGIO}
FROM (
  SELECT K.ID_CLIENTE, K.CODFILIAL, K.CODEPTO, K.ID_SECAO, MIN(K.VENDEDOR_ID) AS VENDEDOR_ID
  FROM (${candidatos(num('clienteId'))}) K
  GROUP BY K.ID_CLIENTE, K.CODFILIAL, K.CODEPTO, K.ID_SECAO
  HAVING COUNT(DISTINCT K.VENDEDOR_ID) = 1
) U
WHERE NOT EXISTS (
    SELECT 1 FROM CLIENTE_TITULAR_DEPTO TX
    WHERE TX.ID_CLIENTE = U.ID_CLIENTE AND ${cod('TX.CODFILIAL')} = ${cod('U.CODFILIAL')}
      AND ${cod('TX.CODEPTO')} = ${cod('U.CODEPTO')} AND TX.ID_SECAO = U.ID_SECAO)
  AND ${SEM_BLOQUEIO}`;

/* ─────────────── definicoes ─────────────── */

const ESCOPO_DESCR = 'Escopo: modo ME|TEAM|SELLER|ALL|COORD, coordenador, vendedor, filial, depto, secao (texto, vazio = sem recorte), hoje AAAA-MM-DD.';

export const definitions = [
  /* ── escopo e carteira ── */
  {
    name: 's360EscopoOpcoes',
    type: 'SQL',
    description: 'Opcoes do filtro de escopo (RNT-003): linhas de escopo que o usuario pode pedir, com coordenador, vendedor, filial, departamento e secao. Sem parametros.',
    code: `SELECT DISTINCT C.COD_SUPERVISOR, C.NOME AS COORDENADOR,
  CASE WHEN C.USER_ID = :VAR_USER THEN 1 ELSE 0 END AS MEU_TIME,
  BV.VENDEDOR_ID, ${nomeUsuario('U')} AS VENDEDOR,
  TRIM(CAST(BV.CODFILIAL AS CHAR)) AS CODFILIAL, COALESCE(F.NOME_FILIAL, CONCAT('Filial ', TRIM(CAST(BV.CODFILIAL AS CHAR)))) AS FILIAL,
  TRIM(CAST(BV.BU_CODIGO AS CHAR)) AS CODEPTO, COALESCE(B.NOME, CONCAT('Departamento ', TRIM(CAST(BV.BU_CODIGO AS CHAR)))) AS DEPTO,
  BV.ID_SECAO, COALESCE(S.NOME_SECAO, 'Todas as seções') AS SECAO,
  CASE WHEN BV.VENDEDOR_ID = :VAR_USER THEN 1 ELSE 0 END AS PROPRIO
FROM BU_VENDEDOR BV
JOIN INT_USER U ON U.ID = BV.VENDEDOR_ID
LEFT JOIN COORDENADORES_BU CB ON ${cod('CB.CODFILIAL')} = ${cod('BV.CODFILIAL')} AND ${cod('CB.CODEPTO')} = ${cod('BV.BU_CODIGO')}
LEFT JOIN COORDENADORES C ON C.COD_SUPERVISOR = CB.COD_SUPERVISOR AND C.ATIVO = 1
LEFT JOIN FILIAL F ON ${cod('F.CODFILIAL')} = ${cod('BV.CODFILIAL')}
LEFT JOIN BU B ON ${cod('B.CODIGO')} = ${cod('BV.BU_CODIGO')}
LEFT JOIN SECAO S ON S.ID = BV.ID_SECAO
WHERE BV.ATIVO = 1
  AND ${SEM_BLOQUEIO}
  AND (BV.VENDEDOR_ID = :VAR_USER
    OR (EXISTS (SELECT 1 FROM VENDEDOR_RCA VR WHERE VR.USER_ID = BV.VENDEDOR_ID)
      AND ((C.USER_ID = :VAR_USER AND ${COORDENADOR_ATIVO})
        OR (C.COD_SUPERVISOR IS NOT NULL AND ${temPapel('DIRETORIA', 'ADMIN')}))))
ORDER BY COORDENADOR, VENDEDOR, CODFILIAL, CODEPTO, ID_SECAO`,
  },
  {
    name: 's360CarteiraCarregar',
    type: 'JAVASCRIPT',
    description: `Carteira do escopo (RF-001..006, RF-017): pagina, total, indicadores e distribuicao por ramo, com curva, temperatura, queda e busca inteligente calculadas no servidor. ${ESCOPO_DESCR} Mais busca, ramo, status, ordem RANK_AD|RANK_DA|NOME_AZ|NOME_ZA|STATUS|DIAS_VISITA, pendentes 0|1, pagina, porPagina.`,
    code: corpoJs(SQL_CARTEIRA, corpoCarteira),
  },
  {
    name: 's360ClientesRamos',
    type: 'SQL',
    description: 'Ramos do filtro da carteira (RN-013): ramos do cadastro sem Pessoa Fisica, mais Sem ramo. Sem parametros.',
    code: `SELECT R.RAMO FROM (
  SELECT DISTINCT TRIM(ICT.RAMO) AS RAMO FROM IMP_CLIENTES_TOTVS ICT
  WHERE TRIM(COALESCE(ICT.RAMO, '')) <> '' AND UPPER(TRIM(ICT.RAMO)) <> 'PESSOA FISICA'
  UNION
  SELECT 'Sem ramo'
) R
WHERE ${SEM_BLOQUEIO}
ORDER BY CASE WHEN R.RAMO = 'Sem ramo' THEN 1 ELSE 0 END, R.RAMO`,
  },
  {
    name: 's360ClienteFicha',
    type: 'SQL',
    description: `Ficha do cliente, so leitura (RN-014), para quem o ve na carteira exibida. ${ESCOPO_DESCR} Mais clienteId.`,
    code: `SELECT C.ID, C.RAZAO_SOCIAL, C.NOME_FANTASIA, C.CNPJ, C.SEGMENTO, C.CIDADE, C.UF, C.TELEFONE, C.EMAIL, C.ENDERECO, C.STATUS
FROM CLIENTES C
WHERE C.ID = ${num('clienteId')}
  AND C.ID IN (SELECT CV.ID_CLIENTE FROM (${CART_SQL}) CV)`,
  },
  {
    name: 's360CarteiraCurvaFixar',
    type: 'SQL',
    description: 'Fixa a curva manual (RN-005) nos vinculos do proprio usuario com o cliente. Params: clienteId, curva A|B|C|D (vazio volta a automatica). Devolve affectedRows.',
    code: `UPDATE EQUIPE_CLIENTE
SET CURVA_CLASSIFICACAO = NULLIF('{{curva}}', '')
WHERE ID_CLIENTE = ${num('clienteId')}
  AND ID_VENDEDOR = :VAR_USER
  AND '{{curva}}' IN ('', 'A', 'B', 'C', 'D')
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360CarteiraRemover',
    type: 'SQL',
    description: 'Remove o cliente da carteira do proprio usuario (RN-015): so os vinculos dele. Params: clienteId. Devolve affectedRows.',
    code: `DELETE FROM EQUIPE_CLIENTE
WHERE ID_CLIENTE = ${num('clienteId')}
  AND ID_VENDEDOR = :VAR_USER
  AND ${SEM_BLOQUEIO}`,
  },

  /* ── disponiveis ── */
  {
    name: 's360DisponiveisListar',
    type: 'JAVASCRIPT',
    description: 'Clientes disponiveis por escopo ativo do usuario (RN-019), 10 por pagina, busca inteligente (RN-018). Params: busca, pagina.',
    code: corpoJs(SQL_DISPONIVEIS, corpoDisponiveis),
  },
  {
    name: 's360DisponivelAdicionar',
    type: 'SQL',
    description: 'Adiciona o cliente a carteira do usuario num escopo dele, numa instrucao so (RN-019). Params: clienteId, codFilial, codepto, idSecao (vazio = todas), agora. Devolve affectedRows; 0 = recusado (ver s360DisponivelMotivo).',
    code: `INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, CRIADO_EM, CODFILIAL, ID_SECAO)
SELECT C.ID, :VAR_USER, '{{agora}}', TRIM(CAST(BV.CODFILIAL AS CHAR)), BV.ID_SECAO
FROM CLIENTES C
JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = :VAR_USER AND BV.ATIVO = 1
  AND ${cod('BV.CODFILIAL')} = ${cod("'{{codFilial}}'")}
  AND ${cod('BV.BU_CODIGO')} = ${cod("'{{codepto}}'")}
  AND ((${num('idSecao')} IS NULL AND BV.ID_SECAO IS NULL) OR BV.ID_SECAO = ${num('idSecao')})
WHERE C.ID = ${num('clienteId')}
  AND ${naoPessoaFisica('C.ID')}
  AND NOT ${responsavelNoEscopo('C.ID', 'BV.CODFILIAL', 'BV.BU_CODIGO', 'BV.ID_SECAO')}
  AND '{{agora}}' <> ''
  AND ${SEM_BLOQUEIO}
LIMIT 1`,
  },
  {
    name: 's360DisponivelMotivo',
    type: 'SQL',
    description: 'Por que a adicao foi recusada (RN-019): SEM_ESCOPO, NAO_ENCONTRADO, JA_NA_CARTEIRA, JA_TEM_RESPONSAVEL. Params: clienteId, codFilial, codepto, idSecao.',
    code: `SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM BU_VENDEDOR BV WHERE BV.VENDEDOR_ID = :VAR_USER AND BV.ATIVO = 1) THEN 'SEM_ESCOPO'
    WHEN NOT EXISTS (SELECT 1 FROM CLIENTES C WHERE C.ID = ${num('clienteId')} AND ${naoPessoaFisica('C.ID')}) THEN 'NAO_ENCONTRADO'
    WHEN ${responsavelNoEscopo(num('clienteId'), "'{{codFilial}}'", "'{{codepto}}'", num('idSecao'), 'EC_R.ID_VENDEDOR = :VAR_USER')} THEN 'JA_NA_CARTEIRA'
    WHEN ${responsavelNoEscopo(num('clienteId'), "'{{codFilial}}'", "'{{codepto}}'", num('idSecao'))} THEN 'JA_TEM_RESPONSAVEL'
    ELSE 'NAO_ENCONTRADO' END AS MOTIVO
FROM INT_USER U
WHERE U.ID = :VAR_USER
  AND ${SEM_BLOQUEIO}`,
  },

  /* ── titularidade (recalculo) ── */
  {
    name: 's360TitularesLimpar',
    type: 'SQL',
    description: 'RN-003: remove titular AUTO que deixou de ser candidato unico e MANUAL cujo vendedor deixou de ser candidato. Params: clienteId (vazio = todos). Agendada 1x/dia.',
    code: LIMPAR_TITULARES,
    cronExpression: '0 10 3 * * *',
    cronInputJson: { clienteId: '' },
  },
  {
    name: 's360TitularesInserir',
    type: 'SQL',
    description: 'RN-003: cria titular AUTO onde ha um unico candidato e nenhum titular. Params: clienteId (vazio = todos), agora. Agendada 1x/dia, depois de s360TitularesLimpar.',
    code: INSERIR_TITULARES,
    cronExpression: '0 15 3 * * *',
    cronInputJson: { clienteId: '', agora: '' },
  },

  /* ── historico ── */
  {
    name: 's360HistoricoLinhaTempo',
    type: 'SQL',
    description: `Linha do tempo do historico (RN-017): visitas concluidas, atividades concluidas, relatos avulsos e mixes enviados, 20 por pagina, com TOTAL. ${ESCOPO_DESCR} Mais clienteId, ramo, tipo VISITA|ATIVIDADE|RELATO|MIX, de, ate, pagina.`,
    code: `WITH CART AS (${CART_SQL}),
DONOS AS (SELECT DISTINCT ID_CLIENTE, VENDEDOR_ID, COBERTURA FROM CART),
EV AS (
  SELECT 'VISITA' AS TIPO, V.DATA_AGENDADA AS DATA, V.HORA_INICIO AS HORA, V.CLIENTE_ID, 'Visita' AS TITULO,
    V.RELATO AS TEXTO, V.PLANEJAMENTO, V.ID AS REF_ID, NULL AS VALOR
  FROM VISITAS V
  WHERE V.STATUS = 'CONCLUIDA' AND V.CLIENTE_ID IN (SELECT ID_CLIENTE FROM CART)
    AND (V.VENDEDOR_ID = :VAR_USER OR EXISTS (SELECT 1 FROM DONOS D WHERE D.ID_CLIENTE = V.CLIENTE_ID AND D.VENDEDOR_ID = V.VENDEDOR_ID))
  UNION ALL
  SELECT 'ATIVIDADE', ${dia('T.CONCLUIDO_EM')}, SUBSTRING(T.CONCLUIDO_EM, 12, 5), T.CLIENTE_ID, T.TITULO, T.DESCRICAO, NULL, T.ID, NULL
  FROM TAREFAS T
  WHERE T.STATUS = 'CONCLUIDA'
    AND EXISTS (SELECT 1 FROM DONOS D WHERE D.ID_CLIENTE = T.CLIENTE_ID AND D.VENDEDOR_ID = T.VENDEDOR_ID AND D.COBERTURA = 0)
  UNION ALL
  SELECT 'RELATO', R.DATA_CONTATO, R.HORA_CONTATO, R.CLIENTE_ID, R.TIPO_CONTATO, R.RELATO, NULL, R.ID, NULL
  FROM RELATOS_CLIENTE R
  WHERE R.CLIENTE_ID IN (SELECT ID_CLIENTE FROM CART)
    AND (R.VENDEDOR_ID = :VAR_USER OR EXISTS (SELECT 1 FROM DONOS D WHERE D.ID_CLIENTE = R.CLIENTE_ID AND D.VENDEDOR_ID = R.VENDEDOR_ID))
  UNION ALL
  SELECT 'MIX', ${dia('M.DT_ENVIO_HISTORICO')}, SUBSTRING(M.DT_ENVIO_HISTORICO, 12, 5), M.ID_CLIENTE, M.NOME, M.DESCRICAO, NULL, M.ID, M.TOTAL_VENDA
  FROM PRODUCT_MIX M
  WHERE M.ENVIADO_HISTORICO = 1
    AND EXISTS (SELECT 1 FROM DONOS D WHERE D.ID_CLIENTE = M.ID_CLIENTE AND D.VENDEDOR_ID = M.ID_USUARIO_CRIACAO AND D.COBERTURA = 0)
),
F AS (
  SELECT E.*, ${nomeCliente('C')} AS CLIENTE
  FROM EV E
  JOIN CLIENTES C ON C.ID = E.CLIENTE_ID
  WHERE ${filtroCliente('E.CLIENTE_ID')}
    AND ${filtroRamo('E.CLIENTE_ID')}
    AND ('{{tipo}}' = '' OR E.TIPO = '{{tipo}}')
    AND ${filtroPeriodo('E.DATA')}
),
N AS (
  SELECT F.*, ROW_NUMBER() OVER (ORDER BY F.DATA DESC, F.HORA DESC, F.TIPO, F.REF_ID DESC) AS RN, COUNT(*) OVER () AS TOTAL
  FROM F
)
SELECT N.TIPO, N.DATA, N.HORA, N.CLIENTE_ID, N.CLIENTE, N.TITULO, N.TEXTO, N.PLANEJAMENTO, N.REF_ID, N.VALOR, N.TOTAL
FROM N
WHERE ${paginaDe(20)}
ORDER BY N.RN`,
  },
  {
    name: 's360HistoricoPedidos',
    type: 'SQL',
    description: `Pedidos faturados do historico no escopo (RN-017, RNT-007), 20 por pagina, com TOTAL. ${ESCOPO_DESCR} Mais clienteId, ramo, de, ate, pagina.`,
    code: `WITH CART AS (${CART_SQL}),
P AS (
  SELECT S.NUMPED, S.CODCLI, MAX(${dia('S.DTSAIDA')}) AS DATA, COUNT(*) AS ITENS, SUM(S.TOTAL) AS VALOR
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA S
  WHERE S.CODCLI IN (SELECT ID_CLIENTE FROM CART)
    AND EXISTS (SELECT 1 FROM CART A WHERE ${vendaConta('S', 'A')})
    AND ${filtroCliente('S.CODCLI')}
    AND ${filtroPeriodo(dia('S.DTSAIDA'))}
  GROUP BY S.NUMPED, S.CODCLI
),
F AS (
  SELECT P.*, ${nomeCliente('C')} AS CLIENTE
  FROM P JOIN CLIENTES C ON C.ID = P.CODCLI
  WHERE ${filtroRamo('P.CODCLI')}
),
N AS (
  SELECT F.*, ROW_NUMBER() OVER (ORDER BY F.DATA DESC, F.NUMPED DESC) AS RN, COUNT(*) OVER () AS TOTAL
  FROM F
)
SELECT N.NUMPED, N.CODCLI AS CLIENTE_ID, N.CLIENTE, N.DATA, N.ITENS, N.VALOR, N.TOTAL
FROM N
WHERE ${paginaDe(20)}
ORDER BY N.RN`,
  },
  {
    name: 's360HistoricoPedidoItens',
    type: 'SQL',
    description: `Itens de um pedido do historico (RN-017). ${ESCOPO_DESCR} Mais clienteId, numped. DESCONTO_PERC = 0: a fonte do ERP nao traz desconto (D-008).`,
    code: `WITH CART AS (${CART_SQL})
SELECT COALESCE(S.DESCRICAO, CONCAT('Produto ', S.CODPROD)) AS PRODUTO, S.QT AS QUANTIDADE, S.VLUNIT AS PRECO_UNITARIO,
  0 AS DESCONTO_PERC, S.TOTAL
FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA S
WHERE S.CODCLI = ${num('clienteId')}
  AND S.NUMPED = '{{numped}}'
  AND EXISTS (SELECT 1 FROM CART A WHERE ${vendaConta('S', 'A')})
ORDER BY S.DESCRICAO`,
  },
  {
    name: 's360HistoricoMixItens',
    type: 'SQL',
    description: `Itens de um mix enviado ao historico (RF-010). ${ESCOPO_DESCR} Mais mixId.`,
    code: `WITH CART AS (${CART_SQL})
SELECT COALESCE(PC.NOME, CONCAT('Produto ', I.ID_PRODUTO)) AS PRODUTO, I.QUANTIDADE, I.PRECO_VENDA, I.MARGEM_PERCENT,
  I.QUANTIDADE * I.PRECO_VENDA AS TOTAL
FROM PRODUCT_MIX_ITEMS I
JOIN PRODUCT_MIX M ON M.ID = I.ID_MIX
LEFT JOIN PRODUTOS_CUSTOS PC ON PC.CODPROD = I.ID_PRODUTO
WHERE M.ID = ${num('mixId')}
  AND M.ENVIADO_HISTORICO = 1
  AND EXISTS (SELECT 1 FROM CART A WHERE A.ID_CLIENTE = M.ID_CLIENTE AND A.VENDEDOR_ID = M.ID_USUARIO_CRIACAO AND A.COBERTURA = 0)
ORDER BY PRODUTO`,
  },
  {
    name: 's360HistoricoVisitasSemana',
    type: 'SQL',
    description: 'Ultimas visitas da ultima semana do usuario (RN-017), com relato ok ou pendente. Params: desde, hoje (AAAA-MM-DD).',
    code: `SELECT V.ID, V.DATA_AGENDADA AS DATA, V.CLIENTE_ID, ${nomeCliente('C')} AS CLIENTE,
  CASE WHEN TRIM(COALESCE(V.RELATO, '')) <> '' THEN 1 ELSE 0 END AS RELATO_OK
FROM VISITAS V
JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
WHERE V.VENDEDOR_ID = :VAR_USER
  AND V.STATUS = 'CONCLUIDA'
  AND V.DATA_AGENDADA >= '{{desde}}' AND V.DATA_AGENDADA <= '{{hoje}}'
  AND ${SEM_BLOQUEIO}
ORDER BY V.DATA_AGENDADA DESC, V.HORA_INICIO DESC`,
  },

  /* ── relato e prospect ── */
  {
    name: 's360RelatoRegistrar',
    type: 'SQL',
    description: 'Relato avulso de contato sem visita (RN-016), so para cliente da carteira do usuario ou de titular coberto. Params: clienteId, data, hora (HH:MM ou vazio), tipo, relato (<= 4000), hoje, agora. Devolve affectedRows.',
    code: `INSERT INTO RELATOS_CLIENTE (CLIENTE_ID, VENDEDOR_ID, DATA_CONTATO, HORA_CONTATO, TIPO_CONTATO, RELATO, CRIADO_EM)
SELECT C.ID, :VAR_USER, '{{data}}', NULLIF('{{hora}}', ''), '{{tipo}}', '{{relato}}', REPLACE('{{agora}}', 'T', ' ')
FROM CLIENTES C
WHERE C.ID = ${num('clienteId')}
  AND EXISTS (SELECT 1 FROM EQUIPE_CLIENTE EC
    WHERE EC.ID_CLIENTE = C.ID
      AND (EC.ID_VENDEDOR = :VAR_USER OR EC.ID_VENDEDOR IN ${titularesCobertos(':VAR_USER', "'{{hoje}}'")}))
  AND CHAR_LENGTH('{{data}}') = 10 AND '{{data}}' <= '{{hoje}}'
  AND ('{{hora}}' = '' OR CHAR_LENGTH('{{hora}}') = 5)
  AND '{{tipo}}' IN (${TIPOS_RELATO})
  AND CHAR_LENGTH(TRIM('{{relato}}')) >= 1 AND CHAR_LENGTH('{{relato}}') <= 4000
  AND '{{agora}}' <> ''
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360ProspectCriar',
    type: 'SQL',
    description: 'Cria cliente prospecto pela carteira (RN-021); responsavel = usuario logado. Params: razaoSocial (<= 300), nomeFantasia, cnpj, segmento, porte, origem, cidade, uf, potencial, probabilidade (vazio = 10), observacoes (<= 8000), agora. Devolve affectedRows.',
    code: `INSERT INTO PROSPECTS (RAZAO_SOCIAL, NOME_FANTASIA, CNPJ, SEGMENTO, PORTE, ORIGEM, CIDADE, UF, STATUS_PIPELINE,
  POTENCIAL, PROBABILIDADE, OBSERVACOES, RESPONSAVEL_ID, CRIADO_EM, ATUALIZADO_EM)
SELECT TRIM('{{razaoSocial}}'), NULLIF(TRIM('{{nomeFantasia}}'), ''), NULLIF(TRIM('{{cnpj}}'), ''), NULLIF(TRIM('{{segmento}}'), ''),
  NULLIF(TRIM('{{porte}}'), ''), NULLIF(TRIM('{{origem}}'), ''), NULLIF(TRIM('{{cidade}}'), ''), NULLIF(UPPER(TRIM('{{uf}}')), ''),
  'NOVO', COALESCE(CAST(NULLIF(TRIM('{{potencial}}'), '') AS DECIMAL(12,2)), 0), COALESCE(${num('probabilidade')}, 10),
  NULLIF(TRIM('{{observacoes}}'), ''), :VAR_USER, '{{agora}}', '{{agora}}'
FROM INT_USER U
WHERE U.ID = :VAR_USER
  AND CHAR_LENGTH(TRIM('{{razaoSocial}}')) BETWEEN 1 AND 300
  AND ('{{uf}}' = '' OR CHAR_LENGTH(TRIM('{{uf}}')) = 2)
  AND CHAR_LENGTH('{{observacoes}}') <= 8000
  AND COALESCE(${num('probabilidade')}, 10) <= 100
  AND '{{agora}}' <> ''
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360ProspectContatoCriar',
    type: 'SQL',
    description: 'Contato principal do prospect recem-criado pelo usuario (RN-021). Params: razaoSocial, agora (os mesmos do s360ProspectCriar), contato, cargo, telefone, email. Devolve affectedRows.',
    code: `INSERT INTO PROSPECT_CONTATOS (PROSPECT_ID, NOME, CARGO, TELEFONE, EMAIL, PRINCIPAL, CRIADO_EM)
SELECT P.ID, TRIM('{{contato}}'), NULLIF(TRIM('{{cargo}}'), ''), NULLIF(TRIM('{{telefone}}'), ''), NULLIF(TRIM('{{email}}'), ''), 1, '{{agora}}'
FROM PROSPECTS P
WHERE P.RESPONSAVEL_ID = :VAR_USER
  AND P.CRIADO_EM = '{{agora}}'
  AND P.RAZAO_SOCIAL = TRIM('{{razaoSocial}}')
  AND CHAR_LENGTH(TRIM('{{contato}}')) BETWEEN 1 AND 200
  AND ${SEM_BLOQUEIO}
ORDER BY P.ID DESC
LIMIT 1`,
  },

  /* ── tela Titulares de Clientes ── */
  {
    name: 's360TitularesFiltros',
    type: 'SQL',
    description: 'Filiais e departamentos sob gestao do usuario (RN-020). Sem parametros.',
    code: `WITH ${GESTAO}
SELECT G.FIL AS CODFILIAL, COALESCE(MAX(FI.NOME_FILIAL), CONCAT('Filial ', G.FIL)) AS FILIAL,
  G.DEP AS CODEPTO, COALESCE(MAX(BU.NOME), CONCAT('Departamento ', G.DEP)) AS DEPTO
FROM GESTAO G
LEFT JOIN FILIAL FI ON ${cod('FI.CODFILIAL')} = G.FIL
LEFT JOIN BU ON ${cod('BU.CODIGO')} = G.DEP
WHERE ${SEM_BLOQUEIO}
GROUP BY G.FIL, G.DEP
ORDER BY G.FIL, G.DEP`,
  },
  {
    name: 's360TitularesTotais',
    type: 'SQL',
    description: 'Totais da tela de titulares (RN-020): PENDENTES, CLIENTES_PENDENTES, COM_TITULAR. Params: filial, depto, busca.',
    code: `WITH ${TITULARES_BASE}
SELECT COALESCE(SUM(CASE WHEN B.SITUACAO = 'PENDENTE' THEN 1 ELSE 0 END), 0) AS PENDENTES,
  COUNT(DISTINCT CASE WHEN B.SITUACAO = 'PENDENTE' THEN B.ID_CLIENTE END) AS CLIENTES_PENDENTES,
  COALESCE(SUM(CASE WHEN B.SITUACAO IN ('MANUAL', 'AUTO', 'MISTO') THEN 1 ELSE 0 END), 0) AS COM_TITULAR
FROM BASE B`,
  },
  {
    name: 's360TitularesListar',
    type: 'SQL',
    description: 'Titulares de clientes (RN-020): uma linha por cliente x filial x departamento (Enfermagem: por secao), 30 por pagina, pendentes primeiro e maior venda liquida 12 meses. Params: situacao PENDENTE|MANUAL|AUTO|MISTO|SEM_TITULAR|vazio, filial, depto, busca, desde (hoje - 12 meses), pagina.',
    code: `WITH ${TITULARES_BASE},
CANDS AS (
  SELECT X.ID_CLIENTE, X.CODFILIAL, X.CODEPTO, X.GRUPO, GROUP_CONCAT(X.ROTULO SEPARATOR '|') AS CANDIDATOS
  FROM (
    SELECT DISTINCT K.ID_CLIENTE, K.CODFILIAL, K.CODEPTO, ${grupo('K')} AS GRUPO,
      CONCAT(K.VENDEDOR_ID, ':', REPLACE(${nomeUsuario('U')}, '|', ' ')) AS ROTULO
    FROM CAND K JOIN INT_USER U ON U.ID = K.VENDEDOR_ID
  ) X
  GROUP BY X.ID_CLIENTE, X.CODFILIAL, X.CODEPTO, X.GRUPO
),
${VENDA_12M},
F AS (
  SELECT B.*, CA.CANDIDATOS,
    COALESCE((SELECT SUM(V.VALOR) FROM V12 V
      WHERE V.CODCLI = B.ID_CLIENTE AND V.FIL = ${cod('B.CODFILIAL')} AND V.DEP = ${cod('B.CODEPTO')}
        AND (B.GRUPO IS NULL OR V.SEC = B.GRUPO)), 0) AS VENDA_12M
  FROM BASE B
  JOIN CANDS CA ON CA.ID_CLIENTE = B.ID_CLIENTE AND CA.CODFILIAL = B.CODFILIAL AND CA.CODEPTO = B.CODEPTO
    AND COALESCE(CA.GRUPO, -1) = COALESCE(B.GRUPO, -1)
  WHERE ('{{situacao}}' = '' OR B.SITUACAO = '{{situacao}}')
),
N AS (
  SELECT F.*, CASE WHEN F.SEM_TIT = 0 AND F.N_TIT = 1 THEN F.TIT_ID END AS TITULAR_ID,
    ROW_NUMBER() OVER (ORDER BY CASE WHEN F.SITUACAO = 'PENDENTE' THEN 0 ELSE 1 END, F.VENDA_12M DESC, F.CLIENTE, F.CODFILIAL, F.CODEPTO, F.GRUPO) AS RN,
    COUNT(*) OVER () AS TOTAL
  FROM F
)
SELECT N.ID_CLIENTE, N.CLIENTE, N.CODFILIAL, COALESCE(FI.NOME_FILIAL, CONCAT('Filial ', N.CODFILIAL)) AS FILIAL,
  N.CODEPTO, COALESCE(BU.NOME, CONCAT('Departamento ', N.CODEPTO)) AS DEPTO, N.GRUPO AS ID_SECAO,
  CASE WHEN N.GRUPO IS NULL THEN CONCAT('Todas as seções (', N.N_SECOES, ')')
       ELSE COALESCE(S.NOME_SECAO, CONCAT('Seção ', N.GRUPO)) END AS SECAO,
  N.N_SECOES, N.CANDIDATOS, N.TITULAR_ID, ${nomeUsuario('TU')} AS TITULAR, N.SITUACAO, N.VENDA_12M, N.TOTAL
FROM N
LEFT JOIN FILIAL FI ON ${cod('FI.CODFILIAL')} = ${cod('N.CODFILIAL')}
LEFT JOIN BU ON ${cod('BU.CODIGO')} = ${cod('N.CODEPTO')}
LEFT JOIN SECAO S ON S.ID = N.GRUPO
LEFT JOIN INT_USER TU ON TU.ID = N.TITULAR_ID
WHERE ${paginaDe(30)}
ORDER BY N.RN`,
  },
  {
    name: 's360TitularDefinirAtualizar',
    type: 'SQL',
    description: 'Troca o titular onde ja ha linha (RN-020, RF-013), so para candidato valido e combinacao sob gestao. Params: clienteId, codFilial, codepto, idSecao (vazio = todas, fora de Enfermagem), vendedorId, agora. Devolve affectedRows; somar com s360TitularDefinirInserir.',
    code: `UPDATE ${T}
SET VENDEDOR_ID = ${num('vendedorId')}, ORIGEM = 'MANUAL', ATIVO = 1, ATUALIZADO_EM = '{{agora}}', ALTERADO_POR = :VAR_USER
WHERE ${T}.ID_CLIENTE = ${num('clienteId')}
  AND ${cod(`${T}.CODFILIAL`)} = ${cod("'{{codFilial}}'")}
  AND ${cod(`${T}.CODEPTO`)} = ${cod("'{{codepto}}'")}
  AND ${secaoPedida(`${T}.ID_SECAO`)}
  AND ${ehCandidato(`${T}.ID_CLIENTE`, `${T}.CODFILIAL`, `${T}.CODEPTO`, `${T}.ID_SECAO`, `BV_K.VENDEDOR_ID = ${num('vendedorId')}`)}
  AND ${podeGerir("'{{codFilial}}'", "'{{codepto}}'")}
  AND '{{agora}}' <> ''
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360TitularDefinirInserir',
    type: 'SQL',
    description: 'Cria o titular MANUAL nas secoes sem linha (RN-020, RF-013). Mesmos params de s360TitularDefinirAtualizar. Devolve affectedRows.',
    code: `INSERT INTO CLIENTE_TITULAR_DEPTO (ID_CLIENTE, CODFILIAL, CODEPTO, ID_SECAO, VENDEDOR_ID, ORIGEM, ATIVO, CRIADO_EM, ATUALIZADO_EM, ALTERADO_POR)
SELECT DISTINCT EC.ID_CLIENTE, TRIM(CAST(BV.CODFILIAL AS CHAR)), TRIM(CAST(BV.BU_CODIGO AS CHAR)), BV.ID_SECAO, BV.VENDEDOR_ID,
  'MANUAL', 1, '{{agora}}', '{{agora}}', :VAR_USER
FROM EQUIPE_CLIENTE EC
JOIN BU_VENDEDOR BV ON BV.VENDEDOR_ID = EC.ID_VENDEDOR AND BV.ATIVO = 1
WHERE EC.ID_CLIENTE = ${num('clienteId')}
  AND BV.VENDEDOR_ID = ${num('vendedorId')}
  AND BV.ID_SECAO IS NOT NULL
  AND ${cod('BV.CODFILIAL')} = ${cod("'{{codFilial}}'")}
  AND ${cod('BV.BU_CODIGO')} = ${cod("'{{codepto}}'")}
  AND ${secaoPedida('BV.ID_SECAO')}
  AND BV.VENDEDOR_ID NOT IN ${BLOQUEADOS}
  AND NOT EXISTS (
    SELECT 1 FROM CLIENTE_TITULAR_DEPTO TX
    WHERE TX.ID_CLIENTE = EC.ID_CLIENTE AND ${cod('TX.CODFILIAL')} = ${cod('BV.CODFILIAL')}
      AND ${cod('TX.CODEPTO')} = ${cod('BV.BU_CODIGO')} AND TX.ID_SECAO = BV.ID_SECAO)
  AND ${podeGerir("'{{codFilial}}'", "'{{codepto}}'")}
  AND '{{agora}}' <> ''
  AND ${SEM_BLOQUEIO}`,
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
    const agenda = definition.cronExpression
      ? { cronExpression: definition.cronExpression, cronInputJson: JSON.stringify(definition.cronInputJson ?? {}) }
      : {};
    const existente = porNome.get(definition.name);
    if (existente) {
      const id = functionId(existente);
      await updateServerFunctionMitra({ projectId, serverFunctionId: id, code: definition.code, description: definition.description, ...agenda });
      console.log(`  atualizada  ${definition.name} (${id})`);
      continue;
    }
    const criada = await createServerFunctionMitra({
      projectId, name: definition.name, type: definition.type, code: definition.code, description: definition.description, ...agenda,
    });
    console.log(`  criada      ${definition.name} (${functionId(criada)})`);
  }
}

if (isEntrypoint()) {
  if (!projectId) throw new Error('MITRA_PROJECT_ID ausente no .env');
  console.log(`Publicando ${definitions.length} server functions (spec 002)...`);
  await upsert();
  console.log('\nPronto. Agora: node add-000-perfil-acesso.mjs && npm run sync:function-map');
}
