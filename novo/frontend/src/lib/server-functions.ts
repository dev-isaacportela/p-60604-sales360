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

export const SERVER_FUNCTION_NAMES = {
  sessaoObter: 's360SessaoObter',
  contadoresObter: 's360ContadoresObter',
  feriasMinhasObter: 's360FeriasMinhasObter',
  configuracoesGarantir: 's360ConfiguracoesGarantir',
  configuracoesSalvar: 's360ConfiguracoesSalvar',
};

export const SERVER_FUNCTIONS = {
  sessaoObter: '1',
  contadoresObter: '2',
  feriasMinhasObter: '3',
  configuracoesGarantir: '4',
  configuracoesSalvar: '5',
};
