// Spec 009 — Mix Builder (propostas com custo real).
//
// NAO EXECUTE ESTE ARQUIVO DA MAQUINA LOCAL: o mitra-sdk nao gera migration;
// rodar daqui aplica em producao sem historia. So no sandbox:
//   cd novo/backend && node add-009-mix.mjs && node add-000-perfil-acesso.mjs
//
// Sem DDL: le o catalogo e os custos que as rotinas do antigo mantem (D-903) e
// grava em PRODUCT_MIX / PRODUCT_MIX_ITEMS. Publica as SFs `s360Mix*` (upsert
// por nome). Contratos em docs/specs/009-mix-builder/plan.md.
//
// `definitions` e exportado para o simulador executar o mesmo SQL publicado.

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';
import { SEM_BLOQUEIO } from './lib/guardas.mjs';
import { clienteNaCarteira } from './lib/009-carteira.mjs';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

/* ─────────────── fragmentos ─────────────── */

// Busca sem acento nem caixa (RNT-014, D-905): a collation de comparacao fica
// na consulta, a coluna nao muda (C1).
const semAcento = (expr) => `CONVERT(${expr} USING utf8mb4) COLLATE utf8mb4_0900_ai_ci`;
const contem = (coluna) => `${semAcento(coluna)} LIKE ${semAcento(`CONCAT('%', TRIM('{{busca}}'), '%')`)}`;

const CLIENTE = `CAST('{{clienteId}}' AS SIGNED)`;
const MIX = `CAST('{{mixId}}' AS SIGNED)`;
const NOME_CLIENTE = (c) => `COALESCE(NULLIF(TRIM(${c}.NOME_FANTASIA), ''), ${c}.RAZAO_SOCIAL)`;
const CATEGORIA = `CASE WHEN P.CODPROD IS NULL THEN '' ELSE CONCAT('Depto ', P.DEPARTAMENTO_ID, ' / Seção ', P.SECAO_ID) END`;
// RN-017: so endereco seguro e exibido.
const FOTO = `CASE WHEN F.URL LIKE 'https://%' THEN F.URL ELSE '' END`;

// Itens chegam como JSON (D-901): p produto, q qtd, t tipo, c custo, m margem,
// v preco, k preco do concorrente. q como DECIMAL para recusar 1,5.
const ITENS = `JSON_TABLE('{{itens}}', '$[*]' COLUMNS (
    P INT PATH '$.p',
    Q DECIMAL(12,4) PATH '$.q',
    T VARCHAR(40) PATH '$.t',
    C DECIMAL(12,2) PATH '$.c',
    M DECIMAL(7,2) PATH '$.m',
    V DECIMAL(12,2) PATH '$.v',
    K DECIMAL(12,2) PATH '$.k'
  )) JT`;

// RN-013: tudo que torna a gravacao valida, num booleano so. Vai em TODAS as
// instrucoes de escrita: dado invalido nao muda nenhuma linha (D-902).
const ITENS_VALIDOS = `(SELECT CASE WHEN COUNT(*) >= 1
      AND COUNT(DISTINCT JT.P) = COUNT(*)
      AND SUM(CASE WHEN JT.P IS NULL OR JT.Q IS NULL OR JT.Q < 1 OR CAST(JT.Q AS SIGNED) <> JT.Q
                 OR JT.C IS NULL OR JT.C < 0 OR JT.V IS NULL OR JT.V < 0 OR JT.M IS NULL
                 OR COALESCE(JT.K, 0) < 0 OR COALESCE(JT.T, '') NOT IN ('PADRAO', 'ESPECIAL', 'SEM_CUSTO')
            THEN 1 ELSE 0 END) = 0
    THEN 1 ELSE 0 END FROM ${ITENS}) = 1`;

const PODE_GRAVAR = `CHAR_LENGTH(TRIM('{{nome}}')) BETWEEN 1 AND 220
  AND '{{agora}}' <> ''
  AND ${clienteNaCarteira(CLIENTE)}
  AND ${ITENS_VALIDOS}
  AND ${SEM_BLOQUEIO}`;

// Totais recalculados pelo servidor a partir dos itens (RN-005, RN-013).
// `* 100.0` antes da divisao: sem isso, inteiro / inteiro trunca no SQLite.
const TOTAL_CUSTO = `(SELECT ROUND(SUM(JT.Q * JT.C), 2) FROM ${ITENS})`;
const TOTAL_VENDA = `(SELECT ROUND(SUM(JT.Q * JT.V), 2) FROM ${ITENS})`;
const MARGEM_MEDIA = `(SELECT CASE WHEN SUM(JT.Q * JT.V) = 0 THEN 0
    ELSE ROUND((SUM(JT.Q * JT.V) - SUM(JT.Q * JT.C)) * 100.0 / SUM(JT.Q * JT.V), 2) END FROM ${ITENS})`;

