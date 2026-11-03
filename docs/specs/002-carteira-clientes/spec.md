# Spec: Carteira de clientes

**ID:** 002-carteira-clientes · **Status:** em revisão · **Data:** 2026-10-30

> Spec de **reconstrução**: descreve o comportamento atual já corrigido. Regras
> transversais são citadas pelo id da spec 000 (`RNT-00N`, `RNFT-00N`). Proibido
> citar stack, tabela ou componente fora do anexo **Rastreabilidade de origem**.

## Problema

A carteira é a lista de trabalho diária do vendedor: quem visitar, quem esfriou,
quem parou de comprar. Hoje a mesma carteira tem três regras de curva diferentes,
a coluna "Status" mostra a curva com nome de status de cadastro, a ordenação só
reordena os 10 clientes da página, a temperatura dá 15 pontos a quem nunca comprou
e conta visitas que não aconteceram, os indicadores são calculados baixando a
carteira inteira para o navegador e a remoção feita pela gestão apaga o cliente de
todos os vendedores. Quando dois vendedores dividem o mesmo cliente no mesmo
escopo, ambos o veem e ambos contam a venda até que alguém defina o titular.

## Resultado esperado

O vendedor abre a carteira, vê os clientes dele com curva, temperatura e dias sem
visita calculados por uma regra só, ordena e filtra a carteira inteira, adiciona
clientes livres do seu escopo e consulta o histórico completo de cada cliente; o
coordenador decide quem é o titular quando o cliente é disputado.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| Vendedor | Ver e priorizar a carteira, adicionar clientes livres, consultar a ficha (só leitura) e o histórico, registrar contato sem visita, criar e acompanhar prospects na aba `Prospects` | diária |
| Substituto de férias | Ver e trabalhar a carteira do titular durante as férias ativas | eventual |
| Coordenador | Ver a carteira da equipe pelo filtro de escopo; definir o titular de clientes disputados | semanal |
| Diretoria | Ver carteiras de qualquer coordenador; definir titulares em qualquer BU | eventual |

## Cenários

**C-001 — Indicadores da carteira**
- **Dado que** Ana tem 40 clientes na carteira, 32 com cadastro Ativo, faturamento líquido no mês de R$ 120.000,00 e temperatura média 64
- **Quando** abre `MINHA CARTEIRA (40)`
- **Então** vê `Clientes ativos` = "32 de 40" e "80,0% da base atual", `Receita atual da carteira` = R$ 120.000,00, `Ticket médio` = R$ 3.750,00 e `Score da carteira` = 64 · Morno

**C-002 — Visita pendente por curva**
- **Dado que** o cliente X (curva A) teve a última visita concluída há 9 dias, Y (curva B) há 10 dias e Z (curva C) nunca foi visitado
- **Quando** Ana clica em `Ver clientes` no card `Visita pendente por curva`
- **Então** a lista mostra X ("Limite da curva: 8 dias") e Z, e não mostra Y

**C-003 — Temperatura de um cliente ativo**
- **Dado que** o cliente W comprou há 20 dias, tem ciclo médio de compra de 20 dias, comprou R$ 11.500 nos últimos 60 dias contra R$ 10.000 nos 60 dias anteriores e teve a última visita concluída há 45 dias
- **Quando** Ana clica na temperatura de W
- **Então** vê Recência 30/30, Frequência 25/25, Tendência 25/25, Visitas 12/20, total 92 · Quente e a recomendação "Agende uma visita presencial para fortalecer o relacionamento."

**C-004 — Cliente sem histórico é Frio (0)**
- **Dado que** o cliente V entrou na carteira hoje, sem compras e sem visitas
- **Quando** a carteira é exibida
- **Então** V aparece com `Frio (0)`, `Dias sem visita` = "—" e `Última compra` = "—"

**C-005 — Curva automática e curva fixada**
- **Dado que** o cliente K comprou R$ 24.000 nos últimos 90 dias, teve 3 visitas concluídas nos últimos 60 dias, comprou há 10 dias e foi visitado há 10 dias
- **Quando** a carteira é exibida
- **Então** K tem score de ranking 76 e curva B; se Ana fixar a curva D no lápis, K passa a D (limite de 61 dias sem visita) para Ana e para o coordenador que olha a equipe

**C-006 — Ordenação vale para a carteira inteira**
- **Dado que** Ana tem 25 clientes e está na página 2
- **Quando** escolhe `Nome A–Z`
- **Então** a tela volta à página 1 com os 10 primeiros nomes em ordem alfabética entre os 25

**C-007 — Busca inteligente com erro de digitação**
- **Dado que** a carteira tem "HOSPITAL SÃO LUCAS LTDA", CNPJ 12.345.678/0001-90, código do ERP 4471
- **Quando** Ana busca "hospitl sao lucas", "12345678000190" ou "cod 4471"
- **Então** o cliente aparece nas três buscas, em primeiro lugar

**C-008 — Adicionar cliente disponível**
- **Dado que** Ana tem os escopos Filial 1 · Nutrição · Seção 2 e Filial 1 · Nutrição · Seção 5, e o cliente Q (pessoa jurídica) não tem responsável na Seção 2
- **Quando** em `CLIENTES DISPONÍVEIS` ela clica `Adicionar` na linha de Q marcada "Filial 1 · Nutrição · Seção 2"
- **Então** vê `Cliente adicionado à sua carteira com sucesso.`, Q some da lista de disponíveis dessa seção e aparece em `MINHA CARTEIRA (41)`

**C-009 — Cliente já tem responsável**
- **Dado que** Bruno adicionou Q na Seção 2 um segundo antes de Ana
- **Quando** Ana clica `Adicionar` em Q
- **Então** vê `Este cliente já possui responsável no mesmo escopo da sua carteira.` e nada é gravado

