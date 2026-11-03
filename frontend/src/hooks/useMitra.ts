import { executeServerFunctionMitra } from 'mitra-interactions-sdk';

const PROJECT_ID = Number(import.meta.env.VITE_MITRA_PROJECT_ID);
const BRASILIA_TIME_ZONE = 'America/Sao_Paulo';

// SF IDs from backend setup
export const SF = {
  dashboardKpis: 1,
  vendasMensais: 2,
  visitasPorStatus: 3,
  proximasVisitas: 4,
  listarVisitasPeriodo: 5,
  buscarClientes: 6,
  contarClientes: 7,
  listarProdutos: 8,
  listarSimulacoes: 9,
  itensSimulacao: 10,
  listarTarefas: 11,
  contarTarefasPendentes: 12,
  checkinVisita: 13,
  checkoutVisita: 14,
  atualizarStatusTarefa: 15,
  criarTarefa: 23,
  analyticsVendasVendedor: 16,
  analyticsVendasCategoria: 17,
  analyticsEvolucaoMensal: 18,
  analyticsMixProdutos: 19,
  analyticsRcaFiltros: 181,
  analyticsRcaMetaResumo: 182,
  analyticsRcaEvolucao24m: 183,
  analyticsRcaMixProdutos: 184,
  analyticsRcaCarteira: 185,
  analyticsRcaTopClientes: 186,
  analyticsRcaVisitas: 187,
  analyticsRcaDevolucoes: 188,
  analyticsRcaEvolucaoCliente: 287,
  visitasDoDia: 20,
  cancelarVisita: 21,
  historicoVisitasCliente: 22,
  registrarRelatoCliente: 402,
  historicoPedidosCliente: 25,
  detalhesPedidoCliente: 26,
  minhaCarteiraClientes: 27,
  contarMinhaCarteiraClientes: 38,
  listarClientesDisponiveisMinhaBu: 39,
  contarClientesDisponiveisMinhaBu: 40,
  adicionarClienteMinhaCarteira: 41,
  inserirClienteMinhaCarteira: 116,
  dadosUsuarioLogado: 28,
  painelGestaoPermissao: 29,
  painelGestaoVendedores: 30,
  painelGestaoResumo: 31,
  painelGestaoOperacional: 32,
  listarVinculosVendedorRca: 33,
  vincularVendedorRca: 34,
  listarRcasTotvs: 35,
  registrarAuditoriaVinculoRca: 36,
  listarAuditoriaVinculoRca: 37,
  agendaListarVisitasPaginado: 42,
  agendaContarVisitasPaginado: 43,
  agendaCriarVisita: 44,
  agendaAtualizarVisita: 45,
  agendaCancelarVisitaSeguro: 46,
  agendaExcluirVisita: 47,
  clienteAtualizarCarteira: 48,
  clienteInativarCarteira: 49,
  removerClienteMinhaCarteira: 50,
  vincularClienteCarteiraAtual: 51,
  tarefasAtualizarDados: 52,
  tarefasAtualizarStatusSeguro: 53,
  tarefasExcluirSeguro: 54,
  simulacoesContar: 55,
  simulacoesAtualizarRascunho: 56,
  simulacoesCancelar: 57,
  simulacoesExcluirRascunho: 58,
  simulacoesExcluirRascunhoCabecalho: 59,
  simulacaoItensAdicionar: 60,
  simulacaoItensAtualizar: 61,
  simulacaoItensExcluir: 62,
  desvincularVendedorRca: 63,
  detalharConfiguracoesUsuario: 64,
  listarUsuariosSubstitutos: 65,
  atualizarDadosUsuario: 66,
  atualizarPreferenciasUsuario: 67,
  adminListarProdutos: 68,
  adminContarProdutos: 69,
  adminCriarProduto: 70,
  adminAtualizarProduto: 71,
  adminInativarProduto: 72,
  adminExcluirProduto: 73,
  adminListarMetas: 74,
  adminContarMetas: 75,
  adminCriarMeta: 76,
  adminAtualizarMeta: 77,
  adminExcluirMeta: 78,
  adminListarComissoes: 79,
  adminContarComissoes: 80,
  adminCriarComissao: 81,
  adminAtualizarComissao: 82,
  adminExcluirComissao: 83,
  minhaCarteiraClientesRanking: 84,
  historicoResumoPedidosCliente: 85,
  mixCatalogoProdutosCustos: 91,
  mixListar: 92,
  mixItens: 93,
  adminListarBus: 94,
  adminContarBus: 95,
  adminCriarBu: 96,
  adminAtualizarBu: 97,
  adminListarVendedoresBu: 98,
  adminListarVinculosBuVendedor: 99,
  adminContarVinculosBuVendedor: 100,
  adminVincularBuVendedor: 101,
  adminDesvincularBuVendedor: 102,
  calcularPerfilCliente: 103,
  calcularBwSemanal: 104,
  alertasAusenciaPedido: 105,
  acompanhamentoSemanalStatusSync: 106,
  acompanhamentoSemanalSincronizarManual: 107,
  clienteDetalheVendasSemanais: 109,
  clienteDetalheItensSemana: 110,
  clienteDetalheResumoPedidosSemana: 111,
  vincularRcaDepartamento: 112,
  desvincularRcaDepartamento: 113,
  listarDepartamentosPorRca: 114,
  prospeccaoSemanalCarteira: 115,
  listarFiliais: 117,
  listarSecoesDisponiveis: 118,
  listarCurvasMinhaCarteira: 119,
  atualizarCurvaClienteCarteira: 120,
  listarSegmentosClientes: 121,
  listarRamosClientesTotvs: 142,
  metaDefinir: 122,
  metaRealizadoProjecao: 123,
  metaListarHistorico: 124,
  alertaConfigurar: 125,
  alertaObterConfig: 126,
  alertasQuedaVolume: 127,
  temperaturaClientesCarteira: 128,
  sazonalidadeClienteProdutos: 129,
  alertasInteligentesPopular: 130,
  alertasInteligentesProcessarFila: 264,
  alertasInteligentesListar: 131,
  alertasInteligentesMarcarLido: 132,
  alertasInteligentesMarcarTodosLidos: 133,
  alertasInteligentesContarNaoLidos: 134,
  alertasInteligentesDetalheGrafico: 135,
  dicaProObter: 136,
  dicaProMarcarVisualizada: 137,
  temperaturaClienteDetalhe: 138,
  agendaVerificarConflitoVisita: 139,
  atividadesRegistrarLog: 140,
  atividadesListarLog: 141,
  adminListarVendedores: 145,
  adminAcompSemanalListar: 146,
  painelCoordenadorPermissao: 153,
  painelCoordenadorKpis: 154,
  painelCoordenadorPerformanceVendedores: 155,
  painelCoordenadorAnomaliasTerritorio: 189,
  painelCoordenadorDevolucoesRecentes: 156,
  painelCoordenadorVendedoresRisco: 190,
  painelCoordenadorClientesSemCompra: 191,
  painelCoordenadorGapMetaVendedor: 192,
  painelCoordenadorDevolucoesCriticasRca: 193,
  painelCoordenadorConcentracaoClientes: 194,
  painelCoordenadorMetasBuRecebidas: 195,
  painelCoordenadorMetasVendedoresBu: 196,
  painelCoordenadorSalvarMetaVendedorBu: 197,
  painelCoordenadorSemCarteiraDetalhe: 213,
  gestaoCarteiraCoordenadorVendedores: 158,
  gestaoCarteiraCoordenadorRamos: 159,
  gestaoCarteiraCoordenadorListar: 160,
  gestaoCarteiraCoordenadorContar: 161,
  gestaoCarteiraCoordenadorTransferirCliente: 162,
  gestaoCarteiraCoordenadorTransferirToda: 163,
  gestaoCarteiraCoordenadorClientesDisponiveis: 248,
  gestaoCarteiraCoordenadorContarClientesDisponiveis: 249,
  gestaoCarteiraCoordenadorAdicionarCliente: 250,
  feriasVendedorListar: 164,
  feriasVendedorCadastrar: 165,
  feriasVendedorEncerrar: 166,
  gestaoMetasDiretoriaPermissao: 167,
  gestaoMetasDiretoriaBus: 168,
  gestaoMetasDiretoriaListar: 169,
  gestaoMetasDiretoriaHistorico: 170,
  gestaoMetasDiretoriaSalvar: 171,
  gestaoCoordenadoresPermissao: 172,
  gestaoCoordenadoresUsuarios: 173,
  gestaoCoordenadoresBus: 174,
  gestaoCoordenadoresListar: 175,
  gestaoCoordenadoresSalvar: 176,
  gestaoCoordenadoresDefinirStatus: 177,
  gestaoCoordenadoresBuListar: 178,
  gestaoCoordenadoresBuVincular: 179,
  gestaoCoordenadoresBuDesvincular: 180,
  analiseDiretoriaFiltros: 198,
  analiseDiretoriaResumo: 199,
  analiseDiretoriaBus: 200,
  analiseDiretoriaCoordenadores: 201,
  analiseDiretoriaTendencia: 202,
  analiseDiretoriaRiscos: 203,
  gestaoCargosUsuariosPermissao: 204,
  gestaoCargosUsuariosResumo: 205,
  gestaoCargosUsuariosListar: 206,
  gestaoCargosUsuariosSalvar: 207,
  googleAgendaStatus: 209,
  googleAgendaSalvarConfig: 210,
  googleAgendaDesconectar: 211,
  // Sincronização: a SF 212 fala com o Google e devolve o que gravar (é função pura, porque
  // acesso business não escreve no banco de dentro de SF JavaScript); as três SFs SQL abaixo
  // fazem a gravação. Ver lib/googleAgenda.ts. A fila é só rede de segurança em caso de falha.
  googleAgendaSincronizarItem: 212,
  googleAgendaEnfileirarSync: 374,
  googleAgendaGravarVinculo: 379,
  googleAgendaLogSync: 380,
  googleAgendaMarcarSync: 381,
  googleOAuthAppConfig: 364,
  googleAgendaTrocarCodigo: 365,
  googleAgendaConfirmarConexao: 366,
  googleOAuthDescartarPendente: 367,
  googleAgendaAtualizarCalendario: 368,
  googleAgendaAbrirTicket: 369,
  googleAgendaListarCalendarios: 370,
  googleAgendaTrocarCalendario: 371,
  googleAgendaConsumirTicket: 373,
  // A troca de agenda grava por estas três (a SF 371 só lê e limpa os eventos no Google):
  // acesso business não escreve no banco de dentro de SF JavaScript.
  googleAgendaZerarVinculos: 376,
  googleAgendaGravarAgendaEscolhida: 377,
  googleAgendaLogTroca: 378,
  validacaoFiltros: 147,
  validacaoResumo: 148,
  validacaoDetalhe: 149,
  validacaoDevolucoesResumo: 150,
  validacaoDevolucoesDetalhe: 151,
  dashboardVendasDiarias: 214,
  dashboardVisitasSemanaResumo: 215,
  mixCustoTempoReal: 226,
  mixCatalogoProdutosCustosRemoto: 227,
  mixCustosDisponiveis: 228,
  mixAtualizarCustosSeNecessario: 251,
  mixEnviarHistorico: 267,
  mixCriar: 358,
  mixAtualizar: 359,
  mixExcluir: 360,
  mixUltimoCriado: 361,
  mixCarteiraClientes: 362,
  mixStatusCustos: 363,
  solicitacoesComprasPermissaoGestao: 269,
  solicitacoesComprasExecutivos: 270,
  solicitacoesComprasListar: 271,
  solicitacoesComprasContar: 272,
  solicitacoesComprasCriar: 273,
  solicitacoesComprasBuscarPorReferencia: 274,
  solicitacoesComprasAdicionarItem: 275,
  solicitacoesComprasItensListar: 283,
  solicitacoesComprasClientesGeral: 276,
  solicitacoesComprasEnviarItemCompras: 277,
  solicitacoesComprasSincronizarStatusCompras: 278,
  solicitacoesComprasProdutoSaidaFilial: 279,
  solicitacoesComprasProdutoClientesFilial: 280,
  solicitacoesComprasProdutoSaidaGeral: 281,
  solicitacoesComprasProdutoClientesGeral: 282,
  prospectsListar: 252,
  prospectsContar: 253,
  prospectsVisitasListar: 254,
  prospectsCriar: 265,
  prospectsAtualizarStatus: 256,
  prospectsAgendarVisita: 266,
  prospectsRegistrarResultadoVisita: 258,
  prospectsMarcarConvertido: 259,
  prospectsAtualizarVisita: 260,
  prospectsCancelarVisita: 261,
  prospectsCheckinVisita: 262,
  prospectsCheckoutVisita: 263,
  agendaCriarCompromissoInterno: 231,
  agendaAdicionarParticipanteInterno: 232,
  agendaListarVendedoresConvite: 233,
  agendaAtualizarCompromissoInterno: 285,
  agendaCancelarCompromissoInterno: 286,
  suporteEnviarBug: 234,
  suporteListarBugs: 235,
  suportePainelPermissao: 236,
  releaseNotesGestaoListar: 403,
  releaseNotesSalvar: 404,
  releaseNotesExcluir: 405,
  releaseNotesPendentes: 406,
  releaseNotesMarcarLidas: 407,
  faturamentoDiretoriaFiltros: 240,
  faturamentoDiretoriaResumo: 241,
  faturamentoDiretoriaCoordenadores: 242,
  faturamentoDiretoriaVendedores: 243,
  faturamentoDiretoriaProdutos: 244,
  faturamentoDiretoriaClientes: 245,
  faturamentoDiretoriaDetalhe: 246,
  faturamentoDiretoriaFiliais: 247,
  syncIntegrationBillingTargets: 288,
  listIntegrationBillingDimensionsLocal: 289,
  listIntegrationMonthlyBillingTargetsLocal: 290,
  getIntegrationBillingTargetSummaryLocal: 291,
  listIntegrationBillingSyncLogs: 292,
  sincronizarClientesUfRamoTotvs: 294,
  metasVendedorRamoUfAplicadas: 295,
  painelCoordenadorSalvarMetaVendedorRamoUf: 296,
  painelCoordenadorSincronizarMetaVendedorPorRamo: 396,
  gestaoAcessoExecutivasPermissao: 383,
  gestaoAcessoExecutivasListar: 384,
  gestaoAcessoExecutivasAlterar: 385,
  meuAcessoBloqueado: 386,
  gestaoTitularesListar: 387,
  gestaoTitularesContar: 388,
  gestaoTitularesFiltros: 389,
  gestaoTitularesDefinir: 390,
  titularesSincronizarLimpar: 391,
  titularesSincronizarInserir: 392,
  direcionamentoAgendaSemanaExecutivos: 393,
  direcionamentoClientesCriticosSemCompra: 394,
  direcionamentoCarteiraSemVisita: 395,
  mixFotos: 397,
  mixFotosSincronizar: 398,
  mixFotosTestar: 399,
  mixFotosConfigStatus: 400,
  mixFotosChaveGravar: 401,
};

