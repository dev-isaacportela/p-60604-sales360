// Fragmentos SQL do acompanhamento semanal (spec 006), reusados pela 007.
//
// A regra de quem conta a venda e a da 002 (escopoAlvo + vendaDoVendedor);
// aqui so a costura: a linha herdada de ferias (COBERTURA = 1) conta para quem
// esta olhando (:VAR_USER), e so na data coberta (C-007 da 006).
// Parametros sao EXPRESSOES SQL, como na 002.

import { escopoAlvo, vendaDoVendedor, cod, dia } from './002-carteira.mjs';

/**
 * `hoje` do escopo que faz o substituto ver os clientes do titular quando as
 * ferias CRUZAM [ini, fim] (RN-001 da 006), nao so quando estao ativas hoje: a
 * data do periodo mais proxima do inicio das ferias.
 * ponytail: depende de `p.hoje` so ser usado em titularesCobertos (alias F_F)
 * dentro de escopoAlvo; se a 002 mudar isso, troque por fragmento proprio.
 */
export const hojeDoPeriodo = (ini, fim) => {
  const inicio = dia('F_F.DT_INICIO');
  return `(CASE WHEN ${inicio} < ${ini} THEN ${ini} WHEN ${inicio} > ${fim} THEN ${fim} ELSE ${inicio} END)`;
};

/**
 * A linha `s` (CODCLI, CODFILIAL, CODEPTO, CODSEC, DIA) conta para o escopo
 * `p`: casa filial + departamento (+ secao quando a linha de escopo tem) de
 * alguma linha de escopoAlvo, e conta para o vendedor dessa linha pela RNT-007
 * na data da venda. Cada venda conta uma vez (EXISTS, RN-002).
 */
export const contaNoEscopo = (s, p) => `EXISTS (
      SELECT 1 FROM (${escopoAlvo(p)}) A_N
      WHERE ${cod(`${s}.CODFILIAL`)} = ${cod('A_N.CODFILIAL')}
        AND ${cod(`${s}.CODEPTO`)} = ${cod('A_N.CODEPTO')}
        AND (A_N.ID_SECAO IS NULL OR ${cod(`${s}.CODSEC`)} = A_N.ID_SECAO)
        AND ${vendaDoVendedor(s, 'CASE WHEN A_N.COBERTURA = 1 THEN :VAR_USER ELSE A_N.VENDEDOR_ID END', `${s}.DIA`)})`;

// Itens validos e ativos da carga (RN-013/014) no formato de linha de venda.
export const vendasDaCarga = (ini, fim) => `SELECT 'V' AS TIPO, R.CLIENTE_ID AS CODCLI, R.CODFILIAL, R.CODEPTO,
    R.ID_SECAO AS CODSEC, R.DATA_SAIDA AS DIA, R.NUMPED, R.CODPROD, R.DESCRICAO AS PRODUTO, R.QT, R.TOTAL AS VALOR
  FROM PEDIDOS_SEMANAIS_SYNC_RAW R
  WHERE R.ATIVO = 1 AND R.STATUS_INGESTAO = 'ATIVO'
    AND R.DATA_SAIDA >= ${ini} AND R.DATA_SAIDA <= ${fim}`;

// Devolucao pela data da devolucao; sem secao informada nao entra (RN-003).
export const devolucoesDoPeriodo = (ini, fim) => `SELECT 'D' AS TIPO, D.CODCLI, D.CODFILIAL, D.CODEPTO, D.CODSEC,
    ${dia('D.DATA_DEVOLUCAO')} AS DIA, D.NUMPED, D.CODPROD, D.DESCRICAO AS PRODUTO,
    -COALESCE(D.QT_DEVOLVIDA, 0) AS QT, -COALESCE(D.VALOR_DEVOLVIDO, 0) AS VALOR
  FROM IMP_DEVOLUCOES_TOTVS D
  WHERE TRIM(COALESCE(CAST(D.CODSEC AS CHAR), '')) <> ''
    AND ${dia('D.DATA_DEVOLUCAO')} >= ${ini} AND ${dia('D.DATA_DEVOLUCAO')} <= ${fim}`;

/* ─────────────── SF JAVASCRIPT ─────────────── */

// Corpo de funcao (texto) sem a assinatura.
export function source(fn) {
  const texto = fn.toString();
  return texto.slice(texto.indexOf('{') + 1, texto.lastIndexOf('}')).trim();
}

// Preludio publicado (o mesmo da 002: runQueryMitra nao liga {{x}}, o valor
// vai escapado no texto pelos marcadores @@x@@).
export function preludio() {
  const sdk = require('mitra-sdk');
  const projectId = Number(process.env.MITRA_PROJECT_ID || event.projectId);
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
    return linhasDe(await sdk.runQueryMitra({ projectId, sql }));
  }
  async function executar(sql) {
    const r = await sdk.runDmlMitra({ projectId, sql });
    return Number(r?.result?.rowsAffected ?? r?.result?.affectedRows ?? r?.rowsAffected ?? 0);
  }
  // Escopo da tela (os sete da 002), saneado.
  function escopoDe(e) {
    return {
      modo: ['ME', 'TEAM', 'SELLER', 'ALL', 'COORD'].includes(e.modo) ? e.modo : 'ME',
      coordenador: digitos(e.coordenador), vendedor: digitos(e.vendedor),
      filial: digitos(e.filial), depto: digitos(e.depto), secao: digitos(e.secao),
    };
  }
}
