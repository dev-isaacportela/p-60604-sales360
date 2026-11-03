# Spec: Dashboard (tela inicial)

**ID:** 005-dashboard · **Status:** em revisão · **Data:** 2026-10-30

> Spec de **reconstrução**: descreve o Dashboard que está em produção, já com os
> defeitos conhecidos corrigidos. Regras transversais são citadas pelo id
> (`RNT-00N`, `RNFT-00N`) da spec 000. Proibido citar stack, tabela ou
> componente fora do anexo **Rastreabilidade de origem**.

## Problema

O Dashboard é a primeira tela de todo usuário e a que ele mais consulta. Hoje ele mostra números
que não batem com o resto do sistema: no "Meu painel" a meta mensal compara a meta com o faturamento
**bruto**, enquanto no "Time inteiro" compara com o líquido; o selo "No ritmo" segue uma regra em um
modo e outra regra no outro; o percentual trava em 100% e esconde quem passou da meta; a meta semanal
de visitas é um número fixo que só a TI muda; e deslocamentos nunca contam como realizados. Quem
abre o dia por aqui toma decisão em cima de número errado.

## Resultado esperado

Ao abrir o sistema, a pessoa vê em uma tela, com os mesmos números das outras telas, como está a
semana de visitas, o mês de faturamento, as vendas dos últimos dias e o que precisa de ação hoje.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| Vendedor | Ver compromissos de hoje, meta semanal de visitas, meta mensal, vendas diárias, alertas e pendências de relato | diária, no início do dia |
| Coordenador | Ver os mesmos indicadores da equipe ou de um vendedor (RNT-003/004) | diária |
| Diretoria | Ver os indicadores de todos os coordenadores ou de um deles | semanal |

## Cenários

**C-001 — Saudação**
- **Dado que** são 08:30 em Brasília e Ana não preencheu `Nome de exibição`; o e-mail dela é ana.souza@benenutri.com
- **Quando** abre o Dashboard
- **Então** vê `Bom dia, Ana Souza.`; às 12:00 seria `Boa tarde, ...` e às 18:00 `Boa noite, ...`

**C-002 — Compromissos de hoje**
- **Dado que** Ana tem hoje 3 visitas (1 cancelada), 1 visita de prospecção e 1 reunião interna
- **Quando** abre o Dashboard e clica na frase
- **Então** vê `Você tem 4 compromissos para hoje.`; a janela `Compromissos de hoje` lista os 4 com horário, tipo, cliente ou título e status, e `Abrir agenda completa` abre a Agenda na visão Dia de hoje

**C-003 — Meta semanal de visitas do vendedor**
- **Dado que** na semana de 09/11 a 13/11/2026 Ana concluiu 10 visitas, 2 prospecções e 1 deslocamento, concluiu 1 reunião interna, tem 2 visitas Em andamento e concluiu 1 visita no sábado 14/11; a meta de vendedor é 16
- **Quando** abre o Dashboard em 13/11
- **Então** o card mostra `Realizadas: 13`, `Meta: 16`, `Restantes: 3` e 81% no círculo

**C-004 — Meta semanal composta do time**
- **Dado que** o filtro de Carlos em "Time inteiro" tem 3 vendedores e 1 coordenador, metas de 16 e 8
- **Quando** ele abre o Dashboard
- **Então** a meta é 56 (16 × 3 + 8), o texto diz `Meta composta do filtro atual: vendedores 16/semana e coordenadores 8/semana.` e o realizado soma as conclusões das 4 pessoas; um deslocamento concluído com 2 dessas pessoas conta 2

**C-005 — Meta mensal com projeção**
- **Dado que** hoje é sexta 20/11/2026 (15 dos 21 dias úteis de novembro já decorridos, contando hoje), a meta distribuída de Ana é R$ 100.000,00, o bruto do mês é R$ 70.000,00 e as devoluções R$ 5.000,00
- **Quando** abre o Dashboard
- **Então** o card mostra R$ 65.000,00, `65,0% de R$ 100.000,00`, projeção de fechamento R$ 91.000,00 (65.000 ÷ 15 × 21) e o selo `No ritmo`

