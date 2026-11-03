// Spec 001 — regra de tela do login e da recuperação de senha (T-092).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMINHOS_LOGIN, mensagemErroLogin, validarCodigo, validarNovaSenha, limparCredencial, destinoAposRedefinir,
} from '../src/lib/login.ts';

test('C-003 / RN-002: erro do provedor vira mensagem fixa, nunca o texto técnico', () => {
  const tecnico = new Error('popup_window_error: blocked');
  assert.equal(mensagemErroLogin('microsoft', tecnico), 'Falha no login. Tente novamente.');
  assert.equal(mensagemErroLogin('google', new Error('access_denied: user closed window')), 'Falha no login. Tente novamente.');
  assert.equal(mensagemErroLogin('email', new Error('Invalid credentials')), 'Erro na autenticação');
  assert.equal(mensagemErroLogin('codigo'), 'Código inválido ou expirado');
  assert.ok(!mensagemErroLogin('microsoft', tecnico).includes('popup'));
});

test('C-004 / RF-002: login oferece Google, Microsoft, e-mail/senha e Esqueci minha senha, sem criar conta', () => {
  assert.deepEqual(CAMINHOS_LOGIN.map(c => c.id), ['google', 'microsoft', 'email', 'recuperar']);
  assert.deepEqual(
    CAMINHOS_LOGIN.map(c => c.rotulo),
    ['Continue com Google', 'Continue com Microsoft', 'Entrar', 'Esqueci minha senha'],
  );
  assert.equal(CAMINHOS_LOGIN.filter(c => /criar|cadastr/i.test(c.rotulo + c.id)).length, 0);
  assert.equal(limparCredencial('  diego@benenutri.local  '), 'diego@benenutri.local');
});

test('RN-003: código de recuperação tem exatamente 6 dígitos', () => {
  assert.deepEqual(validarCodigo('12345'), { codigo: '12345', erro: 'Digite o código de 6 dígitos' });
  assert.deepEqual(validarCodigo('1234567'), { codigo: '123456', erro: null });
  assert.equal(validarCodigo('12a456').erro, 'Digite o código de 6 dígitos');
  assert.deepEqual(validarCodigo('654321'), { codigo: '654321', erro: null });
});

test('C-005: senhas diferentes são recusadas; sucesso volta ao login com aviso e e-mail', () => {
  assert.equal(validarNovaSenha('abc12345', 'abc12346'), 'As senhas não conferem');
  assert.equal(validarNovaSenha('abc12345', 'abc12345'), null);
  assert.deepEqual(destinoAposRedefinir(' eva@benenutri.local '), {
    caminho: '/login',
    estado: { email: 'eva@benenutri.local', aviso: 'Senha redefinida. Entre com a nova senha.' },
  });
});
