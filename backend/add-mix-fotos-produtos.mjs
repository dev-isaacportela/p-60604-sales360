import 'dotenv/config';
import {
  configureSdkMitra,
  createServerFunctionMitra,
  getProfileDetailsMitra,
  listProfilesMitra,
  listServerFunctionsMitra,
  runDdlMitra,
  setProfileSelectTablesMitra,
  setProfileServerFunctionsMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

/*
 * Foto do produto no Mix Builder, no mesmo sistema de fotos do Pricing Hub (spec 007 de la):
 * o Busca 360 devolve, pelo CODPROD do Winthor, as fotos de cada produto e marca a principal.
 *
 * Diferenca de proposito em relacao ao Pricing Hub: aqui o vendedor e BUSINESS, e SF JAVASCRIPT
 * com acesso BUSINESS nao grava (docs/arquitetura.md). Por isso quem consulta o sistema de fotos
 * e grava o cache e uma SF em cron (roda como Administrator), e a tela so le o cache por SF SQL.
 * A chave do sistema de fotos fica em MIX_FOTOS_CONFIG, fora de todo perfil, e nunca volta
 * em resposta nenhuma.
 */

// Mesma lista de quem ve o Painel Dev (SF 236 suportePainelPermissao).
const QUEM_CONFIGURA = "('ti@benenutri.com', 'isaacportela0903@gmail.com')";
const CRON_FOTOS = '0 0 9 * * *';

const DDL = [
  'CREATE TABLE IF NOT EXISTS MIX_PRODUTO_FOTO (' +
    'CODPROD INT NOT NULL PRIMARY KEY, ' +
    "URL VARCHAR(1000) NOT NULL DEFAULT '', " +
    'NOME_ARQUIVO VARCHAR(255) NULL, ' +
    'BUSCADO_EM VARCHAR(19) NOT NULL' +
    ')',
  'CREATE TABLE IF NOT EXISTS MIX_FOTOS_CONFIG (' +
    'CHAVE VARCHAR(40) NOT NULL PRIMARY KEY, ' +
    'VALOR VARCHAR(1000) NULL, ' +
    'ATUALIZADO_EM VARCHAR(19) NOT NULL, ' +
    'ATUALIZADO_POR INT NULL' +
    ')',
];

// Corpo de mixFotosSincronizar (cron diario + botao do Painel Dev).
const SINCRONIZAR = `const { runDmlMitra, runQueryMitra } = require('mitra-sdk');

const projectId = Number(process.env.MITRA_PROJECT_ID);
const PADRAO = 'https://busca360.benenutri.com/api/admin/product-images';
const LOTE = 200;
const agora = new Date().toISOString().slice(0, 19);

const sqlTexto = (valor, max) => "'" + String(valor ?? '').trim().slice(0, max).replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "''") + "'";
const linhas = async (sql) => (await runQueryMitra({ projectId, sql }))?.result?.rows || [];

async function gravarStatus(chave, valor) {
  await runDmlMitra({
    projectId,
    sql: 'INSERT INTO MIX_FOTOS_CONFIG (CHAVE, VALOR, ATUALIZADO_EM) VALUES (' + sqlTexto(chave, 40) + ', ' + sqlTexto(valor, 1000) + ", '" + agora + "') " +
      'ON DUPLICATE KEY UPDATE VALOR = VALUES(VALOR), ATUALIZADO_EM = VALUES(ATUALIZADO_EM)',
  });
}

// Foto principal; sem marca, a primeira; codigo que nao veio = sem foto (RN-702 do Pricing Hub).
function escolherFoto(imagens) {
  const validas = (Array.isArray(imagens) ? imagens : []).filter((i) => typeof i?.url === 'string');
  const escolhida = validas.find((i) => i.isMain === true) ?? validas[0];
  if (!escolhida || !/^https:\\/\\/\\S+$/.test(escolhida.url) || escolhida.url.length > 1000) return { url: '', nome: '' };
  return { url: escolhida.url, nome: String(escolhida.fileName ?? '') };
}

// A leitura volta no maximo 2.000 linhas: o catalogo vem em paginas.
async function catalogoInteiro() {
  const todos = [];
  for (let offset = 0; ; offset += 1000) {
    const pagina = (await linhas(
      'SELECT CODPROD FROM (SELECT CODPROD FROM PRODUTOS_CUSTOS UNION SELECT CODPROD FROM CUSTO_PADRAO_PRODUTO) P ' +
      'ORDER BY CODPROD LIMIT 1000 OFFSET ' + offset,
    )).map((l) => Number(l.CODPROD)).filter((c) => Number.isInteger(c) && c > 0);
    todos.push(...pagina);
    if (pagina.length < 1000) break;
  }
  return todos;
}

const config = Object.fromEntries((await linhas(
  "SELECT CHAVE, VALOR FROM MIX_FOTOS_CONFIG WHERE CHAVE IN ('FOTOS_URL', 'FOTOS_CHAVE')",
)).map((l) => [l.CHAVE, l.VALOR]));
if (!config.FOTOS_CHAVE) {
  return { rows: [{ OK: false, MENSAGEM: 'Chave do sistema de fotos não cadastrada no Painel Dev.' }] };
}

const pedidos = String(event?.codprods ?? '').split(',').map((c) => c.trim()).filter((c) => /^\\d{1,9}$/.test(c)).map(Number).filter((c) => c > 0);
const codigos = pedidos.length
  ? [...new Set(pedidos)]
  : await catalogoInteiro();

let consultados = 0;
let comFoto = 0;
let erro = '';
for (let i = 0; i < codigos.length; i += LOTE) {
  const lote = codigos.slice(i, i + LOTE);
  let dados;
  try {
    const resposta = await fetch(String(config.FOTOS_URL || PADRAO) + '?codProds=' + lote.join(','), {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + config.FOTOS_CHAVE, Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!resposta.ok) {
      erro = resposta.status === 401 || resposta.status === 403 ? 'O sistema de fotos recusou o acesso' : 'O sistema de fotos respondeu ' + resposta.status;
      break;
    }
    dados = (await resposta.json())?.data;
  } catch {
    erro = 'O sistema de fotos não respondeu';
    break;
  }
  if (!Array.isArray(dados)) {
    erro = 'Resposta do sistema de fotos fora do formato';
    break;
  }

  // Falha no meio deixa intactas as fotos ja guardadas dos lotes seguintes.
  const porCodigo = new Map(dados.map((d) => [Number(d?.codProd), d?.images]));
  const valores = lote.map((codprod) => {
    const foto = escolherFoto(porCodigo.get(codprod));
    if (foto.url) comFoto += 1;
    return '(' + codprod + ', ' + sqlTexto(foto.url, 1000) + ', ' + sqlTexto(foto.nome, 255) + ", '" + agora + "')";
  });
  await runDmlMitra({
    projectId,
    sql: 'INSERT INTO MIX_PRODUTO_FOTO (CODPROD, URL, NOME_ARQUIVO, BUSCADO_EM) VALUES ' + valores.join(', ') + ' ' +
      'ON DUPLICATE KEY UPDATE URL = VALUES(URL), NOME_ARQUIVO = VALUES(NOME_ARQUIVO), BUSCADO_EM = VALUES(BUSCADO_EM)',
  });
  consultados += lote.length;
}

await gravarStatus('LAST_ATTEMPT_AT', agora);
await gravarStatus('LAST_ERROR', erro);
if (!erro) await gravarStatus('LAST_SUCCESS_AT', agora);

return {
  rows: [{
    OK: !erro,
    MENSAGEM: erro || 'Fotos atualizadas',
    CONSULTADOS: consultados,
    COM_FOTO: comFoto,
    TOTAL: codigos.length,
  }],
};
`;

// Corpo de mixFotosTestar: so diz se o sistema de fotos aceita a chave gravada.
const TESTAR = `const { runQueryMitra } = require('mitra-sdk');

const projectId = Number(process.env.MITRA_PROJECT_ID);
const PADRAO = 'https://busca360.benenutri.com/api/admin/product-images';
const rows = (await runQueryMitra({ projectId, sql: "SELECT CHAVE, VALOR FROM MIX_FOTOS_CONFIG WHERE CHAVE IN ('FOTOS_URL', 'FOTOS_CHAVE')" }))?.result?.rows || [];
const config = Object.fromEntries(rows.map((l) => [l.CHAVE, l.VALOR]));
if (!config.FOTOS_CHAVE) return { rows: [{ OK: false, MENSAGEM: 'Informe a chave antes de testar' }] };

try {
  const resposta = await fetch(String(config.FOTOS_URL || PADRAO) + '?codProds=1', {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + config.FOTOS_CHAVE, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (resposta.ok) return { rows: [{ OK: true, MENSAGEM: 'Conexão OK' }] };
  if (resposta.status === 401 || resposta.status === 403) return { rows: [{ OK: false, MENSAGEM: 'O sistema de fotos recusou o acesso' }] };
  return { rows: [{ OK: false, MENSAGEM: 'O sistema de fotos não respondeu (código ' + resposta.status + ')' }] };
} catch {
  return { rows: [{ OK: false, MENSAGEM: 'O sistema de fotos não respondeu' }] };
}
`;

const DEFINICOES = [
  {
    name: 'mixFotos',
    type: 'SQL',
    description: "Mix Builder: endereço da foto principal de cada produto, lido do cache MIX_PRODUTO_FOTO. Só volta produto com foto. Entrada: codprods ('1,44,714').",
    code: `SELECT F.CODPROD, F.URL
FROM MIX_PRODUTO_FOTO F
WHERE FIND_IN_SET(F.CODPROD, '{{codprods}}') > 0
  AND F.URL <> ''
ORDER BY F.CODPROD`,
    perfil: true,
  },
  {
    name: 'mixFotosSincronizar',
    type: 'JAVASCRIPT',
    description: 'Mix Builder: busca no sistema de fotos (Busca 360) a foto principal de todo o catálogo, ou dos codprods informados, e atualiza MIX_PRODUTO_FOTO. Cron diário; também pelo Painel Dev. Nunca devolve a chave.',
    code: SINCRONIZAR,
    cron: CRON_FOTOS,
  },
  {
    name: 'mixFotosTestar',
    type: 'JAVASCRIPT',
    description: 'Mix Builder: testa a conexão com o sistema de fotos usando a chave gravada. Saída: OK, MENSAGEM.',
    code: TESTAR,
  },
  {
    name: 'mixFotosConfigStatus',
    type: 'SQL',
    description: 'Painel Dev: se a chave do sistema de fotos está cadastrada (sem o valor) e como foi a última atualização das fotos. Só para quem vê o Painel Dev.',
    code: `SELECT
  (SELECT COUNT(*) FROM MIX_FOTOS_CONFIG WHERE CHAVE = 'FOTOS_CHAVE' AND COALESCE(VALOR, '') <> '') AS TEM_CHAVE,
  (SELECT VALOR FROM MIX_FOTOS_CONFIG WHERE CHAVE = 'LAST_SUCCESS_AT') AS ULTIMA_ATUALIZACAO,
  (SELECT VALOR FROM MIX_FOTOS_CONFIG WHERE CHAVE = 'LAST_ERROR') AS ULTIMO_ERRO,
  (SELECT COUNT(*) FROM MIX_PRODUTO_FOTO) AS CONSULTADOS,
  (SELECT COUNT(*) FROM MIX_PRODUTO_FOTO WHERE URL <> '') AS COM_FOTO
FROM INT_USER U
WHERE U.ID = :VAR_USER
  AND LOWER(COALESCE(U.DESCR, '')) IN ${QUEM_CONFIGURA}
LIMIT 1`,
  },
  {
    name: 'mixFotosChaveGravar',
    type: 'SQL',
    description: 'Painel Dev: grava a chave do sistema de fotos. Só para quem vê o Painel Dev; a chave nunca volta em leitura. Entrada: chave.',
    code: `INSERT INTO MIX_FOTOS_CONFIG (CHAVE, VALOR, ATUALIZADO_EM, ATUALIZADO_POR)
SELECT 'FOTOS_CHAVE', '{{chave}}', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s'), U.ID
FROM INT_USER U
WHERE U.ID = :VAR_USER
  AND LOWER(COALESCE(U.DESCR, '')) IN ${QUEM_CONFIGURA}
  AND CHAR_LENGTH('{{chave}}') BETWEEN 10 AND 500
ON DUPLICATE KEY UPDATE VALOR = VALUES(VALOR), ATUALIZADO_EM = VALUES(ATUALIZADO_EM), ATUALIZADO_POR = VALUES(ATUALIZADO_POR)`,
  },
];

async function main() {
  for (const sql of DDL) await runDdlMitra({ projectId, sql });
  console.log('tabelas ok');

  const existentes = (await listServerFunctionsMitra({ projectId }))?.result || [];
  const ids = {};
  for (const def of DEFINICOES) {
    const atual = existentes.find((sf) => sf.name === def.name);
    if (atual) {
      await updateServerFunctionMitra({ projectId, serverFunctionId: atual.id, code: def.code, description: def.description, ...(def.cron ? { cronExpression: def.cron } : {}) });
      ids[def.name] = atual.id;
    } else {
      const criada = await createServerFunctionMitra({ projectId, name: def.name, type: def.type, code: def.code, description: def.description });
      const id = criada?.result?.id ?? criada?.result?.serverFunctionId;
      if (!id) throw new Error(`nao consegui o id de ${def.name}: ${JSON.stringify(criada).slice(0, 300)}`);
      if (def.cron) await updateServerFunctionMitra({ projectId, serverFunctionId: id, cronExpression: def.cron });
      ids[def.name] = id;
    }
  }
  console.log(JSON.stringify(ids, null, 2));

  // O vendedor le a foto pelo mesmo perfil que ja le o catalogo do Mix (SF 91).
  for (const perfil of (await listProfilesMitra({ projectId }))?.result || []) {
    const detalhe = (await getProfileDetailsMitra({ projectId, profileId: perfil.id }))?.result || {};
    const sfs = (detalhe.serverFunctions || []).map((s) => s.id ?? s.serverFunctionId);
    if (!sfs.includes(91)) continue;
    const novas = DEFINICOES.filter((d) => d.perfil).map((d) => ids[d.name]).filter((id) => !sfs.includes(id));
    if (novas.length) await setProfileServerFunctionsMitra({ projectId, profileId: perfil.id, serverFunctionIds: [...sfs, ...novas] });
    const tabelas = (detalhe.selectTables || []).map((t) => t.tableName);
    if (!tabelas.includes('MIX_PRODUTO_FOTO')) {
      await setProfileSelectTablesMitra({
        projectId,
        profileId: perfil.id,
        jdbcConnectionConfigId: 1, // banco do proprio projeto
        tables: [...tabelas, 'MIX_PRODUTO_FOTO'].map((tableName) => ({ tableName })),
      });
    }
    console.log(`perfil ${perfil.name}: +${novas.length} SF, tabela MIX_PRODUTO_FOTO`);
  }
}

main().catch((error) => {
  console.error('Falha ao criar as fotos do Mix Builder:');
  console.error(error?.message || error);
  process.exit(1);
});