**C-006 — Meta superada**
- **Dado que** a meta é R$ 50.000,00 e o líquido é R$ 60.000,00
- **Quando** abre o Dashboard
- **Então** o card mostra `120,0% de R$ 50.000,00`, o círculo cheio e o selo `Acima da meta`

**C-007 — Meta não distribuída (borda)**
- **Dado que** o coordenador não distribuiu meta para Ana em novembro e existe um valor antigo no cadastro legado de metas
- **Quando** Ana abre o Dashboard
- **Então** o card mostra o líquido do mês, `Meta não distribuída` no lugar do percentual e do selo, e o valor legado não aparece

**C-008 — Vendas líquidas diárias**
- **Dado que** hoje é quinta 12/11/2026 e os líquidos foram: 04/11 R$ 3.000, 05/11 R$ 0, 06/11 R$ 2.000, 09/11 R$ 5.000, 10/11 R$ 4.000, 11/11 R$ 8.000, 12/11 R$ 6.000
- **Quando** abre o Dashboard
- **Então** o gráfico tem 7 barras de 04/11 a 12/11 (sem sábados e domingos), o dia em destaque é 12/11 com R$ 6.000,00 e `-25,0% vs dia anterior`; ao tocar em 06/11 vê R$ 2.000,00 e `—` (dia anterior zerado)

**C-009 — Resumo da Semana**
- **Dado que** hoje é 11/11/2026 e Ana tem: visita de 10/11 concluída em 11/11; visita de 10/11 ainda Agendada; visita de 13/11 Agendada; visita de 09/11 cancelada; prospecção de 09/11 concluída
- **Quando** abre o Dashboard
- **Então** o bloco lista as 5, da mais recente para a mais antiga, com `Relato`: `Ok` (data do relato 11/11/2026), `Relato pendente`, `—`, `Cancelada` e `Ok`

**C-010 — Alertas não lidos**
- **Dado que** Ana tem 7 alertas não lidos de prioridade alta e 3 de prioridade média
- **Quando** abre o Dashboard
- **Então** vê 5 alertas de prioridade alta; clicar num deles abre esse alerta na tela de Alertas; sem nenhum, vê `Nenhum alerta de alta prioridade pendente.`

**C-011 — Bloco com falha não derruba a tela (erro)**
- **Dado que** a consulta das vendas diárias falha
- **Quando** Ana abre o Dashboard
- **Então** os outros blocos aparecem e o bloco de vendas mostra "Não foi possível carregar este bloco agora. Tente atualizar a tela." (C-007 da spec 000)

