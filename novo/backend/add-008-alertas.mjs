// Spec 008 — alertas inteligentes, prospeccao da carteira, prospects e
// Direcionamento Semanal.
//
// NAO EXECUTE ESTE ARQUIVO DA MAQUINA LOCAL: o mitra-sdk nao gera migration;
// rodar daqui aplica em producao sem historia. So no sandbox:
//   cd novo/backend && node add-008-alertas.mjs && node add-001-acesso.mjs && node add-000-perfil-acesso.mjs
// (o add-001 leva o contador do menu corrigido, D-805 do plan).
//
// Nenhuma tabela nem coluna nova: so SFs `s360*` (upsert por nome). Escrita da
// tela so por SF SQL; as 3 rotinas agendadas e as 2 leituras com regra de
// calendario sao SF JAVASCRIPT com o texto de lib/002-regras.mjs e
// lib/008-regras.mjs (o smoke testa o mesmo codigo).
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
import { SEM_BLOQUEIO } from './lib/guardas.mjs';
import {
  cod, num, pagina, dia, nomeUsuario, nomeCliente, semAcento, ramoDe, BLOQUEADOS,
  ESCOPO_SQL, ESCOPO_MARCADO, escopoAlvo, carteiraVisivel, vendaConta, vendaDoVendedor,
} from './lib/002-carteira.mjs';
import { REGRAS } from './lib/002-regras.mjs';
import { AGORA_BR, podeOperar } from './lib/003-agenda.mjs';
import {
  TIPOS_ALERTA, alertaVisivel, podeMarcar, ESCOPO_ME, carteiraDoVendedor, podeDirecionar,
  prospectVisivel, prospectEditavel, reagendada, temRelato,
} from './lib/008-alertas.mjs';
import { REGRAS_008, CONSTANTES_008 } from './lib/008-regras.mjs';
import { source, preludio, SQL_CARTEIRA } from './add-002-carteira.mjs';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const TIPOS = Object.keys(TIPOS_ALERTA).map((t) => `'${t}'`).join(', ');
const ETAPAS_MANUAIS = `'NOVO', 'VISITA_AGENDADA', 'VISITADO', 'NEGOCIACAO', 'PERDIDO'`;
const POR_PAGINA = 50;

/* ─────────────── SF JAVASCRIPT: corpo comum ─────────────── */

const CONSTANTES = Object.entries(CONSTANTES_008).map(([k, v]) => `const ${k} = ${JSON.stringify(v)};`).join('\n');

const corpoJs = (sql, ...partes) => [
  source(preludio),
  `const SQL = ${JSON.stringify(sql)};`,
  CONSTANTES,
  REGRAS.map(String).join('\n\n'),
  REGRAS_008.map(String).join('\n\n'),
  ...partes.map(source),
].join('\n\n');

// Funcoes do corpo das rotinas (texto publicado; sem import).
function utilRotina() {
  const { runDmlMitra } = require('mitra-sdk');
  // D-808: `agora` so para teste; sem ele, relogio de Brasilia (UTC-3).
  const agoraDe = (e) => {
    const dado = String(e?.agora ?? '').replace('T', ' ').slice(0, 19);
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dado)) return dado;
    return new Date(Date.now() - 3 * 3600000).toISOString().replace('T', ' ').slice(0, 19);
  };
  const recuar = (agora, minutos) => new Date(Date.parse(`${agora.replace(' ', 'T')}Z`) - minutos * 60000).toISOString().replace('T', ' ').slice(0, 19);
  const lit = (v) => (v == null || v === '' ? 'NULL' : `'${esc(v)}'`);
  const numero = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? 'NULL' : String(Number(v)));
  async function gravar(sql) {
    const r = await runDmlMitra({ projectId, sql });
    return Number(r?.result?.rowsAffected ?? r?.rowsAffected ?? 0);
  }
}

// Escopo vindo da tela, saneado (mesmo criterio do corpoCarteira da 002).
function utilEscopo() {
  const escopoDe = (e) => ({
    modo: ['ME', 'TEAM', 'SELLER', 'ALL', 'COORD'].includes(e.modo) ? e.modo : 'ME',
    coordenador: digitos(e.coordenador), vendedor: digitos(e.vendedor),
    filial: digitos(e.filial), depto: digitos(e.depto), secao: digitos(e.secao),
  });
  const dataOk = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));
}

const corpoRotina = (sql, corpo) => corpoJs(sql, utilRotina, corpo);
const corpoTela = (sql, corpo) => corpoJs(sql, utilEscopo, corpo);

/* ─────────────── alertas: lista ─────────────── */

const ALERTAS_ESCOPO = `SELECT AL.* FROM ALERTAS_INTELIGENTES AL
  WHERE ${alertaVisivel('AL', ESCOPO_SQL)} AND ${SEM_BLOQUEIO}`;

const RAMO_ALERTA = (al) => `COALESCE(NULLIF(TRIM(${al}.RAMO_CLIENTE), ''), 'Sem ramo')`;
const ORDEM_PRIORIDADE = (al) => `CASE ${al}.PRIORIDADE WHEN 'ALTA' THEN 1 WHEN 'MEDIA' THEN 2 ELSE 3 END`;
const SO_DIGITOS = (expr) => `REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${expr}, ''), '.', ''), '/', ''), '-', ''), ' ', '')`;
const ROTULO_BU = (filial, depto) => `CONCAT(COALESCE(MAX(FI.NOME_FILIAL), CONCAT('Filial ', ${filial})), ' · ', COALESCE(MAX(BU.NOME), CONCAT('Departamento ', ${depto})))`;

// RN-010 / RNT-014: nome, fantasia, CNPJ (so digitos) ou codigo.
const BUSCA_CLIENTE = (c, al) => `('{{busca}}' = ''
      OR ${semAcento(`CONCAT(COALESCE(${c}.RAZAO_SOCIAL, ''), ' ', COALESCE(${c}.NOME_FANTASIA, ''), ' ', COALESCE(${al}.NOME_CLIENTE, ''))`)} LIKE CONCAT('%', ${semAcento("TRIM('{{busca}}')")}, '%')
      OR ('{{buscaDigitos}}' <> '' AND (${SO_DIGITOS(`${c}.CNPJ`)} LIKE CONCAT('%', '{{buscaDigitos}}', '%')
        OR CAST(${al}.ID_CLIENTE AS CHAR) = '{{buscaDigitos}}')))`;

/* ─────────────── fila de geracao (RN-016) ─────────────── */

const VENDEDOR = '@@vendedor@@';
const SQL_FILA = {
  itens: `SELECT ID, VENDEDOR_ID, CLIENTE_ID, STATUS, INICIADO_EM FROM ALERTAS_PROCESSAMENTO WHERE RUN_ID = '@@run@@' ORDER BY ID`,
  criar: `INSERT INTO ALERTAS_PROCESSAMENTO (RUN_ID, VENDEDOR_ID, STATUS, CRIADO_EM)
SELECT '@@run@@', BV.VENDEDOR_ID, 'PENDENTE', '@@agora@@'
FROM BU_VENDEDOR BV
WHERE BV.ATIVO = 1 AND BV.VENDEDOR_ID NOT IN ${BLOQUEADOS}
  AND NOT EXISTS (SELECT 1 FROM ALERTAS_PROCESSAMENTO AP WHERE AP.RUN_ID = '@@run@@')
GROUP BY BV.VENDEDOR_ID`,
  carteira: `SELECT CD.ID_CLIENTE, CD.VENDEDOR_ID, CD.CODFILIAL, CD.CODEPTO, CD.ID_SECAO,
    ${nomeCliente('C')} AS NOME, ${ramoDe('CD.ID_CLIENTE')} AS RAMO
  FROM (${carteiraDoVendedor(VENDEDOR)}) CD
  JOIN CLIENTES C ON C.ID = CD.ID_CLIENTE`,
  vendas: `SELECT CD.ID_CLIENTE, CD.CODFILIAL, CD.CODEPTO, CD.ID_SECAO, S.NUMPED, ${dia('S.DTSAIDA')} AS DIA,
    S.CODPROD, S.DESCRICAO, S.TOTAL AS VALOR
  FROM (${carteiraDoVendedor(VENDEDOR)}) CD
  JOIN IMP_VENDAS_DASHBOARD_TOTVS_RCA S ON ${vendaConta('S', 'CD')}
  WHERE ${dia('S.DTSAIDA')} >= '@@desde@@' AND ${dia('S.DTSAIDA')} <= '@@hoje@@'`,
  naoLidos: `SELECT ID_VENDEDOR, CODFILIAL, CODEPTO, ID_SECAO, ID_CLIENTE, TIPO_ALERTA, MES_REFERENCIA, PRODUTO_REFERENCIA
  FROM ALERTAS_INTELIGENTES WHERE ID_VENDEDOR = ${VENDEDOR} AND LIDO = 0`,
};

