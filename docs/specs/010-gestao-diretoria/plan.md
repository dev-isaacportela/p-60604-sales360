# Plan: Gestão, coordenação e diretoria

**Spec:** `./spec.md` · **Data:** 2026-11-03

> O COMO. Nenhum requisito novo nasce aqui. Se faltou algo, volta para a spec.

## Etapas

A spec 010 é construída em três etapas, cada uma com o seu plano e o seu
`tasks.md` marcado:

| Etapa | O quê | Por quê separado |
|---|---|---|
| **1 (este plano)** | Painel de Gestão, Gestão Cadastros (comissões), BUs e Vendedores, Escopo Usuários, Governança RCA, Gestão Coordenadores, Papéis de Usuários, Férias de Vendedores, Executivas de Venda | só depende da 001 |
| **2** | Gestão de Carteira: RF-028, RF-029, RN-017 a RN-019, C-018 a C-020, RNF-004 | depende das regras de carteira da spec 002, construída em paralelo |
| **3** (aprovada em 2026-11-03) | Rotinas automáticas: RF-033, RF-034, RN-023, RN-024, RNF-002, RNF-003 | nada roda nem se verifica nesta máquina: integração com o planejamento estratégico e Data Loader do ERP só existem no sandbox, e a rotina de clientes grava `CLIENTES`, dado da 002 |

Também fica para depois, dentro da etapa 1: **RF-009** (`Gerar novos alertas`,
should). O botão chama o ciclo de alertas da spec 008, que ainda não existe
no sistema novo; entra quando a 008 publicar as SFs.

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
| Venda (bruto) | `PEDIDOS_SEMANAIS_SYNC_RAW` | leitura: `CLIENTE_ID`, `CODFILIAL`, `CODEPTO`, `ID_SECAO`, `DATA_SAIDA`, `TOTAL`, `ATIVO`, `STATUS_INGESTAO`, `ATUALIZADO_EM` | **`schema-producao/010-gestao.mjs`** |
| Devolução | `IMP_DEVOLUCOES_TOTVS` | leitura: `CODCLI`, `CODFILIAL`, `CODEPTO`, `CODSEC`, `DATA_DEVOLUCAO`, `VALOR_DEVOLVIDO` (sem DDL no repo, L-01; T-002) | **010** |
| Meta do vendedor | `METAS_BU_VENDEDOR` | leitura: `SUM(META_VALOR)` por vendedor, ano, mês (C3) | **010** |
| Visita | `VISITAS` | leitura (fila e "Visitas pendentes") | **010** |
| Tarefa | `TAREFAS` | leitura (fila) | 001 |
| Comissão | `COMISSOES` | leitura e escrita | **010** |
| BU | `BU` | leitura e escrita (`CODIGO`, `NOME`, `ATIVO`) | 000 |
| Escopo | `BU_VENDEDOR` | leitura e escrita; desvincular = `ATIVO = 0` | 001 |
| Filial, seção | `FILIAL`, `SECAO` | leitura | 000 |
| Carteira | `EQUIPE_CLIENTE`, `CLIENTES` | leitura (realizado, clientes ativos) | 000 |
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

- `REALIZADO` — linhas de venda e devolução atribuídas pela RNT-007:
  cliente na carteira do vendedor **ou** na de um titular de quem ele é
  substituto com férias ativas na data; filial e departamento casando com um
  escopo ativo dele, e a seção quando o escopo define seção. Códigos comparados
  como número (`CAST(x AS UNSIGNED)`: 2 = 02).
- `naEquipe(alvo, { comRca })` — RNT-004: o alvo tem escopo ativo numa BU do
  cadastro ativo de coordenador de quem chama (e RCA, quando pedido).
- `GESTAO = temPapel('GESTOR','ADMIN')`, `DIRETORIA = temPapel('DIRETORIA','ADMIN')`.

Gravações respondem `affectedRows`; 0 = recusado e a tela mostra o motivo
(RNT-013, D-010-3).

### Painel de Gestão (GESTOR, ADMIN)