**C-012 — Frases no escopo de time**
- **Dado que** Carlos está em "Time inteiro" e o time tem 9 compromissos hoje; depois escolhe "Vendedor específico: Ana", que tem 4
- **Quando** olha a frase de compromissos
- **Então** lê `O time tem 9 compromissos para hoje.` e depois `Ana tem 4 compromissos para hoje.`

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE aplicar o filtro de escopo (RNT-003/004) a todos os blocos | Os números de cada bloco mudam juntos ao trocar o escopo; vendedor com um escopo não vê o filtro | must |
| RF-002 | O sistema DEVE mostrar a saudação (RN-001) e a frase de compromissos de hoje com a janela de detalhes (RN-002) | C-001, C-002, C-012 | must |
| RF-003 | O sistema DEVE mostrar o card `Meta semanal de visitas` com `Realizadas`, `Meta`, `Restantes` e círculo de progresso (RN-003 a RN-005) | C-003, C-004 | must |
| RF-004 | O sistema DEVE permitir configurar a meta semanal de visitas por perfil, sem mudar o sistema | Alterar a meta de vendedor de 16 para 14 faz o card mostrar 14 a partir da semana seguinte; semanas anteriores mantêm 16 | must |
| RF-005 | O sistema DEVE mostrar o card `Meta mensal de faturamento` com realizado líquido, percentual, meta, projeção de fechamento e selo (RN-006 a RN-008) | C-005, C-006, C-007 | must |
| RF-006 | O sistema DEVE mostrar `Vendas líquidas diárias` dos últimos 7 dias úteis, com variação contra o dia útil anterior e a linha do mês (RN-009) | C-008 | must |
| RF-007 | O sistema DEVE mostrar `Alertas não lidos` (RN-010) com `Ver todos` levando à tela de Alertas | C-010 | must |
| RF-008 | O sistema DEVE mostrar `Últimas Atividades` (RN-011) com `Ver histórico completo` (Atividades) e `Abrir agenda do dia` (Agenda, visão Dia, hoje) | Com 5 atividades pendentes aparecem 3; vazio mostra `Nenhuma atividade recente.` | must |
| RF-009 | O sistema DEVE mostrar `Resumo da Semana` (RN-012) com `Ver agenda completa` | C-009 | must |
| RF-010 | O sistema DEVE mostrar a data da última atualização das vendas (RNT-015) | Texto "Vendas atualizadas em dd/mm/aaaa hh:mm" junto ao card mensal e ao gráfico | should |
| RF-011 | O sistema DEVE isolar a falha de cada bloco (RF-005 e C-007 da spec 000) | C-011 | must |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | O Dashboard abre com todos os blocos em até 3 s para um vendedor e 5 s para "Todos os coordenadores" | Cronômetro com a base de produção |
| RNF-002 | A carga faz no máximo 10 consultas e não repete consultas ao trocar só o dia selecionado no gráfico (RNFT-002) | Contagem de consultas no simulador |
| RNF-003 | Legível e operável em 360 px: no celular o gráfico mostra `Últimos 7 dias úteis` e `Toque em uma barra` (RNFT-003) | Verificação manual |

## Entidades do domínio

- **Meta semanal de visitas** — número de conclusões esperadas por semana para cada perfil (vendedor, coordenador), com data de início de vigência.
- **Meta mensal do vendedor** — soma do que o coordenador distribuiu ao vendedor no mês (RNT-009).
- **Faturamento líquido** — RNT-007 + RNT-008.
- **Compromisso** — visita, prospecção, compromisso interno ou deslocamento (spec 003).
- **Alerta** e **Atividade** — specs 008 e 004.

## Regras de negócio

