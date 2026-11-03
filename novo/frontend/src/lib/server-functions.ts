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
  feriasMinhasObter: 's360FeriasMinhasObter',
  sessaoObter: 's360SessaoObter',
};

export const SERVER_FUNCTIONS = {
  configuracoesGarantir: '4',
  configuracoesSalvar: '5',
  contadoresObter: '2',
  feriasMinhasObter: '3',
  sessaoObter: '1',
};
