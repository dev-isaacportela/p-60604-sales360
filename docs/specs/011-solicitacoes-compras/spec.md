# Spec: Solicitações de compras

> **Spec cancelada em 2026-10-30.** A tela Solicitações de compras (criação, lista, envio e retorno do sistema de Compras) não existirá no sistema novo. O conteúdo abaixo fica só como registro do sistema atual, para aposentar a tela e as funções do servidor; nada desta spec será construído.

**ID:** 011-solicitacoes-compras · **Status:** cancelada em 2026-10-30 · **Data:** 2026-10-30

> Spec de **reconstrução**: descreve as Solicitações de compras como estão em
> produção, já com os defeitos conhecidos corrigidos. Regras transversais são
> citadas pelo id da spec 000 (`RNT-00N`, `RNFT-00N`). Proibido citar stack,
> tabela ou componente fora do anexo **Rastreabilidade de origem**.

## Problema

Quando um cliente pede um produto que a Benenutri não tem ou tem pouco, a
executiva precisa avisar o time de Compras com cliente, filial, quantidade e
prazo, e acompanhar a resposta. Hoje o canal existe mas está preso a um piloto
liberado para uma única conta, envia cada produto numa sequência de passos que
pode parar no meio e deixar solicitações sem envio, atualiza o status de todo
mundo a cada vez que alguém abre a lista (e só das 200 mais recentes), e os
indicadores do topo contam só a página aberta. Sem um canal confiável, o pedido
volta para WhatsApp e e-mail e ninguém sabe o que Compras respondeu.

## Resultado esperado

A executiva registra o pedido em um minuto, ele chega ao sistema de Compras
sem passo manual, e ela vê na mesma lista se foi aprovado, recusado (com o
motivo) ou atendido; a gestão vê o conjunto das solicitações da sua área.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| Vendedor (executiva) | Criar solicitações para clientes, acompanhar status e motivo de recusa das próprias | semanal |
| Coordenador | Acompanhar as solicitações da equipe | semanal |
| Diretoria / Gestão | Acompanhar todas as solicitações, filtrar por executivo | sob demanda |
| Time de Compras | Recebe as solicitações no sistema de Compras e responde por lá (fora desta tela) | diária |
| Rotina automática | Reenviar o que falhou e trazer o status de Compras | a cada 15 min |

## Cenários

**C-001 — Criar solicitação de um produto**
- **Dado que** Ana está na tela "Pedidos de produtos" e hoje é 30/10/2026
- **Quando** ela clica `Nova solicitação`, escolhe o cliente "Mercado Bom — Cód. 1520", a filial "2 - Goiânia", tipo `Produto`, prioridade `Alta`, prazo 10/11/2026, inclui o produto 714 com quantidade 50 e clica `Criar solicitação`
- **Então** aparece "Solicitação criada e enviada para compras."; a lista mostra a nova solicitação no topo com status `Em análise`, prioridade Alta, prazo 10/11/2026 e responsável Ana; Compras recebe o produto 714, 50 un., cliente 1520, filial 2, prioridade ALTA

**C-002 — Vários produtos viram várias solicitações**
- **Dado que** Ana preencheu a referência comercial "PED-88" e incluiu os produtos 714, 715 e 716
- **Quando** clica `Criar solicitação`
- **Então** aparece "3 solicitações criadas e enviadas para compras." e a lista ganha 3 solicitações com as referências "PED-88-1", "PED-88-2" e "PED-88-3"

**C-003 — Quantidade zerada é recusada (erro)**
- **Dado que** Ana incluiu os produtos 714 (quantidade 50) e 715 (quantidade 0)
- **Quando** clica `Criar solicitação`
- **Então** vê "Informe uma quantidade maior que zero para todos os produtos." e nenhuma solicitação é criada

**C-004 — Prazo no passado (borda)**
- **Dado que** hoje é 30/10/2026
- **Quando** Ana escolhe o prazo 29/10/2026 e clica `Criar solicitação`
- **Então** vê "O prazo desejado não pode ser anterior a hoje." e nada é criado; o prazo 30/10/2026 é aceito

**C-005 — Compras fora do ar no momento do envio (erro)**
- **Dado que** o sistema de Compras não responde às 10:02
- **Quando** Ana cria uma solicitação com 2 produtos
- **Então** as 2 solicitações são criadas com status `Aberta` e o detalhe mostra "Falha no envio para Compras"; a mensagem é "2 solicitações criadas, mas não foi possível enviar para compras agora. O envio será tentado de novo automaticamente."; na rotina das 10:15, com Compras de volta, elas passam a `Em análise` sem duplicar nada em Compras