async function corpoFila() {
  const e = event || {};
  const agora = agoraDe(e);
  const hoje = agora.slice(0, 10);
  const run = `ALERTAS-${hoje}`;
  const desde = `${menosMeses(hoje, 13).slice(0, 7)}-01`;
  const criada = await gravar(preencher(SQL.criar, { run, agora }));
  const itens = await consultar(preencher(SQL.itens, { run }));
  const plano = planoFila(itens, agora, 3);
  if (plano.expirar.length) {
    await gravar(`UPDATE ALERTAS_PROCESSAMENTO SET STATUS = 'ERRO', ERRO = 'Tempo esgotado: mais de 20 minutos processando.', FINALIZADO_EM = '${agora}'
      WHERE ID IN (${plano.expirar.map(Number).join(', ')}) AND STATUS = 'PROCESSANDO'`);
  }
  const processados = [];
  for (const item of plano.processar) {
    const id = Number(item.ID);
    const reservado = await gravar(`UPDATE ALERTAS_PROCESSAMENTO SET STATUS = 'PROCESSANDO', INICIADO_EM = '${agora}' WHERE ID = ${id} AND STATUS = 'PENDENTE'`);
    if (!reservado) continue;
    const vendedor = Number(item.VENDEDOR_ID);
    const cliente = item.CLIENTE_ID == null ? null : Number(item.CLIENTE_ID);
    const inicio = Date.now();
    let carteira = [];
    try {
      carteira = await consultar(preencher(SQL.carteira, { vendedor }));
      const vendas = await consultar(preencher(SQL.vendas, { vendedor, desde, hoje }));
      const naoLidos = await consultar(preencher(SQL.naoLidos, { vendedor }));
      const novos = semDuplicados(gerarAlertas({ carteira, vendas, hoje, clienteId: cliente }), naoLidos);
      for (let i = 0; i < novos.length; i += 200) {
        const valores = novos.slice(i, i + 200).map((a) => `(${numero(a.VENDEDOR_ID)}, ${numero(a.CODFILIAL)}, ${lit(a.ID_SECAO == null ? null : String(a.ID_SECAO))}, ${numero(a.ID_CLIENTE)}, ${lit(String(a.NOME_CLIENTE ?? '').slice(0, 200))}, ${lit(a.TIPO)}, ${lit(String(a.TITULO).slice(0, 200))}, ${lit(a.DESCRICAO)}, ${numero(a.VALOR)}, ${lit(a.PRIORIDADE)}, 0, '${agora}', ${lit(a.MES_REFERENCIA)}, ${lit(a.PRODUTO == null ? null : String(a.PRODUTO).slice(0, 200))}, ${lit(a.CODEPTO)}, ${lit(a.RAMO)})`);
        await gravar(`INSERT INTO ALERTAS_INTELIGENTES (ID_VENDEDOR, CODFILIAL, ID_SECAO, ID_CLIENTE, NOME_CLIENTE, TIPO_ALERTA, TITULO, DESCRICAO,
          VALOR_REFERENCIA, PRIORIDADE, LIDO, DATA_GERACAO, MES_REFERENCIA, PRODUTO_REFERENCIA, CODEPTO, RAMO_CLIENTE) VALUES ${valores.join(', ')}`);
      }
      await gravar(`UPDATE ALERTAS_PROCESSAMENTO SET STATUS = 'CONCLUIDO', FINALIZADO_EM = '${agora}', DURACAO_MS = ${Date.now() - inicio},
        TOTAL_ALERTAS_ATIVOS = ${novos.length} WHERE ID = ${id}`);
      processados.push({ id, vendedor, cliente, criados: novos.length });
    } catch (falha) {
      const erro = esc(String(falha?.message ?? falha).slice(0, 900));
      // RN-016: vendedor que falhou inteiro vira um item por cliente; item de cliente que falha fica como erro.
      const itensCliente = cliente == null ? itensPorCliente(vendedor, carteira) : [];
      if (itensCliente.length) {
        await gravar(`INSERT INTO ALERTAS_PROCESSAMENTO (RUN_ID, VENDEDOR_ID, CLIENTE_ID, STATUS, CRIADO_EM) VALUES
          ${itensCliente.map((x) => `('${esc(run)}', ${x.VENDEDOR_ID}, ${x.CLIENTE_ID}, 'PENDENTE', '${agora}')`).join(', ')}`);
      }
      await gravar(`UPDATE ALERTAS_PROCESSAMENTO SET STATUS = '${itensCliente.length ? 'DIVIDIDO' : 'ERRO'}', ERRO = '${erro}', FINALIZADO_EM = '${agora}' WHERE ID = ${id}`);
      processados.push({ id, vendedor, cliente, erro: String(falha?.message ?? falha), itens: itensCliente.length });
    }
  }
  // RN-008: alertas com mais de 60 dias sao apagados.
  const apagados = await gravar(`DELETE FROM ALERTAS_INTELIGENTES WHERE DATA_GERACAO < '${recuar(agora, 60 * 24 * 60)}'`);
  return { ok: true, run, criada: criada > 0, expirados: plano.expirar.length, processados, apagados };
}

/* ─────────────── e-mails semanais (RN-017, RN-018) ─────────────── */

const SQL_RESUMO = {
  vendedores: `SELECT A.ID_VENDEDOR, U.DESCR AS EMAIL, ${nomeUsuario('U')} AS NOME, COUNT(*) AS N
  FROM ALERTAS_INTELIGENTES A
  JOIN INT_USER U ON U.ID = A.ID_VENDEDOR
  WHERE A.DATA_GERACAO >= '@@desde@@' AND A.DATA_GERACAO < '@@agora@@'
    AND NOT EXISTS (SELECT 1 FROM ALERTAS_EMAIL_SEMANAL E
      WHERE E.ID_VENDEDOR = A.ID_VENDEDOR AND E.SEMANA_REFERENCIA = '@@semana@@' AND E.STATUS = 'ENVIADO')
  GROUP BY A.ID_VENDEDOR, U.DESCR, U.NOME
  ORDER BY A.ID_VENDEDOR`,
  avisos: `SELECT ID, NOME_CLIENTE, TITULO, PRIORIDADE, VALOR_REFERENCIA, DATA_GERACAO
  FROM ALERTAS_INTELIGENTES
  WHERE ID_VENDEDOR = @@vendedor@@ AND DATA_GERACAO >= '@@desde@@' AND DATA_GERACAO < '@@agora@@'`,
};

async function corpoResumo() {
  const { sendEmailMitra } = require('mitra-sdk');
  const e = event || {};
  const agora = agoraDe(e);
  const semana = agora.slice(0, 10);
  const desde = recuar(agora, 7 * 24 * 60);
  const vendedores = await consultar(preencher(SQL.vendedores, { desde, agora, semana }));
  const enviados = [];
  for (const v of vendedores) {
    const vendedor = Number(v.ID_VENDEDOR);
    const avisos = await consultar(preencher(SQL.avisos, { vendedor, desde, agora }));
    const resumo = linhasResumo(avisos);
    let status = 'ENVIADO';
    let erro = null;
    try {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v.EMAIL ?? ''))) throw new Error('E-mail de acesso inválido.');
      await sendEmailMitra({ projectId, to: [String(v.EMAIL)], subject: 'Resumo semanal de avisos comerciais', body: htmlResumo(v.NOME, resumo, avisos.length) });
    } catch (falha) {
      status = 'ERRO';
      erro = String(falha?.message ?? falha).slice(0, 2000);
    }
    // RNF-002: um registro por vendedor e semana; ERRO e refeito na proxima execucao.
    await gravar(`DELETE FROM ALERTAS_EMAIL_SEMANAL WHERE ID_VENDEDOR = ${vendedor} AND SEMANA_REFERENCIA = '${semana}'`);
    await gravar(`INSERT INTO ALERTAS_EMAIL_SEMANAL (ID_VENDEDOR, EMAIL_DESTINO, SEMANA_REFERENCIA, TOTAL_ALERTAS, ENVIADO_EM, STATUS, ERRO)
      VALUES (${vendedor}, ${lit(String(v.EMAIL ?? '').slice(0, 200) || '-')}, '${semana}', ${avisos.length}, ${status === 'ENVIADO' ? `'${agora}'` : 'NULL'}, '${status}', ${lit(erro)})`);
    enviados.push({ vendedor, status, linhas: resumo.linhas.length, total: avisos.length, nota: resumo.nota, erro });
  }
  return { ok: true, semana, enviados };
}

