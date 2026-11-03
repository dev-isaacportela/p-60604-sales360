# Módulo: Suporte, Ajuda e Configurações

> [Índice](../README.md) · [Server Functions](../server-functions.md) · [Banco](../banco-de-dados.md)

## Objetivo

Ciclo de suporte ao usuário: manual da ferramenta, reporte de bugs com protocolo, fila de triagem para o desenvolvedor e preferências pessoais.

## Rotas e páginas

| Rota | Página | O que faz |
|---|---|---|
| `/ajuda` | [AjudaPage.tsx](../../frontend/src/pages/AjudaPage.tsx) | "Manual do vendedor" — conteúdo estático: rotina diária, regras rápidas, ficha por tela (objetivo, quando usar, passos, boas práticas). Sem chamadas de dados |
| `/suporte` | [SuportePage.tsx](../../frontend/src/pages/SuportePage.tsx) | Formulário de bug: categoria, prioridade, tela afetada, passos de reprodução, anexo (via `uploadFilePublicMitra`) |
| `/painel-desenvolvedor` | [PainelDesenvolvedorPage.tsx](../../frontend/src/pages/PainelDesenvolvedorPage.tsx) | Fila de bugs: protocolo, prioridade, contexto JSON, anexo, status de e-mail. Gateado por `suportePainelPermissao` |
| `/release-notes` | [ReleaseNotesPage.tsx](../../frontend/src/pages/ReleaseNotesPage.tsx) | Cadastro das notas de versão (rascunho, publicar, despublicar, excluir, pré-visualizar, quantas pessoas viram). Gateado por `suportePainelPermissao` |
| `/configuracoes` | [ConfiguracoesUsuarioPage.tsx](../../frontend/src/pages/ConfiguracoesUsuarioPage.tsx) | Dados do usuário, status ativo/férias + substituto, preferências (modo agenda, exibição de tarefas, página inicial), conexão Google Agenda |

## Server Functions

- Suporte: `suporteEnviarBug` (234), `suporteListarBugs` (235), `suportePainelPermissao` (236).
- Notas de versão: `releaseNotesGestaoListar` (403), `releaseNotesSalvar` (404), `releaseNotesExcluir` (405) — só equipe técnica, conferida no SQL; `releaseNotesPendentes` (406) e `releaseNotesMarcarLidas` (407) — todo usuário, no perfil Operacao Comercial. Script: `backend/add-release-notes.mjs`.
- Configurações: `detalharConfiguracoesUsuario` (64), `listarUsuariosSubstitutos` (65), `atualizarDadosUsuario` (66), `atualizarPreferenciasUsuario` (67), `dadosUsuarioLogado` (28), `googleAgenda*` (209–212).

## Tabelas

`RELEASE_NOTES` e `RELEASE_NOTES_LEITURA`, `SUPORTE_BUGS` (protocolo, contexto JSON, anexo, status de e-mail), `FUNCIONARIOS` (status/substituto), `INT_USER`, `GOOGLE_AGENDA_CONFIG`.

## Popup de notas de versão

[ReleaseNotesPopup.tsx](../../frontend/src/components/ReleaseNotesPopup.tsx), montado no `Layout`: ao entrar, busca as notas publicadas nos últimos 60 dias que o usuário ainda não viu (até 10) e as mostra em "O que há de novo". Fechar (Entendi, X, Esc ou clique fora) grava a leitura, e a nota não volta para aquele usuário. Despublicar e publicar de novo não reabre para quem já viu.

O texto da nota é escrito no `RichTextEditor` (com `comSubtitulo`): Título (h2) para as seções, Subtítulo (h3) para cada item, listas e negrito; colar do Word/Google Docs mantém a formatação. É gravado como HTML já limpo por [notaVersaoHtml.ts](../../frontend/src/lib/notaVersaoHtml.ts) (só tags de texto, links https e imagens https; sem estilo nem script) e exibido com a classe `.nota-versao-conteudo` (`index.css`). Notas antigas em texto simples continuam aceitas (`## `, `### `, `- `).
