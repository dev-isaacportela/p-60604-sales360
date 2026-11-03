# Spec: Analytics, comparativo e redistribuição de metas

**ID:** 007-analytics-metas · **Status:** em revisão · **Data:** 2026-10-30

> Spec de **reconstrução** (ver 000). Regras transversais citadas pelo id
> (`RNT-00N`, `RNFT-00N`). Proibido citar stack, tabela ou componente fora do
> anexo **Rastreabilidade de origem**.

## Problema

Vendedor, coordenador e diretoria precisam entender o próprio desempenho (meta, faturamento líquido, devoluções, carteira, mix, visitas) e o coordenador precisa repartir entre a equipe a meta que recebe do planejamento estratégico. Hoje os números do Analytics divergem dos outros painéis (equipe somando BUs de outro coordenador, meta caindo em cadastro antigo, rankings calculados só sobre os 10 maiores), filtros de filial e seção são ignorados e uma gravação de meta pode parar no meio ou dizer "salvo" sem gravar nada.

## Resultado esperado

Cada pessoa abre o Analytics e vê, para o período e o escopo escolhidos, os mesmos números das outras telas; o coordenador redistribui a meta da BU com a certeza de que o que a tela mostra é exatamente o que foi gravado.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| Vendedor | Ver meta, líquido, projeção, carteira, mix, devoluções e visitas próprios; comparar períodos e meses | semanal |
| Coordenador | O mesmo para a equipe (RNT-003/004); redistribuir a meta da BU entre vendedores e por ramo/UF | mensal (metas), semanal (análise) |
| Diretoria | Acompanhar a distribuição das metas de todos os coordenadores, em leitura | mensal |

## Cenários

**C-001 — Overview do mês**
- **Dado que** Ana tem meta distribuída de R$ 50.000 em out/2026, bruto de R$ 42.000 e R$ 2.000 de devolução no mês
- **Quando** abre o Analytics no período `Mês atual`
- **Então** vê Meta do período R$ 50.000,00; Faturamento líquido R$ 40.000,00 ("R$ 42.000,00 bruto menos devoluções"); Falta para meta R$ 10.000,00 (80,0% da meta atingida); Total devolvido R$ 2.000,00 (4,8% do faturamento bruto)

**C-002 — Projeção por dias úteis**
- **Dado que** out/2026 tem 22 dias úteis (segunda a sexta, contando o feriado de 12/10), hoje é 15/10 (11 dias úteis decorridos) e o líquido é R$ 40.000
- **Quando** Ana olha `Projeção por dias úteis`
- **Então** vê R$ 80.000,00, destacada como acima da meta de R$ 50.000

**C-003 — Filtros só valem no Buscar**
- **Dado que** a tela mostra out/2026 com todos os ramos
- **Quando** Ana marca o ramo "Hospital" e a Filial 2 e não clica em `Buscar`
- **Então** nenhum bloco muda; ao clicar em `Buscar`, todos os blocos (inclusive Overview, carteira e rankings) passam a considerar só Hospital na Filial 2

**C-004 — Análise de carteira**
- **Dado que** a carteira de Ana no escopo tem 40 clientes: 25 compraram em out/2026, 15 não; 6 desses 15 compraram em set/2026; 2 clientes fizeram a primeira compra da vida em out/2026
- **Quando** ela abre a aba Clientes
- **Então** vê Carteira 40, Ativos 25, Inativos 15, Em risco 6, Novos 2 e Ticket médio = líquido ÷ 25; clicar em "Em risco" lista os 6, paginados

**C-005 — Equipe recortada pela BU do coordenador**
- **Dado que** Bruno tem escopo em Filial 1 · Nutrição (coordenador Carlos) e Filial 2 · Medicamento (coordenadora Dora) e vendeu R$ 30.000 e R$ 20.000 em cada uma
- **Quando** Carlos abre o Analytics em "Time inteiro"
- **Então** o líquido de Bruno somado à equipe é R$ 30.000; Dora vê R$ 20.000

**C-006 — Meta recebida do planejamento por UF**
- **Dado que** o planejamento de Nutrição em nov/2026 é DF R$ 100.000, GO R$ 300.000 e Outros Estados R$ 40.000; Nutrição existe nas Filiais 1 (DF), 2 (GO) e 4 (GO), com líquido dos 12 meses anteriores de R$ 1, 2 e 1 milhão
- **Quando** o coordenador abre a aba Metas em nov/2026
- **Então** recebe Filial 1 · DF · Nutrição R$ 110.000, Filial 2 · GO · Nutrição R$ 220.000 e Filial 4 · GO · Nutrição R$ 110.000 (soma R$ 440.000 = planejamento), origem "Planejamento estratégico · DF, GO"

**C-007 — Lançamento manual antigo não conta**
- **Dado que** o sistema antigo guardou um lançamento manual de R$ 250.000 para Filial 2 · Nutrição em nov/2026, e o planejamento dá R$ 220.000 a essa filial
- **Quando** o coordenador filtra essa Filial / BU
- **Então** Meta geral = R$ 220.000,00 com origem "Planejamento estratégico · GO"; o lançamento manual não é lido (RNT-009)

**C-008 — BU com dois coordenadores**
- **Dado que** Medicamento está em 8 filiais, ambas cobertas pelos coordenadores Ed e Fê, e o planejamento soma R$ 800.000
- **Quando** a diretoria abre a aba Metas em "Todos os coordenadores"
- **Então** Meta geral = R$ 800.000,00, com cada filial contada uma vez

**C-009 — Grava só o que foi editado**
- **Dado que** a BU de Carlos tem 5 vendedores e ele altera a Nova meta de 2
- **Quando** clica em `Salvar`
- **Então** só as 2 metas são gravadas e aparece "Metas salvas: 2 vendedor(es)."; os outros 3 mantêm o valor anterior, inclusive quem não tinha meta