| Nome | Entrada | Saída | Atende |
|---|---|---|---|
| `s360PainelVendedores` | — | `ID`, `NOME`, `EMAIL`, `COD_RCA`: usuários com RCA vinculado | RF-007; select de comissões |
| `s360PainelResumo` | `hoje`, `vendedorId` (0 = toda a equipe) | 1 linha: `BRUTO`, `DEVOLUCAO`, `LIQUIDO`, `META`, `CLIENTES_ATIVOS`, `VISITAS_PENDENTES`, `SEM_CARTEIRA_LIQUIDO`, `SEM_CARTEIRA_CLIENTES`, `ATUALIZADO_EM` (mês de `hoje`) | RF-002, RF-006, RF-007; RN-003, RN-005, RN-007 |
| `s360PainelFila` | `hoje`, `vendedorId` | até 60 linhas: `TIPO` (TAREFA/VISITA), `ID`, `TITULO`, `CLIENTE`, `RESPONSAVEL`, `DATA`, `STATUS`, `ATRASADO`, `ACAO` | RF-008; RN-007 |

- **Equipe** = usuários com RCA vinculado; filtro de vendedor = um deles.
- **Realizado da equipe** = soma das linhas atribuídas a **pelo menos um**
  vendedor do filtro, cada linha uma vez (D-010-4).
- **Vendas sem carteira** = linhas nas BUs (filial + departamento) dos escopos
  ativos do filtro cujo cliente não está em carteira nenhuma; valor líquido e
  nº de clientes distintos.
- **Meta** = `SUM(METAS_BU_VENDEDOR.META_VALOR)` dos vendedores do filtro no
  mês; sem linha = 0 (RNT-009).
- **Fila:** ação e ordem da RN-007 calculadas no SQL (`ATRASADO` primeiro,
  depois tarefa pendente, depois data e responsável).

### Gestão Cadastros — comissões (GESTOR, ADMIN)

| Nome | Entrada | Saída | Atende |
|---|---|---|---|
| `s360ComissaoListar` | `busca`, `limite`, `offset` | `ID`, `VENDEDOR_ID`, `VENDEDOR`, `MES`, `ANO`, `VALOR_VENDAS`, `PERC_COMISSAO`, `VALOR_COMISSAO`, `TOTAL` (`COUNT(*) OVER ()`) | RF-020 |
| `s360ComissaoCriar` | `vendedorId`, `mes`, `ano`, `vendas`, `percentual` | linhas afetadas; comissão gravada = `ROUND(vendas × % ÷ 100, 2)` calculada no servidor; recusa duplicata vendedor + mês + ano | RN-011, C-010 |
| `s360ComissaoAtualizar` | `id` + os mesmos campos | linhas afetadas | RN-011 |
| `s360ComissaoExcluir` | `id` | linhas afetadas (`DELETE`; T-003) | C-010 |

### BUs e Vendedores (GESTOR, ADMIN)

| Nome | Entrada | Saída | Atende |
|---|---|---|---|
| `s360BuListar` | — | `CODIGO`, `NOME`, `ATIVO`, `VENDEDORES` (escopos ativos distintos) | RF-021 |
| `s360BuCriar` | `codigo`, `nome`, `agora` | linhas afetadas; recusa código não numérico, ≤ 0 ou já existente | RN-012, C-011 |
| `s360BuAtualizar` | `codigo`, `nome`, `agora` | linhas afetadas (só nome) | RF-021 |
| `s360BuStatusDefinir` | `codigo`, `ativo`, `agora` | linhas afetadas | RF-021, RN-012 |

O bloco "Vincular BU ao vendedor" e o de vínculo RCA ↔ departamento **não**
existem na tela nova (RF-022, Fora de escopo).

### Escopo Usuários (GESTOR, ADMIN)

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

### Governança RCA (GESTOR, ADMIN)

| Nome | Entrada | Saída | Atende |
|---|---|---|---|
| `s360RcaVinculoListar` | `busca`, `limite`, `offset` | todos os usuários: `USER_ID`, `NOME`, `EMAIL`, `COD_RCA`, `COD_SUPERVISOR`, `TOTAL` | RF-023 |
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

