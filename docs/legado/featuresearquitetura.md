# Feature e Arquitetura — Analytics Comercial RCA

## Escopo
Atualizar a tela `Analytics` para o vendedor logado com filtros fixos no topo e 7 blocos analíticos: meta vs realizado, evolução histórica, mix de produtos, análise de carteira, top clientes, frequência de visita e devoluções do período.

## Descobertas Técnicas De Integração
- Fonte de dados: tabelas locais importadas da TOTVS (`IMP_VENDAS_DASHBOARD_TOTVS_RCA`, `IMP_DEVOLUCOES_TOTVS`, `IMP_CLIENTES_TOTVS`) e tabelas operacionais locais (`METAS_VENDEDOR`, `VENDEDOR_RCA`, `EQUIPE_CLIENTE`, `CLIENTES`, `VISITAS`).
- Modelo atual: importação periódica já existente para tabelas `IMP_*`; esta entrega não altera Data Loaders, credenciais, cron, JDBC, nem o pipeline de integração.
- Contrato de data: vendas usam `DTSAIDA` em `YYYY-MM-DD`; devoluções usam `DATA_DEVOLUCAO`/`DATA_VENDA`; agenda usa `DATA_AGENDADA`.
- Atribuição comercial correta: vendas e devoluções importadas não dependem do `COD_RCA` gravado no TOTVS; o escopo do vendedor é resolvido por `BU_VENDEDOR` combinando `CODFILIAL`, `BU_CODIGO`/departamento e `ID_SECAO` com `CODSEC` (ou `ID_SECAO IS NULL` para todas as seções), e só entram nas métricas quando o mesmo vendedor também possui o `CODCLI` na carteira em `EQUIPE_CLIENTE` + `CLIENTES`.
- Anomalia para coordenação: se um cliente está na carteira de um vendedor, mas a venda ocorreu fora do território desse vendedor em `BU_VENDEDOR`, a venda não é atribuída ao vendedor nem à linha `SEM CARTEIRA`; ela aparece no Painel Coordenador como alerta de venda fora do território com cliente em carteira.
- Volumetria observada: vendas com ~142 mil linhas e devoluções com ~2,5 mil linhas; consultas de detalhe devem ser limitadas/paginadas.

## Opções Para O Negócio
- Usar tabelas importadas locais: recomendado porque mantém a tela rápida e evita carga direta na TOTVS.
- Consultar TOTVS online: não recomendado para esta demanda porque o projeto já possui dados importados e o usuário pediu explicitamente as tabelas `IMP_*`.
- Alterar o pipeline de importação: fora do escopo desta entrega.

## Perguntas De Decisão Para O Usuário
- Não há pergunta bloqueante para esta entrega, pois o pedido já define as tabelas, métricas e filtros. A implementação seguirá sem alterar a integração existente.

## Recomendação
Criar Server Functions SQL novas, somente de leitura, agregando dados atribuídos ao vendedor logado por `BU_VENDEDOR` e pela carteira comercial, recebendo filtros de período, departamento e ramo. O frontend chamará essas funções apenas ao clicar em `Buscar`.

## Funcionalidades Finais
- Filtros sempre visíveis: período por mês/ano, últimos 3 meses, últimos 6 meses, último ano ou intervalo personalizado; multiselect de departamentos; multiselect de ramos; botão `Buscar`.
- Meta vs realizado: meta, faturamento líquido, progresso, falta para meta, projeção por dias úteis, devolvido e percentual devolvido.
- Evolução histórica: últimos 24 meses com realizado líquido em barras e meta em linha tracejada, além de tabela dos mesmos dados.
- Mix de produtos: top 10 produtos por faturamento líquido, total por departamento/seção e produtos devolvidos.
- Carteira: cards de total, ativos, inativos, risco, novos e ticket médio; tabela de clientes inativos/em risco.
- Top clientes: top 10 por faturamento líquido, bruto, devolvido, pedidos, ticket e participação no total do vendedor.
- Frequência de visita: cards de total realizado e média semanal; tabela da carteira com última visita e alerta de mais de 30 dias.
- Devoluções: tabela paginada com notas, pedido, datas, cliente, produto, quantidade, valor e destaque acima de 30 dias.
- Painel Coordenador: alerta tabular de vendas fora do território com cliente em carteira, mostrando pedido, vendedor dono da carteira, cliente, território da venda e territórios cadastrados para o vendedor.

