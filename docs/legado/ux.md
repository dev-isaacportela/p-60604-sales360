# UX — Analytics Comercial RCA

## Referência
Preservar a linguagem de produto corporativo já aplicada no projeto: cards arredondados, superfícies claras, hierarquia forte e tabelas operacionais com Handsontable.

## Estrutura
- Topo da página: título, descrição curta e filtros em um painel sticky visualmente integrado ao conteúdo.
- Filtros: primeira linha com período, mês, ano e intervalo personalizado quando aplicável; segunda linha com multiselects de departamento e ramo; botão `Buscar` destacado.
- Sequência dos blocos: Meta vs Realizado, Evolução Histórica, Mix de Produtos, Análise de Carteira, Top Clientes, Frequência de Visita e Devoluções.
- Feedback de carregamento: indicador no botão e mensagem nos blocos enquanto as SFs retornam.

## Interações
- Alterar filtros não recarrega dados automaticamente; todos os blocos reagem juntos ao clicar em `Buscar`.
- Multiselects exibem contador e chips dos itens selecionados, com opção de limpar.
- Tabelas são somente leitura, com headers fixos/resize do Handsontable quando aplicável.
- Linhas críticas usam destaque visual: clientes sem visita há mais de 30 dias e devoluções com mais de 30 dias.
- No Painel Coordenador, anomalias de cliente em carteira vendido fora do território aparecem em bloco de alerta acima da performance por vendedor, com contagem e tabela investigável.

## Responsividade
- Desktop: blocos com duas colunas quando houver tabelas lado a lado.
- Mobile/tablet: filtros e blocos empilham em coluna única, mantendo tabelas com rolagem horizontal do Handsontable.

## Incremento — Análise Diretoria
- A nova página fica na seção `Diretoria` do menu, antes das telas de cadastro/gestão, para posicionar primeiro a visão de decisão.
- Topo executivo com título, escopo aplicado e filtros sticky para mês, ano, coordenador e BU.
- Primeiro bloco com KPIs e barra de atingimento consolidado, priorizando leitura rápida em reunião de diretoria.
- Segundo bloco com gráficos comparativos; cliques em BU ou coordenador filtram a página para aprofundamento.
- Terceiro bloco detalha BUs e coordenadores em grids read-only com ordenação e resize.
- Último bloco mostra riscos prioritários, com tom visual de atenção e foco em decisão.

## Incremento — Papéis de Usuários
- A tela `Papéis de Usuários` fica na seção `Diretoria`, próxima das telas de governança executiva.
- O topo explica que a tela define papéis operacionais, não cria usuários nem altera login.
- Cards mostram distribuição atual de Diretoria, Coordenador, Vendedor e papéis legados.
- Filtros permitem localizar usuário por nome, e-mail, ID ou RCA e reduzir a lista por papel.
- A tabela principal é read-only; a alteração acontece no painel lateral após seleção da linha.
- O painel lateral exibe descrições claras para cada papel antes do botão `Salvar papel`.

## Incremento — Emails Semanais dos Avisos
- Não cria nova tela nem altera a navegação existente.
- A experiência do usuário acontece por email transacional semanal, com um resumo consolidado por vendedor.
- O email prioriza leitura rápida: período, totais por prioridade e tabela com os avisos principais.
- O usuário continua usando a tela `Alertas` para consultar detalhes completos e marcar avisos como lidos.

## Incremento — Google Agenda Individual
- A configuração fica dentro de `Configurações do Usuário`, porque a conexão é pessoal e não global do projeto.
- O bloco mostra claramente se o Google Agenda está configurado, qual calendário será usado e a última sincronização.
- O formulário coleta Client ID, Client Secret, Refresh Token e Calendar ID sem alterar o fluxo principal da agenda.
- A sincronização acontece em segundo plano após salvar visitas ou atividades; falhas não bloqueiam a operação comercial principal.
- O último erro fica visível na configuração para o usuário corrigir credenciais ou refresh token.
# Incremento — Prospecção de novos clientes

- A rota `/prospeccao` passa a ser o espaço de trabalho para empresas ainda não cadastradas como clientes reais.
- A tela abre com KPIs de prospects, visitas agendadas, negociações e potencial aberto.
- O usuário cria prospects por formulário inline, sem sair da tela.
- O pipeline em colunas permite ação rápida: agendar visita, mover para negociação, marcar perdido ou iniciar conversão.
- A lateral direita concentra próximas visitas e conversão para código de cliente real.

## Incremento — Visita de prospecção pela agenda

- O modal `Nova agenda` ganha um terceiro modo: `Visita de prospecção`.
- Ao escolher esse modo, o campo principal muda de cliente da carteira para prospect ativo.
- Data, horário, tipo e objetivo mantêm o mesmo fluxo visual da criação de visita normal.
- Após criar, a visita aparece no calendário da agenda com identificação de prospecção.

## Incremento — Prospect dentro de Clientes

- A criação de prospect passa a começar pelo botão `Novo cliente prospecto` na tela `Clientes`.
- O formulário abre em modal, mantendo o usuário no contexto da carteira.
- A aba dedicada de `Prospecção` sai do menu lateral para reduzir duplicidade de navegação.

## Incremento — Prospecção na meta semanal

- Visitas de prospecção aparecem na agenda do vendedor que criou a visita e na agenda do coordenador.
- A meta semanal da agenda passa a considerar visitas de prospecção úteis como parte do volume de visitas.
- A identificação visual permanece por badge `Prospecção`, diferenciando de clientes reais.
