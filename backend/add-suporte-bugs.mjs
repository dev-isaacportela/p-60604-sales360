import 'dotenv/config';
import {
  configureSdkMitra,
  runDdlMitra,
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

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS SUPORTE_BUGS (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  PROTOCOLO VARCHAR(40) NOT NULL,
  USER_ID INT,
  USER_EMAIL VARCHAR(255),
  USER_NOME VARCHAR(255),
  USER_STATUS VARCHAR(50),
  USER_SUBSTITUTO_ID INT,
  TITULO VARCHAR(200) NOT NULL,
  CATEGORIA VARCHAR(80),
  PRIORIDADE VARCHAR(30),
  TELA_AFETADA VARCHAR(200),
  DESCRICAO TEXT,
  PASSOS_REPRODUCAO TEXT,
  RESULTADO_ESPERADO TEXT,
  RESULTADO_OBTIDO TEXT,
  IMPACTO TEXT,
  ANEXO_URL TEXT,
  ANEXO_NOME VARCHAR(255),
  EMAIL_STATUS VARCHAR(30),
  EMAIL_ERRO TEXT,
  CONTEXTO_JSON TEXT,
  STATUS VARCHAR(30) DEFAULT 'ABERTO',
  CRIADO_EM VARCHAR(19),
  ATUALIZADO_EM VARCHAR(19),
  INDEX IDX_SUPORTE_STATUS (STATUS),
  INDEX IDX_SUPORTE_PRIORIDADE (PRIORIDADE),
  INDEX IDX_SUPORTE_CRIADO (CRIADO_EM)
)`;

const ENVIAR_BUG_CODE = `
const { runDmlMitra, sendEmailMitra } = require('mitra-sdk');

const projectId = Number(process.env.MITRA_PROJECT_ID);
const DESTINATARIOS = ['TI@BENENUTRI.COM', 'ISAACPORTELA0903@GMAIL.COM'];

function esc(value, max = 8000) {
  return String(value ?? '').trim().slice(0, max).replace(/'/g, "''");
}

function html(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\\n/g, '<br />');
}

function getUsuario(contexto) {
  const raw = event.usuario || contexto.usuarioFrontend || {};
  return {
    ID: Number(raw.ID || raw.userId || 0) || null,
    EMAIL: raw.EMAIL || raw.DESCR || raw.email || '',
    NOME: raw.NOME_INTERNO || raw.NOME || raw.name || raw.EMAIL || raw.DESCR || '',
    STATUS_FUNCIONARIO: raw.STATUS_FUNCIONARIO || '',
    ID_SUBSTITUTO: Number(raw.ID_SUBSTITUTO || 0) || null,
  };
}

function buildEmail({ protocolo, usuario, payload, contexto }) {
  return \`
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2 style="margin: 0 0 8px; color: #137432;">Novo bug reportado - \${html(protocolo)}</h2>
      <p style="margin: 0 0 16px;">Um usuário registrou um problema pelo formulário de suporte.</p>
      <h3 style="margin: 18px 0 8px;">Solicitante</h3>
      <ul>
        <li><strong>ID:</strong> \${html(usuario.ID)}</li>
        <li><strong>Nome:</strong> \${html(usuario.NOME)}</li>
        <li><strong>E-mail:</strong> \${html(usuario.EMAIL)}</li>
        <li><strong>Status:</strong> \${html(usuario.STATUS_FUNCIONARIO)}</li>
      </ul>
      <h3 style="margin: 18px 0 8px;">Bug</h3>
      <p><strong>Título:</strong> \${html(payload.titulo)}</p>
      <p><strong>Prioridade:</strong> \${html(payload.prioridade)}</p>
      <p><strong>Categoria:</strong> \${html(payload.categoria)}</p>
      <p><strong>Tela afetada:</strong> \${html(payload.telaAfetada)}</p>
      <p><strong>Descrição:</strong><br />\${html(payload.descricao)}</p>
      <p><strong>Passos para reproduzir:</strong><br />\${html(payload.passosReproducao)}</p>
      <p><strong>Resultado esperado:</strong><br />\${html(payload.resultadoEsperado)}</p>
      <p><strong>Resultado obtido:</strong><br />\${html(payload.resultadoObtido)}</p>
      <p><strong>Impacto:</strong><br />\${html(payload.impacto)}</p>
      \${payload.anexoUrl ? '<p><strong>Anexo:</strong> <a href="' + html(payload.anexoUrl) + '" target="_blank" rel="noopener noreferrer">' + html(payload.anexoNome || 'Abrir print') + '</a></p>' : ''}
      <h3 style="margin: 18px 0 8px;">Contexto técnico capturado</h3>
      <pre style="white-space: pre-wrap; background: #f3f4f6; padding: 12px; border-radius: 8px;">\${html(JSON.stringify(contexto, null, 2))}</pre>
    </div>
  \`;
}

async function run() {
  const now = new Date().toISOString().slice(0, 19);
  const protocolo = 'BUG-' + now.slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const contexto = event.contexto || {};
  const usuario = getUsuario(contexto);
  const contextoJson = JSON.stringify({ ...contexto, capturadoEmServidor: now }).slice(0, 12000);

  const titulo = esc(event.titulo, 200);
  if (!titulo) throw new Error('Informe um título para o bug.');

  await runDmlMitra({
    projectId,
    sql: \`INSERT INTO SUPORTE_BUGS (
      PROTOCOLO, USER_ID, USER_EMAIL, USER_NOME, USER_STATUS, USER_SUBSTITUTO_ID,
      TITULO, CATEGORIA, PRIORIDADE, TELA_AFETADA, DESCRICAO, PASSOS_REPRODUCAO,
      RESULTADO_ESPERADO, RESULTADO_OBTIDO, IMPACTO, ANEXO_URL, ANEXO_NOME,
      EMAIL_STATUS, EMAIL_ERRO, CONTEXTO_JSON, STATUS, CRIADO_EM, ATUALIZADO_EM
    ) VALUES (
      '\${protocolo}',
      \${Number(usuario.ID || 0) || 'NULL'},
      '\${esc(usuario.EMAIL, 255)}',
      '\${esc(usuario.NOME, 255)}',
      '\${esc(usuario.STATUS_FUNCIONARIO, 50)}',
      \${Number(usuario.ID_SUBSTITUTO || 0) || 'NULL'},
      '\${titulo}',
      '\${esc(event.categoria, 80)}',
      '\${esc(event.prioridade, 30)}',
      '\${esc(event.telaAfetada, 200)}',
      '\${esc(event.descricao)}',
      '\${esc(event.passosReproducao)}',
      '\${esc(event.resultadoEsperado)}',
      '\${esc(event.resultadoObtido)}',
      '\${esc(event.impacto)}',
      '\${esc(event.anexoUrl, 12000)}',
      '\${esc(event.anexoNome, 255)}',
      'PENDENTE',
      NULL,
      '\${esc(contextoJson, 12000)}',
      'ABERTO',
      '\${now}',
      '\${now}'
    )\`,
  });

  let emailStatus = 'ENVIADO';
  let emailErro = '';
  try {
    await sendEmailMitra({
      projectId,
      to: DESTINATARIOS,
      subject: \`Bug reportado \${protocolo}: \${event.titulo || 'Sem título'}\`,
      body: buildEmail({ protocolo, usuario, payload: event, contexto }),
    });
  } catch (error) {
    emailStatus = 'ERRO';
    emailErro = String(error?.message || error || 'Falha desconhecida no envio de e-mail').slice(0, 2000);
  }

  await runDmlMitra({
    projectId,
    sql: \`UPDATE SUPORTE_BUGS
      SET EMAIL_STATUS = '\${emailStatus}', EMAIL_ERRO = \${emailErro ? "'" + esc(emailErro, 2000) + "'" : 'NULL'}, ATUALIZADO_EM = '\${now}'
      WHERE PROTOCOLO = '\${protocolo}'
      LIMIT 1\`,
  });

  return { rows: [{ STATUS: 'REGISTRADO', EMAIL_STATUS: emailStatus, EMAIL_ERRO: emailErro, PROTOCOLO: protocolo, CRIADO_EM: now }] };
}

return run();
`;

const LISTAR_BUGS_SQL = `
SELECT
  ID,
  PROTOCOLO,
  USER_ID,
  USER_EMAIL,
  USER_NOME,
  USER_STATUS,
  TITULO,
  CATEGORIA,
  PRIORIDADE,
  TELA_AFETADA,
  DESCRICAO,
  PASSOS_REPRODUCAO,
  RESULTADO_ESPERADO,
  RESULTADO_OBTIDO,
  IMPACTO,
  ANEXO_URL,
  ANEXO_NOME,
  EMAIL_STATUS,
  EMAIL_ERRO,
  CONTEXTO_JSON,
  STATUS,
  CRIADO_EM,
  ATUALIZADO_EM
FROM SUPORTE_BUGS
ORDER BY ID DESC
LIMIT 100
`;

const PERMISSAO_SQL = `
SELECT CASE
  WHEN LOWER(COALESCE(U.DESCR, '')) IN ('ti@benenutri.com', 'isaacportela0903@gmail.com') THEN 1
  ELSE 0
END AS PODE_ACESSAR
FROM INT_USER U
WHERE U.ID = :VAR_USER
LIMIT 1
`;

async function upsertFunction({ name, type, code, description }) {
  const list = await listServerFunctionsMitra({ projectId });
  const existing = (list?.result || []).find((item) => item.name === name);
  if (existing) {
    await updateServerFunctionMitra({ projectId, serverFunctionId: existing.id, code, description });
    return existing.id;
  }
  const created = await createServerFunctionMitra({ projectId, name, type, code, description });
  return created?.result?.serverFunctionId || created?.result?.id || created?.serverFunctionId || created?.id;
}

async function main() {
  await runDdlMitra({ projectId, sql: CREATE_TABLE });
  const alterStatements = [
    'ALTER TABLE SUPORTE_BUGS ADD COLUMN ANEXO_URL TEXT',
    'ALTER TABLE SUPORTE_BUGS ADD COLUMN ANEXO_NOME VARCHAR(255)',
    'ALTER TABLE SUPORTE_BUGS ADD COLUMN EMAIL_STATUS VARCHAR(30)',
    'ALTER TABLE SUPORTE_BUGS ADD COLUMN EMAIL_ERRO TEXT',
  ];
  for (const sql of alterStatements) {
    try {
      await runDdlMitra({ projectId, sql });
    } catch (error) {
      const message = `${String(error?.message || '')} ${JSON.stringify(error || {})}`.toLowerCase();
      if (!message.includes('duplicate') && !message.includes('already exists') && !message.includes('duplicate column')) throw error;
    }
  }
  const suporteEnviarBug = await upsertFunction({
    name: 'suporteEnviarBug',
    type: 'JAVASCRIPT',
    code: ENVIAR_BUG_CODE,
    description: 'Registra bug, captura contexto do usuário e envia e-mail para TI.',
  });
  const suporteListarBugs = await upsertFunction({
    name: 'suporteListarBugs',
    type: 'SQL',
    code: LISTAR_BUGS_SQL,
    description: 'Lista os bugs reportados no painel de desenvolvedor.',
  });
  const suportePainelPermissao = await upsertFunction({
    name: 'suportePainelPermissao',
    type: 'SQL',
    code: PERMISSAO_SQL,
    description: 'Verifica se o usuário pode acessar o painel de desenvolvedor.',
  });

  console.log(JSON.stringify({ suporteEnviarBug, suporteListarBugs, suportePainelPermissao }, null, 2));
}

main().catch((error) => {
  console.error('Falha ao configurar suporte de bugs:');
  console.error(error?.message || error);
  process.exit(1);
});
