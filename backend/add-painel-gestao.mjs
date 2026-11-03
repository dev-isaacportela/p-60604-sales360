import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
  runDmlMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

function isAlreadyExistsError(error) {
  const message = `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
  return message.includes('already exists') || message.includes('duplicate');
}

async function ensureUsuarioCargoTable() {
  try {
    await runDdlMitra({
      projectId,
      sql: `CREATE TABLE USUARIO_CARGO (
        ID INT AUTO_INCREMENT PRIMARY KEY,
        USER_ID INT NOT NULL,
        CARGO VARCHAR(30) NOT NULL,
        ATUALIZADO_EM VARCHAR(19),
        UNIQUE KEY UX_USUARIO_CARGO_USER (USER_ID)
      );`,
    });
    console.log('Tabela USUARIO_CARGO criada.');
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
    console.log('Tabela USUARIO_CARGO já existe.');
  }

  await runDmlMitra({
    projectId,
    sql: `
      INSERT INTO USUARIO_CARGO (USER_ID, CARGO, ATUALIZADO_EM)
      SELECT U.ID, 'VENDEDOR', SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      FROM INT_USER U
      WHERE NOT EXISTS (
        SELECT 1 FROM USUARIO_CARGO UC WHERE UC.USER_ID = U.ID
      )
    `,
  });

  await runDmlMitra({
    projectId,
    sql: `
      UPDATE USUARIO_CARGO
      SET CARGO = 'ADMIN', ATUALIZADO_EM = SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      WHERE USER_ID = 0
    `,
  });

  console.log('USUARIO_CARGO sincronizada (default VENDEDOR + owner ADMIN).');
}

const serverFunctions = [
  {
    name: 'painelGestaoPermissao',
    description: 'Retorna se o usuário atual pode acessar o painel de gestão (GESTOR/ADMIN).',
    code: `
      SELECT
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM USUARIO_CARGO UC
            WHERE UC.USER_ID = :VAR_USER
              AND UC.CARGO IN ('GESTOR', 'ADMIN')
          ) THEN 1
          ELSE 0
        END AS PODE_ACESSAR,
        COALESCE((
          SELECT UC.CARGO
          FROM USUARIO_CARGO UC
          WHERE UC.USER_ID = :VAR_USER
          LIMIT 1
        ), 'VENDEDOR') AS CARGO_ATUAL
    `,
  },
  {
    name: 'painelGestaoVendedores',
    description: 'Lista usuários da equipe para filtro no painel de gestão.',
    code: `
      SELECT
        U.ID AS VENDEDOR_ID,
        COALESCE(F.NOME, U.DESCR) AS VENDEDOR_NOME,
        U.DESCR AS EMAIL,
        COALESCE(UC.CARGO, 'VENDEDOR') AS CARGO
      FROM INT_USER U
      LEFT JOIN FUNCIONARIOS F ON F.ID = U.ID
      LEFT JOIN USUARIO_CARGO UC ON UC.USER_ID = U.ID
      ORDER BY VENDEDOR_NOME
    `,
  },
  {
    name: 'painelGestaoResumo',
    description: 'Retorna KPIs de receita/meta para visão gerencial com filtro opcional por vendedor.',
    code: `
      SELECT
        BASE.REALIZADO_MES,
        BASE.META_MES,
        CASE
          WHEN BASE.META_MES > 0 THEN ROUND((BASE.REALIZADO_MES / BASE.META_MES) * 100, 1)
          ELSE 0
        END AS ATINGIMENTO_PERC,
        (BASE.META_MES - BASE.REALIZADO_MES) AS GAP_META,
        BASE.CLIENTES_ATIVOS,
        BASE.ATIVIDADES_PENDENTES
      FROM (
        SELECT
          (
            SELECT COALESCE(SUM(M.VALOR_REALIZADO), 0)
            FROM METAS M
            WHERE M.MES = MONTH(CURRENT_DATE)
              AND M.ANO = YEAR(CURRENT_DATE)
              AND ('{{vendedorId}}' = '' OR M.VENDEDOR_ID = {{vendedorId}})
          ) AS REALIZADO_MES,
          (
            SELECT COALESCE(SUM(M.VALOR_META), 0)
            FROM METAS M
            WHERE M.MES = MONTH(CURRENT_DATE)
              AND M.ANO = YEAR(CURRENT_DATE)
              AND ('{{vendedorId}}' = '' OR M.VENDEDOR_ID = {{vendedorId}})
          ) AS META_MES,
          (
            SELECT COUNT(*)
            FROM CLIENTES C
            WHERE C.STATUS = 'ATIVO'
              AND ('{{vendedorId}}' = '' OR C.VENDEDOR_ID = {{vendedorId}})
          ) AS CLIENTES_ATIVOS,
          (
            SELECT COUNT(*)
            FROM VISITAS V
            WHERE V.STATUS IN ('AGENDADA', 'EM_ANDAMENTO')
              AND V.DATA_AGENDADA <= CURRENT_DATE
              AND ('{{vendedorId}}' = '' OR V.VENDEDOR_ID = {{vendedorId}})
          ) AS ATIVIDADES_PENDENTES
      ) BASE
    `,
  },
  {
    name: 'painelGestaoOperacional',
    description: 'Lista itens operacionais prioritários do gestor com filtro opcional por vendedor.',
    code: `
      SELECT
        ITENS.TIPO,
        ITENS.REGISTRO_ID,
        ITENS.VENDEDOR_ID,
        ITENS.RESPONSAVEL,
        ITENS.ITEM,
        ITENS.STATUS,
        ITENS.DATA_REFERENCIA,
        ITENS.PRIORIDADE,
        ITENS.ACAO_RECOMENDADA
      FROM (
        SELECT
          'TAREFA' AS TIPO,
          T.ID AS REGISTRO_ID,
          T.VENDEDOR_ID,
          COALESCE(F.NOME, U.DESCR) AS RESPONSAVEL,
          T.TITULO AS ITEM,
          T.STATUS,
          T.DATA_LIMITE AS DATA_REFERENCIA,
          T.PRIORIDADE,
          CASE
            WHEN T.DATA_LIMITE < CURRENT_DATE THEN 'Cobrar conclusão imediata'
            WHEN T.STATUS = 'EM_ANDAMENTO' THEN 'Acompanhar andamento'
            ELSE 'Priorizar na próxima rotina'
          END AS ACAO_RECOMENDADA,
          CASE
            WHEN T.DATA_LIMITE < CURRENT_DATE THEN 1
            WHEN T.STATUS = 'PENDENTE' THEN 2
            ELSE 3
          END AS ORDEM_PRIORIDADE
        FROM TAREFAS T
        LEFT JOIN INT_USER U ON U.ID = T.VENDEDOR_ID
        LEFT JOIN FUNCIONARIOS F ON F.ID = T.VENDEDOR_ID
        WHERE T.STATUS IN ('PENDENTE', 'EM_ANDAMENTO')
          AND ('{{vendedorId}}' = '' OR T.VENDEDOR_ID = {{vendedorId}})

        UNION ALL

        SELECT
          'VISITA' AS TIPO,
          V.ID AS REGISTRO_ID,
          V.VENDEDOR_ID,
          COALESCE(F2.NOME, U2.DESCR) AS RESPONSAVEL,
          CONCAT('Visita ', COALESCE(C.NOME_FANTASIA, 'Cliente sem nome')) AS ITEM,
          V.STATUS,
          V.DATA_AGENDADA AS DATA_REFERENCIA,
          '-' AS PRIORIDADE,
          CASE
            WHEN V.DATA_AGENDADA < CURRENT_DATE THEN 'Reagendar ou concluir hoje'
            ELSE 'Confirmar agenda com cliente'
          END AS ACAO_RECOMENDADA,
          CASE
            WHEN V.DATA_AGENDADA < CURRENT_DATE THEN 1
            ELSE 2
          END AS ORDEM_PRIORIDADE
        FROM VISITAS V
        JOIN CLIENTES C ON C.ID = V.CLIENTE_ID
        LEFT JOIN INT_USER U2 ON U2.ID = V.VENDEDOR_ID
        LEFT JOIN FUNCIONARIOS F2 ON F2.ID = V.VENDEDOR_ID
        WHERE V.STATUS IN ('AGENDADA', 'EM_ANDAMENTO')
          AND ('{{vendedorId}}' = '' OR V.VENDEDOR_ID = {{vendedorId}})
      ) ITENS
      ORDER BY ITENS.ORDEM_PRIORIDADE, ITENS.DATA_REFERENCIA, ITENS.RESPONSAVEL
      LIMIT 60
    `,
  },
];

async function upsertServerFunctions() {
  const list = await listServerFunctionsMitra({ projectId });
  const existing = list?.result || [];
  const ids = {};

  for (const sf of serverFunctions) {
    const found = existing.find((item) => item.name === sf.name);

    if (found) {
      await updateServerFunctionMitra({
        projectId,
        serverFunctionId: found.id,
        code: sf.code,
        description: sf.description,
      });
      ids[sf.name] = found.id;
      continue;
    }

    const created = await createServerFunctionMitra({
      projectId,
      name: sf.name,
      type: 'SQL',
      code: sf.code,
      description: sf.description,
    });

    ids[sf.name] = created?.result?.serverFunctionId || created?.result?.id || created?.serverFunctionId || created?.id;
  }

  return ids;
}

async function main() {
  await ensureUsuarioCargoTable();
  const ids = await upsertServerFunctions();
  console.log('Painel de gestão configurado com sucesso.');
  console.log(JSON.stringify(ids, null, 2));
}

main().catch((error) => {
  console.error('Erro ao configurar painel de gestão:');
  console.error(error?.message || error);
  process.exit(1);
});