interface SFMetaResult {
  rows: any[];
  error: string | null;
}

const GENERIC_QUERY_ERROR = 'Não foi possível carregar este bloco agora. Tente atualizar a tela.';

function extractRowsFromOutput(rawOutput: unknown): any[] {
  let output = rawOutput;
  if (typeof output === 'string') {
    try {
      output = JSON.parse(output);
    } catch {
      return [];
    }
  }

  if (output && typeof output === 'object') {
    const obj = output as Record<string, unknown>;
    if (Array.isArray(obj.rows)) return obj.rows;
    if (Array.isArray(obj.result)) return obj.result;
    const body = obj.body as Record<string, unknown> | undefined;
    const bodyResult = body?.result as Record<string, unknown> | undefined;
    if (Array.isArray(bodyResult?.rows)) return bodyResult.rows;
  }

  if (Array.isArray(output)) return output;
  return [];
}

/**
 * Com a proteção de parâmetros SQL ligada, os {{params}} viram bind do banco e
 * `LIMIT ? OFFSET ?` recusa texto ('10'). As telas passam paginação como string,
 * então convertemos limit/offset numéricos aqui para valer em todas as chamadas.
 */
function normalizeSFInput(input: Record<string, any>): Record<string, any> {
  const normalized = { ...input };
  for (const key of ['limit', 'offset']) {
    const value = normalized[key];
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) normalized[key] = Number(value);
  }
  return normalized;
}