**C-010 — Vendedor sem escopo ativo**
- **Dado que** Diego não tem nenhum escopo ativo
- **Quando** abre `CLIENTES DISPONÍVEIS`
- **Então** vê `Seu usuário não possui vínculo ativo de filial/seção para adicionar clientes.` e a lista vem vazia

**C-011 — Remover só o próprio vínculo**
- **Dado que** o cliente X está na carteira de Ana (Filial 1 · Nutrição) e de Bruno (Filial 1 · Medicamento)
- **Quando** Ana confirma "Deseja remover X da sua carteira?"
- **Então** vê `Cliente removido da sua carteira com sucesso.`; X continua na carteira de Bruno

**C-012 — Substituto de férias vê a carteira do titular**
- **Dado que** Ana está em férias ativas de 01/11 a 15/11 com Bruno como substituto
- **Quando** em 05/11 Bruno abre a carteira
- **Então** vê seus 35 clientes e os 40 de Ana marcados "Cobertura"; não consegue remover clientes de Ana; em 16/11 os 40 somem (RNT-010)

**C-013 — Titular definido pelo coordenador**
- **Dado que** o cliente H está na carteira de Ana e de Bruno no mesmo escopo Filial 1 · Nutrição · Seção 2 e ambos o veem (situação `Pendente`)
- **Quando** o coordenador Carlos escolhe Ana em `Titulares de Clientes` e clica `Salvar`
- **Então** vê "H · Nutrição / Seção 2: titular definido para Ana Souza."; H sai da carteira exibida de Bruno nesse escopo e as vendas de H nesse escopo contam só para Ana

**C-014 — Titular automático**
- **Dado que** o cliente J está na carteira de um único vendedor, Ana, no escopo Filial 1 · Nutrição
- **Quando** Ana adiciona J
- **Então** J aparece em `Titulares de Clientes` como `Automático` com titular Ana, sem ação do coordenador

**C-015 — Histórico do cliente**
- **Dado que** o cliente X tem 3 visitas concluídas, 2 atividades concluídas, 1 relato avulso, 30 pedidos faturados no escopo de Ana, 4 pedidos em outra BU e 1 mix enviado ao histórico
- **Quando** Ana abre o `HISTÓRICO DO CLIENTE` de X sem filtros
- **Então** a linha do tempo mostra 37 registros em 2 páginas de 20 e 17 (as 7 interações e os 30 pedidos, na ordem das datas); o resumo da ficha soma os 30 pedidos; os 4 da outra BU não aparecem

**C-016 — Relato avulso em cliente fora da carteira**
- **Dado que** o cliente Z não está na carteira de Ana nem de alguém que ela cubra
- **Quando** um pedido de gravação de relato para Z chega em nome de Ana
- **Então** o relato é recusado com "nada foi alterado: cliente fora da sua carteira" (RNT-013)

**C-017 — Novo cliente prospecto**
- **Dado que** Ana abre `+ Novo cliente prospecto` e deixa `Razão social ou nome` vazio
- **Quando** clica em salvar
- **Então** vê `Informe a razão social ou nome do cliente prospecto.`; preenchendo, vê "Cliente prospecto criado. Ele já pode ser usado em visitas de prospecção na agenda.", o prospect aparece na aba `Prospects` e não entra na carteira

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE listar a carteira do escopo escolhido (RNT-003), 10 por página, com total | C-001; filtro de escopo como nas outras telas | must |
| RF-002 | O sistema DEVE calcular os 5 indicadores da carteira no servidor, sobre a carteira inteira filtrada | C-001; com 5.000 clientes os cards aparecem em até 2 s | must |
| RF-003 | O sistema DEVE filtrar por busca, ramo e status do cadastro e ordenar a carteira inteira | C-006, C-007; `Limpar filtros` volta ao padrão | must |
| RF-004 | O sistema DEVE mostrar por cliente: curva, nome, código do ERP, sino de alerta não lido, selo `Queda`, ramo, dias sem visita, última compra, temperatura, status e ações | Colunas de RN-011 | must |
| RF-005 | O sistema DEVE mostrar o detalhe da temperatura por fator, com recomendação | C-003 | must |
| RF-006 | O sistema DEVE listar os clientes com visita pendente pela curva | C-002 | must |
| RF-007 | O sistema DEVE permitir fixar a curva manual e mostrar a ficha do cliente só para leitura | C-005; RN-014: a ficha não tem campo editável | must |
| RF-008 | O sistema DEVE permitir remover o cliente da própria carteira com confirmação | C-011 | must |
| RF-009 | O sistema DEVE listar clientes disponíveis por escopo do vendedor e adicioná-los numa ação única | C-008, C-009, C-010 | must |
| RF-010 | O sistema DEVE mostrar o histórico do cliente (linha do tempo e pedidos), com detalhe de visita, pedido e mix | C-015 | must |
| RF-011 | O sistema DEVE permitir registrar relato avulso de contato sem visita | C-016; RN-016 | should |
| RF-012 | O sistema DEVE permitir criar cliente prospecto a partir da carteira | C-017 | should |
| RF-013 | O sistema DEVE manter os titulares por cliente × filial × departamento × seção e aplicá-los à carteira e às vendas | C-013, C-014 | must |
| RF-014 | O sistema DEVE oferecer a tela `Titulares de Clientes` com filtros, totais e definição do titular | C-013; RN-020 | must |
| RF-015 | O sistema DEVE abrir a carteira com a busca preenchida ou o histórico de um cliente a partir de um endereço direto | Endereço com o cliente 1234 abre a carteira buscando 1234; endereço de histórico abre a aba Histórico com 1234 | should |
| RF-016 | O sistema DEVE mostrar a `Legenda` com Temperatura, Alerta de Queda, Alertas Inteligentes e Mix de Produtos | Textos de RN-007, RN-008 e RN-012 | could |
| RF-017 | O sistema DEVE mostrar o gráfico "Distribuição por ramo de segmento" da carteira filtrada | Soma das barras = total da carteira filtrada | could |
| RF-018 | O sistema DEVE oferecer a 4ª aba `Prospects` na tela Clientes, com a lista de prospects (etapa, contatos, converter em cliente) pelas regras da spec 008 | A tela Clientes tem as abas `MINHA CARTEIRA`, `CLIENTES DISPONÍVEIS`, `HISTÓRICO DO CLIENTE` e `PROSPECTS`, nessa ordem; a aba mostra os mesmos prospects que a spec 008 libera para o usuário | must |

