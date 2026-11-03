# Plan: Agenda e visitas

**Spec:** `./spec.md` · **Data:** 2026-11-03

> O COMO. Nenhum requisito novo nasce aqui. Se faltou algo, volta para a spec.

Terceira tela construída sobre o esqueleto da 001 (`novo/`). Reusa o filtro de
escopo e os fragmentos de carteira da 002 (`lib/002-carteira.mjs`,
`FiltroEscopo`). A spec tem duas partes de natureza diferente, e o plano as
separa em **duas etapas**:

- **Etapa 1 — Agenda** (RF-001 a RF-015, C-001 a C-013, C-017, RN-001 a RN-014):
  tudo o que grava e mostra compromissos. Roda inteira no simulador.
- **Etapa 2 — Google Agenda** (RF-016 a RF-021, C-014 a C-016, RN-015 a RN-019,
  RNF-002/003): conexão, envio, reenvio, troca de agenda. Depende de três
  confirmações no sandbox (T-001) que mudam o desenho; o contrato dela está no
  fim deste plano e vira código depois que T-001 responder.

## Checagem de princípios

| Princípio | Toca? | Como atende |
|---|---|---|
| Spec antes de código | sim | `spec.md` sem pendência aberta (decisões de 2026-10-30 e 2026-11-03) |
| Backend escrito local, executado no sandbox | sim | `novo/backend/add-003-agenda.mjs` só roda no sandbox, depois dele `add-000-perfil-acesso.mjs` |
| Migrations append-only | sim | nenhuma tabela nem coluna nova (D-305) |
| Leitura e escrita por Server Function | sim | 20 SFs SQL na etapa 1; escrita só por SF SQL (acesso business não usa `runDml`) |
| Simulador cobre a feature | sim | `schema-producao/003-agenda.mjs`, `simulator/seeds/003-agenda.mjs` (ids 3001+, usuários próprios), `simulator/smoke/003-agenda.mjs` |
| Testes automatizados obrigatórios | sim | cada linha da seção Testes da spec (etapa 1) vira um `teste()` no smoke ou um `test()` em `novo/frontend/tests/agenda.test.mjs` |
| Design tokens, sem cor literal | sim | cores de status por token; vocabulário de `components/page.tsx`; linha compacta |
| Simplicidade | sim | nenhuma dependência nova; uma SF por ação da RN-005 (a mesma serve visita, prospecção e interno) |

## Contexto técnico

- Mesmo stack da 001/002. Nenhuma dependência nova.
- **Reuso:** `lib/guardas.mjs` (`SEM_BLOQUEIO`, `temPapel`, `COORDENADOR_ATIVO`);
  `lib/002-carteira.mjs` (`escopoAlvo`, `carteiraVisivel`, `titularesCobertos`,
  `cod`, `num`, `semAcento`, `nomeUsuario`, `nomeCliente`, `ESCOPO_SQL`);
  front: `useEscopo`/`FiltroEscopo`, `paraInput`, `mitra-api.ts`
  (`linhas`/`linhasAfetadas`), `formato.ts`, `sessao.modoAgenda` (preferência da 001),
  `components/page.tsx` e `components/ui/dialog`.
- **Relógio do servidor (RN-003/006/007/009/010/011, RNT-012):** data e hora de
  Brasília saem do banco, nunca da tela: `AGORA_BR` =
  `DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 HOUR), …)` (Brasília sem
  horário de verão desde 2019). Vale para check-in/out, cabeçalhos de
  reagendamento e cancelamento, limite de retroativo, "a partir do dia agendado"
  e férias ativas na permissão. O `hoje` vindo da tela só escolhe o período
  exibido. O simulador ganha `UTC_TIMESTAMP()` em `mysql-dialect.mjs` (uma
  linha, mesmo relógio do `NOW()`); o smoke fixa o relógio por teste.
- **Tudo ou nada (RN-004, RN-013):** cada criação é **um** `INSERT … SELECT`
  com todas as condições no `WHERE` (conflito de qualquer pessoa, retroativo,
  carteira, campos). Se uma pessoa falha, a instrução grava 0 e nada fica pela
  metade. A mensagem vem depois, de `s360AgendaConflito` (padrão do
  `s360DisponivelMotivo` da 002).

## Modelo de dados

