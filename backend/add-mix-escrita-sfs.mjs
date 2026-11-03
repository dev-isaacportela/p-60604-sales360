import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  listServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

// Colunas lidas do JSON de itens enviado pela tela. Todos os campos sao numericos,
// exceto TIPO_CUSTO (a tela higieniza para [A-Z_]), entao o JSON nunca contem aspas simples.
const ITENS_JSON_COLUMNS = `
  COLUMNS (
    ID_PRODUTO INT PATH '$.p',
    QUANTIDADE INT PATH '$.q',
    TIPO_CUSTO VARCHAR(40) PATH '$.t',
    CUSTO_UNITARIO DECIMAL(12,2) PATH '$.c',
    MARGEM_PERCENT DECIMAL(7,2) PATH '$.m',
    PRECO_VENDA DECIMAL(12,2) PATH '$.v',
    PRECO_CONCORRENTE DECIMAL(12,2) PATH '$.k',
    CMV_PERCENT DECIMAL(7,2) PATH '$.x'
  )`;

const ITENS_SELECT = `
  jt.ID_PRODUTO,
  jt.QUANTIDADE,
  COALESCE(NULLIF(jt.TIPO_CUSTO, ''), 'SEM_CUSTO'),
  jt.CUSTO_UNITARIO,
  jt.MARGEM_PERCENT,
  jt.PRECO_VENDA,
  jt.PRECO_CONCORRENTE,
  jt.CMV_PERCENT`;

const ITENS_COLS = `(ID_MIX, ID_PRODUTO, QUANTIDADE, TIPO_CUSTO, CUSTO_UNITARIO, MARGEM_PERCENT, PRECO_VENDA, PRECO_CONCORRENTE, CMV_PERCENT)`;

// O dono e sempre :VAR_USER (resolvido no servidor). A tela NUNCA informa a identidade.
const MIX_CRIAR = `
INSERT INTO PRODUCT_MIX (NOME, DESCRICAO, ID_CLIENTE, ID_USUARIO_CRIACAO, TOTAL_CUSTO, TOTAL_VENDA, MARGEM_MEDIA, DT_CRIACAO)
VALUES (
  '{{nome}}',
  '{{descricao}}',
  CAST('{{clienteId}}' AS UNSIGNED),
  :VAR_USER,
  CAST('{{totalCusto}}' AS DECIMAL(14,2)),
  CAST('{{totalVenda}}' AS DECIMAL(14,2)),
  CAST('{{margemMedia}}' AS DECIMAL(7,2)),
  '{{dtCriacao}}'
);

INSERT INTO PRODUCT_MIX_ITEMS ${ITENS_COLS}
SELECT
  LAST_INSERT_ID(),${ITENS_SELECT}
FROM JSON_TABLE('{{itensJson}}', '$[*]'${ITENS_JSON_COLUMNS}) jt;

SELECT MAX(ID) AS ID FROM PRODUCT_MIX WHERE ID_USUARIO_CRIACAO = :VAR_USER;
`.trim();

// UPDATE, DELETE e INSERT sao todos filtrados por :VAR_USER: um mixId de outro
// usuario simplesmente nao casa em nenhuma das tres etapas.
const MIX_ATUALIZAR = `
UPDATE PRODUCT_MIX
SET NOME = '{{nome}}',
    DESCRICAO = '{{descricao}}',
    ID_CLIENTE = CAST('{{clienteId}}' AS UNSIGNED),
    TOTAL_CUSTO = CAST('{{totalCusto}}' AS DECIMAL(14,2)),
    TOTAL_VENDA = CAST('{{totalVenda}}' AS DECIMAL(14,2)),
    MARGEM_MEDIA = CAST('{{margemMedia}}' AS DECIMAL(7,2))
WHERE ID = CAST('{{mixId}}' AS UNSIGNED)
  AND ID_USUARIO_CRIACAO = :VAR_USER;

DELETE I FROM PRODUCT_MIX_ITEMS I
JOIN PRODUCT_MIX M ON M.ID = I.ID_MIX
WHERE I.ID_MIX = CAST('{{mixId}}' AS UNSIGNED)
  AND M.ID_USUARIO_CRIACAO = :VAR_USER;

INSERT INTO PRODUCT_MIX_ITEMS ${ITENS_COLS}
SELECT
  CAST('{{mixId}}' AS UNSIGNED),${ITENS_SELECT}
FROM JSON_TABLE('{{itensJson}}', '$[*]'${ITENS_JSON_COLUMNS}) jt
WHERE EXISTS (
  SELECT 1 FROM PRODUCT_MIX M
  WHERE M.ID = CAST('{{mixId}}' AS UNSIGNED)
    AND M.ID_USUARIO_CRIACAO = :VAR_USER
);

SELECT ID FROM PRODUCT_MIX
WHERE ID = CAST('{{mixId}}' AS UNSIGNED)
  AND ID_USUARIO_CRIACAO = :VAR_USER;
`.trim();