**C-006 — Status volta de Compras**
- **Dado que** três solicitações de Ana estão `Em análise`
- **Quando** Compras aprova a primeira, recusa a segunda com o motivo "Fornecedor sem estoque" e marca a terceira como atendida, e a rotina seguinte roda
- **Então** a lista mostra `Aprovada`, `Recusada` com "Fornecedor sem estoque" na coluna de motivo, e `Concluída`

**C-007 — Executiva vê só as próprias**
- **Dado que** Ana tem 12 solicitações e Bruno tem 7
- **Quando** Ana abre a tela
- **Então** vê `Total filtrado` 12 e nenhuma de Bruno, e não vê o filtro Executivo

**C-008 — Visão de gestão por papel**
- **Dado que** Ana (12) é da equipe do coordenador Carlos e Bruno (7) não é
- **Quando** Carlos abre a tela e depois a diretora Diana abre a tela
- **Então** Carlos vê o selo "Visão de gestão", `Total filtrado` 12 e o filtro Executivo só com Ana; Diana vê 19 e o filtro Executivo com Ana e Bruno

**C-009 — Indicadores contam o filtro inteiro**
- **Dado que** o filtro atual devolve 45 solicitações (3 páginas): 18 entre `Aberta` e `Em análise`, 7 de prioridade Alta e 4 com prazo vencido
- **Quando** Ana está na página 1
- **Então** os cartões mostram `Total filtrado` 45, `Abertas` 18, `Alta prioridade` 7 e `Prazos vencidos` 4, e não mudam ao ir para a página 2

**C-010 — Prazo vencido**
- **Dado que** hoje é 30/10/2026 e há 3 solicitações com prazo 29/10/2026: uma `Em análise`, uma `Concluída` e uma `Recusada`
- **Quando** a tela calcula `Prazos vencidos`
- **Então** conta 1

**C-011 — Apoio para decidir a quantidade**
- **Dado que** o produto 714 saiu 120, 0, 80, 95, 110 e 130 unidades nos últimos 6 meses e teve 9 clientes compradores
- **Quando** Ana inclui o 714 na nova solicitação
- **Então** aparecem "Saída geral do produto" com 5 barras mensais (o mês sem saída não aparece) e "Clientes compradores" com os 5 maiores compradores dos últimos 6 meses

**C-012 — Busca por referência ou número**
- **Dado que** existem as solicitações 120, 121 e 122 com referências "PED-88-1" a "PED-88-3"
- **Quando** Ana busca "PED-88" e depois "121"
- **Então** a primeira busca traz as 3; a segunda traz só a 121

**C-013 — Detalhe com o retorno de Compras**
- **Dado que** a solicitação 121 foi recusada em 29/10/2026 14:20 com o motivo "Fornecedor sem estoque"
- **Quando** Ana clica na linha
- **Então** o detalhe mostra cliente, filial, tipo, prioridade, prazo, criação, descrição ("Sem descrição informada." quando vazia) e o item com quantidade, status de Compras, data da avaliação 29/10/2026 14:20 e "Motivo: Fornecedor sem estoque"

