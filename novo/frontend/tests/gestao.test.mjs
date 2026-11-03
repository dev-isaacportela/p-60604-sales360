// Spec 010 — regras de tela de gestão, coordenação e diretoria (T-087).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MSG_BLOCO, ACOES_CONFIRMADAS, confirmacao, mensagemBloqueio, resumoEscopos, validarMotivo, validarSupervisor,
} from '../src/lib/gestao.ts';

test('C-012: "2 escopos vinculados. 1 já existia."', () => {
  assert.equal(resumoEscopos(3, 2), '2 escopos vinculados. 1 já existia.');
  assert.equal(resumoEscopos(1, 1), '1 escopo vinculado.');
  assert.equal(resumoEscopos(1, 0), 'Nenhum escopo novo. 1 já existia.');
});

test('C-016: supervisor "45A" é recusado', () => {
  assert.equal(validarSupervisor('45A'), 'Informe um código de supervisor numérico.');
  assert.equal(validarSupervisor('45'), null);
});

test('RN-022: motivo até 500 caracteres', () => {
  assert.equal(validarMotivo('x'.repeat(600)), 'O motivo pode ter até 500 caracteres.');
  assert.equal(validarMotivo('Desligamento'), null);
  assert.equal(validarMotivo(''), null);
});

test('RN-025: toda ação que desfaz algo tem confirmação que nomeia o alvo', () => {
  for (const acao of ['desvincularEscopo', 'removerRca', 'inativarCoordenador', 'removerBuCoordenador',
    'encerrarFerias', 'desativarAcesso']) {
    assert.ok(ACOES_CONFIRMADAS.includes(acao), acao);
    const c = confirmacao(acao, 'ALVO-X');
    assert.ok(c.texto.includes('ALVO-X') && c.botao && c.perigo, acao);
  }
});

test('C-026: bloco que falha mostra a frase padrão', () => {
  assert.equal(MSG_BLOCO, 'Não foi possível carregar este bloco agora. Tente atualizar a tela.');
});

test('RN-002: bloqueio de Usuários para vendedora diz os perfis e o dela, sem nome de cadastro interno', () => {
  const linhas = mensagemBloqueio('/governanca-rca', { papeis: ['VENDEDOR'], coordenadorAtivo: false });
  assert.deepEqual(linhas, ['Esta tela está disponível apenas para Coordenador, Diretoria, Gestão e TI.', 'Seu perfil: Vendedor']);
  assert.ok(!/USUARIO|CARGO|COORDENADORES|tabela/i.test(linhas.join(' ')));
});

test('RN-001: COORDENADOR sem cadastro ativo vê a mensagem própria nas telas do coordenador', () => {
  const rita = { papeis: ['COORDENADOR'], coordenadorAtivo: false };
  assert.deepEqual(mensagemBloqueio('/ferias-vendedor', rita), ['Seu cadastro de coordenador não está ativo. Procure a diretoria.']);
  assert.equal(mensagemBloqueio('/gestao-coordenadores', rita)[0], 'Esta tela está disponível apenas para Diretoria e TI.');
});
