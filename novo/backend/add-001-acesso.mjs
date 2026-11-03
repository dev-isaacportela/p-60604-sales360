// Spec 001 — acesso, perfis, menu, configuracoes do usuario.
//
// NAO EXECUTE ESTE ARQUIVO DA MAQUINA LOCAL: o mitra-sdk nao gera migration;
// rodar daqui aplica em producao sem historia. So no sandbox:
//   cd novo/backend && node add-001-acesso.mjs && node add-000-perfil-acesso.mjs
//
// Cria USUARIO_PAPEL (acrescimo aprovado em 2026-10-30), copia os papeis de
// USUARIO_CARGO uma vez e publica as SFs `s360*` (upsert por nome). Rodar de
// novo nao duplica nada.
//
// `definitions` e exportado para o simulador executar o mesmo SQL publicado.
// Nomes aqui sao o contrato com novo/frontend/src/lib/server-functions.ts.

import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import {
  configureSdkMitra,
  listServerFunctionsMitra,
  createServerFunctionMitra,
  updateServerFunctionMitra,
  runDdlMitra,
  runDmlMitra,
} from 'mitra-sdk';
import { SEM_BLOQUEIO, temPapel, COORDENADOR_ATIVO } from './lib/guardas.mjs';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

/* ─────────────── tabela nova ─────────────── */

// Papeis acumulam (RNT-001). ATRIBUIDO_POR nulo = carga inicial.
const DDL_USUARIO_PAPEL = `CREATE TABLE IF NOT EXISTS USUARIO_PAPEL (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    USER_ID INT NOT NULL,
    PAPEL VARCHAR(20) NOT NULL,
    ATRIBUIDO_POR INT NULL,
    ATRIBUIDO_EM VARCHAR(19) NULL,
    UNIQUE KEY UX_USUARIO_PAPEL (USER_ID, PAPEL)
  )`;

const PAPEIS = `'VENDEDOR', 'COORDENADOR', 'DIRETORIA', 'GESTOR', 'ADMIN'`;

export const cargaInicial = (agora) => `INSERT INTO USUARIO_PAPEL (USER_ID, PAPEL, ATRIBUIDO_POR, ATRIBUIDO_EM)
SELECT C.USER_ID, C.CARGO, NULL, '${agora}'
FROM USUARIO_CARGO C
WHERE C.CARGO IN (${PAPEIS})
  AND NOT EXISTS (SELECT 1 FROM USUARIO_PAPEL P WHERE P.USER_ID = C.USER_ID AND P.PAPEL = C.CARGO)`;

/* ─────────────── definicoes ─────────────── */

const ULTIMA_PREFERENCIA = `(SELECT MAX(P2.ID) FROM USUARIO_PREFERENCIAS P2 WHERE P2.USER_ID = :VAR_USER)`;

// Ferias da pessoa como titular ou como substituta (RN-012): a atual, ou a
// proxima se nao houver atual. Sem sobreposicao (RNT-010), a primeira que
// ainda nao terminou e a certa.
const ferias = (papel, minhaColuna, outraColuna, nomeReserva) => `SELECT '${papel}' AS PAPEL_FERIAS,
    CASE WHEN F.DT_INICIO <= '{{hoje}}' THEN 'ATIVA' ELSE 'FUTURA' END AS ESTADO,
    DATE_FORMAT(F.DT_INICIO, '%Y-%m-%d') AS DT_INICIO,
    DATE_FORMAT(F.DT_FIM, '%Y-%m-%d') AS DT_FIM,
    COALESCE(NULLIF(TRIM(OU.NOME), ''), OU.DESCR, F.${nomeReserva}) AS OUTRA_PESSOA
  FROM VENDEDOR_RCA V
  JOIN FERIAS_VENDEDOR F ON F.${minhaColuna} = V.COD_RCA
  LEFT JOIN VENDEDOR_RCA OV ON OV.COD_RCA = F.${outraColuna}
  LEFT JOIN INT_USER OU ON OU.ID = OV.USER_ID
  WHERE V.USER_ID = :VAR_USER
    AND F.ATIVO = 1
    AND F.DT_FIM >= '{{hoje}}'
    AND ${SEM_BLOQUEIO}
  ORDER BY F.DT_INICIO
  LIMIT 1`;

