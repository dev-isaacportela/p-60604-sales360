/**
 * Versionamento de Server Functions.
 *
 * Guarda o codigo atual das SFs em backend/sf-versions/<timestamp>/ (versionado no git)
 * e, opcionalmente, cria uma copia da SF dentro da plataforma como ponto de restauracao.
 *
 * Uso:
 *   node sf-versionar.mjs --salvar 104 110 146            salva versao em disco + copia na plataforma
 *   node sf-versionar.mjs --salvar 104 --sem-copia        salva apenas em disco
 *   node sf-versionar.mjs --listar                        lista as versoes ja salvas
 *   node sf-versionar.mjs --restaurar <pasta> [ids...]    devolve o codigo salvo para a SF de producao
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  configureSdkMitra,
  readServerFunctionMitra,
  updateServerFunctionMitra,
  createServerFunctionMitra,
} from 'mitra-sdk';

function decodeTokenPayload(token) {
  try {
    const raw = String(token || '').replace(/^Bearer\s+/i, '');
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

const tokenPayload = decodeTokenPayload(process.env.MITRA_TOKEN);
const baseURL = process.env.MITRA_BASE_URL || tokenPayload?.backURL;

configureSdkMitra({
  baseURL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS || baseURL,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const VERSIONS_DIR = path.join(process.cwd(), 'sf-versions');

function slug(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function extractCreatedId(response) {
  return response?.result?.serverFunctionId || response?.result?.id || response?.serverFunctionId || response?.id || null;
}

async function readSf(serverFunctionId) {
  const response = await readServerFunctionMitra({ projectId, serverFunctionId });
  const sf = response?.result || response || {};
  if (!sf.code) throw new Error(`SF ${serverFunctionId}: codigo atual vazio ou nao encontrado.`);
  return sf;
}

async function salvar(ids, { copiaPlataforma, motivo }) {
  if (!ids.length) throw new Error('Informe ao menos um ID de SF para versionar.');

  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const dir = path.join(VERSIONS_DIR, timestamp);
  fs.mkdirSync(dir, { recursive: true });

  const entries = [];
  for (const id of ids) {
    const sf = await readSf(id);
    const fileName = `sf-${id}-${slug(sf.name)}.sql`;
    fs.writeFileSync(path.join(dir, fileName), sf.code, 'utf8');

    let copiaId = null;
    let copiaNome = null;
    if (copiaPlataforma) {
      copiaNome = `${sf.name}-v${timestamp}`.slice(0, 120);
      const created = await createServerFunctionMitra({
        projectId,
        name: copiaNome,
        type: sf.type,
        code: sf.code,
        description: `Versao ${timestamp} da SF ${id} (${sf.name}). ${motivo}`.slice(0, 250),
      });
      copiaId = Number(extractCreatedId(created) || 0) || null;
      if (!copiaId) throw new Error(`SF ${id}: copia na plataforma nao retornou ID.`);
    }

    entries.push({
      serverFunctionId: id,
      name: sf.name,
      type: sf.type,
      description: sf.description || null,
      file: fileName,
      bytes: sf.code.length,
      copiaPlataformaId: copiaId,
      copiaPlataformaNome: copiaNome,
    });
    console.log(`SF ${id} (${sf.name}): ${sf.code.length} bytes -> ${path.join('sf-versions', timestamp, fileName)}${copiaId ? ` | copia na plataforma: SF ${copiaId}` : ''}`);
  }

  const manifest = { timestamp, projectId, motivo, criadoEm: new Date().toISOString(), serverFunctions: entries };
  fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`\nVersao salva em backend/sf-versions/${timestamp}`);
  console.log(`Para restaurar: node sf-versionar.mjs --restaurar ${timestamp}`);
  return manifest;
}

function listar() {
  if (!fs.existsSync(VERSIONS_DIR)) {
    console.log('Nenhuma versao salva ainda.');
    return;
  }
  for (const entry of fs.readdirSync(VERSIONS_DIR).sort()) {
    const manifestPath = path.join(VERSIONS_DIR, entry, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const ids = manifest.serverFunctions.map((sf) => sf.serverFunctionId).join(', ');
    console.log(`${entry}  SFs [${ids}]  ${manifest.motivo || ''}`);
  }
}

async function restaurar(versao, ids) {
  const dir = path.join(VERSIONS_DIR, versao);
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`Versao ${versao} nao encontrada em backend/sf-versions.`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const alvos = ids.length
    ? manifest.serverFunctions.filter((sf) => ids.includes(sf.serverFunctionId))
    : manifest.serverFunctions;

  if (!alvos.length) throw new Error('Nenhuma SF correspondente na versao informada.');

  for (const alvo of alvos) {
    const code = fs.readFileSync(path.join(dir, alvo.file), 'utf8');
    await updateServerFunctionMitra({
      projectId,
      serverFunctionId: alvo.serverFunctionId,
      code,
      description: alvo.description || undefined,
    });
    console.log(`SF ${alvo.serverFunctionId} (${alvo.name}) restaurada a partir da versao ${versao}.`);
  }
}

async function main() {
  if (!projectId) throw new Error('MITRA_PROJECT_ID nao configurado.');

  const argv = process.argv.slice(2);
  const ids = argv.filter((a) => /^[0-9]+$/.test(a)).map(Number);

  if (argv.includes('--listar')) return listar();

  if (argv.includes('--restaurar')) {
    const versao = argv[argv.indexOf('--restaurar') + 1];
    if (!versao || /^[0-9]{1,4}$/.test(versao)) throw new Error('Informe a pasta da versao: --restaurar <timestamp>');
    return restaurar(versao, ids.filter((id) => String(id) !== versao));
  }

  const motivoIdx = argv.indexOf('--motivo');
  const motivo = motivoIdx >= 0 ? argv[motivoIdx + 1] : 'Versionamento manual.';
  return salvar(ids, { copiaPlataforma: !argv.includes('--sem-copia'), motivo });
}

main().catch((error) => {
  console.error('Falha no versionamento de Server Functions:');
  console.error(error?.message || error);
  process.exit(1);
});