## Arquitetura
- Backend: script incremental `backend/add-analytics-rca-completo.mjs` cria/atualiza SFs SQL novas, sem DDL destrutivo.
- Frontend: `AnalyticsPage.tsx` passa a usar as novas SFs via `mitra-interactions-sdk` e renderizar tabelas com Handsontable em modo somente leitura.
- Dados: nenhuma tabela nova obrigatória; relações usam `BU_VENDEDOR`, `METAS_VENDEDOR`, `EQUIPE_CLIENTE`, `CLIENTES`, `VISITAS` e `IMP_*`. Todas as consultas de vendas/devoluções aplicam `BU_SCOPE` e `CARTEIRA_SCOPE` antes das agregações.

## Critérios De Aceite
- Todos os blocos atualizam somente após clicar em `Buscar`.
- Nenhum dado fictício ou hardcoded aparece nas métricas.
- Todas as tabelas variáveis têm limite de linhas ou paginação.
- A tela preserva autenticação nativa e usa `:VAR_USER` no backend.
- Build do frontend conclui sem erro.

## Incremento — Análise Diretoria

### Escopo
Criar uma página executiva completa para a Diretoria Comercial, separada das telas operacionais de gestão, com visão consolidada de meta, realizado líquido, devoluções, riscos, BUs e coordenadores.

### Funcionalidades Finais
- Nova rota `/analise-diretoria`, disponível na seção `Diretoria` do menu para usuários com permissão de Diretoria/Admin.
- Filtros executivos por mês, ano, coordenador e BU.
- KPIs consolidados: meta total, realizado líquido, gap de meta, devoluções, clientes com compra, pedidos, BUs críticas, BUs sem meta e BUs sem coordenador.
- Gráficos executivos: tendência de realizado vs meta nos últimos 6 meses, ranking de BUs, ranking de coordenadores e mapa de riscos.
- Tabelas detalhadas com Handsontable: ranking de BUs, performance por coordenador e riscos prioritários.
- Interação de drill executivo: clicar em BU ou coordenador nos rankings aplica filtro na página.

### Arquitetura
- Backend incremental: `backend/add-analise-diretoria-page.mjs` cria SFs SQL somente leitura `analiseDiretoriaFiltros`, `analiseDiretoriaResumo`, `analiseDiretoriaBus`, `analiseDiretoriaCoordenadores`, `analiseDiretoriaTendencia` e `analiseDiretoriaRiscos`.
- Frontend: `AnaliseDiretoriaPage.tsx` usa `mitra-interactions-sdk` indiretamente via `useMitra.ts`, sem hardcode de dados.
- Dados: agregações partem de `IMP_VENDAS_DASHBOARD_TOTVS_RCA`, `IMP_DEVOLUCOES_TOTVS`, `METAS_BU`, `COORDENADORES` e `COORDENADORES_BU`.

### Critérios De Aceite
- Apenas usuários autorizados acessam a página.
- Todos os dados vêm das SFs SQL criadas.
- Build do frontend conclui sem erro.
- Menu da Diretoria exibe a nova entrada `Análise Diretoria`.

## Incremento — Gestão de Papéis dos Usuários

### Escopo
Criar uma tela para a Diretoria definir o papel operacional dos usuários do projeto como `DIRETORIA`, `COORDENADOR` ou `VENDEDOR`, usando a tabela existente `USUARIO_CARGO` e preservando a autenticação nativa do Mitra.

### Funcionalidades Finais
- Nova rota `/gestao-cargos-usuarios`, disponível na seção `Diretoria` como `Papéis de Usuários`.
- Listagem de usuários da `INT_USER` com nome, e-mail, papel atual, RCAs vinculados e cadastro de coordenador quando houver.
- Filtros por busca textual e papel operacional.
- Cards de resumo com total de diretores, coordenadores, vendedores e outros papéis legados.
- Painel lateral para selecionar um usuário e salvar o papel como Diretoria, Coordenador ou Vendedor.
- Texto de apoio deixando claro que o vínculo de coordenador com BUs continua na tela `Gestão Coordenadores`.

