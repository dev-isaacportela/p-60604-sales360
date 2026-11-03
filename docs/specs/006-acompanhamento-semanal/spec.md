# Spec: Acompanhamento semanal

**ID:** 006-acompanhamento-semanal · **Status:** em revisão · **Data:** 2026-10-30

> Spec de **reconstrução** (ver 000). Regras transversais citadas pelo id
> (`RNT-00N`, `RNFT-00N`). Proibido citar stack, tabela ou componente fora do
> anexo **Rastreabilidade de origem**.

## Problema

Vendedor, coordenação e diretoria acompanham semana a semana quanto cada cliente da carteira comprou e se ele está comprando no ritmo de sempre. Hoje a mesma carteira mostra status diferentes nas duas visões e o substituto de férias não vê os clientes do titular. Uma queda de 100% aparece como "Sem base". A carga de vendas do ERP, que alimenta todos os painéis de venda, chegou a acumular milhões de registros de erro repetidos.

## Resultado esperado

Qualquer pessoa abre o mês e vê, cliente a cliente e semana a semana, o faturamento líquido que conta para o escopo dela, a variação contra o mesmo período do mês anterior e quem saiu da faixa normal de variação, com os mesmos números e o mesmo status em todas as visões.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| Vendedor | Ver a própria carteira semana a semana, abrir o detalhe de um cliente e exportar a planilha | semanal |
| Coordenador / Diretoria | O mesmo para a equipe ou para um vendedor (RNT-003/004) | semanal |

## Cenários

Datas de out/2026: semanas operacionais 01, 02–08, 09–15, 16–22, 23–29 e 30–31 (RNT-005). Set/2026: 01–03, 04–10, 11–17, 18–24 e 25–30.

**C-001 — Matriz do mês com B/W**
- **Dado que** o cliente Alfa, da carteira de Ana, comprou R$ 1.200 na semana 2 de out/2026 e R$ 1.000 na semana 2 de set/2026
- **Quando** Ana abre o acompanhamento semanal em Outubro/2026
- **Então** a célula da 2ª sem mostra R$ 1.200,00 e "B/W +20,0%" em verde, e o cabeçalho da coluna mostra "02/10 a 08/10"

**C-002 — Cliente sem venda continua na lista**
- **Dado que** a carteira de Ana no escopo tem 40 clientes e 12 não compraram em out/2026 nem em set/2026
- **Quando** ela abre o mês
- **Então** a tabela tem 40 linhas; as 12 aparecem com R$ 0,00 em todas as semanas, B/W "Sem base" e status `Sem base`; o card "Clientes na carteira" mostra 40 e "Com compra no mês" mostra 28

**C-003 — Queda total não é "Sem base"**
- **Dado que** Alfa comprou R$ 1.000 na semana 2 de set/2026 e nada na semana 2 de out/2026
- **Quando** Ana escolhe `Abaixo da expectativa: 2ª sem`
- **Então** Alfa aparece com "B/W −100,0%" em vermelho

**C-004 — Devolução deduzida na semana em que ocorreu**
- **Dado que** Alfa comprou R$ 2.000 em 10/10 e devolveu R$ 300 em 12/10, na mesma filial, departamento e seção
- **Quando** Ana olha a 3ª sem de out/2026
- **Então** vê R$ 1.700,00, e o fechamento do mês também desconta os R$ 300 (RNT-008)

**C-005 — Status pela faixa de B/W**
- **Dado que** hoje é 20/10/2026 (semana 4, 16/10 a 22/10) e, na semana 4 de set/2026 (18/09 a 24/09), Beta, Gama e Delta compraram R$ 1.000 cada e Épsilon nada; na semana 4 de out/2026 Beta comprou R$ 900, Gama R$ 800, Delta R$ 1.300 e Épsilon R$ 500
- **Quando** Ana abre out/2026
- **Então** Beta aparece como `No padrão` (−10,0%), Gama como `Fora do padrão` (−20,0%), Delta como `Alerta` (+30,0%), Épsilon como `Sem base`, e o card "Clientes em alerta" mostra 1

**C-006 — cancelado em 2026-11-03** (comparava com a visão de gestão; ver Fora de escopo)

**C-007 — Substituto de férias herda a carteira**
- **Dado que** Ana está de férias de 01/10 a 15/10/2026 com Bruno como substituto, e Alfa (de Ana) comprou R$ 900 em 05/10 e R$ 400 em 20/10
- **Quando** Bruno abre out/2026
- **Então** Alfa aparece na lista dele identificado como "de Ana", com R$ 900,00 na 2ª sem e R$ 0,00 na 4ª sem (a compra de 20/10 é só de Ana)

**C-008 — Equipe sem contar duas vezes**
- **Dado que** no C-007 o coordenador de Ana e Bruno abre "Time inteiro"
- **Quando** olha a linha de Alfa
- **Então** a 2ª sem mostra R$ 900,00 (não R$ 1.800,00) e a 4ª sem R$ 400,00