## Requisitos não-funcionais

Valem RNFT-001, RNFT-002, RNFT-003 e RNFT-005. Específicos:

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Busca, ordenação, filtros e indicadores rodam no servidor; a tela nunca baixa a carteira inteira | Carteira de 5.000 clientes: busca responde em até 2 s com no máximo 2 consultas |
| RNF-002 | Temperatura e score de ranking são calculados uma vez por carga, não por cliente | Abrir a carteira faz no máximo 6 consultas |

## Entidades do domínio

- **Vínculo de carteira** — cliente ↔ vendedor numa filial e seção do escopo dele, com curva manual opcional.
- **Titular** — vendedor dono de um cliente numa filial + departamento + seção. Origem automática (único candidato) ou manual (definido por coordenador/diretoria).
- **Candidato a titular** — vendedor que tem o cliente na carteira e escopo ativo naquela filial + departamento + seção, não bloqueado.
- **Cliente disponível** — pessoa jurídica de uma filial + departamento + seção do escopo do vendedor sem nenhum vínculo de carteira nesse escopo.
- **Temperatura** — nota 0–100 do relacionamento (RN-007). **Score de ranking** — nota 0–100 que define a curva automática (RN-004).
- **Relato avulso** — registro de contato com o cliente sem visita (ligação, WhatsApp etc.).
- **Prospect** — empresa ainda não cliente do ERP (spec 008).

## Regras de negócio

