import dotenv from 'dotenv';
import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import {
  configureSdkMitra,
  executeServerFunctionMitra,
  listServerFunctionsMitra,
  listTablesMitra,
  runQueryMitra,
} from 'mitra-sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env'), quiet: true });

const projectId = Number(process.env.MITRA_PROJECT_ID);
const enableMutations = process.env.MCP_ENABLE_MUTATIONS === 'true';
const httpAuthToken = process.env.MCP_HTTP_AUTH_TOKEN || '';
const allowedOrigin = process.env.MCP_ALLOWED_ORIGIN || '*';

if (!projectId) {
  throw new Error('MITRA_PROJECT_ID nao configurado no backend/.env');
}

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

function textResult(value) {
  return {
    content: [
      {
        type: 'text',
        text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function normalizeSdkResult(response) {
  return response?.result ?? response;
}

function assertReadOnlySql(sql) {
  const compact = sql.trim().replace(/;\s*$/, '');
  const withoutLineComments = compact.replace(/--.*$/gm, '');

  if (!/^(select|with)\b/i.test(withoutLineComments.trim())) {
    throw new Error('A ferramenta consultar_dados aceita somente SELECT ou WITH.');
  }

  if (withoutLineComments.includes(';')) {
    throw new Error('A ferramenta consultar_dados aceita somente uma instrucao SQL por chamada.');
  }

  const forbidden = /\b(insert|update|delete|drop|truncate|alter|create|replace|merge|grant|revoke|call|exec|execute|load)\b/i;
  if (forbidden.test(withoutLineComments)) {
    throw new Error('SQL bloqueado por conter palavra reservada de mutacao ou DDL.');
  }

  return compact;
}

function applyLimit(sql, limit) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  if (/\blimit\s+\d+\b/i.test(sql)) return sql;
  return `${sql}\nLIMIT ${safeLimit}`;
}

function createServer() {
  const server = new McpServer({
    name: 'comercial-externo-360',
    version: '1.0.0',
  });

  server.registerTool(
    'status_mcp',
    {
      title: 'Status do MCP',
      description: 'Mostra o status da conexao MCP e se ferramentas de mutacao estao liberadas.',
    },
    async () => textResult({ projectId, readOnly: !enableMutations, mutationsEnabled: enableMutations })
  );

  server.registerTool(
    'listar_tabelas',
    {
      title: 'Listar tabelas',
      description: 'Lista tabelas e colunas disponiveis no banco do projeto.',
    },
    async () => {
      const response = await listTablesMitra({ projectId });
      return textResult(normalizeSdkResult(response));
    }
  );

  server.registerTool(
    'listar_funcoes',
    {
      title: 'Listar funcoes',
      description: 'Lista Server Functions disponiveis, com filtro opcional por nome ou descricao.',
      inputSchema: {
        busca: z.string().optional().describe('Texto para filtrar por nome ou descricao.'),
      },
    },
    async ({ busca }) => {
      const response = await listServerFunctionsMitra({ projectId });
      const functions = normalizeSdkResult(response);
      const items = Array.isArray(functions) ? functions : functions?.serverFunctions || functions?.content || [];
      const query = busca?.trim().toLowerCase();
      const filtered = query
        ? items.filter((item) => `${item.name || ''} ${item.description || ''}`.toLowerCase().includes(query))
        : items;
      return textResult(filtered);
    }
  );

  server.registerTool(
    'consultar_dados',
    {
      title: 'Consultar dados',
      description: 'Executa uma consulta SQL somente leitura. Apenas SELECT/WITH sao aceitos.',
      inputSchema: {
        sql: z.string().min(1).describe('Consulta SQL somente leitura.'),
        limite: z.number().int().min(1).max(200).default(50).describe('Limite maximo de linhas quando a query nao tiver LIMIT.'),
      },
    },
    async ({ sql, limite }) => {
      const readOnlySql = applyLimit(assertReadOnlySql(sql), limite);
      const response = await runQueryMitra({ projectId, sql: readOnlySql });
      return textResult(normalizeSdkResult(response));
    }
  );

  server.registerTool(
    'executar_funcao',
    {
      title: 'Executar funcao',
      description: 'Executa uma Server Function existente. Bloqueada por padrao; requer MCP_ENABLE_MUTATIONS=true.',
      inputSchema: {
        serverFunctionId: z.number().int().positive().describe('ID numerico da Server Function.'),
        input: z.record(z.string(), z.unknown()).default({}).describe('Parametros enviados para a Server Function.'),
      },
    },
    async ({ serverFunctionId, input }) => {
      if (!enableMutations) {
        return textResult({
          error: 'Ferramenta bloqueada. Defina MCP_ENABLE_MUTATIONS=true no ambiente apenas se quiser permitir execucao de funcoes que podem alterar dados.',
        });
      }

      const response = await executeServerFunctionMitra({ projectId, serverFunctionId, input });
      return textResult(normalizeSdkResult(response));
    }
  );

  return server;
}

function applyCorsHeaders(req, res) {
  const requestHeaders = req.headers['access-control-request-headers'];
  res.setHeader('access-control-allow-origin', allowedOrigin);
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'access-control-allow-headers',
    requestHeaders || 'authorization, content-type, mcp-protocol-version, mcp-session-id'
  );
  res.setHeader('access-control-expose-headers', 'mcp-protocol-version, mcp-session-id');
}

async function startStdio() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

async function startHttp() {
  const port = Number(process.env.MCP_PORT || 3333);
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);

  const httpServer = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

      applyCorsHeaders(req, res);

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (url.pathname === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, projectId, readOnly: !enableMutations }));
        return;
      }

      if (url.pathname !== '/mcp') {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Endpoint nao encontrado. Use /mcp.' }));
        return;
      }

      if (httpAuthToken) {
        const expected = `Bearer ${httpAuthToken}`;
        if (req.headers.authorization !== expected) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'Nao autorizado.' }));
          return;
        }
      }

      await transport.handleRequest(req, res);
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  });

  httpServer.listen(port, () => {
    console.error(`MCP HTTP pronto em http://localhost:${port}/mcp`);
  });
}

if (process.argv.includes('--http')) {
  startHttp().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  startStdio().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