**C-009 — Drill do cliente**
- **Dado que** Alfa teve 2 pedidos na semana 3 de out/2026 (R$ 1.500 e R$ 500), comprando 10 un do produto P1 (na semana 3 de set foram 6 un) e nada de P2 (4 un na semana 3 de set)
- **Quando** Ana clica em Alfa e abre "Semana 3 - 09/10/2026 a 15/10/2026"
- **Então** o cabeçalho mostra "2 pedido(s) • R$ 2.000,00"; P2 aparece primeiro como `Deixou de comprar` (−4), P1 como `Comprou a mais` (+4); a linha Pedidos lista os 2 números com valor

**C-010 — Exportar planilha**
- **Dado que** Ana tem 40 clientes em out/2026 e 28 deles com compra em pelo menos uma semana
- **Quando** clica em `Exportar Excel`
- **Então** baixa `analytics-semanal-2026-10.xlsx`: aba "Dados semanais" com 40 linhas + TOTAL, valores numéricos com formato de moeda e B/W como porcentagem (−100% sai −100,0%, "Sem base" sai vazio); aba "Produtos" só com as semanas com movimento

**C-011 — cancelado em 2026-11-03** (filtros da visão de gestão; ver Fora de escopo)

**C-012 — Carga automática do ERP**
- **Dado que** a carga do ERP traz 10.000 itens e 50 deles têm cliente sem cadastro
- **Quando** a rotina automática roda
- **Então** a execução fica registrada como "Concluída", com 9.950 válidos e 50 erros, e a visão do vendedor mostra "Vendas atualizadas em" com a data e hora em Brasília

**C-013 — Sincronização simultânea (borda)**
- **Dado que** uma sincronização começou às 10:00 e ainda não terminou
- **Quando** às 10:10 outra execução da rotina começa
- **Então** ela é recusada com "Já existe uma sincronização em andamento desde 10:00." e nenhuma nova carga começa; às 10:31, uma nova carga fecha a de 10:00 como "Com falha" e começa

**C-014 — Erro de ingestão não se repete**
- **Dado que** 48 itens ficam sem cliente cadastrado em duas cargas seguidas e 2 itens com seção sem cadastro são corrigidos no ERP antes da segunda
- **Quando** a segunda carga termina
- **Então** existem 50 erros registrados, não 100: os 48 com 2 ocorrências e "aberto"; os 2 "resolvido". Oito dias depois, os 2 resolvidos não existem mais

**C-015 — cancelado em 2026-11-03** (conferência de atribuição da tela Acomp. Semanal Admin; ver Fora de escopo)

**C-016 — cancelado em 2026-11-03** (Painel de Validação; ver Fora de escopo)

**C-017 — cancelado em 2026-11-03** (Painel de Validação; ver Fora de escopo)

**C-018 — Mês encerrado olha o mês inteiro**
- **Dado que** hoje é 05/11/2026; Beta fechou out/2026 com R$ 4.000 contra R$ 5.000 em set/2026 e não comprou na 6ª sem de outubro (30/10 a 31/10)
- **Quando** Ana abre out/2026
- **Então** Beta aparece como `Fora do padrão`, pelo B/W do fechamento (−20,0%), e não pela última semana do mês