const COLUNAS_ITEM = `(ID_MIX, ID_PRODUTO, QUANTIDADE, TIPO_CUSTO, CUSTO_UNITARIO, MARGEM_PERCENT, PRECO_VENDA, PRECO_CONCORRENTE, CMV_PERCENT)`;
const VALORES_ITEM = `M.ID, JT.P, JT.Q, JT.T, JT.C, JT.M, JT.V, NULLIF(JT.K, 0),
  CASE WHEN COALESCE(JT.K, 0) > 0 THEN ROUND(JT.C * 100.0 / JT.K, 2) ELSE NULL END`;

const SEM_ITENS = `NOT EXISTS (SELECT 1 FROM PRODUCT_MIX_ITEMS IX WHERE IX.ID_MIX = M.ID)`;
const DO_DONO = `SELECT MD.ID FROM PRODUCT_MIX MD WHERE MD.ID = ${MIX} AND MD.ID_USUARIO_CRIACAO = :VAR_USER`;
// UPDATE/DELETE na propria PRODUCT_MIX nao pode ter subconsulta nela (MySQL 1093).
const MEU_MIX = `ID = ${MIX} AND ID_USUARIO_CRIACAO = :VAR_USER`;

const naLista = (coluna) => `CONCAT(',', '{{produtos}}', ',') LIKE CONCAT('%,', ${coluna}, ',%')`;

/* ─────────────── definicoes ─────────────── */

