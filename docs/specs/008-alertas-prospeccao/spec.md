# Spec: Alertas inteligentes, direcionamento semanal e prospecção

**ID:** 008-alertas-prospeccao · **Status:** em revisão · **Data:** 2026-10-30

> Spec de **reconstrução**: descreve o comportamento atual já corrigido. Regras
> transversais são citadas pelo id (`RNT-00N`, `RNFT-00N`, spec 000). A agenda
> (criar, reagendar, check-in/out de visita de prospecção) é da spec 003; aqui
> ficam o pipeline do prospect e o que o resultado da visita grava nele.

## Problema

O histórico de compras está no sistema, mas o vendedor só age sobre ele se
alguém apontar o que fazer. Hoje os alertas aparecem com filtros que só olham
os 100 primeiros, a busca promete CNPJ e não acha, dois tipos de alerta existem
no filtro e nunca são gerados, o coordenador clica em "marcar como lido" e nada
acontece, e o pipeline de prospects não tem onde mudar etapa nem converter. A coordenação
também precisa ver, por executivo, quem não cumpriu a agenda e quais clientes
importantes deixaram de comprar.

## Resultado esperado

O vendedor abre Alertas e vê, por cliente, o que vender ou recuperar nesta
semana; o coordenador abre o Direcionamento e sabe quem cobrar; o prospect
caminha de "Novo" até "Convertido" com histórico de visitas.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| Vendedor | Ler e marcar alertas, ver a prospecção da semana, cadastrar e trabalhar prospects | diária |
| Coordenador | Ver alertas e prospecção da equipe, cobrar agenda e clientes críticos no Direcionamento, receber o relatório semanal | diária / semanal |
| Diretoria | Direcionamento de todos os coordenadores | semanal |
| Rotinas automáticas | Gerar alertas, enviar e-mails semanais | diária / semanal |

## Cenários

**C-001 — Lidos ficam ocultos por padrão**
- **Dado que** Ana tem 12 alertas no escopo, 8 não lidos e 4 lidos
- **Quando** abre `Alertas`
- **Então** vê 8 alertas, o cabeçalho mostra `8 alertas pendentes`; com Situação `Todos` vê 12 e com `Lidos` vê 4

**C-002 — Produto Perdido é gerado**
- **Dado que** o cliente X, na carteira de Ana na BU Filial 1 · Nutrição, comprou o produto P por R$ 900 em 03/2026, R$ 600 em 05/2026 e R$ 300 em 06/2026 e nada depois de 30/06/2026
- **Quando** a fila processa Ana em 30/10/2026
- **Então** nasce um alerta "Cliente parou de comprar P", prioridade Alta, valor R$ 600,00 (R$ 1.800 ÷ 3 meses com compra), na BU Filial 1 · Nutrição

**C-003 — Sem duplicar enquanto não lido; volta depois de lido**
- **Dado que** o alerta do C-002 está não lido
- **Quando** a fila roda de novo em 31/10
- **Então** nenhum alerta novo é criado; se Ana marcar como lido e a situação persistir, o processamento de 01/11 cria um novo

**C-004 — Marcar tudo respeita o recorte aberto**
- **Dado que** Ana tem escopos Filial 1 · Nutrição (5 não lidos) e Filial 1 · Medicamento (3 não lidos)
- **Quando** filtra o departamento Nutrição e clica `Marcar tudo como lido`
- **Então** vê "5 alertas marcados como lidos." e os 3 de Medicamento continuam não lidos

**C-005 — Coordenador não marca alerta do vendedor (erro)**
- **Dado que** Carlos, coordenador, está em "Time inteiro" com 20 alertas não lidos da equipe e nenhum dele
- **Quando** abre a lista
- **Então** os alertas de Ana não têm `Marcar como lido`, `Marcar tudo como lido` fica desabilitado com a dica "Só o vendedor dono do alerta pode marcá-lo como lido."; uma tentativa de marcar o alerta de Ana responde "Nada foi alterado: o alerta pertence a outro vendedor." e o alerta segue não lido

**C-006 — Filtros valem para todos os alertas, não só os carregados**
- **Dado que** Ana tem 340 alertas não lidos, 57 de Reposição, e o cliente "AÇAÍ LTDA" (CNPJ 12.345.678/0001-90) tem 4
- **Quando** filtra Tipo `Reposição`, e depois busca `12345678000190`
- **Então** a lista mostra total 57 (50 na primeira página) e depois total 4; o `R$ X potencial` soma os 4 alertas do filtro

**C-007 — Cliente que saiu da carteira some dos alertas**
- **Dado que** Ana tem 8 não lidos, 3 deles do cliente Y
- **Quando** o coordenador remove Y da carteira de Ana
- **Então** a lista e os contadores de Ana passam a 5

**C-008 — Contador do menu acompanha a ação**
- **Dado que** o menu `Alertas` de Ana mostra 7
- **Quando** ela marca 1 alerta como lido
- **Então** o contador mostra 6 na hora, sem esperar a atualização de 5 minutos

**C-009 — (removido em 2026-10-30: alerta de queda de volume descartado)**

**C-010 — Fila diária de geração**
- **Dado que** há 26 vendedores com BU ativa
- **Quando** a fila do dia é criada às 6h e processa 3 vendedores a cada 10 minutos
- **Então** às 7h20 os 26 estão processados; uma segunda criação no mesmo dia não acontece; se um vendedor falhar inteiro, ele é refeito cliente a cliente

**C-011 — E-mail semanal ao vendedor**
- **Dado que** entre 29/10 3h e 05/11 3h foram gerados 45 avisos para Ana e nenhum para Bruno
- **Quando** a rotina de quinta 05/11 às 3h roda (e roda de novo às 3h05 por reprocesso)
- **Então** Ana recebe um único "Resumo semanal de avisos comerciais" com 30 linhas ordenadas por prioridade e a nota "Mostrando os 30 avisos de maior prioridade. Acesse a tela de Alertas para ver todos."; Bruno não recebe nada

