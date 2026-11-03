# SFs do Projeto e Cruzamentos

Documento gerado em 2026-07-31 a partir da constante central de IDs do frontend e da busca de consumo nas telas/componentes.

## Como Ler

- **ID**: identificador usado nas chamadas de execução.
- **Alias**: nome lógico usado no frontend.
- **Domínio**: agrupamento funcional inferido pelo nome e pelo consumo.
- **Consumo direto**: arquivos que chamam a SF diretamente pela constante `SF.<alias>`; o número entre parênteses é a quantidade de referências no arquivo.
- **Sem uso direto encontrado no frontend**: a SF existe na matriz central, mas não foi localizada em telas/componentes atuais. Pode ser legado, uso indireto, uso em scripts backend, cron ou reserva para fluxo futuro.

## Cruzamentos Principais

| Cruzamento | SFs centrais | Onde aparece | Observação |
|---|---|---|---|
| Dashboard + carteira + agenda | `dashboardKpis`, `dadosUsuarioLogado`, `dashboardVendasDiarias`, `visitasDoDia`, `listarTarefas`, `listarVisitasPeriodo`, `dashboardVisitasSemanaResumo`, `prospectsVisitasListar` | Dashboard e Agenda | A home cruza vendas, metas, visitas, tarefas e prospecção para montar visão diária/semanal. |
| Dashboard + analytics | `analyticsRcaMetaResumo`, `metaRealizadoProjecao` | Dashboard e Analytics | O dashboard reaproveita cálculo analítico de metas/realizado para exibir progresso comercial. |
| Clientes + agenda + tarefas + simulação | `minhaCarteiraClientes`, `historicoVisitasCliente`, `historicoPedidosCliente`, `listarTarefas`, `mixCatalogoProdutosCustos` | Clientes, Agenda, Tarefas e Simulação | A carteira é a entidade de ligação entre histórico, agenda, tarefas e montagem de mix. |
| Permissões e navegação | `dadosUsuarioLogado`, `painelGestaoPermissao`, `painelCoordenadorPermissao`, `gestaoMetasDiretoriaPermissao`, `solicitacoesComprasPermissaoGestao`, `suportePainelPermissao` | Layout e páginas de gestão | O menu e o acesso a áreas administrativas dependem dessas SFs de permissão. |
| Coordenação + diretoria | `painelCoordenadorPermissao`, `gestaoCarteiraCoordenadorVendedores`, `gestaoMetasDiretoriaPermissao`, `gestaoCoordenadores*`, `analiseDiretoria*`, `faturamentoDiretoria*` | Coordenação, metas, análise e faturamento | O escopo coordenador/diretoria compartilha filtros de BU, vendedor e performance. |
| Alertas + clientes + dashboard | `alertasInteligentesListar`, `alertasInteligentesContarNaoLidos`, `alertasQuedaVolume`, `temperaturaClientesCarteira`, `temperaturaClienteDetalhe` | Dashboard, Clientes, Alertas e Layout | Os alertas alimentam badges do menu, widgets e detalhes de clientes. |
| Solicitações de compras + produtos + clientes | `solicitacoesCompras*`, `mixCatalogoProdutosCustos`, `listarFiliais` | Solicitações de Compras | O fluxo cruza produto, cliente, filial, executivo e status de compras. |
| Prospecção + agenda | `prospectsListar`, `prospectsVisitasListar`, `prospectsAgendarVisita`, `prospectsAtualizarVisita`, `prospectsCheckinVisita`, `prospectsCheckoutVisita` | Agenda e Dashboard | Visitas de prospects entram junto de visitas da carteira para metas e agenda. |
| Configurações + agenda externa | `googleAgendaStatus`, `googleAgendaSalvarConfig`, `googleAgendaDesconectar`, `googleAgendaSincronizarItem` | Configurações, Agenda e Tarefas | Configurações controlam conexão; Agenda/Tarefas sincronizam itens individualmente. |
| Governança RCA + BU | `listarVinculosVendedorRca`, `vincularVendedorRca`, `listarRcasTotvs`, `adminListarBus`, `adminListarVendedoresBu`, `vincularRcaDepartamento` | Governança e Gestão de BU | Gestão comercial cruza usuário interno, RCA, BU, departamento, seção e filial. |

## Inventário Completo

