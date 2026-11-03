# Spec: Atividades (tarefas e follow-ups)

**ID:** 004-tarefas · **Status:** em revisão · **Data:** 2026-10-30

> Spec de **reconstrução**: descreve o comportamento atual já corrigido. Regras
> transversais são citadas pelo id da spec 000 (`RNT-00N`, `RNFT-00N`). Proibido
> citar stack, tabela ou componente fora do anexo **Rastreabilidade de origem**.

## Problema

O vendedor precisa controlar retornos, cotações, propostas e cobranças que não
podem depender de memória. Hoje a tela só permite excluir na visão Kanban, o
registro de alterações guarda apenas a troca de prazo (com a hora do navegador),
trocar o status não atualiza o Google Agenda, o cliente digitado sem clicar na
lista fica silenciosamente o anterior e o coordenador que abre uma atividade da
equipe e salva recebe "Atividade atualizada" sem nada ter sido gravado.

## Resultado esperado

O vendedor cria, acompanha e conclui suas atividades em lista ou kanban, vê o que
está atrasado, sabe quem mudou o quê e quando, e o coordenador acompanha as
atividades da equipe sem conseguir alterá-las por engano.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| Vendedor | Criar, editar, mudar status, excluir e consultar o log das próprias atividades | diária |
| Coordenador / diretoria | Ver as atividades da equipe pelo filtro de escopo, sem editar | semanal |

## Cenários

**C-001 — Criar atividade vinculada a cliente**
- **Dado que** Ana abre `+ Nova Atividade`, digita "hosp sao lucas" no campo Cliente e clica na opção "HOSPITAL SÃO LUCAS LTDA · 4471"
- **Quando** preenche Título "Enviar cotação de dietas", Prioridade Alta, Prazo 05/11/2026 e clica `Salvar`
- **Então** vê "Atividade criada com sucesso.", a atividade aparece em A Fazer com prazo 05/11/2026, o contador do menu sobe de 3 para 4 e o evento é enviado ao Google Agenda de Ana (spec 003)

**C-002 — Validações de criação**
- **Dado que** Ana abre `+ Nova Atividade`
- **Quando** clica `Salvar` com o Título vazio; depois com Título preenchido e Prazo vazio
- **Então** vê "Informe o título da atividade." e depois "Informe o prazo da atividade."; nada é gravado

**C-003 — Cliente digitado sem selecionar**
- **Dado que** a atividade está vinculada a "CLÍNICA BOA VIDA" e Ana apaga o nome e digita "hospital" sem clicar em nenhuma opção
- **Quando** clica `Salvar alterações`
- **Então** vê "Selecione um cliente da lista ou apague o campo." e a atividade não é gravada; apagando o campo inteiro e salvando, o vínculo com cliente é removido

**C-004 — Atrasada**
- **Dado que** hoje é 30/10/2026 em Brasília e Ana tem atividades com prazo 29/10 (A Fazer), 30/10 (Em andamento) e 28/10 (Concluída)
- **Quando** abre Atividades
- **Então** o card `Atrasadas` mostra 1 e só a de 29/10 aparece com prazo em vermelho

**C-005 — Lista ordenada e concluídas recolhidas**
- **Dado que** Ana tem 2 Em andamento (prazos 02/11 e 01/11), 2 A Fazer (prazo 04/11 e uma antiga sem prazo) e 25 Concluídas
- **Quando** abre a visão Lista
- **Então** "Atividades abertas" mostra, nesta ordem: A Fazer 04/11, A Fazer sem prazo, Em andamento 01/11, Em andamento 02/11; o bloco `CONCLUÍDA` vem recolhido e, ao expandir, mostra as 20 concluídas mais recentes com paginação para as outras 5

**C-006 — Trocar status**
- **Dado que** a atividade "Enviar cotação" está A Fazer
- **Quando** Ana muda o seletor para Concluída (na Lista ou no Kanban)
- **Então** vê "Atividade marcada como concluída.", a data e hora de conclusão ficam registradas, o log ganha "Status alterado — De A Fazer para Concluída — Ana Souza", o contador do menu cai 1 e o evento do Google é atualizado (spec 003)