**C-010 — Valor inválido não grava nada (erro)**
- **Dado que** Carlos alterou 3 vendedores e deixou o campo de Bruno vazio
- **Quando** clica em `Salvar`
- **Então** vê "Valor de meta inválido em: Bruno. Nada foi gravado." e nenhuma das 3 metas muda

**C-011 — Servidor recusa e a tela diz que nada mudou (erro)**
- **Dado que** Carlos coordena só Filial 1 · Nutrição e uma gravação chega para Filial 3 · Medicamento
- **Quando** o sistema processa a gravação
- **Então** zero metas mudam e a resposta é "Nada foi alterado: você não coordena a BU Filial 3 · Medicamento.", nunca sucesso (RNT-013)

**C-012 — Rateio rápido por BU**
- **Dado que** Filial 1 · Nutrição tem meta de R$ 90.000 e 3 vendedores, e Filial 2 · Nutrição R$ 60.000 e 2 vendedores, ambas abertas
- **Quando** Carlos clica em `Ratear igual`
- **Então** os campos ficam R$ 30.000 para cada um dos 3 e R$ 30.000 para cada um dos 2; nada é gravado até `Salvar`

**C-013 — Personalizar por ramo/UF**
- **Dado que** Ana tem meta de R$ 100.000 em Filial 1 · Nutrição, rateada automaticamente em Hospital DF R$ 60.000 e Clínica DF R$ 40.000
- **Quando** Carlos muda Clínica DF para R$ 30.000, clica em `Aplicar ao vendedor` e depois em `Salvar`
- **Então** Clínica DF fica R$ 30.000 (personalizada), Hospital DF (automática) recebe a sobra e fica R$ 70.000, e a meta de Ana nessa BU continua R$ 100.000; se tivesse digitado R$ 150.000, veria "Os ramos ajustados passam da meta total de: Ana. Reduza os valores. Nada foi gravado."

**C-014 — Diretoria só lê**
- **Dado que** Gil tem papéis DIRETORIA e COORDENADOR
- **Quando** abre a aba Metas
- **Então** vê "Acompanhamento de Metas por Coordenador", botão `Somente leitura`, campos bloqueados, e o servidor recusa qualquer gravação de meta dele

**C-015 — Comparativo modular**
- **Dado que** o bloco 1 é Cliente · Faturamento de 01/01 a 31/03/2025 e o bloco 2 o mesmo de 2026; o cliente X faturou R$ 10.000 e R$ 12.500
- **Quando** o vendedor clica em `Exportar Excel`
- **Então** a planilha traz X com R$ 10.000 e R$ 12.500, Dif. R$ 2.500 e Dif. % 25,0%, valores como número

**C-016 — Comparativo mensal**
- **Dado que** a carteira de Ana faturou R$ 80.000 em ago, R$ 100.000 em set e R$ 60.000 em out/2026 até hoje
- **Quando** ela abre Comparativo → `Mensal` em outubro
- **Então** vê os três totais, a variação −R$ 40.000,00 (−40,0%), o selo `SEM COMPRA` em quem comprou em setembro e não em outubro e `NOVO` em quem só comprou em outubro