**C-019 — Linhas repetidas do ERP são somadas**
- **Dado que** o pedido 5001 da Filial 1 traz o produto P1 em duas linhas: 3 un por R$ 300 e 2 un por R$ 200
- **Quando** a carga do ERP termina
- **Então** o item fica com 5 un e R$ 500,00, e a célula da semana conta R$ 500,00 (não R$ 200,00)

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE mostrar a matriz cliente × semana operacional do mês escolhido, com uma coluna por semana existente (4 a 6) | Out/2026 tem 6 colunas e Fev/2026 tem 5, cada uma com o intervalo de datas | must |
| RF-002 | O sistema DEVE listar toda a carteira do escopo, inclusive clientes sem venda no mês | C-002 | must |
| RF-003 | O sistema DEVE mostrar valor líquido e B/W por semana, fechamento do mês anterior, fechamento do mês com B/W, status e linha TOTAL | C-001, C-003, C-004; TOTAL = soma das linhas visíveis | must |
| RF-004 | O sistema DEVE oferecer os filtros Ramo, Mês, Ano (ano corrente −1 a +1) e `Abaixo da expectativa` por semana, além do filtro de escopo (RNT-003) | Cada filtro muda a tabela sem recarregar a tela | must |
| RF-005 | O sistema DEVE mostrar os cards "Clientes na carteira", "Com compra no mês", "Fechamento do mês" e "Clientes em alerta" (clientes com status `Alerta`, RN-008) | C-002, C-005 | must |
| RF-006 | O sistema DEVE abrir, ao clicar no cliente, o detalhe logo abaixo da linha dele na própria tabela (sem janela por cima; clicar de novo fecha; um cliente aberto por vez), com as semanas do mês em lista que abre e fecha (pedidos e valor; abre na primeira semana com compra), os itens da semana comparados com a mesma semana do mês anterior com as últimas 8 semanas em minigráfico, os pedidos da semana e a aba Sazonalidade em mapa de calor | C-009 | must |
| RF-007 | O sistema DEVE exportar a matriz filtrada em planilha com as abas "Dados semanais" e "Produtos" | C-010; com 300 clientes a exportação usa no máximo 3 consultas | must |
| RF-008 | Cancelado em 2026-11-03: a visão de gestão (Acomp. Semanal) não é reconstruída | — | — |
| RF-009 | Cancelado em 2026-11-03: a carga não tem disparo manual (RN-017); a data da última atualização aparece pela RF-010 | — | — |
| RF-010 | O sistema DEVE mostrar a data da última atualização de vendas também na visão do vendedor (RNT-015) | Texto "Vendas atualizadas em dd/mm/aaaa hh:mm" visível | should |
| RF-011 | O sistema DEVE carregar as vendas do ERP de hora em hora, das 8h às 19h, de segunda a sexta, validando cada item e consolidando por semana, e carregar as devoluções do ERP de hora em hora | C-012, C-014, C-019; devolução lançada no ERP aparece na matriz em até 1 hora | must |
| RF-012 | O sistema DEVE registrar cada execução da carga com início, fim, status, contadores e a mensagem real de falha | Execução com falha mostra o motivo, nunca texto genérico de objeto | must |
| RF-013 | O sistema DEVE manter um registro único por item e tipo de erro, com contador de ocorrências, situação aberto/resolvido e retenção de 7 dias para resolvidos | C-014 | must |
| RF-014 | Cancelado em 2026-11-03: a tela Acomp. Semanal Admin não é reconstruída (ver Fora de escopo) | — | — |
| RF-015 | Cancelado em 2026-11-03: o Painel de Validação não é reconstruído | — | — |
| RF-016 | Cancelado em 2026-11-03: sem visão de gestão nem tela técnica, não há tela restrita neste módulo | — | — |
| RF-017 | O sistema PODE mostrar à TI a lista de erros de ingestão abertos, com tipo, item e ocorrências | Lista filtrável por tipo de erro | could |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | A matriz de um vendedor com 500 clientes abre em até 3 s; a de "Time inteiro" com 5.000 clientes, em até 6 s | Cronômetro no ambiente de homologação com volume de produção |
| RNF-002 | Uma carga do ERP termina em até 15 min com 100 mil itens e não deixa dados pela metade se cair no meio: a execução fica "com falha" e a próxima refaz tudo | Teste de carga; interromper a carga e conferir os totais após a seguinte |
| RNF-003 | O registro de erros de ingestão não cresce com o número de execuções: o tamanho dele depende só dos itens com erro em aberto e dos resolvidos nos últimos 7 dias | Duas cargas iguais seguidas não aumentam a quantidade de registros |

## Entidades do domínio

- **Item de venda do ERP** — linha de pedido/nota: pedido, nota, filial, produto, quantidade, valor unitário, total, data de saída, cliente, departamento, seção e RCA. Identificado por pedido + produto + filial; linhas repetidas com a mesma identificação são somadas num item só. Tem situação: válido, com erro (com o tipo) ou inativo (deixou de vir do ERP).
- **Consolidado semanal** — soma de valor e quantidade por cliente × filial × departamento × seção × semana operacional.
- **Devolução** — linha de devolução do ERP: nota de devolução, nota e pedido de origem, data da devolução, filial, departamento, seção, produto, quantidade e valor devolvidos.
- **Valor médio de compra do cliente** — valor médio por semana com compra nos últimos 3 meses, no escopo da linha; serve só para a curva (RN-009).
- **Execução de carga** — uma rodada da sincronização com o ERP: início, fim, status (em andamento, concluída, com falha), contadores e mensagem.
- **Erro de ingestão** — item + tipo de erro, com detalhe, ocorrências, primeira e última ocorrência, situação e data de resolução.

## Regras de negócio