**C-007 — Editar prazo registra log**
- **Dado que** a atividade tem prazo 05/11/2026
- **Quando** Ana muda o prazo para 08/11/2026 e clica `Salvar alterações`
- **Então** vê "Atividade atualizada." e a aba `Log` mostra "Prazo alterado — De 05/11/2026 para 08/11/2026 — Ana Souza — 30/10/2026 14:32"

**C-008 — Excluir na Lista ou no Kanban**
- **Dado que** Ana está na visão Lista
- **Quando** clica na lixeira de "Ligar para compras" e confirma "Tem certeza que deseja excluir Ligar para compras? Esta ação não pode ser desfeita."
- **Então** vê "Atividade removida.", a atividade some, o contador do menu é recalculado e o evento do Google é removido (spec 003)

**C-009 — Coordenador vê a equipe sem editar**
- **Dado que** o coordenador Carlos está em "Time inteiro" e Ana tem 4 atividades abertas
- **Quando** Carlos abre uma atividade de Ana
- **Então** vê os dados e o log com o responsável "Ana Souza", em modo "Somente visualização", sem seletor de status, sem `Salvar alterações` e sem lixeira

**C-010 — Pedido de alteração em atividade de outro**
- **Dado que** a atividade 812 é de Bruno
- **Quando** chega um pedido de alteração de status da 812 em nome de Ana
- **Então** nada é gravado e a resposta é "nada foi alterado: a atividade não é sua" (RNT-013)

**C-011 — Filtros**
- **Dado que** Ana tem 12 atividades, 3 delas com prazo 05/11/2026 e 5 com prioridade Alta
- **Quando** escolhe `Prazo exato` = 05/11/2026; depois `Limpar filtros` e `Prioridade` = Alta
- **Então** vê 3 atividades; depois 5; os cards de resumo refletem o filtro aplicado

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE listar as atividades do escopo escolhido (RNT-003) em Lista ou Kanban | C-005; visão inicial = preferência do usuário (spec 001) | must |
| RF-002 | O sistema DEVE mostrar os cards Total, Em andamento, Atrasadas e Concluídas | C-004, C-011 | must |
| RF-003 | O sistema DEVE filtrar por Status, Prioridade e Prazo exato, com `Limpar filtros` e `Atualizar` | C-011 | must |
| RF-004 | O sistema DEVE criar atividade com título, descrição, cliente opcional, prioridade e prazo | C-001, C-002 | must |
| RF-005 | O sistema DEVE editar título, descrição, cliente, prioridade e prazo na janela `Editar Atividade` | C-003, C-007 | must |
| RF-006 | O sistema DEVE trocar o status pelo seletor na Lista e no Kanban | C-006 | must |
| RF-007 | O sistema DEVE excluir atividade com confirmação, na Lista e no Kanban | C-008 | must |
| RF-008 | O sistema DEVE registrar e mostrar o log de alterações de cada atividade | C-006, C-007 | must |
| RF-009 | O sistema DEVE buscar clientes para vínculo só na carteira do usuário, com busca inteligente | C-001; até 80 opções, com aviso para refinar | must |
| RF-010 | O sistema DEVE atualizar o contador de pendentes do menu logo após criar, mudar status ou excluir | C-001, C-006, C-008 | must |
| RF-011 | O sistema DEVE enviar ao Google Agenda a criação, edição, troca de status e exclusão de atividade com prazo | C-001, C-006, C-008; regras na spec 003 | must |
| RF-012 | O sistema DEVE mostrar atividades de outros vendedores só para leitura | C-009, C-010 | must |

## Requisitos não-funcionais

Valem RNFT-001, RNFT-002, RNFT-003 e RNFT-007. Específicos:

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | A tela abre com no máximo 3 consultas (lista de abertas, resumo, primeira página de concluídas sob demanda) | Contagem no simulador |
| RNF-002 | Gravar a atividade, o log e a fila do Google é uma ação única; nenhuma parte fica gravada sozinha | Falha simulada no log desfaz a alteração da atividade |

## Entidades do domínio

- **Atividade** — pendência de um vendedor: título, descrição, cliente opcional, status, prioridade, prazo, criação e conclusão.
- **Log da atividade** — registro de cada mudança: campo, valor anterior, valor novo, quem e quando.
- **Cliente** — da carteira do vendedor (spec 002); atividade concluída vinculada aparece no histórico do cliente.

