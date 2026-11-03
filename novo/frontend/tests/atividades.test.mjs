// Spec 004 — regra de tela das atividades (T-097).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FORM_VAZIO, atrasada, colunasKanban, formDe, mensagemRecusa, mensagemStatus, mudou, paraInputForm, textoLog,
  validarAtividade, visaoInicial,
} from '../src/lib/atividades.ts';
import { hojeBrasilia } from '../src/lib/formato.ts';

test('C-002 / RN-005: título e prazo obrigatórios, nessa ordem', () => {
  assert.equal(validarAtividade({ ...FORM_VAZIO, titulo: '   ', prazo: '2026-11-05' }), 'Informe o título da atividade.');
  assert.equal(validarAtividade({ ...FORM_VAZIO, titulo: 'Enviar cotação' }), 'Informe o prazo da atividade.');
  assert.equal(validarAtividade({ ...FORM_VAZIO, titulo: 'Enviar cotação', prazo: '2026-11-05' }), null);
});

test('C-003 / RN-008: texto sem opção escolhida não salva; campo vazio remove o cliente', () => {
  const vinculada = formDe({ TITULO: 'Retornar', DATA_LIMITE: '2026-11-05', PRIORIDADE: 'MEDIA', CLIENTE_ID: 4002, CLIENTE: 'CLÍNICA BOA VIDA · 4002' });
  assert.equal(validarAtividade(vinculada), null);
  assert.equal(validarAtividade({ ...vinculada, clienteTexto: 'hospital' }), 'Selecione um cliente da lista ou apague o campo.');
  assert.equal(validarAtividade({ ...FORM_VAZIO, titulo: 'x', prazo: '2026-11-05', clienteTexto: 'hospital' }), 'Selecione um cliente da lista ou apague o campo.');
  const apagado = { ...vinculada, clienteTexto: '' };
  assert.equal(validarAtividade(apagado), null);
  assert.equal(paraInputForm(apagado).clienteId, '');
  assert.equal(mudou(vinculada, apagado), true);
});

test('C-004 / RN-006: atrasada só com prazo antes de hoje em Brasília e não concluída', () => {
  const hoje = '2026-10-30';
  assert.equal(atrasada({ STATUS: 'PENDENTE', DATA_LIMITE: '2026-10-29' }, hoje), true);
  assert.equal(atrasada({ STATUS: 'EM_ANDAMENTO', DATA_LIMITE: '2026-10-30' }, hoje), false);
  assert.equal(atrasada({ STATUS: 'CONCLUIDA', DATA_LIMITE: '2026-10-28' }, hoje), false);
  assert.equal(atrasada({ STATUS: 'PENDENTE', DATA_LIMITE: null }, hoje), false);
  assert.equal(hojeBrasilia(new Date('2026-10-31T02:30:00Z')), '2026-10-30', '23h30 de Brasília ainda é dia 30');
});

test('C-005 / RN-007: Kanban em três colunas na ordem do servidor', () => {
  const abertas = [
    { ID: 1, STATUS: 'PENDENTE' }, { ID: 2, STATUS: 'PENDENTE' }, { ID: 3, STATUS: 'EM_ANDAMENTO' }, { ID: 4, STATUS: 'EM_ANDAMENTO' },
  ];
  const cols = colunasKanban(abertas, [{ ID: 9, STATUS: 'CONCLUIDA' }]);
  assert.deepEqual(cols.map(c => c.titulo), ['A FAZER', 'EM ANDAMENTO', 'CONCLUÍDA']);
  assert.deepEqual(cols.map(c => c.itens.map(i => i.ID)), [[1, 2], [3, 4], [9]]);
});

test('C-006 / RN-003: mensagem da troca de status e linha do log', () => {
  assert.equal(mensagemStatus('CONCLUIDA'), 'Atividade marcada como concluída.');
  assert.equal(mensagemStatus('PENDENTE'), 'Atividade marcada como a fazer.');
  assert.equal(mensagemStatus('EM_ANDAMENTO'), 'Atividade marcada como em andamento.');
  assert.equal(
    textoLog({ CAMPO_ALTERADO: 'STATUS', VALOR_ANTERIOR: 'PENDENTE', VALOR_NOVO: 'CONCLUIDA', USUARIO: 'Ana Souza', DATA_ALTERACAO: '2026-10-30 14:32:10' }),
    'Status alterado — De A Fazer para Concluída — Ana Souza — 30/10/2026 14:32',
  );
});

test('C-007 / RN-009: log de prazo no formato da spec; salvar sem mudança não grava', () => {
  assert.equal(
    textoLog({ CAMPO_ALTERADO: 'DATA_LIMITE', VALOR_ANTERIOR: '2026-11-05', VALOR_NOVO: '2026-11-08', USUARIO: 'Ana Souza', DATA_ALTERACAO: '2026-10-30 14:32:00' }),
    'Prazo alterado — De 05/11/2026 para 08/11/2026 — Ana Souza — 30/10/2026 14:32',
  );
  assert.equal(textoLog({ CAMPO_ALTERADO: 'CRIACAO', USUARIO: 'Ana Souza', DATA_ALTERACAO: '2026-10-30T09:00:00' }), 'Atividade criada — Ana Souza — 30/10/2026 09:00');
  assert.equal(textoLog({ CAMPO_ALTERADO: 'PRIORIDADE', VALOR_ANTERIOR: 'MEDIA', VALOR_NOVO: 'ALTA', USUARIO: 'Ana', DATA_ALTERACAO: '2026-10-30 10:00:00' }).startsWith('Prioridade alterada — De Média para Alta'), true);
  const f = formDe({ TITULO: 'Ligar', DESCRICAO: 'x', DATA_LIMITE: '2026-11-05', PRIORIDADE: 'ALTA' });
  assert.equal(mudou(f, { ...f }), false);
  assert.equal(mudou(f, { ...f, titulo: ' Ligar ' }), false, 'espaço nas pontas não é mudança');
  assert.equal(mudou(f, { ...f, prazo: '2026-11-08' }), true);
});

test('C-010 / RNT-013: 0 alterados vira mensagem de erro, nunca sucesso', () => {
  assert.equal(mensagemRecusa(true, 'salvar'), 'Nada foi alterado: a atividade não é sua.');
  assert.equal(mensagemRecusa(false, 'salvar'), 'Não foi possível salvar a atividade.');
  assert.equal(mensagemRecusa(false, 'excluir'), 'Não foi possível excluir a atividade.');
});

test('RF-001: visão inicial = preferência da sessão', () => {
  assert.equal(visaoInicial({ exibicaoAtividades: 'KANBAN' }), 'KANBAN');
  assert.equal(visaoInicial({ exibicaoAtividades: 'LISTA' }), 'LISTA');
  assert.equal(visaoInicial({}), 'LISTA');
});
