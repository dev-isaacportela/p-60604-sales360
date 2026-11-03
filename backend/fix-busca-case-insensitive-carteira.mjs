import 'dotenv/config';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

/*
 * A collation de CLIENTES e utf8mb3_bin (binaria = case-sensitive) e os 2.337 nomes
 * estao gravados em maiusculo. As SFs de carteira faziam `COLUNA LIKE '%{{busca}}%'`
 * sem UPPER, entao quem digitava minusculo nao encontrava nenhum cliente.
 *
 * Correcao: UPPER dos dois lados, mesmo padrao que a SF 91 do Mix Builder ja usa.
 * UPPER so AMPLIA o conjunto que casa, nunca reduz — e o LIKE ja comeca com curinga,
 * entao nao existe indice sendo perdido.
 *
 * Escopo: o trio da carteira (usado em conjunto pelas mesmas telas — corrigir a
 * listagem sem corrigir a contagem deixaria paginacao inconsistente) + a SF do
 * Mix Builder, que herdou o mesmo padrao.
 */
const ALVOS = [
  { id: 27, nome: 'minhaCarteiraClientes', smoke: { busca: 'hospital' } },
  { id: 38, nome: 'contarMinhaCarteiraClientes', smoke: { busca: 'hospital' } },
  { id: 84, nome: 'minhaCarteiraClientesRanking', smoke: { busca: 'hospital' } },
  { id: 362, nome: 'mixCarteiraClientes', smoke: { busca: 'hospital', limit: '5', offset: '0' } },
];

const ESCOPO_PADRAO = {
  idBu: '', segmento: '', ramoCliente: '', status: '', cidade: '', uf: '',
  limit: '10', offset: '0',
  scopeMode: 'GLOBAL', scopeUserId: '', scopeCodRca: '',
  scopeCodSupervisor: '', scopeCodFilial: '', scopeCodepto: '', scopeIdSecao: '',
};

const ALVO_LIKE = "LIKE '%{{busca}}%'";

// Captura a expressao imediatamente antes do LIKE equilibrando parenteses da direita
// para a esquerda, para nao quebrar em CAST(COALESCE(A, B) AS CHAR).
function expressaoAntesDo(code, posLike) {
  let i = posLike - 1;
  while (i >= 0 && /\s/.test(code[i])) i -= 1;
  const fim = i;
  let profundidade = 0;

  for (; i >= 0; i -= 1) {
    const c = code[i];
    if (c === ')') profundidade += 1;
    else if (c === '(') {
      if (profundidade === 0) break;
      profundidade -= 1;
    } else if (profundidade === 0 && /[\s,]/.test(c)) break;
  }
  return { inicio: i + 1, fim: fim + 1 };
}

function aplicarUpper(code) {
  let total = 0;
  let cursor = 0;

  for (;;) {
    const posLike = code.indexOf(ALVO_LIKE, cursor);
    if (posLike === -1) break;

    const { inicio, fim } = expressaoAntesDo(code, posLike);
    const expressao = code.slice(inicio, fim);

    if (!expressao || /^upper$/i.test(expressao)) { cursor = posLike + ALVO_LIKE.length; continue; }

    const substituto = `UPPER(${expressao}) LIKE CONCAT('%', UPPER('{{busca}}'), '%')`;
    code = code.slice(0, inicio) + substituto + code.slice(posLike + ALVO_LIKE.length);
    cursor = inicio + substituto.length;
    total += 1;
  }

  return { code, total };
}

async function smoke(id, input, label) {
  const r = await executeServerFunctionMitra({ projectId, serverFunctionId: id, input });
  const status = String(r?.result?.executionStatus || '');
  const erro = String(r?.result?.error || '').trim();
  if ((status && status !== 'COMPLETED') || erro) throw new Error(`${label}: ${(erro || status).slice(0, 250)}`);
  let out = r?.result?.output;
  if (typeof out === 'string') out = JSON.parse(out);
  return out?.rows || [];
}

async function main() {
  for (const alvo of ALVOS) {
    const atual = await readServerFunctionMitra({ projectId, serverFunctionId: alvo.id });
    const original = atual?.result?.code || '';

    if (!original.includes(ALVO_LIKE)) {
      console.log(`SF ${alvo.id} ${alvo.nome}: ja corrigida.`);
      continue;
    }

    const { code, total } = aplicarUpper(original);
    if (code.includes(ALVO_LIKE)) throw new Error(`SF ${alvo.id}: sobrou LIKE sem UPPER — abortando.`);

    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: alvo.id,
      code,
      description: atual?.result?.description,
    });
    console.log(`SF ${String(alvo.id).padEnd(4)} ${alvo.nome.padEnd(32)} ${total} comparacao(oes) tornadas case-insensitive`);
  }

  console.log('\nsmoke — busca em minusculo deve retornar linhas:');
  for (const alvo of ALVOS) {
    const input = alvo.id === 362 ? alvo.smoke : { ...ESCOPO_PADRAO, ...alvo.smoke };
    const rows = await smoke(alvo.id, input, alvo.nome);
    console.log(`  SF ${String(alvo.id).padEnd(4)} ${alvo.nome.padEnd(32)} -> ${JSON.stringify(rows[0] || {}).slice(0, 70)}`);
  }
}

main().catch((error) => {
  console.error('Falha ao tornar a busca case-insensitive:');
  console.error(error?.message || error);
  process.exit(1);
});