| Entidade (spec) | Tabela | Campos usados | Observação |
|---|---|---|---|
| Visita | `VISITAS` | todas | grava; declarada em `schema-producao/002-carteira.mjs` |
| Visita de prospecção | `PROSPECT_VISITAS` | `PROSPECT_ID`, `EXECUTIVO_ID` (dono), `DATA_VISITA`, `HORA_*`, `OBJETIVO` (`<tipo> — <objetivo>`, até 200), `STATUS`, `RESUMO` (relato), `CRIADO_EM`, `ATUALIZADO_EM` (hora do check-in e depois do check-out) (D-305) | grava; DDL em `schema-producao/003-agenda.mjs` |
| Prospect | `PROSPECTS` | `ID`, nome, `STATUS_PIPELINE`, `RESPONSAVEL_ID` | lê; ao agendar e concluir aplica a RN-022 da 008 (D-306) |
| Compromisso interno / deslocamento | `AGENDA_INTERNA` | todas; relato de conclusão e motivo de cancelamento acrescentados à `DESCRICAO` (D-305) | grava; DDL em `003-agenda.mjs` |
| Participante | `AGENDA_INTERNA_PARTICIPANTES` | `AGENDA_ID`, `VENDEDOR_ID`, `CRIADO_EM` | grava; DDL em `003-agenda.mjs` |
| Atividade de follow-up | `TAREFAS` | `VENDEDOR_ID`, `TITULO`, `DESCRICAO`, `PRIORIDADE`, `DATA_LIMITE`, `CLIENTE_ID`, `STATUS = 'PENDENTE'`, `CRIADO_EM` | grava (só a criação no check-out, RN-007); declarada na 001 |
| Escopo, férias, carteira | `BU_VENDEDOR`, `VENDEDOR_RCA`, `COORDENADORES`, `COORDENADORES_BU`, `FERIAS_VENDEDOR`, `EQUIPE_CLIENTE`, `CLIENTES` | — | lê, pelos fragmentos da 002 |
| Vendas (histórico) | `IMP_VENDAS_DASHBOARD_TOTVS_RCA` | `CODCLI`, `NUMPED`, `DTSAIDA`, `TOTAL` | lê (C-017) |
| Preferência | `USUARIO_PREFERENCIAS.MODO_AGENDA` | — | já vem na sessão (001) |

Valores gravados: status `AGENDADA`, `EM_ANDAMENTO`, `CONCLUIDA`, `CANCELADA`
(os do antigo; `AGENDA_INTERNA.STATUS` nulo = Agendada). Deslocamento =
`AGENDA_INTERNA.TIPO = 'Deslocamento'`, título gravado "origem → destino".
Datas `AAAA-MM-DD`, horas `HH:MM` (comparação de texto), carimbos
`AAAA-MM-DD HH:MM:SS` em Brasília.

**Compromisso de uma pessoa** (base do conflito, da meta e da listagem) =
fragmento `COMPROMISSOS` em `lib/003-agenda.mjs`, uma tabela derivada
`(ORIGEM, ID, PESSOA_ID, DATA, HORA_INICIO, HORA_FIM, TIPO, STATUS)`:
visita → dono; prospecção → executivo; interno → criador **e** cada
participante. Tabela derivada também evita o erro 1093 do MySQL (subconsulta
na própria tabela do `UPDATE`), ver Riscos.

## Fragmentos — `novo/backend/lib/003-agenda.mjs`

| Fragmento | Devolve | Regra |
|---|---|---|
| `AGORA_BR`, `HOJE_BR`, `CARIMBO_BR` (`dd/mm/aaaa hh:mm`), `LIMITE_RETRO` (hoje − 5) | expressões | relógio do servidor |
| `COMPROMISSOS` | tabela derivada acima, sem cancelados | RN-004 |
| `conflito(pessoa, data, ini, fim, origem, id)` | `EXISTS` de sobreposição (`ini < fim existente AND fim > ini existente`), ignorando o próprio item | RN-004 |
| `pessoasJson(param)` | tabela `(ID)` de um parâmetro `[{"id":2},…]` (`JSON_TABLE`, já traduzido no simulador) | RN-013, participantes |
| `PESSOAS_ESCOPO` | `PESSOA_ID` das linhas de `escopoAlvo` do escopo pedido, com férias por `HOJE_BR`, mais o próprio usuário em Meu painel e Time inteiro | RNT-003, RN-012 |
| `podeOperar(dono)` | dono = `:VAR_USER` ou titular coberto por férias ATIVAS hoje | RN-012, RNT-010 |
| `CLIENTES_DE_QUEM_CRIA` | ids da carteira do usuário, do titular coberto e (coordenador ativo) da equipe | RF-004, RN-013 |
| `PROSPECTS_DE_QUEM_CRIA` | prospects ativos (não `CONVERTIDO`/`PERDIDO`) do usuário, do titular coberto, da equipe, ou todos para DIRETORIA/ADMIN | RF-005 |
| `textoOk(param)` | `CHAR_LENGTH <= 20000` | RN-008 |
| `acrescentar(coluna, cabecalho, texto)` | texto anterior + linha em branco + cabeçalho + texto (quebra de linha literal no SQL, que vale no MySQL e no SQLite) | RN-007/009/010 |

