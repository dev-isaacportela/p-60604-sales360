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
  configuracoesGarantir: 's360ConfiguracoesGarantir',
  configuracoesSalvar: 's360ConfiguracoesSalvar',
  contadoresObter: 's360ContadoresObter',
  coordenadorAtualizar: 's360CoordenadorAtualizar',
  coordenadorBuIncluir: 's360CoordenadorBuIncluir',
  coordenadorBuRemover: 's360CoordenadorBuRemover',
  coordenadorCriar: 's360CoordenadorCriar',
  coordenadorListar: 's360CoordenadorListar',
  coordenadorStatusDefinir: 's360CoordenadorStatusDefinir',
  escopoDesvincular: 's360EscopoDesvincular',
  escopoIncluir: 's360EscopoIncluir',
  escopoListar: 's360EscopoListar',
  escopoReativar: 's360EscopoReativar',
  estruturaListar: 's360EstruturaListar',
  executivaAcessoAlterar: 's360ExecutivaAcessoAlterar',
  executivaAcessoGarantir: 's360ExecutivaAcessoGarantir',
  executivaListar: 's360ExecutivaListar',
  feriasCadastrar: 's360FeriasCadastrar',
  feriasEncerrar: 's360FeriasEncerrar',
  feriasListar: 's360FeriasListar',
  feriasMinhasObter: 's360FeriasMinhasObter',
  feriasPessoas: 's360FeriasPessoas',
  papelIncluir: 's360PapelIncluir',
  papelLegadoSincronizar: 's360PapelLegadoSincronizar',
  papelListar: 's360PapelListar',
  papelRemover: 's360PapelRemover',
  papelResumo: 's360PapelResumo',
  rcaAuditar: 's360RcaAuditar',
  rcaAuditoriaListar: 's360RcaAuditoriaListar',
  rcaRemover: 's360RcaRemover',
  rcaTotvsListar: 's360RcaTotvsListar',
  rcaVincular: 's360RcaVincular',
  sessaoObter: 's360SessaoObter',
};

export const SERVER_FUNCTIONS = {
  configuracoesGarantir: '4',
  configuracoesSalvar: '5',
  contadoresObter: '2',
  coordenadorAtualizar: '1009',
  coordenadorBuIncluir: '1010',
  coordenadorBuRemover: '1011',
  coordenadorCriar: '1012',
  coordenadorListar: '1013',
  coordenadorStatusDefinir: '1014',
  escopoDesvincular: '1015',
  escopoIncluir: '1016',
  escopoListar: '1017',
  escopoReativar: '1018',
  estruturaListar: '1019',
  executivaAcessoAlterar: '1020',
  executivaAcessoGarantir: '1021',
  executivaListar: '1022',
  feriasCadastrar: '1023',
  feriasEncerrar: '1024',
  feriasListar: '1025',
  feriasMinhasObter: '3',
  feriasPessoas: '1026',
  papelIncluir: '1030',
  papelLegadoSincronizar: '1031',
  papelListar: '1032',
  papelRemover: '1033',
  papelResumo: '1034',
  rcaAuditar: '1035',
  rcaAuditoriaListar: '1036',
  rcaRemover: '1037',
  rcaTotvsListar: '1038',
  rcaVincular: '1039',
  sessaoObter: '1',
};