## Regras de negócio

- **RN-001 — Dono.** A atividade pertence a quem a criou (RNT-012). Só o dono cria, edita, muda status e exclui as suas. Nenhum papel edita atividade de outra pessoa.
- **RN-002 — Visibilidade.** Meu painel: as próprias. Time inteiro, Vendedor específico e visão da diretoria: as dos vendedores do escopo (RNT-003/004), com o nome do responsável e só leitura.
- **RN-003 — Status.** A Fazer (inicial), Em andamento, Concluída. A troca é livre entre os três. Ao entrar em Concluída grava data e hora de conclusão (Brasília); ao sair de Concluída a data de conclusão é apagada. Mensagem: "Atividade marcada como {a fazer | em andamento | concluída}.". O status não muda na janela de edição.
- **RN-004 — Prioridade.** Alta, Média (padrão) e Baixa.
- **RN-005 — Obrigatórios.** Título (sem só espaços) e prazo. Mensagens: "Informe o título da atividade." / "Informe o prazo da atividade.". Falha de gravação: "Não foi possível salvar a atividade.". Atividades antigas sem prazo continuam válidas e aparecem depois das que têm prazo.
- **RN-006 — Atrasada.** Prazo anterior à data de hoje em Brasília (RNT-011) e status diferente de Concluída. A que vence hoje não é atrasada.
- **RN-007 — Ordem da lista.** Abertas: A Fazer antes de Em andamento; dentro de cada status, prazo mais próximo primeiro e sem prazo no fim. Concluídas: conclusão mais recente primeiro, 20 por página, bloco recolhido por padrão. Kanban: colunas A FAZER, EM ANDAMENTO e CONCLUÍDA, mesma ordem dentro da coluna.
- **RN-008 — Cliente vinculado.** Opcional. Só cliente da carteira do usuário (ou de titular coberto em férias ativas, RNT-010), escolhido explicitamente na lista. Texto no campo sem opção escolhida → "Selecione um cliente da lista ou apague o campo.". Campo vazio remove o vínculo. A busca segue RN-018 da spec 002 e devolve até 80 opções; acima disso, "Refine a busca para ver mais clientes.".
- **RN-009 — Log.** Toda mudança de título, descrição, cliente, prioridade, prazo e status gera uma linha: campo, de, para, usuário e data/hora de Brasília registradas pelo servidor. Exibição: "Prazo alterado — De X para Y — Usuário — dd/mm/aaaa hh:mm"; demais campos com o nome do campo ("Status alterado", "Prioridade alterada"...). Mais recente primeiro. A criação gera a linha "Atividade criada".
- **RN-010 — Exclusão.** Definitiva, com confirmação "Tem certeza que deseja excluir <título>? Esta ação não pode ser desfeita.". Sucesso: "Atividade removida."; falha: "Não foi possível excluir a atividade.".
- **RN-011 — Contador do menu.** Quantidade de atividades do usuário em A Fazer ou Em andamento (RN-008 da spec 001).
- **RN-012 — Google Agenda.** Criar, editar, trocar status e excluir atividade com prazo entra na sincronização do Google de quem é dono (spec 003). Atividade sem prazo não sincroniza.
- **RN-013 — Resumo.** Total, Em andamento, Atrasadas e Concluídas contam as atividades que passam pelos filtros aplicados.
- **RN-014 — Outras origens.** Atividades criadas no encerramento de uma visita (spec 003) seguem as mesmas regras. Atividade concluída com cliente aparece no histórico do cliente (spec 002).

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | Criação com cliente 4471, Alta, prazo 05/11 → atividade A Fazer do usuário logado; resposta traz o identificador criado; contador 3 → 4; item na fila do Google | regra de negócio |
| C-002 / RN-005 | Título "   " → recusado com a mensagem de título; prazo vazio → mensagem de prazo; 0 gravados | regra de negócio |
| C-003 / RN-008 | Texto "hospital" sem opção → erro e nada gravado; campo vazio → cliente removido; cliente fora da carteira enviado direto → recusado | regra de negócio |
| C-004 / RN-006 | Hoje 30/10: prazo 29/10 A Fazer → atrasada; 30/10 → não; 28/10 Concluída → não; virada às 23h30 de Brasília (02h30 UTC) ainda conta 30/10 | regra de tela |
| C-005 / RN-007 | Ordem esperada {A Fazer 04/11, A Fazer sem prazo, Em andamento 01/11, Em andamento 02/11}; 25 concluídas → páginas de 20 e 5 | regra de negócio |
| C-006 / RN-003 | A Fazer → Concluída grava conclusão; Concluída → Em andamento apaga a conclusão; mensagem "Atividade marcada como concluída." | regra de negócio |
| C-007 / RN-009 | Prazo 05/11 → 08/11 gera 1 linha de log com autor e hora do servidor; editar só a descrição gera 1 linha "Descrição alterada"; salvar sem mudança gera 0 linhas | regra de negócio |
| RNF-002 | Falha forçada ao gravar o log → atividade continua com o prazo antigo | regra de negócio |
| C-008 / RN-010 | Exclusão pela Lista e pelo Kanban → atividade some, contador recalculado, remoção na fila do Google | regra de negócio |
| C-009 / RN-002 | Coordenador em Time inteiro → recebe as 4 atividades de Ana com responsável "Ana Souza" e marca de só leitura | regra de negócio |
| C-010 / RN-001 | Alterar status, editar ou excluir atividade de outro usuário → 0 alterados e erro; papel GESTOR também recebe 0 | regra de negócio |
| C-011 / RN-013 | 12 atividades, prazo exato 05/11 → 3 e cards somam 3; prioridade Alta → 5 | regra de tela |
| RN-004 | Criação sem prioridade informada → Média | regra de negócio |
| RN-011 | 2 A Fazer + 1 Em andamento + 5 Concluídas → contador 3 | regra de negócio |
| RN-012 | Atividade sem prazo criada → nenhum item na fila do Google; com prazo → 1 item | regra de negócio |
| RN-014 | Atividade concluída com cliente X → aparece na linha do tempo do histórico de X; aberta → não aparece | regra de negócio |