**C-012 — Relatório semanal ao coordenador**
- **Dado que** a equipe de Carlos faturou R$ 50.000 brutos com R$ 2.000 de devolução na semana operacional 1 de novembro (01/11 a 05/11/2026), e Ana tem meta de R$ 30.000 em novembro
- **Quando** a rotina de segunda 09/11 às 8h roda
- **Então** Carlos recebe "Relatório semanal de vendas - 01/11/2026 a 05/11/2026" com faturamento líquido R$ 48.000, ranking dos vendedores em líquido e meta proporcional de Ana de R$ 5.000,00 (R$ 30.000 ÷ 30 dias × 5 dias)

**C-013 — Prospecção da semana**
- **Dado que** o cliente K de Ana tem ciclo médio de 20 dias, está há 18 dias sem comprar e comprou 2 vezes nesta semana operacional do mês nos últimos 6 meses; o cliente L está há 100 dias sem comprar
- **Quando** Ana abre a aba `Prospecção`
- **Então** K aparece com tendência `Alta`; L aparece como `Cliente inativo`, visível em `Todos` e no filtro `Cliente inativo`

**C-014 — Prospecção com substituto e escopo**
- **Dado que** Bruno é substituto de Ana de 01/11 a 15/11 e Ana tem 40 clientes com histórico
- **Quando** Bruno abre a Prospecção em 05/11 e em 16/11
- **Então** em 05/11 vê os clientes de Ana junto com os dele; em 16/11 não vê mais

**C-015 — Criar prospect (validação)**
- **Dado que** Ana abre `Novo cliente prospecto`
- **Quando** salva sem razão social, e depois com "Clínica Nova", potencial `1.500,50` e contato "Maria"
- **Então** primeiro vê "Informe a razão social ou nome do cliente prospecto."; depois "Cliente prospecto criado. Ele já pode ser usado em visitas de prospecção na agenda.", etapa Novo, responsável Ana, potencial R$ 1.500,50, contato principal Maria

**C-016 — Etapa avança e não regride**
- **Dado que** o prospect "Clínica Nova" está em Negociação e o prospect "Lar Sol" está em Novo
- **Quando** Ana agenda visita para os dois e depois conclui a visita do "Lar Sol" com resumo, objeção "preço" e próximo passo "enviar proposta" em 10/11
- **Então** "Clínica Nova" continua em Negociação; "Lar Sol" vai a Visita agendada e depois a Visitado, com objeções e próximo passo gravados

**C-017 — Converter prospect (erro e sucesso)**
- **Dado que** "Lar Sol" está em Negociação
- **Quando** Ana informa o código de cliente do ERP 98765, que não existe, e depois 45210, que existe
- **Então** primeiro vê "Código de cliente não encontrado no ERP." e nada muda; depois a etapa vira Convertido com a data, o prospect deixa de aparecer para agendamento e o cliente 45210 não entra na carteira de Ana

**C-018 — Controle de agenda por executivo**
- **Dado que** hoje é 29/10/2026 e, na semana de 26/10 a 30/10, Ana tem 11 compromissos: 8 concluídos, 1 agendado em 27/10 sem relato, 1 agendado em 30/10 e 1 cancelado; 2 deles tiveram a data alterada
- **Quando** Carlos abre `Direcionamento Semanal`
- **Então** a linha de Ana mostra Agendadas 10, Concluídas 8, Não concluídas 2, Sem relato 2, Reagendadas 2, Canceladas 1 e Execução 80% (verde); o compromisso de 27/10 aparece como "Vencida sem relato"

**C-019 — Cliente crítico sem compra**
- **Dado que** o cliente W, curva A, comprou em 01/09, 21/09 e 11/10/2026 (ciclo de 20 dias, compra prevista 31/10)
- **Quando** Carlos abre a aba `Clientes Críticos sem Compra` da semana de 26/10 em 29/10 e em 02/11
- **Então** em 29/10 W aparece como "Ainda no prazo"; em 02/11, sem compra, como "Não comprou", somando o ticket médio ao "Ticket médio em risco" de Ana

**C-020 — Carteira sem visitação**
- **Dado que** hoje é 30/10/2026; o cliente V teve a última visita concluída em 15/09; o cliente U nunca foi visitado; o cliente T teve check-in sem check-out em 20/10 e nenhuma visita concluída
- **Quando** Carlos abre `Carteira sem Visitação`
- **Então** V aparece em "31 a 60 dias" (45 dias), U em "Nunca visitados" e T em "Nunca visitados"

**C-021 — Vendedor não acessa o Direcionamento (erro)**
- **Dado que** Ana é só vendedora
- **Quando** digita o endereço do Direcionamento
- **Então** vê "O Direcionamento Estratégico Semanal está disponível apenas para diretoria e coordenação." e nenhum dado é carregado (RNT-002)

