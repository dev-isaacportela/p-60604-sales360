# Comercial Externo 360 — Benenutri

CRM de força de vendas sobre a plataforma **Mitra**: agenda de visitas, carteira de clientes, mix de produtos com custos reais, analytics comercial, alertas inteligentes, prospecção e camadas de coordenação/diretoria, integrado ao TOTVS/Winthor.

## Documentação

**Comece por [`docs/README.md`](docs/README.md)** — índice da documentação viva, gerada e verificada contra o código:

- [Arquitetura](docs/arquitetura.md) · [Banco de Dados](docs/banco-de-dados.md) · [Server Functions](docs/server-functions.md) · [Regras de Negócio](docs/regras-de-negocio.md) · [Operação](docs/operacao.md) · [Pendências](docs/pendencias.md)
- Specs por módulo em [`docs/modulos/`](docs/modulos/dashboard.md)
- Documentos históricos de concepção em [`docs/legado/`](docs/legado/escopo-comercial-crm.md) — podem estar defasados; em conflito, valem os docs vivos e o código

A auditoria doc↔código é feita pelo agente [`revisor-docs`](.claude/agents/revisor-docs.md) (ver [Operação](docs/operacao.md#auditoria-da-documentação)).

## Estrutura

| Pasta | Conteúdo |
|---|---|
| [`frontend/`](frontend/README.md) | SPA React 19 + Vite + TS (build: `cd frontend && npm run build`) |
| [`backend/`](docs/arquitetura.md#backend-modelo-mitra) | Scripts de provisionamento via `mitra-sdk` + [MCP de consulta](backend/README-mcp.md) — a lógica vive em Server Functions no Mitra |
| `backend/migrations/` | Migrations dev↔prod — **gerenciadas pelo sistema, não editar** |
| [`docs/`](docs/README.md) | Documentação viva + legado |

Regras operacionais dos agentes (escopo, build, migrations, SYNC/SHARE): [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md).