## Contratos de backend (etapa 1)

Arquivo `novo/backend/add-003-agenda.mjs` (exporta `definitions`). Toda SF
resolve quem chama por `:VAR_USER` e leva `SEM_BLOQUEIO`. `origem` ∈ `VISITA`,
`PROSPECCAO`, `INTERNA`. Escrita devolve `affectedRows`; 0 = recusado (RNT-013).
"Escopo" = os sete parâmetros da 002 (`modo`, `coordenador`, `vendedor`,
`filial`, `depto`, `secao`, `hoje`), com as férias avaliadas por `HOJE_BR`.

### Leitura

| Nome | Entrada | Saída | Atende |
|---|---|---|---|
| `s360AgendaListar` | escopo + `de`, `ate` | um item por linha: `ORIGEM`, `ID`, `TIPO`, `STATUS`, `DATA`, `HORA_INICIO`, `HORA_FIM`, `TITULO` (cliente, prospect, título ou "origem → destino"), `CLIENTE_ID`, `PROSPECT_ID`, `DONO_ID`, `DONO`, `PLANEJAMENTO` (planejamento / objetivo / descrição), `RELATO`, `CHECKIN_HORA`, `CHECKOUT_HORA`, `ORIGEM_DESLOC`, `DESTINO_DESLOC`, `PARTICIPANTES` (`id:nome\|…`), `PODE_OPERAR`, `EH_DONO` | RF-001/002/012/013, RN-012, RN-014 |
| `s360AgendaResumo` | escopo + `segunda`, `sexta`, `domingo` | 1 linha: `REALIZADO`, `META`, `PESSOAS`, `VENDEDORES`, `COORDENADORES`, `AGENDADAS`, `EM_ANDAMENTO`, `CONCLUIDAS`, `CANCELADAS` | RF-014, RN-011 |
| `s360AgendaClientes` | `busca` (≥ 2 letras) | até 50: `ID`, `NOME`, `RAZAO_SOCIAL`, `CNPJ`, `CIDADE` | RF-004, RNT-014 |
| `s360AgendaProspects` | `busca` (vazio = todos) | até 50 prospects ativos: `ID`, `NOME`, `CIDADE` | RF-005 |
| `s360AgendaPessoas` | — | usuários com escopo ativo: `ID`, `NOME`, `EH_VOCE` | RN-013, RF-010 |
| `s360AgendaConflito` | `pessoas` (JSON), `data`, `inicio`, `fim`, `origem`, `id` (item ignorado) | 1ª sobreposição: `PESSOA_ID`, `NOME`, `EH_VOCE`, `ORIGEM_EXISTENTE`, `TIPO_EXISTENTE`, `HORA_INICIO`, `HORA_FIM` | mensagens da RN-004 |
| `s360AgendaHistoricoResumo` | `clienteId` | `VISITAS`, `TAREFAS`, `VENDAS` (pedidos distintos), `CLIENTE` | RF-015, C-017 |
| `s360AgendaHistoricoEventos` | `clienteId` | 10 mais recentes: `TIPO` (`VISITA`/`TAREFA`/`PEDIDO`), `DATA`, `TITULO`, `TEXTO`, `VALOR` | RF-015, C-017 |

- Listagem: visita e prospecção cujo dono está em `PESSOAS_ESCOPO`; interno
  cujo criador **ou** algum participante está (RN-014). Cancelados vêm (cor
  vermelha). `PODE_OPERAR`: visita/prospecção por `podeOperar(dono)`; interno
  só se `CRIADOR_ID = :VAR_USER`.
