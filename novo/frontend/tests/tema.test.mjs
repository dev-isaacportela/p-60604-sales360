// Spec 001 — tema sincronizado com o Meu painel (T-095).
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolverTema, aoAvisoDoPainel, aoBotao, aoSistemaMudar } from '../src/lib/tema.ts';

test('C-014 / RN-009: painel em escuro vence a escolha salva sem gravar; botão grava e avisa; sem eco', () => {
  const abertura = resolverTema({ url: '?tema=dark', salvo: 'claro', sistema: 'claro' });
  assert.deepEqual(abertura, { tema: 'escuro', painelFalou: true });

  assert.deepEqual(aoAvisoDoPainel({ tipo: 'mitra-tema', tema: 'dark' }), { aplicar: 'escuro', gravar: null, reenviar: null });
  assert.deepEqual(aoAvisoDoPainel({ tipo: 'mitra-tema', tema: 'light' }).aplicar, 'claro');
  assert.equal(aoAvisoDoPainel({ tipo: 'mitra-auth', tema: 'dark' }), null);

  assert.deepEqual(aoBotao('escuro'), { aplicar: 'claro', gravar: 'claro', aviso: { tipo: 'mitra-tema', tema: 'light' } });
  assert.deepEqual(aoBotao('claro').aviso, { tipo: 'mitra-tema', tema: 'dark' });

  // Fora do painel, a escolha salva continua valendo.
  assert.equal(resolverTema({ url: '', salvo: 'claro', sistema: 'escuro' }).tema, 'claro');
});

test('RN-009 (ordem): sem painel vale a escolha salva; sem escolha segue o sistema operacional', () => {
  assert.equal(resolverTema({ url: '', salvo: 'escuro', sistema: 'claro' }).tema, 'escuro');
  assert.equal(resolverTema({ url: '', salvo: 'dark', sistema: 'claro' }).tema, 'escuro');
  assert.deepEqual(resolverTema({ url: '', salvo: null, sistema: 'escuro' }), { tema: 'escuro', painelFalou: false });
  assert.equal(aoSistemaMudar({ sistema: 'escuro', salvo: null, painelFalou: false }), 'escuro');
  assert.equal(aoSistemaMudar({ sistema: 'escuro', salvo: 'claro', painelFalou: false }), null);
  assert.equal(aoSistemaMudar({ sistema: 'escuro', salvo: null, painelFalou: true }), null);
});
