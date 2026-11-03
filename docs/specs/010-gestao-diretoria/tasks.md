# Tasks: Gestão, coordenação e diretoria — etapa 1

**Plan:** `plan.md` · **Data:** 2026-11-03

> Ordem de execução. Nenhuma decisão de design se resolve aqui; se aparecer uma,
> volta para o `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).
> `[sandbox]` = só pode rodar no sandbox da plataforma (nunca desta máquina).
>
> **Etapa 2 (depois da spec 002):** Gestão de Carteira — RF-028, RF-029,
> RN-017 a RN-019, C-018 a C-020, RNF-004. **Etapa 3 (proposta):** rotinas —
> RF-033, RF-034, RN-023, RN-024, RNF-002, RNF-003. **RF-009** espera as SFs da
> spec 008.

## Pré-requisitos no sandbox (só leitura)

- [ ] **T-001** `[sandbox]` — Confirmar que não existe SF com os nomes `s360*` deste plano (`listServerFunctionsMitra`)
- [ ] **T-002** `[sandbox]` — Ler a estrutura real de `IMP_DEVOLUCOES_TOTVS`, `PEDIDOS_SEMANAIS_SYNC_RAW`, `COMISSOES`, `VENDEDOR_RCA_AUDITORIA`, `RCA_TOTVS` e `COORDENADORES_BU` (`listTablesMitra`); corrigir `schema-producao/010-gestao.mjs` se divergir
- [ ] **T-003** `[sandbox]` — Confirmar com um usuário business que SF SQL com `DELETE` executa (D-010-7); se não, voltar ao plano

## Backend

- [ ] **T-010** — `novo/backend/schema-producao/010-gestao.mjs`: `PEDIDOS_SEMANAIS_SYNC_RAW`, `IMP_DEVOLUCOES_TOTVS`, `METAS_BU_VENDEDOR`, `VISITAS`, `COMISSOES`, `VENDEDOR_RCA_AUDITORIA`, `RCA_TOTVS`, `COORDENADORES_BU`
- [ ] **T-011** — `novo/backend/lib/010-gestao.mjs`: `REALIZADO` (RNT-007/008), `naEquipe`, `GESTAO`, `DIRETORIA`
- [ ] **T-012** — `novo/backend/add-010-gestao.mjs`: `definitions` das SFs do plan (Painel, comissões, BUs, escopos, RCA, coordenadores, papéis, férias, executivas); publica só em `isEntrypoint()`; script `publish:010` no `package.json`
- [ ] **T-013** — `simulator/config.mjs`: chaves novas em `CHECK_INPUT` (`vendedorId`, `busca`, `filtro`, `papel`, `limite`, `offset`)

## Simulador

- [ ] **T-020** — `simulator/seeds/010-gestao.mjs`: usuários, RCAs, escopos, carteira, vendas, devoluções, metas, tarefas, visitas, coordenador, papéis, férias e bloqueios da tabela de seed do plan (ids 10001+)
- [ ] **T-021** — `npm run sim:check` sem `FALHOU`

## Frontend

- [ ] **T-030** `[P]` — `src/lib/gestao.ts`, `src/lib/ferias.ts`, `src/lib/papeis.ts` com as funções da tabela do plan
- [ ] **T-031** — `src/lib/server-functions.ts`: entradas `s360*` da 010 em ordem alfabética, ids 1001+
- [ ] **T-032** — `src/lib/menu.ts`: Férias de Vendedores para coordenador ativo, DIRETORIA e ADMIN (na seção Diretoria para quem não é coordenador ativo); `AcessoRestrito.tsx` com `mensagemBloqueio`
- [ ] **T-033** — `src/components/Confirmacao.tsx`: diálogo que nomeia o alvo e só executa no `Confirmar`
- [ ] **T-034** — `PainelGestaoPage` (`/painel-gestao`)
- [ ] **T-035** — `GestaoCadastrosPage` (`/gestao-cadastros`)
- [ ] **T-036** — `BusVendedoresPage` (`/gestao-bus-vendedores`)
- [ ] **T-037** — `EscopoUsuariosPage` (`/configuracao-escopo-usuarios`)
- [ ] **T-038** — `GovernancaRcaPage` (`/governanca-rca`)
- [ ] **T-039** — `GestaoCoordenadoresPage` (`/gestao-coordenadores`)
- [ ] **T-040** — `PapeisUsuariosPage` (`/gestao-cargos-usuarios`)
- [ ] **T-041** — `FeriasVendedorPage` (`/ferias-vendedor`)
- [ ] **T-042** — `ExecutivasPage` (`/gestao-acesso-executivas`)

## Testes

Uma task por grupo de linhas da seção Testes do plan.

- [ ] **T-080** — smoke Painel: C-001, C-002, C-003, RN-003, RNT-007 (férias), RN-005, RN-007
- [ ] **T-081** — smoke cadastros: C-010, C-011, C-012/RN-013, C-013, RN-012
- [ ] **T-082** — smoke RCA: C-014, C-015, RN-014
- [ ] **T-083** — smoke coordenadores e papéis: C-016/RN-015, C-017, RN-016 (com o legado)
- [ ] **T-084** — smoke férias: C-021, C-022, RN-020
- [ ] **T-085** — smoke executivas: C-023, C-024, RN-021, RN-022
- [ ] **T-086** — smoke RN-001: matriz papel × tela das 9 telas
- [ ] **T-087** `[P]` — `tests/gestao.test.mjs`: C-001, C-002, C-010, C-011, C-012, C-016, C-026, RN-001, RN-002, RN-006, RN-011, RN-022, RN-025
- [ ] **T-088** `[P]` — `tests/ferias.test.mjs`: C-021, RN-020
- [ ] **T-089** `[P]` — `tests/papeis.test.mjs` e `tests/menu.test.mjs` (Férias para DIRETORIA sem cadastro de coordenador)

## Verificação

- [ ] **T-100** — `cd novo/backend && npm test` verde
- [ ] **T-101** — `cd novo/frontend && npm test` verde; `npm run build` e `npm run lint` limpos
- [ ] **T-102** — No simulador (portas próprias desta sessão): Painel como Paulo (GESTOR), Papéis como Gil, Férias e Executivas como Carlos, bloqueio como Ana
- [ ] **T-103** — Verificação manual da spec: menu de DIRETORIA com Papéis de Usuários e Gestão Coordenadores; as 9 telas em tema escuro e em 360 px
- [ ] **T-104** `[sandbox]` — Publicar `add-010-gestao.mjs`, depois `add-000-perfil-acesso.mjs` e `sync:function-map`; medir o Painel com outubro/2026 de produção (RNF-001)

## Dependências

```
T-001, T-002, T-003 ──────────────────────────────┐
T-010 → T-011 → T-012 → T-013 → T-020 → T-021 → T-080…T-086 → T-100
T-030 [P] → T-087…T-089 → T-101
T-031 → T-032 → T-033 → T-034…T-042
T-100 + T-101 → T-102 → T-103 → T-104 (exige T-001…T-003)
```

## Rastreabilidade

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001 / RN-001, RN-002 | T-012, T-032 | T-086, T-087, T-089 |
| RF-002 / RN-003, RN-005 | T-011, T-012, T-034 | T-080 |
| RF-003 / RN-025 | T-033, T-035…T-042 | T-087 |
| RF-004 / RNT-013 | T-012, T-035…T-042 | T-081…T-085 |
| RF-005 / C-026 | T-034…T-042 | T-087 |
| RF-006, RF-007 / C-001, C-002, RN-006 | T-012, T-034 | T-080, T-087 |
| RF-008 / C-003, RN-007 | T-012, T-034 | T-080 |
| RF-009 | spec 008 | — |
| RF-020 / C-010, RN-011 | T-012, T-035 | T-081, T-087 |
| RF-021 / C-011, RN-012 | T-012, T-036 | T-081, T-087 |
| RF-022 / C-012, C-013, RN-013 | T-012, T-037 | T-081, T-087 |
| RF-023…RF-025 / C-014, C-015, RN-014 | T-012, T-038 | T-082 |
| RF-026 / C-016, RN-015 | T-012, T-039 | T-083, T-087 |
| RF-027 / C-017, RN-016 | T-012, T-040 | T-083, T-089 |
| RF-028, RF-029 | etapa 2 | etapa 2 |
| RF-030 / C-021, C-022, RN-020 | T-012, T-041 | T-084, T-088 |
| RF-031, RF-032 / C-023, C-024, RN-021, RN-022 | T-012, T-042 | T-085, T-087 |
| RF-033, RF-034 | etapa 3 | etapa 3 |
| RNF-001 | T-012 | T-104 |