// Vendedores da equipe de um coordenador (RNT-004) e itens de venda/devolucao
// atribuidos a eles (RNT-007), so nas BUs do coordenador.
const EQUIPE_COORD = `(SELECT DISTINCT BV.VENDEDOR_ID FROM BU_VENDEDOR BV
    JOIN COORDENADORES_BU CB ON ${cod('CB.CODFILIAL')} = ${cod('BV.CODFILIAL')} AND ${cod('CB.CODEPTO')} = ${cod('BV.BU_CODIGO')}
    WHERE CB.COD_SUPERVISOR = @@sup@@ AND BV.ATIVO = 1
      AND EXISTS (SELECT 1 FROM VENDEDOR_RCA VR WHERE VR.USER_ID = BV.VENDEDOR_ID))`;
const NA_BU_COORD = (s) => `EXISTS (SELECT 1 FROM COORDENADORES_BU CB2 WHERE CB2.COD_SUPERVISOR = @@sup@@
      AND ${cod('CB2.CODFILIAL')} = ${cod(`${s}.CODFILIAL`)} AND ${cod('CB2.CODEPTO')} = ${cod(`${s}.CODEPTO`)})`;
const itensCoord = (tabela, data, valor) => `SELECT L.AUTO_ID AS LINHA_ID, T.VENDEDOR_ID, ${nomeUsuario('U')} AS VENDEDOR, L.CODCLI,
    COALESCE(${nomeCliente('C')}, L.CLIENTE) AS CLIENTE,
    CONCAT(COALESCE(FI.NOME_FILIAL, CONCAT('Filial ', L.CODFILIAL)), ' · ', COALESCE(BU.NOME, CONCAT('Departamento ', L.CODEPTO))) AS BU,
    ${dia(`L.${data}`)} AS DIA, L.NUMPED, CONCAT(L.CODPROD, ' - ', COALESCE(L.DESCRICAO, '')) AS PRODUTO, L.${valor} AS VALOR
  FROM ${tabela} L
  JOIN ${EQUIPE_COORD} T ON 1 = 1
  JOIN INT_USER U ON U.ID = T.VENDEDOR_ID
  LEFT JOIN CLIENTES C ON C.ID = L.CODCLI
  LEFT JOIN FILIAL FI ON ${cod('FI.CODFILIAL')} = ${cod('L.CODFILIAL')}
  LEFT JOIN BU ON ${cod('BU.CODIGO')} = ${cod('L.CODEPTO')}
  WHERE ${dia(`L.${data}`)} >= '@@ini@@' AND ${dia(`L.${data}`)} <= '@@fim@@'
    AND ${NA_BU_COORD('L')}
    AND ${vendaDoVendedor('L', 'T.VENDEDOR_ID', dia(`L.${data}`))}`;

const SQL_RELATORIO = {
  coordenadores: `SELECT C.COD_SUPERVISOR, C.NOME, TRIM(C.EMAIL) AS EMAIL
  FROM COORDENADORES C
  WHERE C.ATIVO = 1 AND TRIM(COALESCE(C.EMAIL, '')) <> ''
    AND NOT EXISTS (SELECT 1 FROM RELATORIO_SEMANAL_COORDENADORES_LOG R
      WHERE R.COD_SUPERVISOR = C.COD_SUPERVISOR AND R.SEMANA_REFERENCIA = '@@semana@@' AND R.STATUS = 'ENVIADO')
  ORDER BY C.COD_SUPERVISOR`,
  vendas: itensCoord('IMP_VENDAS_DASHBOARD_TOTVS_RCA', 'DTSAIDA', 'TOTAL'),
  devolucoes: itensCoord('IMP_DEVOLUCOES_TOTVS', 'DATA_DEVOLUCAO', 'VALOR_DEVOLVIDO'),
  metas: `SELECT M.VENDEDOR_ID, SUM(M.META_VALOR) AS META
  FROM METAS_BU_VENDEDOR M
  WHERE M.ANO = @@ano@@ AND M.MES = @@mes@@
    AND M.VENDEDOR_ID IN ${EQUIPE_COORD}
    AND EXISTS (SELECT 1 FROM COORDENADORES_BU CB3 WHERE CB3.COD_SUPERVISOR = @@sup@@
      AND ${cod('CB3.CODFILIAL')} = ${cod('M.CODFILIAL')} AND ${cod('CB3.CODEPTO')} = ${cod('M.CODEPTO')})
  GROUP BY M.VENDEDOR_ID`,
};

async function corpoRelatorio() {
  const { sendEmailMitra } = require('mitra-sdk');
  const e = event || {};
  const agora = agoraDe(e);
  const periodo = periodoRelatorio(agora.slice(0, 10));
  const semana = `${periodo.inicio}_${periodo.fim}`;
  const [ano, mes] = periodo.inicio.split('-').map(Number);
  const coordenadores = await consultar(preencher(SQL.coordenadores, { semana }));
  const enviados = [];
  for (const c of coordenadores) {
    const sup = Number(c.COD_SUPERVISOR);
    const valores = { sup, ini: periodo.inicio, fim: periodo.fim, ano, mes };
    let status = 'ENVIADO';
    let erro = null;
    let r = null;
    try {
      const [vendas, devolucoes, metas] = await Promise.all(['vendas', 'devolucoes', 'metas'].map((k) => consultar(preencher(SQL[k], valores))));
      r = montarRelatorio({ vendas, devolucoes, metas, periodo });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c.EMAIL ?? ''))) throw new Error('E-mail do coordenador inválido.');
      await sendEmailMitra({ projectId, to: [String(c.EMAIL)], subject: assuntoRelatorio(periodo), body: htmlRelatorio(c.NOME, r) });
    } catch (falha) {
      status = 'ERRO';
      erro = String(falha?.message ?? falha).slice(0, 2000);
    }
    await gravar(`DELETE FROM RELATORIO_SEMANAL_COORDENADORES_LOG WHERE COD_SUPERVISOR = ${sup} AND SEMANA_REFERENCIA = '${semana}'`);
    await gravar(`INSERT INTO RELATORIO_SEMANAL_COORDENADORES_LOG (COD_SUPERVISOR, EMAIL_DESTINO, SEMANA_REFERENCIA, DATA_INICIO, DATA_FIM,
      FATURAMENTO_LIQUIDO, TOTAL_PEDIDOS, ENVIADO_EM, STATUS, ERRO)
      VALUES (${sup}, ${lit(String(c.EMAIL).slice(0, 200))}, '${semana}', '${periodo.inicio}', '${periodo.fim}',
        ${numero(r?.liquido ?? 0)}, ${numero(r?.pedidos ?? 0)}, ${status === 'ENVIADO' ? `'${agora}'` : 'NULL'}, '${status}', ${lit(erro)})`);
    enviados.push({ sup, status, erro, relatorio: r });
  }
  return { ok: true, periodo, enviados };
}

/* ─────────────── prospeccao da carteira (RN-020) ─────────────── */

const CART = carteiraVisivel(ESCOPO_MARCADO);

const SQL_PROSPECCAO = {
  ...SQL_CARTEIRA,
  compras: `SELECT S.CODCLI, ${dia('S.DTSAIDA')} AS DIA
  FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA S
  WHERE S.CODCLI IN (SELECT CV0.ID_CLIENTE FROM (${CART}) CV0)
    AND EXISTS (SELECT 1 FROM (${CART}) CV1 WHERE ${vendaConta('S', 'CV1')})
    AND ${dia('S.DTSAIDA')} >= '@@d6m@@' AND ${dia('S.DTSAIDA')} <= '@@hoje@@'
  GROUP BY S.CODCLI, ${dia('S.DTSAIDA')}`,
};