- **RN-001 — Carteira exibida.** É a soma dos vínculos dos vendedores do escopo escolhido (RNT-003/004), incluindo, para o substituto, os do titular em férias ATIVAS (RNT-010), marcados "Cobertura". Ramo Pessoa Física nunca entra. Um cliente aparece uma vez por tela, mesmo com vínculos em mais de um escopo.
- **RN-002 — Titularidade.** Para cada cliente × filial × departamento × seção: com um só candidato, ele é titular automático; com dois ou mais e sem titular, a combinação fica `Pendente` e todos os candidatos a veem; com titular, só o titular vê o cliente nessa combinação e só para ele contam as vendas dela (complementa RNT-007). Usuário bloqueado nunca é candidato nem titular, e um titular bloqueado não tira o cliente de ninguém.
- **RN-003 — Recalcular titulares.** Os automáticos são recalculados logo após qualquer mudança de carteira ou de escopo e, por segurança, uma vez por dia. Titular automático que deixou de ser candidato único é removido; titular manual cujo vendedor deixou de ser candidato é removido; titular manual válido nunca é alterado pelo recálculo.
- **RN-004 — Score de ranking (0–100)** = 45% compras (faturamento líquido dos últimos 90 dias ÷ R$ 30.000 × 100, máx. 100) + 25% visitas (visitas concluídas nos últimos 60 dias × 20, máx. 100) + 20% recência de compra (≤ 7 dias = 100; ≤ 15 = 85; ≤ 30 = 65; ≤ 45 = 40; acima ou nunca = 15) + 10% recência de visita (≤ 7 dias = 100; ≤ 15 = 80; ≤ 30 = 55; ≤ 45 = 30; acima ou nunca = 10). Uma casa decimal.
- **RN-005 — Curva.** Automática: A se score ≥ 80; B se ≥ 55; C abaixo. D só manual. A curva manual, fixada no lápis, prevalece sobre a automática e vale em qualquer escopo de visualização; é única por cliente na carteira do vendedor. É a mesma curva em todas as telas.
- **RN-006 — Visita pendente por curva.** Limite de dias desde a última visita concluída pelo dono da carteira: A 8, B 16, C 32, D 61. Acima do limite, ou cliente nunca visitado, conta como pendente.
- **RN-007 — Temperatura (0–100).** Recência (30): última compra há < 30 dias = 30; < 60 = 20; < 90 = 10; senão 0. Frequência (25): sem ciclo médio = 0; dias sem comprar ≤ 1,1 × ciclo = 25; ≤ 1,3 × = 15; ≤ 1,6 × = 5; acima = 0. Tendência (25): variação das compras dos últimos 60 dias contra os 60 dias anteriores: > +10% = 25; de −10% a +10% = 15; de −30% a −10% = 5; pior = 0; sem compra nos dois períodos = 0; sem base anterior e com compra recente = 25. Visitas (20): última visita concluída pelo dono da carteira há < 30 dias = 20; < 60 = 12; < 90 = 5; nenhuma = 0. Ciclo médio = média dos intervalos entre dias com compra. Compras = faturamento líquido no escopo (RNT-007/008).
- **RN-008 — Classificação.** Quente ≥ 70; Morno 40–69; Frio < 40. `Score da carteira` = média da temperatura dos clientes filtrados, com a mesma classificação.
- **RN-009 — Recomendação.** Pelo fator com menor proporção de pontos: Recência → "Priorize um contato esta semana para reativar o cliente."; Frequência → "Ciclo de compra ultrapassado — cliente pode estar comprando de concorrente."; Tendência → "Volume em queda — investigue o motivo na próxima visita."; Visitas → "Agende uma visita presencial para fortalecer o relacionamento.". Empate: a ordem acima.
- **RN-010 — Indicadores.** `Clientes ativos` = clientes com cadastro Ativo ÷ total, em "NN de {total}" e percentual (RNT-011). `Receita atual da carteira` = faturamento líquido do mês corrente dos clientes da carteira, no escopo (RNT-007/008). `Ticket médio` = receita ÷ clientes ativos; sem ativos, "—".
- **RN-011 — Colunas.** Dias sem visita = dias desde a última visita concluída ao cliente pelo dono da carteira exibida (vermelho acima de 30); Última compra = dias desde a última compra no escopo (vermelho acima de 25); sem dado, "—". `Status` = status do cadastro (Ativo, Inativo, Em risco), o mesmo do filtro e do card. Nome do cliente completo, com código do ERP abaixo.
- **RN-012 — Sinais.** Sino vermelho: o cliente tem ao menos um alerta inteligente não lido do usuário (spec 008), considerando todos os alertas. Selo `Queda`: queda de compra de 30% ou mais, limite fixo e igual para todos (não há ajuste por vendedor) — queda (%) = (anterior − atual) ÷ anterior × 100, com uma casa, comparando as compras do dia 1 até hoje do mês corrente com o mesmo intervalo do mês anterior, só se o período anterior teve compras.
- **RN-013 — Ordenação e filtros.** Ordenações: Ranking A→D (padrão), D→A, Nome A–Z, Z–A, Status, Dias sem visita. Com busca preenchida, a ordem é por relevância. Ramos do filtro vêm do cadastro de clientes, sem Pessoa Física, mais `Sem ramo`. Trocar filtro ou ordenação volta à página 1.
- **RN-014 — Ficha do cliente (só leitura).** Mostra os dados do cadastro vindos do ERP: Razão Social, Nome Fantasia, CNPJ, Segmento, Cidade, UF, Telefone, E-mail e Endereço. Nenhum campo é editável pela tela e não há botão de salvar; correção de cadastro é feita no ERP e chega pela rotina de clientes (RNT-015). A curva manual é fixada pelo lápis da lista (RN-005), não pela ficha. Abre a ficha quem vê o cliente na carteira exibida.
- **RN-015 — Remoção.** Remove apenas os vínculos do próprio usuário com o cliente; vínculos de outros vendedores ficam. Substituto não remove clientes do titular. Transferir entre vendedores é do coordenador (spec 010).
- **RN-016 — Relato avulso.** Data (não futura), hora opcional, tipo de contato (Ligação, WhatsApp, E-mail, Reunião on-line, Outro) e texto obrigatório de até 4.000 caracteres. Só para cliente da carteira do usuário ou de titular coberto. Falha: "Não foi possível salvar o relato. Tente de novo.".
- **RN-017 — Histórico.** Linha do tempo, mais recente primeiro: Visita (planejamento, relato, `Ver relato completo`), Atividade concluída vinculada ao cliente, Relato avulso, Mix enviado ao histórico pelo Mix Builder (salvar não basta) e Pedido faturado: vendas faturadas do ERP dentro do escopo do vendedor (RNT-007), com "Pedido #número", itens, valor e `Ver detalhes` (Produto, Quantidade, Preço unitário, Desconto, Total). Os pedidos entram na mesma linha do tempo, na ordem das datas, e não numa lista à parte. Filtros de cliente, ramo, tipo e período `De`/`Até` valem para todos os registros, não só a página aberta. 20 por página. Bloco "Últimas visitas da última semana": visitas do vendedor, com "Relato ok" ou "Pendente". Com cliente escolhido, a aba abre com a ficha dele (código, cidade, ramo, curva, temperatura e status da carteira, `Trocar cliente` e `Registrar relato`) e o resumo do período: `Última visita` (dias sem visita da carteira), `Último pedido` (o mais recente do filtro), `Faturado no período` (soma de todos os pedidos do filtro, não só da página) e `Ticket médio` (faturado ÷ pedidos). A linha do tempo vem agrupada por mês; o tipo se escolhe por botões (`Tudo` e um por tipo) e o período `De`/`Até` fica num botão só (`Todo o período` sem datas). Sem cliente, o seletor e o filtro de ramo ficam no lugar da ficha.
- **RN-018 — Busca inteligente** (amplia RNT-014). Campos: nome fantasia, razão social, CNPJ, código do ERP, identificador interno, cidade, UF, ramo e segmento. Ignora acentos, maiúsculas e pontuação; ignora as palavras "cliente", "clientes", "id", "codigo", "cod", "codcli", "numero", "n"; cada palavra precisa casar com algum campo; tolera 1 letra errada em palavras de 4 a 6 letras e 2 em 7 ou mais; palavras com menos de 4 letras exigem casamento exato. Vale para Carteira, Disponíveis, Histórico e seletor de clientes de Atividades.
- **RN-019 — Disponíveis.** Para cada escopo ativo do vendedor (filial + departamento + seção; seção vazia = todas), lista pessoas jurídicas daquela BU sem vínculo de carteira naquele escopo, identificando o escopo na linha. Não mostra curva. Só busca; 10 por página. Adicionar valida e grava numa ação única. Mensagens: `Cliente adicionado à sua carteira com sucesso.`; `Cliente já está na sua carteira para este escopo.`; `Este cliente já possui responsável no mesmo escopo da sua carteira.`; `Seu usuário não possui vínculo ativo de filial/seção para adicionar clientes.`; `Cliente não encontrado para vinculação.`. A lista de Disponíveis é sempre do próprio usuário, independentemente do filtro de escopo.
- **RN-020 — Titulares de Clientes.** Acesso: coordenador ativo (BUs dele) e DIRETORIA/ADMIN (todas). Fora de Enfermagem, o titular é decidido por cliente × filial × departamento e vale para todas as seções; em Enfermagem, por seção. Situações: `Pendente` (empate sem titular), `Manual`, `Automático`, `Titulares diferentes por seção`, `Sem titular`. Filtros: Situação (padrão Pendentes), Filial, Departamento (cascata: trocar filial limpa departamento) e busca por cliente ou código. Totais: Pendentes (com "N clientes com empate") e Com titular. 30 por página, pendentes primeiro e depois maior venda dos últimos 12 meses. Só candidatos válidos podem ser escolhidos; gravação que não muda nada mostra "Titular não salvo: o vendedor precisa ter o cliente na carteira e esta seção no escopo, e a combinação precisa estar sob sua gestão.".
- **RN-021 — Prospect pela carteira.** Razão social obrigatória (até 300); opcionais fantasia, CNPJ, segmento, porte, origem, cidade, UF (2 letras), potencial mensal, probabilidade (padrão 10%), contato, cargo, telefone, e-mail e observações (até 8.000). Responsável = usuário logado (RNT-012). Não entra na carteira; aparece na aba `Prospects` (RF-018), cujas regras estão na spec 008.

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 / RN-010 | 40 clientes, 32 ativos, líquido R$ 120.000 → "32 de 40", 80,0%, receita R$ 120.000,00, ticket R$ 3.750,00; 0 ativos → ticket "—" | regra de negócio |
| C-002 / RN-006 | A há 9 dias, B há 10, C nunca → pendentes {A, C}; D há 61 dias → não pendente, 62 → pendente; cliente A visitado ontem por outro vendedor e há 9 dias pelo dono → continua pendente | regra de negócio |
| C-003 / RN-007 | 20 dias sem comprar, ciclo 20, 11.500 vs 10.000, visita há 45 dias → 30+25+25+12 = 92 | regra de negócio |
| C-004 / RN-007 | Sem compras nos dois períodos e sem visita → tendência 0, total 0, Frio | regra de negócio |
| RN-007 (bordas) | Variação +10% → 15; +10,01% → 25; −30% → 5; −30,01% → 0; anterior 0 e atual 500 → 25; visita agendada não concluída há 5 dias → não conta | regra de negócio |
| C-005 / RN-004 / RN-005 | 24.000, 3 visitas, 10 e 10 dias → 76,0 → B; 30.000, 5, 5, 5 → 100 → A; nada → 4,0 → C; curva manual D → D também no modo Time inteiro | regra de negócio |
| RN-008 | Temperaturas 70 → Quente, 69 → Morno, 40 → Morno, 39 → Frio; média de {92, 36} = 64 → Morno | regra de negócio |
| RN-009 | Pontos {30, 25, 5, 20} → recomendação de Tendência; empate Recência/Visitas zerados → recomendação de Recência | regra de tela |
| C-006 / RN-013 | 25 clientes, `Nome A–Z`, página 2 → página 1 com os 10 primeiros nomes entre os 25 | regra de negócio |
| C-007 / RN-018 | "hospitl sao lucas", "12345678000190", "cod 4471" → HOSPITAL SÃO LUCAS em 1º; "lukas" casa "LUCAS" (1 letra trocada); "hsp" não casa "HOSPITAL" (menos de 4 letras exige trecho exato) | regra de negócio |
| RN-011 | 31 dias sem visita → vermelho; 30 → normal; 26 dias sem compra → vermelho; status do cadastro "Inativo" aparece na coluna Status | regra de tela |
| RN-012 | Anterior R$ 10.000 (01–20 do mês passado), atual R$ 6.900 (01–20 deste mês) → selo Queda; atual R$ 7.000 (30,0%) → selo; atual R$ 7.100 → sem selo; anterior 0 → sem selo; vendedor com limite antigo de 20% gravado e atual R$ 7.500 (25,0%) → sem selo; 250 alertas não lidos → sino em todos os clientes com alerta | regra de negócio |
| C-008 / RN-019 | Dois escopos → Q aparece na Seção 2 com o escopo identificado; após adicionar, carteira 41 e Q fora dos disponíveis da Seção 2 | regra de negócio |
| C-009 | Duas adições simultâneas de Q no mesmo escopo → uma grava, a outra recebe "já possui responsável"; 1 vínculo no total | regra de negócio |
| C-010 | Vendedor sem escopo ativo → lista vazia e mensagem de vínculo | regra de negócio |
| RN-019 (PF) | Cliente do ramo Pessoa Física sem dono → nunca listado; adicionar por identificador é recusado | regra de negócio |
| C-011 / RN-015 | Ana remove X → vínculo de Ana apagado, vínculo de Bruno mantido; Bruno (substituto) remove cliente de Ana → 0 alterados e erro | regra de negócio |
| C-012 / RN-001 | Férias 01/11–15/11: em 05/11 carteira de Bruno = 75 (40 com "Cobertura"); em 16/11 = 35; substituto marcado só em Configurações sem férias cadastradas → 35 | regra de negócio |
| C-013 / RN-002 | H com Ana e Bruno → Pendente, ambos veem; titular Ana → Bruno não vê H nesse escopo; venda de H R$ 1.000 → Ana R$ 1.000, Bruno R$ 0 | regra de negócio |
| C-014 / RN-003 | Ana única candidata → titular automático logo após adicionar; Bruno adiciona J no mesmo escopo → automático removido, situação Pendente; titular manual válido não muda no recálculo | regra de negócio |
| RN-002 (bloqueio) | Titular bloqueado → cliente volta a aparecer para os demais candidatos; bloqueado não aparece como candidato | regra de negócio |
| RN-020 | Departamento Nutrição com seções 2 e 5 → uma linha "Todas as seções (2)"; Enfermagem com seções 2 e 5 → duas linhas; coordenador define titular fora das suas BUs → "Titular não salvo..." | regra de negócio |
| C-015 / RN-017 | 3 visitas, 2 atividades, 1 relato, 1 mix e 30 pedidos no escopo → 37 na linha do tempo (tipo Pedido faturado → 30); pedidos → páginas de 20 e 10; 4 de outra BU → fora; mix salvo e não enviado → fora | regra de negócio |
| RN-017 (filtros) | Período 01/10–31/10 com 25 pedidos no período espalhados em 3 páginas sem filtro → resultado filtrado mostra os 25, em páginas de 20 e 5; faturado do período = soma dos 25 (R$ 2.500 com 25 de R$ 100), não só da página; agrupamento por mês e rótulo do período (`Todo o período`, `05/08/2026 a 03/11/2026`) | regra de negócio |
| C-016 / RN-016 | Relato para cliente fora da carteira → 0 gravados; data amanhã → recusado; texto de 4.001 caracteres → recusado | regra de negócio |
| RN-014 | Ficha aberta por vendedor, substituto e coordenador não tem campo editável nem botão de salvar; telefone alterado no ERP para (81) 3333-0000 aparece na ficha após a rotina seguinte | regra de tela |
| C-017 / RN-021 | Razão social vazia → mensagem e nada gravado; criado com probabilidade vazia → 10%; responsável = usuário logado mesmo com outro id no pedido | regra de negócio |
| RF-015 | Endereço com cliente 1234 → aba carteira com busca "1234"; endereço de histórico com 1234 → aba Histórico com 1234 selecionado | regra de tela |
| RF-018 | Tela Clientes com 4 abas na ordem de RF-018; prospect criado por Ana em C-017 aparece na aba `Prospects` dela e não em `MINHA CARTEIRA` | regra de tela |

