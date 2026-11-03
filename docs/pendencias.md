# Pendências e Divergências

> Parte da [documentação do projeto](README.md). Registro do que a verificação do repositório (set/2026) encontrou de divergente ou frágil. **Nada aqui foi corrigido — é backlog documentado.**

## Divergências documentação × código

1. ~~**Sistema de temas `.theme-*` não existe.**~~ **Resolvido (set/2026)**: o [CLAUDE.md](../CLAUDE.md) descrevia um sistema `.theme-light`/`.theme-dark` que o código não tem; a seção foi corrigida para refletir a camada única `:root` de [index.css](../frontend/src/index.css).
2. **`frontend/README.md` era boilerplate do Vite** — substituído por um resumo do projeto com link para esta documentação (nesta entrega).
3. **Migrations 082–084 declaradas sem arquivo.** `backend/migrations.yaml` lista `082/083/084-*-sf-relatorioclientespfativosultimacompra.sql`, mas os arquivos não existem em `backend/migrations/`. Confirmar com o sistema de migrations antes de qualquer replay dev↔prod.
4. **Migrations não são a fonte do schema.** Cobrem ~7 de ~70 tabelas; o restante foi criado por scripts `.mjs` via SDK. O estado real só é verificável no projeto Mitra remoto ([detalhes](banco-de-dados.md)).

## Fragilidades de código

5. **Permissão por e-mail hardcoded.** "Acomp. Semanal Admin" e "Painel de Validação" são gateados pela string `ti@benenutri.com` em [Layout.tsx:58](../frontend/src/components/Layout.tsx) e [AdminAcompanhamentoSemanalPage.tsx:7](../frontend/src/pages/AdminAcompanhamentoSemanalPage.tsx). O padrão do projeto para telas restritas é SF de permissão ([server-functions.md](server-functions.md#sfs-de-permissão-gate-de-telas)).
6. **Bypass da camada de dados.** 5 páginas chamam `executeServerFunctionMitra` direto, sem os wrappers com tratamento de erro de [useMitra.ts](../frontend/src/hooks/useMitra.ts): `FeriasVendedorPage`, `GestaoCargosUsuariosPage`, `GestaoCarteiraCoordenadorPage`, `GestaoCoordenadoresPage`, `GestaoMetasDiretoriaPage`. `const PROJECT_ID` é redeclarado em 10 pontos de `frontend/src` (essas 5 páginas + `LoginPage`, `SuportePage`, `lib/mitra-auth.ts`, `ui/RichTextEditor.tsx`, além do próprio `useMitra.ts`).
7. **Secrets do Google Agenda em texto puro.** `GOOGLE_AGENDA_CONFIG` guarda `CLIENT_SECRET` e `REFRESH_TOKEN` em colunas TEXT sem indicação de criptografia ([banco-de-dados.md](banco-de-dados.md#agenda-interna-e-google-agenda)).
8. **Tokens de tema subutilizados.** A maior parte das páginas usa hex inline em `style={{}}` em vez das variáveis de [index.css](../frontend/src/index.css); [Layout.tsx](../frontend/src/components/Layout.tsx) não usa nenhuma. Mudar a paleta hoje exige buscar hex espalhado.
9. **Cobertura de testes baixa.** 3 arquivos de teste para ~33 mil linhas de frontend, concentrados no histórico de clientes ([operacao.md](operacao.md#testes)).

## Dívidas de modelagem

10. **Pares legado vs. ativo sem aposentadoria formal**: `SIMULACOES`/`SIMULACAO_ITENS` vs. `PRODUCT_MIX`/`PRODUCT_MIX_ITEMS`; `PRODUTOS`+`CUSTOPRODUTO`+`COST_POLICIES` vs. `PRODUTOS_CUSTOS`+`CUSTO_PADRAO_PRODUTO`+`CUSTO_ESPECIAL_*`. As SFs antigas (9–10, 16–19, 55–62) continuam no mapa `SF`, e os aliases `vendasMensais` (2), `visitasPorStatus` (3), `proximasVisitas` (4), `listarProdutos` (8), `metaDefinir` (122) e `metaListarHistorico` (124) não têm nenhuma chamada no frontend. Confirmar uso real antes de remover ([banco-de-dados.md](banco-de-dados.md#mix-e-custos-mix-builder)).
11. **Datas como VARCHAR** na maior parte das tabelas — impede comparações/índices nativos de data; tabelas novas já usam DATE/DATETIME.
12. **Ramo de substituto inalcançável na SF 104 (`calcularBwSemanal`).** A CTE `CARTEIRA` faz `JOIN EQUIPE_CLIENTE ON ID_VENDEDOR = TARGET` e só depois testa `OR FUNCIONARIOS.ID_SUBSTITUTO = TARGET` no `WHERE` — o `OR` nunca adiciona linhas, então o **substituto de férias não herda a carteira do titular** no acompanhamento semanal ([sf-104 snapshot](../backend/sf-versions/20260821151600/sf-104-calcular-bw-semanal.sql), CTE `CARTEIRA`; a migration 091 tem a mesma forma). O padrão que efetivaria a regra existe em outra SF (`backend/update-sf104-alinhar-escopo-mensal.mjs`), indicando intenção não aplicada. Confirmar comportamento desejado e corrigir via SF nova/atualizada.
13. **Licença do Handsontable** é `non-commercial-and-evaluation` — passada como `licenseKey` nos componentes HotTable (ex.: [AnalyticsPage.tsx](../frontend/src/pages/AnalyticsPage.tsx), [FeriasVendedorPage.tsx](../frontend/src/pages/FeriasVendedorPage.tsx)) — validar adequação para uso comercial.