async function corpoProspeccao() {
  const e = event || {};
  if (!dataOk(e.hoje)) return { ok: false, error: 'Data de referência inválida.' };
  const hoje = String(e.hoje);
  const valores = { ...escopoDe(e), ...janelas(hoje), d6m: menosMeses(hoje, 6) };
  const [clientes, vendas, visitas, compras] = await Promise.all(
    ['clientes', 'vendas', 'visitas', 'compras'].map((k) => consultar(preencher(SQL[k], valores))),
  );
  return montarProspeccao({
    clientes, vendas, visitas, compras, hoje,
    filtros: { tendencia: ['ALTA', 'MEDIA', 'BAIXA', 'INATIVO'].includes(e.tendencia) ? e.tendencia : '', busca: String(e.busca ?? '').slice(0, 120), pagina: e.pagina },
  });
}

/* ─────────────── clientes criticos sem compra (RN-027) ─────────────── */

const SQL_CRITICOS = {
  permissao: `SELECT CASE WHEN ${podeDirecionar} THEN 1 ELSE 0 END AS OK FROM INT_USER U0 WHERE U0.ID = :VAR_USER`,
  carteira: `SELECT CV.VENDEDOR_ID, ${nomeUsuario('U')} AS EXECUTIVO, CV.ID_CLIENTE, ${nomeCliente('C')} AS NOME, MAX(CV.CURVA) AS CURVA_MANUAL
  FROM (${CART}) CV
  JOIN CLIENTES C ON C.ID = CV.ID_CLIENTE
  JOIN INT_USER U ON U.ID = CV.VENDEDOR_ID
  WHERE CV.COBERTURA = 0
  GROUP BY CV.VENDEDOR_ID, U.NOME, U.DESCR, CV.ID_CLIENTE, C.NOME_FANTASIA, C.RAZAO_SOCIAL`,
  vendas: `SELECT X.VENDEDOR_ID, X.CODCLI, X.DIA, SUM(X.V) AS V, SUM(X.D) AS D
  FROM (
    SELECT DISTINCT CV.VENDEDOR_ID, L.TIPO, L.AUTO_ID, L.CODCLI, L.DIA, L.V, L.D
    FROM (${CART}) CV
    JOIN (
      SELECT 'V' AS TIPO, S.AUTO_ID, S.CODCLI, S.CODFILIAL, S.CODEPTO, S.CODSEC, ${dia('S.DTSAIDA')} AS DIA, S.TOTAL AS V, 0 AS D
      FROM IMP_VENDAS_DASHBOARD_TOTVS_RCA S
      WHERE ${dia('S.DTSAIDA')} >= '@@ini@@' AND ${dia('S.DTSAIDA')} <= '@@fim@@'
      UNION ALL
      SELECT 'D', DV.AUTO_ID, DV.CODCLI, DV.CODFILIAL, DV.CODEPTO, DV.CODSEC, ${dia('DV.DATA_DEVOLUCAO')}, 0, DV.VALOR_DEVOLVIDO
      FROM IMP_DEVOLUCOES_TOTVS DV
      WHERE ${dia('DV.DATA_DEVOLUCAO')} >= '@@ini@@' AND ${dia('DV.DATA_DEVOLUCAO')} <= '@@fim@@'
    ) L ON ${vendaConta('L', 'CV')}
    WHERE CV.COBERTURA = 0
  ) X
  GROUP BY X.VENDEDOR_ID, X.CODCLI, X.DIA`,
  visitas: `SELECT V.VENDEDOR_ID, V.CLIENTE_ID, MAX(V.DATA_AGENDADA) AS ULTIMA,
    SUM(CASE WHEN V.DATA_AGENDADA >= '@@d60@@' THEN 1 ELSE 0 END) AS N60
  FROM VISITAS V
  WHERE V.STATUS = 'CONCLUIDA' AND V.DATA_AGENDADA <= '@@hoje@@'
    AND EXISTS (SELECT 1 FROM (${CART}) CV WHERE CV.ID_CLIENTE = V.CLIENTE_ID AND CV.VENDEDOR_ID = V.VENDEDOR_ID)
  GROUP BY V.VENDEDOR_ID, V.CLIENTE_ID`,
};

async function corpoCriticos() {
  const e = event || {};
  if (!dataOk(e.hoje) || !dataOk(e.semana)) return { ok: false, error: 'Data de referência inválida.', executivos: [] };
  const [permissao] = await consultar(SQL.permissao);
  if (Number(permissao?.OK) !== 1) return { ok: false, error: 'sem permissão', executivos: [] };
  const hoje = String(e.hoje);
  const semana = String(e.semana);
  const fim = [hoje, somarDias(semana, 6)].sort().pop();
  const valores = { ...escopoDe(e), hoje, d60: somarDias(hoje, -59), ini: [somarDias(semana, -180), somarDias(hoje, -89)].sort()[0], fim };
  const [carteira, vendas, visitas] = await Promise.all(['carteira', 'vendas', 'visitas'].map((k) => consultar(preencher(SQL[k], valores))));
  return montarCriticos({ carteira, vendas, visitas, semana, hoje });
}

/* ─────────────── direcionamento: agenda e carteira sem visita ─────────────── */

// Segunda a sexta da semana pedida (RNT-006).
const NA_SEMANA = (col) => `${col} >= '{{semana}}' AND DATEDIFF(${col}, '{{semana}}') <= 4`;
const EXECUTIVOS = `SELECT DISTINCT E0.VENDEDOR_ID FROM (${escopoAlvo(ESCOPO_SQL)}) E0 WHERE E0.COBERTURA = 0`;
const VENCIDA = (k) => `${k}.STATUS IN ('AGENDADA', 'EM_ANDAMENTO') AND ${k}.DATA < '{{hoje}}'`;

/* ─────────────── definitions ─────────────── */