Verificação manual:
- [ ] Carteira, Disponíveis, Histórico e Prospects usáveis em 360 px (RNFT-003)
- [ ] `Legenda` e detalhe da temperatura legíveis em tema escuro
- [ ] `Titulares de Clientes` em tema escuro, com a explicação da regra de Enfermagem visível acima da lista

## Fora de escopo

- [ ] Transferir cliente ou carteira inteira entre vendedores e adicionar cliente à carteira de outro: tela do coordenador, spec 010.
- [ ] Regras de prospect (etapas, contatos, conversão em cliente, visibilidade) e visitas de prospecção: spec 008; aqui só a aba `Prospects` que as exibe.
- [ ] Ajuste do limite de queda por vendedor: descartado em 2026-10-30 (o selo usa 30% fixo). Lista de alertas inteligentes: spec 008.
- [ ] Montagem e envio de mix ao histórico: spec 009.
- [ ] Check-in, check-out e relato de visita: spec 003 (aqui só exibidos no histórico).
- [ ] Criar ou alterar dados do cliente pelo sistema: a ficha é só leitura e a correção de cadastro é feita no ERP.
- [ ] Mapa ou rota de clientes.
- [ ] Exportar a carteira para planilha.

## Pendências

- [x] Decidido em 2026-10-30: a ficha do cliente é só leitura; todos os dados vêm do ERP e nada é editado pela tela.
- [x] Decidido em 2026-10-30: a lista de prospects (etapa, contatos, converter em cliente) vira a 4ª aba `Prospects` da tela Clientes; as regras de prospect continuam na spec 008.
- [x] Decidido em 2026-10-30: o ajuste do limite de queda por vendedor foi descartado; o selo `Queda` usa o limite fixo de 30%.
- [x] Decidido em 2026-10-30: só conta a visita concluída pelo **dono da carteira** exibida; visita de outro vendedor ao mesmo cliente não conta.
- [x] Decidido em 2026-10-30: usuário bloqueado em Executivas de Venda fica fora da titularidade e dos rankings; não há e-mail fixo.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente fora do anexo
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem caminhos de erro (C-009, C-010, C-016, C-017)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto

## Correções em relação ao sistema atual

| Hoje | Na reconstrução | Origem |
|---|---|---|
| Três regras de curva: score de ranking na lista, ticket médio de 3 meses (≥ R$ 15.000 = A, ≥ R$ 7.000 = B) no cálculo da temperatura, e manual | Uma regra (RN-004/005) | `backend/migrations/update-sf-temperaturaclientescarteira-1792588511.sql:269`; `update-sf-minhacarteiraclientesranking-1792674224.sql:262-272` |
| Curva manual só aplicada no modo Meu painel | Vale em qualquer escopo (RN-005) | `update-sf-listarcurvasminhacarteira-1792674224.sql` (filtra só usuário logado) |
| Coluna `Status` mostra a curva (A = Ativo, B = Risco, C/D = Crítico) enquanto o filtro usa o cadastro | Coluna, filtro e card usam o status do cadastro (RN-011) | manual seção 5 "Coluna Status × filtro Status"; seção 15 |
| Cliente sem compra nos dois períodos ganha 15 pontos de tendência | 0 pontos; "Frio (0)" é real (RN-007) | `update-sf-temperaturaclientescarteira-1792588511.sql:248-252,292` |
| Tendência compara mês corrente + 2 meses fechados (até 3 meses) contra 2 meses, favorecendo "crescimento" | 60 dias contra 60 dias (RN-007) | `update-sf-temperaturaclientescarteira-1792588511.sql:238-239` |
| Fator Visitas da temperatura conta visitas agendadas não concluídas e só as do usuário logado (zero no modo Time inteiro) | Última visita concluída pelo dono da carteira (RN-007) | `update-sf-temperaturaclientescarteira-1792588511.sql:256-264` |
| `Score da carteira` = média do score de ranking com rótulo de temperatura | Média da temperatura (RN-008) | `ClientesPage.tsx:929,1067-1070` |
| `Receita atual` usa compras de 90 dias quando falta o mês, e é bruta | Líquido do mês corrente (RN-010, RNT-008) | `ClientesPage.tsx:925` |
| Ordenação reordena só os 10 clientes da página | Carteira inteira (RN-013) | manual seção 5 "Filtros" |
| Indicadores e busca baixam a carteira em lotes de 300 até 12.000 clientes no navegador | No servidor (RF-002, RNF-001) | `ClientesPage.tsx:198-199,380-397,459-480` |
| Sino considera só os 200 primeiros alertas | Todos os alertas não lidos (RN-012) | `ClientesPage.tsx:363` |
| Filtro Ramo fixo no código, inclui Pessoa Física | Ramos do cadastro, sem Pessoa Física (RN-013) | `ClientesPage.tsx:172-196` |
| Substituto marcado em Configurações vê e remove a carteira do titular sem período | Só férias ATIVAS, sem remover (RN-001, RN-015, RNT-010) | `update-sf-minhacarteiraclientes-1792674223.sql:24-28`; `backend/fix-remover-cliente-carteira.mjs` |
| Remoção por GESTOR/ADMIN apaga o cliente da carteira de todos os vendedores | Remove só os vínculos do próprio usuário (RN-015) | `backend/fix-remover-cliente-carteira.mjs` |
| Disponíveis usa só o escopo mais recente do vendedor e mostra curva "B" fixa | Todos os escopos ativos, sem curva (RN-019) | manual seção 5 "Aba Clientes Disponíveis" |
| Adicionar em duas etapas (validar e depois gravar), sujeito a corrida | Ação única (RN-019, C-009) | `ClientesPage.tsx:653-704` |
| Relato avulso aceita qualquer cliente | Só cliente da carteira (RN-016) | `backend/migrations/create-sf-registrarrelatocliente-1792785660.sql` |
| Busca do Histórico não aceita código do ERP e o seletor baixa a carteira toda | Busca inteligente no servidor (RN-018) | manual seção 5 "Aba Histórico do Cliente"; `HistoricoClientesPage.tsx:87,392-423` |
| Filtros de período e tipo de pedidos e mix agem só na página carregada | Valem para todos os registros (RN-017) | manual seção 5 "Regras" do histórico |
| Prospect criado com o responsável enviado pela tela | Responsável = usuário logado (RN-021, RNT-012) | `ClientesPage.tsx:858,876` |
| Titulares automáticos só recalculados às 03:00 | Também logo após a mudança (RN-003) | `backend/add-titulares-sincronizacao.mjs:1-4` (a tela não chama o recálculo) |
| Usuário institucional excluído da titularidade por e-mail fixo; acesso de diretoria aos titulares liberado também por e-mail da TI | Por cadastro/papel (RN-002, RN-020, RNT-002) | `backend/titulares-config.mjs:3`; `backend/add-gestao-titulares.mjs:28-31` |
| Limite de queda configurável sem tela (componente de configuração não é exibido) | Limite fixo de 30% para todos, sem ajuste por vendedor; a configuração gravada deixa de ser lida (RN-012) | `frontend/src/components/AlertasQuedaWidget.tsx` (não montado) |
| Ficha do cliente editável (razão social, segmento, cidade, UF, telefone, e-mail, endereço): muda o cadastro para todos os vendedores e é sobrescrita pela rotina do ERP | Ficha só leitura; os dados vêm do ERP (RN-014) | `clienteAtualizarCarteira` (SF 48); `ClientesPage.tsx:736` |
| Não há tela para mudar a etapa, incluir contato ou converter um prospect | 4ª aba `Prospects` da tela Clientes, com as regras da spec 008 (RF-018) | `ProspeccaoPage.tsx` (embutida, sem rota); spec 008, correção 19 |
| Ficha do cliente lida direto do registro (erro 403 para vendedor) | Pelas funções do servidor (RNFT-005) | `ClientesPage.tsx:4,736`; pendências item 6 |

