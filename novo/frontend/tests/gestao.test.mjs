// Spec 010 — regras de tela de gestão, coordenação e diretoria (T-087).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MSG_BLOCO, ACOES_CONFIRMADAS, calcularComissao, confirmacao, lerValor, mensagemBloqueio, resumoEscopos, textoAtingimento,
  textoGap, textoMeta, validarMotivo, validarSupervisor,
} from '../src/lib/gestao.ts';

const sp = (texto) => texto.replace(/\s/g, ' ');

test('C-001: 48.000 contra 60.000 → 80,0% e "Faltam R$ 12.000,00"', () => {
  assert.equal(textoAtingimento(48000, 60000), '80,0%');
  assert.equal(sp(textoGap(60000, 48000)), 'Faltam R$ 12.000,00');
  assert.equal(sp(textoMeta(60000)), 'R$ 60.000,00');
});

test('C-002: sem meta distribuída → "Meta não distribuída", "—" e sem texto de gap', () => {
  assert.equal(textoMeta(0), 'Meta não distribuída');
  assert.equal(textoMeta(0, { bu: true }), 'Sem meta');
  assert.equal(textoAtingimento(5000, 0), '—');
  assert.equal(textoGap(0, 5000), '');
  assert.equal(textoGap(0, 0), '');
});

test('RN-006: meta 50.000 e realizado 55.000 → 110,0% e "Meta superada em R$ 5.000,00"', () => {
  assert.equal(textoAtingimento(55000, 50000), '110,0%');
  assert.equal(sp(textoGap(50000, 55000)), 'Meta superada em R$ 5.000,00');
  assert.equal(sp(textoGap(50000, 50000)), 'Meta superada em R$ 0,00');
});

test('C-010 / RN-011: comissão calculada e texto da exclusão', () => {
  assert.equal(calcularComissao(50000, 3), 1500);
  assert.equal(calcularComissao(12345.67, 2.5), 308.64);
  assert.equal(confirmacao('excluirComissao', 'Ana de 10/2026').texto,
    'Excluir a comissão de Ana de 10/2026? Esta ação não pode ser desfeita.');
});

test('RN-011 / RNT-011: valor aceita 1.500,50 e 1500.50', () => {
  assert.equal(lerValor('1.500,50'), 1500.5);
  assert.equal(lerValor('1500.50'), 1500.5);
  assert.equal(lerValor('1.500'), 1500);
  assert.equal(lerValor('3'), 3);
  assert.ok(Number.isNaN(lerValor('abc')));
  assert.ok(Number.isNaN(lerValor('')));
});

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
    'excluirComissao', 'encerrarFerias', 'desativarAcesso']) {
    assert.ok(ACOES_CONFIRMADAS.includes(acao), acao);
    const c = confirmacao(acao, 'ALVO-X');
    assert.ok(c.texto.includes('ALVO-X') && c.botao && c.perigo, acao);
  }
});

test('C-026: bloco que falha mostra a frase padrão', () => {
  assert.equal(MSG_BLOCO, 'Não foi possível carregar este bloco agora. Tente atualizar a tela.');
});

test('RN-002: bloqueio do Painel para vendedora diz os perfis e o dela, sem nome de cadastro interno', () => {
  const linhas = mensagemBloqueio('/painel-gestao', { papeis: ['VENDEDOR'], coordenadorAtivo: false });
  assert.deepEqual(linhas, ['Esta tela está disponível apenas para Gestão e TI.', 'Seu perfil: Vendedor']);
  assert.ok(!/USUARIO|CARGO|COORDENADORES|tabela/i.test(linhas.join(' ')));
});

test('RN-001: COORDENADOR sem cadastro ativo vê a mensagem própria nas telas do coordenador', () => {
  const rita = { papeis: ['COORDENADOR'], coordenadorAtivo: false };
  assert.deepEqual(mensagemBloqueio('/ferias-vendedor', rita), ['Seu cadastro de coordenador não está ativo. Procure a diretoria.']);
  assert.equal(mensagemBloqueio('/painel-gestao', rita)[0], 'Esta tela está disponível apenas para Gestão e TI.');
});