**C-022 — (removido em 2026-10-30: Dica Pro descartada)**

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE gerar os 6 tipos de alerta pelas regras RN-002 a RN-007 | Cada tipo tem um caso que gera e um que não gera (Testes) | must |
| RF-002 | O sistema DEVE listar alertas agrupados por cliente, com filtros de busca, ramo, tipo, valor mínimo e situação aplicados sobre todos os alertas do escopo, paginados e com total. No topo, faixa com pendentes, potencial no filtro e alertas no filtro; Oportunidades em cartões que filtram a lista pelo produto; cada alerta com faixa de prioridade (só Alta em vermelho), tipo, data e valor alinhado à direita ("sem valor" quando não há); tipo fora da lista aparece por extenso (ex.: "Sem compra") | C-006 | must |
| RF-003 | O sistema DEVE ocultar alertas lidos por padrão | C-001 | must |
| RF-004 | O sistema DEVE permitir marcar como lido um alerta e todos os do recorte aberto, só para o dono ou substituto ativo, informando quantos mudaram | C-004, C-005 | must |
| RF-005 | O sistema DEVE mostrar no menu o número de alertas não lidos que o usuário pode marcar | C-008 | must |
| RF-006 | O sistema DEVE mostrar o bloco "Oportunidades e Vendas Perdidas" (até 3 produtos com mais avisos de Produto Perdido e Não Explorado, com `Ver detalhes` e `Ver todas`) | Com 5 produtos, mostra os 3 de maior potencial | should |
| RF-007 | O sistema DEVE mostrar o gráfico histórico de 13 meses ao expandir alertas de Sazonalidade, Reposição e Volume Crescente | RN-014 | should |
| RF-008 | O sistema DEVE sugerir até 5 produtos em alertas de Volume Crescente | RN-005 | could |
| RF-009 | (removido em 2026-10-30: alerta de queda de volume descartado) | — | — |
| RF-010 | (removido em 2026-10-30: Dica Pro descartada) | — | — |
| RF-011 | O sistema DEVE gerar alertas em fila diária, das 6h às 20h, a cada 10 minutos | C-010 | must |
| RF-012 | O sistema DEVE enviar o resumo semanal de avisos aos vendedores às quintas, 3h | C-011 | must |
| RF-013 | O sistema DEVE enviar o relatório semanal aos coordenadores às segundas, 8h | C-012 | must |
| RF-014 | O sistema DEVE listar a prospecção da semana da carteira com tendência, filtros e `Agendar visita` (abre a Agenda com o cliente) | C-013, C-014 | must |
| RF-015 | O sistema DEVE cadastrar prospect com contato principal | C-015 | must |
| RF-016 | O sistema DEVE manter a lista de prospects, na aba "Prospects" da tela Clientes (spec 002), com etapa, contatos, visitas e ações `Mudar etapa`, `Adicionar contato` e `Converter` | C-016, C-017; a lista não aparece em Alertas e Prospecção | should |
| RF-017 | O sistema DEVE gravar no prospect o resultado da visita: resumo, objeções, próximo passo e data do próximo passo | C-016 | must |
| RF-018 | O sistema DEVE mostrar o Direcionamento com as abas Controle de Agenda e Visitas, Clientes Críticos sem Compra e Carteira sem Visitação, navegando por semana (`Semana atual`, anterior, próxima). Controle de Agenda e Clientes Críticos abrem com uma faixa de totais da semana (execução da equipe, não concluídas e vencidas, sem relato, reagendadas e canceladas / valor em risco, não compraram, no prazo, executivos); no Controle de Agenda a execução tem barra e clicar no executivo abre os compromissos abaixo da linha, por data; nos Clientes Críticos a compra prevista vencida mostra os dias de atraso; na Carteira sem Visitação os cartões Total sem visita e as quatro faixas (com % do total) filtram a lista, e a próxima visita aparece em verde ou como "nada marcado" | C-018 a C-020 | must |
| RF-019 | O sistema DEVE exportar cada aba do Direcionamento para planilha | RN-029 | should |
| RF-020 | O sistema DEVE oferecer `Ver dados de exemplo` no Controle de Agenda, com aviso de que nada foi gravado | O exemplo nunca chama o servidor e mostra o aviso | could |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Cada execução da fila processa no máximo 3 vendedores; item "processando" há mais de 20 minutos é encerrado como erro e a fila segue | Simulação com um vendedor travado: o próximo é processado na execução seguinte |
| RNF-002 | E-mails semanais são idempotentes por destinatário e semana; falha de um destinatário fica registrada e não impede os outros | Reexecução no mesmo dia não reenvia; e-mail inválido não bloqueia os demais |
| RNF-003 | A aba Alertas abre com no máximo 3 consultas; gráfico e detalhes carregam só ao expandir; cada aba do Direcionamento carrega só quando aberta (RNFT-002) | Contagem de consultas no simulador |

## Entidades do domínio

- **Alerta** — aviso sobre um cliente, de um vendedor numa BU (filial + departamento + seção), com tipo, prioridade, valor de referência, produto (quando houver), mês de referência, lido/não lido e data de leitura.
- **Execução da fila** — lista diária de vendedores (ou clientes de um vendedor) a processar, com situação e erro.
- **Envio semanal** — registro do e-mail por vendedor (ou coordenador) e semana, com situação.
- **Prospect** — empresa fora do ERP: razão social, fantasia, CNPJ, segmento, porte, origem, cidade, UF, potencial mensal, probabilidade, observações, responsável, etapa, código do ERP e data de conversão.
- **Contato do prospect** — nome, cargo, telefone, e-mail, principal.
- **Visita de prospecção** — da agenda (spec 003), com resumo, objeções, próximo passo e data do próximo passo.

## Regras de negócio

**Geração de alertas**
- **RN-001** — Um cliente gera alerta para um vendedor numa BU quando está na carteira dele, o vendedor tem aquela BU ativa e há venda do cliente naquela BU nos últimos 12 meses, pelo casamento de filial, departamento e seção da RNT-007. As vendas consideradas são as faturadas (bruto).
- **RN-002** — **Produto Perdido**: produto comprado entre 12 e 3 meses atrás e não comprado nos últimos 3 meses. Até 3 por cliente e BU (os de maior valor). Prioridade Alta. Valor = soma ÷ meses distintos com compra.
- **RN-003** — **Sazonalidade**: produto comprado no mesmo mês do ano anterior e ainda não comprado no mês corrente. Até 3. Alta. Valor = valor daquele mês ÷ anos com compra.
- **RN-004** — **Reposição**: com 2 ou mais compras do produto em 12 meses, a próxima compra prevista (última + intervalo médio) cai entre hoje e hoje + 7 dias. Até 3 (as mais próximas). Média. Sem valor (R$ 0).
- **RN-005** — **Volume Crescente**: faturamento dos últimos 3 meses > 120% dos 3 meses anteriores (anteriores > 0). Média. Valor = últimos 3 meses. A tela sugere até 5 produtos: primeiro os que já aparecem em alertas do cliente, depois os de clientes do mesmo ramo.
- **RN-006** — **Não Explorado**: produto comprado nos últimos 12 meses por 2 ou mais clientes do mesmo segmento na carteira do vendedor naquela BU e nunca pelo cliente. Até 3 (mais clientes comprando). Baixa. Valor = valor do produto no segmento ÷ 12.
- **RN-007** — **Pedido Incompleto**: pedido dos últimos 7 dias abaixo de 50% da média dos pedidos anteriores do cliente na BU. Um por cliente. Média. Valor = valor do pedido.
- **RN-008** — Não se cria alerta igual (vendedor, BU, cliente, tipo, mês de referência, produto) enquanto houver um não lido. Alertas com mais de 60 dias são apagados. Marcar como lido não impede nova geração.
- **RN-016** — **Fila**: às 6h nasce a fila do dia com todos os vendedores com BU ativa; a cada 10 minutos, até as 20h, processam-se até 3. Um vendedor que falha inteiro é dividido em um item por cliente; o item que falha de novo fica como erro. Nunca há duas filas no mesmo dia, salvo reinício pedido pela gestão (spec 010).