export const definitions = [
  /* ── aba Alertas ── */
  {
    name: 's360AlertasPainel',
    type: 'SQL',
    description: 'Painel da aba Alertas (RN-010/012, RF-006): RESUMO (PENDENTES, MARCAVEIS), RAMO (ramos dos alertas do escopo) e PRODUTO (Produto Perdido + Nao Explorado nao lidos por produto: N, POTENCIAL). Params: escopo (modo, coordenador, vendedor, filial, depto, secao, hoje).',
    code: `WITH V AS (${ALERTAS_ESCOPO})
SELECT 'RESUMO' AS TIPO_LINHA, '' AS RAMO, '' AS PRODUTO,
  COALESCE(SUM(CASE WHEN V.LIDO = 0 THEN 1 ELSE 0 END), 0) AS PENDENTES,
  COALESCE(SUM(CASE WHEN V.LIDO = 0 AND ${podeMarcar('V')} THEN 1 ELSE 0 END), 0) AS MARCAVEIS,
  0 AS N, 0 AS POTENCIAL
FROM V
UNION ALL
SELECT 'RAMO', ${RAMO_ALERTA('V')}, '', 0, 0, COUNT(*), 0
FROM V
GROUP BY ${RAMO_ALERTA('V')}
UNION ALL
SELECT 'PRODUTO', '', V.PRODUTO_REFERENCIA, 0, 0, COUNT(*), SUM(COALESCE(V.VALOR_REFERENCIA, 0))
FROM V
WHERE V.LIDO = 0 AND V.TIPO_ALERTA IN ('PRODUTO_PERDIDO', 'NAO_EXPLORADO') AND TRIM(COALESCE(V.PRODUTO_REFERENCIA, '')) <> ''
GROUP BY V.PRODUTO_REFERENCIA`,
  },
  {
    // D-802: filtros sobre o escopo inteiro e totais na mesma consulta.
    name: 's360AlertasListar',
    type: 'SQL',
    description: `Alertas do escopo, ${POR_PAGINA} por pagina, agrupaveis por cliente (RF-002/003, RN-009/010/012). TOTAL e POTENCIAL do filtro inteiro em toda linha. Params: escopo + busca, buscaDigitos, ramo, tipo, valorMin (numero com ponto), situacao (NAO_LIDOS padrao | LIDOS | TODOS), clienteId, produto, pagina.`,
    code: `WITH V AS (
  SELECT AL.ID, AL.ID_VENDEDOR, AL.CODFILIAL, AL.CODEPTO, AL.ID_SECAO, AL.ID_CLIENTE, AL.TIPO_ALERTA, AL.TITULO, AL.DESCRICAO,
    COALESCE(AL.VALOR_REFERENCIA, 0) AS VALOR, AL.PRIORIDADE, AL.LIDO, AL.DATA_GERACAO, AL.DATA_LEITURA, AL.MES_REFERENCIA,
    AL.PRODUTO_REFERENCIA, ${RAMO_ALERTA('AL')} AS RAMO,
    COALESCE(${nomeCliente('C')}, AL.NOME_CLIENTE) AS CLIENTE, C.RAZAO_SOCIAL, C.CNPJ,
    CASE WHEN ${podeMarcar('AL')} THEN 1 ELSE 0 END AS PODE_MARCAR,
    ${ORDEM_PRIORIDADE('AL')} AS ORDEM_PRIORIDADE
  FROM ALERTAS_INTELIGENTES AL
  LEFT JOIN CLIENTES C ON C.ID = AL.ID_CLIENTE
  WHERE ${alertaVisivel('AL', ESCOPO_SQL)} AND ${SEM_BLOQUEIO}
    AND ((('{{situacao}}' = '' OR '{{situacao}}' = 'NAO_LIDOS') AND AL.LIDO = 0)
      OR ('{{situacao}}' = 'LIDOS' AND AL.LIDO = 1) OR '{{situacao}}' = 'TODOS')
    AND ('{{tipo}}' = '' OR AL.TIPO_ALERTA = '{{tipo}}')
    AND ('{{ramo}}' = '' OR ${RAMO_ALERTA('AL')} = '{{ramo}}')
    AND ('{{valorMin}}' = '' OR COALESCE(AL.VALOR_REFERENCIA, 0) >= CAST(NULLIF(TRIM('{{valorMin}}'), '') AS DECIMAL(15,2)))
    AND ('{{clienteId}}' = '' OR AL.ID_CLIENTE = ${num('clienteId')})
    AND ('{{produto}}' = '' OR AL.PRODUTO_REFERENCIA = '{{produto}}')
    AND ${BUSCA_CLIENTE('C', 'AL')}
),
T AS (
  SELECT V.*, COUNT(*) OVER () AS TOTAL, SUM(V.VALOR) OVER () AS POTENCIAL,
    COUNT(*) OVER (PARTITION BY V.ID_CLIENTE) AS N_CLIENTE, SUM(V.VALOR) OVER (PARTITION BY V.ID_CLIENTE) AS POTENCIAL_CLIENTE
  FROM V
),
O AS (
  SELECT T.*, ROW_NUMBER() OVER (ORDER BY T.POTENCIAL_CLIENTE DESC, T.ID_CLIENTE, T.VALOR DESC, T.ORDEM_PRIORIDADE, T.ID) AS RN
  FROM T
)
SELECT O.*, ${nomeUsuario('U')} AS VENDEDOR,
  CONCAT(COALESCE(FI.NOME_FILIAL, CONCAT('Filial ', O.CODFILIAL)), ' · ', COALESCE(BU.NOME, CONCAT('Departamento ', O.CODEPTO))) AS ESCOPO
FROM O
LEFT JOIN INT_USER U ON U.ID = O.ID_VENDEDOR
LEFT JOIN FILIAL FI ON ${cod('FI.CODFILIAL')} = ${cod('O.CODFILIAL')}
LEFT JOIN BU ON ${cod('BU.CODIGO')} = ${cod('O.CODEPTO')}
WHERE O.RN > (${pagina()} - 1) * ${POR_PAGINA} AND O.RN <= ${pagina()} * ${POR_PAGINA}
ORDER BY O.RN`,
  },
  {
    name: 's360AlertaMarcarLido',
    type: 'SQL',
    description: 'Marca um alerta como lido (RF-004, RN-011): so nao lido, visivel em Meu painel e do proprio usuario ou de titular com ferias ATIVAS (relogio do servidor). Params: id. Devolve affectedRows.',
    code: `UPDATE ALERTAS_INTELIGENTES
SET LIDO = 1, DATA_LEITURA = ${AGORA_BR}
WHERE ALERTAS_INTELIGENTES.ID = ${num('id')}
  AND ALERTAS_INTELIGENTES.LIDO = 0
  AND ${podeMarcar('ALERTAS_INTELIGENTES')}
  AND ${alertaVisivel('ALERTAS_INTELIGENTES', ESCOPO_ME)}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360AlertasMarcarTodos',
    type: 'SQL',
    description: 'Marca como lidos os alertas nao lidos que o usuario pode marcar no recorte aberto (RF-004, RN-011, C-004). Params: filial, depto, secao (vazio = sem recorte). Devolve affectedRows.',
    code: `UPDATE ALERTAS_INTELIGENTES
SET LIDO = 1, DATA_LEITURA = ${AGORA_BR}
WHERE ALERTAS_INTELIGENTES.LIDO = 0
  AND ${podeMarcar('ALERTAS_INTELIGENTES')}
  AND ${alertaVisivel('ALERTAS_INTELIGENTES', { ...ESCOPO_ME, filial: "'{{filial}}'", depto: "'{{depto}}'", secao: "'{{secao}}'" })}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360AlertaHistorico',
    type: 'SQL',
    description: 'Meses com compra do produto (Sazonalidade, Reposicao) ou do cliente (Volume Crescente) na BU do alerta, de desde ate hoje (RF-007, RN-014): MES, VALOR, PEDIDOS. Params: escopo + alertaId, desde (AAAA-MM-01 de 12 meses atras).',
    code: `SELECT SUBSTRING(${dia('S.DTSAIDA')}, 1, 7) AS MES, SUM(S.TOTAL) AS VALOR, COUNT(DISTINCT S.NUMPED) AS PEDIDOS
FROM ALERTAS_INTELIGENTES AL
JOIN IMP_VENDAS_DASHBOARD_TOTVS_RCA S ON S.CODCLI = AL.ID_CLIENTE
  AND ${cod('S.CODFILIAL')} = ${cod('AL.CODFILIAL')} AND ${cod('S.CODEPTO')} = ${cod('AL.CODEPTO')}
  AND (TRIM(COALESCE(AL.ID_SECAO, '')) = '' OR ${cod('S.CODSEC')} = ${cod('AL.ID_SECAO')})
WHERE AL.ID = ${num('alertaId')}
  AND ${alertaVisivel('AL', ESCOPO_SQL)} AND ${SEM_BLOQUEIO}
  AND (AL.TIPO_ALERTA = 'VOLUME_CRESCENTE' OR AL.PRODUTO_REFERENCIA LIKE CONCAT(S.CODPROD, ' - %'))
  AND ${dia('S.DTSAIDA')} >= '{{desde}}' AND ${dia('S.DTSAIDA')} <= '{{hoje}}'
GROUP BY SUBSTRING(${dia('S.DTSAIDA')}, 1, 7)
ORDER BY MES`,
  },
  {
    name: 's360AlertaSugestoes',
    type: 'SQL',
    description: 'Ate 10 produtos para o alerta de Volume Crescente (RF-008, RN-005): ORIGEM 1 = de outros alertas do cliente, 2 = comprados desde `desde` por clientes do mesmo ramo na BU. A tela tira repetidos e mostra 5. Params: escopo + alertaId, desde.',
    code: `SELECT X.PRODUTO, X.ORIGEM FROM (
  SELECT A2.PRODUTO_REFERENCIA AS PRODUTO, 1 AS ORIGEM, MAX(COALESCE(A2.VALOR_REFERENCIA, 0)) AS PESO
  FROM ALERTAS_INTELIGENTES AL
  JOIN ALERTAS_INTELIGENTES A2 ON A2.ID_CLIENTE = AL.ID_CLIENTE AND A2.ID_VENDEDOR = AL.ID_VENDEDOR AND A2.ID <> AL.ID
  WHERE AL.ID = ${num('alertaId')} AND ${alertaVisivel('AL', ESCOPO_SQL)} AND ${SEM_BLOQUEIO}
    AND TRIM(COALESCE(A2.PRODUTO_REFERENCIA, '')) <> ''
  GROUP BY A2.PRODUTO_REFERENCIA
  UNION ALL
  SELECT CONCAT(S.CODPROD, ' - ', MAX(COALESCE(S.DESCRICAO, ''))), 2, SUM(S.TOTAL)
  FROM ALERTAS_INTELIGENTES AL
  JOIN IMP_VENDAS_DASHBOARD_TOTVS_RCA S ON S.CODCLI <> AL.ID_CLIENTE
    AND ${cod('S.CODFILIAL')} = ${cod('AL.CODFILIAL')} AND ${cod('S.CODEPTO')} = ${cod('AL.CODEPTO')}
  WHERE AL.ID = ${num('alertaId')} AND ${alertaVisivel('AL', ESCOPO_SQL)} AND ${SEM_BLOQUEIO}
    AND TRIM(COALESCE(AL.RAMO_CLIENTE, '')) <> ''
    AND S.CODCLI IN (SELECT ICT.CODCLI FROM IMP_CLIENTES_TOTVS ICT WHERE UPPER(TRIM(ICT.RAMO)) = UPPER(TRIM(AL.RAMO_CLIENTE)))
    AND ${dia('S.DTSAIDA')} >= '{{desde}}' AND ${dia('S.DTSAIDA')} <= '{{hoje}}'
  GROUP BY S.CODPROD
) X
ORDER BY X.ORIGEM, X.PESO DESC, X.PRODUTO
LIMIT 10`,
  },

  /* ── rotinas agendadas ── */
  {
    name: 's360AlertasProcessarFila',
    type: 'JAVASCRIPT',
    cronExpression: '0 */10 6-20 * * *',
    description: 'Rotina (RF-001, RF-011, RN-001…008, RN-016): cria a fila do dia na primeira execucao, encerra item preso ha mais de 20 min, processa ate 3 vendedores e apaga alertas com mais de 60 dias. A cada 10 min das 6h as 20h. Sem params (agora AAAA-MM-DD HH:MM:SS so para teste).',
    code: corpoRotina(SQL_FILA, corpoFila),
  },
  {
    name: 's360AlertasResumoSemanal',
    type: 'JAVASCRIPT',
    cronExpression: '0 0 3 * * THU',
    description: 'Rotina (RF-012, RN-017): e-mail "Resumo semanal de avisos comerciais" a cada vendedor com avisos gerados nos 7 dias anteriores; 1 por semana (ALERTAS_EMAIL_SEMANAL). Quintas, 3h. Sem params (agora so para teste).',
    code: corpoRotina(SQL_RESUMO, corpoResumo),
  },
  {
    name: 's360RelatorioSemanalCoordenadores',
    type: 'JAVASCRIPT',
    cronExpression: '0 0 8 * * MON',
    description: 'Rotina (RF-013, RN-018): relatorio da ultima semana operacional encerrada a cada coordenador ativo com e-mail, nas BUs dele; 1 por semana (RELATORIO_SEMANAL_COORDENADORES_LOG). Segundas, 8h. Sem params (agora so para teste).',
    code: corpoRotina(SQL_RELATORIO, corpoRelatorio),
  },

  /* ── aba Prospeccao ── */
  {
    name: 's360ProspeccaoListar',
    type: 'JAVASCRIPT',
    description: 'Prospeccao da semana (RF-014, RN-020): clientes da carteira exibida com compra no escopo, tendencia ALTA/MEDIA/BAIXA/INATIVO, curva e temperatura da 002; 20 por pagina. Params: escopo + tendencia, busca, pagina. Devolve { ok, semana, mes, altas, total, pagina, linhas }.',
    code: corpoTela(SQL_PROSPECCAO, corpoProspeccao),
  },

  /* ── aba Prospects de /clientes ── */
  {
    name: 's360ProspectsListar',
    type: 'SQL',
    description: 'Prospects visiveis (RF-016, RN-021): do usuario, do titular coberto, da equipe (coordenador) ou todos (diretoria); 20 por pagina com TOTAL; PODE_EDITAR = responsavel ou substituto ativo. Params: etapa (vazio = todas), busca, pagina.',
    code: `WITH P AS (
  SELECT PR.ID, PR.RAZAO_SOCIAL, PR.NOME_FANTASIA, COALESCE(NULLIF(TRIM(PR.NOME_FANTASIA), ''), PR.RAZAO_SOCIAL) AS NOME,
    PR.CNPJ, PR.SEGMENTO, PR.PORTE, PR.ORIGEM, PR.CIDADE, PR.UF, COALESCE(PR.STATUS_PIPELINE, 'NOVO') AS ETAPA,
    PR.POTENCIAL, PR.PROBABILIDADE, PR.OBSERVACOES, PR.COD_CLIENTE_TOTVS, PR.CONVERTIDO_EM, PR.CRIADO_EM,
    PR.RESPONSAVEL_ID, ${nomeUsuario('U')} AS RESPONSAVEL,
    (SELECT PC.NOME FROM PROSPECT_CONTATOS PC WHERE PC.PROSPECT_ID = PR.ID ORDER BY PC.PRINCIPAL DESC, PC.ID LIMIT 1) AS CONTATO,
    (SELECT PC.TELEFONE FROM PROSPECT_CONTATOS PC WHERE PC.PROSPECT_ID = PR.ID ORDER BY PC.PRINCIPAL DESC, PC.ID LIMIT 1) AS TELEFONE,
    (SELECT COUNT(*) FROM PROSPECT_VISITAS PV WHERE PV.PROSPECT_ID = PR.ID AND COALESCE(PV.STATUS, '') <> 'CANCELADA') AS VISITAS,
    (SELECT MAX(PV.DATA_VISITA) FROM PROSPECT_VISITAS PV WHERE PV.PROSPECT_ID = PR.ID AND PV.STATUS = 'CONCLUIDA') AS ULTIMA_VISITA,
    (SELECT PV.PROXIMO_PASSO FROM PROSPECT_VISITAS PV WHERE PV.PROSPECT_ID = PR.ID AND TRIM(COALESCE(PV.PROXIMO_PASSO, '')) <> ''
      ORDER BY PV.DATA_VISITA DESC, PV.ID DESC LIMIT 1) AS PROXIMO_PASSO,
    (SELECT PV.DATA_PROXIMO_PASSO FROM PROSPECT_VISITAS PV WHERE PV.PROSPECT_ID = PR.ID AND TRIM(COALESCE(PV.PROXIMO_PASSO, '')) <> ''
      ORDER BY PV.DATA_VISITA DESC, PV.ID DESC LIMIT 1) AS DATA_PROXIMO_PASSO,
    CASE WHEN ${prospectEditavel('PR')} THEN 1 ELSE 0 END AS PODE_EDITAR
  FROM PROSPECTS PR
  LEFT JOIN INT_USER U ON U.ID = PR.RESPONSAVEL_ID
  WHERE ${prospectVisivel('PR')} AND ${SEM_BLOQUEIO}
    AND ('{{etapa}}' = '' OR COALESCE(PR.STATUS_PIPELINE, 'NOVO') = '{{etapa}}')
    AND ('{{busca}}' = '' OR ${semAcento("CONCAT(COALESCE(PR.RAZAO_SOCIAL, ''), ' ', COALESCE(PR.NOME_FANTASIA, ''), ' ', COALESCE(PR.CIDADE, ''), ' ', COALESCE(PR.CNPJ, ''))")}
      LIKE CONCAT('%', ${semAcento("TRIM('{{busca}}')")}, '%'))
)
SELECT X.* FROM (
  SELECT P.*, COUNT(*) OVER () AS TOTAL,
    ROW_NUMBER() OVER (ORDER BY CASE P.ETAPA WHEN 'NEGOCIACAO' THEN 1 WHEN 'VISITADO' THEN 2 WHEN 'VISITA_AGENDADA' THEN 3
      WHEN 'NOVO' THEN 4 WHEN 'PERDIDO' THEN 5 ELSE 6 END, P.CRIADO_EM DESC, P.ID DESC) AS RN
  FROM P
) X
WHERE X.RN > (${pagina()} - 1) * 20 AND X.RN <= ${pagina()} * 20
ORDER BY X.RN`,
  },
  {
    name: 's360ProspectDetalhe',
    type: 'SQL',
    description: 'Contatos (TIPO_LINHA CONTATO) e visitas de prospeccao (TIPO_LINHA VISITA) de um prospect visivel (RF-016). Params: prospectId.',
    code: `SELECT 'CONTATO' AS TIPO_LINHA, PC.ID AS ID, PC.NOME AS NOME, PC.CARGO AS CARGO, PC.TELEFONE AS TELEFONE, PC.EMAIL AS EMAIL, PC.PRINCIPAL AS PRINCIPAL,
  NULL AS DATA, NULL AS EXECUTIVO, NULL AS STATUS, NULL AS RESUMO, NULL AS OBJECOES, NULL AS PROXIMO_PASSO, NULL AS DATA_PROXIMO_PASSO
FROM PROSPECT_CONTATOS PC
JOIN PROSPECTS PR ON PR.ID = PC.PROSPECT_ID
WHERE PR.ID = ${num('prospectId')} AND ${prospectVisivel('PR')} AND ${SEM_BLOQUEIO}
UNION ALL
SELECT 'VISITA', PV.ID, NULL, NULL, NULL, NULL, NULL,
  PV.DATA_VISITA, ${nomeUsuario('U')}, COALESCE(PV.STATUS, 'AGENDADA'), PV.RESUMO, PV.OBJECOES, PV.PROXIMO_PASSO, PV.DATA_PROXIMO_PASSO
FROM PROSPECT_VISITAS PV
JOIN PROSPECTS PR ON PR.ID = PV.PROSPECT_ID
LEFT JOIN INT_USER U ON U.ID = PV.EXECUTIVO_ID
WHERE PR.ID = ${num('prospectId')} AND ${prospectVisivel('PR')} AND ${SEM_BLOQUEIO}
ORDER BY TIPO_LINHA, PRINCIPAL DESC, DATA DESC, ID DESC`,
  },
  {
    name: 's360ProspectEtapaMudar',
    type: 'SQL',
    description: 'Mudar etapa manual (RN-022): qualquer etapa menos Convertido; Convertido e final. So responsavel ou substituto ativo. Params: prospectId, etapa NOVO|VISITA_AGENDADA|VISITADO|NEGOCIACAO|PERDIDO. Devolve affectedRows.',
    code: `UPDATE PROSPECTS
SET STATUS_PIPELINE = '{{etapa}}', ATUALIZADO_EM = ${AGORA_BR}
WHERE PROSPECTS.ID = ${num('prospectId')}
  AND '{{etapa}}' IN (${ETAPAS_MANUAIS})
  AND COALESCE(PROSPECTS.STATUS_PIPELINE, 'NOVO') <> 'CONVERTIDO'
  AND COALESCE(PROSPECTS.STATUS_PIPELINE, 'NOVO') <> '{{etapa}}'
  AND ${prospectEditavel('PROSPECTS')}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    // Duas instrucoes com a mesma validacao: o principal antigo so e desmarcado se o novo entra.
    name: 's360ProspectContatoAdicionar',
    type: 'SQL',
    description: 'Inclui contato no prospect (RF-016); principal = 1 desmarca o anterior. So responsavel ou substituto ativo. Params: prospectId, nome (1..200), cargo, telefone, email, principal (0/1). Devolve affectedRows.',
    code: `UPDATE PROSPECT_CONTATOS
SET PRINCIPAL = 0
WHERE PROSPECT_CONTATOS.PROSPECT_ID = ${num('prospectId')}
  AND '{{principal}}' = '1'
  AND CHAR_LENGTH(TRIM('{{nome}}')) BETWEEN 1 AND 200
  AND EXISTS (SELECT 1 FROM PROSPECTS PR WHERE PR.ID = PROSPECT_CONTATOS.PROSPECT_ID AND ${prospectEditavel('PR')})
  AND ${SEM_BLOQUEIO};
INSERT INTO PROSPECT_CONTATOS (PROSPECT_ID, NOME, CARGO, TELEFONE, EMAIL, PRINCIPAL, CRIADO_EM)
SELECT PR.ID, TRIM('{{nome}}'), NULLIF(TRIM('{{cargo}}'), ''), NULLIF(TRIM('{{telefone}}'), ''), NULLIF(TRIM('{{email}}'), ''),
  CASE WHEN '{{principal}}' = '1' OR NOT EXISTS (SELECT 1 FROM PROSPECT_CONTATOS PC WHERE PC.PROSPECT_ID = PR.ID) THEN 1 ELSE 0 END, ${AGORA_BR}
FROM PROSPECTS PR
WHERE PR.ID = ${num('prospectId')}
  AND CHAR_LENGTH(TRIM('{{nome}}')) BETWEEN 1 AND 200
  AND CHAR_LENGTH('{{cargo}}') <= 120 AND CHAR_LENGTH('{{telefone}}') <= 40 AND CHAR_LENGTH('{{email}}') <= 200
  AND ${prospectEditavel('PR')}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360ProspectConverter',
    type: 'SQL',
    description: 'Converte o prospect (RN-023): exige codigo de cliente existente no ERP (CLIENTES.ID); grava codigo, data e etapa Convertido; nao mexe na carteira. So responsavel ou substituto ativo. Params: prospectId, codigo. Devolve affectedRows.',
    code: `UPDATE PROSPECTS
SET STATUS_PIPELINE = 'CONVERTIDO', COD_CLIENTE_TOTVS = CAST(${num('codigo')} AS CHAR), CONVERTIDO_EM = ${AGORA_BR}, ATUALIZADO_EM = ${AGORA_BR}
WHERE PROSPECTS.ID = ${num('prospectId')}
  AND COALESCE(PROSPECTS.STATUS_PIPELINE, 'NOVO') <> 'CONVERTIDO'
  AND EXISTS (SELECT 1 FROM CLIENTES C WHERE C.ID = ${num('codigo')})
  AND ${prospectEditavel('PROSPECTS')}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360ProspectVisitaResultado',
    type: 'SQL',
    description: 'Resultado da visita de prospeccao concluida (RF-017, RN-024): objecoes, proximo passo e data do proximo passo (opcionais). Quem opera a visita (spec 003). Params: visitaId, objecoes, proximoPasso, dataProximoPasso (AAAA-MM-DD ou vazio). Devolve affectedRows.',
    code: `UPDATE PROSPECT_VISITAS
SET OBJECOES = NULLIF(TRIM('{{objecoes}}'), ''), PROXIMO_PASSO = NULLIF(TRIM('{{proximoPasso}}'), ''),
  DATA_PROXIMO_PASSO = NULLIF(TRIM('{{dataProximoPasso}}'), ''), ATUALIZADO_EM = ${AGORA_BR}
WHERE PROSPECT_VISITAS.ID = ${num('visitaId')}
  AND PROSPECT_VISITAS.STATUS = 'CONCLUIDA'
  AND ${podeOperar('PROSPECT_VISITAS.EXECUTIVO_ID')}
  AND CHAR_LENGTH('{{objecoes}}') <= 4000 AND CHAR_LENGTH('{{proximoPasso}}') <= 4000
  AND (TRIM('{{dataProximoPasso}}') = '' OR CHAR_LENGTH(TRIM('{{dataProximoPasso}}')) = 10)
  AND ${SEM_BLOQUEIO}`,
  },

  /* ── Direcionamento Semanal (RN-025…028) ── */
  {
    name: 's360DirecionamentoAgenda',
    type: 'SQL',
    description: 'Controle de Agenda (RF-018, RN-026): um compromisso por linha (visita a cliente e de prospeccao) dos executivos do escopo, de segunda a sexta, com as marcas CONCLUIDA, NAO_CONCLUIDA, SEM_RELATO, VENCIDA, REAGENDADA, CANCELADA e SITUACAO. So coordenador ativo, diretoria e admin. Params: escopo + semana (segunda AAAA-MM-DD).',
    code: `WITH E AS (${EXECUTIVOS}),
K AS (
  SELECT 'VISITA' AS ORIGEM, V.ID, V.VENDEDOR_ID AS EXECUTIVO_ID, V.DATA_AGENDADA AS DATA, V.HORA_INICIO AS HORA,
    ${nomeCliente('C')} AS CLIENTE, COALESCE(V.STATUS, 'AGENDADA') AS STATUS, V.RELATO AS TEXTO
  FROM VISITAS V
  JOIN E ON E.VENDEDOR_ID = V.VENDEDOR_ID
  LEFT JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
  WHERE ${NA_SEMANA('V.DATA_AGENDADA')}
  UNION ALL
  SELECT 'PROSPECCAO', PV.ID, PV.EXECUTIVO_ID, PV.DATA_VISITA, PV.HORA_INICIO,
    COALESCE(NULLIF(TRIM(PR.NOME_FANTASIA), ''), PR.RAZAO_SOCIAL), COALESCE(PV.STATUS, 'AGENDADA'), PV.RESUMO
  FROM PROSPECT_VISITAS PV
  JOIN E ON E.VENDEDOR_ID = PV.EXECUTIVO_ID
  LEFT JOIN PROSPECTS PR ON PR.ID = PV.PROSPECT_ID
  WHERE ${NA_SEMANA('PV.DATA_VISITA')}
)
SELECT K.ORIGEM, K.ID, K.EXECUTIVO_ID, ${nomeUsuario('U')} AS EXECUTIVO, K.DATA, K.HORA, K.CLIENTE, K.STATUS,
  CASE WHEN K.STATUS = 'CONCLUIDA' THEN 1 ELSE 0 END AS CONCLUIDA,
  CASE WHEN K.STATUS IN ('AGENDADA', 'EM_ANDAMENTO') THEN 1 ELSE 0 END AS NAO_CONCLUIDA,
  CASE WHEN K.STATUS IN ('AGENDADA', 'EM_ANDAMENTO') AND NOT ${temRelato('K.TEXTO')} THEN 1 ELSE 0 END AS SEM_RELATO,
  CASE WHEN ${VENCIDA('K')} THEN 1 ELSE 0 END AS VENCIDA,
  CASE WHEN ${reagendada('K.TEXTO')} THEN 1 ELSE 0 END AS REAGENDADA,
  CASE WHEN K.STATUS = 'CANCELADA' THEN 1 ELSE 0 END AS CANCELADA,
  CASE
    WHEN K.STATUS = 'CONCLUIDA' THEN 'Concluída'
    WHEN K.STATUS = 'CANCELADA' THEN 'Cancelada'
    WHEN ${VENCIDA('K')} AND NOT ${temRelato('K.TEXTO')} THEN 'Vencida sem relato'
    WHEN ${VENCIDA('K')} THEN 'Vencida sem conclusão'
    WHEN NOT ${temRelato('K.TEXTO')} THEN CONCAT(CASE WHEN K.STATUS = 'EM_ANDAMENTO' THEN 'Em andamento' ELSE 'Agendada' END, ' · sem relato')
    WHEN K.STATUS = 'EM_ANDAMENTO' THEN 'Em andamento (sem checkout)'
    ELSE 'Agendada'
  END AS SITUACAO
FROM K
JOIN INT_USER U ON U.ID = K.EXECUTIVO_ID
WHERE ${podeDirecionar}
ORDER BY EXECUTIVO, K.EXECUTIVO_ID, K.DATA, K.HORA, K.ORIGEM, K.ID`,
  },
  {
    name: 's360DirecionamentoCriticos',
    type: 'JAVASCRIPT',
    description: 'Clientes Criticos sem Compra (RN-027): por executivo do escopo, clientes curva A ou entre os 20% de maior faturamento em 180 dias, com ciclo, compra prevista e situacao; so executivos com cliente sem compra. Params: escopo + semana (segunda). Devolve { ok, semana, executivos }.',
    code: corpoTela(SQL_CRITICOS, corpoCriticos),
  },
  {
    name: 's360DirecionamentoSemVisita',
    type: 'SQL',
    description: 'Carteira sem Visitacao (RN-028): clientes da carteira de cada executivo do escopo sem visita CONCLUIDA por ele nos ultimos 30 dias ate hoje; faixa, proxima visita agendada; 30 por pagina com TOTAL e totais por faixa (clientes distintos). Linha sem ID_CLIENTE = so os totais. Params: escopo + faixa (NUNCA|31_60|61_90|90|vazio), busca, pagina.',
    code: `WITH B AS (
  SELECT CV.VENDEDOR_ID, CV.ID_CLIENTE,
    (SELECT MAX(V.DATA_AGENDADA) FROM VISITAS V WHERE V.CLIENTE_ID = CV.ID_CLIENTE AND V.VENDEDOR_ID = CV.VENDEDOR_ID
      AND V.STATUS = 'CONCLUIDA' AND V.DATA_AGENDADA <= '{{hoje}}') AS ULTIMA,
    (SELECT MIN(V2.DATA_AGENDADA) FROM VISITAS V2 WHERE V2.CLIENTE_ID = CV.ID_CLIENTE AND V2.VENDEDOR_ID = CV.VENDEDOR_ID
      AND V2.STATUS = 'AGENDADA' AND V2.DATA_AGENDADA >= '{{hoje}}') AS PROXIMA
  FROM (SELECT DISTINCT CV0.VENDEDOR_ID, CV0.ID_CLIENTE FROM (${carteiraVisivel(ESCOPO_SQL)}) CV0 WHERE CV0.COBERTURA = 0) CV
),
F AS (
  SELECT B.*, DATEDIFF('{{hoje}}', B.ULTIMA) AS DIAS,
    CASE WHEN B.ULTIMA IS NULL THEN 'NUNCA' WHEN DATEDIFF('{{hoje}}', B.ULTIMA) <= 60 THEN '31_60'
      WHEN DATEDIFF('{{hoje}}', B.ULTIMA) <= 90 THEN '61_90' ELSE '90' END AS FAIXA
  FROM B
  WHERE B.ULTIMA IS NULL OR DATEDIFF('{{hoje}}', B.ULTIMA) > 30
),
J AS (
  SELECT F.*, ${nomeCliente('C')} AS CLIENTE, C.CIDADE, C.UF, ${nomeUsuario('U')} AS EXECUTIVO
  FROM F
  JOIN CLIENTES C ON C.ID = F.ID_CLIENTE
  JOIN INT_USER U ON U.ID = F.VENDEDOR_ID
  WHERE ${podeDirecionar}
    AND ('{{busca}}' = '' OR ${semAcento("CONCAT(COALESCE(C.RAZAO_SOCIAL, ''), ' ', COALESCE(C.NOME_FANTASIA, ''), ' ', COALESCE(C.CIDADE, ''), ' ', CAST(C.ID AS CHAR))")}
      LIKE CONCAT('%', ${semAcento("TRIM('{{busca}}')")}, '%'))
),
T AS (
  SELECT COUNT(DISTINCT CASE WHEN J.FAIXA = 'NUNCA' THEN J.ID_CLIENTE END) AS N_NUNCA,
    COUNT(DISTINCT CASE WHEN J.FAIXA = '31_60' THEN J.ID_CLIENTE END) AS N_31_60,
    COUNT(DISTINCT CASE WHEN J.FAIXA = '61_90' THEN J.ID_CLIENTE END) AS N_61_90,
    COUNT(DISTINCT CASE WHEN J.FAIXA = '90' THEN J.ID_CLIENTE END) AS N_90
  FROM J
),
P AS (
  SELECT J.*, COUNT(*) OVER () AS TOTAL,
    ROW_NUMBER() OVER (ORDER BY CASE WHEN J.FAIXA = 'NUNCA' THEN 0 ELSE 1 END, J.DIAS DESC, J.CLIENTE, J.ID_CLIENTE, J.VENDEDOR_ID) AS RN
  FROM J
  WHERE '{{faixa}}' = '' OR J.FAIXA = '{{faixa}}'
)
SELECT T.N_NUNCA, T.N_31_60, T.N_61_90, T.N_90, P.*
FROM T
LEFT JOIN P ON P.RN > (${pagina()} - 1) * 30 AND P.RN <= ${pagina()} * 30
WHERE ${podeDirecionar}
ORDER BY P.RN`,
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
  const listaSf = await listServerFunctionsMitra({ projectId });
  const porNome = new Map((listaSf?.result ?? []).map((fn) => [fn.name, fn]));
  for (const definition of definitions) {
    const { name, type, code, description, cronExpression } = definition;
    const agenda = cronExpression ? { cronExpression, cronInputJson: '{}' } : {};
    const existente = porNome.get(name);
    if (existente) {
      const id = functionId(existente);
      await updateServerFunctionMitra({ projectId, serverFunctionId: id, code, description, ...agenda });
      console.log(`  atualizada  ${name} (${id})`);
      continue;
    }
    const criada = await createServerFunctionMitra({ projectId, name, type, code, description, ...agenda });
    console.log(`  criada      ${name} (${functionId(criada)})`);
  }
}

if (isEntrypoint()) {
  if (!projectId) throw new Error('MITRA_PROJECT_ID ausente no .env');
  console.log(`Publicando ${definitions.length} server functions (spec 008)...`);
  await upsert();
  console.log('\nPronto. Agora: node add-001-acesso.mjs && node add-000-perfil-acesso.mjs && npm run sync:function-map');
}