**C-017 — Intervalo personalizado inválido (borda)**
- **Dado que** o período é `Intervalo personalizado`
- **Quando** Ana informa 31/12/2026 a 01/01/2026, ou 01/01/2024 a 31/12/2026
- **Então** vê "A data inicial deve ser anterior à final." ou "O intervalo pode ter no máximo 24 meses." e nenhum bloco é recarregado

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE oferecer as abas Overview, Clientes, Produtos, Metas (coordenador e diretoria) e Modular, com filtro de escopo (RNT-003) | Vendedor não vê a aba Metas; coordenador e diretoria veem as 5 | must |
| RF-002 | O sistema DEVE filtrar por Período, Filiais, Departamentos e Seções (quem tem filtro de escopo), Ramos e Cliente (múltiplo, com busca RNT-014), aplicando só no `Buscar` (RN-001/002) | C-003, C-017 | must |
| RF-003 | O sistema DEVE mostrar no Overview, em 4 cartões, Faturamento líquido (com bruto e Total devolvido), Meta do período (com a barra de Progresso da meta), Falta para meta (zerada: o dia em que a meta foi batida) e Projeção por dias úteis (RN-003..005) | C-001, C-002 | must |
| RF-004 | O sistema DEVE mostrar Evolução Histórica (líquido × meta) por dia ou por mês (RN-006): líquido em barras e a meta de cada ponto como marca tracejada sobre a barra, sem linha ligando os pontos; barra em destaque quando o líquido do ponto alcança a meta do ponto | 15 dias → 15 pontos diários; 6 meses → 6 pontos mensais | must |
| RF-005 | O sistema DEVE mostrar Ranking de Produtos por valor e por quantidade (8 maiores de cada), em tabela com a posição e a participação de cada produto entre os 8; produto sem descrição aparece como "Produto sem descrição" | C-001 com 12 produtos mostra 8 em cada gráfico | must |
| RF-006 | O sistema DEVE mostrar Devoluções do Período: Total devolvido, Registros, Média por devolução, Casos acima de 30 dias e detalhamento paginado de 50, do maior valor para o menor (as 4 maiores são as primeiras linhas da página 1), todas as linhas da página visíveis | 120 devoluções → 3 páginas; página 1 mostra 50 linhas e começa pela maior | must |
| RF-007 | O sistema DEVE mostrar a Análise de Carteira com lista clicável de Inativos e Em risco, paginada (RN-007) | C-004 | must |
| RF-008 | O sistema DEVE mostrar Indicador de Tipos de Visita: visitas concluídas, média semanal e distribuição pelos 5 tipos (RN-009) | 12 visitas em 30 dias → média 2,8/semana | should |
| RF-009 | O sistema DEVE mostrar Top Clientes (10 maiores, com bruto, devolvido, líquido, pedidos, ticket e % do total) e Evolução do cliente para os clientes selecionados no filtro | Sem cliente selecionado: "Selecione um ou mais clientes nos filtros para visualizar a evolução." | must |
| RF-010 | O sistema DEVE mostrar na aba Produtos: top produtos (valor, quantidade), produtos com devolução, distribuição por fornecedores, faturamento por ramo e top 3 produtos por ramo (RN-008) | Faturamento por ramo soma o líquido de todos os clientes do recorte | must |
| RF-011 | O sistema DEVE oferecer o Comparativo modular com até 4 blocos (Categoria, Métrica, período próprio, seleção de itens) e exportação .xlsx (RN-016) | C-015; 5º bloco não pode ser adicionado | should |
| RF-012 | O sistema DEVE oferecer a tela Comparativo com as visões `Semanal` (spec 006) e `Mensal` (RN-017) e `Baixar PDF` da visão mensal | C-016 | must |
| RF-013 | O sistema DEVE mostrar na aba Metas, por mês/ano e Filial / BU, a meta recebida do planejamento com a origem (RN-010..012) | C-006, C-007, C-008 | must |
| RF-014 | O sistema DEVE mostrar Meta geral, Total distribuído, Saldo disponível, Vendedores com meta e o status do rateio (RN-013) | Meta 90.000 e distribuído 90.000 → "Status: rateio fechado" | must |
| RF-015 | O sistema DEVE listar o Detalhamento por Vendedor, uma linha por vendedor × Filial/BU, com Meta atual, Nova meta, realizado líquido, atingimento e status (RN-014) | Vendedor em 2 BUs aparece 2 vezes, rotulado "Filial N · UF · Departamento" | must |
| RF-016 | O sistema DEVE oferecer `Ratear igual`, `Por realizado` e `Manter proporção`, por BU, preenchendo os campos sem gravar (RN-015) | C-012 | should |
| RF-017 | O sistema DEVE permitir personalizar a meta do vendedor por ramo/UF dentro da BU, com `Aplicar ao vendedor` sem gravar (RN-012) | C-013 | should |
| RF-018 | O sistema DEVE gravar no `Salvar` só o que mudou, validar tudo antes e gravar tudo ou nada (RN-018/019) | C-009, C-010, C-011 | must |
| RF-019 | O sistema DEVE pedir confirmação ao trocar mês, ano ou Filial / BU, ou recarregar, com edição pendente | "Existem 2 alterações de meta ainda não salvas. Recarregar os dados vai descartar essas alterações. Deseja continuar?" | must |
| RF-020 | O sistema DEVE manter a diretoria em leitura na tela e no servidor | C-014 | must |
| RF-021 | O sistema DEVE mostrar Ocupação por Região (3 UFs de maior meta), Insights Estratégicos (região destaque, ramo líder, performance por estado) e `Exportar relatório` das metas em .xlsx | A planilha tem uma linha por vendedor × BU e uma por vendedor × BU × ramo × UF | could |
| RF-022 | O sistema DEVE ordenar as tabelas pelo valor numérico ao clicar no cabeçalho | R$ 9.000 vem antes de R$ 10.000 em ordem crescente | should |
| RF-023 | O sistema DEVE permitir, ao clicar numa barra do ranking de clientes ou do ranking de produtos, filtrar a análise por esse item; os demais gráficos (ramo, fornecedor, departamento) não filtram | Clique em "Cliente X" no ranking → filtro Cliente = X e Evolução do cliente preenchida; clique numa barra de ramo não muda nenhum filtro | could |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Abrir o Analytics faz no máximo 9 consultas (opções de filtro + 8 blocos), dentro de RNFT-002 | Contagem no simulador |
| RNF-002 | A aba Metas faz no máximo 3 consultas e só quando é aberta; a aba Modular só consulta quando aberta | Abrir e fechar o Analytics sem clicar nas abas → 0 consultas de metas |
| RNF-003 | O `Salvar` de 30 vendedores e 60 ajustes por ramo/UF termina em até 10 s | Cronômetro no simulador |

## Entidades do domínio

- **Meta da BU recebida** — valor mensal por filial + departamento, vindo do planejamento estratégico por BU + UF (RNT-009).
- **Meta do vendedor na BU** — valor mensal por vendedor × filial × departamento, gravado pelo coordenador; a soma no mês é a meta do vendedor (RNT-009).
- **Meta por ramo/UF** — parte da meta do vendedor na BU destinada a um ramo de cliente numa UF; automática (proporcional ao planejamento) ou personalizada.
- **Base de planejamento** — meta do planejamento por BU, UF e ramo, usada como peso do rateio por ramo/UF.
- **Bloco do comparativo** — categoria (Cliente, Ramo, Seção, Produto, Departamento), métrica, período e itens escolhidos.

## Regras de negócio