| ID | Alias | Domínio | Consumo direto |
|---:|---|---|---|
| 1 | `dashboardKpis` | Dashboard | pages/DashboardPage.tsx (1) |
| 2 | `vendasMensais` | Base / utilitárias | Sem uso direto encontrado no frontend |
| 3 | `visitasPorStatus` | Agenda e visitas | Sem uso direto encontrado no frontend |
| 4 | `proximasVisitas` | Agenda e visitas | Sem uso direto encontrado no frontend |
| 5 | `listarVisitasPeriodo` | Dashboard | pages/AgendaPage.tsx (2)<br>pages/DashboardPage.tsx (1) |
| 6 | `buscarClientes` | Clientes e carteira | Sem uso direto encontrado no frontend |
| 7 | `contarClientes` | Clientes e carteira | pages/ClientesPage.tsx (1) |
| 8 | `listarProdutos` | Base / utilitárias | Sem uso direto encontrado no frontend |
| 9 | `listarSimulacoes` | Base / utilitárias | Sem uso direto encontrado no frontend |
| 10 | `itensSimulacao` | Mix e simulação | Sem uso direto encontrado no frontend |
| 11 | `listarTarefas` | Dashboard | pages/AgendaPage.tsx (1)<br>pages/DashboardPage.tsx (1)<br>pages/TarefasPage.tsx (2) |
| 12 | `contarTarefasPendentes` | Tarefas | components/Layout.tsx (1) |
| 13 | `checkinVisita` | Agenda e visitas | pages/AgendaPage.tsx (1) |
| 14 | `checkoutVisita` | Agenda e visitas | pages/AgendaPage.tsx (1) |
| 15 | `atualizarStatusTarefa` | Tarefas | Sem uso direto encontrado no frontend |
| 23 | `criarTarefa` | Agenda e visitas | pages/AgendaPage.tsx (1)<br>pages/TarefasPage.tsx (1) |
| 16 | `analyticsVendasVendedor` | Analytics, metas e diretoria | Sem uso direto encontrado no frontend |
| 17 | `analyticsVendasCategoria` | Analytics, metas e diretoria | Sem uso direto encontrado no frontend |
| 18 | `analyticsEvolucaoMensal` | Analytics, metas e diretoria | Sem uso direto encontrado no frontend |
| 19 | `analyticsMixProdutos` | Analytics, metas e diretoria | Sem uso direto encontrado no frontend |
| 181 | `analyticsRcaFiltros` | Analytics, metas e diretoria | pages/AnalyticsPage.tsx (1) |
| 182 | `analyticsRcaMetaResumo` | Dashboard | pages/AnalyticsPage.tsx (1)<br>pages/DashboardPage.tsx (1) |
| 183 | `analyticsRcaEvolucao24m` | Analytics, metas e diretoria | pages/AnalyticsPage.tsx (1) |
| 184 | `analyticsRcaMixProdutos` | Analytics, metas e diretoria | pages/AnalyticsPage.tsx (2) |
| 185 | `analyticsRcaCarteira` | Clientes e carteira | pages/AnalyticsPage.tsx (2) |
| 186 | `analyticsRcaTopClientes` | Clientes e carteira | pages/AnalyticsPage.tsx (2) |
| 187 | `analyticsRcaVisitas` | Agenda e visitas | pages/AnalyticsPage.tsx (1) |
| 188 | `analyticsRcaDevolucoes` | Analytics, metas e diretoria | pages/AnalyticsPage.tsx (1) |
| 287 | `analyticsRcaEvolucaoCliente` | Clientes e carteira | pages/AnalyticsPage.tsx (1) |
| 20 | `visitasDoDia` | Dashboard | pages/DashboardPage.tsx (1) |
| 21 | `cancelarVisita` | Agenda e visitas | Sem uso direto encontrado no frontend |
| 22 | `historicoVisitasCliente` | Agenda e visitas | pages/AgendaPage.tsx (1)<br>pages/HistoricoClientesPage.integration.test.tsx (4)<br>pages/HistoricoClientesPage.tsx (1) |
| 25 | `historicoPedidosCliente` | Agenda e visitas | pages/AgendaPage.tsx (1)<br>pages/HistoricoClientesPage.integration.test.tsx (1)<br>pages/HistoricoClientesPage.tsx (1) |
| 26 | `detalhesPedidoCliente` | Clientes e carteira | pages/HistoricoClientesPage.integration.test.tsx (1)<br>pages/HistoricoClientesPage.tsx (1) |
| 27 | `minhaCarteiraClientes` | Agenda e visitas | pages/AgendaPage.tsx (1)<br>pages/ClientesPage.tsx (4)<br>pages/HistoricoClientesPage.integration.test.tsx (3)<br>pages/HistoricoClientesPage.tsx (1)<br>pages/SimulacaoPage.tsx (1)<br>pages/TarefasPage.tsx (1) |
| 38 | `contarMinhaCarteiraClientes` | Clientes e carteira | pages/ClientesPage.tsx (1) |
| 39 | `listarClientesDisponiveisMinhaBu` | Clientes e carteira | pages/ClientesPage.tsx (2) |
| 40 | `contarClientesDisponiveisMinhaBu` | Clientes e carteira | pages/ClientesPage.tsx (1) |
| 41 | `adicionarClienteMinhaCarteira` | Clientes e carteira | pages/ClientesPage.tsx (2) |
| 116 | `inserirClienteMinhaCarteira` | Clientes e carteira | pages/ClientesPage.tsx (1) |
| 28 | `dadosUsuarioLogado` | Dashboard | components/Layout.tsx (1)<br>pages/AcompanhamentoSemanalVendedorPage.tsx (1)<br>pages/AdminAcompanhamentoSemanalPage.tsx (1)<br>pages/AgendaPage.tsx (3)<br>pages/ClientesPage.tsx (1)<br>pages/DashboardPage.tsx (1)<br>pages/PainelValidacaoPage.tsx (1)<br>pages/SimulacaoPage.tsx (1)<br>pages/SuportePage.tsx (1) |
| 29 | `painelGestaoPermissao` | Administração e governança | components/Layout.tsx (1)<br>pages/AcompanhamentoSemanalPage.tsx (1)<br>pages/ConfiguracaoEscopoUsuariosPage.tsx (1)<br>pages/GestaoBuVendedoresPage.tsx (1)<br>pages/GovernancaRcaPage.tsx (1)<br>pages/PainelGestaoPage.tsx (1) |
| 30 | `painelGestaoVendedores` | Administração e governança | pages/AcompanhamentoSemanalPage.tsx (1)<br>pages/GestaoCadastrosPage.tsx (1)<br>pages/PainelGestaoPage.tsx (1) |
| 31 | `painelGestaoResumo` | Administração e governança | pages/PainelGestaoPage.tsx (1) |
| 32 | `painelGestaoOperacional` | Administração e governança | pages/PainelGestaoPage.tsx (1) |
| 33 | `listarVinculosVendedorRca` | Administração e governança | pages/GestaoBuVendedoresPage.tsx (1)<br>pages/GovernancaRcaPage.tsx (1) |
| 34 | `vincularVendedorRca` | Administração e governança | pages/GovernancaRcaPage.tsx (1) |
| 35 | `listarRcasTotvs` | Administração e governança | pages/GovernancaRcaPage.tsx (1) |
| 36 | `registrarAuditoriaVinculoRca` | Administração e governança | pages/GovernancaRcaPage.tsx (1) |
| 37 | `listarAuditoriaVinculoRca` | Administração e governança | pages/GovernancaRcaPage.tsx (1) |
| 42 | `agendaListarVisitasPaginado` | Agenda e visitas | pages/AgendaPage.tsx (2) |
| 43 | `agendaContarVisitasPaginado` | Agenda e visitas | Sem uso direto encontrado no frontend |
| 44 | `agendaCriarVisita` | Agenda e visitas | pages/AgendaPage.tsx (1) |
| 45 | `agendaAtualizarVisita` | Agenda e visitas | pages/AgendaPage.tsx (2) |
| 46 | `agendaCancelarVisitaSeguro` | Agenda e visitas | pages/AgendaPage.tsx (1) |
| 47 | `agendaExcluirVisita` | Agenda e visitas | Sem uso direto encontrado no frontend |
| 48 | `clienteAtualizarCarteira` | Clientes e carteira | pages/ClientesPage.tsx (1) |
| 49 | `clienteInativarCarteira` | Clientes e carteira | Sem uso direto encontrado no frontend |
| 50 | `removerClienteMinhaCarteira` | Clientes e carteira | pages/ClientesPage.tsx (1) |
| 51 | `vincularClienteCarteiraAtual` | Clientes e carteira | Sem uso direto encontrado no frontend |
| 52 | `tarefasAtualizarDados` | Tarefas | pages/TarefasPage.tsx (1) |
| 53 | `tarefasAtualizarStatusSeguro` | Tarefas | pages/TarefasPage.tsx (1) |
| 54 | `tarefasExcluirSeguro` | Tarefas | pages/TarefasPage.tsx (1) |
| 55 | `simulacoesContar` | Base / utilitárias | Sem uso direto encontrado no frontend |
| 56 | `simulacoesAtualizarRascunho` | Base / utilitárias | Sem uso direto encontrado no frontend |
| 57 | `simulacoesCancelar` | Base / utilitárias | Sem uso direto encontrado no frontend |
| 58 | `simulacoesExcluirRascunho` | Base / utilitárias | Sem uso direto encontrado no frontend |
| 59 | `simulacoesExcluirRascunhoCabecalho` | Base / utilitárias | Sem uso direto encontrado no frontend |
| 60 | `simulacaoItensAdicionar` | Mix e simulação | Sem uso direto encontrado no frontend |
| 61 | `simulacaoItensAtualizar` | Mix e simulação | Sem uso direto encontrado no frontend |
| 62 | `simulacaoItensExcluir` | Mix e simulação | Sem uso direto encontrado no frontend |
| 63 | `desvincularVendedorRca` | Administração e governança | Sem uso direto encontrado no frontend |
| 64 | `detalharConfiguracoesUsuario` | Base / utilitárias | pages/ConfiguracoesUsuarioPage.tsx (1) |
| 65 | `listarUsuariosSubstitutos` | Base / utilitárias | pages/ConfiguracoesUsuarioPage.tsx (1) |
| 66 | `atualizarDadosUsuario` | Base / utilitárias | pages/ConfiguracoesUsuarioPage.tsx (1) |
| 67 | `atualizarPreferenciasUsuario` | Base / utilitárias | pages/ConfiguracoesUsuarioPage.tsx (1) |
| 68 | `adminListarProdutos` | Administração e governança | Sem uso direto encontrado no frontend |
| 69 | `adminContarProdutos` | Administração e governança | Sem uso direto encontrado no frontend |
| 70 | `adminCriarProduto` | Administração e governança | Sem uso direto encontrado no frontend |
| 71 | `adminAtualizarProduto` | Administração e governança | Sem uso direto encontrado no frontend |
| 72 | `adminInativarProduto` | Administração e governança | Sem uso direto encontrado no frontend |
| 73 | `adminExcluirProduto` | Administração e governança | Sem uso direto encontrado no frontend |
| 74 | `adminListarMetas` | Analytics, metas e diretoria | pages/GestaoCadastrosPage.tsx (1) |
| 75 | `adminContarMetas` | Analytics, metas e diretoria | pages/GestaoCadastrosPage.tsx (1) |
| 76 | `adminCriarMeta` | Analytics, metas e diretoria | pages/GestaoCadastrosPage.tsx (1) |
| 77 | `adminAtualizarMeta` | Analytics, metas e diretoria | pages/GestaoCadastrosPage.tsx (1) |
| 78 | `adminExcluirMeta` | Analytics, metas e diretoria | pages/GestaoCadastrosPage.tsx (1) |
| 79 | `adminListarComissoes` | Administração e governança | pages/GestaoCadastrosPage.tsx (1) |
| 80 | `adminContarComissoes` | Administração e governança | pages/GestaoCadastrosPage.tsx (1) |
| 81 | `adminCriarComissao` | Administração e governança | pages/GestaoCadastrosPage.tsx (1) |
| 82 | `adminAtualizarComissao` | Administração e governança | pages/GestaoCadastrosPage.tsx (1) |
| 83 | `adminExcluirComissao` | Administração e governança | pages/GestaoCadastrosPage.tsx (1) |
| 84 | `minhaCarteiraClientesRanking` | Clientes e carteira | pages/ClientesPage.tsx (3) |
| 85 | `historicoResumoPedidosCliente` | Clientes e carteira | Sem uso direto encontrado no frontend |
| 91 | `mixCatalogoProdutosCustos` | Mix e simulação | pages/SimulacaoPage.tsx (1)<br>pages/SolicitacoesComprasPage.tsx (1) |
| 92 | `mixListar` | Mix e simulação | pages/SimulacaoPage.tsx (1) |
| 93 | `mixItens` | Mix e simulação | pages/SimulacaoPage.tsx (3) |
| 94 | `adminListarBus` | Administração e governança | pages/ConfiguracaoEscopoUsuariosPage.tsx (1)<br>pages/GestaoBuVendedoresPage.tsx (2) |
| 95 | `adminContarBus` | Administração e governança | pages/GestaoBuVendedoresPage.tsx (1) |
| 96 | `adminCriarBu` | Administração e governança | pages/GestaoBuVendedoresPage.tsx (1) |
| 97 | `adminAtualizarBu` | Administração e governança | pages/GestaoBuVendedoresPage.tsx (2) |
| 98 | `adminListarVendedoresBu` | Administração e governança | pages/ConfiguracaoEscopoUsuariosPage.tsx (1)<br>pages/GestaoBuVendedoresPage.tsx (1) |
| 99 | `adminListarVinculosBuVendedor` | Administração e governança | pages/ConfiguracaoEscopoUsuariosPage.tsx (1)<br>pages/GestaoBuVendedoresPage.tsx (1) |
| 100 | `adminContarVinculosBuVendedor` | Administração e governança | pages/ConfiguracaoEscopoUsuariosPage.tsx (1)<br>pages/GestaoBuVendedoresPage.tsx (1) |
| 101 | `adminVincularBuVendedor` | Administração e governança | pages/ConfiguracaoEscopoUsuariosPage.tsx (1)<br>pages/GestaoBuVendedoresPage.tsx (1) |
| 102 | `adminDesvincularBuVendedor` | Administração e governança | pages/ConfiguracaoEscopoUsuariosPage.tsx (1)<br>pages/GestaoBuVendedoresPage.tsx (1) |
| 103 | `calcularPerfilCliente` | Clientes e carteira | Sem uso direto encontrado no frontend |
| 104 | `calcularBwSemanal` | Base / utilitárias | pages/AcompanhamentoSemanalPage.tsx (1)<br>pages/AcompanhamentoSemanalVendedorPage.tsx (1) |
| 105 | `alertasAusenciaPedido` | Alertas | Sem uso direto encontrado no frontend |
| 106 | `acompanhamentoSemanalStatusSync` | Base / utilitárias | pages/AcompanhamentoSemanalPage.tsx (1) |
| 107 | `acompanhamentoSemanalSincronizarManual` | Integrações e sync | pages/AcompanhamentoSemanalPage.tsx (1)<br>pages/ProspeccaoPage.tsx (1) |
| 109 | `clienteDetalheVendasSemanais` | Clientes e carteira | components/DetalheClienteInline.tsx (1) |
| 110 | `clienteDetalheItensSemana` | Clientes e carteira | components/DetalheClienteInline.tsx (1)<br>pages/AcompanhamentoSemanalVendedorPage.tsx (1) |
| 111 | `clienteDetalheResumoPedidosSemana` | Clientes e carteira | components/DetalheClienteInline.tsx (1) |
| 112 | `vincularRcaDepartamento` | Administração e governança | pages/GestaoBuVendedoresPage.tsx (1) |
| 113 | `desvincularRcaDepartamento` | Administração e governança | pages/GestaoBuVendedoresPage.tsx (1) |
| 114 | `listarDepartamentosPorRca` | Administração e governança | pages/GestaoBuVendedoresPage.tsx (2) |
| 115 | `prospeccaoSemanalCarteira` | Clientes e carteira | pages/ProspeccaoPage.tsx (2) |
| 117 | `listarFiliais` | Administração e governança | pages/ConfiguracaoEscopoUsuariosPage.tsx (1)<br>pages/GestaoBuVendedoresPage.tsx (1)<br>pages/SolicitacoesComprasPage.tsx (1) |
| 118 | `listarSecoesDisponiveis` | Administração e governança | pages/ConfiguracaoEscopoUsuariosPage.tsx (1)<br>pages/GestaoBuVendedoresPage.tsx (1) |
| 119 | `listarCurvasMinhaCarteira` | Clientes e carteira | pages/ClientesPage.tsx (2) |
| 120 | `atualizarCurvaClienteCarteira` | Clientes e carteira | pages/ClientesPage.tsx (1) |
| 121 | `listarSegmentosClientes` | Clientes e carteira | pages/ClientesPage.tsx (1) |
| 142 | `listarRamosClientesTotvs` | Clientes e carteira | pages/AcompanhamentoSemanalPage.tsx (1)<br>pages/AcompanhamentoSemanalVendedorPage.tsx (1)<br>pages/AdminAcompanhamentoSemanalPage.tsx (1) |
| 122 | `metaDefinir` | Analytics, metas e diretoria | Sem uso direto encontrado no frontend |
| 123 | `metaRealizadoProjecao` | Dashboard | pages/DashboardPage.tsx (1) |
| 124 | `metaListarHistorico` | Analytics, metas e diretoria | Sem uso direto encontrado no frontend |
| 125 | `alertaConfigurar` | Alertas | components/AlertasQuedaWidget.tsx (1) |
| 126 | `alertaObterConfig` | Alertas | components/AlertasQuedaWidget.tsx (1) |
| 127 | `alertasQuedaVolume` | Clientes e carteira | components/AlertasQuedaWidget.tsx (1)<br>pages/ClientesPage.tsx (1) |
| 128 | `temperaturaClientesCarteira` | Clientes e carteira | pages/ClientesPage.tsx (1)<br>pages/ProspeccaoPage.tsx (2) |
| 129 | `sazonalidadeClienteProdutos` | Clientes e carteira | components/DetalheClienteInline.tsx (1) |
| 130 | `alertasInteligentesPopular` | Administração e governança | pages/PainelGestaoPage.tsx (1) |
| 264 | `alertasInteligentesProcessarFila` | Administração e governança | pages/PainelGestaoPage.tsx (1) |
| 131 | `alertasInteligentesListar` | Dashboard | pages/AlertasInteligentesPage.tsx (1)<br>pages/ClientesPage.tsx (1)<br>pages/DashboardPage.tsx (1) |
| 132 | `alertasInteligentesMarcarLido` | Administração e governança | pages/AlertasInteligentesPage.tsx (1) |
| 133 | `alertasInteligentesMarcarTodosLidos` | Administração e governança | pages/AlertasInteligentesPage.tsx (1) |
| 134 | `alertasInteligentesContarNaoLidos` | Alertas | components/Layout.tsx (1)<br>pages/AlertasInteligentesPage.tsx (1) |
| 135 | `alertasInteligentesDetalheGrafico` | Clientes e carteira | components/AlertaSazonalidadeGrafico.tsx (1) |
| 136 | `dicaProObter` | Alertas | components/DicaProCard.tsx (2) |
| 137 | `dicaProMarcarVisualizada` | Administração e governança | components/DicaProCard.tsx (1) |
| 138 | `temperaturaClienteDetalhe` | Clientes e carteira | components/TemperaturaDetalhePopover.tsx (1) |
| 139 | `agendaVerificarConflitoVisita` | Agenda e visitas | pages/AgendaPage.tsx (2) |
| 140 | `atividadesRegistrarLog` | Tarefas | pages/TarefasPage.tsx (1) |
| 141 | `atividadesListarLog` | Tarefas | pages/TarefasPage.tsx (1) |
| 145 | `adminListarVendedores` | Administração e governança | pages/AdminAcompanhamentoSemanalPage.tsx (1)<br>pages/ConfiguracaoEscopoUsuariosPage.tsx (1)<br>pages/GestaoBuVendedoresPage.tsx (1) |
| 146 | `adminAcompSemanalListar` | Administração e governança | pages/AdminAcompanhamentoSemanalPage.tsx (1) |
| 153 | `painelCoordenadorPermissao` | Agenda e visitas | components/CoordinatorScopeFilter.tsx (1)<br>components/Layout.tsx (1)<br>pages/AgendaCoordenadorPage.tsx (1)<br>pages/FeriasVendedorPage.tsx (1)<br>pages/GestaoCarteiraCoordenadorPage.tsx (1) |
| 154 | `painelCoordenadorKpis` | Coordenação | Sem uso direto encontrado no frontend |
| 155 | `painelCoordenadorPerformanceVendedores` | Coordenação | Sem uso direto encontrado no frontend |
| 189 | `painelCoordenadorAnomaliasTerritorio` | Coordenação | Sem uso direto encontrado no frontend |
| 156 | `painelCoordenadorDevolucoesRecentes` | Coordenação | Sem uso direto encontrado no frontend |
| 190 | `painelCoordenadorVendedoresRisco` | Coordenação | Sem uso direto encontrado no frontend |
| 191 | `painelCoordenadorClientesSemCompra` | Clientes e carteira | Sem uso direto encontrado no frontend |
| 192 | `painelCoordenadorGapMetaVendedor` | Analytics, metas e diretoria | Sem uso direto encontrado no frontend |
| 193 | `painelCoordenadorDevolucoesCriticasRca` | Coordenação | Sem uso direto encontrado no frontend |
| 194 | `painelCoordenadorConcentracaoClientes` | Clientes e carteira | Sem uso direto encontrado no frontend |
| 195 | `painelCoordenadorMetasBuRecebidas` | Analytics, metas e diretoria | pages/AcompanhamentoSemanalPage.tsx (1)<br>pages/AnalyticsPage.tsx (1) |
| 196 | `painelCoordenadorMetasVendedoresBu` | Analytics, metas e diretoria | pages/AnalyticsPage.tsx (1) |
| 197 | `painelCoordenadorSalvarMetaVendedorBu` | Analytics, metas e diretoria | pages/AnalyticsPage.tsx (1) |
| 213 | `painelCoordenadorSemCarteiraDetalhe` | Clientes e carteira | Sem uso direto encontrado no frontend |
| 158 | `gestaoCarteiraCoordenadorVendedores` | Clientes e carteira | components/CoordinatorScopeFilter.tsx (1)<br>pages/FeriasVendedorPage.tsx (1)<br>pages/GestaoCarteiraCoordenadorPage.tsx (1) |
| 159 | `gestaoCarteiraCoordenadorRamos` | Clientes e carteira | pages/GestaoCarteiraCoordenadorPage.tsx (1) |
| 160 | `gestaoCarteiraCoordenadorListar` | Clientes e carteira | pages/GestaoCarteiraCoordenadorPage.tsx (1) |
| 161 | `gestaoCarteiraCoordenadorContar` | Clientes e carteira | pages/GestaoCarteiraCoordenadorPage.tsx (2) |
| 162 | `gestaoCarteiraCoordenadorTransferirCliente` | Clientes e carteira | pages/GestaoCarteiraCoordenadorPage.tsx (1) |
| 163 | `gestaoCarteiraCoordenadorTransferirToda` | Clientes e carteira | pages/GestaoCarteiraCoordenadorPage.tsx (1) |
| 248 | `gestaoCarteiraCoordenadorClientesDisponiveis` | Clientes e carteira | pages/GestaoCarteiraCoordenadorPage.tsx (1) |
| 249 | `gestaoCarteiraCoordenadorContarClientesDisponiveis` | Clientes e carteira | pages/GestaoCarteiraCoordenadorPage.tsx (1) |
| 250 | `gestaoCarteiraCoordenadorAdicionarCliente` | Clientes e carteira | pages/GestaoCarteiraCoordenadorPage.tsx (1) |
| 164 | `feriasVendedorListar` | Coordenação | pages/FeriasVendedorPage.tsx (1) |
| 165 | `feriasVendedorCadastrar` | Coordenação | pages/FeriasVendedorPage.tsx (1) |
| 166 | `feriasVendedorEncerrar` | Coordenação | pages/FeriasVendedorPage.tsx (1) |
| 167 | `gestaoMetasDiretoriaPermissao` | Analytics, metas e diretoria | components/CoordinatorScopeFilter.tsx (1)<br>components/Layout.tsx (1)<br>pages/AnaliseDiretoriaPage.tsx (1)<br>pages/FaturamentoDiretoriaPage.tsx (1)<br>pages/GestaoMetasDiretoriaPage.tsx (1) |
| 168 | `gestaoMetasDiretoriaBus` | Analytics, metas e diretoria | pages/GestaoMetasDiretoriaPage.tsx (1) |
| 169 | `gestaoMetasDiretoriaListar` | Analytics, metas e diretoria | pages/GestaoMetasDiretoriaPage.tsx (1) |
| 170 | `gestaoMetasDiretoriaHistorico` | Analytics, metas e diretoria | pages/GestaoMetasDiretoriaPage.tsx (1) |
| 171 | `gestaoMetasDiretoriaSalvar` | Analytics, metas e diretoria | pages/GestaoMetasDiretoriaPage.tsx (1) |
| 172 | `gestaoCoordenadoresPermissao` | Coordenação | pages/GestaoCoordenadoresPage.tsx (1) |
| 173 | `gestaoCoordenadoresUsuarios` | Coordenação | pages/GestaoCoordenadoresPage.tsx (1) |
| 174 | `gestaoCoordenadoresBus` | Coordenação | pages/GestaoCoordenadoresPage.tsx (1) |
| 175 | `gestaoCoordenadoresListar` | Coordenação | pages/GestaoCoordenadoresPage.tsx (1) |
| 176 | `gestaoCoordenadoresSalvar` | Coordenação | pages/GestaoCoordenadoresPage.tsx (1) |
| 177 | `gestaoCoordenadoresDefinirStatus` | Coordenação | pages/GestaoCoordenadoresPage.tsx (1) |
| 178 | `gestaoCoordenadoresBuListar` | Coordenação | pages/GestaoCoordenadoresPage.tsx (1) |
| 179 | `gestaoCoordenadoresBuVincular` | Coordenação | pages/GestaoCoordenadoresPage.tsx (1) |
| 180 | `gestaoCoordenadoresBuDesvincular` | Coordenação | pages/GestaoCoordenadoresPage.tsx (1) |
| 198 | `analiseDiretoriaFiltros` | Analytics, metas e diretoria | pages/AnaliseDiretoriaPage.tsx (1) |
| 199 | `analiseDiretoriaResumo` | Analytics, metas e diretoria | pages/AnaliseDiretoriaPage.tsx (1) |
| 200 | `analiseDiretoriaBus` | Analytics, metas e diretoria | pages/AnaliseDiretoriaPage.tsx (1) |
| 201 | `analiseDiretoriaCoordenadores` | Analytics, metas e diretoria | pages/AnaliseDiretoriaPage.tsx (1) |
| 202 | `analiseDiretoriaTendencia` | Analytics, metas e diretoria | pages/AnaliseDiretoriaPage.tsx (1) |
| 203 | `analiseDiretoriaRiscos` | Analytics, metas e diretoria | pages/AnaliseDiretoriaPage.tsx (1) |
| 204 | `gestaoCargosUsuariosPermissao` | Administração e governança | pages/GestaoCargosUsuariosPage.tsx (1) |
| 205 | `gestaoCargosUsuariosResumo` | Administração e governança | pages/GestaoCargosUsuariosPage.tsx (1) |
| 206 | `gestaoCargosUsuariosListar` | Administração e governança | pages/GestaoCargosUsuariosPage.tsx (1) |
| 207 | `gestaoCargosUsuariosSalvar` | Administração e governança | pages/GestaoCargosUsuariosPage.tsx (1) |
| 209 | `googleAgendaStatus` | Agenda e visitas | pages/ConfiguracoesUsuarioPage.tsx (1) |
| 210 | `googleAgendaSalvarConfig` | Agenda e visitas | pages/ConfiguracoesUsuarioPage.tsx (1) |
| 211 | `googleAgendaDesconectar` | Agenda e visitas | pages/ConfiguracoesUsuarioPage.tsx (1) |
| 212 | `googleAgendaSincronizarItem` | Agenda e visitas | pages/AgendaPage.tsx (2)<br>pages/TarefasPage.tsx (1) |
| 147 | `validacaoFiltros` | Validação e devoluções | pages/PainelValidacaoPage.tsx (1) |
| 148 | `validacaoResumo` | Validação e devoluções | pages/PainelValidacaoPage.tsx (1) |
| 149 | `validacaoDetalhe` | Validação e devoluções | pages/PainelValidacaoPage.tsx (2) |
| 150 | `validacaoDevolucoesResumo` | Validação e devoluções | pages/PainelValidacaoPage.tsx (1) |
| 151 | `validacaoDevolucoesDetalhe` | Validação e devoluções | pages/PainelValidacaoPage.tsx (2) |
| 214 | `dashboardVendasDiarias` | Dashboard | pages/DashboardPage.tsx (1) |
| 215 | `dashboardVisitasSemanaResumo` | Dashboard | pages/DashboardPage.tsx (1)<br>pages/HistoricoClientesPage.tsx (1) |
| 226 | `mixCustoTempoReal` | Mix e simulação | Sem uso direto encontrado no frontend |
| 227 | `mixCatalogoProdutosCustosRemoto` | Mix e simulação | Sem uso direto encontrado no frontend |
| 228 | `mixCustosDisponiveis` | Mix e simulação | pages/SimulacaoPage.tsx (1) |
| 251 | `mixAtualizarCustosSeNecessario` | Mix e simulação | pages/SimulacaoPage.tsx (1) |
| 267 | `mixEnviarHistorico` | Mix e simulação | pages/SimulacaoPage.tsx (1) |
| 269 | `solicitacoesComprasPermissaoGestao` | Administração e governança | components/Layout.tsx (1)<br>pages/SolicitacoesComprasPage.tsx (1) |
| 270 | `solicitacoesComprasExecutivos` | Solicitações de compras | pages/SolicitacoesComprasPage.tsx (1) |
| 271 | `solicitacoesComprasListar` | Solicitações de compras | pages/SolicitacoesComprasPage.tsx (1) |
| 272 | `solicitacoesComprasContar` | Solicitações de compras | pages/SolicitacoesComprasPage.tsx (1) |
| 273 | `solicitacoesComprasCriar` | Solicitações de compras | pages/SolicitacoesComprasPage.tsx (1) |
| 274 | `solicitacoesComprasBuscarPorReferencia` | Administração e governança | pages/SolicitacoesComprasPage.tsx (1) |
| 275 | `solicitacoesComprasAdicionarItem` | Solicitações de compras | pages/SolicitacoesComprasPage.tsx (1) |
| 283 | `solicitacoesComprasItensListar` | Solicitações de compras | pages/SolicitacoesComprasPage.tsx (1) |
| 276 | `solicitacoesComprasClientesGeral` | Clientes e carteira | pages/SolicitacoesComprasPage.tsx (1) |
| 277 | `solicitacoesComprasEnviarItemCompras` | Solicitações de compras | pages/SolicitacoesComprasPage.tsx (1) |
| 278 | `solicitacoesComprasSincronizarStatusCompras` | Solicitações de compras | pages/SolicitacoesComprasPage.tsx (1) |
| 279 | `solicitacoesComprasProdutoSaidaFilial` | Solicitações de compras | Sem uso direto encontrado no frontend |
| 280 | `solicitacoesComprasProdutoClientesFilial` | Clientes e carteira | Sem uso direto encontrado no frontend |
| 281 | `solicitacoesComprasProdutoSaidaGeral` | Solicitações de compras | pages/SolicitacoesComprasPage.tsx (1) |
| 282 | `solicitacoesComprasProdutoClientesGeral` | Clientes e carteira | pages/SolicitacoesComprasPage.tsx (1) |
| 252 | `prospectsListar` | Agenda e visitas | pages/AgendaPage.tsx (1) |
| 253 | `prospectsContar` | Prospecção | Sem uso direto encontrado no frontend |
| 254 | `prospectsVisitasListar` | Dashboard | pages/AgendaPage.tsx (4)<br>pages/DashboardPage.tsx (1) |
| 265 | `prospectsCriar` | Clientes e carteira | pages/ClientesPage.tsx (1) |
| 256 | `prospectsAtualizarStatus` | Prospecção | Sem uso direto encontrado no frontend |
| 266 | `prospectsAgendarVisita` | Agenda e visitas | pages/AgendaPage.tsx (1) |
| 258 | `prospectsRegistrarResultadoVisita` | Agenda e visitas | Sem uso direto encontrado no frontend |
| 259 | `prospectsMarcarConvertido` | Administração e governança | Sem uso direto encontrado no frontend |
| 260 | `prospectsAtualizarVisita` | Agenda e visitas | pages/AgendaPage.tsx (2) |
| 261 | `prospectsCancelarVisita` | Agenda e visitas | pages/AgendaPage.tsx (1) |
| 262 | `prospectsCheckinVisita` | Agenda e visitas | pages/AgendaPage.tsx (1) |
| 263 | `prospectsCheckoutVisita` | Agenda e visitas | pages/AgendaPage.tsx (1) |
| 231 | `agendaCriarCompromissoInterno` | Agenda e visitas | pages/AgendaPage.tsx (1) |
| 232 | `agendaAdicionarParticipanteInterno` | Agenda e visitas | pages/AgendaPage.tsx (1) |
| 233 | `agendaListarVendedoresConvite` | Agenda e visitas | pages/AgendaPage.tsx (1) |
| 285 | `agendaAtualizarCompromissoInterno` | Agenda e visitas | pages/AgendaPage.tsx (1) |
| 286 | `agendaCancelarCompromissoInterno` | Agenda e visitas | pages/AgendaPage.tsx (1) |
| 234 | `suporteEnviarBug` | Administração e governança | pages/SuportePage.tsx (1) |
| 235 | `suporteListarBugs` | Administração e governança | pages/PainelDesenvolvedorPage.tsx (1) |
| 236 | `suportePainelPermissao` | Suporte | components/Layout.tsx (1)<br>pages/PainelDesenvolvedorPage.tsx (1) |
| 240 | `faturamentoDiretoriaFiltros` | Analytics, metas e diretoria | pages/FaturamentoDiretoriaPage.tsx (1) |
| 241 | `faturamentoDiretoriaResumo` | Analytics, metas e diretoria | pages/FaturamentoDiretoriaPage.tsx (1) |
| 242 | `faturamentoDiretoriaCoordenadores` | Analytics, metas e diretoria | pages/FaturamentoDiretoriaPage.tsx (1) |
| 243 | `faturamentoDiretoriaVendedores` | Analytics, metas e diretoria | pages/FaturamentoDiretoriaPage.tsx (1) |
| 244 | `faturamentoDiretoriaProdutos` | Analytics, metas e diretoria | pages/FaturamentoDiretoriaPage.tsx (1) |
| 245 | `faturamentoDiretoriaClientes` | Clientes e carteira | pages/FaturamentoDiretoriaPage.tsx (1) |
| 246 | `faturamentoDiretoriaDetalhe` | Analytics, metas e diretoria | pages/FaturamentoDiretoriaPage.tsx (1) |
| 247 | `faturamentoDiretoriaFiliais` | Analytics, metas e diretoria | pages/FaturamentoDiretoriaPage.tsx (1) |
| 288 | `syncIntegrationBillingTargets` | Integrações e sync | Sem uso direto encontrado no frontend |
| 289 | `listIntegrationBillingDimensionsLocal` | Integrações e sync | Sem uso direto encontrado no frontend |
| 290 | `listIntegrationMonthlyBillingTargetsLocal` | Integrações e sync | Sem uso direto encontrado no frontend |
| 291 | `getIntegrationBillingTargetSummaryLocal` | Integrações e sync | Sem uso direto encontrado no frontend |
| 292 | `listIntegrationBillingSyncLogs` | Integrações e sync | Sem uso direto encontrado no frontend |
| 294 | `sincronizarClientesUfRamoTotvs` | Clientes e carteira | Sem uso direto encontrado no frontend |
| 295 | `metasVendedorRamoUfAplicadas` | Analytics, metas e diretoria | pages/AnalyticsPage.tsx (1) |
| 296 | `painelCoordenadorSalvarMetaVendedorRamoUf` | Analytics, metas e diretoria | pages/AnalyticsPage.tsx (1) |

## Pontos de Atenção

- Existem lacunas numéricas de IDs e aliases sem consumo direto, o que indica histórico de evolução do projeto ou funções usadas por scripts/rotinas fora do frontend.
- O frontend centraliza as chamadas em helpers (`callSF`, `callSFSingle`, `callSFMutation`), então os cruzamentos acima refletem consumo por alias, não chamadas brutas por ID espalhadas.
- O maior acoplamento está em `minhaCarteiraClientes`, `dadosUsuarioLogado`, permissões de gestão e funções de agenda/prospecção, pois aparecem em múltiplas telas.
- Alterar uma SF compartilhada deve considerar todas as telas listadas em “Consumo direto”.