**C-014 — Pedido para ver solicitação de outra pessoa é recusado (erro)**
- **Dado que** a solicitação 130 é de Bruno
- **Quando** chega ao sistema um pedido de Ana para listar os itens da 130 ou filtrar pelo executivo Bruno
- **Então** a resposta vem vazia; nada de Bruno é devolvido

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE liberar a tela e o item de menu `Solicitações` por papel (RN-001, RNT-002) | Nenhuma liberação por e-mail; C-007, C-008 | must |
| RF-002 | O sistema DEVE listar as solicitações visíveis (RN-002) com 20 por página e total, mais recentes primeiro, com #, status, prioridade, cliente, tipo, descrição, motivo de recusa, criação, prazo e responsável | C-007; vazio: "Nenhuma solicitação encontrada." | must |
| RF-003 | O sistema DEVE filtrar por busca (cliente, tipo, descrição, referência comercial ou número), status, prioridade e, na visão de gestão, executivo; mudar filtro volta à página 1 | C-012; filtro Executivo lista só executivos com solicitações visíveis | must |
| RF-004 | O sistema DEVE mostrar os indicadores `Total filtrado`, `Abertas`, `Alta prioridade` e `Prazos vencidos` calculados sobre o filtro inteiro (RN-008) | C-009, C-010 | must |
| RF-005 | O sistema DEVE criar solicitações a partir do formulário `Nova solicitação` com cliente, filial, tipo, prioridade, prazo, referência comercial, descrição e produtos (RN-003, RN-004) | C-001, C-002, C-003, C-004 | must |
| RF-006 | O sistema DEVE buscar clientes ativos do ERP (RNT-014) e exigir que o cliente seja escolhido na lista | Digitar "mercado" sem escolher → "Informe o cliente." | must |
| RF-007 | O sistema DEVE buscar produtos do catálogo por nome ou código depois de escolhida a filial, trazendo o fornecedor do cadastro do produto | Sem filial o campo diz "Selecione a filial antes do produto"; produto repetido não entra duas vezes | must |
| RF-008 | O sistema DEVE permitir quantidade e observação por produto, e remover produto da lista | Observação "embalagem 5 kg" chega a Compras como justificativa do item (RN-006) | should |
| RF-009 | O sistema DEVE mostrar, ao incluir um produto, a saída geral mensal e os maiores compradores (RN-009) | C-011; sem dados: gráficos vazios sem erro | should |
| RF-010 | O sistema DEVE enviar cada solicitação criada ao sistema de Compras e reenviar automaticamente o que falhou, sem duplicar (RN-005, RN-006) | C-001, C-005 | must |
| RF-011 | O sistema DEVE trazer o status de Compras por rotina e ao abrir o detalhe, e recalcular o status da solicitação (RN-007) | C-006; a tela mostra "Status de Compras atualizado às HH:MM" (RNT-015) | must |
| RF-012 | O sistema DEVE abrir o detalhe da solicitação com os itens e o retorno de Compras | C-013; erro de envio aparece como "Falha no envio para Compras" | must |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Abrir ou filtrar a lista nunca dispara a atualização de status de todas as solicitações; a atualização é da rotina (todas as não finalizadas) e do detalhe aberto (só aquela) | Contagem de chamadas a Compras: abrir a lista 10 vezes = 0 chamadas |
| RNF-002 | Falha no sistema de Compras não impede criar a solicitação nem abrir a lista | Com Compras fora do ar, C-005 passa e a lista abre |
| RNF-003 | Os gráficos de apoio carregam depois do formulário e falha neles não bloqueia a criação | Apoio indisponível → formulário segue utilizável |

Transversais aplicáveis: RNFT-001, RNFT-002, RNFT-003, RNFT-004, RNFT-005, RNFT-007.

## Entidades do domínio

- **Solicitação de compra** — pedido de um produto ao time de Compras: cliente (nome e código do ERP), filial, tipo, prioridade, status, prazo desejado, executivo responsável, referência comercial, descrição, criação e última atualização.
- **Item da solicitação** — produto, fornecedor, quantidade, observação e o retorno de Compras: identificação em Compras, status, data da avaliação, observação da avaliação (motivo), data da última leitura e erro de envio.
- **Executivo responsável** — o usuário que criou a solicitação.
- **Solicitação em Compras** — o registro correspondente no sistema de Compras, que decide aprovar, recusar ou atender.

## Regras de negócio