- **RN-001 — O que entra na matriz.** Uma venda entra na linha de um vendedor pelas regras de atribuição (RNT-007), inclusive o substituto com férias ativas na data da venda (RNT-010). A lista de clientes é a carteira do vendedor no escopo filtrado. O substituto também vê os clientes do titular quando as férias cruzam o mês aberto, identificados como "de <titular>".
- **RN-002 — Uma venda conta uma vez.** Uma linha de venda conta uma única vez para o vendedor, mesmo que case com mais de um escopo dele (ex.: escopo da BU sem seção e escopo da seção 2 da mesma BU). Em visão de equipe, a linha do cliente soma cada venda uma vez, mesmo que ela conte para titular e substituto.
- **RN-003 — Valor da célula.** Célula = vendas da semana − devoluções cuja data de devolução cai na semana, mesma filial, departamento e seção (RNT-008). Pode ficar negativa. Devolução sem seção informada não entra.
- **RN-004 — B/W.** B/W da semana N = (valor da semana N − valor da semana N do mês anterior) ÷ valor da semana N do mês anterior. B/W do fechamento usa os totais dos dois meses. Se o valor anterior for zero ou negativo, mostra "Sem base". Uma queda total mostra −100,0%. Formato com uma casa e sinal (+20,0%). Cores: verde se positivo, vermelho se negativo, cinza para zero ou "Sem base". Semana que não existe no mês anterior (ex.: 6ª de out contra set) é "Sem base".
- **RN-005 — Abaixo da expectativa.** O filtro por semana N mostra só os clientes com B/W da semana N ≤ −15,0%, incluindo −100,0%, e exclui "Sem base".
- **RN-006 — Valor médio de compra.** Soma das compras do cliente no escopo da linha, nos 3 meses que terminam no mês aberto, dividida pelo número de semanas operacionais com compra nesse período. Sem compra nos 3 meses, o valor médio é zero. Serve só para a curva (RN-009); frequência e semana padrão de compra não existem mais (removidas em 2026-10-30: o status passou a ser só pela faixa de B/W).
- **RN-007 — Período de referência do status.** No mês corrente é a semana operacional de hoje: o status usa o B/W dessa semana. Em mês encerrado é o mês inteiro: o status usa o B/W do fechamento.
- **RN-008 — Status pela faixa de B/W.** Sobre o B/W do período de referência (RN-007), arredondado a uma casa como aparece na tela: |B/W| abaixo de 15,0% = `No padrão`; de 15,0% a 25,0% = `Fora do padrão`; acima de 25,0% = `Alerta`; B/W "Sem base" (período anterior zero ou negativo) = `Sem base`. A faixa vale para alta e para queda (+30,0% também é `Alerta`; −100,0% é `Alerta`). É o mesmo status, com a mesma regra, nas visões do vendedor e de gestão e no card "Clientes em alerta", que conta as linhas com status `Alerta`. Na visão agregada (RN-010), o status usa o B/W recalculado sobre os valores somados.
- **RN-009 — Curva da linha.** É a curva do cliente na carteira (spec 002). Sem curva cadastrada, usa o valor médio de compra (RN-006): a partir de R$ 15.000 = A, a partir de R$ 7.000 = B, abaixo = C. Na visão de equipe vale a melhor curva.
- **RN-010 — Visão agregada.** Em "Time inteiro" e na visão da diretoria, a visão do vendedor mostra uma linha por cliente, rotulada "Equipe", e o B/W é recalculado sobre os valores somados.
- **RN-011 — Detalhe do cliente.** Segue o mês, o ano e o escopo da linha. Para cada semana do mês mostra pedidos distintos e valor líquido, e o valor bate com a célula da matriz. Itens da semana: quantidade, quantidade na mesma semana do mês anterior, diferença em unidades, valor unitário, valor total e as últimas 8 semanas com compra do produto, com o pico. Movimento de cada item: `Novo na semana` (antes 0, agora > 0), `Deixou de comprar` (antes > 0, agora 0), `Comprou a mais`, `Queda` ou `Estável`. Ordem: Deixou de comprar, Comprou a mais, Queda, Estável, e dentro de cada grupo pela maior diferença. A aba Sazonalidade mostra quantidade e valor por produto nos 12 meses que terminam no mês aberto.
- **RN-012 — Planilha.** Arquivo `analytics-semanal-AAAA-MM.xlsx`. Aba "Dados semanais": Cliente ID, Cliente, Curva, Segmento, Ramo, Vendedor ID, Vendedor, valor e B/W de cada semana do mês (rótulo "Nª sem (dd/mm a dd/mm)"), Fechamento mês anterior, Fechamento do mês, B/W fechamento e Status, com linha TOTAL e as duas primeiras colunas fixas. Aba "Produtos": um item por cliente × semana com movimento, com Diferença QTD em unidades. Valores são números com formato de moeda na célula, B/W é porcentagem e "Sem base" fica vazio. Exporta o que a tela mostra, com os filtros aplicados. Sem linhas, a mensagem é "Não há dados semanais para exportar."
- **RN-013 — Validação do item na carga.** Cada item do ERP é validado nesta ordem, e o primeiro problema define o tipo de erro: data de saída inválida; cliente sem cadastro (código do ERP); filial vazia; departamento vazio; seção vazia; seção não cadastrada para o departamento. Quantidade zero ou ausente vira total ÷ valor unitário; sem valor unitário e com total positivo, vira 1. Linhas do ERP com o mesmo pedido, produto e filial são somadas (quantidade e total) num item só, nunca sobrescritas. Item com erro não entra em nenhum total.
- **RN-014 — Inativação.** Item válido que deixa de vir numa carga (ex.: pedido cancelado) é inativado e sai dos totais. A semana consolidada que deixa de ter itens também. O contador de inativados da execução conta só o que foi inativado nela.
- **RN-015 — Erros de ingestão.** Existe um registro por item + tipo de erro. Na carga em que o erro aparece, o registro é criado, ou reaberto com +1 ocorrência. Erro aberto que não aparece numa carga vira "resolvido" com data. Resolvido há mais de 7 dias é apagado.
- **RN-016 — Execuções.** Só uma carga roda por vez: um pedido de carga com outra em andamento há menos de 30 min é recusado com "Já existe uma sincronização em andamento desde hh:mm.". Execução em andamento há mais de 30 min é fechada como falha, com a mensagem "Execução interrompida sem finalizar (tempo limite ou queda do processo)", pela execução seguinte. O status aparece em português: Em andamento, Concluída, Com falha. Sem nenhuma execução registrada, a visão do vendedor não mostra a data de atualização.
- **RN-017 — Quem sincroniza.** A carga roda só pela rotina automática. Nenhuma tela e nenhum usuário dispara a carga (ver spec 008, Prospecção).
- **RN-018 — cancelada em 2026-11-03** (conferência de atribuição; ver Fora de escopo).
- **RN-019 — cancelada em 2026-11-03** (Painel de Validação; ver Fora de escopo).

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 / RN-004 | Semana 2: 1.200 contra 1.000 → +0,20, exibido "+20,0%"; cabeçalho "02/10 a 08/10" | regra de negócio + regra de tela |
| C-002 / RF-002 | Carteira com 40 clientes, 12 sem venda → 40 linhas, 12 zeradas com B/W e status "Sem base"; cards 40 e 28 | regra de negócio |
| C-003 / RN-004 / RN-005 | 0 contra 1.000 → −1,00, exibido "−100,0%", status Alerta; o filtro da 2ª sem inclui o cliente; anterior 0 → "Sem base" e fica fora do filtro | regra de negócio + regra de tela |
| C-004 / RN-003 | Venda de 2.000 em 10/10 e devolução de 300 em 12/10 → semana 3 = 1.700; devolução sem seção ignorada | regra de negócio |
| C-005 / RN-008 | Hoje 20/10, semana 4 contra semana 4 de set: 900×1.000 → −10,0% No padrão; 800×1.000 → −20,0% Fora do padrão; 1.300×1.000 → +30,0% Alerta; 500×0 → Sem base; card = 1 | regra de negócio |
| RN-008 (limites) | B/W −14,9% → No padrão; −15,0% e +25,0% → Fora do padrão; +25,1% → Alerta; −14,96% (exibido −15,0%) → Fora do padrão; linha "Equipe" com Ana 1.000 e Bruno 500 contra 1.000 → +50,0% Alerta | regra de negócio |
| C-018 / RN-007 | Out/2026 aberto em 05/11: fechamento 4.000×5.000 → −20,0% Fora do padrão, mesmo com a 6ª sem "Sem base"; out/2026 aberto em 20/10 → status pela semana 4 | regra de negócio |
| C-019 / RN-013 (linhas repetidas) | Pedido 5001, P1, Filial 1 em duas linhas (3 un/300 e 2 un/200) → um item com 5 un e 500; célula da semana = 500 | regra de negócio |
| RN-006 | Compras de 3.000 e 1.000 em 2 semanas dos 3 meses, no escopo da linha → valor médio 2.000; compra de 5.000 em outra BU não entra; sem compra → 0 | regra de negócio |
| C-007 / RN-001 | Férias de 01/10 a 15/10: venda de 05/10 conta para Bruno, a de 20/10 não | regra de negócio |
| C-008 / RN-002 | Venda de 900 que conta para Ana e Bruno → linha da equipe = 900 | regra de negócio |
| RN-002 (escopo duplo) | Escopos F1·Nutrição sem seção e F1·Nutrição seção 2; venda de 500 na seção 2 → 500 | regra de negócio |
| C-009 / RN-011 | P1 10 contra 6 → +4, Comprou a mais; P2 0 contra 4 → −4, Deixou de comprar e vem primeiro; cabeçalho 2 pedidos e R$ 2.000 = célula | regra de negócio |
| C-010 / RN-012 | Planilha: 40 linhas + TOTAL; célula de valor numérica 1200 com formato de moeda; B/W −1 com formato 0,0%; "Sem base" vazio; aba Produtos sem semanas zeradas | regra de tela |
| C-012 | Fonte com 10.000 itens e 50 sem cliente → válidos 9.950, erros 50, status Concluída; a visão do vendedor mostra a data da execução | regra de negócio |
| C-013 / RN-016 | Execução em andamento iniciada 10:00: pedido às 10:10 é recusado; às 10:31 a de 10:00 vira falha com a mensagem padrão e a nova começa | regra de negócio |
| C-014 / RN-015 | Duas cargas: 48 erros com 2 ocorrências e abertos, 2 resolvidos; resolvido há 8 dias é apagado, há 6 dias fica | regra de negócio |
| RN-009 | Curva cadastrada B → B; sem curva e valor médio 15.000 → A; 6.999,99 → C | regra de negócio |
| RF-011 (devoluções) | A rotina de devoluções está agendada de hora em hora; devolução incluída na fonte é deduzida da matriz na execução seguinte | regra de negócio |
| RN-010 | Ana 1.000 e Bruno 500 no mesmo cliente, semana 2; anteriores 1.000 e 0 → linha "Equipe" 1.500 e B/W +50,0% | regra de negócio |
| RN-013 | Item sem data e sem cliente → um erro só, de data inválida; qt 0, total 100 e unitário 25 → qt 4; qt 0, total 100 e sem unitário → qt 1 | regra de negócio |
| RN-014 | Pedido ausente na segunda carga → inativo e fora do total; o contador de inativados é 1, não o total de itens anteriores | regra de negócio |
| RN-017 | Pedido manual de carga é recusado para qualquer papel, inclusive GESTOR e ADMIN | regra de negócio |