### Arquitetura
- Backend incremental: `backend/add-gestao-cargos-usuarios.mjs` garante a tabela `USUARIO_CARGO` se necessário e cria SFs SQL `gestaoCargosUsuariosPermissao`, `gestaoCargosUsuariosResumo`, `gestaoCargosUsuariosListar` e `gestaoCargosUsuariosSalvar`.
- Frontend: `GestaoCargosUsuariosPage.tsx` usa `mitra-interactions-sdk` via `useMitra.ts`, sem criar tabela customizada de usuários.
- Segurança: apenas usuários com `USUARIO_CARGO` em `DIRETORIA`/`ADMIN` ou e-mail técnico autorizado podem listar e alterar papéis.

### Critérios De Aceite
- Nenhuma tabela de login/usuários é criada; a tela usa `INT_USER` e `USUARIO_CARGO`.
- Alterar papel atualiza `USUARIO_CARGO` por `USER_ID`.
- Build do frontend conclui sem erro.

## Incremento — Google Agenda Individual

### Escopo
Permitir que cada usuário comercial configure suas próprias credenciais OAuth do Google Agenda na tela `Configurações do Usuário`, mantendo a agenda interna da Mitra como fonte da verdade no MVP.

### Funcionalidades Finais
- Configuração individual de `Client ID`, `Client Secret`, `Refresh Token` e `Calendar ID` na tela de configurações.
- Status visível da conexão individual, com calendário configurado, Client ID mascarado, última sincronização e último erro.
- Visitas criadas, reagendadas ou canceladas na Mitra disparam sincronização para o Google Agenda do dono da visita.
- Atividades com prazo criadas ou editadas disparam lembrete no Google Agenda no dia do prazo.
- Tarefas sem prazo não são sincronizadas.
- Em conflitos, a Mitra vence: o próximo envio da Mitra sobrescreve o evento no Google.

### Arquitetura
- Backend incremental: `backend/add-google-agenda-usuario.mjs` cria tabelas `GOOGLE_AGENDA_CONFIG`, `GOOGLE_AGENDA_EVENTOS`, `GOOGLE_AGENDA_LOGS` e SFs 209-212.
- Integração externa: não havia template Google Agenda disponível; a SF cria uma Integration custom por usuário quando necessário e chama o Google Calendar API via camada de integrações, sem `fetch`/`axios` direto.
- Frontend: `ConfiguracoesUsuarioPage.tsx` adiciona o bloco Google Agenda; `AgendaPage.tsx` e `TarefasPage.tsx` chamam `googleAgendaSincronizarItem` após alterações relevantes.

### Critérios De Aceite
- Usuário sem Google configurado continua usando agenda e tarefas normalmente.
- Configuração Google é individual por usuário e usa `:VAR_USER` no salvamento.
- Build do frontend conclui sem erro.
- Smokes das SFs `googleAgendaStatus` e `googleAgendaSincronizarItem` concluem com `COMPLETED`.

## Incremento — Automação Semanal de Emails dos Avisos

### Escopo
Criar uma automação backend para enviar os avisos comerciais de forma agrupada por vendedor, uma vez por semana, toda quinta-feira de madrugada.

### Funcionalidades Finais
- Envio automático de um único email por vendedor com os avisos gerados nos últimos 7 dias.
- Agrupamento no corpo do email por prioridade, com resumo de totais e lista dos avisos principais.
- Execução recorrente toda quinta-feira às 03:00 via `cronExpression` da Server Function.
- Modo `dryRun` para validação sem envio real e modo `force` para reprocessamento manual quando necessário.
- Registro de envio por vendedor e semana para evitar duplicidade no mesmo ciclo.

### Arquitetura
- Backend incremental: `backend/add-alertas-email-semanal.mjs` cria a tabela `ALERTAS_EMAIL_SEMANAL` e a SF JavaScript `alertasInteligentesEnviarResumoSemanal`.
- Dados: origem em `ALERTAS_INTELIGENTES`; destinatário obtido por `INT_USER.ID = ALERTAS_INTELIGENTES.ID_VENDEDOR` e `INT_USER.DESCR` como email.
- Email: envio pela função `sendEmailMitra` do `mitra-sdk`, sem chamadas HTTP diretas e sem tokens no frontend.

### Critérios De Aceite
- A SF fica agendada com `0 0 3 * * THU`.
- A mesma semana não é reenviada para o mesmo vendedor, exceto com `force=true`.
- O smoke `dryRun=true` conclui sem disparar emails reais.