- **RN-001 — Acesso.** Qualquer usuário logado acessa a tela como executivo. A **visão de gestão** vale para COORDENADOR com cadastro ativo, DIRETORIA, GESTOR e ADMIN (RNT-001).
- **RN-002 — Visibilidade.** Executivo vê só as solicitações em que é o responsável. Coordenador vê as próprias e as dos vendedores da sua equipe (RNT-004). Diretoria, gestor e admin veem todas. Pedidos fora disso devolvem vazio (C-014, RNT-012).
- **RN-003 — Validações da criação.** Na ordem: cliente escolhido na lista ("Informe o cliente."); tipo ("Informe o tipo da solicitação."); filial ("Informe a filial."); pelo menos um produto ("Adicione ao menos um produto com quantidade."); quantidade > 0 em todos ("Informe uma quantidade maior que zero para todos os produtos."); prazo informado ("Informe o prazo desejado.") e não anterior a hoje em Brasília ("O prazo desejado não pode ser anterior a hoje."). Quantidade aceita vírgula ou ponto decimal (RNT-011). Valores padrão: tipo `Produto`, prioridade `Média`. Tipos: Produto, Complemento de mix, Cotação, Outro. Trocar a filial mantém os produtos já incluídos.
- **RN-004 — Uma solicitação por produto.** Cada produto vira uma solicitação com um item. Referência: a informada, com sufixo "-1", "-2"… quando há mais de um produto; sem referência, o sistema gera "SOL-" + data e hora. O executivo responsável é sempre o usuário logado (RNT-012). Todas as solicitações do formulário são gravadas juntas ou nenhuma é gravada.
- **RN-005 — Envio a Compras.** Logo após gravar, cada item é enviado a Compras. Sucesso: guarda a identificação em Compras e o status passa de `Aberta` para `Em análise`. Falha: a solicitação fica `Aberta`, o item guarda o erro e a rotina tenta de novo a cada 15 minutos. Item que já tem identificação em Compras nunca é reenviado.
- **RN-006 — O que Compras recebe.** Produto, descrição do produto, quantidade, fornecedor, filial, código e nome do cliente, executivo (identificação, nome e e-mail), data de criação e prioridade (Alta → ALTA; Média e Baixa → NORMAL). Justificativa = observação do item; sem ela, a descrição da solicitação; sem nenhuma, "Solicitação comercial".
- **RN-007 — Status a partir de Compras.** Com os status de Compras dos itens da solicitação: todos recusados/rejeitados → `Recusada`; todos atendidos/concluídos/finalizados → `Concluída`; algum aprovado/vinculado → `Aprovada`; demais → `Em análise`. O motivo da recusa é a observação da avaliação; com vários itens, os motivos distintos aparecem separados por " | ". `Concluída` e `Recusada` são finais: a rotina para de consultá-las.
- **RN-008 — Indicadores.** Sobre todas as solicitações do filtro: `Abertas` = status `Aberta` ou `Em análise`; `Alta prioridade` = prioridade Alta; `Prazos vencidos` = prazo anterior a hoje (Brasília) e status diferente de `Concluída` e `Recusada`.
- **RN-009 — Apoio ao produto.** Saída geral do produto por mês nos últimos 6 meses (incluindo o atual), em todas as filiais, mostrando só meses com saída; clientes compradores = os 5 que mais compraram o produto nos últimos 6 meses, em quantidade. Dados lidos do ERP no momento.
- **RN-010 — Cores de status.** Aberta (cinza), Em análise (amarelo), Aprovada (verde), Recusada (vermelho), Concluída (verde claro). Datas em dd/mm/aaaa e horas de Brasília (RNT-011).

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 / RN-005 / RN-006 | Criar com 714 × 50, prioridade Alta → 1 solicitação `Em análise`; envio a Compras com quantidade 50, cliente 1520, filial 2, prioridade ALTA | regra de negócio |
| C-002 / RN-004 | Referência "PED-88" com 3 produtos → 3 solicitações "PED-88-1..3"; sem referência e 1 produto → referência começa com "SOL-" | regra de negócio |
| C-003 / RN-003 | Quantidades 50 e 0 → mensagem de quantidade e 0 gravadas; "2,5" → 2.5 aceito | regra de negócio |
| C-004 / RN-003 | Prazo 29/10/2026 em 30/10/2026 → recusado; 30/10/2026 → aceito | regra de negócio |
| C-005 / RN-005 | Compras indisponível: 2 gravadas `Aberta` com erro; reenvio com Compras ativo → `Em análise`; segundo reenvio não cria registro novo em Compras | regra de negócio |
| RN-004 (atomicidade) | Falha ao gravar a 2ª de 3 → 0 solicitações gravadas | regra de negócio |
| C-006 / RN-007 | Status de Compras {APROVADA} → Aprovada; {REJEITADA} → Recusada; {ATENDIDA} → Concluída; {PENDENTE} → Em análise; {RECUSADA, APROVADA} → Aprovada | regra de negócio |
| RN-007 (finais) | Solicitação `Concluída` não é consultada pela rotina seguinte | regra de negócio |
| C-007 / RN-002 | Ana (12) e Bruno (7): listar e contar como Ana → 12 | regra de negócio |
| C-008 / RN-001 / RN-002 | Coordenador de Ana → 12 e executivos {Ana}; diretoria → 19 e {Ana, Bruno}; coordenador sem cadastro ativo → visão de executivo | regra de negócio |
| C-009 / RN-008 | 45 no filtro (18 abertas, 7 altas, 4 vencidas) → cartões 45/18/7/4 na página 1 e na página 3 | regra de negócio |
| C-010 / RN-008 | Prazo 29/10 em 30/10: Em análise conta, Concluída e Recusada não → 1; às 23:30 de 29/10 em Brasília nada vence | regra de negócio |
| C-011 / RN-009 | Saída [120, 0, 80, 95, 110, 130] → 5 barras; 9 compradores → 5 exibidos em ordem decrescente | regra de tela |
| C-012 | Busca "PED-88" → 3; "121" → só a 121; "mercado" → as do cliente Mercado Bom | regra de negócio |
| C-013 | Detalhe de solicitação recusada traz avaliação "29/10/2026 14:20" e "Motivo: Fornecedor sem estoque" | regra de tela |
| C-014 / RN-002 | Itens da 130 pedidos por Ana → 0 linhas; filtro executivo = Bruno como Ana → só as de Ana | regra de negócio |
| RN-003 (ordem) | Formulário vazio → primeira mensagem "Informe o cliente."; trocar a filial com 2 produtos → 2 produtos mantidos | regra de tela |
| RN-010 | "2026-11-10" → "10/11/2026"; status EM_ANALISE → rótulo "Em análise" | regra de tela |