Verificação manual:
- [ ] Lista e Kanban usáveis em 360 px (RNFT-003)
- [ ] Cores de prioridade (Alta vermelho, Média amarelo, Baixa verde) e prazo vencido legíveis em tema escuro
- [ ] Modo "Somente visualização" claro para o coordenador

## Fora de escopo

- [ ] Como o evento da atividade aparece no Google Agenda e o que acontece com ele ao concluir: spec 003.
- [ ] Criação de atividades no fechamento de visita: spec 003 (aqui só as regras da atividade).
- [ ] Atribuir atividade a outro vendedor ou o coordenador criar atividade para a equipe.
- [ ] Atividades recorrentes, lembretes por e-mail ou notificação no celular.
- [ ] Busca por título ou descrição na lista.
- [ ] Arrastar cartões entre colunas no Kanban (a troca é pelo seletor).

## Pendências

- [x] Decidido em 2026-10-30: não; o substituto não vê nem trata as atividades do titular (padrão mantido).

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente fora do anexo
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem caminhos de erro (C-002, C-003, C-010)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [ ] Zero `[NEEDS CLARIFICATION]` em aberto

## Correções em relação ao sistema atual

| Hoje | Na reconstrução | Origem |
|---|---|---|
| Excluir só existe na visão Kanban | Lista e Kanban (RF-007) | manual seção 6 "Excluir"; seção 15 "Atividades" |
| Log guarda só troca de prazo, numa segunda chamada separada, com data/hora do navegador | Todos os campos e o status, pelo servidor, na mesma ação (RN-009, RNF-002) | `TarefasPage.tsx:516-525` |
| Depois de criar, a tela procura a atividade por título/prazo/cliente para enviar ao Google (pode pegar a errada) | A criação devolve a atividade criada | `TarefasPage.tsx:358-366,541-542` |
| Trocar status não atualiza o Google Agenda | Atualiza (RN-012) | manual seção 6 "Google Agenda" |
| Cliente digitado sem clicar na lista mantém o anterior em silêncio | Erro até escolher ou apagar (RN-008) | manual seção 6 "Perguntas frequentes" |
| Seletor de clientes segue o filtro de escopo da tela (coordenador em Time inteiro vincula cliente da equipe) | Sempre a carteira do usuário (RN-008) | `TarefasPage.tsx:323-334` |
| Coordenador vê atividades da equipe, salva e recebe "Atividade atualizada." sem gravar | Só leitura e resposta de 0 alterados (RN-001/002, RNT-013) | `backend/hotfix-agenda-historico-atividades-mix.mjs:219-232` |
| GESTOR e ADMIN editam e leem o log de atividade de qualquer pessoa | Só o dono edita (RN-001) | `backend/hotfix-agenda-historico-atividades-mix.mjs:19-26` |
| Contador do menu só atualiza a cada 5 minutos | Logo após a ação (RF-010) | manual seção 6; `Layout.tsx:100-101` |
| Preferência "Exibição padrão de Atividades" ignorada | Aplicada (RF-001; spec 001) | manual seção 2 |
| Concluídas carregadas todas de uma vez | 20 por página (RN-007, RNFT-001) | `TarefasPage.tsx:345-351` |