const MIX_EXCLUIR = `
DELETE I FROM PRODUCT_MIX_ITEMS I
JOIN PRODUCT_MIX M ON M.ID = I.ID_MIX
WHERE I.ID_MIX = CAST('{{mixId}}' AS UNSIGNED)
  AND M.ID_USUARIO_CRIACAO = :VAR_USER;

DELETE FROM PRODUCT_MIX
WHERE ID = CAST('{{mixId}}' AS UNSIGNED)
  AND ID_USUARIO_CRIACAO = :VAR_USER;

SELECT COUNT(*) AS RESTANTES FROM PRODUCT_MIX
WHERE ID = CAST('{{mixId}}' AS UNSIGNED)
  AND ID_USUARIO_CRIACAO = :VAR_USER;
`.trim();

// SF multi-statement iniciada por DML devolve apenas { affectedRows } — o SELECT final
// e descartado pela plataforma. Por isso o ID do mix recem-criado vem por esta SF,
// sempre restrita ao proprio usuario.
const MIX_ULTIMO_CRIADO = `
SELECT MAX(ID) AS ID FROM PRODUCT_MIX WHERE ID_USUARIO_CRIACAO = :VAR_USER
`.trim();

const serverFunctions = [
  {
    name: 'mixCriar',
    description: 'Cria um mix (cabecalho + itens via JSON) para o usuario logado. Params: nome, descricao, clienteId, totalCusto, totalVenda, margemMedia, dtCriacao, itensJson. Retorna { ID }.',
    code: MIX_CRIAR,
  },
  {
    name: 'mixAtualizar',
    description: 'Atualiza um mix do usuario logado e substitui todos os seus itens. Params: mixId, nome, descricao, clienteId, totalCusto, totalVenda, margemMedia, itensJson. Retorna { ID } quando o mix pertence ao usuario.',
    code: MIX_ATUALIZAR,
  },
  {
    name: 'mixUltimoCriado',
    description: 'Retorna o ID do ultimo mix criado pelo usuario logado. Usado logo apos mixCriar. Sem params.',
    code: MIX_ULTIMO_CRIADO,
  },
  {
    name: 'mixExcluir',
    description: 'Exclui um mix do usuario logado junto com seus itens. Params: mixId. Retorna { RESTANTES: 0 } em caso de sucesso.',
    code: MIX_EXCLUIR,
  },
];

async function main() {
  const listed = await listServerFunctionsMitra({ projectId });
  const existing = listed?.result || listed || [];
  const ids = {};

  for (const sf of serverFunctions) {
    const found = existing.find((item) => item.name === sf.name);

    if (found?.id) {
      await updateServerFunctionMitra({
        projectId,
        serverFunctionId: found.id,
        code: sf.code,
        description: sf.description,
      });
      ids[sf.name] = found.id;
      console.log(`SF ${sf.name} atualizada (id ${found.id}).`);
      continue;
    }

    const created = await createServerFunctionMitra({
      projectId,
      name: sf.name,
      type: 'SQL',
      code: sf.code,
      description: sf.description,
    });

    ids[sf.name] = created?.result?.serverFunctionId || created?.result?.id;
    console.log(`SF ${sf.name} criada (id ${ids[sf.name]}).`);
  }

  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Falha ao criar SFs de escrita do Mix Builder:');
  console.error(error?.message || error);
  process.exit(1);
});