- Resumo: pessoas da **meta** (sem o titular coberto por férias: em Meu painel a
  meta é da pessoa, spec 005 RN-005). `REALIZADO` = itens `CONCLUIDA` com data
  entre `segunda` e `sexta`, um por pessoa: visita (dono), prospecção (executivo) e
  deslocamento (criador + cada participante); reunião interna e "Outros" nunca
  (RN-011; spec 005 RN-004). `META` = soma por pessoa: 8 se coordenador ativo,
  senão 16 (D-307). Contadores de status: itens distintos de segunda a domingo.
- Histórico só de cliente em `CLIENTES_DE_QUEM_CRIA` (mesma permissão da busca).

### Criação

| Nome | Entrada | Grava | Atende |
|---|---|---|---|
| `s360VisitaCriar` | `clienteId`, `vendedores` (JSON; vazio = só eu), `data`, `inicio`, `fim`, `tipo`, `planejamento` | 1 linha em `VISITAS` por vendedor, `AGENDADA` | RF-003/004/006/011, RN-001…004, RN-008, RN-013 |
| `s360ProspeccaoCriar` | `prospectId`, `vendedores`, `data`, `inicio`, `fim`, `tipo`, `objetivo` | 1 linha em `PROSPECT_VISITAS` por vendedor; prospect `NOVO` → `VISITA_AGENDADA` | RF-003/005/006/011, RN-022 da 008 |
| `s360InternoCriar` | `tipo` (`Reunião interna`, `Outros`, `Deslocamento`), `titulo`, `descricao`, `origem`, `destino`, `data`, `inicio`, `fim`, `participantes` (JSON) | 1 linha em `AGENDA_INTERNA` + participantes | RF-003/006/010, RN-002/004 |

Condições no `WHERE` de cada criação: tipo da lista da RN-001; `data`
`AAAA-MM-DD` ≥ `LIMITE_RETRO`; `inicio` < `fim`, ambos `HH:MM`; textos e
limites da RN-002/008; cliente em `CLIENTES_DE_QUEM_CRIA` (ou prospect em
`PROSPECTS_DE_QUEM_CRIA`); cada vendedor é o próprio usuário ou tem escopo
ativo; e `NOT EXISTS` de conflito de **qualquer** pessoa da operação. O interno
grava a linha e depois os participantes numa segunda instrução, que só acha a
linha nova pelo criador + `CRIADO_EM = AGORA_BR` + título (padrão
`s360ProspectContatoCriar` da 002).

### Ações (uma SF por ação da RN-005, para os três tipos)

| Nome | Entrada | Efeito | Atende |
|---|---|---|---|
| `s360AgendaReagendar` | `origem`, `id`, `data`, `inicio`, `fim`, `tipo`, `planejamento`, `motivo`; interno também `titulo`, `descricao`, `origemDesloc`, `destinoDesloc` | só `AGENDADA` e quem opera; mudou a data de visita/prospecção → `motivo` obrigatório, acrescentado com `Reagendamento em dd/mm/aaaa hh:mm:`, e retroativo; conflito contra o **dono** e participantes | RF-008, RN-003/004/009, C-007 |
| `s360AgendaCheckin` | `origem`, `id` | `AGENDADA` → `EM_ANDAMENTO`, `CHECKIN_HORA = AGORA_BR` (data futura aceita) | RF-007, RN-006 |
| `s360AgendaCheckout` | `origem`, `id`, `relato` | `EM_ANDAMENTO` → `CONCLUIDA`, `CHECKOUT_HORA`, relato **acrescentado**; prospecção: prospect `NOVO`/`VISITA_AGENDADA` → `VISITADO` | RF-007, RN-007/008, C-005 |
| `s360AgendaCancelar` | `origem`, `id`, `motivo` | só `AGENDADA`; visita/prospecção: motivo obrigatório com `Cancelamento em dd/mm/aaaa hh:mm:`; interno: motivo opcional, só o criador | RF-008, RN-010, C-008 |
| `s360AgendaRelatoEditar` | `origem`, `id`, `relato` | só `CONCLUIDA`, troca o texto inteiro, limite RN-008 | RF-008, RN-005 |
| `s360InternoConcluir` | `id`, `relato` | criador, `AGENDADA` → `CONCLUIDA`; deslocamento: relato obrigatório e `DATA_AGENDADA <= HOJE_BR`; observação/relato acrescentado à `DESCRICAO` | RF-009, RN-011, C-009 |
| `s360InternoParticipanteIncluir` | `id`, `pessoaId` | criador, `AGENDADA`, sem conflito da pessoa, ainda não participante | RF-010, RN-004 |
| `s360InternoParticipanteRetirar` | `id`, `pessoaId` | criador, `AGENDADA` | RF-010, RN-014 |
| `s360AgendaAtividadeCriar` | `visitaId`, `titulo`, `descricao`, `prioridade` (`ALTA`/`MEDIA`/`BAIXA`), `dataLimite` | 1 `TAREFAS` `PENDENTE` do usuário, com o cliente da visita, se a visita está `CONCLUIDA` e ele a opera; título 1–300, descrição ≤ 500 | RN-007, C-006 |

