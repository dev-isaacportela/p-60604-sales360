// Spec 006 — acompanhamento semanal: visao do vendedor e carga do ERP.
//
// NAO EXECUTE ESTE ARQUIVO DA MAQUINA LOCAL: so no sandbox:
//   cd novo/backend && node add-006-semanal.mjs && node add-000-perfil-acesso.mjs
//
// Nenhuma tabela nem coluna nova. A matriz, o detalhe e a planilha sao SFs
// JAVASCRIPT que leem por runQueryMitra e calculam com lib/006-regras.mjs. A
// carga (s360SemanalCarga) e publicada SEM agendamento (P-1 do plan): no dia da
// troca ganha cronExpression '0 8-19 * * 1-5' e a SF 107 do antigo e desligada.
// Nenhuma tela chama a carga (fora de server-functions.ts, RN-017).

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';
import { SEM_BLOQUEIO, temPapel } from './lib/guardas.mjs';
import { pagina, nomeUsuario, nomeCliente, ramoDe, ESCOPO_MARCADO, carteiraVisivel } from './lib/002-carteira.mjs';
import { hojeDoPeriodo, contaNoEscopo, vendasDaCarga, devolucoesDoPeriodo, source, preludio } from './lib/006-semanal.mjs';
import { REGRAS } from './lib/006-regras.mjs';
import { SQL as CARGA, MENSAGENS } from './lib/006-carga.mjs';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const corpoJs = (sql, corpo, comRegras = true) => [
  source(preludio),
  `const SQL = ${JSON.stringify(sql)};`,
  comRegras ? REGRAS.map(String).join('\n\n') : '',
  source(corpo),
].join('\n\n');

/* ─────────────── leitura da matriz ─────────────── */

// Escopo da tela; o `hoje` do escopo e o do mes aberto (substituto ve o
// titular quando as ferias cruzam o mes, RN-001).
const P = { ...ESCOPO_MARCADO, hoje: hojeDoPeriodo("'@@ini@@'", "'@@fim@@'") };
const CART = carteiraVisivel(P);

const linhasDe = (ini, fim) => `(${vendasDaCarga(ini, fim)}
  UNION ALL
  ${devolucoesDoPeriodo(ini, fim)})`;

const SQL_LEITURA = {
  carteira: `SELECT X.*, ${nomeUsuario('UV')} AS VENDEDOR, ${nomeUsuario('UE')} AS EU,
    CASE WHEN X.COBERTURA = 1 THEN ${nomeUsuario('UV')} END AS TITULAR
  FROM (
    SELECT C.ID AS CLIENTE_ID, ${nomeCliente('C')} AS CLIENTE, C.SEGMENTO, ${ramoDe('C.ID')} AS RAMO,
      MIN(NULLIF(TRIM(CV.CURVA), '')) AS CURVA, MIN(CV.COBERTURA) AS COBERTURA,
      MIN(CV.VENDEDOR_ID) AS VENDEDOR_ID, :VAR_USER AS EU_ID
    FROM (${CART}) CV
    JOIN CLIENTES C ON C.ID = CV.ID_CLIENTE
    GROUP BY C.ID, C.NOME_FANTASIA, C.RAZAO_SOCIAL, C.SEGMENTO
  ) X
  LEFT JOIN INT_USER UV ON UV.ID = X.VENDEDOR_ID
  LEFT JOIN INT_USER UE ON UE.ID = X.EU_ID`,

  // Liquido por cliente x dia de M-2 a M (RN-003, RN-006).
  dias: `SELECT L.CODCLI, L.DIA, SUM(L.VALOR) AS VALOR, SUM(CASE WHEN L.TIPO = 'V' THEN L.VALOR ELSE 0 END) AS BRUTO
  FROM ${linhasDe("'@@de@@'", "'@@fim@@'")} L
  WHERE L.CODCLI IN (SELECT CV0.ID_CLIENTE FROM (${CART}) CV0)
    AND ${contaNoEscopo('L', P)}
  GROUP BY L.CODCLI, L.DIA`,

  // Detalhe: linhas do cliente nos 12 meses que terminam no mes aberto (RN-011).
  detalhe: `SELECT L.TIPO, L.CODPROD, MAX(L.PRODUTO) AS PRODUTO, L.NUMPED, L.DIA, SUM(L.QT) AS QT, SUM(L.VALOR) AS VALOR
  FROM ${linhasDe("'@@de@@'", "'@@fim@@'")} L
  WHERE L.CODCLI = @@cliente@@
    AND @@cliente@@ IN (SELECT CV0.ID_CLIENTE FROM (${CART}) CV0)
    AND ${contaNoEscopo('L', P)}
  GROUP BY L.TIPO, L.CODPROD, L.NUMPED, L.DIA`,

  // Planilha, aba Produtos: itens de venda de M-1 e M de toda a carteira (RN-012).
  produtos: `SELECT L.CODCLI, L.TIPO, L.CODPROD, MAX(L.PRODUTO) AS PRODUTO, L.NUMPED, L.DIA, SUM(L.QT) AS QT, SUM(L.VALOR) AS VALOR
  FROM (${vendasDaCarga("'@@de@@'", "'@@fim@@'")}) L
  WHERE L.CODCLI IN (SELECT CV0.ID_CLIENTE FROM (${CART}) CV0)
    AND ${contaNoEscopo('L', P)}
  GROUP BY L.CODCLI, L.TIPO, L.CODPROD, L.NUMPED, L.DIA`,
};

