// Fragmentos SQL do Analytics (spec 007). Fonte: IMP_VENDAS_* e
// IMP_DEVOLUCOES_TOTVS, atribuidas pela mesma regra da 006 (contaNoEscopo).
//
// Recorte de toda SF de bloco: escopo da 002 (modo, coordenador, vendedor,
// filial, depto, secao, hoje) + de, ate ('AAAA-MM-DD'), ramos ('|A|B|'),
// clientes (',1,2,'), produtos (',1,2,'); vazio = sem filtro.

import { ESCOPO_SQL, carteiraVisivel, escopoAlvo, cod, dia, ramoDe } from './002-carteira.mjs';
import { hojeDoPeriodo, contaNoEscopo } from './006-semanal.mjs';

// Escopo da SF: o substituto ve o titular quando as ferias cruzam o periodo.
export const P = { ...ESCOPO_SQL, hoje: hojeDoPeriodo("'{{de}}'", "'{{ate}}'") };

const naLista = (param, sep, expr) => `('{{${param}}}' = '' OR INSTR('{{${param}}}', CONCAT('${sep}', ${expr}, '${sep}')) > 0)`;

export const filtroRamo = (cliente) => naLista('ramos', '|', ramoDe(cliente));
export const filtroCliente = (cliente) => naLista('clientes', ',', `CAST(${cliente} AS CHAR)`);
export const filtroProduto = (produto) => naLista('produtos', ',', `CAST(${produto} AS CHAR)`);

/**
 * Linhas de venda ('V') e devolucao ('D', pela data da devolucao) do recorte
 * entre `de` e `ate` (expressoes): CODCLI, CODFILIAL, CODEPTO, CODSEC, DIA,
 * NUMPED, CODPROD, PRODUTO, CODFORNEC, DEPARTAMENTO, SECAO, RAMO_CLIENTE,
 * DATA_VENDA, BRUTO, DEVOLVIDO, LIQUIDO (sem truncar em zero, RN-003), QT, RAMO.
 */
export const linhas = (de = "'{{de}}'", ate = "'{{ate}}'") => `SELECT L.*, ${ramoDe('L.CODCLI')} AS RAMO
  FROM (
    SELECT 'V' AS TIPO, S.CODCLI, S.CODFILIAL, S.CODEPTO, S.CODSEC, ${dia('S.DTSAIDA')} AS DIA, S.NUMPED, S.CODPROD,
      S.DESCRICAO AS PRODUTO, S.CODFORNEC, S.DEPARTAMENTO, S.SECAO, S.RAMO_CLIENTE, NULL AS DATA_VENDA,
      COALESCE(S.TOTAL, 0) AS BRUTO, 0 AS DEVOLVIDO, COALESCE(S.TOTAL, 0) AS LIQUIDO, COALESCE(S.QT, 0) AS QT
    FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA S
    WHERE ${dia('S.DTSAIDA')} >= ${de} AND ${dia('S.DTSAIDA')} <= ${ate}
    UNION ALL
    SELECT 'D', D.CODCLI, D.CODFILIAL, D.CODEPTO, D.CODSEC, ${dia('D.DATA_DEVOLUCAO')}, D.NUMPED, D.CODPROD,
      D.DESCRICAO, NULL, D.DEPARTAMENTO, D.SECAO, D.RAMO_CLIENTE, ${dia('D.DATA_VENDA')},
      0, COALESCE(D.VALOR_DEVOLVIDO, 0), -COALESCE(D.VALOR_DEVOLVIDO, 0), -COALESCE(D.QT_DEVOLVIDA, 0)
    FROM IMP_DEVOLUCOES_TOTVS D
    WHERE ${dia('D.DATA_DEVOLUCAO')} >= ${de} AND ${dia('D.DATA_DEVOLUCAO')} <= ${ate}
  ) L
  WHERE L.CODCLI IN (SELECT CV_L.ID_CLIENTE FROM (${carteiraVisivel(P)}) CV_L)
    AND ${filtroCliente('L.CODCLI')}
    AND ${filtroProduto('L.CODPROD')}
    AND ${filtroRamo('L.CODCLI')}
    AND ${contaNoEscopo('L', P)}`;

// 'AAAA-MM' de um parametro de data como numero AAAAMM.
const anoMes = (param) => `CAST(REPLACE(SUBSTRING('{{${param}}}', 1, 7), '-', '') AS UNSIGNED)`;

// RN-004: soma das metas distribuidas (METAS_BU_VENDEDOR, RNT-009) dos meses que
// o periodo toca, nas linhas de escopo proprias (nao herdadas) do recorte.
export const filtroMetaEscopo = (m) => `(${m}.ANO * 100 + ${m}.MES) >= ${anoMes('de')}
    AND (${m}.ANO * 100 + ${m}.MES) <= ${anoMes('ate')}
    AND EXISTS (
      SELECT 1 FROM (${escopoAlvo(P)}) A_M
      WHERE A_M.COBERTURA = 0 AND A_M.VENDEDOR_ID = ${m}.VENDEDOR_ID
        AND ${cod('A_M.CODFILIAL')} = ${cod(`${m}.CODFILIAL`)}
        AND ${cod('A_M.CODEPTO')} = ${cod(`${m}.CODEPTO`)})`;

// Vendedores do escopo (linhas proprias) para visitas.
export const vendedoresDoEscopo = `SELECT DISTINCT A_V2.VENDEDOR_ID FROM (${escopoAlvo(P)}) A_V2 WHERE A_V2.COBERTURA = 0`;