Multi-instrução (`;`) só onde o efeito é de duas tabelas (`s360InternoCriar`,
`s360ProspeccaoCriar`, `s360AgendaCheckout` com prospecção): a segunda
instrução depende do que a primeira acabou de gravar e não grava nada sozinha.
As ações por `origem` são três `UPDATE` guardados por `'{{origem}}' = …`: só um
casa. É o formato que a 009 já usa (D-904).

## Superfície de interação

| Tela / rota | Responsabilidade | Novos |
|---|---|---|
| `/agenda` | filtro de escopo, cabeçalho (‹ › `Hoje`, Dia/Semana/Mês, `+ Nova agenda`), grade do período, painel lateral (`Status da Meta Semanal`, `Resumo da semana`, `Legenda`) | `pages/AgendaPage.tsx` (`.rota = '/agenda'`) |
| Grade | Dia: lista do dia; Semana: 7 colunas seg–dom (no celular, um dia por vez com abas dos dias); Mês: calendário com até 3 itens por dia e "+N" | `pages/agenda/Grade.tsx` |
| Item | linha compacta: hora, tipo, título (cliente sublinhado abre o histórico), dono quando não é você, status por cor; ação principal com um toque, detalhe com as ações da RN-005 e `Somente visualização` | em `pages/agenda/Grade.tsx`; peças de layout em `pages/agenda/layout.tsx` |
| Janelas | Nova agenda (4 tipos: busca de cliente/prospect, vendedores, participantes), Reagendar, Relato e atividades (check-out), Cancelar, Concluir, Ver planejamento/relato, Histórico do cliente | `pages/agenda/dialogos.tsx` |

Regra pura em `novo/frontend/src/lib/agenda.ts` (o que os testes importam):
`TIPOS` e `formularioInicial(origem, hoje)` (RN-001), `validar(form, hoje)`
(RN-002/003, mesmas mensagens do servidor), `mensagemConflito(linha)`
(RN-004), `acoes(item)` (RN-005), `periodo(modo, data)` / `navegar(modo, data, passo)`
/ `semanaDe(data)` (RF-001), `mesEmSemanas(data)`, `COR_STATUS` e `LEGENDA` (RF-002),
`textoSimples(html)` (relato legado em HTML vira texto com quebras),
`salvarAtividades(lista, criar)` (C-006: sequencial, conta falhas, ignora sem título),
`mensagemMeta(resumo)`.

## Fluxo

1. **Abertura:** `s360EscopoOpcoes` (da 002, uma vez), `s360AgendaListar` do
   período da visão inicial (`sessao.modoAgenda`) e `s360AgendaResumo` da semana
   exibida: 3 chamadas.
2. **Navegar / trocar visão / escopo:** `Listar` + `Resumo` de novo.
3. **Nova agenda:** busca de cliente com 400 ms de pausa e ≥ 2 letras
   (`s360AgendaClientes`); prospects e pessoas carregados ao abrir a janela.
   Validação na tela (mensagens da RN-002/003) → SF de criação. Gravou N → fecha
   e recarrega. Gravou 0 → `s360AgendaConflito` com as mesmas pessoas → mensagem
   da RN-004; sem conflito → mensagem da RN-013 (cliente fora da carteira) ou do
   retroativo.
4. **Check-in:** um toque, sem confirmação → `s360AgendaCheckin` → abre `Relato e
   atividades` (prospecção: `Relato da prospecção`); `Voltar` só fecha.
5. **Check-out:** `Concluir visita` desabilitado com relato vazio →
   `s360AgendaCheckout`; depois, cada atividade com título por
   `s360AgendaAtividadeCriar`, uma a uma; falhas → mensagem do C-006 e
   `Salvar atividades pendentes` (reenvia só as que falharam).