---

## Anexo — Rastreabilidade de origem

**Rotas atuais cobertas:** `/clientes` (abas Minha Carteira, Clientes Disponíveis, Histórico do Cliente; a aba Prospects é nova e recebe a lista de `ProspeccaoPage.tsx`, spec 008), `/clientes/:clienteId` (busca preenchida), `/clientes?clienteId=<id>` (abre o Histórico), `/gestao-titulares`.

**Páginas e componentes atuais:** `frontend/src/pages/ClientesPage.tsx`, `frontend/src/pages/HistoricoClientesPage.tsx` (embutida, sem rota), `frontend/src/pages/historicoClientes.utils.ts` (+ testes), `frontend/src/components/LegendaCarteira.tsx`, `frontend/src/components/TemperaturaDetalhePopover.tsx` (RN-009 em `recomendacao()`), `frontend/src/components/AlertasQuedaWidget.tsx` (não montado), `frontend/src/lib/smartSearch.ts` (RN-018), `frontend/src/pages/GestaoTitularesPage.tsx`. Scripts: `backend/add-gestao-titulares.mjs`, `add-cliente-titular-depto.mjs`, `add-titular-escopo-listas.mjs`, `add-titular-escopo-bloqueados.mjs`, `add-titulares-sincronizacao.mjs`, `titulares-config.mjs`, `titulares-vendas-patch.mjs` / `-aplicar.mjs` / `-verificar.mjs`, `fix-remover-cliente-carteira.mjs`. Constante `DEPTOS_POR_SECAO = '2'` (Enfermagem).