- **RN-001 — Período.** `Mês atual` (padrão) = do dia 1 ao último dia do mês corrente; `Último trimestre` = mês corrente e os 2 anteriores; `Último ano` = mês corrente e os 11 anteriores; `Intervalo personalizado` = datas dd/mm/aaaa, início ≤ fim e no máximo 24 meses.
- **RN-002 — Filtros.** Filiais, Departamentos, Seções, Ramos e Cliente (vários de cada) recortam todos os blocos, só depois de `Buscar` ("Alterações nos filtros só afetam os blocos após clicar em Buscar."). Filiais, Departamentos e Seções só aparecem para quem tem filtro de escopo. Sem cliente marcado, vale "Todos da carteira".
- **RN-003 — Faturamento.** Venda e devolução contam conforme RNT-007 e a regra de titular do cliente (spec 002); a devolução entra pela data da devolução no período. Líquido conforme RNT-008, sem truncar em zero (ver Pendências). O escopo "Time inteiro" soma cada vendedor só nas BUs do coordenador (RNT-004).
- **RN-004 — Meta e atingimento.** Meta do período = soma das metas distribuídas (RNT-009) dos meses que o período toca, recortada pelas filiais e departamentos do filtro e do escopo. Falta para meta = máx(meta − líquido; 0). Atingimento = líquido ÷ meta; meta zero → 0% e "Meta não distribuída". Meta batida em = primeiro ponto da evolução (dia ou mês, RN-006) em que o líquido acumulado desde o início do período alcança a meta do período.
- **RN-005 — Projeção.** Líquido ÷ dias úteis decorridos até hoje (mínimo 1) × dias úteis do período; dia útil = segunda a sexta, sem descontar feriados (RNT-016). Período já encerrado → projeção = líquido.
- **RN-006 — Evolução.** Período de até 31 dias → um ponto por dia; acima → um ponto por mês. Meta diária = meta do mês ÷ dias úteis do mês, zero em sábado e domingo. A meta da linha segue o mesmo escopo e filtros das barras.
- **RN-007 — Carteira.** Ativo = ao menos um pedido no período; Inativo = nenhum; Em risco = inativo que teve pedido no período imediatamente anterior de mesmo tamanho; Novo = primeira compra da história dentro do período; Ticket médio = líquido ÷ ativos. Dias sem compra = de último pedido até hoje (ou até o fim do período, se já encerrado); sem pedido = "Sem pedido".
- **RN-008 — Rankings.** Valores sempre líquidos (RNT-008). Top clientes: 10 maiores, % do total = líquido do cliente ÷ líquido do recorte. Produtos: 10 maiores por valor e por quantidade; top 3 por ramo; departamentos/seções 20 maiores; produtos com devolução 50 maiores, com % devolvido sobre o bruto do produto. Faturamento por ramo, segmento e fornecedores somam todos os clientes e produtos do recorte, não só os do ranking.
- **RN-009 — Visitas.** Contam visitas a clientes e de prospecção concluídas (spec 003) no período. Média semanal = total ÷ (dias do período ÷ 7), com no mínimo 1 semana. Tipos: Aumento de mix, Padronização de produto, Positivação, Renegociação, Manutenção.
- **RN-010 — Meta recebida.** Cada filial recebe a meta da sua UF na BU; com várias filiais da BU na mesma UF, o rateio é pelo líquido dos 12 meses anteriores ao mês da meta (sem histórico: partes iguais). Meta de UF sem filial é redistribuída entre todas as filiais da BU pelo mesmo peso. Lançamentos manuais da diretoria guardados pelo sistema antigo não são lidos (RNT-009). A correspondência entre departamento e unidade do planejamento é fixa: 1 Nutrição, 2 Enfermagem, 8 Medicamento, 9 Estética e Injetáveis. O universo do rateio são as BUs de todos os coordenadores ativos, contadas uma vez cada, nunca o escopo de quem consulta.
- **RN-011 — Quem vê.** Coordenador vê as BUs dele; diretoria vê todas ("Todos os coordenadores") ou as de um coordenador; vendedor não vê a aba. Diretoria é sempre leitura, mesmo com papel de coordenador.
- **RN-012 — Rateio por ramo/UF.** A meta do vendedor em cada BU é repartida entre os ramos/UF da base de planejamento daquela BU, só nas UFs das filiais em que o vendedor atua, na proporção da base. Linha personalizada mantém o valor gravado; as automáticas dividem o que sobra (meta do vendedor na BU − personalizadas), na proporção da base, e a meta do vendedor na BU não muda. A soma das personalizadas não pode passar da meta do vendedor na BU. Ao gravar ramos de um vendedor, todos os ramos planejados dele na BU são gravados como estão na tela; só quando não há nenhuma linha automática a meta dele na BU passa a ser a soma das personalizadas, repartida entre as filiais na proporção atual. Ramo/UF com venda e sem planejamento aparece pelo realizado e não recebe meta.
- **RN-013 — Status do rateio.** "carregando"; "sem equipe no escopo"; "alterações não salvas" (há edição pendente); "rateio fechado" (|meta geral − distribuído| < R$ 0,01); "não distribuído" (distribuído = 0); senão "em aberto". Com filtro de UF ou ramo, os cards viram Meta do recorte, Realizado no recorte e Falta para a meta.
- **RN-014 — Status do vendedor.** Meta 0 → sem meta; atingimento ≥ 100% → acima; ≥ 80% → atenção; < 80% → risco.
- **RN-015 — Rateio rápido.** Dentro de cada BU: `Ratear igual` = meta da BU ÷ nº de vendedores; `Por realizado` = proporcional ao líquido (negativo conta zero); `Manter proporção` = proporcional à meta atual. Peso total zero → partes iguais.
- **RN-016 — Comparativo modular.** Abre com 2 blocos: trimestre corrente e o mesmo trimestre do ano anterior. Métrica: `Faturamento` (líquido) em todas as categorias; `Pedidos` em Cliente e Ramo; `Quantidade` em Produto. O gráfico mostra os 6 maiores; a busca sugere até 8 itens. Os demais filtros do Analytics valem para todos os blocos. Exportação `comparativo-analytics-AAAA-MM-DD.xlsx`: uma aba por categoria + métrica com colunas por bloco (valor, % do total) e variação de cada bloco contra o bloco 1 (Dif. e Dif. %, vazio quando a base é zero), aba "Base de dados" e aba "Parametros"; valores como número.
- **RN-017 — Comparativo mensal.** Para o mês escolhido (ano atual ou anterior): os dois meses anteriores fechados e o mês escolhido (parcial até hoje, se corrente, comparado com o mês anterior inteiro), líquido por cliente da carteira no escopo (mesmo cálculo da spec 006). Variação = mês − anterior; % vazio quando o anterior é zero. Recortes: Todos os clientes, Em queda, Em alta, Não compraram no mês (anterior > 0 e mês = 0), Novos no mês (só o mês > 0). Clientes zerados nos 3 meses não aparecem. Ordem: maior valor no mês anterior.
- **RN-018 — Campo de meta.** Aceita `1.500,50`, `1500.50` e `R$ 1.500,50` (RNT-011): o último separador é decimal quando seguido de 1 ou 2 dígitos, senão é de milhar (`1,500` = 1.500). Vazio ou negativo é inválido; zero é válido.
- **RN-019 — Gravação.** Vai só o que difere do gravado (diferença ≥ R$ 0,005). Tudo é validado antes (RN-012, RN-018) e gravado tudo ou nada; o servidor confere que quem grava coordena a BU, que o vendedor tem escopo ativo nela e que não é outro coordenador; zero linhas → erro (RNT-013). Sucesso: "Metas salvas: N vendedor(es) e M ajuste(s) por ramo/UF."; nada mudado: "Nenhuma alteração para salvar."; sem meta da diretoria: "Nenhuma meta da diretoria encontrada para o período."

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 / RN-004 | Meta 50.000, bruto 42.000, devolução 2.000 → líquido 40.000, falta 10.000, 80,0%, devolvido 4,8%; out/2026 com meta 125.000 e acumulado 121.750 em 13/10 e 127.550 em 14/10 → meta batida em 14/10 | regra de negócio |
| C-002 / RN-005 | 40.000 ÷ 11 × 22 = 80.000; out/2026 tem 22 dias úteis com 12/10 contado; período set/2026 encerrado com 30.000 → projeção 30.000 | regra de tela |
| C-003 / RN-002 | Venda de 1.000 na Filial 1 e 500 na Filial 2; filtro Filial 2 → líquido 500 em todos os 8 blocos | regra de negócio |
| C-004 / RN-007 | Carteira 40 → 25/15/6/2; dias sem compra em 15/10 com último pedido 05/10 = 10 | regra de negócio |
| C-005 / RN-003 | Bruno 30.000 em F1·Nutrição + 20.000 em F2·Medicamento → equipe de Carlos 30.000, de Dora 20.000 | regra de negócio |
| C-006 / RN-010 | DF 100.000, GO 300.000, Outros 40.000; pesos 1/2/1 mi → 110.000 / 220.000 / 110.000; sem histórico em GO → 150.000 + 150.000 | regra de negócio |
| C-007 | Lançamento manual antigo de 250.000 em F2·Nutrição e planejamento 220.000 → 220.000, origem planejamento | regra de negócio |
| RN-010 (departamento ↔ unidade) | Departamento 8 lê o planejamento de Medicamento; departamento 9, o de Estética e Injetáveis | regra de negócio |
| C-008 | Medicamento com 2 coordenadores em 8 filiais, planejamento 800.000 → meta geral 800.000 | regra de negócio |
| C-009 / RN-019 | 5 vendedores, 2 editados → 2 gravações; campo editado e reescrito com o mesmo valor → "Nenhuma alteração para salvar." | regra de negócio |
| C-010 / RN-018 | `1.500,50`→1500,5; `1500.50`→1500,5; `R$ 1.500,50`→1500,5; `1,500`→1500; `0`→0; vazio e `-10` → inválido; um inválido entre 3 → 0 gravações | regra de tela |
| C-011 | Gravação para BU não coordenada → 0 registros e mensagem "Nada foi alterado"; vendedor que é outro coordenador → recusado | regra de negócio |
| C-012 / RN-015 | 90.000 ÷ 3 = 30.000; realizados 50/30/20 mil → 45/27/18 mil; metas atuais 40/40/20 mil → 36/36/18 mil; realizados todos 0 → partes iguais | regra de tela |
| C-013 / RN-012 | 100.000 com bases 60/40 → 60.000/40.000; Clínica fixada 30.000 → Hospital 70.000 e BU 100.000; fixada 150.000 → recusado; as duas fixadas em 50.000 e 30.000 → BU 80.000; ramo sem planejamento não editável; vendedor só na Filial 1 (DF) de uma BU planejada em DF e GO → recebe só ramos de DF | regra de negócio |
| C-014 / RN-011 | Usuário DIRETORIA+COORDENADOR: gravação recusada; vendedor pede a aba → zero linhas | regra de negócio |
| C-015 / RN-016 | B1 10.000, B2 12.500 → Dif 2.500 e 25,0%; base 0 → Dif. % vazio; Seção oferece só Faturamento | regra de tela |
| C-016 / RN-017 | 80/100/60 mil → −40.000 e −40,0%; anterior 0 e mês 5.000 → NOVO e % vazio | regra de tela |
| C-017 / RN-001 | 31/12/2026–01/01/2026 recusado; 01/01/2024–31/12/2026 (36 meses) recusado; Último trimestre em 15/10/2026 = 01/08–31/10/2026 | regra de tela |
| RN-006 | Out/2026 meta 44.000 → 2.000 por dia útil; sábado 03/10 meta 0; coordenador em Time inteiro → linha = soma da equipe | regra de negócio |
| RN-008 | 15 clientes, ramo Hospital com 3 fora do top 10 → Faturamento por ramo inclui os 3; top por ramo usa líquido | regra de negócio |
| RN-009 | 8 visitas a clientes + 4 de prospecção concluídas em 30 dias → 12 visitas, média 2,8 | regra de negócio |
| RN-013 | Meta 90.000: distribuído 90.000 → rateio fechado; 0 → não distribuído; 60.000 → em aberto | regra de tela |
| RN-014 | Meta 10.000: realizado 10.000 → acima; 8.500 → atenção; 7.000 → risco; meta 0 → sem meta | regra de tela |
| RF-023 | Clique em barra do ranking de produtos → análise recortada por esse produto; clique em barra de ramo, fornecedor ou departamento → filtros inalterados | regra de tela |