export const definitions = [
  {
    // Nao tem guarda de bloqueio: precisa DEVOLVER o bloqueio para a tela
    // encerrar a sessao (C-006).
    name: 's360SessaoObter',
    type: 'SQL',
    description: 'Sessao do usuario: identidade, papeis (uniao USUARIO_PAPEL + USUARIO_CARGO), coordenador ativo, bloqueio, configuracao e preferencias. Params: hoje AAAA-MM-DD.',
    code: `SELECT U.ID AS USER_ID,
  U.DESCR AS EMAIL,
  COALESCE(NULLIF(TRIM(U.NOME), ''), U.DESCR) AS NOME_EXIBICAO,
  COALESCE((SELECT GROUP_CONCAT(X.PAPEL SEPARATOR ',') FROM (
      SELECT UPA.PAPEL FROM USUARIO_PAPEL UPA WHERE UPA.USER_ID = :VAR_USER AND UPA.PAPEL IN (${PAPEIS})
      UNION
      SELECT UCA.CARGO FROM USUARIO_CARGO UCA WHERE UCA.USER_ID = :VAR_USER AND UCA.CARGO IN (${PAPEIS})
    ) X), 'VENDEDOR') AS PAPEIS,
  CASE WHEN ${COORDENADOR_ATIVO} THEN 1 ELSE 0 END AS COORDENADOR_ATIVO,
  CASE WHEN ${SEM_BLOQUEIO} THEN 0 ELSE 1 END AS BLOQUEADO,
  CASE WHEN EXISTS (SELECT 1 FROM VENDEDOR_RCA VR WHERE VR.USER_ID = :VAR_USER)
         OR EXISTS (SELECT 1 FROM BU_VENDEDOR BV WHERE BV.VENDEDOR_ID = :VAR_USER AND BV.ATIVO = 1)
       THEN 1 ELSE 0 END AS CONFIGURADO,
  COALESCE(NULLIF(P.MODO_AGENDA, ''), 'SEMANA') AS MODO_AGENDA,
  COALESCE(NULLIF(P.EXIBICAO_TAREFAS, ''), 'LISTA') AS EXIBICAO_TAREFAS,
  COALESCE(NULLIF(P.PAGINA_INICIAL, ''), '/') AS PAGINA_INICIAL
FROM INT_USER U
LEFT JOIN USUARIO_PREFERENCIAS P ON P.ID = ${ULTIMA_PREFERENCIA}
WHERE U.ID = :VAR_USER`,
  },
  {
    name: 's360ContadoresObter',
    type: 'SQL',
    description: 'Contadores do menu: atividades pendentes ou em andamento e alertas nao lidos do usuario. Sem parametros.',
    code: `SELECT
  (SELECT COUNT(*) FROM TAREFAS T WHERE T.VENDEDOR_ID = :VAR_USER AND T.STATUS IN ('PENDENTE', 'EM_ANDAMENTO')) AS ATIVIDADES_PENDENTES,
  (SELECT COUNT(*) FROM ALERTAS_INTELIGENTES A WHERE A.ID_VENDEDOR = :VAR_USER AND A.LIDO = 0) AS ALERTAS_NAO_LIDOS
FROM INT_USER U
WHERE U.ID = :VAR_USER
  AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360FeriasMinhasObter',
    type: 'SQL',
    description: 'Ferias do usuario como titular e como substituto (atual ou proxima). Params: hoje AAAA-MM-DD.',
    code: `SELECT T.* FROM (${ferias('TITULAR', 'COD_RCA', 'COD_RCA_SUBSTITUTO', 'RCA_SUBSTITUTO')}) T
UNION ALL
SELECT S.* FROM (${ferias('SUBSTITUTO', 'COD_RCA_SUBSTITUTO', 'COD_RCA', 'RCA')}) S`,
  },
  {
    name: 's360ConfiguracoesGarantir',
    type: 'SQL',
    description: 'Cria a linha de preferencias do usuario com os padroes, so se nao existir. Params: agora AAAA-MM-DDTHH:MM:SS.',
    code: `INSERT INTO USUARIO_PREFERENCIAS (USER_ID, MODO_AGENDA, EXIBICAO_TAREFAS, PAGINA_INICIAL, ATUALIZADO_EM)
SELECT U.ID, 'SEMANA', 'LISTA', '/', REPLACE('{{agora}}', 'T', ' ')
FROM INT_USER U
WHERE U.ID = :VAR_USER
  AND NOT EXISTS (SELECT 1 FROM USUARIO_PREFERENCIAS P WHERE P.USER_ID = :VAR_USER)
  AND ${SEM_BLOQUEIO}`,
  },
  {
    // Uma instrucao so: nome e preferencias gravam juntos ou nada (RN-014).
    // ATUALIZADO_EM sempre muda, entao 0 linhas = validacao recusou (RNT-013).
    // ponytail: dois cliques no mesmo segundo com os mesmos valores dao 0
    // linhas no MySQL; a tela trava o botao enquanto salva.
    name: 's360ConfiguracoesSalvar',
    type: 'SQL',
    description: 'Salva nome de exibicao e preferencias do usuario. Params: nome (<=120, vazio = nome da conta), modoAgenda DIA|SEMANA|MES, exibicaoAtividades LISTA|KANBAN, paginaInicial, agora. Devolve affectedRows; 0 = recusado.',
    code: `UPDATE INT_USER U
JOIN USUARIO_PREFERENCIAS P ON P.USER_ID = U.ID
SET U.NOME = NULLIF(TRIM('{{nome}}'), ''),
    P.MODO_AGENDA = '{{modoAgenda}}',
    P.EXIBICAO_TAREFAS = '{{exibicaoAtividades}}',
    P.PAGINA_INICIAL = '{{paginaInicial}}',
    P.ATUALIZADO_EM = REPLACE('{{agora}}', 'T', ' ')
WHERE U.ID = :VAR_USER
  AND '{{modoAgenda}}' IN ('DIA', 'SEMANA', 'MES')
  AND '{{exibicaoAtividades}}' IN ('LISTA', 'KANBAN')
  AND '{{paginaInicial}}' IN ('/', '/agenda', '/clientes', '/tarefas', '/simulacao', '/analytics', '/painel-gestao')
  AND ('{{paginaInicial}}' <> '/painel-gestao' OR ${temPapel('GESTOR', 'ADMIN')})
  AND CHAR_LENGTH(TRIM('{{nome}}')) <= 120
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
  const agora = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await runDdlMitra({ projectId, sql: DDL_USUARIO_PAPEL });
  const carga = await runDmlMitra({ projectId, sql: cargaInicial(agora) });
  console.log(`USUARIO_PAPEL pronta; carga inicial: ${carga?.result?.rowsAffected ?? carga?.result?.affectedRows ?? '?'} papel(is) copiado(s).`);
  console.log(`Publicando ${definitions.length} server functions (spec 001)...`);
  await upsert();
  console.log('\nPronto. Agora: node add-000-perfil-acesso.mjs && npm run sync:function-map');
}