| RF / RN | SFs atuais (alias · id) | Tabelas |
|---|---|---|
| RF-001, RN-001, RN-011 | `minhaCarteiraClientes` · 27; `contarMinhaCarteiraClientes` · 38 | `EQUIPE_CLIENTE`, `CLIENTES`, `BU_VENDEDOR`, `VENDEDOR_RCA`, `FERIAS_VENDEDOR`, `FUNCIONARIOS.ID_SUBSTITUTO` (legado), `IMP_CLIENTES_TOTVS` (ramo), `IMP_VENDAS_DASHBOARD_TOTVS_RCA`, `VISITAS` |
| RF-002, RN-004, RN-010 | `minhaCarteiraClientesRanking` · 84 | idem + `COMPRAS_90D`, `VISITAS_60D` |
| RN-005, RF-007 | `listarCurvasMinhaCarteira` · 119; `atualizarCurvaClienteCarteira` · 120 | `EQUIPE_CLIENTE.CURVA_CLASSIFICACAO`, `PERFIL_COMPRA_CLIENTE` (`TICKET_MEDIO_3M`, regra que sai) |
| RN-007, RN-008, RF-005 | `temperaturaClientesCarteira` · 128; `temperaturaClienteDetalhe` · 138 | `PEDIDOS_SEMANAIS_SYNC_RAW`, `VISITAS`, `PERFIL_COMPRA_CLIENTE` |
| RN-012 | `alertasQuedaVolume` · 127 (base do selo, com o limite fixo de 30%); `alertasInteligentesListar` · 131 (spec 008); `alertaConfigurar` · 125 e `alertaObterConfig` · 126 — **aposentar** (limite por vendedor descartado) | `ALERTAS_INTELIGENTES`, `PERFIL_COMPRA_CLIENTE`; `CONFIG_ALERTAS_VENDEDOR` deixa de ser lida |
| RN-013 | `listarSegmentosClientes` · 121; `listarRamosClientesTotvs` · 142 (hoje usada só pelo acompanhamento semanal) | `SEGMENTOS`, `IMP_CLIENTES_TOTVS` |
| RN-014 | leitura direta `getRecordMitra` de `CLIENTES` (passa a ser por função do servidor); `clienteAtualizarCarteira` · 48 — **aposentar** (ficha só leitura) | `CLIENTES` |
| RN-015 | `removerClienteMinhaCarteira` · 50 | `EQUIPE_CLIENTE` |
| RN-019, RF-009 | `listarClientesDisponiveisMinhaBu` · 39; `contarClientesDisponiveisMinhaBu` · 40; `adicionarClienteMinhaCarteira` · 41 (valida); `inserirClienteMinhaCarteira` · 116 (grava) | `EQUIPE_CLIENTE`, `CLIENTES`, `BU_VENDEDOR`, `IMP_CLIENTES_TOTVS` |
| RN-017, RF-010 | `historicoVisitasCliente` · 22; `historicoPedidosCliente` · 25; `detalhesPedidoCliente` · 26; `dashboardVisitasSemanaResumo` · 215 (bloco da última semana) | `VISITAS`, `TAREFAS`, `RELATOS_CLIENTE`, `PRODUCT_MIX`, `IMP_VENDAS_DASHBOARD_TOTVS_RCA` |
| RN-016, RF-011 | `registrarRelatoCliente` · 402 | `RELATOS_CLIENTE` |
| RN-021, RF-012 | `prospectsCriar` · 265 (spec 008) | `PROSPECTS`, `PROSPECT_CONTATOS` |
| RF-018 | `prospectsListar` · 252 e demais SFs de prospect (spec 008) | `PROSPECTS`, `PROSPECT_CONTATOS` |
| RN-002, RN-003, RN-020, RF-013/014 | `gestaoTitularesListar` · 387; `gestaoTitularesContar` · 388; `gestaoTitularesFiltros` · 389; `gestaoTitularesDefinir` · 390; `titularesSincronizarLimpar` · 391 (agendada 03:00); `titularesSincronizarInserir` · 392 (03:05); gate `painelCoordenadorPermissao` · 153; marca `/*TITULAR_DEPTO*/` nas SFs 27, 38, 84, 128 e `/*TITULAR_VENDAS*/` nas SFs de vendas | `CLIENTE_TITULAR_DEPTO` (`ORIGEM` AUTO/MANUAL, `ALTERADO_POR`), `USUARIO_BLOQUEIO`, `COORDENADORES_BU`, `PEDIDOS_SEMANAIS_SYNC` (venda 12m), `FILIAL`, `BU`, `SECAO` |

SFs de carteira **sem uso pela tela** (aposentar após confirmar que não rodam agendadas): `buscarClientes` · 6, `contarClientes` · 7, `clienteInativarCarteira` · 49, `vincularClienteCarteiraAtual` · 51, `historicoResumoPedidosCliente` · 85, `calcularPerfilCliente` · 103. Sem uso pelas decisões de 2026-10-30 (aposentar): `clienteAtualizarCarteira` · 48 (ficha só leitura), `alertaConfigurar` · 125 e `alertaObterConfig` · 126 (limite de queda fixo). SFs de detalhe semanal do cliente (`clienteDetalheVendasSemanais` · 109, `clienteDetalheItensSemana` · 110, `clienteDetalheResumoPedidosSemana` · 111) pertencem ao acompanhamento semanal (spec 006).