### Papéis de Usuários (DIRETORIA, ADMIN)

| Nome | Entrada | Saída | Atende |
|---|---|---|---|
| `s360PapelResumo` | — | `DIRETORIA`, `COORDENADORES`, `VENDEDORES`, `OUTROS` (GESTOR/ADMIN); sem papel conta como vendedor | RF-027 |
| `s360PapelListar` | `busca` (nome, e-mail, ID ou RCA), `papel` ('' = todos), `limite`, `offset` | `USER_ID`, `NOME`, `EMAIL`, `COD_RCA`, `PAPEIS` (união das duas tabelas), `TOTAL` | RF-027 |
| `s360PapelIncluir` | `userId`, `diretoria`, `coordenador`, `vendedor` (0/1), `agora` | papéis marcados que faltavam em `USUARIO_PAPEL` | C-017 |
| `s360PapelRemover` | idem | papéis desmarcados removidos de `USUARIO_PAPEL` (`DELETE`; T-003) | RN-016 |
| `s360PapelLegadoSincronizar` | `userId`, `agora` | `USUARIO_CARGO` acompanha a mudança (D-010-2) | RN-016, D-003 da 001 |

GESTOR e ADMIN não são parâmetro de nenhuma das três: por construção esta tela
não os altera (RN-016). A mensagem "<Nome>: papéis salvos (COORDENADOR,
GESTOR)." sai da releitura do usuário.

### Férias de Vendedores (coordenador ativo; DIRETORIA, ADMIN)

| Nome | Entrada | Saída | Atende |
|---|---|---|---|
| `s360FeriasPessoas` | — | `USER_ID`, `NOME`, `COD_RCA`: coordenador = equipe com RCA (RNT-004); diretoria/ADMIN = todos com RCA | RN-020 |
| `s360FeriasListar` | `hoje` | ativas e futuras do mesmo recorte: `ID`, titular, substituto, `DT_INICIO`, `DT_FIM`, `ESTADO` | RF-030 |
| `s360FeriasCadastrar` | `titularId`, `substitutoId`, `inicio`, `fim` | linhas afetadas; recusa pela RNT-010 e RN-020 (diferentes, ambos com RCA e no recorte, início ≤ fim, sem sobreposição do titular, titular não substitui no período, substituto não está de férias no período) | C-021, RN-020 |
| `s360FeriasEncerrar` | `id`, `hoje` | linhas afetadas: ATIVA → `DT_FIM = hoje`; FUTURA → `ATIVO = 0` (cancelada) | C-022 |

Titular e substituto chegam por **usuário**; o RCA é resolvido no servidor.

### Executivas de Venda (DIRETORIA, ADMIN; coordenador ativo)

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
| `/painel-gestao` | cards, filtro de vendedor, fila; data da última atualização das vendas | `PainelGestaoPage` |
| `/gestao-cadastros` | comissões: lista com busca e 10 por página, formulário com comissão calculada, excluir com confirmação | `GestaoCadastrosPage` |
| `/gestao-bus-vendedores` | lista de BUs, `+ Nova BU`, editar nome, `Inativar`/`Ativar` com confirmação | `BusVendedoresPage` |
| `/configuracao-escopo-usuarios` | vincular escopo (BU, filial, várias seções ou todas), lista com busca, `Desvincular` com confirmação | `EscopoUsuariosPage` |
| `/governanca-rca` | lista de vínculos, `Editar vínculo`, `Remover vínculo` com confirmação, auditoria | `GovernancaRcaPage` |
| `/gestao-coordenadores` | cadastro + BUs num salvar, `Inativar`/`Ativar` com confirmação, remover BU com confirmação | `GestaoCoordenadoresPage` |
| `/gestao-cargos-usuarios` | cards por papel, busca, filtro, marcar DIRETORIA/COORDENADOR/VENDEDOR; GESTOR e ADMIN só leitura | `PapeisUsuariosPage` |
| `/ferias-vendedor` | cadastro (calendário), lista "Férias ativas e futuras", `Encerrar` com confirmação | `FeriasVendedorPage` |
| `/gestao-acesso-executivas` | lista com busca, filtro e 20 por página, `Desativar acesso`/`Reativar acesso` com confirmação | `ExecutivasPage` |
| (comum) | diálogo de confirmação nomeando o alvo (RN-025) | `components/Confirmacao.tsx` |