6. **Reagendar / cancelar / concluir / participantes:** validação na tela →
   SF → 0 linhas: conflito (como no item 3) ou "nada foi alterado" (RNT-013).

## Simulador

- `schema-producao/003-agenda.mjs`: DDL de `AGENDA_INTERNA`,
  `AGENDA_INTERNA_PARTICIPANTES`, `PROSPECT_VISITAS` (texto do contrato).
- `simulator/seeds/003-agenda.mjs`: usuários próprios (`ctx.usuario`) para não
  mexer nos números das outras specs — Ana Agenda, Bruno Agenda (substituto de
  férias 01–15/11), Carla Agenda e o coordenador Carlos Agenda (`COORDENADORES`
  3001 com a BU Filial 6 · Estética e Injetáveis, onde só eles têm escopo); RCAs
  3101+; clientes 3001+ (Mercado Sol = 3001); 2 prospects ativos, 1 convertido e
  1 perdido; uma semana de compromissos em torno de hoje para a tela.
- `simulator/smoke/003-agenda.mjs`: o relógio do banco é fixado por teste
  (`registerMysqlFunctions(db, { now })`) — 04/11 09:05, 10/11 etc. Dados que só
  um teste usa (40 clientes, 15 visitas, 230 eventos…) entram no próprio teste.
- `mysql-dialect.mjs` (kit): `UTC_TIMESTAMP()` = `NOW()` do simulador. Citado no
  relatório.

## Testes

Backend em `novo/backend/simulator/smoke/003-agenda.mjs`; tela em
`novo/frontend/tests/agenda.test.mjs`. O título de cada teste começa pelo id.
Etapa 1 (as linhas C-014, C-015, C-016, RN-015…RN-019 e RNF-003 são da etapa 2):