export async function callSFWithMeta(sfId: number, input: Record<string, any> = {}): Promise<SFMetaResult> {
  try {
    const res = await executeServerFunctionMitra({
      projectId: PROJECT_ID,
      serverFunctionId: sfId,
      input: normalizeSFInput(input),
    });

    const executionStatus = String(res?.result?.executionStatus || '');
    const executionError = String(res?.result?.error || '').trim();
    if ((executionStatus && executionStatus !== 'COMPLETED') || executionError) {
      console.error(`SF ${sfId} failed:`, { status: executionStatus, error: executionError, input });
      return {
        rows: [],
        error: GENERIC_QUERY_ERROR,
      };
    }

    return {
      rows: extractRowsFromOutput(res?.result?.output),
      error: null,
    };
  } catch (err) {
    console.error(`SF ${sfId} error:`, err);
    return {
      rows: [],
      error: GENERIC_QUERY_ERROR,
    };
  }
}

export async function callSF(sfId: number, input: Record<string, any> = {}): Promise<any[]> {
  const { rows } = await callSFWithMeta(sfId, input);
  return rows;
}

export async function callSFSingle(sfId: number, input: Record<string, any> = {}): Promise<any | null> {
  const rows = await callSF(sfId, input);
  return rows.length > 0 ? rows[0] : null;
}