## Incremento — Visita de prospecção pela agenda

### Escopo
Permitir que o usuário crie uma visita de prospecção diretamente pelo modal de nova agenda, sem sair da tela operacional de agenda.

### Funcionalidades Finais
- O modal `Nova agenda` oferece o modo `Visita de prospecção` ao lado de `Visita com cliente` e `Agenda interna`.
- O usuário seleciona um prospect ativo, data, horário, tipo e objetivo da visita.
- A visita é gravada no fluxo de prospecção existente e aparece na agenda normal em dia, semana e mês.
- Visitas de prospecção aparecem como itens identificados, sem acionar check-in, reagendamento ou cancelamento de visitas de clientes reais.

### Arquitetura
- Frontend: `AgendaPage.tsx` reaproveita as SFs existentes `prospectsListar`, `prospectsVisitasListar` e `prospectsAgendarVisita`.
- Backend: sem DDL ou SF nova; o incremento usa a estrutura já criada para prospects temporários.

### Critérios De Aceite
- Criar visita de prospecção pela agenda salva sem exigir cliente real.
- A visita recém-criada aparece no calendário da agenda após recarregar os dados.
- Build do frontend conclui sem erro.

## Incremento — Criação de prospect em Clientes

### Escopo
Mover a criação do cliente prospecto para dentro da tela `Clientes` e retirar a entrada dedicada de `Prospecção` do menu lateral.

### Funcionalidades Finais
- A tela `Clientes` exibe o botão `Novo cliente prospecto` no topo.
- O formulário cria o prospect temporário sem gerar cliente real no ERP.
- A navegação lateral não exibe mais a aba `Prospecção`.
- Prospects criados em `Clientes` continuam disponíveis para visitas de prospecção na agenda.

### Arquitetura
- Frontend: `ClientesPage.tsx` chama a SF existente `prospectsCriar`.
- Navegação: `Layout.tsx` remove o item dedicado `/prospeccao` do menu principal.
- Backend: sem alteração destrutiva; tabelas e SFs de prospects existentes continuam sendo usadas.

### Critérios De Aceite
- Criar prospect pela tela `Clientes` salva com sucesso.
- Menu lateral não mostra mais `Prospecção`.
- Build do frontend conclui sem erro.

## Incremento — Meta semanal e visibilidade de prospecção

### Escopo
Fazer visitas de prospecção entrarem na meta semanal e restringir a visualização operacional ao vendedor criador e ao coordenador.

### Funcionalidades Finais
- Visitas de prospecção em dias úteis entram nos totais da meta semanal da agenda.
- O vendedor comum enxerga apenas visitas de prospecção criadas por ele.
- O coordenador enxerga visitas de prospecção na agenda dos vendedores.
- Visitas de prospecção continuam identificadas como `Prospecção`, sem ações de check-in/reagendamento da visita de cliente real.

### Arquitetura
- Frontend: `AgendaPage.tsx` filtra `prospectsVisitasListar` por `EXECUTIVO_ID` do usuário logado quando não está em visão de coordenador.
- A visão de coordenador usa o mesmo mapeamento visual, sem filtro por criador.
- O cálculo de meta semanal já considera tudo que não é agenda interna; ao incluir as prospecções em `visitasSemanaMeta`, elas passam a compor a meta.

### Critérios De Aceite
- Prospect criado por um vendedor não aparece para outro vendedor comum.
- Coordenador vê visitas de prospecção no período consultado.
- Prospecções em dias úteis impactam os contadores da meta semanal.
- Build do frontend conclui sem erro.
# Incremento — Prospecção de clientes fora do ERP

## Funcionalidades finais
- Executivos podem cadastrar empresas prospect que ainda não são clientes reais.
- Prospects têm dados comerciais próprios: empresa, contato principal, segmento, cidade, potencial, probabilidade e origem.
- Pipeline separado por etapa: Novo, Visita Agendada, Visitado, Negociação, Convertido e Perdido.
- Visitas de prospecção ficam em tabela própria e não dependem de cadastro de cliente real.
- Resultado da visita registra resumo, objeções, próximo passo e data sugerida.
- Conversão exige informar o código do cliente real somente depois do cadastro oficial no ERP.