| Cenário / regra | Arquivo | O que o `assert` verifica |
|---|---|---|
| C-001 | smoke | Ana cria visita a Mercado Sol em 05/11 09:00–10:00 → 1 `AGENDADA` de Ana; `Listar` 02–08/11 traz 1 item; `Resumo` planejado da semana conta 1 agendada |
| C-002 | tela | `formularioInicial('VISITA')` com cliente vazio; `validar` sem cliente → `Selecione o cliente da visita.` |
| C-003 | smoke | relógio 10/11: 04/11 → 0 gravados; 05/11 → 1 |
| C-004 | smoke | 09:30–10:30 → 0 e conflito "visita … das 09:00 às 10:00"; 10:00–11:00 → 1 (cancelada ignorada, encostar não conflita); reunião 11:30–12:30 → 0 e conflito de compromisso interno; tela: `mensagemConflito` monta os dois textos com "você" |
| C-005 | smoke | relógio 05/11 09:05: check-in → `CHECKIN_HORA` "2026-11-05 09:05:00", `EM_ANDAMENTO`; checkout com relato vazio → 0; com relato → `CONCLUIDA`, `CHECKOUT_HORA`, realizado da semana = 1 |
| C-006 | tela | `salvarAtividades` com 2 e a 2ª falhando → 1 criada, mensagem com "1 atividade(s)", pendente = a 2ª |
| C-007 | smoke | 05/11 → 06/11 sem motivo → 0; relógio 04/11 14:30 com motivo → relato termina em "Reagendamento em 04/11/2026 14:30:\nCliente pediu outro dia"; checkout depois mantém o trecho e acrescenta "Pedido fechado" |
| C-008 | smoke | cancelar Agendada sem motivo → 0; com motivo → `CANCELADA`; Em andamento e Concluída → 0; tela: `acoes` dá `Encerrar visita` e `Editar Relato` |
| C-009 | smoke | deslocamento de 09/11 com Bruno: relógio 06/11 concluir → 0; 09/11 sem relato → 0; com relato → `CONCLUIDA`; `Resumo` 09–13/11 realizado = 1 para Ana e 1 para Bruno |
| C-010 | smoke | Bruno participante: `Listar` traz com `PODE_OPERAR = 0`; Bruno reagendando → 0; retirar Carla → `Listar` de Carla sem o item; reunião concluída não soma |
| C-011 | smoke | visita para Ana + Bruno com Bruno ocupado → 0 visitas, conflito cita Bruno; 10:00–11:00 → 2 visitas, uma de cada |
| C-012 | smoke | relógio 05/11: Bruno lista visita de Ana com `DONO` Ana e `PODE_OPERAR = 1`, check-in → 1; relógio 16/11: lista 0 de Ana, check-in → 0 |
| C-013 | smoke | Carlos `TEAM`: itens de Ana com `PODE_OPERAR = 0`; check-in, reagendar e cancelar dele → 0; Carlos cria a própria visita → 1; Ana `ME` não recebe itens de Bruno |
| C-017 | smoke | cliente com 15 visitas, 4 atividades, 9 pedidos → 15/4/9 e 10 eventos |
| RN-001 | tela | visita nasce `Aumento de mix`, hoje, 08:00–09:00; prospecção `Prospecção`; interno `Reunião interna` |
| RN-002 | tela | 09:00–09:00 → mensagem do fim; título com 201 caracteres recusado; deslocamento sem origem → mensagem |
| RN-003 | smoke | visita de 01/11 com planejamento editado em 10/11 sem mudar a data → 1 |
| RN-004 | smoke | Bruno (substituto) reagenda visita de Ana: conflito contra a agenda de Ana, não a dele; Bruno em reunião 14:00–15:00 → visita dele 14:30–15:30 → 0; reunião 09:00–10:00 convidando Bruno ocupado 09:30–10:30 → 0 e conflito cita Bruno; incluir Bruno em deslocamento que sobrepõe → 0 |
| RN-005 | smoke | concluir item Cancelado → 0; editar relato de Agendado → 0 |
| RN-006 | smoke | check-in em Em andamento → 0; relógio 04/11 check-in em visita de 05/11 → 1; hora gravada = relógio do banco (nenhum parâmetro de hora é lido) |
| RN-007 | smoke | checkout de Agendada sem check-in → 0 |
| RN-008 | smoke | relato de 20.001 → 0; 20.000 → 1 e íntegro; quebra de linha preservada |
| RN-009 | smoke | só a hora 09:00 → 10:00 sem motivo → 1, relato sem cabeçalho |
| RN-010 | smoke | interno cancelado sem motivo → 1; participante cancelando → 0 |
| RN-011 | smoke | reunião concluída sem observação → 1, realizado igual; deslocamento com relato de 20.001 → 0; deslocamento de sábado concluído não conta |
| RN-012 | smoke | férias com `ATIVO = 0` no período: substituto lista 0 itens do titular |
| RN-013 | smoke | cliente fora da carteira de quem cria → 0; cliente de Ana e fora da de Bruno, criado por Ana para Bruno → 1 visita de Bruno |
| RN-014 | smoke | participante retirado deixa de listar o item (o vínculo de evento no Google é da etapa 2) |
| RF-001 | tela | `periodo('SEMANA', qua 04/11)` = 02–08/11; `navegar('MES', 31/10, +1)` = 30/11; `Hoje` = data de Brasília; visão inicial = `modoAgenda` |
| RF-014 | smoke | Carlos `TEAM` (3 vendedores + ele): `META` 16×3 + 8 = 56, `COORDENADORES` = 1; Ana `ME` = 16 |

## Decisões

