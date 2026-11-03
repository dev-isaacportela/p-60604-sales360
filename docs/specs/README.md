# Specs — reconstrução do Comercial Externo 360

O sistema está sendo reconstruído do zero **no mesmo projeto Mitra**, com
frontend novo e Server Functions novas sobre **a mesma estrutura de dados de
produção**. Estas specs são o contrato da reconstrução: descrevem o sistema que
existe hoje, já com os defeitos conhecidos corrigidos (seção "Correções em
relação ao sistema atual" de cada spec).

Os documentos em `docs/modulos/`, `docs/regras-de-negocio.md` e
`docs/base-conhecimento-sales360.md` descrevem o sistema **atual** e foram a
fonte destas specs. Em conflito sobre o sistema novo, valem as specs.

## Como ler

1. `000-visao-geral/spec.md` — perfis, glossário e regras transversais
   (`RNT-00N`, `RNFT-00N`) que todas as specs de módulo citam.
2. `000-visao-geral/modelo-de-dados.md` — contrato congelado das tabelas: o que o
   sistema novo lê e grava, e o que é legado e não deve ser usado.
3. Uma spec por módulo, na ordem de reconstrução.

Cada spec segue o template da skill `mitra-escopo` (`docs/templates/` quando for
copiado para o projeto). O `plan.md` e o `tasks.md` de cada módulo são escritos
quando o módulo entra em reconstrução.

## Índice

| Spec | Módulo | Rotas atuais | Status |
|---|---|---|---|
| [000](000-visao-geral/spec.md) | Visão geral e regras transversais · [modelo de dados](000-visao-geral/modelo-de-dados.md) | — | em revisão |
| [001](001-acesso-e-perfis/spec.md) | Acesso, perfis, menu, configurações, tema | `/login`, `/configuracoes` | em construção: backend e frontend locais prontos e testados ([tasks](001-acesso-e-perfis/tasks.md)); falta publicar no sandbox (T-001..T-004, T-105) |
| [002](002-carteira-clientes/spec.md) | Carteira de clientes | `/clientes`, `/clientes/:clienteId`, `/gestao-titulares` | em revisão |
| [003](003-agenda-visitas/spec.md) | Agenda e visitas | `/agenda` (`/agenda-coordenador` cancelada em 2026-11-03) | em revisão |
| [004](004-tarefas/spec.md) | Atividades | `/tarefas` | em revisão |
| [005](005-dashboard/spec.md) | Dashboard | `/` | em revisão |
| [006](006-acompanhamento-semanal/spec.md) | Acompanhamento semanal | `/acomp-semanal-vendedor` (`/acomp-semanal`, `/painel-validacao` e `/admin-acomp-semanal` cancelados em 2026-11-03) | em revisão |
| [007](007-analytics-metas/spec.md) | Analytics, comparativo e metas | `/analytics`, `/comparativo` | em revisão |
| [008](008-alertas-prospeccao/spec.md) | Alertas, direcionamento semanal e prospecção | `/alertas`, `/direcionamento-semanal` | em revisão |
| [009](009-mix-builder/spec.md) | Mix Builder | `/simulacao` | em revisão |
| [010](010-gestao-diretoria/spec.md) | Gestão, coordenação e diretoria | `/gestao-bus-vendedores`, `/configuracao-escopo-usuarios`, `/governanca-rca`, `/gestao-coordenadores`, `/gestao-cargos-usuarios`, `/gestao-carteira`, `/ferias-vendedor`, `/gestao-acesso-executivas` (`/analise-diretoria`, `/faturamento` e `/gestao-metas` canceladas em 2026-11-03) | em revisão |
| [011](011-solicitacoes-compras/spec.md) | Solicitações de compras | `/solicitacoes-compras` | **cancelada** (2026-10-30): registro do atual, só para aposentar |
| [012](012-suporte-release-notes/spec.md) | Suporte, ajuda e notas de versão | `/ajuda`, `/suporte`, `/painel-desenvolvedor`, `/release-notes` | **cancelada** (2026-10-30): registro do atual, só para aposentar |

## Decisões

Todas as perguntas abertas foram decididas com o usuário em 2026-10-30. Cada
spec registra as suas em **Pendências** como `Decidido em 2026-10-30`, e o
registro completo está em [pendencias-consolidadas.md](pendencias-consolidadas.md).