Verificação manual:
- [ ] Matriz com 6 semanas legível em 360 px, com a coluna Cliente fixa na rolagem lateral (RNFT-003)
- [ ] Cores de B/W e de status em tema escuro (RNFT-004)
- [ ] Planilha aberta no Excel: soma e filtro funcionam nas colunas de valor e de B/W

## Correções em relação ao sistema atual

| Hoje | Na reconstrução | Origem |
|---|---|---|
| Substituto de férias não herda a carteira do titular na matriz (o ramo do substituto nunca é alcançado) | Herda, só com férias ativas na data da venda (RN-001, RNT-007/010) | pendências, item 12; manual seção 8, FAQ |
| O detalhe do cliente usa um vínculo de substituto permanente, sem datas | Só férias ativas do cadastro único (RNT-010) | anexo, A-02 |
| Queda de 100% aparece como "Sem base" e some do filtro `Abaixo da expectativa` | −100,0% e entra no filtro (RN-004/005) | anexo, A-03 |
| A visão do vendedor mostra o status pela faixa de B/W do fechamento e o card "Clientes em alerta" conta o status de recorrência; a visão de gestão mostra a recorrência | Um status só, pela faixa de B/W, na visão do vendedor e no card; o status por recorrência deixa de existir (RN-008) | manual seção 8; anexo, A-04 |
| O status usa sempre a semana de hoje, mesmo em mês passado | Mês corrente pela semana de hoje; mês encerrado pelo mês inteiro (RN-007) | anexo, A-05 |
| O valor médio usado na curva considera compras do cliente em todas as BUs | Só no escopo da linha (RN-006) | anexo, A-06 |
| Linha repetida do mesmo produto no mesmo pedido e filial sobrescreve a anterior na carga | Somadas num item só (RN-013) | anexo, A-16 |
| Devoluções do ERP carregadas uma vez por dia, às 4h30, embora o manual diga de hora em hora | De hora em hora (RF-011) | manual seção 8; anexo, A-17 |
| A curva da matriz vem só do valor médio (A/B/C) e diverge da curva da carteira | Curva da carteira; o valor médio só na falta dela (RN-009) | anexo, A-07 |
| Venda que casa com dois escopos do vendedor pode ser somada duas vezes | Conta uma vez (RN-002) | anexo, A-08 |
| O valor da semana no detalhe pode divergir da célula; a Sazonalidade ignora o mês aberto | Mesmo valor; 12 meses até o mês aberto (RN-011) | anexo, A-10 |
| A planilha chama de "B/W QTD" (em %) uma diferença em unidades | Coluna "Diferença QTD" em unidades (RN-012) | anexo, A-11 |
| A exportação faz uma consulta por cliente × semana (centenas por clique) | No máximo 3 consultas (RF-007, RNFT-002) | anexo, A-11 |
| O contador "inativados" registra todos os itens anteriores, não os inativados | Só os inativados na execução (RN-014) | anexo, A-12 |
| Duas cargas podem rodar ao mesmo tempo | Uma por vez (RN-016) | anexo, A-12 |
| Status da carga em inglês e mensagens sem acento ("Sincronizacao concluida") | Português (RN-016, RNFT-007) | anexo, A-15 |
| A tela de Prospecção dispara a carga do ERP para qualquer usuário | Só a rotina automática (RN-017) | manual seção 8, "Sincronização das vendas" |
| Visão global liberada também pelo mesmo e-mail | Só por papel (RNT-002) | anexo, A-01 |
| Erros de ingestão regravados a cada execução (~95 milhões de registros) | Registro único com contador e retenção (RN-015) | `tasks.md` da raiz |
| A visão do vendedor não mostra quando as vendas foram atualizadas | Mostra (RF-010, RNT-015) | 000, RF-006 |