| # | Decisão | Alternativa descartada | Por quê |
|---|---|---|---|
| D-301 | Etapa 2 (Google) depois de T-001 | tudo junto | o desenho do envio depende de três respostas do sandbox (Riscos); a agenda não depende do Google |
| D-302 | Relógio de Brasília no banco (`UTC_TIMESTAMP − 3 h`) em toda regra de data | `agora` vindo da tela, como na 001 | RN-006 exige hora do servidor; C-003 exige a recusa mesmo com a tela contornada |
| D-303 | Uma SF por ação, valendo para os três tipos (`origem`) | uma SF por ação por tipo (15) | menos SFs e uma regra só por ação (RN-005) |
| D-304 | Relato e planejamento como texto com quebras de linha (caixa de texto); relato antigo em HTML é exibido como texto | editor rico | nenhuma dependência nova; RN-016 já manda texto simples ao Google; limite de 20.000 vale sobre o texto |
| D-305 | Sem mexer no banco (decisão do usuário, 2026-11-03): tipo da prospecção no início do `OBJETIVO` (`<tipo> — <objetivo>`, total até 200, acima disso recusado, nada é cortado); check-in/out da prospecção em `ATUALIZADO_EM`; relato de conclusão e motivo de cancelamento de interno acrescentados à `DESCRICAO` com cabeçalho `Conclusão em` / `Cancelamento em dd/mm/aaaa hh:mm:` | acrescentar colunas | o usuário preferiu não alterar o banco; o objetivo da prospecção fica limitado a 200 caracteres e a hora do check-in da prospecção não fica guardada depois do check-out |
| D-306 | Etapa do prospect (RN-022 da 008) atualizada na mesma SF que agenda e conclui a visita | SF da 008 chamada pela tela | a 008 diz que agendar e concluir é da 003; uma chamada a menos |
| D-307 | Meta semanal 16 (vendedor) e 8 (coordenador ativo) fixa em `lib/003-agenda.mjs`, com comentário `ponytail:` | ler a configuração da 005 | a meta configurável é da 005, ainda não construída; quando existir, troca-se uma expressão |
| D-308 | A atividade do check-out é criada por SF da 003 (`s360AgendaAtividadeCriar`) | esperar a SF de criação da 004 | a 004 está em construção em paralelo; a regra da atividade é só a da RN-007 |
| D-309 | Usuários próprios no seed (Ana Agenda…) em Filial 6 · Estética | reusar Ana/Bruno da 001 | visitas e carteira novas mudariam os números dos smokes da 002 e da 010 |

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| MySQL recusa subconsulta na própria tabela do `UPDATE` (erro 1093) | reagendar falha no sandbox | conflito sempre pela tabela derivada `COMPROMISSOS`, que o MySQL materializa; T-002 confirma; se falhar, `/*+ NO_MERGE */` na derivada |
| `UTC_TIMESTAMP()` ou `JSON_TABLE` com parâmetro indisponível no Mitra | criação ou horários errados | T-002 executa as SFs de criação com usuário business antes de liberar |
| SF SQL com várias instruções (`;`) | participantes ou etapa do prospect não gravam | mesmo formato da 009 (T-902 dela); T-002 confere |
| Antigo e novo gravando a mesma visita | status divergente | mesmos valores de status e colunas; colunas novas são opcionais para o antigo |
| Outra spec declarar `PROSPECT_VISITAS` / `AGENDA_INTERNA` (005, 008) | DDL repetido no merge | nota na pasta compartilhada das sessões: a 003 é dona das três |

## Etapa 2 — Google Agenda (contrato, para depois de T-001)

O antigo provou no sandbox (`backend/fix-google-agenda-escrita-por-sf-sql.mjs`)
que SF JAVASCRIPT de usuário business lê e chama integração, mas não grava; por
isso o antigo devolvia a autorização contínua ao navegador, o que a RNF-003
proíbe. Desenho previsto:

- **Conexão (RN-015):** `s360GoogleIniciar` (SQL) grava um pedido de 10 min
  ligado a `:VAR_USER` e à aba; `s360GoogleConcluir` (JAVASCRIPT) troca o código
  pela autorização no servidor e grava por uma SF SQL chamada por id
  (`executeServerFunctionMitra`) — a autorização nunca volta à tela.
- **Envio (RN-016/018):** cada gravação da etapa 1 enfileira o item numa SF
  SQL (fila única por item, `GOOGLE_AGENDA_FILA`); uma SF JAVASCRIPT agendada a
  cada 5 min (e chamada logo após a gravação, sem esperar) monta o evento com
  as regras puras de `lib/003-google.mjs` (título com status, texto simples,
  rodapé, fuso) e grava vínculo e erro por SF SQL.
- **Agenda de destino, status, desconectar (RN-017/019, RF-020/021):** seção
  Google de `/configuracoes`.

T-001 precisa responder: (1) SF JAVASCRIPT chamada por usuário business
consegue chamar uma SF SQL por id e essa SF grava com o `:VAR_USER` de quem
chamou; (2) onde guardar o segredo de forma protegida (variável de ambiente da
SF, cofre da integração ou chave fora do banco) — hoje está em texto aberto em
`GOOGLE_AGENDA_CONFIG`; (3) se `callIntegrationMitra` aceita cabeçalho de
autorização por chamada (o antigo manda o código de acesso no endereço, o que a
RNF-003 proíbe).

## Complexity Tracking

| Violação | Por quê | Alternativa mais simples rejeitada |
|---|---|---|
| SF SQL com mais de uma instrução | compromisso interno + participantes, visita + etapa do prospect | duas chamadas da tela: deixaria interno sem participantes se a segunda falhasse |
