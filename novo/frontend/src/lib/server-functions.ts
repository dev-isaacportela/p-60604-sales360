// Mapa das server functions do sistema novo (spec 001).
//
// SERVER_FUNCTION_NAMES e escrito a mao e e o contrato com
// `novo/backend/add-*.mjs`: mudou o nome la, muda aqui.
//
// SERVER_FUNCTIONS sao os ids da plataforma. Antes de publicar, os valores
// sao os do simulador local; depois de publicar no Mitra,
// `cd novo/backend && npm run sync:function-map` reescreve este bloco com os
// ids reais. O simulador resolve pelo NOME, entao funciona antes e depois.
//
// Formato dos dois blocos e rigido (uma linha `chave: 'valor',` por entrada,
// sem comentario dentro): o sync e o simulador fazem parse por texto.
// Entradas em ORDEM ALFABETICA da chave: specs desenvolvidas em paralelo
// acrescentam em linhas diferentes e o merge nao conflita. Antes de publicar,
// o id de uma funcao nova sai da faixa da spec: NNN x 100 + n (spec 002 =
// 201, 202...; spec 010 = 1001, 1002...). A 001 usa 1 a 5. O sync troca
// tudo pelos ids reais.

export const SERVER_FUNCTION_NAMES = {
  carteiraCarregar: 's360CarteiraCarregar',
  carteiraCurvaFixar: 's360CarteiraCurvaFixar',
  carteiraRemover: 's360CarteiraRemover',
  clienteFicha: 's360ClienteFicha',
  clientesRamos: 's360ClientesRamos',
  configuracoesGarantir: 's360ConfiguracoesGarantir',
  configuracoesSalvar: 's360ConfiguracoesSalvar',
  contadoresObter: 's360ContadoresObter',
  disponiveisListar: 's360DisponiveisListar',
  disponivelAdicionar: 's360DisponivelAdicionar',
  disponivelMotivo: 's360DisponivelMotivo',
  escopoOpcoes: 's360EscopoOpcoes',
  feriasMinhasObter: 's360FeriasMinhasObter',
  historicoLinhaTempo: 's360HistoricoLinhaTempo',
  historicoMixItens: 's360HistoricoMixItens',
  historicoPedidoItens: 's360HistoricoPedidoItens',
  historicoPedidos: 's360HistoricoPedidos',
  historicoVisitasSemana: 's360HistoricoVisitasSemana',
  prospectContatoCriar: 's360ProspectContatoCriar',
  prospectCriar: 's360ProspectCriar',
  relatoRegistrar: 's360RelatoRegistrar',
  sessaoObter: 's360SessaoObter',
  titularDefinirAtualizar: 's360TitularDefinirAtualizar',
  titularDefinirInserir: 's360TitularDefinirInserir',
  titularesFiltros: 's360TitularesFiltros',
  titularesInserir: 's360TitularesInserir',
  titularesLimpar: 's360TitularesLimpar',
  titularesListar: 's360TitularesListar',
  titularesTotais: 's360TitularesTotais',
};

export const SERVER_FUNCTIONS = {
  carteiraCarregar: '202',
  carteiraCurvaFixar: '205',
  carteiraRemover: '206',
  clienteFicha: '204',
  clientesRamos: '203',
  configuracoesGarantir: '4',
  configuracoesSalvar: '5',
  contadoresObter: '2',
  disponiveisListar: '207',
  disponivelAdicionar: '208',
  disponivelMotivo: '209',
  escopoOpcoes: '201',
  feriasMinhasObter: '3',
  historicoLinhaTempo: '212',
  historicoMixItens: '215',
  historicoPedidoItens: '214',
  historicoPedidos: '213',
  historicoVisitasSemana: '216',
  prospectContatoCriar: '219',
  prospectCriar: '218',
  relatoRegistrar: '217',
  sessaoObter: '1',
  titularDefinirAtualizar: '223',
  titularDefinirInserir: '224',
  titularesFiltros: '220',
  titularesInserir: '211',
  titularesLimpar: '210',
  titularesListar: '222',
  titularesTotais: '221',
};