Verificação manual:
- [ ] RF-019 — confirmação ao trocar Filial / BU com edição pendente; cancelar mantém os campos
- [ ] RF-012 — PDF do Comparativo mensal legível, com escopo e recorte no cabeçalho
- [ ] RNFT-003/004 — abas e popup de ramos usáveis em 360 px e em tema escuro

## Correções em relação ao sistema atual

Origem `A-nn` aponta para o anexo.

| Hoje | Na reconstrução | Origem |
|---|---|---|
| A meta lançada à mão pela diretoria (Gestão de Metas) prevalece sobre o planejamento | Meta da BU só do planejamento estratégico; lançamento manual não é lido (RNT-009, C-007) | decisão do usuário em 2026-11-03 |
| Gravação de meta (vendedor ou ramo/UF) barrada pela permissão grava zero linhas e responde sucesso | Responde "Nada foi alterado" (RNT-013) | `tasks.md` da raiz, "Pendente"; A-01 |
| Ajuste da meta total pela soma dos ramos é ignorado em silêncio quando a soma passa do total ou a BU é de outro coordenador | Validado antes; recusa responde erro | A-02 |
| Gravação em série pode parar no meio ("A gravação parou no meio: N vendedor(es) já foram salvos") | Tudo ou nada (RN-019) | A-03 |
| Meta do vendedor sem distribuição cai no cadastro antigo de metas | Zero e "Meta não distribuída" (RNT-009) | A-04 |
| Peso do rateio entre filiais e top produtos por ramo usam faturamento bruto | Líquido (RNT-008) | A-05 |
| Overview trunca o líquido em zero; aba Metas mostra negativo | Uma regra só (RN-003; ver Pendências) | A-06 |
| "Time inteiro" soma vendas do vendedor em BUs de outro coordenador | Só as BUs do coordenador (RNT-004) | A-07 |
| Substituto vê o titular por vínculo permanente no cadastro de funcionário, além das férias | Só com férias ATIVAS (RNT-010) | A-08 |
| Visão global e "Vendedor específico" liberadas também por um e-mail fixo | Só por papel (RNT-002) | A-09; pendências, item 5 |
| Usuário de comunicação excluído das regras de titular pelo e-mail | Excluído por cadastro (ver Pendências) | A-10 |
| Filtros Filiais e Seções ignorados em 7 dos 8 blocos | Valem para todos (RN-002) | A-11 |
| Linha de meta da evolução usa sempre a meta do usuário logado e divide por dias corridos | Segue o escopo; meta ÷ dias úteis (RN-006) | A-12 |
| `Último mês` mostra o mês corrente | Rótulo `Mês atual` | manual, seção 8 "Filtros da análise" |
| Intervalo personalizado sem validação; acima de 32 meses a evolução é cortada em silêncio | Início ≤ fim e até 24 meses, com mensagem (RN-001) | A-13 |
| Faturamento por ramo, segmento e Comparativo (Cliente, Ramo, Produto) só sobre os 10 maiores | Sobre todo o recorte (RN-008/016) | A-14 |
| Tabelas mostram 8 das 50 devoluções da página e 8 dos 10 top clientes | Todas as linhas | A-15 |
| Colunas em R$ ordenam como texto | Ordem numérica (RF-022) | manual, seção 8 "Gráficos e tabelas" |
| Falha de bloco mostra o erro técnico concatenado | Mensagem padrão por bloco (C-007 da 000, RNFT-007) | A-16 |
| `Ratear igual`/`Por realizado`/`Manter proporção` com todas as BUs abertas misturam as metas | Rateio dentro de cada BU (RN-015) | manual, seção 8 "Tela"; A-17 |
| Rateio por ramo/UF sobre a meta somada de todas as BUs do vendedor; a gravação ajusta por BU e pode não fechar | Rateio por vendedor × BU (RN-012) | A-18 |
| `Exportar relatório` da aba Metas baixa a planilha do Comparativo | Baixa as metas (RF-021) | A-19 |
| Diretoria em leitura só na tela | Também no servidor (RF-020) | A-20 |
| Comparativo abre com 1º trim/2025 × 1º trim/2026 fixos | Trimestre corrente × mesmo do ano anterior (RN-016) | A-21 |
| Métrica "QTD" é pedidos em Cliente/Ramo, quantidade em Produto e ignorada em Seção/Departamento | Nomes `Pedidos`/`Quantidade`; Seção e Departamento só Faturamento | A-22 |
| Distribuição por tipo de visita, visitas de prospecção e fornecedores ausentes da última versão registrada | Presentes (RF-008/010, RN-009) | A-23 |
| Dias sem compra contados até o fim do período, no futuro | Até hoje (RN-007) | A-24 |
| Lista de Inativos/Em risco cortada em 500 | Paginada (RNFT-001) | A-25 |
| Ramos personalizados que somam menos que a meta do vendedor na BU reduzem a meta dele para a soma | A sobra vai para os ramos automáticos e a meta na BU se mantém (RN-012) | A-26 |
| Aba Metas carregava em toda abertura do Analytics (~100 execuções) | Só quando aberta (RNF-002) — já corrigido, manter | `docs/modulos/analytics.md`, "Aba Metas" |