## Fora de escopo

- [ ] Esvaziar o registro antigo de erros de ingestão, que não recebe gravação desde 05/10/2026: é limpeza de dado histórico (000).
- [ ] Mudar a consulta do ERP que alimenta a carga ou a rotina de devoluções: elas continuam iguais por fora; só a frequência das devoluções passa a de hora em hora (RF-011).
- [ ] Status por recorrência de compra (frequência, semana padrão) e o status "Sem perfil": descartados em 2026-10-30; o status é só pela faixa de B/W (RN-008).
- [ ] Alertas inteligentes (spec 008); o alerta de queda de volume foi descartado em 2026-10-30.
- [ ] A visão `Mensal` da tela Comparativo e o resto do Analytics (spec 007).
- [ ] Meta semanal de faturamento: a matriz não mostra meta.
- [ ] Editar ou corrigir itens de venda pela tela: a correção é sempre no ERP.
- [ ] Tela Acomp. Semanal Admin (conferência de atribuição por vendedor e mês: RF-014, RN-018, C-015): cancelada em 2026-11-03, não é reconstruída.
- [ ] Visão de gestão (Acomp. Semanal) e Painel de Validação (C-006, C-011, C-016, C-017, RF-008, RF-009, RF-015, RF-016, RN-019): cancelados em 2026-11-03, não são reconstruídos. Coordenação e diretoria acompanham a equipe pela visão do vendedor com o filtro de escopo (RN-010), e a carga do ERP passa a ser só automática (RN-017).

