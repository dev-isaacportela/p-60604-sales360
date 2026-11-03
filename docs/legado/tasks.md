# Tasks - Prospecção de Clientes

| # | Task | Status | Início | Fim | Duração | Output |
|---|------|--------|--------|-----|---------|--------|
| 1 | Mapear estado atual de prospecção e agenda | ✅ completed | — | — | — | rota existente reaproveitada |
| 2 | Criar backend de prospects temporários | ✅ completed | — | — | — | tabelas e SFs 252-259 |
| 3 | Implementar tela de pipeline e visitas | ✅ completed | — | — | — | `/prospeccao` funcional |
| 4 | Adicionar navegação para Prospecção | ✅ completed | — | — | — | menu atualizado |
| 5 | Validar build e revisão final | ✅ completed | — | — | — | build e SFs aprovados |
| 6 | Permitir visita de prospecção pela agenda normal | ✅ completed | — | — | — | modo de prospecção no modal da agenda |
| 7 | Mover criação de prospect para Clientes | ✅ completed | — | — | — | botão em Clientes e menu lateral ajustado |
| 8 | Contabilizar e restringir visitas de prospecção na agenda | ✅ completed | — | — | — | meta semanal e visibilidade por criador/coordenador |
| 9 | Operar visitas de prospecção pela agenda | ✅ completed | — | — | — | edição, cancelamento, check-in e finalização |
| 10 | Exibir nome do usuário na agenda do coordenador | ✅ completed | 27/05/2026 | 27/05/2026 | — | nome do sistema sem sufixo RCA |
| 11 | Diagnosticar timeout da SF 130 de alertas | ✅ completed | 28/05/2026 | 28/05/2026 | — | causa raiz mapeada: processamento sequencial pesado e falhas de transação |
| 12 | Implementar fila de processamento dos alertas | ✅ completed | 28/05/2026 | 28/05/2026 | — | SF 130 protegida, fila criada e botão usando lote controlado |
| 13 | Corrigir continuidade da fila de alertas | ✅ completed | 28/05/2026 | 28/05/2026 | — | ação iniciar preserva fila ativa e cron ajustado para 10 minutos |
| 14 | Ajustar alertas para geração diária | ✅ completed | 28/05/2026 | 28/05/2026 | — | SF de fila agendada somente uma vez ao dia às 06:00 |
| 15 | Concluir ciclo diário de alertas no mesmo dia | ✅ completed | 28/05/2026 | 28/05/2026 | — | um ciclo por dia com continuações automáticas até finalizar |
| 16 | Impedir falha de vendedores pesados nos alertas | ✅ completed | 28/05/2026 | 28/05/2026 | — | vendedores pesados divididos por cliente e fila sem erros |
| 17 | Clicar em cards de clientes no Analytics | ✅ completed | 28/05/2026 | 28/05/2026 | — | lista detalhada na aba Clientes |
| 18 | Atualizar meta semanal de visitas por vendedor | ✅ completed | 28/05/2026 | 28/05/2026 | — | meta ajustada para 16 visitas e build validado |
| 19 | Permitir editar planejamento das visitas | ✅ completed | 28/05/2026 | 28/05/2026 | — | modal de edição e SF de agenda atualizados |
| 20 | Separar botão de editar planejamento no popup | ✅ completed | 28/05/2026 | 28/05/2026 | — | ações do popup separadas em editar planejamento, reagendar e cancelar |
| 21 | Remover planejamento do fluxo de reagendar | ✅ completed | 28/05/2026 | 28/05/2026 | — | campo de planejamento aparece apenas na ação de edição |
| 22 | Corrigir criação de prospecto para usuários business | ✅ completed | 29/05/2026 | 29/05/2026 | — | SFs SQL 265 e 266 + build validado |
| 23 | Corrigir início de visita de prospecção para executivas business | ✅ completed | 05/06/2026 | 05/06/2026 | — | SF 262 ajustada e build validado |
| 24 | Converter início de visita de prospecção para SQL business-safe | ✅ completed | 05/06/2026 | 05/06/2026 | — | SF 262 convertida para SQL e build validado |
| 25 | Corrigir cancelamento e reagendamento de prospecção para business | ✅ completed | 08/06/2026 | 08/06/2026 | — | SFs 260 e 261 convertidas para SQL e build validado |
| 26 | Ajustar integração de produtos e custos do Mix | ✅ completed | 10/06/2026 | 10/06/2026 | — | PRODUTOS_CUSTOS com CODAUXILIAR/ATIVO, custos padrão/especiais reimportados e build validado |
| 27 | Corrigir salvamento do Mix com produtos integrados | ✅ completed | 10/06/2026 | 10/06/2026 | — | FK legada de PRODUCT_MIX_ITEMS removida e leitura por CODPROD validada |
| 28 | Corrigir envio de Mix para histórico do cliente | ✅ completed | 10/06/2026 | 10/06/2026 | — | SF SQL 267 criada e botão usando mutation business-safe |
| 29 | Exibir Mix enviado no histórico do cliente | ✅ completed | 10/06/2026 | 10/06/2026 | — | SFs 25 e 26 ajustadas para não exigir criador igual ao dono da carteira |
| 30 | Corrigir duplicidade do Mix no histórico do cliente | ✅ completed | 10/06/2026 | 10/06/2026 | — | SFs 25 e 26 usam EXISTS no escopo para não multiplicar pedidos/itens |
| 31 | Corrigir clientes duplicados no histórico | ✅ completed | 10/06/2026 | 10/06/2026 | — | SF 27 consolidada por cliente com métricas agregadas |
| 32 | Melhorar PDF do Mix Builder com identidade visual | ✅ completed | 10/06/2026 | 10/06/2026 | — | template de impressão revisado e build validado |
| 33 | Corrigir erro de acesso business na atualização de custos do Mix | ✅ completed | 10/06/2026 | 10/06/2026 | — | runtime do Mix sem DDL para business e build validado |
| 34 | Agendar sincronização semanal de produtos do Mix | ✅ completed | 10/06/2026 | 10/06/2026 | — | SF 268 agendada para segunda-feira às 08:00 |
| 35 | Criar tela de solicitações de compras filtrada por executivo | ✅ completed | 11/06/2026 | 11/06/2026 | — | tabela/SFs 269-273 e rota `/solicitacoes-compras` |
| 36 | Restringir solicitações de compras ao usuário autorizado | ✅ completed | 11/06/2026 | 11/06/2026 | — | menu, tela e SFs bloqueados para ID 5 |
| 37 | Melhorar formulário de nova solicitação com clientes, calendário e produtos | ✅ completed | 11/06/2026 | 11/06/2026 | — | autocomplete, calendário e itens da solicitação |
| 38 | Tornar análise do produto geral na solicitação | ✅ completed | 11/06/2026 | 11/06/2026 | — | gráficos sem filtro de filial/escopo |
| 39 | Corrigir exibição dos gráficos gerais do produto | ✅ completed | 11/06/2026 | 11/06/2026 | — | frontend reconhece QT_VENDIDA |
| 40 | Auditar origem TOTVS já existente para relatório de PF ativo | ✅ completed | 15/06/2026 | 15/06/2026 | — | tabelas CLIENTES, IMP_CLIENTES_WINTHOR e IMP_VENDAS_DASHBOARD_TOTVS_RCA identificadas |
| 41 | Criar SF paginada para última compra de clientes PF ativos | ✅ completed | 15/06/2026 | 15/06/2026 | — | SF 284 |
| 42 | Implementar tela de relatório com grid e exportação | ✅ completed | 15/06/2026 | 15/06/2026 | — | tela posteriormente removida |
| 43 | Validar build e revisão final | ✅ completed | 15/06/2026 | 15/06/2026 | — | build aprovado; base atual sem PF por CPF |
| 44 | Ajustar relatório PF para consulta direta externa e acesso exclusivo TI | ✅ completed | 15/06/2026 | 15/06/2026 | — | SF 284 com jdbc externo e tela restrita |
| 45 | Remover tela de relatório PF | ✅ completed | 24/06/2026 | 24/06/2026 | — | rota, menu, página e artefatos locais removidos |
| 46 | Adicionar gráfico para oportunidade em crescimento | ✅ completed | 27/07/2026 | 27/07/2026 | — | alerta VOLUME_CRESCENTE com opção Ver gráfico |
| 47 | Auditar estrutura atual de metas e conexão remota | ✅ completed | 28/07/2026 | 28/07/2026 | — | conexão e contrato validados |
| 48 | Confirmar arquitetura de integração de metas | ✅ completed | 28/07/2026 | 28/07/2026 | — | sincronização local aprovada |
| 49 | Criar backend de sincronização local de metas | ✅ completed | 28/07/2026 | 28/07/2026 | — | tabelas e SFs INTG_* |
| 50 | Atualizar frontend com IDs das novas SFs | ✅ completed | 28/07/2026 | 28/07/2026 | — | constantes 288-292 disponíveis |
| 51 | Executar sync inicial de metas | ✅ completed | 28/07/2026 | 28/07/2026 | — | 33 dimensões e 1.027 metas |
| 52 | Build e validação | ✅ completed | 28/07/2026 | 28/07/2026 | — | build aprovado |
| 53 | Share com a equipe | 🔄 in_progress | 28/07/2026 | — | — | commit e push |
| 54 | Enriquecer UF/cidade dos clientes | ✅ completed | 28/07/2026 | 28/07/2026 | — | `CLIENTES.UF` preenchido para 1.879 clientes |
| 55 | Aplicar metas por vendedor, ramo e UF | ✅ completed | 28/07/2026 | 28/07/2026 | — | SFs 294 e 295 |
| 56 | Diagnosticar metas zeradas na redistribuição | ✅ completed | 28/07/2026 | 28/07/2026 | — | fonte integrada confirmada com valores em julho/2026 |
| 57 | Corrigir origem da meta geral por BU | ✅ completed | 28/07/2026 | 28/07/2026 | — | SF 195 usando meta integrada quando meta manual está vazia/zero |
| 58 | Exibir ramos de atividade para lançamento | ✅ completed | 28/07/2026 | 28/07/2026 | — | grade de ramos/UF adicionada na redistribuição |
| 59 | Validar build e publicar correção de metas | ✅ completed | 28/07/2026 | 28/07/2026 | — | build aprovado e correção pronta para share |
| 60 | Permitir edição de meta por ramo no frontend | ✅ completed | 28/07/2026 | 28/07/2026 | — | grid de ramos editável com redistribuição para vendedores |
| 61 | Criar popup de meta por ramo por vendedor | ✅ completed | 28/07/2026 | 28/07/2026 | — | popup e persistência por ramo/UF |
| 62 | Liberar visão de diretoria por coordenador e vendedor | ✅ completed | 29/07/2026 | 29/07/2026 | — | filtros globais, semanal, visitas, alertas e atividades validados |
| 63 | Exibir responsável e situação nas visitas da última semana | ✅ completed | 31/07/2026 | 31/07/2026 | — | histórico do cliente com responsável, reagendada, cancelada e concluída |
| 64 | Corrigir escopo nas últimas visitas da semana | ✅ completed | 31/07/2026 | 31/07/2026 | — | filtro de diretoria/coordenador aplicado na SF 215 |
| 65 | Direcionar vendas de estética e injetáveis para comunicação | ✅ completed | 03/08/2026 | 03/08/2026 | — | vínculos RCA 868, BU 9 e filiais 1/2/6 aplicados |
| 66 | Transformar comunicação em gestor coordenador | ✅ completed | 03/08/2026 | 03/08/2026 | — | usuário 8 com cargo COORDENADOR, supervisor 868 e BUs 9 nas filiais 1/2/6 |
| 67 | Restaurar funções de faturamento da home | ✅ completed | 03/08/2026 | 03/08/2026 | — | SFs 182 e 214 sem fallback de carteira |
| 68 | Sincronizar carteira automática do departamento 9 | ✅ completed | 03/08/2026 | 03/08/2026 | — | SF 303 cadastra clientes faltantes e agenda carteira do depto 9 para usuário 8 a cada 30 minutos |
| 69 | Corrigir pessoa física na carteira do departamento 9 | ✅ completed | 03/08/2026 | 03/08/2026 | — | filtro PESSOA FISICA passou de 3 para 380 clientes |
| 70 | Remover fallback de mês anterior na home | ✅ completed | 03/08/2026 | 03/08/2026 | — | Dashboard usa apenas mês atual e dados de agosto do depto 9 foram validados na carga local |
| 71 | Corrigir detalhes semanais do departamento 9 | ✅ completed | 03/08/2026 | 03/08/2026 | — | SFs 104, 109, 110 e 111 aceitam ID_SECAO nulo como todas as seções; cliente 108006 validado com resumo, itens e pedido |
| 72 | Corrigir exportação Excel do semanal analytics | ✅ completed | 03/08/2026 | 03/08/2026 | — | exportação trata campos opcionais dos produtos como zero e não quebra com retornos parciais |
| 73 | Reverter restrição de vendedores no filtro do coordenador | ✅ completed | 04/08/2026 | 04/08/2026 | — | SF 158 voltou a listar vendedores por escopo de filial/departamento do coordenador |
| 74 | Adicionar tipo de visita Financeiro | ✅ completed | 05/08/2026 | 05/08/2026 | — | opção disponível na agenda |
| 75 | Ajustar Analytics Semanal para semanas sexta-quinta | ✅ completed | 19/08/2026 | 19/08/2026 | — | backups 314-327 e SFs 104/105/107/109/110/111/146 atualizadas |
| 76 | Corrigir semanas sexta-quinta recortadas ao mês | ✅ completed | 19/08/2026 | 19/08/2026 | — | SFs 104/105/107/109/110/111/146 com regra mensal e SEM_6; script idempotente; backups 348-351 |