## Arquitetura de dados
- `PROSPECTS`: empresa prospect e estado comercial.
- `PROSPECT_CONTATOS`: contatos do prospect, vinculado por `PROSPECT_ID`.
- `PROSPECT_VISITAS`: visitas de prospecção, vinculadas por `PROSPECT_ID`.
- Nenhum prospect é gravado em `CLIENTES`; a ligação futura ocorre por `COD_CLIENTE_TOTVS` após conversão.

## Critérios de aceite
- Cadastrar prospect sem criar cliente real.
- Agendar visita para prospect.
- Visualizar pipeline de prospects e próximas visitas.
- Registrar resultado de visita.
- Marcar prospect como convertido informando código real.

## Incremento — Integração de Metas de Faturamento

### Funcionalidade
O projeto passa a consumir metas de faturamento do projeto de Planejamento Estratégico por sincronização local. A integração cria tabelas canônicas `INTG_*` locais, preserva os IDs de origem e expõe funções locais para leitura paginada, dimensões, resumo agregado e auditoria da sincronização.

### Arquitetura
- Fonte: projeto remoto Planejamento Estratégico, funções 24 a 27 do contrato informado.
- Modelo: sincronização local idempotente, sem apagar metas atuais em `METAS_BU`.
- Dados locais: `INTG_BUSINESS_UNIT`, `INTG_REGION`, `INTG_ACTIVITY_SEGMENT`, `INTG_MONTHLY_BILLING_TARGET`, `INTG_BILLING_SYNC_LOG`.
- Backend: função `syncIntegrationBillingTargets` puxa dimensões e metas remotas, faz upsert local e grava log.
- Consumo: funções locais `listIntegrationBillingDimensionsLocal`, `listIntegrationMonthlyBillingTargetsLocal`, `getIntegrationBillingTargetSummaryLocal` e `listIntegrationBillingSyncLogs`.

### IDs Locais Criados
- `288 syncIntegrationBillingTargets`: sincroniza as metas remotas para as tabelas locais.
- `289 listIntegrationBillingDimensionsLocal`: lista dimensões sincronizadas.
- `290 listIntegrationMonthlyBillingTargetsLocal`: lista metas sincronizadas com filtros e paginação.
- `291 getIntegrationBillingTargetSummaryLocal`: resume metas sincronizadas por agrupamento.
- `292 listIntegrationBillingSyncLogs`: lista logs da sincronização.

### Critérios de Aceite
- Sincronização não sobrescreve `METAS_BU`.
- Registros são atualizados por chaves `SOURCE_*` com `ON DUPLICATE KEY UPDATE`.
- Listagem de metas aceita filtros por ano, mês, unidade, região, segmento, paginação e ativos/inativos.
- Resumo agregado aceita `groupBy` por ano, ano/mês, unidade, região ou segmento.
- Build do frontend conclui sem erro.

Observação: funções de leitura com filtros opcionais devem receber string vazia para filtros não usados, por exemplo `{ year: '2026', month: '', businessUnitCode: '', regionCode: '', activitySegmentCode: '', limit: '100', offset: '0', includeInactive: 'true' }`.

## Incremento — Metas por Vendedor, Ramo e UF

### Regras Aplicadas
- A fonte de clientes foi enriquecida com `UF` e `CIDADE` a partir da origem Winthor (`PCCLIENT.ESTENT` e `PCCLIENT.MUNICENT`).
- Os ramos `ORGAO PUBLICO CENTRO OESTE`, `ORGAO PUBLICO SUDESTE`, `ORGAO PUBLICO NORTE`, `ORGAO PUBLICO NORDESTE` e `ORGAO PUBLICO SUL` são consolidados como `Órgão Público`.
- As metas passam a ser aplicadas por vendedor, unidade de negócio, ramo consolidado e UF.
- Para `Órgão Público`, o realizado usa `CLIENTES.UF`, ou seja, a localização do cliente, não a filial de faturamento.
- A meta mensal total do vendedor em `METAS_VENDEDOR` é dividida entre ramo/UF conforme a proporção das metas integradas sincronizadas.

### IDs Locais Criados
- `294 sincronizarClientesUfRamoTotvs`: reexecuta a carga de clientes e preenche ramo, UF e cidade locais.
- `295 metasVendedorRamoUfAplicadas`: retorna meta aplicada, realizado bruto, devolvido, líquido e percentual por vendedor/ramo/UF.