Toda tela carrega os blocos com `Promise.allSettled`; bloco que falha mostra
"Não foi possível carregar este bloco agora. Tente atualizar a tela." e o
formulário continua usável (RF-005, C-026).

Regra pura em `novo/frontend/src/lib/` (o que os testes importam):

| Arquivo | Funções |
|---|---|
| `gestao.ts` | `lerValor` (RNT-011: `1.500,50` e `1500.50`), `percentual` (12,3%), `textoMeta`, `textoAtingimento`, `textoGap` (RN-006), `calcularComissao` (RN-011), `validarCodigoBu`, `validarSupervisor`, `validarMotivo`, `resumoEscopos` (C-012), `confirmacao(acao, alvo)` (as 9 da RN-025), `MSG_BLOCO`, `mensagemBloqueio(caminho, sessao)` (RN-001/RN-002) |
| `ferias.ts` | `estadoFerias`, `validarFerias(nova, existentes, pessoas)` (RNT-010, RN-020, mensagem do C-021) |
| `papeis.ts` | `papeisEditaveis`, `marcacoes(papeis)`, `mensagemPapeis(nome, papeis)` |

## Mudanças em arquivos compartilhados (mínimas)

| Arquivo | Mudança | Por quê |
|---|---|---|
| `novo/frontend/src/lib/menu.ts` | `/ferias-vendedor` passa a `COORDENADOR_ATIVO`, DIRETORIA, ADMIN; para quem não é coordenador ativo, o item aparece na seção Diretoria (como Titulares) | RN-001 da 010; hoje está só coordenador (spec 001, linha do menu) |
| `novo/frontend/src/pages/AcessoRestrito.tsx` | usa `mensagemBloqueio`: acrescenta "Seu perfil: …" e a mensagem de COORDENADOR sem cadastro ativo | RN-001, RN-002 |
| `novo/frontend/src/lib/server-functions.ts` | entradas novas em ordem alfabética, ids 1001+ | contrato com o `add-010` |
| `novo/backend/simulator/config.mjs` | `CHECK_INPUT` ganha `vendedorId`, `busca`, `filtro`, `papel`, `limite`, `offset` | o `sim:check` executa as leituras novas |
| `novo/backend/add-000-perfil-acesso.mjs` | nenhuma (nenhuma tabela nova) | — |

## Simulador

- **`schema-producao/010-gestao.mjs`:** `PEDIDOS_SEMANAIS_SYNC_RAW`,
  `IMP_DEVOLUCOES_TOTVS` (colunas do uso nas SFs, a verificar em T-002),
  `METAS_BU_VENDEDOR`, `VISITAS`, `COMISSOES`, `VENDEDOR_RCA_AUDITORIA`,
  `RCA_TOTVS`, `COORDENADORES_BU`. Conferido: nenhuma está em `000-base`,
  `001-acesso` nem nos `add-*`.