// Mudanças de carteira (EQUIPE_CLIENTE) ou escopo (BU_VENDEDOR) que afetam os titulares de clientes
const SFS_QUE_AFETAM_TITULARES = new Set<number>([
  SF.gestaoCarteiraCoordenadorTransferirCliente,
  SF.gestaoCarteiraCoordenadorTransferirToda,
  SF.gestaoCarteiraCoordenadorAdicionarCliente,
  SF.inserirClienteMinhaCarteira,
  SF.removerClienteMinhaCarteira,
  SF.adminVincularBuVendedor,
  SF.adminDesvincularBuVendedor,
]);

/**
 * Re-sincroniza CLIENTE_TITULAR_DEPTO: remove titulares que deixaram de valer e cria os
 * automáticos (combinações com um único candidato). Roda em segundo plano — falha não
 * bloqueia a tela (a rotina diária das 03:00 cobre).
 */
export function sincronizarTitulares(): void {
  void (async () => {
    try {
      await executeServerFunctionMitra({ projectId: PROJECT_ID, serverFunctionId: SF.titularesSincronizarLimpar, input: {} });
      await executeServerFunctionMitra({ projectId: PROJECT_ID, serverFunctionId: SF.titularesSincronizarInserir, input: {} });
    } catch (err) {
      console.error('Falha ao sincronizar titulares:', err);
    }
  })();
}

