# Documentação — Comercial Externo 360 (Benenutri)

CRM de força de vendas sobre a plataforma **Mitra**: agenda de visitas, carteira de clientes, mix de produtos com custos reais, analytics comercial, alertas inteligentes, prospecção e camadas de coordenação/diretoria, integrado ao TOTVS/Winthor.

Esta pasta é o mapa vivo do repositório, gerado a partir da verificação do código real (set/2026). Os documentos originais de concepção estão preservados em [`legado/`](#documentos-de-origem-docslegado) e linkados no fim.

## Fundamentos

| Documento | Conteúdo |
|---|---|
| [arquitetura.md](arquitetura.md) | Stack, estrutura de pastas, autenticação, camada de dados (`useMitra`/SDK), modelo de backend Mitra (SFs, scripts, migrations), MCP, integrações |
| [banco-de-dados.md](banco-de-dados.md) | Schema consolidado (~70 tabelas) por domínio + observações de modelagem |
| [server-functions.md](server-functions.md) | 270 SFs mapeadas por domínio, padrões `{{param}}`/`:VAR_USER`, SFs de permissão |
| [regras-de-negocio.md](regras-de-negocio.md) | Regras verificadas no código: semana operacional, temperatura, alertas, escopo, BW, custos |
| [operacao.md](operacao.md) | Setup dev, env vars, scripts `.mjs`, migrations, fluxo SYNC/SHARE, testes |
| [pendencias.md](pendencias.md) | Divergências e dívidas encontradas na verificação (backlog documentado) |

## Base de conhecimento para suporte (RAG)

[`base-conhecimento-sales360.md`](base-conhecimento-sales360.md) — arquivo único voltado ao **usuário final** (telas, botões, mensagens, regras, limitações e diagnóstico por sintoma), para alimentar a IA da central de chamados.

## Specs por módulo

| Módulo | Rotas cobertas |
|---|---|
| [dashboard](modulos/dashboard.md) | `/` |
| [agenda](modulos/agenda.md) | `/agenda`, `/agenda-coordenador` |
| [carteira-clientes](modulos/carteira-clientes.md) | `/clientes`, `/clientes/:clienteId` (+ histórico embutido) |
| [tarefas](modulos/tarefas.md) | `/tarefas` |
| [mix-builder](modulos/mix-builder.md) | `/simulacao` |
| [analytics](modulos/analytics.md) | `/analytics`, `/acomp-semanal-vendedor`, `/acomp-semanal`, `/admin-acomp-semanal` |
| [alertas-prospeccao](modulos/alertas-prospeccao.md) | `/alertas` (+ prospecção embutida) |
| [gestao-diretoria](modulos/gestao-diretoria.md) | `/painel-gestao`, `/analise-diretoria`, `/faturamento`, `/painel-validacao`, `/gestao-metas`, `/gestao-cadastros`, `/gestao-bus-vendedores`, `/configuracao-escopo-usuarios`, `/governanca-rca`, `/gestao-coordenadores`, `/gestao-cargos-usuarios`, `/gestao-carteira`, `/ferias-vendedor` |
| [solicitacoes-compras](modulos/solicitacoes-compras.md) | `/solicitacoes-compras` |
| [suporte](modulos/suporte.md) | `/ajuda`, `/suporte`, `/painel-desenvolvedor`, `/configuracoes` |

Login (`/login`) está descrito em [arquitetura.md → Autenticação](arquitetura.md#autenticação-e-sessão--mitra-authts).

## Documentos de origem (docs/legado/)

Concepção e histórico do produto — podem estar defasados em relação ao código; onde houver conflito, os docs desta pasta e o código valem:

| Documento | Conteúdo |
|---|---|
| [escopo-comercial-crm.md](legado/escopo-comercial-crm.md) | Spec de produto original: visão, personas, mapa de telas, módulos |
| [sf-cruzamentos.md](legado/sf-cruzamentos.md) | Inventário SF por SF com cruzamentos e consumo por tela |
| [regras-de-negocio.md](legado/regras-de-negocio.md) | Regras por módulo (versão de concepção) |
| [featuresearquitetura.md](legado/featuresearquitetura.md) | Feature/arquitetura do Analytics RCA e incrementos |
| [matriz-crud-permissoes.md](legado/matriz-crud-permissoes.md) | Matriz CRUD/permissões por perfil |
| [entrega-tecnica-fases-1-6.md](legado/entrega-tecnica-fases-1-6.md) | Entrega técnica das fases 1–6 (SFs 42–83) |
| [design.md](legado/design.md) · [ux.md](legado/ux.md) | Diretrizes de design e UX por feature |
| [tasks.md](legado/tasks.md) · [tasks.sheet.md](legado/tasks.sheet.md) | Backlogs (prospecção e geral) |
| [agente-especialista-mitra.md](legado/agente-especialista-mitra.md) | Guia conceitual da plataforma Mitra |
| [CLAUDE.md](../CLAUDE.md) / [AGENTS.md](../AGENTS.md) | Regras operacionais dos agentes (escopo, build, migrations, SYNC/SHARE) |
| [backend/README-mcp.md](../backend/README-mcp.md) | Servidor MCP de consulta ao projeto |