**Lista e leitura**
- **RN-009** — Visibilidade pelo escopo da RNT-003/004 aplicado à BU do alerta: coordenador vê só as BUs dele, mesmo que o vendedor responda a outro coordenador. Alerta de cliente que saiu da carteira ou da BU do vendedor não aparece em lista nem contador.
- **RN-010** — Lista agrupada por cliente, clientes por potencial decrescente; dentro do cliente, por valor, depois prioridade (Alta, Média, Baixa). Cliente com até 2 alertas aparece expandido. Situação padrão `Não lidos`. Busca por nome, fantasia, CNPJ ou código (RNT-014). Opções de ramo = ramos dos alertas do escopo. `Ver alertas (n)` filtra o cliente; `Cliente` abre o cadastro (spec 002). Os filtros ficam no endereço da página.
- **RN-011** — Marcar como lido: só alertas do próprio usuário ou de titular de quem ele é substituto com férias ativas (RNT-010). `Marcar tudo como lido` marca esses alertas dentro do recorte de filial, departamento e seção aberto e responde "N alertas marcados como lidos."; zero = "Nada foi alterado: …" (RNT-013).
- **RN-012** — `R$ X potencial` = soma do valor de todos os alertas do filtro, não só da página. `N alertas pendentes` = não lidos do escopo aberto.
- **RN-013** — Contador do menu = não lidos que o usuário pode marcar (RN-011); recalcula ao marcar e a cada 5 minutos.
- **RN-014** — Gráfico histórico: 12 meses anteriores + mês atual, com valor e nº de pedidos do produto (Sazonalidade, Reposição) ou do cliente (Volume Crescente); botão `Ver padrão histórico` / `Ver gráfico`. Título "padrão de sazonalidade confirmado" com 2+ meses iguais ao atual com compra ou 3+ meses com compra; "apenas N ocorrências" abaixo disso; "Sem histórico neste período" sem compra; falha = `Dados históricos indisponíveis`.

**Queda de volume e Dica Pro**
- **RN-015** — (removida em 2026-10-30: alerta de queda de volume descartado; o selo "Queda" da carteira é regra da spec 002, com limite fixo de 30%)
- **RN-019** — (removida em 2026-10-30: Dica Pro descartada)

**E-mails**
- **RN-017** — Resumo ao vendedor: avisos gerados nos 7 dias anteriores à execução, lidos ou não, até 30 por prioridade e data; enviado ao e-mail de acesso; sem avisos, sem e-mail; uma vez por semana.
- **RN-018** — Relatório ao coordenador ativo com e-mail: a última semana operacional (RNT-005) já encerrada antes da execução, nas BUs dele, com faturamento bruto, devolução e líquido (RNT-008), pedidos, ranking de vendedores e clientes (12) em líquido, BUs, vendas por dia, produtos, meta proporcional (meta do mês ÷ dias do mês × dias da semana dentro do mês, RNT-009) e análises (devolução ≥ 8% do bruto; vendedor < 80% da meta proporcional; vendedor ≥ 100%). Uma vez por semana por coordenador.

**Prospecção da carteira**
- **RN-020** — Universo: clientes da carteira (e de titulares em férias com o usuário como substituto, RNT-010) com ao menos uma compra no escopo, pela RNT-007 e respeitando o titular do cliente (spec 002); o filtro de escopo do topo vale (RNT-003). Ciclo médio = média dos intervalos entre dias de compra. Janela de recompra = dias sem comprar ≥ 80% do ciclo. Padrão semanal = 2+ compras nos últimos 6 meses na mesma semana operacional do mês da semana atual (RNT-005). Tendência: `Cliente inativo` se > 90 dias sem comprar; senão `Alta` (janela e padrão), `Media` (um dos dois) ou `Baixa`. Ordem: Alta, Media, Baixa, Cliente inativo e, dentro, mais dias sem comprar. Curva = curva da carteira; sem ela, ticket médio de 3 meses ≥ R$ 15.000 = A, ≥ R$ 7.000 = B, senão C. Temperatura da spec 002. Dias sem comprar em destaque quando passam do ciclo. Subtítulo "Semana N de <mês> — N clientes com alta tendência de recompra". Vazio: `Nenhum cliente da sua carteira com histórico de compras encontrado.`

**Prospects**
- **RN-021** — Razão social obrigatória; nome fantasia vazio assume a razão social; UF em 2 letras maiúsculas; potencial aceita os formatos da RNT-011; probabilidade de 0 a 100 (padrão 10). Responsável = usuário logado (RNT-012). Contato principal gravado quando o nome é informado. Vendedor vê os prospects de que é responsável; coordenador, os da equipe (RNT-004); diretoria, todos. O prospect não tem BU. A lista de prospects fica na aba "Prospects" da tela Clientes (spec 002).
- **RN-022** — Etapas: Novo → Visita agendada → Visitado → Negociação → Convertido, ou Perdido. Agendar visita leva a Visita agendada só a partir de Novo; concluir visita leva a Visitado só a partir de Novo ou Visita agendada; nada automático regride etapa. `Mudar etapa` manual aceita qualquer etapa exceto Convertido (só por `Converter`); Convertido é final; Perdido pode voltar a Novo. Convertidos e Perdidos não aparecem para agendamento.
- **RN-023** — Converter exige um código de cliente existente no ERP; grava o código e a data de conversão. O cliente do ERP não entra automaticamente na carteira do responsável: a inclusão segue as regras da carteira (spec 002).
- **RN-024** — Concluir visita de prospecção exige resumo; objeções, próximo passo e data do próximo passo são opcionais. Ações sobre a visita seguem as permissões da spec 003.