export async function callSFMutation(sfId: number, input: Record<string, any> = {}): Promise<boolean> {
  try {
    const res = await executeServerFunctionMitra({
      projectId: PROJECT_ID,
      serverFunctionId: sfId,
      input: normalizeSFInput(input),
    });

    const status = String(res?.result?.executionStatus || '');
    const error = String(res?.result?.error || '').trim();
    if ((status && status !== 'COMPLETED') || error) {
      console.error(`SF ${sfId} mutation failed:`, { status, error, input });
      return false;
    }

    if (SFS_QUE_AFETAM_TITULARES.has(sfId)) sincronizarTitulares();
    return true;
  } catch (err) {
    console.error(`SF ${sfId} mutation error:`, err);
    return false;
  }
}

/**
 * Igual ao callSFMutation, mas devolve a mensagem de erro da SF em vez de apenas
 * um booleano. Usado onde o motivo da falha é acionável pelo usuário final
 * (ex.: conexão OAuth do Google Agenda).
 */
export async function callSFMutationComErro(
  sfId: number,
  input: Record<string, any> = {},
): Promise<{ ok: boolean; error: string | null; dados: any | null }> {
  try {
    const res = await executeServerFunctionMitra({
      projectId: PROJECT_ID,
      serverFunctionId: sfId,
      input: normalizeSFInput(input),
    });

    const status = String(res?.result?.executionStatus || '');
    const error = String(res?.result?.error || '').trim();
    if ((status && status !== 'COMPLETED') || error) {
      console.error(`SF ${sfId} mutation failed:`, { status, error, input });
      return { ok: false, error: error || null, dados: null };
    }

    // Algumas SFs JAVASCRIPT devolvem dados que a tela precisa repassar adiante (o fluxo
    // OAuth do Google e assim: a SF le e devolve, e a persistencia acontece numa SF SQL).
    const linhas = extractRowsFromOutput(res?.result?.output);
    return { ok: true, error: null, dados: linhas.length > 0 ? linhas[0] : null };
  } catch (err) {
    console.error(`SF ${sfId} mutation error:`, err);
    return { ok: false, error: null, dados: null };
  }
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function formatDate(dateStr: string): string {
  const raw = String(dateStr || '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
}

function partsInBrasilia(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BRASILIA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });

  return formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
}

export function getBrasiliaDate(): string {
  const parts = partsInBrasilia(new Date());
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getBrasiliaTimestamp(): string {
  const parts = partsInBrasilia(new Date());
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

export function formatServerDateTimeBrasilia(value?: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const date = new Date(hasTimezone ? normalized : `${normalized}Z`);
  if (Number.isNaN(date.getTime())) return raw;

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: BRASILIA_TIME_ZONE,
  }).format(date);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