Verificação manual:
- [ ] Formulário `Nova solicitação` utilizável em 360 px, calendário do prazo incluído (RNFT-003)
- [ ] Tema escuro sem cor fixa no calendário e nos selos de status (RNFT-004)
- [ ] Gráficos de apoio legíveis com 1 e com 6 meses de dados

## Correções em relação ao sistema atual

| Hoje | Na reconstrução | Origem |
|---|---|---|
| Tela liberada só para uma conta de TI, por e-mail fixo; demais veem "Esta tela de desenvolvimento está liberada apenas para o usuário autorizado." | Liberação por papel (RN-001, RNT-002) | manual, seção 10 "Disponibilidade"; `backend/add-solicitacoes-compras.mjs:20,50` |
| Visão de gestão mostra todas as solicitações também para o coordenador | Coordenador vê só a equipe (RN-002, RNT-004) | `backend/add-solicitacoes-compras.mjs:43-48,110-120` |
| Cada produto é criado, localizado pela referência e enviado em passos separados pela tela; erro no meio deixa parte criada e parte sem envio | Gravação única; envio com reenvio automático, sem duplicar (RN-004, RN-005) | manual, seção 10 "Regras"; `SolicitacoesComprasPage.tsx:707-741` |
| Status de Compras atualizado a cada abertura da lista, para todas as solicitações e só das 200 mais recentes | Rotina a cada 15 min para todas as não finalizadas + atualização ao abrir o detalhe (RF-011, RNF-001) | `SolicitacoesComprasPage.tsx:556`; `migrations/update-sf-solicitacoescomprassincronizarstatuscompras-1791303501.sql` |
| `Abertas na página`, `Alta prioridade` e `Prazos vencidos` contam só a página aberta | Contam o filtro inteiro (RN-008) | manual, seção 10; `SolicitacoesComprasPage.tsx:432-437` |
| "Prazo vencido" e horários de envio/sincronização calculados no fuso UTC | Brasília (RNT-011) | `SolicitacoesComprasPage.tsx:435`; SQL de envio e de sincronização |
| Prazo no passado aceito; mensagem técnica "Informe o prazo no formato AAAA-MM-DD." | Prazo ≥ hoje com mensagens de negócio (RN-003) | `SolicitacoesComprasPage.tsx:697-700` |
| Trocar a filial apaga os produtos, embora o catálogo seja o mesmo para todas as filiais | Produtos mantidos (RN-003) | manual, seção 10 "Criar solicitação" |
| Observação por produto existe no cadastro mas a tela sempre grava vazio | Campo de observação por produto, enviado como justificativa (RF-008, RN-006) | `SolicitacoesComprasPage.tsx:732` |
| Busca não encontra pela referência comercial nem pelo número | Busca por referência e número (RF-003) | `backend/add-solicitacoes-compras.mjs` (busca por cliente, tipo e descrição) |
| Falha ao carregar a lista mostra só "Não foi possível carregar as solicitações." e falha de envio some sem registro visível | Erro de envio visível no detalhe e reenviado (RF-012) | `SolicitacoesComprasPage.tsx:573,749` |

## Fora de escopo

- [ ] Responder, aprovar ou recusar solicitações: isso acontece no sistema de Compras.
- [ ] Editar ou cancelar uma solicitação depois de criada (hoje não existe).
- [ ] Agrupar vários produtos numa só solicitação: continua uma por produto.
- [ ] Anexos, cotações de preço e fornecedor escolhido pela executiva.
- [ ] Notificação por e-mail ou alerta quando o status muda.
- [ ] Gráficos de apoio por filial (ver Pendências).
- [ ] Gravar o código do cliente em campo próprio: exigiria mudar a estrutura de dados (spec 000, Fora de escopo); o código segue junto do nome do cliente.

