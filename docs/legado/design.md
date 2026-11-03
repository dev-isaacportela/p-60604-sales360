# Design — Analytics Comercial RCA

## Referência
Aplicação existente, com tom light, paleta verde corporativa e superfície suave inspirada em dashboards de gestão comercial.

## Paleta De Cores
- Primary: `#156b16`
- Primary hover: `#125d13`
- Background: `#faf9f6`
- Surface: `#faf9f6`
- Surface container: `#efeeeb`
- Border: `rgba(191, 202, 184, 0.2)`
- Text: `#1b1c1a`
- Text secondary: `#5f675c`
- Alerta: `#b42318`
- Atenção: `#a46a18`
- Receita/gráfico principal: `#2d5cc5`
- Meta/linha tracejada: `#b42318`

## Componentes Principais
- Cards: `rounded-3xl`, fundo sólido, borda sutil e sombra leve.
- Filtros: painel sticky com controles customizados, sem selects/date pickers nativos.
- Gráfico: `ShadcnComposedChart` com barra azul para realizado e linha tracejada vermelha para meta.
- Tabelas: Handsontable somente leitura, altura numérica fixa, `stretchH="none"`, resize manual e tema `ht-theme-main`.
- Badges: vermelho para atraso/risco, âmbar para atenção e verde para indicadores positivos.
- Alertas de território: bloco âmbar claro com ícone `AlertTriangle`, contagem destacada e Handsontable com linhas em estado de alerta.

## Detalhes Por Bloco
- Meta vs Realizado: cards compactos em grid, barra de progresso horizontal e textos de apoio.
- Evolução: gráfico grande acima da tabela histórica.
- Mix: duas tabelas lado a lado e tabela de devoluções de produto abaixo.
- Carteira: cards KPI no topo e tabela operacional embaixo.
- Top Clientes: tabela com colunas financeiras alinhadas à direita.
- Visitas: cards de frequência e tabela com destaque vermelho para sem visita há mais de 30 dias.
- Devoluções: tabela paginada, destaque vermelho para devoluções com mais de 30 dias.
- Painel Coordenador: alerta de vendas fora do território acima da tabela de performance, preservando o tom light e a paleta âmbar de atenção.

## Incremento — Análise Diretoria
- Mantém a linguagem visual do Analytics: hero claro, cards arredondados, sombras suaves e verde corporativo como ação primária.
- KPIs executivos usam acentos diferentes por natureza: verde para meta, azul para realizado, âmbar para gap, vermelho para devoluções e roxo para base de clientes.
- Riscos prioritários usam variação warm (`#fff8f1`) para diferenciar decisão crítica de blocos analíticos neutros.
- Gráficos usam verde e azul para performance, vermelho para meta/alerta e donut sem texto central.
- Tabelas seguem Handsontable read-only com headers compactos e fundo branco, preservando consistência com Analytics e Painel Coordenador.

## Incremento — Papéis de Usuários
- Preserva o tema light e a paleta verde do projeto, com hero e cards iguais aos módulos executivos.
- Cards de contagem usam acentos: verde para Diretoria, azul para Coordenadores, roxo para Vendedores e âmbar para papéis legados.
- Tabela principal usa Handsontable read-only com linha selecionada destacada em verde suave.
- Painel lateral usa botões-card para os três papéis, evitando selects nativos e mantendo clareza de impacto.
- Mensagens de sucesso e erro usam superfícies sólidas verde/vermelha claras, consistentes com o restante do app.

## Incremento — Emails Semanais dos Avisos
- Email HTML transacional preserva a identidade visual do produto: verde corporativo no cabeçalho, fundo claro e cards brancos.
- Prioridades usam as mesmas famílias de cor do app: vermelho para alta, âmbar para média e verde para baixa.
- A tabela do email é compacta e legível, com prioridade, cliente, aviso e valor de referência.
- Nenhum componente visual do frontend foi alterado.

## Incremento — Google Agenda Individual
- O bloco em Configurações preserva o tema light e a paleta verde corporativa já usada na página.
- Status configurado usa badge verde; pendente usa badge âmbar; erros aparecem em card âmbar claro.
- Inputs seguem o componente `Input` existente, com `Client Secret` e `Refresh Token` como campos password.
- Cards de status usam fundo branco sólido, borda sutil e cantos arredondados para manter consistência com o restante do app.

## Incremento — Padrão Minimalista de Tabelas
- Tabelas operacionais usam fundo branco sólido, borda externa verde-clara `#e4e9df`, cantos `rounded-2xl` e separadores leves `#eef2eb` entre linhas.
- Cabeçalho fica em fundo branco, caixa alta, `tracking-[0.14em]`, peso `font-semibold` e texto neutro-esverdeado `#7c8579`.
- IDs aparecem como texto discreto `#7a8379`, sem badge preenchido, para reduzir ruído visual.
- Coluna principal usa texto `#1b1c1a` com `text-base font-semibold`; descrições e metadados usam tons neutros como `#536172`, `#6e766c` e `#7a8379`.
- Badges preenchidos devem ser evitados em tabelas; use texto colorido simples para prioridade, ranking, ramo e temperatura. Exceção: alertas críticos podem manter vermelho/âmbar para preservar leitura de risco.
- Ações inline usam botões transparentes com ícones coloridos, sem círculos preenchidos, mantendo verde para ações neutras/edição e vermelho para remoção.
- Linhas devem ser compactas (`py-3`) e sem fundos alternados; a hierarquia vem de tipografia, alinhamento e espaçamento.
- Status de atividades continua por dropdown customizado direto na linha, sem botões de seta para avançar ou voltar status.
- Lista de atividades exibe somente `A Fazer` e `Em Andamento` na tabela principal, com `A Fazer` no topo; `Concluídas` ficam em seção separada e compactada por padrão.
- Não usar azul em tabelas operacionais; acentos estruturais devem permanecer na paleta verde corporativa.

