# Plan: Gestão, coordenação e diretoria

**Spec:** `./spec.md` · **Data:** 2026-11-03

> O COMO. Nenhum requisito novo nasce aqui. Se faltou algo, volta para a spec.

## Etapas

A spec 010 é construída em três etapas, cada uma com o seu plano e o seu
`tasks.md` marcado:

| Etapa | O quê | Por quê separado |
|---|---|---|
| **1 (este plano)** | Usuários (papéis, RCA, escopo e acesso de executivas), Gestão Coordenadores, Férias de Vendedores | só depende da 001 |
| **2** (plano no fim deste arquivo, aprovado em 2026-11-03) | Gestão de Carteira: RF-028, RF-029, RN-017 a RN-019, C-018 a C-020, RNF-004 | depende das regras de carteira da spec 002, já na main |
| **3** (aprovada em 2026-11-03) | Rotinas automáticas: RF-033, RF-034, RN-023, RN-024, RNF-002, RNF-003 | nada roda nem se verifica nesta máquina: integração com o planejamento estratégico e Data Loader do ERP só existem no sandbox, e a rotina de clientes grava `CLIENTES`, dado da 002 |

O **RF-009** (`Gerar novos alertas`) era um botão do Painel de Gestão e saiu
com ele (D4, 2026-11-03); o ciclo de alertas fica com a spec 008.

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` com zero pendências; decisões de 2026-10-30 e 2026-11-03 |
| Backend escrito local, executado no sandbox | sim | `novo/backend/add-010-gestao.mjs` só publica no sandbox (`isEntrypoint`) |
| Migrations append-only | sim | nenhuma tabela nova nesta etapa; só SFs `s360*`, que viram migration gerada pelo sistema |
| Leitura e escrita por Server Function | sim | toda leitura e escrita é SF **SQL** (business não escreve de dentro de SF JavaScript, `docs/arquitetura.md`) |
| Simulador cobre a feature | sim | `schema-producao/010-gestao.mjs`, `simulator/seeds/010-gestao.mjs`, `simulator/smoke/010-gestao.mjs` |
| Testes automatizados obrigatórios | sim | cada linha da seção Testes da spec (menos as da etapa 2 e 3) vira `teste()` no smoke ou `test()` em `novo/frontend/tests/` (mapa abaixo) |
| Design tokens, sem cor literal | sim | telas só com o vocabulário de `components/page.tsx` (`/benenutri:design`, modo Construir) |
| Simplicidade | sim | nenhuma tabela nova, nenhuma dependência nova; uma SF por instrução |

## Contexto técnico

- Stack, transporte e simulador da 001, sem acréscimo.
- **Reuso:** `lib/guardas.mjs` (`SEM_BLOQUEIO`, `temPapel`, `COORDENADOR_ATIVO`);
  `mitra-api.ts` (`linhas`, `linhasAfetadas`); `formato.ts` (`moeda`,
  `fmtData`, `hojeBrasilia`, `agoraBrasilia`); `page.tsx` (`Panel`, `Table`,
  `Pagination`, `Dialog`, `SelectMenu`, `Alert`, `EmptyState`, `InfoGrid`).
- **Restrição da plataforma que molda o desenho (D-010-1):** usuário business
  só grava por SF SQL, uma instrução por SF. Não existe transação entre duas
  SFs. Onde a spec pede "gravam juntos" (coordenador + BUs, vínculo + auditoria,
  papéis nas duas tabelas), a tela chama as SFs **em sequência**, cada uma
  idempotente e guardada no servidor, e a mensagem final sai de uma releitura.
  Ver D-010-1 e Riscos.
- **Dependência nova:** nenhuma.

## Modelo de dados

Nenhuma tabela nem coluna nova. Tabelas de produção que a etapa 1 passa a ler
ou gravar (contrato em `000-visao-geral/modelo-de-dados.md`):

| Entidade (spec) | Tabela | Uso | Declarada em |
|---|---|---|---|
| BU | `BU` | só leitura: vem do ERP pela rotina da RN-024 (etapa 3) | 000 |
| Escopo | `BU_VENDEDOR` | leitura e escrita; desvincular = `ATIVO = 0` | 001 |
| Filial, seção | `FILIAL`, `SECAO` | leitura | 000 |
| Carteira | `EQUIPE_CLIENTE`, `CLIENTES` | leitura (Gestão de Carteira, etapa 2) | 000 |
| Vínculo RCA | `VENDEDOR_RCA` | leitura e escrita (`REPLACE INTO`; remover = `DELETE`) | 001 |
| Auditoria RCA | `VENDEDOR_RCA_AUDITORIA` | leitura e escrita | **010** |
| RCAs do ERP | `RCA_TOTVS` | leitura (lista e supervisor sugerido) | **010** |
| Coordenador | `COORDENADORES`, `COORDENADORES_BU` | leitura e escrita | 001 / **010** |
| Papéis | `USUARIO_PAPEL` (da 001) e `USUARIO_CARGO` (legado) | leitura e escrita (D-010-2) | add-001 / 001 |
| Férias | `FERIAS_VENDEDOR` | leitura e escrita; cancelar futura = `ATIVO = 0` | 001 |
| Bloqueio | `USUARIO_BLOQUEIO` | leitura e escrita | 001 |

`FUNCIONARIOS` não é lida nem gravada (decisão da 000).

## Contratos de backend

Arquivo `novo/backend/add-010-gestao.mjs`, que exporta `definitions`. Todas
as SFs são SQL, resolvem quem chama por `:VAR_USER` (RNT-012) e levam
`SEM_BLOQUEIO`. Datas `hoje`/`agora` vêm da tela, em Brasília (D-007 da 001).
Fragmentos SQL próprios em `novo/backend/lib/010-gestao.mjs`:

- `naEquipe(alvo, { comRca })` — RNT-004: o alvo tem escopo ativo numa BU do
  cadastro ativo de coordenador de quem chama (e RCA, quando pedido).
- `GESTAO = temPapel('GESTOR','ADMIN')`, `DIRETORIA = temPapel('DIRETORIA','ADMIN')`.

Gravações respondem `affectedRows`; 0 = recusado e a tela mostra o motivo
(RNT-013, D-010-3).

### Painel de Gestão e Gestão Cadastros — cancelados (D4, 2026-11-03)

As SFs `s360Painel*` e `s360Comissao*`, o fragmento `realizadoCtes` de
`lib/010-gestao.mjs` e as tabelas de venda, devolução, meta do vendedor,
visita e comissão saíram da 010. O cálculo do realizado fica para quem
precisar dele (Dashboard e Analytics, specs 005 e 007); o histórico do git
guarda a versão da 010 (commit 3248908).

### BUs (sem tela)

BUs e Vendedores deixou de existir em 2026-11-03: a BU vem direto do ERP
(Winthor) pela rotina da RN-024, que entra na etapa 3. Nenhuma SF desta spec
grava em `BU`; até a rotina existir, vale o que já está na tabela de produção.
O bloco "Vincular BU ao vendedor" e o de vínculo RCA ↔ departamento também
saem (RF-022, Fora de escopo).

### Usuários: escopos (GESTOR, ADMIN)

| Nome | Entrada | Saída | Atende |
|---|---|---|---|
| `s360EstruturaListar` | — | `TIPO` (FILIAL/BU/SECAO/USUARIO), `CODIGO`, `NOME`, `BU_CODIGO`, `ATIVO`: opções dos selects numa consulta só | RF-022 |
| `s360EscopoListar` | `busca`, `limite`, `offset` | escopos ativos: `ID`, `VENDEDOR_ID`, `VENDEDOR`, `EMAIL`, `BU_CODIGO`, `BU`, `CODFILIAL`, `FILIAL`, `ID_SECAO`, `SECAO`, `TOTAL` | RF-022 |
| `s360EscopoReativar` | `vendedorId`, `buCodigo`, `codfilial`, `secoes` (CSV; '' = todas), `agora` | linhas reativadas (combinações inativas → ativas) | RN-013, C-013 |
| `s360EscopoIncluir` | idem | linhas inseridas (combinações que não existem) | RN-013, C-012 |
| `s360EscopoDesvincular` | `id`, `agora` | linhas afetadas (`ATIVO = 0`) | C-013 |

- A tela chama `Reativar` e depois `Incluir`; "já existia" = pedidas − reativadas
  − incluídas → "2 escopos vinculados. 1 já existia." (C-012).
- BU inativa recusa os dois (RN-012); escopo existente não muda.
- Seção nula = todas; a unicidade compara `COALESCE(ID_SECAO, 0)`, porque o
  índice único de produção não impede duplicata com seção nula.

### Usuários: vínculo RCA (GESTOR, ADMIN)

| Nome | Entrada | Saída | Atende |
|---|---|---|---|
| `s360RcaTotvsListar` | — | `COD_RCA`, `RCA_NOME`, `COD_SUPERVISOR` (sugerido), `USUARIO_VINCULADO` | RF-023 |
| `s360RcaAuditoriaListar` | — | 80 últimas: `ALTERADO_EM`, `USUARIO`, `COD_RCA_ANTERIOR`, `COD_RCA_NOVO`, `COD_SUPERVISOR_ANTERIOR`, `COD_SUPERVISOR_NOVO`, `ALTERADO_POR`, `OBSERVACAO` | RF-025 |
| `s360RcaAuditar` | `userId`, `codRca` (0 = remover), `codSupervisor`, `observacao`, `agora` | 1 linha de auditoria com os valores **anteriores lidos do servidor**; 0 se a mudança é inválida (RCA de outro usuário, RCA fora do ERP, nada muda) | RN-014, C-014, C-015 |
| `s360RcaVincular` | `userId`, `codRca`, `codSupervisor`, `agora` | linhas afetadas (`REPLACE INTO`); só grava se existe a auditoria desta mudança, do mesmo autor e do mesmo `agora` | RF-023, RN-014 |
| `s360RcaRemover` | `userId`, `agora` | linhas afetadas (`DELETE`; T-003); mesma exigência de auditoria | RF-024, C-015 |

Auditoria primeiro, gravação depois (D-010-1): a gravação sem a auditoria
correspondente não acontece, e a auditoria só nasce para uma mudança válida.

### Gestão Coordenadores (DIRETORIA, ADMIN)

| Nome | Entrada | Saída | Atende |
|---|---|---|---|
| `s360CoordenadorListar` | — | `COD_SUPERVISOR`, `NOME`, `EMAIL`, `USER_ID`, `USUARIO`, `ATIVO`, `BUS` (`filial:departamento` separados por vírgula) | RF-026 |
| `s360CoordenadorCriar` | `codSupervisor`, `nome`, `email`, `userId`, `ativo` | linhas afetadas; recusa código não numérico ou repetido, nome vazio, ativo sem usuário, usuário com outro cadastro ativo | RN-015, C-016 |
| `s360CoordenadorAtualizar` | idem (chave = `codSupervisor`) | linhas afetadas | RN-015 |
| `s360CoordenadorBuIncluir` | `codSupervisor`, `bus` (`F:D,F:D`) | BUs incluídas (só BU ativa, RN-012) | C-016 |
| `s360CoordenadorBuRemover` | `codSupervisor`, `bus` | BUs do coordenador **fora** da lista removidas (`DELETE`; T-003) | RN-015, RN-025 |
| `s360CoordenadorStatusDefinir` | `codSupervisor`, `ativo` | linhas afetadas; ativar exige usuário e nenhum outro cadastro ativo dele | RN-015 |

`Salvar` = `Criar`/`Atualizar` → `BuIncluir` → `BuRemover` (este só depois
da confirmação, se alguma BU saiu) → `Listar`; a mensagem "Coordenador salvo
com 2 BUs." conta as BUs relidas.

### Usuários: lista e papéis (lista: GESTOR, DIRETORIA, ADMIN; papéis: DIRETORIA, ADMIN)

| Nome | Entrada | Saída | Atende |
|---|---|---|---|
| `s360PapelResumo` | — | `DIRETORIA`, `COORDENADORES`, `VENDEDORES`, `OUTROS` (GESTOR/ADMIN); sem papel conta como vendedor | RF-027 |
| `s360PapelListar` | `busca` (nome, e-mail, ID ou RCA), `papel` ('' = todos), `limite`, `offset` | lista da tela Usuários, para GESTOR, DIRETORIA e ADMIN (todos) e coordenador ativo (equipe, RNT-004); `filtro` de acesso (TODAS/COM_ACESSO/DESATIVADAS), desativadas primeiro: `USER_ID`, `NOME`, `EMAIL`, `COD_RCA`, `COD_SUPERVISOR`, `PAPEIS` (união das duas tabelas), `BLOQUEADO`, `TOTAL` | RF-023, RF-027, RF-031 |
| `s360PapelIncluir` | `userId`, `diretoria`, `coordenador`, `vendedor` (0/1), `agora` | papéis marcados que faltavam em `USUARIO_PAPEL` | C-017 |
| `s360PapelRemover` | idem | papéis desmarcados removidos de `USUARIO_PAPEL` (`DELETE`; T-003) | RN-016 |
| `s360PapelLegadoSincronizar` | `userId`, `agora` | `USUARIO_CARGO` acompanha a mudança (D-010-2) | RN-016, D-003 da 001 |

GESTOR e ADMIN não são parâmetro de nenhuma das três: por construção a tela
não os altera (RN-016). Em Usuários, o painel mostra só a parte que o papel de
quem abre edita (`partesUsuarios` em `lib/papeis.ts`); as SFs de cada parte
mantêm o guarda dela, então gestor não grava papel e diretoria não grava RCA
nem escopo. A mensagem "<Nome>: papéis salvos (COORDENADOR,
GESTOR)." sai da releitura do usuário.

### Férias de Vendedores (coordenador ativo; DIRETORIA, ADMIN)

| Nome | Entrada | Saída | Atende |
|---|---|---|---|
| `s360FeriasPessoas` | — | `USER_ID`, `NOME`, `COD_RCA`: coordenador = equipe com RCA (RNT-004); diretoria/ADMIN = todos com RCA | RN-020 |
| `s360FeriasListar` | `hoje` | ativas e futuras do mesmo recorte: `ID`, titular, substituto, `DT_INICIO`, `DT_FIM`, `ESTADO` | RF-030 |
| `s360FeriasCadastrar` | `titularId`, `substitutoId`, `inicio`, `fim` | linhas afetadas; recusa pela RNT-010 e RN-020 (diferentes, ambos com RCA e no recorte, início ≤ fim, sem sobreposição do titular, titular não substitui no período, substituto não está de férias no período) | C-021, RN-020 |
| `s360FeriasEncerrar` | `id`, `hoje` | linhas afetadas: ATIVA → `DT_FIM = hoje`; FUTURA → `ATIVO = 0` (cancelada) | C-022 |

Titular e substituto chegam por **usuário**; o RCA é resolvido no servidor.

### Usuários: acesso das executivas (GESTOR, DIRETORIA, ADMIN; coordenador ativo, só a equipe)

| Nome | Entrada | Saída | Atende |
|---|---|---|---|
| `s360ExecutivaListar` | `busca`, `filtro` (TODAS/COM_ACESSO/DESATIVADAS), `limite`, `offset` | `USER_ID`, `NOME`, `EMAIL`, `BLOQUEADO`, `MOTIVO`, `ATUALIZADO_POR`, `ATUALIZADO_EM`, `TOTAL`; desativadas primeiro | RF-031, RN-021 |
| `s360ExecutivaAcessoGarantir` | `userId` | cria a linha de bloqueio com `BLOQUEADO = 0` se não existe, só para executiva visível a quem chama | RN-022 |
| `s360ExecutivaAcessoAlterar` | `userId`, `bloqueado` (0/1), `motivo` (≤ 500), `agora` | linhas afetadas | RF-032, C-023, C-024, RN-022 |

- O bloqueio no servidor já existe: `SEM_BLOQUEIO` em toda SF `s360*` e
  `BLOQUEADO` em `s360SessaoObter` (spec 001, RN-016), que tira a pessoa na
  entrada e na próxima recarga de sessão.

## Superfície de interação

| Tela / rota | Responsabilidade | Novos |
|---|---|---|
| `/governanca-rca` (Usuários) | cards por papel (diretoria); lista com busca e filtro de papel, papéis, RCA e supervisor; `Editar` abre o painel do usuário com papéis (diretoria), vínculo RCA com `Remover vínculo` e escopos com `Desvincular` (gestão), acesso com `Desativar acesso`/`Reativar acesso` (gestão, diretoria e coordenador ativo), todos com confirmação; coluna e filtro de acesso na lista, desativadas primeiro; auditoria de RCA embaixo (gestão). `/configuracao-escopo-usuarios`, `/gestao-cargos-usuarios`, `/gestao-bus-vendedores` e `/gestao-acesso-executivas` saem do menu (2026-11-03) | `UsuariosPage` |
| `/gestao-coordenadores` | cadastro + BUs num salvar, `Inativar`/`Ativar` com confirmação, remover BU com confirmação | `GestaoCoordenadoresPage` |
| `/ferias-vendedor` | cadastro (calendário), lista "Férias ativas e futuras", `Encerrar` com confirmação | `FeriasVendedorPage` |
| (comum) | diálogo de confirmação nomeando o alvo (RN-025), aviso de bloco que falhou, marcador; carregar bloco e gravar | `components/Confirmacao.tsx`, `components/use-bloco.ts` |

Toda tela carrega os blocos com `Promise.allSettled`; bloco que falha mostra
"Não foi possível carregar este bloco agora. Tente atualizar a tela." e o
formulário continua usável (RF-005, C-026).

Regra pura em `novo/frontend/src/lib/` (o que os testes importam):

| Arquivo | Funções |
|---|---|
| `gestao.ts` | `validarSupervisor`, `validarMotivo`, `resumoEscopos` (C-012), `confirmacao(acao, alvo)` (RN-025), `mensagemBloqueio` (RN-001, RN-002), `MSG_BLOCO` (C-026) |
| `ferias.ts` | `estadoFerias`, `validarFerias(nova, existentes, pessoas)` (RNT-010, RN-020, mensagem do C-021) |
| `papeis.ts` | `papeisEditaveis`, `marcacoes(papeis)`, `mensagemPapeis(nome, papeis)` |

## Mudanças em arquivos compartilhados (mínimas)

| Arquivo | Mudança | Por quê |
|---|---|---|
| `novo/frontend/src/lib/menu.ts` | `/ferias-vendedor` passa a `COORDENADOR_ATIVO`, DIRETORIA, ADMIN; para quem não é coordenador ativo, o item aparece na seção Diretoria (como Titulares); `/governanca-rca` passa a "Usuários" (coordenador ativo, DIRETORIA, GESTOR, ADMIN) e `/configuracao-escopo-usuarios`, `/gestao-cargos-usuarios`, `/gestao-bus-vendedores` e `/gestao-acesso-executivas` saem de `ROTAS` e das seções (telas fundidas ou retiradas) | RN-001 da 010; hoje está só coordenador (spec 001, linha do menu) |
| `novo/frontend/src/pages/AcessoRestrito.tsx` | usa `mensagemBloqueio`: acrescenta "Seu perfil: …" e a mensagem de COORDENADOR sem cadastro ativo | RN-001, RN-002 |
| `novo/frontend/src/lib/server-functions.ts` | entradas novas em ordem alfabética, ids 1001+ | contrato com o `add-010` |
| `novo/backend/simulator/config.mjs` | `CHECK_INPUT` ganha `vendedorId`, `busca`, `filtro`, `papel`, `limite`, `offset` | o `sim:check` executa as leituras novas |
| `novo/backend/add-000-perfil-acesso.mjs` | nenhuma (nenhuma tabela nova) | — |

## Simulador

- **`schema-producao/010-gestao.mjs`:** `VENDEDOR_RCA_AUDITORIA`, `RCA_TOTVS`,
  `COORDENADORES_BU`. Conferido: nenhuma está em `000-base`, `001-acesso` nem
  nos `add-*`. (Vendas, devoluções, metas, visitas e comissões saíram com o
  Painel e o Gestão Cadastros, D4; a 002 declara `VISITAS` e
  `IMP_DEVOLUCOES_TOTVS` no branch dela.)
- **`seeds/010-gestao.mjs`:** RCAs 10001+; usuários novos por `ctx.usuario`;
  filial 1 e 2 · Nutrição para coordenador, férias e executivas; BUs 12 e 13;
  seções 10001, 10002, 10003 na BU Nutrição (C-012).

  | Usuário | Para | Dados |
  |---|---|---|
  | Nina Alves | C-012, C-013, RN-012, RN-013 | escopo ativo F1·Nutrição·seção 10002; escopo na BU 13 (ativa no seed) |
  | Olga Pires / Pedro Sales / Quésia Lemos | C-014, C-015, RN-014 | RCA 10936 (sup 10012) / RCA 10940 (sup 10012) / sem RCA; `RCA_TOTVS` com 10936, 10937, 10940, 10941 e 10012 |
  | Carlos Viana | C-023, C-024, férias | coordenador ativo (sup 10045) com F1·Nutrição |
  | Davi Moura | C-016, RN-015 | usuário sem cadastro de coordenador |
  | Rui Barros / Sara Nunes | C-017, RN-016, D-010-2 | GESTOR em `USUARIO_PAPEL` / COORDENADOR só em `USUARIO_CARGO` |
  | Tereza Lima / Ulisses Reis / Vítor Gomes / Xavier Melo | C-021, C-022, RN-020 | RCAs; escopo F1·Nutrição; Tereza 01/11–15/11 e 01/12–15/12 com Ulisses; Vítor 20/10–10/11 com Xavier |
  | Yara Dias | RN-020 | escopo F1·Nutrição, sem RCA |
  | Joana Prates / Renata Costa | C-023 / C-024 | escopo F1·Nutrição / só F3·Medicamento |

## Testes

Backend em `novo/backend/simulator/smoke/010-gestao.mjs`; tela em
`novo/frontend/tests/{gestao,ferias,papeis}.test.mjs`. Título começa pelo id.

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-012 / RN-013 | smoke + `gestao.test` | seções 10001, 10002, 10003 com 10002 ativa → reativadas 0, incluídas 2; `resumoEscopos` = "2 escopos vinculados. 1 já existia."; recadastro ativo → 0 e 0 |
| C-013 | smoke | desvincular → `ATIVO = 0`; reativar a mesma combinação → 1 e mesmo `ID` |
| C-014 | smoke | auditar 10936 para Pedro → 0 linhas; vincular → 0; auditoria sem linha nova |
| C-015 | smoke | remover de Pedro → auditoria 10940/10012 → vazio/vazio, autor e data; `VENDEDOR_RCA` sem Pedro |
| C-016 / RN-015 | smoke + `gestao.test` | Davi com 2 BUs → 1 cadastro e 2 BUs; "45A" recusado (servidor 0, tela mensagem); ativar sem usuário → 0; segundo cadastro ativo do mesmo usuário → 0 |
| C-017 | smoke | Rui {GESTOR} + coordenador → `s360SessaoObter` = {COORDENADOR, GESTOR} |
| C-021 | smoke + `ferias.test` | Tereza 10/11–20/11 → 0; tela "Tereza Lima já tem férias entre 01/11/2026 e 15/11/2026." |
| C-022 | smoke | encerrar Vítor em 30/10 → `DT_FIM` 30/10; encerrar a futura de Tereza → `ATIVO = 0` e `DT_FIM` inalterado |
| C-023 | smoke | Carlos desativa Joana com "Desligamento" → `BLOQUEADO = 1`, motivo, autor e data; Joana: sessão `BLOQUEADO = 1`, contadores 0 linhas; carteira inalterada |
| C-024 | smoke | Renata fora da lista de Carlos; alterar Renata como Carlos → 0 |
| C-026 | `gestao.test` | `MSG_BLOCO` é a frase padrão (a tela usa `allSettled` por bloco) |
| RN-001 | smoke + `gestao.test` | matriz: a SF de carga de cada tela (em Usuários, de cada parte) devolve 0 linhas para Ana (VENDEDOR) e para Rita (COORDENADOR sem cadastro) nas telas de coordenador; devolve linhas para o papel certo. Tela: `mensagemBloqueio` de Rita = "Seu cadastro de coordenador não está ativo. Procure a diretoria." |
| RN-002 | `gestao.test` | bloqueio de Usuários para Ana: "Esta tela está disponível apenas para Coordenador, Diretoria, Gestão e TI." + "Seu perfil: Vendedor", sem nome de tabela |
| RN-012 | smoke | BU 13 inativada direto na tabela (como a carga do ERP): incluir escopo → 0; escopo de Nina na BU 13 segue ativo; nenhuma SF da 010 tem `INSERT`/`UPDATE`/`DELETE`/`REPLACE` em `BU` |
| RN-014 | smoke | Olga 10936 → 10937 com `anterior=999` no input: auditoria anterior = 10936 |
| RN-016 | smoke | Rui {COORDENADOR, GESTOR} − coordenador → {GESTOR}; Tânia com tudo desmarcado continua ADMIN; Sara (COORDENADOR só no legado) desmarcada → sessão sem COORDENADOR e `USUARIO_CARGO` = VENDEDOR |
| RN-020 | smoke + `ferias.test` | substituto sem RCA (Yara) → 0; substituto = titular → 0; início > fim → 0; Xavier (substituindo Vítor) não sai de férias no período → 0; Vítor (de férias) não substitui no período → 0; titular fora da equipe de Carlos → 0 |
| RN-021 | smoke | lista de Carlos sem Gil (DIRETORIA), sem Carlos e sem coordenador ativo; com Joana |
| RN-022 | smoke + `gestao.test` | motivo de 600 caracteres → 0; reativar Joana → contadores voltam |
| RN-025 | `gestao.test` | `confirmacao` existe e nomeia o alvo para as 9 ações; a tela só chama a SF no `Confirmar` do diálogo |

Fora deste plano (etapa 2 ou 3): C-018, C-019, C-020, RN-017, RN-018, RN-019,
RN-023, RN-024.

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-010-1 | Gravação de mais de uma tabela = SFs SQL chamadas em sequência pela tela, cada uma idempotente e guardada; mensagem final da releitura. No RCA, a auditoria vem **antes** e a gravação exige a auditoria correspondente | SF JavaScript orquestrando; uma SF por tela | business não grava de dentro de SF JS (`docs/arquitetura.md`); a plataforma não tem transação entre SFs. Assim nenhuma gravação de RCA acontece sem auditoria, e repetir `Salvar` completa o que faltou |
| D-010-2 | **Papéis: grava nas duas tabelas.** `USUARIO_PAPEL` recebe e perde DIRETORIA/COORDENADOR/VENDEDOR; `USUARIO_CARGO`, quando guarda um desses três, passa ao maior papel editável que ficou (DIRETORIA > COORDENADOR > VENDEDOR; nenhum = VENDEDOR). GESTOR/ADMIN no legado nunca são tocados. A tela salva sempre o conjunto inteiro (inclui os marcados, remove os desmarcados, sincroniza o legado) | (b) ler o legado só para GESTOR/ADMIN; (c) travar a remoção de papel que veio do legado | com a união da D-003, tirar só da tabela nova não tira o papel; (b) apaga papéis dados no antigo enquanto ele está no ar e mexe na guarda da 001; (c) deixa a diretoria sem conseguir remover. **Aprovado pelo usuário em 2026-11-03** |
| D-010-3 | Motivo da recusa: a tela valida com a regra pura (formato, duplicata na lista carregada, sobreposição de férias) e mostra a mensagem da spec; o servidor recusa de novo com as mesmas condições e responde 0 | SF que devolve código de erro | uma SF SQL de escrita só devolve linhas afetadas; a regra pura é testável e o servidor continua sendo a barreira |
| D-010-4 | *Sem efeito desde 2026-11-03 (Painel cancelado, D4).* Realizado da equipe soma cada linha de venda uma vez, se atribuída a pelo menos um vendedor do filtro | somar os realizados individuais | o mesmo cliente pode estar na carteira de dois vendedores na mesma BU (C-018), e o substituto herda o titular: somar contaria duas vezes |
| D-010-5 | *Sem efeito desde 2026-11-03 (Painel cancelado, D4).* Bruto de `PEDIDOS_SEMANAIS_SYNC_RAW` (`ATIVO` e `STATUS_INGESTAO = 'ATIVO'`), devolução de `IMP_DEVOLUCOES_TOTVS` pela data da devolução, ambos pelo fragmento `REALIZADO` de `lib/010-gestao.mjs` | `IMP_VENDAS_DASHBOARD_TOTVS_RCA` | é a fonte do acompanhamento semanal (SF 104) e do Painel atual, com DDL conhecido. Dashboard e Analytics (005, 007) precisam usar o mesmo fragmento para o RF-002 valer |
| D-010-6 | Paginação com `COUNT(*) OVER ()` na própria listagem | SF irmã de contagem | metade das SFs; MySQL 8 e SQLite aceitam |
| D-010-7 | Remoções físicas só onde a tabela não tem `ATIVO`: vínculo RCA, BU do coordenador, papel | marcador em vez de apagar | as tabelas de produção não têm coluna de estado e C1 proíbe acrescentar; T-003 confirma que SF SQL com `DELETE` roda para business |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Sequência interrompida (aba fechada entre `Criar` e `BuIncluir`, ou entre auditar e vincular) | coordenador sem as BUs; linha de auditoria sem gravação | cada passo é idempotente: abrir e `Salvar` de novo completa. A auditoria órfã registra uma tentativa real e válida; ver `ponytail:` no `add-010` |
| `DELETE` em SF SQL recusado para business | remover RCA, BU do coordenador e papel falham | T-003 testa no sandbox antes de publicar; se recusar, volta ao plano (D-010-7) |
| Estrutura real de `USUARIO_CARGO`, `VENDEDOR_RCA_AUDITORIA` ou `RCA_TOTVS` diferente da declarada | SF falha na publicação | T-002 lê com `listTablesMitra` e corrige `schema-producao/010-gestao.mjs` |
| Tabelas declaradas aqui também declaradas por 002/009 em paralelo | duplicata no merge | lista publicada na pasta de notas das sessões; quem chegar depois usa a já declarada |

## Complexity Tracking

Vazio.

## Etapa 2 — Gestão de Carteira (aprovada em 2026-11-03)

**Escopo:** RF-028, RF-029, RN-017 a RN-019, C-018 a C-020, RNF-004, e a
confirmação de `Transferir toda carteira` da RN-025. Tela `/gestao-carteira`,
só para coordenador com cadastro ativo (RN-001; a rota já está em `ROTAS` com
esse perfil). A diretoria não abre esta tela.

### Reuso da spec 002 (sem editar arquivo dela)

- `lib/002-carteira.mjs`: `escopoAlvo` nos modos `TEAM` (toda a equipe) e
  `SELLER` (um vendedor), que já recortam pelas BUs do coordenador ativo e
  exigem RCA (RNT-004 → RN-017); `carteiraVisivel` (vínculo × linha de escopo
  do dono, sem Pessoa Física, sem combinação de outro titular); `cod`, `num`,
  `ramoDe`, `nomeCliente`, `nomeUsuario`, `semAcento`, `naoPessoaFisica`,
  `responsavelNoEscopo` ("cliente disponível" da 002, RN-019).
- SF `s360ClientesRamos` da 002 para o filtro Ramo (já no mapa do frontend).
- Nenhuma tabela nova: `EQUIPE_CLIENTE` (vínculo: cliente + vendedor + filial
  + seção, chave única), `BU_VENDEDOR`, `COORDENADORES_BU`, `CLIENTES`,
  `IMP_CLIENTES_TOTVS`, todas já declaradas.

### Contratos (SFs SQL, prefixo `s360GestaoCarteira`, em `add-010-gestao.mjs`)

Recorte comum: `escopoAlvo` com `modo` = `TEAM` quando `vendedorId` é 0 e
`SELLER` senão; quem não é coordenador ativo recebe 0 linhas.

| Nome | Entrada | Saída | Atende |
|---|---|---|---|
| `s360GestaoCarteiraVendedores` | `hoje` | equipe com os escopos dentro das BUs do coordenador: `VENDEDOR_ID`, `NOME`, `COD_RCA`, `CODFILIAL`, `FILIAL`, `CODEPTO`, `BU`, `ID_SECAO`, `SECAO` (uma linha por escopo) | RF-028, C-020 |
| `s360GestaoCarteiraListar` | `vendedorId` (0 = equipe), `ramo` ('' = todos), `busca` (código, nome ou CNPJ), `limite`, `offset`, `hoje` | uma linha por vínculo exibido: `VINCULO_ID`, `ID_CLIENTE`, `CLIENTE`, `VENDEDOR_ID`, `VENDEDOR`, `COD_RCA`, `RAMO`, `CIDADE`, `UF`, `STATUS`, `CODFILIAL`, `FILIAL`, `CODEPTO`, `BU`, `ID_SECAO`, `SECAO`, `TOTAL`; 50 por página | RF-028, RN-017 |
| `s360GestaoCarteiraTransferir` | `vinculoId`, `codepto`, `destinoId`, `hoje` | linhas afetadas (`UPDATE` só de `ID_VENDEDOR`: o vínculo mantém filial e seção) | RF-029, RN-018 |
| `s360GestaoCarteiraMotivo` | idem | `MOTIVO`: `FORA_DA_EQUIPE`, `SEM_ESCOPO`, `JA_TEM`; a tela monta a mensagem da spec | C-018, RN-018 |
| `s360GestaoCarteiraPrevia` | `origemId`, `destinoId`, `hoje` | `TOTAL`, `JA_TEM`, `SEM_ESCOPO`, `ESCOPO_FALTANDO` (primeira filial · departamento sem escopo do destino) | C-019, RN-018 |
| `s360GestaoCarteiraTransferirToda` | `origemId`, `destinoId`, `hoje` | linhas afetadas; um `UPDATE` só (tudo ou nada); 0 se algum vínculo cair em `SEM_ESCOPO` | C-019, RN-018, RNF-004 |
| `s360GestaoCarteiraDisponiveis` | `vendedorId`, `codFilial`, `codepto`, `idSecao`, `busca`, `hoje` | até 8 clientes disponíveis no escopo escolhido: `ID`, `CLIENTE`, `CNPJ`, `CIDADE`, `UF` | RN-019 |
| `s360GestaoCarteiraAdicionar` | `clienteId`, `vendedorId`, `codFilial`, `codepto`, `idSecao`, `agora`, `hoje` | linhas afetadas (`INSERT` no escopo pedido; escopo vazio ou de fora = 0) | RF-029, C-020, RN-019 |

Regras no SQL:
- **Transferir** exige origem e destino na equipe (modo `TEAM`), destino com
  escopo ativo na filial + departamento do vínculo (+ seção, se o escopo do
  destino define seção) e destino sem o mesmo cliente na mesma filial e seção.
  A checagem de duplicata lê `EQUIPE_CLIENTE` por uma derivada `DISTINCT`
  (erro 1093 do MySQL, como na etapa 1) e evita a chave única.
- **Transferir toda carteira** move de uma vez os vínculos da origem dentro das
  BUs do coordenador; os que o destino já tem ficam com a origem (C-019: Ana
  fica com 3). Se algum vínculo não tem escopo do destino, nada é transferido
  e a tela mostra "Nada foi alterado: <destino> não atua em <filial ·
  departamento>." (D-010-8).
- **Adicionar** segue a `s360DisponivelAdicionar` da 002, trocando
  `:VAR_USER` pelo vendedor da equipe: sem Pessoa Física, sem responsável no
  escopo, um escopo escolhido. A busca de disponíveis é `LIKE` sem acento no
  nome e igualdade no código ou CNPJ, `LIMIT 8` (RNT-014).

### Superfície

| Tela / rota | Responsabilidade | Novos |
|---|---|---|
| `/gestao-carteira` | filtros Vendedor, Ramo e busca; tabela com Código, Cliente, Vendedor/RCA, Ramo, Cidade/UF, Status, Escopo, 50 por página; `Transferir cliente` por linha (escolhe o destino); `Transferir toda carteira` com o vendedor filtrado (prévia + confirmação RN-025 com os números); `Adicionar à carteira` (vendedor, escopo quando há mais de um, busca até 8) | `GestaoCarteiraPage` |

Regra pura em `src/lib/gestao-carteira.ts`: `mensagemTransferencia(motivo,
destino, escopo)` (C-018, RN-018), `resumoTransferencia(transferidos, jaTinha,
destino)` ("37 clientes transferidos. 3 já estavam com Bruno."),
`escoposDoVendedor(linhas, id)` e `precisaEscolherEscopo` (C-020). A
confirmação `transferirCarteira` entra em `confirmacao()` de `lib/gestao.ts`.

### Arquivos compartilhados

| Arquivo | Mudança |
|---|---|
| `novo/frontend/src/lib/server-functions.ts` | 8 entradas `gestaoCarteira*`, ids 1041–1048 |
| `novo/backend/simulator/config.mjs` | `CHECK_INPUT` só se faltar chave (`ramo`, `origemId`, `destinoId`, `vinculoId`); conferir antes |
| arquivos da 002 | nenhuma edição; reuso por `import` |

### Simulador

- **Seed** (`seeds/010-gestao.mjs`), tudo novo e isolado: BU 15 "Ortopedia"
  (id fixo 10015) com seções 10011 e 10012, para nenhuma outra spec ver estes
  dados; coordenadora nova, Célia Rocha (supervisor 10049), com F1·15 e F2·15;
  vendedores novos por `ctx.usuario`:

  | Usuário | Para | Dados |
  |---|---|---|
  | Lara Pinto | C-018, C-019 | escopo F1·15·10011; 40 clientes (10101–10140) |
  | Mauro Teles | C-018, C-019 | escopo F1·15·10011; 3 desses clientes (10101–10103) |
  | Otto Brito | RN-018 | escopo só F2·15 |
  | Zilda Faria | C-020 | escopos F1·15·10011 e F2·15·10011 |
  | Wagner Lopes | RN-017 | escopo só F3·15 (fora das BUs de Célia) |
  | — | RN-019 | clientes disponíveis 10150–10160 (11, para testar o limite de 8) e um Pessoa Física (10161) |

- **Smoke** (`smoke/010-gestao.mjs`): C-018, C-019, C-020, RN-017, RN-018
  (sem escopo → 0 e nada muda; carteira inteira com um vínculo sem escopo →
  0), RN-019 (Pessoa Física fora; no máximo 8), RNF-004 (2.000 vínculos no
  banco descartável, cronometrado, < 10 s) e a linha da Gestão de Carteira na
  matriz RN-001 (Célia vê; Ana, Paulo e Rita veem 0).
- **Tela** (`tests/gestao-carteira.test.mjs`): mensagens do C-018, C-019 e
  RN-018; C-020 (dois escopos pedem escolha, um não pede); texto da
  confirmação `transferirCarteira`.

### Decisões da etapa 2

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-010-8 | `Transferir toda carteira`: se algum vínculo da origem cai fora dos escopos do destino, **nada** é transferido, com a mensagem da RN-018; duplicatas não bloqueiam e ficam com a origem | transferir o que der e deixar o resto | a RN-018 diz "tudo ou nada"; parcial deixaria a carteira dividida sem aviso claro |
| D-010-9 | A lista mostra um vínculo por linha (cliente × filial × seção × vendedor), com a coluna Escopo | uma linha por cliente | a transferência age num vínculo (o que mantém filial e seção); o mesmo cliente em duas filiais são duas linhas |
| D-010-10 | Prévia (`s360GestaoCarteiraPrevia`) antes da confirmação | só o `UPDATE` | sem transação, a contagem de "já estavam" tem de vir antes; a prévia também mostra o bloqueio sem chegar a gravar |

Riscos: `UPDATE` com 2.000 vínculos e subconsultas por linha (RNF-004) —
medir no smoke e, se passar de 10 s, trocar as subconsultas por `JOIN` na
derivada; `IMP_CLIENTES_TOTVS` sem ramo para alguns clientes → "Sem ramo"
(`ramoDe` da 002).