// Corpo comum: valida o mes aberto e monta os marcadores. `meses` = quantos
// meses para tras a consulta le (incluindo o aberto).
function periodoDe() {
  function periodo(e, meses) {
    const hoje = /^\d{4}-\d{2}-\d{2}$/.test(String(e.hoje)) ? String(e.hoje) : '';
    const ano = Number(e.ano);
    const mes = Number(e.mes);
    if (!hoje || !(ano >= 2000 && ano <= 2100) || !(mes >= 1 && mes <= 12)) return null;
    const { ini, fim } = limitesMes(ano, mes);
    const primeiro = deslocarMes(ano, mes, 1 - meses);
    return { hoje, ano, mes, valores: { ...escopoDe(e), ini, fim, de: limitesMes(primeiro.ano, primeiro.mes).ini } };
  }
}

async function corpoMatriz() {
  const p = periodo(event || {}, 3);
  if (!p) return { ok: false, error: 'Mês inválido.' };
  const [carteira, dias] = await Promise.all([
    consultar(preencher(SQL.carteira, p.valores)),
    consultar(preencher(SQL.dias, p.valores)),
  ]);
  return montarMatriz({ carteira, dias, ano: p.ano, mes: p.mes, hoje: p.hoje, modo: p.valores.modo });
}

async function corpoDetalhe() {
  const e = event || {};
  const p = periodo(e, 12);
  const cliente = digitos(e.clienteId);
  if (!p || !cliente) return { ok: false, error: 'Cliente ou mês inválido.' };
  const linhas = await consultar(preencher(SQL.detalhe, { ...p.valores, cliente }));
  return montarDetalhe({ linhas, ano: p.ano, mes: p.mes });
}

async function corpoProdutos() {
  const p = periodo(event || {}, 2);
  if (!p) return { ok: false, error: 'Mês inválido.' };
  const linhas = await consultar(preencher(SQL.produtos, p.valores));
  return montarProdutos({ linhas, ano: p.ano, mes: p.mes });
}

const corpoLeitura = (corpo) => [corpoJs(SQL_LEITURA, () => {}), source(periodoDe), source(corpo)].join('\n\n');

/* ─────────────── carga do ERP ─────────────── */

async function corpoCarga() {
  const e = event || {};
  const M = MSG;
  // RN-017: so a rotina (sem usuario identificado) roda a carga.
  const [{ N } = {}] = await consultar(SQL.ehUsuario);
  if (Number(N) > 0) return { ok: false, error: M.manual };

  // Relogio de Brasilia; `agora` no input so para teste.
  const relogio = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(String(e.agora ?? ''))
    ? Date.parse(`${String(e.agora).replace(' ', 'T')}Z`)
    : Date.now() - 3 * 3600000;
  const fmt = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  const agora = fmt(relogio);
  const exec = `S${agora.replace(/\D/g, '')}${Math.random().toString(36).slice(2, 8)}`;
  const v = { exec, agora, limite: fmt(relogio - 30 * 60000), retencao: fmt(relogio - 7 * 86400000) };
  const rodar = (chave, extra = {}) => executar(preencher(SQL[chave], { ...v, ...extra }));
  const fim = () => (e.agora ? agora : fmt(Date.now() - 3 * 3600000));

  // RN-016: uma por vez; a presa ha mais de 30 min vira falha.
  await rodar('fecharInterrompidas');
  const [{ DESDE } = {}] = await consultar(preencher(SQL.emAndamento, v));
  if (DESDE) return { ok: false, error: `${M.emAndamentoPrefixo}${String(DESDE).slice(11, 16)}.` };
  await rodar('abrir');

  try {
    // Atualiza a fonte do ERP antes (como a 107); o simulador nao tem Data Loader.
    if (typeof sdk.listDataLoadersMitra === 'function') {
      const lista = await sdk.listDataLoadersMitra({ projectId });
      const achado = (lista?.result || []).find((d) => (d?.name || d?.NAME) === 'VENDAS_DASHBOARD_TOTVS_RCA');
      const id = Number(achado?.id || achado?.dataLoaderId || 0);
      if (!id) throw new Error('Data Loader VENDAS_DASHBOARD_TOTVS_RCA não encontrado.');
      await sdk.executeDataLoaderMitra({ projectId, dataLoaderId: id });
    }
    await rodar('itens');
    const inativadosItens = await rodar('inativarItens');
    await rodar('semanas');
    const inativadosSemanas = await rodar('inativarSemanas');
    await rodar('erros');
    await rodar('resolverErros');
    await rodar('apagarResolvidos');
    const [c = {}] = await consultar(preencher(SQL.contadores, v));
    const totais = Object.fromEntries(Object.entries(c).map(([k, x]) => [k, Number(x) || 0]));
    await rodar('concluir', { ...totais, inativadosItens, inativadosSemanas, fim: fim() });
    return {
      ok: true, execucaoId: exec, status: 'SUCCESS',
      validos: totais.TOTAL_VALIDOS, erros: totais.TOTAL_ERROS, inativados: inativadosItens,
    };
  } catch (erro) {
    // RF-012: a mensagem real, nunca "[object Object]".
    const mensagem = String(erro?.message || erro?.response?.data?.message || (typeof erro === 'string' ? erro : JSON.stringify(erro))).slice(0, 480);
    await rodar('falhar', { mensagem, fim: fim() });
    return { ok: false, execucaoId: exec, status: 'FAILED', error: mensagem };
  }
}