## Pendências

- [x] Decidido em 2026-10-30: o status é só pela faixa de B/W nas duas visões (|B/W| < 15% No padrão, 15–25% Fora do padrão, > 25% Alerta, "Sem base" com mês anterior zero); somem o status por recorrência e o "Sem perfil".
- [x] Decidido em 2026-10-30: em mês encerrado o status olha o mês inteiro (B/W do fechamento).
- [x] Decidido em 2026-10-30: linhas repetidas do mesmo produto no mesmo pedido e filial são somadas, não sobrescritas.
- [x] Decidido em 2026-10-30: as devoluções do ERP chegam de hora em hora.
- [x] Decidido em 2026-10-30: negativo, igual em todas as telas (mesma decisão da spec 007).

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente fora do anexo
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-003, C-013)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto

---

## Anexo — Rastreabilidade de origem

**Rotas atuais cobertas:** `/acomp-semanal-vendedor` (visão do vendedor, sem filtro de escopo), `/comparativo` visão `Semanal` (a mesma visão, com filtro de escopo; a página é da spec 007), `/acomp-semanal` (gestão), `/painel-validacao` e `/admin-acomp-semanal` foram cancelados em 2026-11-03 e não são reconstruídos. A aba Semanal citada no manual não existe mais no `/analytics`.

**Páginas atuais:** `frontend/src/pages/AcompanhamentoSemanalVendedorPage.tsx`, `AcompanhamentoSemanalPage.tsx`, `AdminAcompanhamentoSemanalPage.tsx`, `PainelValidacaoPage.tsx`, `ComparativoPage.tsx` (embute a visão do vendedor); `components/DetalheClienteInline.tsx`; `lib/excel-export.ts`, `lib/operational-week.ts`; menu em `components/Layout.tsx:78,137-139`.

| RF / RN | SF atual (alias · id) | Tabelas |
|---|---|---|
| RF-001..005, RN-001..010 | `calcularBwSemanal` · 104 (versão vigente: `backend/migrations/update-sf-calcular-bw-semanal-1792676688.sql`; snapshot `backend/sf-versions/20260821151600/sf-104-*.sql`) | `PEDIDOS_SEMANAIS_SYNC_RAW`, `IMP_DEVOLUCOES_TOTVS`, `EQUIPE_CLIENTE`, `BU_VENDEDOR`, `COORDENADORES`, `COORDENADORES_BU`, `USUARIO_CARGO`, `FUNCIONARIOS`, `CLIENTES`, `IMP_CLIENTES_TOTVS`, `INT_USER` |
| RN-006 (perfil persistido) | `calcularPerfilCliente` · 103 — **sem uso em tela; aposentar** (o status por recorrência foi descartado em 2026-10-30). A 104 deixa de calcular frequência e semana padrão; a gravação do perfil pela 107 só fica enquanto a prospecção (spec 008, SF 115) o ler | `PERFIL_COMPRA_CLIENTE` |
| RF-006, RN-011 | `clienteDetalheVendasSemanais` · 109, `clienteDetalheItensSemana` · 110 (regra de movimento em `backend/update-sf110-comparativo-semanal.mjs` / `update-realizado-secao-sfs.mjs`), `clienteDetalheResumoPedidosSemana` · 111, `sazonalidadeClienteProdutos` · 129 (`migrations/update-sf-sazonalidadeclienteprodutos-1792595107.sql`) | `PEDIDOS_SEMANAIS_SYNC_RAW`, `IMP_DEVOLUCOES_TOTVS`, `FERIAS_VENDEDOR`, `VENDEDOR_RCA` |
| RF-007, RN-012 | 104 + 110 chamada por cliente × semana em `AcompanhamentoSemanalVendedorPage.tsx:567-712` | — |
| RF-010, RN-016 | `acompanhamentoSemanalStatusSync` · 106 | `ACOMP_SEMANAL_SYNC_LOG` |
| RF-011..013, RN-013..017 | `acompanhamentoSemanalSincronizarManual` · 107 (`backend/acompanhamento-semanal-sincronizar-manual-escopo.sf.js`; snapshots `sf-versions/20261005120000` e `20261005130000`; data loader `VENDAS_DASHBOARD_TOTVS_RCA`, staging `IMP_VENDAS_DASHBOARD_TOTVS_RCA`) | `PEDIDOS_SEMANAIS_SYNC_RAW`, `PEDIDOS_SEMANAIS_SYNC`, `PERFIL_COMPRA_CLIENTE`, `ACOMP_SEMANAL_SYNC_LOG`, `ACOMP_SEMANAL_SYNC_ERRO_ATUAL` (`ACOMP_SEMANAL_SYNC_ERRO` desativada, não ler); `CLIENTES`, `BU`, `SECAO` |
| RF-014, RN-018 (cancelados) | **aposentar sem substituto:** `adminAcompSemanalListar` · 146 (`sf-versions/20260821151600/sf-146-*.sql`). A lista de vendedores `adminListarVendedores` · 145 também serve telas da spec 010; aposentar só quando a 010 deixar de usá-la | `PEDIDOS_SEMANAIS_SYNC_RAW`, `BU_VENDEDOR`, `EQUIPE_CLIENTE` |
| RF-015, RN-019 (cancelados) | **aposentar sem substituto:** `validacaoFiltros` · 147, `validacaoResumo` · 148, `validacaoDetalhe` · 149 (SQL dessas três **não está no repositório**; conferir no projeto remoto), `validacaoDevolucoesResumo` · 150, `validacaoDevolucoesDetalhe` · 151 (`backend/add-painel-validacao-devolucoes.mjs`) | `PEDIDOS_SEMANAIS_SYNC_RAW`, `IMP_DEVOLUCOES_TOTVS`, `BU_VENDEDOR`, `RCA_TOTVS` |
| RF-016 (cancelado) | `painelGestaoPermissao` · 29 (gestão; o destino é decidido na spec 010); telas técnicas por e-mail fixo em `Layout.tsx:78`, `AdminAcompanhamentoSemanalPage.tsx:7`, `PainelValidacaoPage.tsx` (checkAccess) e no SQL das SFs 146, 150, 151 | `USUARIO_CARGO` |
| Compartilhadas (outras specs) | `dadosUsuarioLogado` · 28, `painelGestaoVendedores` · 30, `listarRamosClientesTotvs` · 142, `painelCoordenadorMetasBuRecebidas` · 195 (usada só para montar as opções de Filial/Departamento da visão de gestão; a reconstrução usa o escopo do usuário) | — |
| Relacionada | `alertasAusenciaPedido` · 105 — coberta pela spec 008 (sem uso em tela) | — |