**Direcionamento Estratégico Semanal**
- **RN-025** — Acesso: coordenador ativo, diretoria ou admin (RNT-002); escopo e padrão pela RNT-003. Semana = segunda a sexta (RNT-006), começando na semana atual.
- **RN-026** — Controle de Agenda: visitas a clientes e de prospecção do executivo na semana (compromissos internos ficam de fora). Agendadas = todas menos canceladas; Concluídas; Não concluídas = agendadas ou em andamento; Sem relato = não concluídas sem relato; Vencida = não concluída com data anterior a hoje; Reagendada = teve a data alterada (spec 003); Execução = concluídas ÷ agendadas, verde ≥ 80%, amarela ≥ 50%, vermelha abaixo. Situação do compromisso: "Vencida sem relato", "<situação> · sem relato", "Vencida sem conclusão", "Agendada", "Em andamento (sem checkout)". Por padrão mostra só executivos com ocorrência (pendente, reagendada ou cancelada); ordena por mais pendências. Vazios: "Nenhum compromisso agendado nesta semana no escopo selecionado." / "Todos os executivos concluíram os compromissos da semana."
- **RN-027** — Clientes Críticos: cliente importante = curva A ou entre os 20% de maior faturamento da carteira do executivo nos 180 dias antes da semana. Com 3+ dias de compra nesse período, ciclo = (última − primeira) ÷ (compras − 1), de 1 a 90 dias; compra prevista = última + ciclo, até o domingo da semana, e última compra há no máximo 2 ciclos. Comprou = alguma compra de segunda a domingo da semana. Não comprou e previsão ≥ hoje = "Ainda no prazo"; senão "Não comprou". Ticket médio = faturamento 180 dias ÷ compras; "Ticket médio em risco" soma os que não compraram. Lista só executivos com cliente sem compra, por valor em risco.
- **RN-028** — Carteira sem Visitação: clientes da carteira do executivo (no recorte de filial, departamento e seção) sem visita concluída **pelo próprio executivo** nos últimos 30 dias até hoje, independente da semana. Faixas: Nunca visitados, 31 a 60, 61 a 90, Mais de 90 dias; contagem por cliente distinto; mostra a próxima visita agendada. Busca por cliente ou cidade (RNT-014); 30 clientes por vez com "Ver mais".
- **RN-029** — Exportações: `controle-agenda-AAAA-MM-DD.xlsx` (abas "Resumo por executivo" com totais e "Compromissos"), `clientes-criticos-sem-compra-AAAA-MM-DD.xlsx` e `carteira-sem-visitacao-AAAA-MM-DD.xlsx` (respeita faixa e busca). Datas como data, valores como número, Execução como percentual. Exportação com dados de exemplo leva o aviso "DADOS DE EXEMPLO — não representam a equipe real."

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 / RN-010 | 8 não lidos + 4 lidos: padrão devolve 8; `Todos` 12; `Lidos` 4 | regra de negócio |
| C-002 / RN-002 | Compras de P: 900 (mar), 600 (mai), 300 (jun), processamento 30/10/2026 → 1 alerta Alta, valor 600,00; com compra em 15/09 → nenhum | regra de negócio |
| RN-003 | Compra de P em 10/2025, nada em 10/2026 → Alta; compra em 05/10/2026 → nenhum | regra de negócio |
| RN-004 | Compras de P em 01/08, 31/08, 30/09 (ciclo 30), hoje 28/10 → previsão 30/10, Média, valor 0; hoje 20/10 → nenhum | regra de negócio |
| RN-005 | Últimos 3 meses R$ 13.000 × anteriores R$ 10.000 → alerta valor 13.000; R$ 12.000 → nenhum; anteriores R$ 0 → nenhum | regra de negócio |
| RN-006 | 2 clientes do segmento compraram P (R$ 2.400 em 12 meses), o cliente nunca → Baixa, valor 200,00; só 1 cliente comprou → nenhum | regra de negócio |
| RN-007 | Média de pedidos R$ 1.000, pedido de ontem R$ 400 → Média, valor 400; R$ 600 → nenhum | regra de negócio |
| C-003 / RN-008 | Segunda execução com o igual não lido → 0 criados; após marcar lido → 1 criado; alerta de 61 dias → apagado | regra de negócio |
| C-004 / RN-011 | 5 Nutrição + 3 Medicamento, recorte Nutrição → 5 alterados, mensagem "5 alertas marcados como lidos."; 3 seguem não lidos | regra de negócio |
| C-005 / RN-011 | Coordenador marca alerta de Ana → 0 alterados, "Nada foi alterado: o alerta pertence a outro vendedor."; substituto com férias ativas marca → 1 alterado | regra de negócio |
| C-006 / RN-012 | 340 alertas, tipo Reposição → total 57, página 50; busca "12345678000190" → total 4 e potencial = soma dos 4 | regra de negócio |
| C-007 / RN-009 | Remover Y da carteira → lista e contador 8 → 5; coordenador da BU F2 não vê alerta da BU F1 do mesmo vendedor | regra de negócio |
| C-008 / RN-013 | Contador 7, marcar 1 → 6 sem recarregar | regra de tela |
| RN-014 | 13 meses, 2 meses iguais ao atual com compra → "padrão de sazonalidade confirmado"; 1 mês com compra → "apenas 1 ocorrências"; nenhum → "Sem histórico neste período" | regra de tela |
| C-010 / RN-016 | 26 vendedores, 3 por execução → 9 execuções; segunda criação no dia → nenhuma; falha do vendedor com 40 clientes → 40 itens de cliente; item preso há 21 min → erro | regra de negócio |
| C-011 / RN-017 | 45 avisos → e-mail com 30 linhas e a nota; reexecução → nenhum envio novo; 0 avisos → nenhum e-mail | regra de negócio |
| C-012 / RN-018 | Execução em 09/11/2026 → período 01/11–05/11; bruto 50.000, devolução 2.000 → líquido 48.000 no cabeçalho e no ranking; meta de nov 30.000 → 5.000,00; execução em 02/11/2026 → período 30/10–31/10 (semana recortada no fim do mês) | regra de negócio |
| C-013 / RN-020 | Ciclo 20, 18 dias sem comprar, padrão 2 → Alta; 15 dias → Media; 100 dias → Cliente inativo e entra no filtro `Cliente inativo` | regra de negócio |
| C-014 / RN-020 | Férias 01–15/11: em 05/11 lista inclui clientes de Ana; em 16/11 não; filtro Nutrição exclui cliente que só comprou em Medicamento | regra de negócio |
| C-015 / RN-021 | Razão vazia → recusado com a mensagem; "1.500,50" → 1500.5; responsável = logado mesmo se a tela enviar outro id; vendedor lista só os seus, coordenador os da equipe, diretoria todos | regra de negócio |
| C-016 / RN-022 | Negociação + agendar → Negociação; Novo + agendar → Visita agendada; concluir → Visitado; Perdido → Novo aceito; Convertido → qualquer etapa recusado | regra de negócio |
| C-017 / RN-023 | Código 98765 inexistente → recusado, etapa igual; 45210 → Convertido com data; some da lista de agendamento; carteira de Ana sem o cliente 45210 | regra de negócio |
| RN-024 | Concluir visita de prospecção sem resumo → recusado; com resumo, objeções e próximo passo → os 3 gravados | regra de negócio |
| C-018 / RN-026 | Os 11 compromissos do cenário → 10/8/2/2/2/1 e 80%; 27/10 → "Vencida sem relato" | regra de negócio |
| C-019 / RN-027 | Compras 01/09, 21/09, 11/10 → ciclo 20, previsão 31/10; hoje 29/10 → "Ainda no prazo"; 02/11 → "Não comprou"; 2 compras → fora | regra de negócio |
| C-020 / RN-028 | Hoje 30/10: última concluída 15/09 → 45 dias, "31 a 60 dias"; nunca → "Nunca visitados"; só check-in → "Nunca visitados"; concluída 10/10 → fora | regra de negócio |
| C-021 / RN-025 | Vendedor pede dados do Direcionamento → "sem permissão" e zero linhas | regra de negócio |
| RN-029 | Exportação de 5 executivos → aba Resumo com 5 linhas + Total; Execução 0,8 formatada como 80% | regra de tela |