const MSG = { manual: MENSAGENS.manual, emAndamentoPrefixo: MENSAGENS.emAndamento('').slice(0, -1) };

/* ─────────────── definicoes ─────────────── */

const ESCOPO_DESCR = 'Escopo: modo, coordenador, vendedor, filial, depto, secao (texto), hoje AAAA-MM-DD; ano, mes do mes aberto.';

export const definitions = [
  {
    name: 's360SemanalMatriz',
    type: 'JAVASCRIPT',
    description: `Matriz cliente x semana operacional do mes (RF-001..005, RN-001..010). ${ESCOPO_DESCR}`,
    code: corpoLeitura(corpoMatriz),
  },
  {
    name: 's360SemanalDetalhe',
    type: 'JAVASCRIPT',
    description: `Detalhe do cliente: semanas, itens, pedidos, sazonalidade (RF-006, RN-011). ${ESCOPO_DESCR} clienteId.`,
    code: corpoLeitura(corpoDetalhe),
  },
  {
    name: 's360SemanalProdutos',
    type: 'JAVASCRIPT',
    description: `Itens por cliente x semana com movimento, aba Produtos da planilha (RF-007, RN-012). ${ESCOPO_DESCR}`,
    code: corpoLeitura(corpoProdutos),
  },
  {
    name: 's360SemanalAtualizacao',
    type: 'SQL',
    description: 'Fim da ultima carga concluida do ERP (RF-010, RNT-015). Sem linha = nenhuma execucao.',
    code: `SELECT L.FIM_EM
FROM ACOMP_SEMANAL_SYNC_LOG L
WHERE L.STATUS = 'SUCCESS' AND L.FIM_EM IS NOT NULL
  AND ${SEM_BLOQUEIO}
ORDER BY L.FIM_EM DESC
LIMIT 1`,
  },
  {
    name: 's360SemanalErros',
    type: 'SQL',
    description: 'Erros de ingestao abertos, 50 por pagina, so ADMIN (RF-017). Params: tipo (vazio = todos), pagina.',
    code: `SELECT N.* FROM (
  SELECT E.TIPO_ERRO, E.NUMPED, E.CODPROD, E.CODCLI, E.CODFILIAL, E.DETALHE, E.QTD_OCORRENCIAS, E.ULTIMA_OCORRENCIA_EM,
    COUNT(*) OVER () AS TOTAL,
    ROW_NUMBER() OVER (ORDER BY E.QTD_OCORRENCIAS DESC, E.ID) AS RN
  FROM ACOMP_SEMANAL_SYNC_ERRO_ATUAL E
  WHERE E.SITUACAO = 'ABERTO'
    AND ('{{tipo}}' = '' OR E.TIPO_ERRO = '{{tipo}}')
    AND ${temPapel('ADMIN')}
    AND ${SEM_BLOQUEIO}
) N
WHERE N.RN > (${pagina()} - 1) * 50 AND N.RN <= ${pagina()} * 50
ORDER BY N.RN`,
  },
  {
    name: 's360SemanalCarga',
    type: 'JAVASCRIPT',
    description: 'Carga de vendas do ERP para o acompanhamento semanal (RF-011..013, RN-013..017). So a rotina roda; chamada com usuario e recusada.',
    code: [corpoJs(CARGA, () => {}, false), `const MSG = ${JSON.stringify(MSG)};`, source(corpoCarga)].join('\n\n'),
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
  console.log(`Publicando ${definitions.length} server functions (spec 006)...`);
  await upsert();
  console.log('\nPronto. Agora: node add-000-perfil-acesso.mjs && npm run sync:function-map');
}