## Fora de escopo

- [ ] Matriz do acompanhamento semanal e a visão `Semanal` do Comparativo (spec 006).
- [ ] Meta do Painel de Gestão: tela cancelada em 2026-11-03 (D4).
- [ ] Lançar meta da BU: a meta vem do planejamento estratégico, que é outro sistema (RNT-009). A tela Gestão de Metas foi cancelada em 2026-11-03.
- [ ] Cards de meta do Dashboard (spec 005), que usam as mesmas regras RN-003/004.
- [ ] Planejamento estratégico e sua rotina semanal de metas: só leitura aqui.
- [ ] Previsão de vendas além da projeção linear por dias úteis, e desconto de feriados nos dias úteis (RNT-016).
- [ ] Cadastro da correspondência departamento ↔ unidade do planejamento: continua fixa (RN-010).
- [ ] Comparar o mês corrente com os mesmos dias do mês anterior no Comparativo mensal: compara com o mês anterior inteiro (RN-017).
- [ ] Histórico de alterações de meta por vendedor (só o valor vigente é guardado).
- [ ] Exportação das abas Overview, Clientes e Produtos.

## Pendências

- [x] Decidido em 2026-10-30: aparece negativo em todas as telas.
- [x] Decidido em 2026-10-30: dias úteis = segunda a sexta, sem descontar feriados (RNT-016).
- [x] Decidido em 2026-10-30: no rateio por ramo/UF, o vendedor recebe só as UFs das filiais em que atua.
- [x] Decidido em 2026-10-30: a sobra dos ramos personalizados vai para os ramos automáticos; a meta do vendedor na BU não diminui.
- [x] Decidido em 2026-10-30: lançamento manual de meta zero é ignorado e vale o planejamento (como hoje). *Sem efeito desde 2026-11-03: nenhum lançamento manual é lido; a meta vem só do planejamento.*
- [x] Decidido em 2026-10-30: a correspondência departamento ↔ unidade do planejamento continua fixa.
- [x] Decidido em 2026-10-30: o bloqueio em Executivas de Venda; não há e-mail fixo.
- [x] Decidido em 2026-10-30: o Comparativo mensal do mês corrente compara com o mês anterior inteiro (como hoje).
- [x] Decidido em 2026-10-30: o clique em gráfico filtra só pelos rankings de clientes e de produtos (RF-023).

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente fora do anexo
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-010, C-011, C-013, C-017)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto

---

## Anexo — Rastreabilidade de origem

**Rotas cobertas:** `/analytics` (abas Overview, Clientes, Produtos, Metas, Modular — o rótulo "Modular" é a antiga aba Comparativo; a aba Semanal citada no manual e em `docs/modulos/analytics.md` não existe mais no código e virou a visão `Semanal` de `/comparativo`) e `/comparativo`.

**Páginas atuais:** `frontend/src/pages/AnalyticsPage.tsx`, `frontend/src/pages/metas.utils.ts` (+ `metas.utils.test.ts`), `frontend/src/pages/ComparativoPage.tsx`, `frontend/src/components/ComparativoMensal.tsx`, `frontend/src/lib/comparativoMensalPdf.ts`, `frontend/src/lib/excel-export.ts`, `frontend/src/components/CoordinatorScopeFilter.tsx`. `hooks/useDrill.ts`/`useHighlight.ts` existem mas não são usados pelo Analytics.

**Server Functions (todas as do módulo):**

| Alias (id) | Cobre | Tabelas lidas/gravadas | Situação |
|---|---|---|---|
| `analyticsRcaFiltros` (181) | RF-002 | `IMP_VENDAS_DASHBOARD_TOTVS_RCA`, `EQUIPE_CLIENTE`, `BU_VENDEDOR`, `FILIAL`, `SECAO` | em uso |
| `analyticsRcaMetaResumo` (182) | RF-003, RN-003/004 | `IMP_VENDAS_DASHBOARD_TOTVS_RCA`, `IMP_DEVOLUCOES_TOTVS`, `EQUIPE_CLIENTE`, `BU_VENDEDOR`, `CLIENTE_TITULAR_DEPTO`, `USUARIO_BLOQUEIO`, `FUNCIONARIOS`, `FERIAS_VENDEDOR`, `VENDEDOR_RCA`, `COORDENADORES(_BU)`, `USUARIO_CARGO`, `METAS_BU_VENDEDOR`, `METAS_VENDEDOR` | em uso (também Dashboard, spec 005) |
| `analyticsRcaEvolucao24m` (183) | RF-004, RN-006 | idem 182 | em uso |
| `analyticsRcaMixProdutos` (184) | RF-005/010/011, RN-008 | idem 182 + produtos | em uso |
| `analyticsRcaCarteira` (185) | RF-007, RN-007 | idem 182 | em uso |
| `analyticsRcaTopClientes` (186) | RF-009/010/011, RN-008 | idem 182 | em uso |
| `analyticsRcaVisitas` (187) | RF-008, RN-009 | `VISITAS` (`PROSPECT_VISITAS` perdido na última versão) | em uso |
| `analyticsRcaDevolucoes` (188) | RF-006 | `IMP_DEVOLUCOES_TOTVS` + escopo | em uso |
| `analyticsRcaEvolucaoCliente` (287) | RF-009 | idem 182 | em uso |
| `painelCoordenadorMetasBuRecebidas` (195) | RF-013/014, RN-010/011 | `INTG_MONTHLY_BILLING_TARGET`, `INTG_BUSINESS_UNIT`, `INTG_REGION`, `FILIAL`, `METAS_BU`, `METAS_BU_VENDEDOR`, `COORDENADORES(_BU)`, `BU_VENDEDOR`, `IMP_VENDAS_DASHBOARD_TOTVS_RCA` | em uso (também `AcompanhamentoSemanalPage`, spec 006) |
| `painelCoordenadorMetasVendedoresBu` (196) | RF-015, RN-014 | `METAS_BU_VENDEDOR`, `BU_VENDEDOR`, `EQUIPE_CLIENTE`, vendas e devoluções | em uso |
| `painelCoordenadorSalvarMetaVendedorBu` (197) | RF-018, RN-019 | grava `METAS_BU_VENDEDOR` | em uso |
| `metasVendedorRamoUfAplicadas` (295) | RF-017, RN-012 | `VW_META_VENDEDOR_MES`, `METAS_BU_VENDEDOR_RAMO_UF`, `INTG_*` (inclui `INTG_ACTIVITY_SEGMENT`) | em uso |
| `painelCoordenadorSalvarMetaVendedorRamoUf` (296) | RF-017/018 | grava `METAS_BU_VENDEDOR_RAMO_UF` (`CODFILIAL` = 0) | em uso |
| `painelCoordenadorSincronizarMetaVendedorPorRamo` (396) | RN-012 | atualiza `METAS_BU_VENDEDOR` | em uso |
| `calcularBwSemanal` (104) | RF-012, RN-017 | ver spec 006 (dona) | em uso |
| `dadosUsuarioLogado` (28) | RF-012 | ver spec 001 (dona) | em uso |
| `analyticsVendasVendedor` (16), `analyticsVendasCategoria` (17), `analyticsEvolucaoMensal` (18), `analyticsMixProdutos` (19) | — | legado | **sem uso** |
| `vendasMensais` (2), `metaDefinir` (122), `metaListarHistorico` (124) | — | `METAS_VENDEDOR` (legado) | **sem uso** |
| `metaRealizadoProjecao` (123) | — | spec 005 | uso só no Dashboard |