- **RN-001 — Saudação.** Pela hora de Brasília: antes das 12:00 `Bom dia`, antes das 18:00 `Boa tarde`, senão `Boa noite`. Nome: `Nome de exibição`; vazio ou com "@", a parte do e-mail antes do "@" com ".", "_" e "-" virando espaço e cada palavra com inicial maiúscula; sem e-mail, `você`.
- **RN-002 — Compromissos de hoje.** Conta visitas, prospecções, compromissos internos e deslocamentos de hoje (Brasília) das pessoas do escopo, exceto cancelados. Frase: Meu painel `Você tem N compromisso(s) para hoje.` / `Você não tem nenhum compromisso para hoje.`; Time inteiro e visão de coordenadores `O time tem N ...`; Vendedor específico `<Nome> tem N ...`. A janela lista horário, tipo, cliente/título, vendedor ou convidados e status.
- **RN-003 — Janela da meta semanal.** Segunda a sexta da semana calendário atual (RNT-006), em Brasília. O card informa "segunda a sexta".
- **RN-004 — O que conta como realizado.** Itens Concluídos com data agendada em dia útil da janela: visita a cliente (concluída por check-out com relato), visita de prospecção e deslocamento (spec 003, RN-011). Não contam: reunião interna e "Outros", itens Agendados, Em andamento ou Cancelados, fins de semana. Item com mais de uma pessoa do filtro (deslocamento com participantes, visita criada para vários vendedores) conta uma vez para cada pessoa.
- **RN-005 — Meta semanal.** Por pessoa: a meta configurada do perfil dela (hoje 16 para vendedor e 8 para coordenador). Meu painel e Vendedor específico: a meta da pessoa. Time inteiro e visões de coordenadores: a soma pessoa a pessoa do filtro aberto, com o texto `Meta composta do filtro atual: vendedores X/semana e coordenadores Y/semana.`. Filtro sem pessoas: meta 0, `Nenhuma pessoa no filtro atual.` e círculo vazio. `Restantes` = máximo(0, meta − realizadas); percentual = realizadas ÷ meta, arredondado, com círculo limitado a 100%.
- **RN-006 — Meta mensal.** Realizado = faturamento líquido do mês corrente (Brasília) no escopo (RNT-007/008). Meta = soma das metas distribuídas às pessoas do escopo, recortada por filial e departamento quando o filtro os define (RNT-009). Sem distribuição: `Meta não distribuída` (C-007). Percentual = realizado ÷ meta com uma casa, sem teto; só o círculo é limitado a 100%.
- **RN-007 — Projeção de fechamento.** Em dias úteis (RNT-016: segunda a sexta, sem descontar feriados): projeção = realizado ÷ dias úteis do mês decorridos até hoje (inclusive, se hoje for dia útil) × total de dias úteis do mês. Sem dia útil decorrido (mês que começa no fim de semana, consultado nesse fim de semana), projeção = realizado. Em mês passado, projeção = realizado.
- **RN-008 — Selo.** Mesma regra em todos os escopos, sempre pela projeção da RN-007 (nunca pelo percentual já atingido): projeção ≥ meta → `Acima da meta`; projeção ≥ 90% da meta → `No ritmo`; abaixo → `Abaixo da meta`. Sem meta, sem selo.
- **RN-009 — Vendas diárias.** Últimos 7 dias úteis (segunda a sexta) até hoje em Brasília, líquidos de cada dia no escopo, podendo atravessar a virada do mês. Variação = (dia − dia útil anterior) ÷ dia útil anterior, uma casa, com sinal; `—` quando o anterior é zero, negativo ou não existe; `0,0%` quando os dois são zero. Dia em destaque: o último; tocar numa barra seleciona, tocar de novo desmarca. Linha abaixo do valor: `Bruto R$ X − devoluções R$ Y no mês = líquido R$ Z` (RNT-008), com Z igual ao realizado do card mensal.
- **RN-010 — Alertas.** Até 5 alertas não lidos de prioridade alta do escopo, mais recentes primeiro (regras de alerta: spec 008).
- **RN-011 — Últimas Atividades.** As 3 atividades pendentes do escopo com prazo mais próximo, vencidas primeiro; sem prazo vêm por último. Descrição vazia mostra "Atividade registrada na agenda comercial.".
- **RN-012 — Resumo da Semana.** Visitas e prospecções da semana calendário atual (segunda a domingo) do escopo, da mais recente para a mais antiga, até 12 itens no total. Colunas `Data da visita`, `Data do relato`, `Cliente`, `Status da visita`, `Relato`. Relato: `Ok` se Concluída (data do relato = data do check-out); `Relato pendente` se Agendada ou Em andamento com data até hoje; `—` se data futura; `Cancelada` se cancelada. Vazio: `Nenhuma visita registrada nesta semana.`

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | 08:30 e e-mail ana.souza@… sem nome → `Bom dia, Ana Souza.` | regra de tela |
| C-002 | 3 visitas (1 cancelada) + 1 prospecção + 1 interna hoje → contagem 4 | regra de negócio |
| C-003 | Conjunto do cenário → realizadas 13, meta 16, restantes 3, 81% | regra de negócio |
| C-004 | 3 vendedores + 1 coordenador → meta 56; deslocamento concluído com 2 pessoas do filtro soma 2 | regra de negócio |
| C-005 | Meta 100.000, bruto 70.000, devolução 5.000, hoje 20/11/2026 (15 de 21 dias úteis) → realizado 65.000; 65,0%; projeção 91.000; `No ritmo` | regra de negócio |
| C-006 | Meta 50.000, líquido 60.000 → "120,0%", círculo 100%, `Acima da meta` | regra de tela |
| C-007 | Sem distribuição e com valor legado de R$ 80.000 → meta devolvida vazia e tela `Meta não distribuída` | regra de negócio |
| C-008 | Série do cenário → 7 dias de 04/11 a 12/11; 12/11 = -25,0%; 06/11 = `—` | regra de negócio |
| C-009 | Cinco visitas do cenário → relatos `Ok`/11/11/2026, `Relato pendente`, `—`, `Cancelada`, `Ok` | regra de negócio |
| C-010 | 7 alertas altos + 3 médios não lidos → 5 itens, todos de prioridade alta | regra de negócio |
| C-011 | Falha forçada no bloco de vendas → demais blocos com dados e mensagem padrão no bloco | regra de tela |
| C-012 | Escopo time com 9 → `O time tem 9 compromissos para hoje.`; Vendedor específico Ana com 4 → `Ana tem 4 compromissos para hoje.` | regra de tela |
| RN-001 | 11:59 → `Bom dia`; 12:00 → `Boa tarde`; 18:00 → `Boa noite`; sem nome e sem e-mail → `você` | regra de tela |
| RN-002 | Compromisso de hoje às 23:30 de Brasília (02:30 do dia seguinte em UTC) conta em hoje | regra de negócio |
| RN-003 | Visita concluída no domingo 15/11 não entra na semana de 09–13/11 nem na de 16–20/11 | regra de negócio |
| RN-004 | Visita Em andamento e reunião interna concluída não somam; prospecção concluída soma 1 | regra de negócio |
| RN-005 | Meta configurada 14 a partir de 16/11: semana de 09/11 mostra 16, semana de 16/11 mostra 14; filtro vazio → meta 0 e mensagem | regra de negócio |
| RN-006 | Filtro filial 1 · departamento 9: meta soma só as distribuições dessa BU | regra de negócio |
| RN-007 | Mês de outubro consultado em novembro: projeção = realizado; sábado 21/11/2026 → 15 dias úteis decorridos (o feriado de 20/11 conta como dia útil); sábado 01/08/2026 → sem dia útil decorrido, projeção = realizado | regra de negócio |
| RN-008 | Meta 100.000: projeção 100.000 → `Acima da meta`; 90.000 → `No ritmo`; 89.999 → `Abaixo da meta`; Meu painel e Time inteiro dão o mesmo selo para os mesmos números; realizado 85.000 (85%) com projeção 88.000 → `Abaixo da meta` | regra de negócio |
| RN-009 | Anterior 0 e atual 0 → `0,0%`; anterior −200 → `—`; hoje sábado 14/11 → última barra 13/11; Z da linha = realizado do card | regra de tela |
| RN-010 | Alerta não lido de prioridade alta de outra BU do vendedor fora do escopo aberto não aparece | regra de negócio |
| RN-011 | Atividades pendentes com prazo 20/11, 10/11 (vencida) e sem prazo, e uma concluída → ordem 10/11, 20/11, sem prazo; concluída fora | regra de negócio |
| RN-012 | 15 itens na semana → 12 exibidos; visita Em andamento de ontem → `Relato pendente` | regra de negócio |