## Pendências

- [x] Sem efeito: spec cancelada em 2026-10-30.
- [x] Sem efeito: spec cancelada em 2026-10-30.
- [x] Sem efeito: spec cancelada em 2026-10-30.
- [x] Sem efeito: spec cancelada em 2026-10-30.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente fora do anexo
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-003, C-004, C-005, C-014)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto

---

## Anexo — Rastreabilidade de origem

**Rota coberta:** `/solicitacoes-compras` (menu "Solicitações"). **Página:** `frontend/src/pages/SolicitacoesComprasPage.tsx` (componentes internos `Autocomplete` e `CalendarPicker`; gráfico `ShadcnBarChart`). Item de menu condicionado em `frontend/src/components/Layout.tsx`.

| RF / RN | Funções do servidor atuais (alias · id) | Tabelas / sistemas |
|---|---|---|
| RF-001, RN-001 | `solicitacoesComprasPermissaoGestao` · 269 (e-mail `ti@benenutri.com` fixo + `USUARIO_CARGO` ADMIN/GESTOR/DIRETORIA/COORDENADOR) | `INT_USER`, `USUARIO_CARGO` |
| RF-002/003, RN-002 | `solicitacoesComprasListar` · 271, `solicitacoesComprasContar` · 272, `solicitacoesComprasExecutivos` · 270 | `SOLICITACOES`, `SOLICITACAO_ITENS` (motivo), `INT_USER` |
| RF-004, RN-008 | sem função (calculado na tela sobre a página) | — |
| RF-005, RN-003/004 | `solicitacoesComprasCriar` · 273, `solicitacoesComprasBuscarPorReferencia` · 274, `solicitacoesComprasAdicionarItem` · 275 | `SOLICITACOES`, `SOLICITACAO_ITENS` |
| RF-006 | `solicitacoesComprasClientesGeral` · 276 | `CLIENTES` (ativos) |
| RF-005 (filial) | `listarFiliais` · 117 (compartilhada) | `FILIAL` |
| RF-007 | `mixCatalogoProdutosCustos` · 91 (compartilhada com a spec 009; parâmetro de filial ignorado) | `PRODUTOS_CUSTOS`, `CUSTO_PADRAO_PRODUTO` |
| RF-009, RN-009 | `solicitacoesComprasProdutoSaidaGeral` · 281, `solicitacoesComprasProdutoClientesGeral` · 282 → funções remotas no projeto de Compras 598 e 599 (`sgc_analise_solicitacao_*_geral`) | ERP `PCMOV`, `PCCLIENT` via integração `compras` |
| RF-010, RN-005/006 | `solicitacoesComprasEnviarItemCompras` · 277 → função remota `sgc_inserir_solicitacao` · 340 no projeto de Compras | `SOLICITACAO_ITENS.COMPRAS_*`, remoto `SGC_SOLICITACOES`; integração `compras` |
| RF-011/012, RN-007 | `solicitacoesComprasSincronizarStatusCompras` · 278, `solicitacoesComprasItensListar` · 283 | `SOLICITACAO_ITENS.COMPRAS_STATUS/AVALIADO_EM/OBS_AVALIACAO/CARD_ID/SYNC_EM/SYNC_ERRO`, remoto `SGC_SOLICITACOES` |

Com a spec cancelada em 2026-10-30, **todas** as funções listadas acima ficam para aposentar quando o sistema antigo sair do ar. Já hoje sem uso em tela: `solicitacoesComprasProdutoSaidaFilial` · 279 e `solicitacoesComprasProdutoClientesFilial` · 280 (remotas 495 e 496). `solicitacoesComprasBuscarPorReferencia` · 274 deixa de ser necessária (a criação devolve os ids). O doc do módulo cita a camada de vendas importadas como fonte dos gráficos de apoio; o código atual consulta o ERP pelo projeto de Compras.

Fontes: `docs/modulos/solicitacoes-compras.md`; manual `docs/base-conhecimento-sales360.md` seções 10 e 14; `backend/add-solicitacoes-compras.mjs`, `add-solicitacoes-clientes-geral.mjs`, `add-solicitacoes-analise-produto-geral.mjs`, `add-solicitacoes-filial-analise-produto.mjs`, `add-integracao-compras-bidirecional.mjs`, `update-compras-via-integracao.mjs`, `migrations/update-sf-solicitacoes*`.
