# MCP do Comercial Externo 360

Este backend agora expõe um servidor MCP para conectar clientes compatíveis ao sistema.

## Ferramentas Disponíveis

- `status_mcp`: verifica conexão e modo de segurança.
- `listar_tabelas`: lista tabelas e colunas do projeto.
- `listar_funcoes`: lista funções existentes, com filtro opcional.
- `consultar_dados`: executa apenas `SELECT` ou `WITH`, bloqueando DDL/DML e adicionando `LIMIT` quando necessário.
- `executar_funcao`: executa função existente apenas se `MCP_ENABLE_MUTATIONS=true` estiver definido.

## Modo Local Stdio

Use este modo em clientes MCP locais:

```json
{
  "mcpServers": {
    "comercial-externo-360": {
      "command": "node",
      "args": ["/home/user/w-18721/p-45654/backend/mcp-server.mjs"]
    }
  }
}
```

O servidor carrega automaticamente `/home/user/w-18721/p-45654/backend/.env`.

## Modo HTTP

Para clientes que exigem endpoint remoto MCP:

```bash
cd /home/user/w-18721/p-45654/backend
MCP_PORT=3333 MCP_HTTP_AUTH_TOKEN="troque-este-token" npm run mcp:http
```

Endpoint MCP: `http://localhost:3333/mcp`

Healthcheck: `http://localhost:3333/health`

Quando expor este endpoint fora da máquina local, use HTTPS e defina `MCP_HTTP_AUTH_TOKEN`.

Se o cliente web fizer validação CORS, o servidor responde `OPTIONS` automaticamente. Para restringir a origem permitida:

```bash
MCP_ALLOWED_ORIGIN="https://claude.ai" MCP_PORT=3333 MCP_HTTP_AUTH_TOKEN="troque-este-token" npm run mcp:http
```

## Segurança

Por padrão, o MCP é somente leitura. Para permitir execução de funções que podem alterar dados, defina explicitamente:

```bash
MCP_ENABLE_MUTATIONS=true npm run mcp
```

Use esse modo apenas quando o cliente MCP realmente precisar executar ações de escrita.