Verificação manual:
- [ ] RNF-003 — Dashboard inteiro em 360 px, gráfico com 7 barras tocáveis
- [ ] RNFT-004 — selos e círculos legíveis em tema escuro
- [ ] RF-008 — `Abrir agenda do dia` abre a Agenda na visão Dia de hoje

## Fora de escopo

- [ ] Personalizar quais blocos aparecem ou a ordem deles.
- [ ] Gráficos históricos além dos 7 dias úteis (ficam no Analytics, spec 007).
- [ ] Marcar alerta como lido ou concluir atividade direto no Dashboard (specs 008 e 004).
- [ ] Contadores do menu lateral de atividades e alertas (spec 001).
- [ ] Metas de visitas por pessoa (individual); a meta é por perfil.
- [ ] Ranking entre vendedores.
- [ ] `Visitas concluídas no mês` e `Clientes na carteira`: descartados em 2026-10-30; não são exibidos nem calculados.
- [ ] Dica Pro e bloco de queda de volume: descartados em 2026-10-30 (spec 008); não aparecem no Dashboard nem em outra tela.

## Pendências

- [x] Decidido em 2026-10-30: a diretoria configura um valor por perfil; a mudança vale a partir da semana seguinte.
- [x] Decidido em 2026-10-30: o selo da meta mensal segue a projeção de fechamento em dias úteis, segunda a sexta sem descontar feriados (≥ meta = Acima; ≥ 90% = No ritmo; abaixo = Abaixo) (RN-007, RN-008).
- [x] Decidido em 2026-10-30: "Visitas concluídas no mês" e "Clientes na carteira" são descartados (não exibidos nem calculados).
- [x] Decidido em 2026-10-30: "Últimas Atividades" mostra as 3 pendentes com prazo mais próximo (RN-011).
- [x] Decidido em 2026-10-30: Dica Pro e bloco de queda de volume foram descartados (spec 008) e não aparecem no Dashboard.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente fora do anexo
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-007, C-011)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto

## Correções em relação ao sistema atual

| Hoje | Na reconstrução | Origem |
|---|---|---|
| Meta semanal de visitas fixa no código (16 e 8) | Configurável por perfil, com vigência (RF-004, RN-005) | `DashboardPage.tsx:50-51`; `AgendaPage.tsx:33-34`; `docs/regras-de-negocio.md` "Meta semanal de visitas" |
| Deslocamento nunca soma no realizado | Deslocamento concluído soma (RN-004; spec 003 RN-011) | `docs/regras-de-negocio.md` "Consequência conhecida"; manual seção 3 |
| Item com várias pessoas do filtro conta uma vez no time | Conta uma vez por pessoa (RN-004) | `DashboardPage.tsx:242-249` |
| No Meu painel o realizado da meta mensal é bruto | Líquido em todos os escopos (RNT-008, RN-006) | `migrations/update-sf-metarealizadoprojecao-1792678676.sql` (realizado sem devoluções) |
| Meta do vendedor sem distribuição cai no cadastro legado de metas | Zero e `Meta não distribuída` (RNT-009) | mesma migração, bloco de metas; `migrations/update-sf-dashboardkpis-1792594265.sql:255-261` |
| Selo por projeção no Meu painel e por percentual atingido no Time inteiro | Uma regra só, pela projeção (RN-008) |
| Projeção de fechamento por dias corridos do mês | Por dias úteis, segunda a sexta, sem descontar feriados (RN-007, RNT-016) | `migrations/update-sf-metarealizadoprojecao-1792678676.sql` (cálculo da projeção) | `DashboardPage.tsx:201-210`; `migrations/update-sf-metarealizadoprojecao-1792678676.sql` (cálculo do status) |
| Percentual travado em 100% | Percentual real; só o círculo limita (RN-006) | `DashboardPage.tsx:257` |
| Projeção de fechamento calculada e não exibida | Exibida no card (RF-005) | `DashboardPage.tsx:126,203-209` |
| Linha "Bruto − devoluções" cai no bruto de outra consulta quando a principal falha | Mesma base do card; falha mostra o bloco com erro (RN-009, RF-011) | `DashboardPage.tsx:168-176,426` |
| Compromissos de hoje ignoram prospecção e contam cancelados | Incluem prospecção e excluem cancelados (RN-002) | `migrations/update-sf-visitasdodia-1792676676.sql` |
| "Você tem N" mesmo no escopo de time | Frase do escopo (RN-002, C-012) | manual seção 3, bloco 2 |
| Resumo da Semana marca `Relato pendente` em visita futura e `Ok` em visita com motivo de reagendamento ou cancelamento; data do relato = data agendada | Regra da RN-012; data do relato = check-out | `backend/update-historico-timeline-resumo-semana.mjs:106-140` |
| Prospecções do resumo e da meta vêm sem recorte de escopo (até 500) e são filtradas na tela | Recorte no servidor (RNFT-005) | `DashboardPage.tsx:160,221-231` |
| Mês corrente e saudação pelo relógio do aparelho; janela das vendas diárias pela data do servidor | Tudo em Brasília (RNT-011) | `DashboardPage.tsx:140-143,336`; `migrations/update-sf-dashboardvendasdiarias-1792676690.sql:88` |
| `Abrir agenda do dia` abre a Agenda na visão Semana | Abre na visão Dia de hoje (RF-008) | `DashboardPage.tsx:551`; manual seção 3, bloco 7 |
| `Últimas Atividades` mostra as 3 primeiras da lista, de qualquer status | 3 pendentes com prazo mais próximo (RN-011) | `DashboardPage.tsx:334` |
| Visitas no mês e clientes ativos são carregados e não exibidos | Descartados: não são exibidos nem calculados | `DashboardPage.tsx:7-14` |
| Filtro sem pessoas mostra meta 1 | Meta 0 com mensagem (RN-005) | `DashboardPage.tsx:251` |