export const definitions = [
  {
    name: 's360MixClientesBuscar',
    type: 'SQL',
    description: 'Clientes da carteira do usuario (com os herdados por ferias ativas) para o Mix Builder; ate 20. Params: busca, buscaDigitos (CNPJ so digitos, vazio desliga), hoje AAAA-MM-DD.',
    code: `SELECT C.ID, COALESCE(C.WINTHOR_CODCLI, C.ID) AS CODIGO, ${NOME_CLIENTE('C')} AS NOME
FROM CLIENTES C
WHERE ${clienteNaCarteira('C.ID')}
  AND ${SEM_BLOQUEIO}
  AND (TRIM('{{busca}}') = ''
    OR ${contem('C.NOME_FANTASIA')}
    OR ${contem('C.RAZAO_SOCIAL')}
    OR CAST(COALESCE(C.WINTHOR_CODCLI, C.ID) AS CHAR) LIKE CONCAT(TRIM('{{busca}}'), '%')
    OR ('{{buscaDigitos}}' <> '' AND REPLACE(REPLACE(REPLACE(C.CNPJ, '.', ''), '/', ''), '-', '') LIKE CONCAT('%', '{{buscaDigitos}}', '%')))
ORDER BY NOME, C.ID
LIMIT 20`,
  },
  {
    name: 's360MixCatalogoBuscar',
    type: 'SQL',
    description: 'Catalogo de produtos ativos por nome, codigo, codigo de fabrica ou auxiliar; ate 8, com foto segura. Params: busca (vazio = nada).',
    code: `SELECT P.CODPROD, P.NOME, P.CODFAB, ${CATEGORIA} AS CATEGORIA, ${FOTO} AS FOTO_URL
FROM PRODUTOS_CUSTOS P
LEFT JOIN MIX_PRODUTO_FOTO F ON F.CODPROD = P.CODPROD
WHERE P.ATIVO = 1
  AND TRIM('{{busca}}') <> ''
  AND (${contem('P.NOME')}
    OR CAST(P.CODPROD AS CHAR) LIKE CONCAT(TRIM('{{busca}}'), '%')
    OR P.CODFAB LIKE CONCAT(TRIM('{{busca}}'), '%')
    OR P.CODAUXILIAR LIKE CONCAT(TRIM('{{busca}}'), '%'))
  AND ${SEM_BLOQUEIO}
ORDER BY P.NOME, P.CODPROD
LIMIT 8`,
  },
  {
    // RN-007 (padrao so > 0), RN-008 (especial ativo, vigente e do cliente,
    // vinculado ou geral). Cliente fora da carteira nao recebe nada (RN-012).
    name: 's360MixCustosOpcoes',
    type: 'SQL',
    description: 'Opcoes de custo (PADRAO/ESPECIAL) dos produtos para um cliente da carteira. Params: clienteId, produtos ("9714,9715"), hoje AAAA-MM-DD.',
    code: `SELECT X.CODPROD, X.TIPO_CUSTO, X.CUSTO, X.POLITICA_ID, X.POLITICA_NOME
FROM (
  SELECT CP.CODPROD, 'PADRAO' AS TIPO_CUSTO, ROUND(CP.CUSTO, 2) AS CUSTO, 0 AS POLITICA_ID, '' AS POLITICA_NOME
  FROM CUSTO_PADRAO_PRODUTO CP
  WHERE CP.CUSTO > 0 AND ${naLista('CP.CODPROD')}
  UNION ALL
  SELECT CE.CODPROD, 'ESPECIAL', ROUND(CE.CUSTO, 2), CE.POLITICA_ID, CE.POLITICA_NOME
  FROM CUSTO_ESPECIAL_PRODUTO CE
  CROSS JOIN (SELECT CA.ID, COALESCE(CA.WINTHOR_CODCLI, CA.ID) AS CODCLI FROM CLIENTES CA WHERE CA.ID = ${CLIENTE}) A
  WHERE CE.STATUS = 'ACTIVE'
    AND CE.DATA_INICIO <= '{{hoje}}' AND CE.DATA_FIM >= '{{hoje}}'
    AND ${naLista('CE.CODPROD')}
    AND (CE.CLIENTE_ID IN (A.ID, A.CODCLI)
      OR EXISTS (SELECT 1 FROM CUSTO_ESPECIAL_CLIENTES_BIG V
                 WHERE V.CUSTO_ESPECIAL_ID = CE.ITEM_ID AND V.CLIENTE_ID IN (A.ID, A.CODCLI))
      OR (CE.CLIENTE_ID IS NULL
          AND NOT EXISTS (SELECT 1 FROM CUSTO_ESPECIAL_CLIENTES_BIG V2 WHERE V2.CUSTO_ESPECIAL_ID = CE.ITEM_ID)))
) X
WHERE ${clienteNaCarteira(CLIENTE)}
  AND ${SEM_BLOQUEIO}
ORDER BY X.CODPROD, X.TIPO_CUSTO DESC, X.CUSTO, X.POLITICA_NOME`,
  },
  {
    name: 's360MixCustosStatus',
    type: 'SQL',
    description: 'Ultima atualizacao dos custos (UTC, AAAA-MM-DDTHH:MM:SS). Sem parametros.',
    code: `SELECT MAX(CASE WHEN S.CHAVE = 'LAST_SUCCESS_AT' THEN S.VALOR END) AS ULTIMA_ATUALIZACAO
FROM MIX_CUSTOS_SYNC S
WHERE ${SEM_BLOQUEIO}`,
  },
  {
    // RN-011: so os mixes de quem chama, nem o substituto ve os da titular.
    name: 's360MixListar',
    type: 'SQL',
    description: 'Mixes do usuario, 20 por pagina, mais recente primeiro, com TOTAL e NA_CARTEIRA. Params: offset, hoje AAAA-MM-DD.',
    code: `SELECT M.ID, M.NOME, M.DESCRICAO, M.ID_CLIENTE AS CLIENTE_ID,
  COALESCE(CONCAT(COALESCE(C.WINTHOR_CODCLI, C.ID), ' - ', ${NOME_CLIENTE('C')}), CONCAT('Cliente ', M.ID_CLIENTE)) AS CLIENTE,
  M.DT_CRIACAO, M.TOTAL_CUSTO, M.TOTAL_VENDA, M.MARGEM_MEDIA,
  CASE WHEN M.ENVIADO_HISTORICO = 1 THEN 1 ELSE 0 END AS ENVIADO_HISTORICO,
  M.DT_ENVIO_HISTORICO,
  CASE WHEN ${clienteNaCarteira('M.ID_CLIENTE')} THEN 1 ELSE 0 END AS NA_CARTEIRA,
  COUNT(*) OVER () AS TOTAL
FROM PRODUCT_MIX M
LEFT JOIN CLIENTES C ON C.ID = M.ID_CLIENTE
WHERE M.ID_USUARIO_CRIACAO = :VAR_USER
  AND ${SEM_BLOQUEIO}
ORDER BY REPLACE(M.DT_CRIACAO, 'T', ' ') DESC, M.ID DESC
LIMIT 20 OFFSET {{offset}}`,
  },
  {
    name: 's360MixItens',
    type: 'SQL',
    description: 'Itens de um mix do usuario, com nome, categoria e foto do produto. Params: mixId.',
    code: `SELECT I.ID_PRODUTO,
  COALESCE(P.NOME, CONCAT('Produto ', I.ID_PRODUTO)) AS NOME,
  ${CATEGORIA} AS CATEGORIA, ${FOTO} AS FOTO_URL,
  I.QUANTIDADE, I.TIPO_CUSTO, I.CUSTO_UNITARIO, I.MARGEM_PERCENT, I.PRECO_VENDA, I.PRECO_CONCORRENTE
FROM PRODUCT_MIX_ITEMS I
JOIN PRODUCT_MIX M ON M.ID = I.ID_MIX
LEFT JOIN PRODUTOS_CUSTOS P ON P.CODPROD = I.ID_PRODUTO
LEFT JOIN MIX_PRODUTO_FOTO F ON F.CODPROD = I.ID_PRODUTO
WHERE M.ID = ${MIX}
  AND M.ID_USUARIO_CRIACAO = :VAR_USER
  AND ${SEM_BLOQUEIO}
ORDER BY I.ID`,
  },
  {
    // Duas instrucoes (D-902). Toda validacao esta na 1a: invalido = nenhum
    // cabecalho, e a 2a nao acha mix (LAST_INSERT_ID antigo nao casa dono +
    // DT_CRIACAO + sem itens). affectedRows 0 = recusado (RNT-013).
    name: 's360MixCriar',
    type: 'SQL',
    description: 'Cria mix do usuario para cliente da carteira, com itens (JSON) e totais recalculados. Params: nome, descricao, clienteId, itens, agora AAAA-MM-DDTHH:MM:SS, hoje. affectedRows 0 = recusado.',
    code: `INSERT INTO PRODUCT_MIX (NOME, DESCRICAO, ID_CLIENTE, ID_USUARIO_CRIACAO, TOTAL_CUSTO, TOTAL_VENDA, MARGEM_MEDIA, DT_CRIACAO, ENVIADO_HISTORICO)
SELECT TRIM('{{nome}}'), NULLIF(TRIM('{{descricao}}'), ''), C.ID, :VAR_USER, ${TOTAL_CUSTO}, ${TOTAL_VENDA}, ${MARGEM_MEDIA}, '{{agora}}', FALSE
FROM CLIENTES C
WHERE C.ID = ${CLIENTE}
  AND ${PODE_GRAVAR};
INSERT INTO PRODUCT_MIX_ITEMS ${COLUNAS_ITEM}
SELECT ${VALORES_ITEM}
FROM PRODUCT_MIX M
CROSS JOIN ${ITENS}
WHERE M.ID = LAST_INSERT_ID()
  AND M.ID_USUARIO_CRIACAO = :VAR_USER
  AND M.DT_CRIACAO = '{{agora}}'
  AND ${SEM_ITENS}`,
  },
  {
    // Tres instrucoes, cada uma com dono + PODE_GRAVAR: dado invalido ou
    // cliente fora da carteira (C-017) nao muda nada.
    name: 's360MixAtualizar',
    type: 'SQL',
    description: 'Atualiza mix do usuario e substitui os itens. Params: mixId, nome, descricao, clienteId, itens, agora, hoje. affectedRows 0 = recusado.',
    code: `UPDATE PRODUCT_MIX
SET NOME = TRIM('{{nome}}'),
    DESCRICAO = NULLIF(TRIM('{{descricao}}'), ''),
    ID_CLIENTE = ${CLIENTE},
    TOTAL_CUSTO = ${TOTAL_CUSTO},
    TOTAL_VENDA = ${TOTAL_VENDA},
    MARGEM_MEDIA = ${MARGEM_MEDIA}
WHERE ${MEU_MIX}
  AND ${PODE_GRAVAR};
DELETE FROM PRODUCT_MIX_ITEMS
WHERE ID_MIX IN (${DO_DONO})
  AND ${PODE_GRAVAR};
INSERT INTO PRODUCT_MIX_ITEMS ${COLUNAS_ITEM}
SELECT ${VALORES_ITEM}
FROM PRODUCT_MIX M
CROSS JOIN ${ITENS}
WHERE M.ID = ${MIX}
  AND M.ID_USUARIO_CRIACAO = :VAR_USER
  AND ${SEM_ITENS}
  AND ${PODE_GRAVAR}`,
  },
  {
    name: 's360MixExcluir',
    type: 'SQL',
    description: 'Exclui mix do usuario e seus itens. Params: mixId. affectedRows 0 = nada excluido.',
    code: `DELETE FROM PRODUCT_MIX_ITEMS
WHERE ID_MIX IN (${DO_DONO})
  AND ${SEM_BLOQUEIO};
DELETE FROM PRODUCT_MIX
WHERE ${MEU_MIX}
  AND ${SEM_BLOQUEIO}`,
  },
  {
    // RN-016: reenviar so atualiza a data.
    name: 's360MixEnviarHistorico',
    type: 'SQL',
    description: 'Registra o envio do mix do usuario ao historico do cliente. Params: mixId, agora AAAA-MM-DDTHH:MM:SS. affectedRows 0 = recusado.',
    code: `UPDATE PRODUCT_MIX
SET ENVIADO_HISTORICO = TRUE,
    DT_ENVIO_HISTORICO = '{{agora}}'
WHERE ${MEU_MIX}
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

if (isEntrypoint()) {
  if (!projectId) throw new Error('MITRA_PROJECT_ID ausente no .env');
  console.log(`Publicando ${definitions.length} server functions (spec 009)...`);
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
  console.log('\nPronto. Agora: node add-000-perfil-acesso.mjs && npm run sync:function-map');
}
