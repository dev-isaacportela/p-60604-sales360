# Plan: Atividades (tarefas e follow-ups)

**Spec:** `./spec.md` · **Data:** 2026-11-03

> O COMO. Nenhum requisito novo nasce aqui. Se faltou algo, volta para a spec.

Tela `/tarefas` sobre o esqueleto da 001 e os fragmentos da 002 (escopo,
carteira, busca inteligente). A 001 já entrega o contador do menu
(`s360ContadoresObter`, RN-011) e a preferência Lista/Kanban
(`sessao.exibicaoAtividades`): a 004 só **usa** os dois.

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` sem pendência aberta (decisão de 2026-10-30 sobre o substituto) |
| Backend escrito local, executado no sandbox | sim | `novo/backend/add-004-atividades.mjs` só roda no sandbox, depois dele `add-000-perfil-acesso.mjs` |
| Migrations append-only | sim | nenhuma tabela nem coluna nova; `TAREFAS`, `ATIVIDADES_LOG` e `GOOGLE_AGENDA_FILA` já existem em produção |
| Leitura e escrita por Server Function | sim | 9 SFs `s360*`; escrita só por SF SQL; a busca de clientes é SF JAVASCRIPT só de leitura |
| Simulador cobre a feature | sim | `schema-producao/004-atividades.mjs`, `seeds/004-atividades.mjs` (ids 4001+, usuários próprios), `smoke/004-atividades.mjs` |
| Testes automatizados obrigatórios | sim | cada linha da seção Testes da spec vira um `teste()` no smoke ou um `test()` em `tests/atividades.test.mjs` (mapa abaixo) |
| Design tokens, sem cor literal | sim | vocabulário de `components/page.tsx` (`Table`, `Board`, `Status`, `Badge`, `Dialog`); linha compacta e altura padrão na lista e no Kanban |
| Simplicidade | sim | nenhuma dependência nova; reusa `escopoAlvo`/`carteiraVisivel` e as funções de busca da 002, `FiltroEscopo`, `Confirmacao`, `avisarContadores` |

## Contexto técnico

- Mesmo stack da 001/002. Nenhuma dependência nova.
- **Reuso:** `lib/guardas.mjs` (`SEM_BLOQUEIO`), `lib/002-carteira.mjs`
  (`escopoAlvo`, `carteiraVisivel`, `nomeUsuario`, `nomeCliente`, `num`,
  `pagina`), `lib/002-regras.mjs` (`normalizarBusca`, `palavrasBusca`,
  `tolerancia`, `distanciaTrecho`, `camposBusca`, `relevancia` — RN-018 da
  002), `s360HistoricoLinhaTempo` (RN-014, só leitura), `useEscopo` +
  `FiltroEscopo` + `paraInput`, `Confirmacao`, `avisarContadores()` (RF-010),
  `useSessao().sessao.exibicaoAtividades` (RF-001), `formato.ts`
  (`hojeBrasilia`, `fmtData`, `fmtDataHora`).

## Modelo de dados

Nenhum acréscimo.

| Entidade (spec) | Tabela | Campos usados | Observação |
|---|---|---|---|
| Atividade | `TAREFAS` | todos | grava; já declarada em `schema-producao/001-acesso.mjs` |
| Log da atividade | `ATIVIDADES_LOG` | todos | grava; **FK → `TAREFAS(ID)` sem cascata** (DDL de `backend/hotfix-agenda-historico-atividades-mix.mjs`): excluir apaga o log antes da atividade |
| Fila do Google | `GOOGLE_AGENDA_FILA` | `ENTIDADE = 'TAREFA'`, `ENTIDADE_ID`, `SOLICITADO_EM`, `PROCESSADO_EM`, `TENTATIVAS`, `ULTIMO_ERRO` | grava; dono é a spec 003 (processamento). Formato do `googleAgendaEnfileirarSync` atual (id 374), que o processador de hoje (375) já lê |
| Cliente | `CLIENTES`, `EQUIPE_CLIENTE` (via `carteiraVisivel`) | cadastro | só leitura |
| Responsável | `INT_USER` | `NOME`, `DESCR` | só leitura |

Valores gravados (os de produção): `STATUS` `PENDENTE` (A Fazer),
`EM_ANDAMENTO`, `CONCLUIDA`; `PRIORIDADE` `ALTA`, `MEDIA`, `BAIXA`;
`DATA_LIMITE` `AAAA-MM-DD`; `CRIADO_EM` / `CONCLUIDO_EM` / `DATA_ALTERACAO`
`AAAA-MM-DD HH:MM:SS` de Brasília.

`ATIVIDADES_LOG.CAMPO_ALTERADO` = nome da coluna (`TITULO`, `DESCRICAO`,
`CLIENTE_ID`, `PRIORIDADE`, `DATA_LIMITE`, `STATUS`) ou `CRIACAO`. O log
antigo já grava `DATA_LIMITE` assim, então as linhas antigas aparecem certas.
Valores: data `AAAA-MM-DD`, status e prioridade pelo código, cliente como
"NOME · código" do momento da gravação; tudo cortado em 255 caracteres.

## Contratos de backend

Arquivo `novo/backend/add-004-atividades.mjs` (exporta `definitions`). Toda SF
resolve quem chama por `:VAR_USER` e leva `SEM_BLOQUEIO`. "Escopo" = os sete
parâmetros da 002 (`modo`, `coordenador`, `vendedor`, `filial`, `depto`,
`secao`, `hoje`). "Filtros" = `status` (`PENDENTE`, `EM_ANDAMENTO`,
`CONCLUIDA`, vazio), `prioridade` (`ALTA`, `MEDIA`, `BAIXA`, vazio), `prazo`
(`AAAA-MM-DD`, vazio).

**Quem aparece (RN-002):** `ME` = só as do próprio usuário (sem as do titular
em férias: decisão de 2026-10-30, RNT-010); demais modos = dono em
`escopoAlvo(...)` com `COBERTURA = 0`. Cada linha traz `SOMENTE_LEITURA = 1`
quando o dono não é quem chama.

### Leitura

| Nome | Tipo | Entrada | Saída | Atende |
|---|---|---|---|---|
| `s360AtividadesAbertas` | SQL | escopo + filtros | A Fazer e Em andamento: `ID`, `TITULO`, `DESCRICAO`, `STATUS`, `PRIORIDADE`, `DATA_LIMITE`, `CRIADO_EM`, `CLIENTE_ID`, `CLIENTE`, `VENDEDOR_ID`, `RESPONSAVEL`, `SOMENTE_LEITURA`; ordem RN-007 (A Fazer antes, prazo mais próximo, sem prazo no fim, `ID`) | RF-001, RN-002, RN-007 |
| `s360AtividadesConcluidas` | SQL | escopo + filtros + `pagina` | mesmas colunas + `CONCLUIDO_EM`, 20 por página, `TOTAL` em cada linha; conclusão mais recente primeiro (sem data no fim) | RN-007, RNFT-001 |
| `s360AtividadesResumo` | SQL | escopo + filtros | 1 linha: `TOTAL`, `EM_ANDAMENTO`, `ATRASADAS` (prazo < `hoje` e não Concluída), `CONCLUIDAS` | RF-002, RN-006, RN-013 |
| `s360AtividadeLog` | SQL | escopo + `id` | `CAMPO_ALTERADO`, `VALOR_ANTERIOR`, `VALOR_NOVO`, `DATA_ALTERACAO`, `USUARIO`; mais recente primeiro; só se a atividade aparece para quem pede (mesma regra da lista) | RF-008, C-009 |
| `s360AtividadeClientes` | JAVASCRIPT | `busca`, `hoje` | `{ ok, total, linhas[] }`: até 80 clientes da carteira **do próprio usuário** (`carteiraVisivel` em `ME`, que inclui titular coberto em férias ATIVAS, RNT-010), pela RN-018 da 002; linha `ID`, `NOME`, `RAZAO_SOCIAL`, `CNPJ`, `CIDADE`, `UF` | RF-009, RN-008 |

RNF-001: a tela abre com `s360AtividadesAbertas` + `s360AtividadesResumo`;
`s360AtividadesConcluidas` só ao abrir o bloco `CONCLUÍDA` (Lista) ou ao
mostrar o Kanban. O `s360EscopoOpcoes` do filtro de escopo é do componente
comum (1 por tela).

### Escrita (uma SF por ação, várias instruções na mesma SF)

| Nome | Entrada | O que grava | Atende |
|---|---|---|---|
| `s360AtividadeCriar` | `titulo`, `descricao`, `clienteId`, `prioridade` (vazio = `MEDIA`), `prazo`, `hoje` | `TAREFAS` (`STATUS = 'PENDENTE'`, dono `:VAR_USER`) → log `CRIACAO` → fila do Google (só com prazo) | RF-004, RN-004, RN-005, RN-008, RN-012 |
| `s360AtividadeAtualizar` | `id`, `titulo`, `descricao`, `clienteId`, `prioridade`, `prazo`, `hoje` | fila → uma linha de log por campo que mudou → `UPDATE` | RF-005, RN-005, RN-008, RN-009 |
| `s360AtividadeStatus` | `id`, `status` | fila (se tem prazo) → log `STATUS` → `UPDATE` com `CONCLUIDO_EM` (entrar em Concluída grava, sair apaga) | RF-006, RN-003 |
| `s360AtividadeExcluir` | `id` | fila (se tem prazo) → `DELETE` do log → `DELETE` da atividade | RF-007, RN-010 |

Regras comuns das quatro:
- **Dono (RN-001, RNT-012):** toda instrução filtra `T.VENDEDOR_ID =
  :VAR_USER`. Nenhum papel passa (sai a exceção GESTOR/ADMIN do antigo).
  Atividade de outro → 0 linhas em todas as instruções.
- **Validação no servidor (as mesmas regras da tela):** título com 1 a 300
  caracteres sem só espaços; prazo `AAAA-MM-DD`; prioridade e status da lista;
  descrição até 4.000; cliente vazio ou da carteira de `:VAR_USER` em `hoje`
  (`carteiraVisivel` em `ME`) — na edição o cliente só é conferido quando muda,
  para não travar a edição de quem perdeu o cliente da carteira depois.
- **Uma ação, tudo ou nada (RNF-002, D-002):** a plataforma roda as instruções
  uma a uma, sem transação. Cada instrução repete a mesma condição (dono +
  válido + mudou) e a ordem põe por último o que não pode ficar sozinho: a
  fila primeiro (um item a mais só faz o Google reler o estado atual), depois o
  log, e a alteração da atividade por último. Se o log falha, a atividade não
  muda. Na criação a atividade vem primeiro e o log e a fila acham a criada por
  `LAST_INSERT_ID()` (D-003).
- **Hora do servidor (RN-009, D-001):** `CRIADO_EM`, `CONCLUIDO_EM` e
  `DATA_ALTERACAO` = `DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 HOUR),
  '%Y-%m-%d %H:%i:%s')` (Brasília sem horário de verão desde 2019). A tela não
  manda `agora`.
- **Salvar sem mudança:** a tela não chama a SF (nada mudou → fecha a janela);
  o servidor também devolve 0 (nenhuma instrução passa na condição "mudou").
- **Resposta:** soma das linhas afetadas (padrão da 009). `> 0` = feito;
  `0` = recusado → "Nada foi alterado: a atividade não é sua." quando a linha é
  `SOMENTE_LEITURA`, senão "Não foi possível salvar a atividade." /
  "Não foi possível excluir a atividade." (RN-005, RN-010, RNT-013).
- **Fila do Google (RN-012):** `UPDATE` do item `('TAREFA', id)` existente
  (zera `PROCESSADO_EM`, `TENTATIVAS`, `ULTIMO_ERRO`) + `INSERT ... SELECT ...
  WHERE NOT EXISTS` quando não existe; atividade sem prazo nunca entra. Como o
  evento aparece no Google, e que o item de uma atividade excluída remove o
  evento, é do processador da spec 003 (o de hoje ignora item que não existe
  mais — risco abaixo).

## Superfície de interação

| Tela / rota | Responsabilidade | Novos |
|---|---|---|
| `/tarefas` | cabeçalho com `+ Nova Atividade`; filtro de escopo; Lista/Kanban (inicial = `sessao.exibicaoAtividades`, trocar não muda a preferência); cards Total, Em andamento, Atrasadas, Concluídas; filtros Status, Prioridade, `Prazo exato`, `Limpar filtros`, `Atualizar` | `pages/AtividadesPage.tsx` (`.rota = '/tarefas'`) |
| Lista | "Atividades abertas" (tabela compacta: título + cliente, responsável quando não é Meu painel, prioridade, prazo em vermelho se atrasada, seletor de status, lixeira) e bloco `CONCLUÍDA` recolhido com paginação de 20 | `pages/atividades/Lista.tsx` |
| Kanban | colunas A FAZER, EM ANDAMENTO, CONCLUÍDA (cartões compactos, seletor de status e lixeira no cartão; concluídas com paginação) | `pages/atividades/Kanban.tsx` |
| `Nova Atividade` / `Editar Atividade` | abas `Dados` e `Log`; título, descrição, cliente (busca com opções, "Refine a busca para ver mais clientes." acima de 80), prioridade, prazo; status não muda aqui; modo "Somente visualização" para atividade de outro (sem seletor, sem `Salvar alterações`, sem lixeira) | `pages/atividades/JanelaAtividade.tsx` |

Seletor de status e lixeira só aparecem em linha que não é `SOMENTE_LEITURA`.
Depois de criar, mudar status ou excluir: `avisarContadores()` (o menu relê
na hora, RF-010) e recarga de abertas, resumo e (se abertas) concluídas.

Regra pura em `novo/frontend/src/lib/atividades.ts` (o que os testes importam):

| Função / constante | Regra |
|---|---|
| `STATUS`, `PRIORIDADES`, `rotuloStatus`, `rotuloPrioridade` | RN-003, RN-004 (Alta vermelho, Média amarelo, Baixa verde pelo `tone` do `Badge`) |
| `atrasada(atividade, hoje)` | RN-006 |
| `validarAtividade(form)` | RN-005 e RN-008 (texto sem opção escolhida) → mensagem ou `null` |
| `mudou(original, form)` | salvar sem mudança não chama o servidor |
| `mensagemStatus(status)` | "Atividade marcada como {a fazer \| em andamento \| concluída}." |
| `textoLog(linha)` | "Prazo alterado — De 05/11/2026 para 08/11/2026 — Ana Souza — 30/10/2026 14:32"; "Atividade criada — …" |
| `colunasKanban(abertas, concluidas)` | RN-007 |
| `mensagemRecusa(somenteLeitura, acao)` | RNT-013 |
| `FILTROS_VAZIOS`, `paraInputFiltros` | RF-003 |

## Simulador

- `schema-producao/004-atividades.mjs`: `ATIVIDADES_LOG` (DDL do antigo, com a
  FK) e `GOOGLE_AGENDA_FILA` (DDL de `backend/fix-google-agenda-fila-e-put.mjs`).
  A 003 também vai ler a fila: se ela declarar, uma das duas cópias sai no
  merge (nota na pasta compartilhada).
- **Dialeto:** `UTC_TIMESTAMP()` não existe no simulador → uma linha em
  `mysql-dialect.mjs` (`def('UTC_TIMESTAMP', 0, …)`, igual ao `NOW()` do
  simulador, que já é UTC), citada no relatório. O resto (`LAST_INSERT_ID`,
  `DATE_SUB ... HOUR`, várias instruções, `ROW_NUMBER`, `COUNT(*) OVER ()`) já
  existe.
- `CHECK_INPUT`: acrescenta `status: ''`, `prioridade: ''`, `prazo: ''`, `id: '0'`
  (o `sim:check` roda as leituras novas sem erro de sintaxe).
- `simulator/seeds/004-atividades.mjs` — hoje = 30/10/2026; **usuários
  próprios** por `ctx.usuario` (nada nos 11 usuários-base, para não mexer nas
  contagens da 001/002); filial 6 · BU nova `14` · seção `4001`, fora dos
  escopos das outras specs:

  | Quem / o quê | Para |
  |---|---|
  | Amanda Reis (vendedora, RCA 4001): carteira com HOSPITAL SÃO LUCAS LTDA (código **4471**), CLÍNICA BOA VIDA (4002) e mais 6 clientes; 2 A Fazer ("Ligar para compras" 04/11, "Retornar orçamento" 05/11 com CLÍNICA BOA VIDA), 1 Em andamento, 5 Concluídas | C-001, C-003, C-006, C-007, C-008, RN-011 (contador 3), tela |
  | Bia Lopes (vendedora, RCA 4002): 2 Em andamento (02/11, 01/11), 2 A Fazer (04/11 e uma sem prazo), 25 Concluídas | C-005 |
  | Elisa Prado (vendedora, RCA 4003): 12 abertas, 3 com prazo 05/11/2026 e 5 Alta | C-011 |
  | Breno Costa (vendedor, RCA 4004): atividade **4812** com prazo | C-010 |
  | Caio Mendes (`COORDENADORES` 4001, BU filial 6 · 14) | C-009 |
  | cliente 4090 fora de toda carteira | C-003 (cliente enviado direto) |

## Testes

Backend em `novo/backend/simulator/smoke/004-atividades.mjs` (banco descartável
próprio; usuários achados pelo e-mail); tela em
`novo/frontend/tests/atividades.test.mjs`. O título de cada teste começa pelo id.

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| RN-011 | smoke | Amanda: `s360ContadoresObter` = 3 (2 A Fazer + 1 Em andamento; as 5 Concluídas não contam) |
| C-001 | smoke | criar com cliente 4471, `ALTA`, prazo 2026-11-05 → atividade `PENDENTE` de Amanda com cliente 4471; log `CRIACAO` de Amanda; contador 3 → 4; 1 item `('TAREFA', id)` na fila |
| C-002 / RN-005 | smoke + tela | SF: título "   " → 0 e nada gravado; prazo vazio → 0; tela: `validarAtividade` dá "Informe o título da atividade." e depois "Informe o prazo da atividade." |
| C-003 / RN-008 | smoke + tela | tela: texto "hospital" sem opção → "Selecione um cliente da lista ou apague o campo."; SF: `clienteId` vazio → `CLIENTE_ID` nulo e log `CLIENTE_ID` (de "CLÍNICA BOA VIDA · 4002" para vazio); cliente 4090 → 0 |
| RN-008 (busca) | smoke | `s360AtividadeClientes` com "hosp sao lucas" → 4471 primeiro; Caio em qualquer escopo recebe só a carteira dele (vazia); mais de 80 casando → 80 linhas e `total` > 80 (clientes extras inseridos no teste) |
| C-004 / RN-006 | tela | hoje 30/10: 29/10 A Fazer → atrasada; 30/10 Em andamento → não; 28/10 Concluída → não; `hojeBrasilia(2026-10-31T02:30Z)` = 30/10 |
| RN-006 (servidor) | smoke | `ATRASADAS` do resumo com os mesmos três casos = 1 |
| C-005 / RN-007 | smoke + tela | SF: Bia → ordem {A Fazer 04/11, A Fazer sem prazo, Em andamento 01/11, Em andamento 02/11}; concluídas `TOTAL` 25, página 1 com 20 e página 2 com 5, mais recente primeiro; tela: `colunasKanban` separa as 3 colunas na mesma ordem |
| C-006 / RN-003 | smoke + tela | A Fazer → Concluída grava `CONCLUIDO_EM` (hora do servidor), log `STATUS` de `PENDENTE` para `CONCLUIDA`, contador cai 1, item na fila; Concluída → Em andamento apaga `CONCLUIDO_EM`; tela: `mensagemStatus('CONCLUIDA')` = "Atividade marcada como concluída." e `textoLog` = "Status alterado — De A Fazer para Concluída — Amanda Reis — …" |
| C-007 / RN-009 | smoke + tela | prazo 05/11 → 08/11: 1 linha `DATA_LIMITE` com `ID_USUARIO` = Amanda e `DATA_ALTERACAO` a menos de 1 minuto da hora do servidor; só a descrição → 1 linha `DESCRICAO`; mesmos valores → 0 linhas e 0 afetadas; tela: `textoLog` do prazo no formato da RN-009, `mudou` falso sem mudança |
| RNF-002 | smoke | `ATIVIDADES_LOG` renomeada no banco do teste → a SF falha e a atividade continua com o prazo antigo (a tabela volta depois) |
| C-008 / RN-010 | smoke | excluir "Ligar para compras" → atividade e log apagados, contador recalculado, item na fila; excluir de novo → 0 |
| C-009 / RN-002 | smoke | Caio `TEAM` → as abertas de Amanda com `RESPONSAVEL` "Amanda Reis" e `SOMENTE_LEITURA` 1; log de uma delas visível para Caio; Amanda `TEAM` → 0 linhas; Amanda `ME` → `SOMENTE_LEITURA` 0 |
| C-010 / RN-001 | smoke + tela | Amanda: status, edição e exclusão da 4812 (de Breno) → 0 em todas e 4812 intacta, sem log nem fila; Caio com papel `GESTOR` gravado no teste → 0; tela: `mensagemRecusa(true)` = "Nada foi alterado: a atividade não é sua." |
| C-011 / RN-013 | smoke | Elisa: `prazo` 2026-11-05 → 3 abertas e resumo `TOTAL` 3; `prioridade` `ALTA` → 5 e `TOTAL` 5 |
| RN-004 | smoke | criar sem prioridade → `MEDIA` |
| RN-012 | smoke | criar sem prazo → nenhum item na fila; com prazo → 1; mudar status de atividade sem prazo → nenhum item |
| RN-014 | smoke | `s360HistoricoLinhaTempo` de Amanda para o cliente 4471: atividade aberta não aparece; depois de concluída, aparece como `ATIVIDADE` |
| RF-001 | tela | visão inicial = `exibicaoAtividades` da sessão (`visaoInicial`) |

Verificação manual (T-113): Lista e Kanban em 360 px; cores de prioridade e
prazo vencido em tema escuro; modo "Somente visualização" do coordenador.

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-001 | Hora de criação, conclusão e log vem do servidor (`UTC_TIMESTAMP()` − 3 h) | `agora` mandado pela tela (D-007 da 001) | a spec 004 corrige justamente o log com a hora do navegador (RN-009); `UTC_TIMESTAMP` não depende do fuso do MySQL e o Brasil não tem horário de verão. T-001 confere no sandbox |
| D-002 | Atomicidade pela ordem e pela condição repetida: fila → log → alteração | `START TRANSACTION` na SF; SF JAVASCRIPT | a plataforma não abre transação na SF SQL e usuário business não grava por JS; com a alteração por último, falha no log não muda a atividade (RNF-002). Sobra um caso: falha **depois** do log e **antes** do `UPDATE` deixa uma linha de log sem mudança — exige o banco cair entre duas instruções |
| D-003 | A criação não devolve o id: a SF põe a atividade criada na fila sozinha (log e fila acham a criada por `LAST_INSERT_ID()` + dono + criada há menos de 1 minuto) | devolver o id para a tela enviar ao Google | o id só servia para a tela mandar ao Google (a correção da spec); com a fila no servidor a tela não precisa dele. A linha "resposta traz o identificador criado" da spec vira "a fila recebe o id da criada" no teste |
| D-004 | Filtros e resumo calculados no servidor | filtrar na tela | as concluídas vêm paginadas; só o servidor conta todas (RN-013) |
| D-005 | Busca de clientes em SF JAVASCRIPT própria, com as funções da RN-018 da 002 | `s360CarteiraCarregar` | aquela calcula temperatura e vendas (pesada) e limita 50 por página; a RN-008 pede 80 |
| D-006 | Na edição, o cliente só é conferido na carteira quando muda | conferir sempre | quem perdeu o cliente da carteira ainda corrige o título ou o prazo |
| D-007 | Editar atividade antiga sem prazo exige informar o prazo para salvar (status muda sem prazo) | salvar sem prazo | RN-005 diz que o prazo é obrigatório; plano aprovado em 2026-11-03 com este padrão |
| D-008 | Enfileirar com `UPDATE` + `INSERT ... WHERE NOT EXISTS` | `ON DUPLICATE KEY UPDATE` | roda no simulador sem tradução nova e tem o mesmo efeito do `googleAgendaEnfileirarSync` atual |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| O processador da fila de hoje (375 → 212) ignora item de atividade que não existe mais | evento de atividade excluída fica no Google até a 003 trocar o processador | nota para a 003: item `TAREFA` sem atividade = remover o evento por `GOOGLE_AGENDA_EVENTOS` |
| `UTC_TIMESTAMP()` / `LAST_INSERT_ID()` entre instruções da mesma SF no Mitra | hora errada ou log sem atividade | T-001 no sandbox antes de publicar |
| `:VAR_USER` em `runQueryMitra` dentro de SF JAVASCRIPT (mesmo risco da 002) | busca de clientes vazia | T-001 da 002 cobre; se não substituir, a SF chama uma SF SQL por id |
| FK do log sem cascata | excluir falha se o log não sair antes | `DELETE` do log antes da atividade (teste C-008) |
| A 003 declarar `GOOGLE_AGENDA_FILA` também | DDL repetido no merge | mesmo texto; uma cópia sai no merge (nota compartilhada) |

## Complexity Tracking

Nenhuma violação.