- **`seeds/010-gestao.mjs`:** ids 10001+ para clientes, linhas de venda,
  devolução, meta, tarefa e visita; RCAs 10001+; usuários novos por
  `ctx.usuario`. Base: filial 6 (Palmas, TO) e departamento 9 para o Painel
  (não se mistura com os dados das outras specs); filial 1 e 2 · Nutrição para
  coordenador, férias e executivas; BU 12 já existente (C-011); seções 10001,
  10002, 10003 na BU Nutrição (C-012).

  | Usuário | Para | Dados |
  |---|---|---|
  | Helena Duarte | C-001, RN-003, RN-007 | RCA; escopo F6·9; carteira; bruto 25.000; devolução 800 (200 + 600); meta 20.000; tarefa pendente 28/10; visitas 29/10 e 03/11 |
  | Igor Matos | C-001, RNT-007 (férias) | RCA; escopo F6·9; bruto 20.000; devolução 1.200; meta 25.000; substituto de Helena de 05/10 a 09/10; tarefa em andamento com prazo futuro |
  | Júlia Freitas | C-001, C-002 | RCA; escopo F6·9; bruto 5.000; meta 15.000 (o smoke apaga para o C-002) |
  | — | C-001, RN-003 | clientes 10011 e 10012 sem carteira: 1.000 e 2.500 − 500 de devolução em F6·9 |
  | Nina Alves | C-012, C-013, RN-012, RN-013 | escopo ativo F1·Nutrição·seção 10002; escopo na BU 13 (ativa no seed) |
  | Olga Pires / Pedro Sales / Quésia Lemos | C-014, C-015, RN-014 | RCA 10936 (sup 10012) / RCA 10940 (sup 10012) / sem RCA; `RCA_TOTVS` com 10936, 10937, 10940, 10941 e 10012 |
  | Carlos Viana | C-023, C-024, férias | coordenador ativo (sup 10045) com F1·Nutrição |
  | Davi Moura | C-016, RN-015 | usuário sem cadastro de coordenador |
  | Rui Barros / Sara Nunes | C-017, RN-016, D-010-2 | GESTOR em `USUARIO_PAPEL` / COORDENADOR só em `USUARIO_CARGO` |
  | Tereza Lima / Ulisses Reis / Vítor Gomes / Xavier Melo | C-021, C-022, RN-020 | RCAs; escopo F1·Nutrição; Tereza 01/11–15/11 e 01/12–15/12 com Ulisses; Vítor 20/10–10/11 com Xavier |
  | Yara Dias | RN-020 | escopo F1·Nutrição, sem RCA |
  | Joana Prates / Renata Costa | C-023 / C-024 | escopo F1·Nutrição / só F3·Medicamento |

- **Isolamento do Painel:** "Toda a equipe" soma todo vendedor com RCA,
  inclusive os das outras specs. O smoke do Painel apaga, no banco descartável,
  vendas, devoluções, metas, tarefas e visitas fora da faixa 10001–10999 antes
  de verificar os totais.

## Testes