## Incremento — Prospecção de Clientes
- Mantém o tema light, cards arredondados e verde corporativo como ação principal.
- A tela usa pipeline em cards, evitando tabela operacional para deixar a prospecção mais executiva e acionável.
- Etapas usam cores funcionais: neutro para Novo, âmbar para Visita Agendada, verde para Visitado/Convertido, azul discreto para Negociação e vermelho suave para Perdido.
- Formulários usam componentes customizados existentes e campos de data em texto `AAAA-MM-DD` para evitar date picker nativo.
- O bloco de conversão deixa claro que o vínculo com cliente real só acontece após cadastro oficial no ERP.

## Incremento — Prospecção na Agenda
- Preserva o modal existente de nova agenda, adicionando o terceiro modo no mesmo controle segmentado.
- O estado ativo continua verde corporativo; itens de prospecção usam badge âmbar para diferenciar de visitas com cliente real.
- Não altera paleta, navegação ou layout geral da agenda.

## Incremento — Prospect em Clientes
- O botão `Novo cliente prospecto` usa o mesmo verde primário das ações principais da carteira.
- O formulário usa modal claro com cantos arredondados e componentes existentes de `Clientes`.
- O menu lateral fica mais enxuto, sem item separado de prospecção.

## Incremento — Meta e Visibilidade de Prospecção
- Itens de prospecção mantêm badge âmbar na agenda para sinalizar que ainda não são clientes reais.
- O card de meta semanal não muda visualmente; apenas passa a contabilizar as prospecções visíveis no escopo.
- A visão do coordenador preserva o modo somente leitura para prospecções.

## Incremento — Mix Builder (coluna única com cabeçalho)
- A rota `/simulacao` deixou de ser uma página única com dois blocos grandes empilhados: o construtor e o histórico agora são abas ("Construtor" / "Meus Mix"), com badge de itens na aba ativa.
- Título, abas e os campos do mix (Cliente, Nome do Mix e Descrição, 3/3/6 de 12 colunas) vivem no mesmo card no topo — os campos aparecem só na aba Construtor.
- Construtor em coluna única, na ordem: card de topo, barra do "Catálogo de produtos", tabela de itens e barra sticky de totais. A tabela ocupa a largura inteira da tela.
- O catálogo é uma barra horizontal (título, seletor de custo e busca na mesma linha). A área de resultados só abre quando há cliente e termo de busca, em grade de 1/2/3 colunas com botão `+` por produto — não existe mais overlay de busca nem o botão "Adicionar" separado (havia dois caminhos para a mesma ação).
- Tabela de itens: cabeçalho e linha de totais fixos (`sticky`) dentro de um container próprio de rolagem (`max-h-60vh`), grade definida em uma constante única (`getItemGridColumns`).
- Colunas de concorrência (Concorrente e CMV Conc.) entram por toggle "Comparativo". Sem elas a tabela cabe em 1366px sem rolagem horizontal.
- CMV do item é `100 − Margem %` — deixou de ser coluna e virou texto auxiliar sob o campo de margem.
- Cor semântica: margem e CMV do concorrente usam verde/âmbar/vermelho por faixa; linha com margem abaixo de 20% recebe fundo e borda em vermelho suave.
- Filtro e ordenação dos itens (menor margem, maior margem, maior subtotal) aparecem a partir de 6 itens no mix.
- Colunas da tabela usam `minmax(px, fr)`: em telas largas as métricas se distribuem em vez de se amontoarem à direita deixando um vão depois de PRODUTO.
- Botão "Exportar" no cabeçalho da tabela abre menu com "Imprimir / PDF" e "Exportar planilha (CSV)", operando sobre o mix em edição — não exige salvar antes. O PDF reaproveita o mesmo layout de impressão dos mixes salvos; o CSV usa `;`, decimal com vírgula e BOM (Excel pt-BR) e inclui linha de total.
- Estado vazio da tabela traz ícone, orientação conforme haja ou não cliente selecionado e botão "Buscar produtos" que foca o campo do catálogo.
- Botão "Salvar Mix" desabilitado exibe o motivo abaixo dele (cliente, nome ou produtos faltando).
- Altura dos controles unificada em 38px (inputs, busca, seletor de custo e `Select`) no construtor.
- O root da página não pinta fundo próprio (`bg-[var(--color-bg)]` removido): o retângulo opaco não tinha raio e vazava por trás dos cantos arredondados dos cards. Segue a convenção das demais telas, deixando o gradiente do `body` aparecer. Cards do topo e do catálogo usam `ambient-float`, como os demais.
