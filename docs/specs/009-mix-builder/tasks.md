# Tasks: Mix Builder — propostas com custo real

**Plan:** `plan.md` · **Data:** 2026-11-03

> Ordem de execução. Nenhuma decisão de design se resolve aqui; se aparecer uma,
> volta para o `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).
> `[sandbox]` = só pode rodar no sandbox da plataforma (nunca desta máquina).

## Pré-requisitos no sandbox (só leitura)

- [ ] **T-901** `[sandbox]` — Confirmar versão do MySQL (≥ 8, `utf8mb4_0900_ai_ci` disponível), estrutura real das 8 tabelas de `schema-producao/009-mix.mjs` e que `PRODUCT_MIX`/`_ITEMS` estão entre as tabelas DML do perfil `Operacao Comercial`; corrigir o schema se divergir
- [ ] **T-902** `[sandbox]` — Numa SF de teste: o que `affectedRows` devolve numa SF de várias instruções (soma, primeira ou última) e se `START TRANSACTION … COMMIT` funciona; registrar no `plan.md` (D-902, Riscos)

## Backend

- [x] **T-910** — `novo/backend/schema-producao/009-mix.mjs`: `PRODUCT_MIX`, `PRODUCT_MIX_ITEMS`, `PRODUTOS_CUSTOS`, `CUSTO_PADRAO_PRODUTO`, `CUSTO_ESPECIAL_PRODUTO`, `CUSTO_ESPECIAL_CLIENTES_BIG`, `MIX_CUSTOS_SYNC`, `MIX_PRODUTO_FOTO`, copiados de `modelo-de-dados.md`
- [x] **T-911** — `novo/backend/lib/009-carteira.mjs`: `clienteNaCarteira(coluna)` (carteira própria + titulares com férias ativas em `{{hoje}}`), com comentário `ponytail:` para trocar pelo `lib/002-carteira.mjs`
- [x] **T-912** — `novo/backend/add-009-mix.mjs`: `definitions` das 10 SFs do plan (`ITENS_VALIDOS`, totais pelo servidor, dono, política vigente, busca sem acento); publica só em `isEntrypoint()`; `package.json` ganha `publish:009`
- [x] **T-913** — `simulator/mysql-dialect.mjs`: `JSON_TABLE`, `CONVERT … COLLATE utf8mb4_0900_ai_ci` → `MITRA_SEM_ACENTO`, `LAST_INSERT_ID()`; `simulator/runtime.mjs`: várias instruções com soma de `affectedRows`
- [x] **T-914** — `simulator/config.mjs`: chaves novas no `CHECK_INPUT` (`busca`, `buscaDigitos`, `clienteId`, `produtos`, `offset`, `mixId`)
- [x] **T-915** — `simulator/seeds/009-mix.mjs`: clientes 9001–9005 e 9101–9900, carteira, produtos, custos, políticas, fotos, sync e os 28 mixes da tabela de seed do plan
- [x] **T-916** — `npm run sim:check` sem `FALHOU`

## Frontend

- [x] **T-920** — `src/lib/server-functions.ts`: 10 entradas `mix*` em ordem alfabética, ids 901–910
- [x] **T-921** — `src/lib/mix.ts`: as funções da tabela do plan (só regra pura, sem React)
- [x] **T-922** — `src/pages/SimulacaoPage.tsx` (`.rota = '/simulacao'`): abas `Construtor` e `Meus Mix`, seletor de cliente com busca, catálogo com foto, itens (tabela e cartões), comparativo, filtro/ordenação, totais, aviso de custos, salvar/atualizar, duplicar, excluir, enviar, visualizar, PDF e CSV, seguindo `docs/design.md` (`/benenutri:design`, modo Construir) — *a skill não estava disponível nesta sessão; seguida a norma de `docs/design.md` (sem toast: avisos em `Alert`; sem cor literal: a proposta impressa usa cores de sistema `Canvas`/`CanvasText`/`GrayText`)*

## Testes

- [x] **T-930** — `smoke/009-mix.mjs`: C-001, C-003, C-004, RN-008 (geral), RN-007, C-009, C-010, C-011, C-012, C-017, C-018, RN-013, RN-014, C-019 e dialeto (linhas "smoke" do plan)
- [x] **T-931** `[P]` — `tests/mix.test.mjs`: C-001, C-002, RN-008 (escolha), C-005, C-006, C-007, RN-006, RN-001, RN-002/004, C-008, C-011, C-013, C-014, C-015, C-016, C-017, C-019, RNT-011 (linhas "tests" do plan)

## Verificação

- [x] **T-940** — `cd novo/backend && npm test` verde
- [x] **T-941** — `cd novo/frontend && npm test` verde; `npm run build` e `npm run lint` limpos — *o lint só tem os avisos que já existiam em `components/ui/`*
- [ ] **T-942** — No simulador (porta própria): Ana monta, salva, duplica, envia, imprime e exporta o mix de C-007; Bruno em 05/11 vê 9001 no seletor e nenhum mix de Ana — *parcial em 03/11 (portas 3109/5180): Ana escolheu cliente (busca "mercado" e "emporio" sem acento), incluiu 9714 com especial (R$ 60,00 · Rede Sul), incluiu 9001 (aviso e etiqueta de custo zero), mudou a quantidade e trocou para 9002 (9714 voltou a R$ 70,00 com a mensagem da RN-010); falta salvar, Meus Mix, duplicar, enviar, PDF e CSV na tela e o Bruno em 05/11 (o simulador usa a data real; as regras estão no smoke)*
- [ ] **T-943** — Verificação manual da spec: tabela em 1.366 px e cartões em 360 px; tema escuro; PDF em A4 com logo nítido e cabeçalho repetido; nenhuma tela mostra a chave de fotos
- [ ] **T-944** `[sandbox]` — Publicar `add-009-mix.mjs`, depois `add-000-perfil-acesso.mjs` e `sync:function-map` (exige T-901, T-902)

## Dependências

```
T-901, T-902 ─────────────────────────────┐
T-910 → T-911 → T-912 → T-913 → T-914 → T-915 → T-916 → T-930 → T-940
T-920 → T-921 → T-922
T-921 → T-931 → T-941
T-940 + T-941 → T-942 → T-943 → T-944
```

## Rastreabilidade

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001 | T-922 | T-942 |
| RF-002 / C-010, RNT-014 | T-911, T-912 | T-930 |
| RF-003 / RN-014 | T-912, T-922 | T-930 |
| RF-004 / C-001, C-003, RN-002, RN-008 | T-912, T-921 | T-930, T-931 |
| RF-005 / C-002, RN-001, RN-003, RN-004, RN-007 | T-912, T-921 | T-930, T-931 |
| RF-006 / C-006, RN-010 | T-921 | T-931 |
| RF-007 / C-007, RN-005, RN-006 | T-921 | T-931 |
| RF-008 | T-921, T-922 | T-931 |
| RF-009 | T-922 | T-942 |
| RF-010 / C-008, C-017, C-018, RN-011, RN-012, RN-013 | T-912, T-921 | T-930, T-931 |
| RF-011 / C-009, C-010 | T-912, T-922 | T-930 |
| RF-012 / C-011 | T-921 | T-930, T-931 |
| RF-013 | T-912, T-922 | T-930 |
| RF-014 / C-012, RN-016 | T-912 | T-930 |
| RF-015 / C-013, C-014, RN-015 | T-921, T-922 | T-931 |
| RF-016 / C-015 | T-921 | T-931 |
| RF-017 / C-016, RN-014 | T-912, T-921 | T-931 |
| RF-018 / C-019, RN-017 | T-912, T-921 | T-930, T-931 |
| RNF-001…RNF-004 | T-922 | T-942, T-943 |
