// Spec 005 — Dashboard (tela inicial).
//
// NAO EXECUTE ESTE ARQUIVO DA MAQUINA LOCAL: o mitra-sdk nao gera migration;
// rodar daqui aplica em producao sem historia. So no sandbox:
//   cd novo/backend && node add-005-dashboard.mjs && node add-003-agenda.mjs && node add-000-perfil-acesso.mjs
//
// Um acrescimo (A2/A3): META_SEMANAL_VISITAS, com a carga inicial 16/8.
// Compromissos, Resumo da Semana, meta semanal e atividades vem das SFs da
// 003 e da 004 (D-501); faturamento, meta do mes e vendas diarias das SFs do
// Analytics (007) e a ultima carga da 006 (D-509). Aqui so os alertas de
// prioridade alta (visibilidade da 008) e a meta semanal configuravel.
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
  runDdlMitra,
  runDmlMitra,
} from 'mitra-sdk';
import { SEM_BLOQUEIO, temPapel } from './lib/guardas.mjs';
import { ESCOPO_SQL, nomeUsuario } from './lib/002-carteira.mjs';
import { AGORA_BR, HOJE_BR } from './lib/003-agenda.mjs';
import { numerico } from './lib/010-gestao.mjs';
import { alertaVisivel } from './lib/008-alertas.mjs';
import { META_INICIAL, metaPerfil } from './lib/005-dashboard.mjs';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

/* ─────────────── tabela nova ─────────────── */

// Meta semanal de visitas por perfil (RF-004): a linha com a maior
// VIGENCIA_INICIO (segunda) <= a segunda da semana vale para a semana.
const DDL_META_SEMANAL = `CREATE TABLE IF NOT EXISTS META_SEMANAL_VISITAS (
    ID INT AUTO_INCREMENT PRIMARY KEY,
    PERFIL VARCHAR(20) NOT NULL,
    VALOR INT NOT NULL,
    VIGENCIA_INICIO VARCHAR(10) NOT NULL,
    ALTERADO_POR INT NULL,
    ALTERADO_EM VARCHAR(19) NULL,
    UNIQUE KEY UX_META_SEMANAL_VISITAS (PERFIL, VIGENCIA_INICIO)
  )`;

const CARGA_INICIAL = `INSERT IGNORE INTO META_SEMANAL_VISITAS (PERFIL, VALOR, VIGENCIA_INICIO)
VALUES ${META_INICIAL.map(([p, v, d]) => `('${p}', ${v}, '${d}')`).join(', ')}`;

/* ─────────────── meta semanal (RF-004) ─────────────── */

const SEGUNDA = "'{{segunda}}'";
const VIGENCIA = "'{{vigencia}}'";
const VALOR = "TRIM('{{valor}}')";

// So diretoria/TI; valor 1..99; vigencia = a proxima segunda pelo relogio do
// servidor (depois de hoje, ate 7 dias, multiplo de 7 dias desde uma segunda).
const PODE_SALVAR = `'{{perfil}}' IN ('VENDEDOR', 'COORDENADOR')
  AND CHAR_LENGTH(${VALOR}) BETWEEN 1 AND 2 AND ${numerico(VALOR)}
  AND CHAR_LENGTH(${VIGENCIA}) = 10 AND ${VIGENCIA} > ${HOJE_BR}
  AND DATEDIFF(${VIGENCIA}, ${HOJE_BR}) <= 7
  AND DATEDIFF(${VIGENCIA}, '2000-01-03') % 7 = 0
  AND ${temPapel('DIRETORIA', 'ADMIN')}
  AND ${SEM_BLOQUEIO}`;

/* ─────────────── definicoes ─────────────── */

const ESCOPO_DESCR = 'Escopo: modo ME|TEAM|SELLER|ALL|COORD, coordenador, vendedor, filial, depto, secao (texto, vazio = sem recorte), hoje AAAA-MM-DD.';