Versões lidas (a mais recente vence): `backend/migrations/update-sf-analyticsrca*-17926766xx.sql` e `update-sf-analyticsrcametaresumo-1792678676.sql`, `update-sf-analyticsrcaevolucaocliente-1792595111.sql`, `update-sf-painelcoordenadormetasburecebidas-1792677293.sql`, `update-sf-painelcoordenadormetasvendedoresbu-1792678676.sql`, `update-sf-painelcoordenadorsalvarmetavendedorbu-1792677308.sql`, `update-sf-metasvendedorramoufaplicadas-1792680958.sql`, `create-sf-painelcoordenadorsincronizarmetavendedorporramo-1792690808.sql`; SF 296 em `backend/add-metas-vendedor-ramo-personalizadas.mjs` + `backend/fix-metas-ramo-uf-e-lote.mjs`; `backend/fix-metas-bu-escopo-duplicado.mjs` (C-008).

**Origem das correções:**

| Id | Onde |
|---|---|
| A-01 | SF 197 e 296: `INSERT … SELECT` condicionado a `COORDENADORES_BU`; `AnalyticsPage.tsx:1229-1257` só testa `result.error` |
| A-02 | SF 396: `WHERE … FORA_DO_ESCOPO = 0 AND R.NOVO_TOTAL <= T.TOTAL + 0.01` (UPDATE sem linha não gera erro) |
| A-03 | `AnalyticsPage.tsx:1227-1283` (laço de chamadas; mensagem na linha 1278) |
| A-04 | SF 182 `METAS_PERIODO`, `update-sf-analyticsrcametaresumo-1792678676.sql:402`; SF 295 lê `VW_META_VENDEDOR_MES` (cai em `METAS_VENDEDOR`), linha 112 |
| A-05 | SF 195 `PESO_BASE` (`SUM(V.TOTAL)`, linha 112 do arquivo 1792677293); SF 184 `TOP_PRODUTOS_RAMO` (`VRP.FATURAMENTO_BRUTO AS VALOR`, linha 469) |
| A-06 | SF 182/183/185/186 `GREATEST(bruto − devolvido, 0)`; SF 196 `REALIZADO_LIQUIDO` sem `GREATEST` |
| A-07 | SF 182 e irmãs, CTE `BU_SCOPE` (linha 205): junta todo `BU_VENDEDOR` do vendedor alvo |
| A-08 | SF 182 e irmãs, `TARGET_USERS` linha 89 (`FUNCIONARIOS.ID_SUBSTITUTO` sem data) |
| A-09 | SF 182 linhas 135/162, 183:163, 186:163, 195/196 `IS_DIRETORIA` (`ti@benenutri.com`) |
| A-10 | CTEs `TITULARES_NORM`/`EMPATES_*` de 182–188 e 196 (`comunicacao@benenutri.com`) |
| A-11 | SFs 181–188 não leem `{{filiais}}` nem `{{secoes}}` (só a 287 lê) |
| A-12 | SF 183 `METAS … WHERE MBV.VENDEDOR_ID = :VAR_USER` (linha 416); meta diária ÷ `DIAS_PERIODO` |
| A-13 | SF 183 `NUMS` de 0 a 31; `AnalyticsPage.tsx` `resolvePeriod` sem validação |
| A-14 | SF 186 `LIMIT 10` (linha 412); `AnalyticsPage.tsx:1668` (`ramoTotals` sobre top 10), 1586-1620 (Comparativo) |
| A-15 | `AnalyticsPage.tsx:2719` e `:2795` (`slice(0, 8)`) |
| A-16 | `AnalyticsPage.tsx:2171-2179` (`data.errors.join`) |
| A-17 | `AnalyticsPage.tsx:1327-1363` (`aplicarRateioRapido` sobre todas as linhas carregadas) |
| A-18 | SF 295 `META_TOTAL`/`TARGET_BASE` por vendedor (todas as BUs); `AnalyticsPage.tsx` `vendedorTotalKey`; SF 396 por `CODEPTO` |
| A-19 | `AnalyticsPage.tsx:2407` (`onClick={exportarComparativoExcel}`) |
| A-20 | `AnalyticsPage.tsx:827` (`canEditMetas` só na tela); SF 197/296 não testam `USUARIO_CARGO` |
| A-21 | `AnalyticsPage.tsx:797-800` |
| A-22 | `AnalyticsPage.tsx:1591`, `:1601`, `:1620` |
| A-23 | `update-sf-analyticsrcavisitas-1792676664.sql` (sem `TIPO_VISITA`/`PROSPECT_VISITAS`, antes acrescentados por `backend/update-indicador-tipos-visita.mjs` e `update-analytics-visitas-prospeccao.mjs`); `update-sf-analyticsrcamixprodutos-1792676662.sql` (sem `FORNECEDOR`, antes `backend/update-analytics-fornecedores-produtos.mjs`) — conferir no projeto remoto |
| A-24 | SF 185 linha 548 (`DATEDIFF(DT_FIM, ULTIMO_PEDIDO)`) |
| A-25 | `AnalyticsPage.tsx:1020-1023` (limite 500) |
| A-26 | SF 396 reescreve `METAS_BU_VENDEDOR` com a soma dos ramos gravados em `METAS_BU_VENDEDOR_RAMO_UF` |