---

## Anexo — Rastreabilidade de origem

Rota atual coberta: `/`. Página: `frontend/src/pages/DashboardPage.tsx` (usa `CoordinatorScopeFilter`).
Tabelas: `VISITAS`, `PROSPECT_VISITAS`, `AGENDA_INTERNA`, `AGENDA_INTERNA_PARTICIPANTES`, `TAREFAS`, `ALERTAS_INTELIGENTES`, `PEDIDOS_SEMANAIS_SYNC_RAW`, devoluções do ERP, `EQUIPE_CLIENTE`, `BU_VENDEDOR`, `CLIENTE_TITULAR_DEPTO`, `METAS_BU_VENDEDOR`; legado que não deve ser lido: `METAS`, `METAS_VENDEDOR`. A meta semanal configurável não tem tabela hoje (exige acréscimo, conforme spec 000).

| RF / RN | SFs atuais (alias · id) |
|---|---|
| RF-002, RN-001 | `dadosUsuarioLogado` · 28 |
| RF-002, RN-002 | `visitasDoDia` · 20 |
| RF-003/004, RN-003 a RN-005 | `listarVisitasPeriodo` · 5; `prospectsVisitasListar` · 254 (cálculo feito na tela) |
| RF-005, RN-006 a RN-008 | `metaRealizadoProjecao` · 123 (Meu painel); `analyticsRcaMetaResumo` · 182 (demais escopos e bruto/devolução do mês) |
| RF-006, RN-009 | `dashboardVendasDiarias` · 214 |
| RF-007, RN-010 | `alertasInteligentesListar` · 131 |
| RF-008, RN-011 | `listarTarefas` · 11 |
| RF-009, RN-012 | `dashboardVisitasSemanaResumo` · 215 (também usada no Histórico de clientes); `prospectsVisitasListar` · 254 |
| RF-001 | `painelCoordenadorPermissao` · 153 (via filtro de escopo) |

Contadores do menu chamados pelo layout, não pela página (spec 001): `contarTarefasPendentes` · 12; `alertasInteligentesContarNaoLidos` · 134.
SFs sem uso em nenhuma tela (aposentar): `vendasMensais` · 2 (`visitasPorStatus` · 3 e `proximasVisitas` · 4 estão listadas na spec 003); `dashboardKpis` · 1 (vendas brutas, meta legada, visitas do mês e clientes ativos; os dois últimos indicadores foram descartados em 2026-10-30).

Fontes: `docs/modulos/dashboard.md`; `docs/regras-de-negocio.md#meta-semanal-de-visitas`; `docs/base-conhecimento-sales360.md` seções 3 e 15; `backend/update-historico-timeline-resumo-semana.mjs`; migrações `update-sf-metarealizadoprojecao-1792678676.sql`, `update-sf-analyticsrcametaresumo-1792678676.sql`, `update-sf-dashboardvendasdiarias-1792676690.sql`, `update-sf-dashboardkpis-1792594265.sql`, `update-sf-visitasdodia-1792676676.sql`.