---

## Anexo — Rastreabilidade de origem

**Rotas atuais cobertas:** `/tarefas`; contador do item Atividades no menu (todas as rotas).

**Páginas e componentes atuais:** `frontend/src/pages/TarefasPage.tsx` (inclui `ClienteSearchDropdown`, visão Lista/Kanban, abas Dados/Log), `frontend/src/lib/smartSearch.ts` (busca do seletor), `frontend/src/lib/googleAgenda.ts` (`sincronizarGoogleAgenda('TAREFA', id)`), `frontend/src/components/Layout.tsx` (contador), `frontend/src/components/CoordinatorScopeFilter.tsx` (`useCoordinatorScope('atividades')`). Scripts: `backend/hotfix-agenda-historico-atividades-mix.mjs`, `add-criar-tarefa.mjs`, `add-vinculo-cliente-tarefas-visita.mjs`, `update-coordenador-escopo-atividades-alertas.mjs`, `update-listar-tarefas-responsavel.mjs`; última versão do contador em `backend/migrations/update-sf-contartarefaspendentes-1792676666.sql`.

| RF / RN | SFs atuais (alias · id) | Tabelas |
|---|---|---|
| RF-001, RN-002, RN-007 | `listarTarefas` · 11 (escopo `TARGET_USERS`, coluna `RESPONSAVEL`) | `TAREFAS`, `CLIENTES`, `INT_USER`, `FUNCIONARIOS` |
| RF-010, RN-011 | `contarTarefasPendentes` · 12 | `TAREFAS` (`STATUS IN ('PENDENTE','EM_ANDAMENTO')`) |
| RF-004, RN-005 | `criarTarefa` · 23 | `TAREFAS` (`VENDEDOR_ID`, `CLIENTE_ID`, `TITULO`, `DESCRICAO`, `STATUS`, `PRIORIDADE`, `DATA_LIMITE`, `CRIADO_EM`) |
| RF-005, RN-001 | `tarefasAtualizarDados` · 52 | `TAREFAS`, `USUARIO_CARGO` (exceção GESTOR/ADMIN que sai) |
| RF-006, RN-003 | `tarefasAtualizarStatusSeguro` · 53 | `TAREFAS.STATUS`, `TAREFAS.CONCLUIDO_EM` |
| RF-007, RN-010 | `tarefasExcluirSeguro` · 54 | `TAREFAS` |
| RF-008, RN-009 | `atividadesRegistrarLog` · 140; `atividadesListarLog` · 141 | `ATIVIDADES_LOG` (`ID_ATIVIDADE`, `CAMPO_ALTERADO`, `VALOR_ANTERIOR`, `VALOR_NOVO`, `DATA_ALTERACAO`, `ID_USUARIO`) |
| RF-009, RN-008 | `minhaCarteiraClientes` · 27 (spec 002), com `limit` 80 | `EQUIPE_CLIENTE`, `CLIENTES` |
| RF-011, RN-012 | `googleAgendaSincronizarItem` · 212 e fila `googleAgendaEnfileirarSync` · 374 (spec 003) | `GOOGLE_AGENDA_EVENTOS` |
| RN-014 | `historicoVisitasCliente` · 22 (spec 002) | `TAREFAS.CONCLUIDO_EM` |

SFs de atividades **sem uso pela tela** (aposentar): `atualizarStatusTarefa` · 15 (substituída por 53).