Verificação manual:
- [ ] Aba Alertas, Prospecção, Direcionamento e aba Prospects da tela Clientes em 360 px e em tema escuro (RNFT-003/004)
- [ ] E-mails semanais abrem corretamente no Gmail e no Outlook
- [ ] `Agendar visita` abre a Agenda com o cliente preenchido

## Correções em relação ao sistema atual

| # | Hoje | Na reconstrução | Origem |
|---|---|---|---|
| 1 | Não Explorado e Pedido Incompleto estão no filtro, mas não são gerados | Gerados (RN-006/007) | manual §9, Tipos de alerta; Anexo |
| 2 | A busca diz "cliente ou CNPJ", mas procura só pelo nome | Nome, fantasia, CNPJ ou código (RNT-014) | manual §9 e §15; `AlertasInteligentesPage.tsx:608` |
| 3 | A tela carrega no máximo 100 alertas e filtra só entre eles; o potencial soma só os carregados | Filtros sobre todos os alertas do escopo, paginados com total (RNFT-001); potencial do filtro inteiro | manual §9; `AlertasInteligentesPage.tsx:167` |
| 4 | Coordenador clica em marcar e nada acontece; `Marcar tudo` habilitado pelo total da equipe e responde sucesso sem marcar | Ação só para dono ou substituto ativo; zero alterados = erro (RNT-013) | manual §9 e §15 Alertas; `AlertasInteligentesPage.tsx:569` |
| 5 | `Marcar tudo` aceita o vendedor por parâmetro | Identidade da sessão (RNT-012) | Anexo |
| 6 | Contador do menu usa outro escopo que a tela e só atualiza a cada 5 minutos | Conta o que o usuário pode marcar e atualiza ao marcar (RN-013) | manual §9 FAQ; `Layout.tsx:43,101` |
| 7 | Substituto herda alertas, prospecção e direcionamento por um segundo cadastro de substituto, sem datas | Só férias ativas do cadastro único (RNT-010) | manual §13; Anexo |
| 8 | `Cliente inativo` nunca mostra ninguém; a tendência "Perdido" (> 90 dias) deixou de existir | > 90 dias = `Cliente inativo`, visível no filtro e em `Todos` | manual §9 Regras; `ProspeccaoPage.tsx:161` |
| 9 | Prospecção ignora o filtro de escopo e lista cliente sem nenhuma compra | Escopo RNT-003; só clientes com histórico (RN-020) | manual §9 Regras |
| 10 | "Semana N" da prospecção = dia ÷ 7, limitado a 5 | Semana operacional (RNT-005) | `ProspeccaoPage.tsx:22`; Anexo |
| 11 | `Atualizar` da Prospecção dispara a sincronização de vendas para qualquer usuário | Só recarrega a lista; sincronização manual fica com a gestão (spec 006) | manual §8 Sincronização; `ProspeccaoPage.tsx:163` |
| 12 | Queda compara o mês corrente parcial com o mês anterior inteiro (e semana ISO) | Sem efeito: o alerta de queda de volume foi descartado (ver #13) | Anexo |
| 13 | Bloco de queda e Dica Pro não aparecem em nenhuma tela; ninguém consegue mudar o limite de 30% | Descartados em 2026-10-30: as duas funções são aposentadas; o selo "Queda" da carteira usa o limite fixo de 30% (spec 002) | `AlertasQuedaWidget.tsx` e `DicaProCard.tsx` sem uso |
| 14 | Dica de meta lê o cadastro de meta legado e leva a uma tela inexistente; dica fixa "terças-feiras pela manhã" sem base em dado | Sem efeito: a Dica Pro foi descartada (ver #13) | Anexo |
| 15 | Relatório dos coordenadores chama de líquido o ranking de vendedores, que é bruto | Líquido (RNT-008) | Anexo |
| 16 | Todo usuário vê todos os prospects; o responsável vem da tela | Visibilidade da RN-021; responsável = logado (RNT-012) | Anexo; `ClientesPage.tsx:877` |
| 17 | Potencial "1.500,50" do prospect vira valor inválido | Formatos da RNT-011 | `ClientesPage.tsx:870` |
| 18 | Agendar visita devolve o prospect a "Visita agendada" mesmo em Negociação | Etapa automática nunca regride (RN-022) | Anexo |
| 19 | Não há tela para mudar etapa, incluir contato ou converter; objeções e próximo passo nunca são preenchidos | Lista de prospects com essas ações na aba "Prospects" da tela Clientes (spec 002); conclusão da visita grava os 3 campos | manual §9 Prospects; `AgendaPage.tsx:1230` |
| 20 | Conversão aceita qualquer texto como código do ERP | Código precisa existir (RN-023) | Anexo |
| 21 | Visita de prospecção pode ser alterada ou cancelada por qualquer usuário | Permissões da spec 003 | Anexo |
| 22 | Direcionamento também liberado por um e-mail fixo | Por papel (RNT-002) | pendências, item 5; Anexo |
| 23 | Carteira sem Visitação conta check-in sem check-out como visita e ignora o recorte de filial e departamento | Só visita concluída; recorte aplicado (RN-028) | Anexo |
| 24 | Reagendada é detectada procurando um texto no relato | Data alterada, pelo registro da spec 003 | Anexo |
| 25 | Relatório dos coordenadores cobre a semana anterior de segunda a domingo | Última semana operacional encerrada (RN-018, RNT-005) | Anexo |

## Fora de escopo

- [ ] Criar, reagendar, cancelar, check-in e check-out de visitas, inclusive de prospecção (spec 003).
- [ ] Temperatura, curva, titular e selo "Queda" na carteira (spec 002); o selo usa o limite fixo de 30%.
- [ ] Dica Pro e alerta/bloco de queda de volume, inclusive a configuração do limite de queda por vendedor: descartados em 2026-10-30.
- [ ] A tela Clientes e as outras abas dela (spec 002): aqui ficam só as regras do prospect e o conteúdo da aba "Prospects".
- [ ] Incluir automaticamente na carteira o cliente de um prospect convertido.
- [ ] Sincronização de vendas e o status "Alerta" do acompanhamento semanal (spec 006).
- [ ] Botão `Gerar novos alertas` do Painel de Gestão: tela cancelada em 2026-11-03 (D4); a fila automática da RN-016 continua.
- [ ] Alerta em tempo real, notificação no celular ou por mensageiro.
- [ ] Cadastrar o cliente no ERP a partir do prospect: o cadastro continua sendo feito no ERP.
- [ ] Mudar horários das rotinas ou textos dos e-mails pela tela.

## Pendências

- [x] Decidido em 2026-10-30: reativar Não Explorado (Baixa) e Pedido Incompleto (Média) com as regras RN-006/007.
- [x] Decidido em 2026-10-30: só o vendedor dono (ou substituto com férias ativas) marca alerta como lido.
- [x] Decidido em 2026-10-30: Dica Pro e bloco/alerta de queda de volume descartados; as duas funções são aposentadas.
- [x] Decidido em 2026-10-30: sem efeito, a queda de volume foi descartada.
- [x] Decidido em 2026-10-30: o relatório semanal dos coordenadores passa para a semana operacional (RNT-005).
- [x] Decidido em 2026-10-30: prospect visível ao dono, à equipe do coordenador e à diretoria; o prospect não tem BU.
- [x] Decidido em 2026-10-30: a lista de prospects fica na aba "Prospects" da tela Clientes (spec 002), não em Alertas e Prospecção.
- [x] Decidido em 2026-10-30: não; o `Atualizar` só recarrega a lista. A sincronização manual fica com GESTOR e ADMIN (spec 006).
- [x] Decidido em 2026-10-30: não conta; só vale a visita concluída pelo próprio executivo dono da carteira.
- [x] Decidido em 2026-10-30: prospect convertido não entra automaticamente na carteira do responsável.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente fora do anexo
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-005, C-015, C-017, C-021)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto

---

## Anexo — Rastreabilidade de origem

**Rotas atuais cobertas:** `/alertas` (aba Alertas), `/alertas?aba=prospeccao` (aba Prospecção), `/direcionamento-semanal`. Partes em outras telas: `Novo cliente prospecto` e, na reconstrução, a lista de prospects (aba "Prospects") em `/clientes` (página da spec 002), visitas de prospecção em `/agenda`, contador no menu, `Gerar novos alertas` em `/painel-gestao`.

**Páginas atuais:** `frontend/src/pages/AlertasInteligentesPage.tsx`, `ProspeccaoPage.tsx` (embutida, sem rota), `DirecionamentoSemanalPage.tsx`; componentes `AlertaSazonalidadeGrafico.tsx`, `AlertasQuedaWidget.tsx` (sem uso — **aposentar**), `DicaProCard.tsx` (sem uso — **aposentar**), `ClientesCriticosSemCompra.tsx`, `CarteiraSemVisitacao.tsx`, `Layout.tsx` (contador); `ClientesPage.tsx` (criação de prospect), `AgendaPage.tsx` (visitas de prospecção).

| RF / RN | SFs atuais (alias · id) | Tabelas |
|---|---|---|
| RF-001, RN-001–008 | `alertasInteligentesPopular` · 130 | `ALERTAS_INTELIGENTES`, `PEDIDOS_SEMANAIS_SYNC_RAW`, `EQUIPE_CLIENTE`, `BU_VENDEDOR`, `CLIENTES`, `IMP_CLIENTES_TOTVS` (ramo) |
| RF-011, RN-016 | `alertasInteligentesProcessarFila` · 264 (cron 6h + a cada 10 min) | `ALERTAS_PROCESSAMENTO` |
| RF-002/003, RN-009/010/012 | `alertasInteligentesListar` · 131 | `ALERTAS_INTELIGENTES`, `EQUIPE_CLIENTE`, `BU_VENDEDOR`, `COORDENADORES_BU`, `FERIAS_VENDEDOR` |
| RF-004, RN-011 | `alertasInteligentesMarcarLido` · 132, `alertasInteligentesMarcarTodosLidos` · 133 | `ALERTAS_INTELIGENTES` |
| RF-005, RN-013 | `alertasInteligentesContarNaoLidos` · 134 | `ALERTAS_INTELIGENTES` |
| RF-007, RN-014 | `alertasInteligentesDetalheGrafico` · 135 | `PEDIDOS_SEMANAIS_SYNC_RAW` |
| RF-009, RN-015 (removidos) | `alertaObterConfig` · 126, `alertaConfigurar` · 125 (só no componente sem uso) — **aposentar**; `alertasQuedaVolume` · 127 (usada pela Carteira) sai desta spec e fica com a spec 002 (selo "Queda", limite fixo de 30%) | `CONFIG_ALERTAS_VENDEDOR` (deixa de ser lida), `PERFIL_COMPRA_CLIENTE` |
| RF-010, RN-019 (removidos) | `dicaProObter` · 136, `dicaProMarcarVisualizada` · 137 (só no componente sem uso) — **aposentar** | `DICAS_PRO_LOG`, `METAS_VENDEDOR` (legado) — deixam de ser lidas |
| RF-012, RN-017 | `alertasInteligentesEnviarResumoSemanal` · 208 (cron qui 3h) | `ALERTAS_EMAIL_SEMANAL`, `INT_USER` |
| RF-013, RN-018 | `enviarRelatorioSemanalCoordenadores` · 237 (cron seg 8h) | `RELATORIO_SEMANAL_COORDENADORES_LOG`, `COORDENADORES`, `COORDENADORES_BU`, `IMP_DEVOLUCOES_TOTVS`, `VW_META_VENDEDOR_MES` |
| RF-014, RN-020 | `prospeccaoSemanalCarteira` · 115; `temperaturaClientesCarteira` · 128 (spec 002); `acompanhamentoSemanalSincronizarManual` · 107 (spec 006, hoje chamada pelo `Atualizar`) | `EQUIPE_CLIENTE`, `CLIENTE_TITULAR_DEPTO`, `PERFIL_COMPRA_CLIENTE`, `FUNCIONARIOS`, `FERIAS_VENDEDOR` |
| RF-015, RN-021 | `prospectsCriar` · 265, `prospectsListar` · 252 | `PROSPECTS`, `PROSPECT_CONTATOS` |
| RF-016, RN-022/023 | `prospectsAtualizarStatus` · 256, `prospectsMarcarConvertido` · 259, `prospectsContar` · 253 — **sem uso na tela**; passam a servir a aba "Prospects" de `/clientes` | `PROSPECTS` |
| RF-017, RN-024 | `prospectsAgendarVisita` · 266, `prospectsCheckinVisita` · 262, `prospectsCheckoutVisita` · 263, `prospectsAtualizarVisita` · 260, `prospectsCancelarVisita` · 261, `prospectsVisitasListar` · 254 (spec 003); `prospectsRegistrarResultadoVisita` · 258 — **sem uso** | `PROSPECT_VISITAS`, `PROSPECTS` |
| RF-018, RN-025/026 | `direcionamentoAgendaSemanaExecutivos` · 393 | `VISITAS`, `PROSPECT_VISITAS`, `CLIENTES`, `PROSPECTS` |
| RN-027 | `direcionamentoClientesCriticosSemCompra` · 394 | `PEDIDOS_SEMANAIS_SYNC_RAW`, `EQUIPE_CLIENTE`, `BU_VENDEDOR` |
| RN-028 | `direcionamentoCarteiraSemVisita` · 395 | `EQUIPE_CLIENTE`, `VISITAS` |
| — | `alertasAusenciaPedido` · 105 — **sem uso** (o "Alerta" do semanal é da spec 006) | `PERFIL_COMPRA_CLIENTE` |
| — | `sazonalidadeClienteProdutos` · 129 — pertence à spec 006 (aba Sazonalidade do detalhe do cliente) | `PEDIDOS_SEMANAIS_SYNC_RAW` |
| — | ids 255 e 257 (faixa de prospecção, fora do mapa da tela; provavelmente versões antigas de criar/agendar) — **confirmar e aposentar** | — |

**Origem técnica das correções** (o mais recente vence):

| # | Onde |
|---|---|
| 1 | `backend/update-alertas-escopo-completo-bu.mjs:265-266` remove os dois tipos da SF 130; regras originais em `backend/add-alertas-inteligentes.mjs:376-402` |
| 5 | `backend/fix-alertas-escopo-bu-multi-gestor.mjs:255-262` (`{{idVendedor}}` na SF 133) |
| 7 | CTE `TARGET_USERS` com `FUNCIONARIOS.ID_SUBSTITUTO` em SF 131/134 (`fix-alertas-escopo-bu-multi-gestor.mjs`), SF 115 (`migrations/update-sf-prospeccaosemanalcarteira-1792595102.sql:90`) e SFs 393–395 |
| 8, 10 | SF 115 (`migrations/update-sf-prospeccaosemanalcarteira-1792595102.sql:304` e CASE de tendência no fim) |
| 12 | SF 127 (`migrations/update-sf-alertasquedavolume-1792595105.sql:289-290`) |
| 14 | SF 136 (`backend/sf-versions/20260921192152/sf-136-dicaproobter.sql:192, 328, 362`) |
| 15 | SF 237 (`backend/sf-versions/20260924131849/sf-237-enviarrelatoriosemanalcoordenadores.sql:268`) |
| 25 | SF 237: período do relatório calculado como segunda a domingo da semana anterior (mesmo arquivo da #15) |
| 16, 18, 20, 21 | `backend/add-prospeccao-prospects.mjs:129` (lista sem dono), `:226` (responsável por parâmetro), `:294` (etapa ao agendar), `:331-350` (cancelar/check-in sem dono), `:371` (conversão) |
| 22 | SFs 393–395, CTE `GESTOR` com `ti@benenutri.com` (`migrations/update-sf-direcionamentoagendasemanaexecutivos-1792676666.sql:72`) |
| 23 | SF 395 (`migrations/update-sf-direcionamentocarteirasemvisita-1792611530.sql:164`; CTE `CARTEIRA` sem recorte de filial/seção) |
| 24 | SF 393 (`migrations/update-sf-direcionamentoagendasemanaexecutivos-1792676666.sql:157,170`) |