**Origem técnica das correções (A-nn):**
- A-01 — CTE `IS_DIRETORIA` e `GLOBAL_SCOPE_USERS` da SF 104 aceitam `ti@benenutri.com`.
- A-02 — SFs 109/129: `FUNCIONARIOS.ID_SUBSTITUTO = :VAR_USER` sem datas; férias por `CURRENT_DATE` e não pela data da venda.
- A-03 — SF 104 devolve −1 como sentinela de "sem base" e também como B/W real de −100%; `formatBw`/`linhasTabela` na página tratam −1 como "Sem base".
- A-04 — `AcompanhamentoSemanalVendedorPage.tsx:138-149` (status pela faixa de B/W) × `:540` (card conta `STATUS` da SF) × `AcompanhamentoSemanalPage.tsx` (mostra `STATUS`).
- A-05 — as duas páginas enviam `semanaNumero = getOperationalWeekNumber()` (semana de hoje) para qualquer mês.
- A-06 — CTE `PERFIL_COMPRA_CLIENTE_OPERACIONAL` agrupa só por cliente, sem escopo; sem compra → `No padrao`.
- A-07 — SF 104: `CURVA` por `TICKET_MEDIO_3M` (15.000 / 7.000), sem ler `EQUIPE_CLIENTE.CURVA_CLASSIFICACAO`.
- A-08 — `VENDEDOR_ESCOPO` com `DISTINCT` por seção; o join de `BASE_ATUAL` casa a venda com o vínculo sem seção e com o da seção. A SF 146 já tem a regra "seção específica vence".
- A-09 — `AcompanhamentoSemanalPage.tsx` envia `codFilial`/`codepto`, mas a SF 104 lê `scopeCodFilial`/`scopeCodepto`; em TEAM/GLOBAL a SF devolve `VENDEDOR_ID = 0` ("Coordenador").
- A-10 — `AcompanhamentoSemanalPage.tsx` não passa `anoFiltrado` ao detalhe; `clienteExpandidoId` é por cliente; as colunas de sazonalidade são os 12 meses até hoje (`DetalheClienteInline.tsx`).
- A-11 — exportação: `DELTA_QTD_SEMANA` é diferença absoluta, exportada como `percent`; laço `for` por linha × semana chamando a SF 110.
- A-12 — SF 107: `staleRawBefore`/`staleAggBefore` contados antes da carga; não há trava contra execuções simultâneas.
- A-13 — (tela cancelada) `AdminAcompanhamentoSemanalPage.tsx`: `totalAtribuido = total`; `ano` inicial `'2026'`; sem paginação.
- A-14 — SFs 150/151: `BU_SCOPE` usa `MIN(TARGET_USER_ID)`; ano padrão 2026 no SQL e em `PainelValidacaoPage.tsx`.
- A-15 — `AcompanhamentoSemanalPage.tsx`: `Status: {syncStatus.STATUS}` (SUCCESS/FAILED/RUNNING) e toasts "Sincronizacao concluida. Validos: …".
- A-16 — SF 107: o item é gravado pela chave pedido + produto + filial em `PEDIDOS_SEMANAIS_SYNC_RAW`; a segunda linha do ERP com a mesma chave sobrescreve a primeira (conferir no SQL da 107).
- A-17 — rotina de carga de `IMP_DEVOLUCOES_TOTVS` agendada uma vez por dia às 4h30 (conferir o agendamento no projeto remoto).