Backend em `novo/backend/simulator/smoke/010-gestao.mjs`; tela em
`novo/frontend/tests/{gestao,ferias,papeis}.test.mjs`. Título começa pelo id.

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 | smoke | toda a equipe: líquido 48.000, meta 60.000, sem carteira 3.000 e 2 clientes; Tela: `textoAtingimento` 80,0%, `textoGap` "Faltam R$ 12.000,00" |
| C-002 | smoke + `gestao.test` | Júlia sem meta: `META = 0`, `LIQUIDO = 5.000`; tela "Meta não distribuída", "—" e sem texto de gap |
| C-003 | smoke | hoje 30/10, Helena: ordem [tarefa 28/10, visita 29/10, visita 03/11] e ações "Cobrar conclusão imediata", "Reagendar ou concluir hoje", "Confirmar agenda com cliente" |
| C-010 | `gestao.test` + smoke | `calcularComissao(50000, 3)` = 1500; texto de confirmação do C-010; servidor grava 1.500,00 e recusa a mesma vendedora + mês + ano |
| C-011 | smoke + `gestao.test` | "NUTRI" → 0 e mensagem; "12" → 0 e "Já existe a BU 12."; "15" → 1 |
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
| RN-001 | smoke + `gestao.test` | matriz: a SF de carga de cada uma das 9 telas devolve 0 linhas para Ana (VENDEDOR) e para Rita (COORDENADOR sem cadastro) nas telas de coordenador; devolve linhas para o papel certo. Tela: `mensagemBloqueio` de Rita = "Seu cadastro de coordenador não está ativo. Procure a diretoria." |
| RN-002 | `gestao.test` | bloqueio do Painel para Ana: "Esta tela está disponível apenas para Gestão e TI." + "Seu perfil: Vendedor", sem nome de tabela |
| RN-003 | smoke | apagar a devolução de 200 de Helena sobe o líquido dela e o da equipe em 200; venda de cliente de Helena em F1·Nutrição não conta |
| RNT-007 (férias) | smoke | venda de cliente de Helena em 06/10 conta para Igor filtrado; o total da equipe não muda (cada linha uma vez) |
| RN-005 | smoke | metas 20.000 + 25.000 + 15.000 → 60.000 |
| RN-006 | `gestao.test` | meta 50.000, realizado 55.000 → 110,0% e "Meta superada em R$ 5.000,00"; meta 0 → "—" |
| RN-007 | smoke | 70 itens → 60; Igor em andamento com prazo futuro → "Acompanhar andamento"; "Visitas pendentes" de Helena = 1 |
| RN-011 | `gestao.test` | `calcularComissao(12345.67, 2.5)` = 308.64; `lerValor('1.500,50')` = `lerValor('1500.50')` = 1500.5 |
| RN-012 | smoke | BU 13 inativada: incluir escopo → 0; escopo de Nina na BU 13 segue ativo |
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
| D-010-4 | Realizado da equipe soma cada linha de venda uma vez, se atribuída a pelo menos um vendedor do filtro | somar os realizados individuais | o mesmo cliente pode estar na carteira de dois vendedores na mesma BU (C-018), e o substituto herda o titular: somar contaria duas vezes |
| D-010-5 | Bruto de `PEDIDOS_SEMANAIS_SYNC_RAW` (`ATIVO` e `STATUS_INGESTAO = 'ATIVO'`), devolução de `IMP_DEVOLUCOES_TOTVS` pela data da devolução, ambos pelo fragmento `REALIZADO` de `lib/010-gestao.mjs` | `IMP_VENDAS_DASHBOARD_TOTVS_RCA` | é a fonte do acompanhamento semanal (SF 104) e do Painel atual, com DDL conhecido. Dashboard e Analytics (005, 007) precisam usar o mesmo fragmento para o RF-002 valer |
| D-010-6 | Paginação com `COUNT(*) OVER ()` na própria listagem | SF irmã de contagem | metade das SFs; MySQL 8 e SQLite aceitam |
| D-010-7 | Remoções físicas só onde a tabela não tem `ATIVO`: comissão, vínculo RCA, BU do coordenador, papel | marcador em vez de apagar | as tabelas de produção não têm coluna de estado e C1 proíbe acrescentar; T-003 confirma que SF SQL com `DELETE` roda para business |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Sequência interrompida (aba fechada entre `Criar` e `BuIncluir`, ou entre auditar e vincular) | coordenador sem as BUs; linha de auditoria sem gravação | cada passo é idempotente: abrir e `Salvar` de novo completa. A auditoria órfã registra uma tentativa real e válida; ver `ponytail:` no `add-010` |
| `DELETE` em SF SQL recusado para business | excluir comissão, remover RCA, BU do coordenador e papel falham | T-003 testa no sandbox antes de publicar; se recusar, volta ao plano (D-010-7) |
| Estrutura real de `IMP_DEVOLUCOES_TOTVS` e de `USUARIO_CARGO` diferente da declarada | SF falha na publicação | T-002 lê com `listTablesMitra` e corrige `schema-producao/010-gestao.mjs` |
| Painel lento em produção (comparação por `CAST`, sem índice) | RNF-001 (5 s) | T-104 mede com outubro/2026 de produção; se passar, filtro prévio por mês no CTE |
| Dashboard e Analytics calcularem realizado de outro jeito | RF-002 | fragmento único `REALIZADO`; relatório pede que 005 e 007 o importem |
| Tabelas declaradas aqui também declaradas por 002/009 em paralelo | duplicata no merge | lista publicada na pasta de notas das sessões; quem chegar depois usa a já declarada |

## Complexity Tracking

Vazio.