export const definitions = [
  {
    name: 's360DashboardAlertas',
    type: 'SQL',
    description: `Ate 5 alertas nao lidos de prioridade ALTA do escopo, mais recentes primeiro (RF-007, RN-010); visibilidade da tela de Alertas (alertaVisivel da 008). ${ESCOPO_DESCR}`,
    code: `SELECT A.ID, A.TITULO, A.NOME_CLIENTE AS CLIENTE, A.TIPO_ALERTA, A.DATA_GERACAO, ${nomeUsuario('U')} AS VENDEDOR
FROM ALERTAS_INTELIGENTES A
LEFT JOIN INT_USER U ON U.ID = A.ID_VENDEDOR
WHERE COALESCE(A.LIDO, 0) = 0 AND A.PRIORIDADE = 'ALTA'
  AND ${alertaVisivel('A', ESCOPO_SQL)}
  AND ${SEM_BLOQUEIO}
ORDER BY A.DATA_GERACAO DESC, A.ID DESC
LIMIT 5`,
  },
  {
    name: 's360MetaVisitasObter',
    type: 'SQL',
    description: 'Meta semanal de visitas (RN-005, RF-004): VENDEDOR e COORDENADOR da semana que comeca em `segunda`; PROX_VIGENCIA, PROX_VENDEDOR e PROX_COORDENADOR da mudanca ja marcada para depois dela (vazio = nenhuma); PODE_EDITAR (diretoria/TI). Params: segunda AAAA-MM-DD.',
    code: `SELECT ${metaPerfil("'VENDEDOR'", SEGUNDA)} AS VENDEDOR,
  ${metaPerfil("'COORDENADOR'", SEGUNDA)} AS COORDENADOR,
  (SELECT MIN(MS.VIGENCIA_INICIO) FROM META_SEMANAL_VISITAS MS WHERE MS.VIGENCIA_INICIO > ${SEGUNDA}) AS PROX_VIGENCIA,
  ${metaPerfil("'VENDEDOR'", "'9999-12-31'")} AS PROX_VENDEDOR,
  ${metaPerfil("'COORDENADOR'", "'9999-12-31'")} AS PROX_COORDENADOR,
  CASE WHEN ${temPapel('DIRETORIA', 'ADMIN')} THEN 1 ELSE 0 END AS PODE_EDITAR
FROM INT_USER U
WHERE U.ID = :VAR_USER AND ${SEM_BLOQUEIO}`,
  },
  {
    name: 's360MetaVisitasSalvar',
    type: 'SQL',
    description: 'Define a meta semanal de um perfil a partir da proxima segunda (RF-004, RNT-013): so diretoria/TI; atualiza a mudanca ja marcada para aquela segunda ou cria. Params: perfil VENDEDOR|COORDENADOR, valor 1..99, vigencia AAAA-MM-DD (a proxima segunda; o servidor confere). Devolve linhas afetadas.',
    code: `UPDATE META_SEMANAL_VISITAS
SET VALOR = CAST(${VALOR} AS UNSIGNED), ALTERADO_POR = :VAR_USER, ALTERADO_EM = ${AGORA_BR}
WHERE PERFIL = '{{perfil}}' AND VIGENCIA_INICIO = ${VIGENCIA} AND ${PODE_SALVAR};
INSERT INTO META_SEMANAL_VISITAS (PERFIL, VALOR, VIGENCIA_INICIO, ALTERADO_POR, ALTERADO_EM)
SELECT '{{perfil}}', CAST(${VALOR} AS UNSIGNED), ${VIGENCIA}, :VAR_USER, ${AGORA_BR}
FROM INT_USER U
WHERE U.ID = :VAR_USER AND ${PODE_SALVAR}
  AND NOT EXISTS (SELECT 1 FROM META_SEMANAL_VISITAS MS WHERE MS.PERFIL = '{{perfil}}' AND MS.VIGENCIA_INICIO = ${VIGENCIA})`,
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
  await runDdlMitra({ projectId, sql: DDL_META_SEMANAL });
  const carga = await runDmlMitra({ projectId, sql: CARGA_INICIAL });
  console.log(`META_SEMANAL_VISITAS pronta; carga inicial: ${carga?.result?.rowsAffected ?? carga?.result?.affectedRows ?? '?'} linha(s).`);
  console.log(`Publicando ${definitions.length} server functions (spec 005)...`);
  await upsert();
  console.log('\nPronto. Agora: node add-003-agenda.mjs (meta configuravel na Agenda) && node add-000-perfil-acesso.mjs && npm run sync:function-map');
}
