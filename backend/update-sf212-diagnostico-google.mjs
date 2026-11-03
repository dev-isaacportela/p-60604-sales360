/**
 * Ajuste pontual na SF 212 (googleAgendaSincronizarItem): a extracao do ID do evento
 * cobria poucos formatos de resposta e, ao falhar, gravava sempre a mesma mensagem
 * generica ("Google nao retornou ID do evento"), escondendo o motivo real.
 * Aqui o restante da SF permanece intacto -- so a extracao e a mensagem de erro mudam.
 */
import 'dotenv/config';
import { configureSdkMitra, readServerFunctionMitra, updateServerFunctionMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const serverFunctionId = 212;

const TRECHO_ANTIGO = `    const googleEventId = response?.body?.id || response?.result?.body?.id || response?.id || existingId;
    if (!googleEventId) throw new Error('Google nao retornou ID do evento.');`;

const TRECHO_NOVO = `    const bruta = response?.result?.output ?? response?.result ?? response;
    let corpo = bruta?.body ?? bruta;
    if (typeof corpo === 'string') {
      try { corpo = JSON.parse(corpo); } catch (erroParse) { /* mantem como string */ }
    }
    const statusCode = bruta?.statusCode ?? bruta?.status ?? response?.statusCode ?? 0;
    const googleEventId = corpo?.id || bruta?.id || response?.body?.id || existingId;
    if (!googleEventId) {
      const detalhe = corpo?.error?.message || corpo?.error_description || corpo?.error || '';
      const amostra = JSON.stringify(bruta || {}).slice(0, 400);
      throw new Error('Google nao criou o evento (HTTP ' + statusCode + '). '
        + (detalhe ? String(detalhe) + ' | ' : '')
        + 'Resposta: ' + amostra);
    }`;

async function main() {
  const atual = await readServerFunctionMitra({ projectId, serverFunctionId });
  const code = atual?.result?.code || '';
  if (!code) throw new Error('Nao foi possivel ler o codigo da SF 212.');

  if (code.includes('Google nao criou o evento (HTTP')) {
    console.log('SF 212 ja possui o diagnostico detalhado. Nada a fazer.');
    return;
  }
  if (!code.includes(TRECHO_ANTIGO)) {
    throw new Error('Trecho esperado nao encontrado na SF 212 -- o codigo mudou. Revisar antes de aplicar.');
  }

  const novoCode = code.replace(TRECHO_ANTIGO, TRECHO_NOVO);
  await updateServerFunctionMitra({ projectId, serverFunctionId, code: novoCode });
  console.log('SF 212 atualizada: erro de sincronizacao agora registra status HTTP e resposta do Google.');
}

main().catch((error) => {
  console.error('Erro ao atualizar a SF 212:');
  console.error(error?.message || error);
  process.exit(1);
});
