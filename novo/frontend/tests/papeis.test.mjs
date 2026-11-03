// Spec 010 — Papéis de Usuários e menu de Férias (T-089).
import test from 'node:test';
import assert from 'node:assert/strict';
import { editavel, lerPapeis, marcacoes, mensagemPapeis, partesUsuarios } from '../src/lib/papeis.ts';
import { montarMenu, podeAbrir } from '../src/lib/menu.ts';

test('C-017: GESTOR + Coordenador marcado manda só os editáveis; a mensagem lista os dois', () => {
  const marcados = [...lerPapeis('GESTOR'), 'COORDENADOR'];
  assert.deepEqual(marcacoes(marcados), { diretoria: 0, coordenador: 1, vendedor: 0 });
  assert.equal(mensagemPapeis('Paulo', ['GESTOR', 'COORDENADOR']), 'Paulo: papéis salvos (COORDENADOR, GESTOR).');
});

test('RN-016: GESTOR e ADMIN não são editáveis; sem papel = VENDEDOR', () => {
  assert.equal(editavel('ADMIN'), false);
  assert.equal(editavel('GESTOR'), false);
  assert.equal(editavel('DIRETORIA'), true);
  assert.deepEqual(lerPapeis(''), ['VENDEDOR']);
  assert.deepEqual(lerPapeis('GESTOR,COORDENADOR'), ['COORDENADOR', 'GESTOR']);
});

test('RN-001: Férias de Vendedores abre para Diretoria sem cadastro de coordenador, uma vez só no menu', () => {
  const diretoria = { papeis: ['DIRETORIA'], coordenadorAtivo: false };
  assert.equal(podeAbrir('/ferias-vendedor', diretoria), true);
  assert.equal(podeAbrir('/ferias-vendedor', { papeis: ['COORDENADOR'], coordenadorAtivo: false }), false);
  const itens = montarMenu(diretoria).flatMap(s => s.itens.map(i => i.caminho));
  assert.equal(itens.filter(c => c === '/ferias-vendedor').length, 1);
  const gil = montarMenu({ papeis: ['DIRETORIA', 'COORDENADOR'], coordenadorAtivo: true });
  assert.equal(gil.flatMap(s => s.itens).filter(i => i.caminho === '/ferias-vendedor').length, 1);
  assert.ok(gil.find(s => s.id === 'coordenador').itens.some(i => i.caminho === '/ferias-vendedor'));
});

test('RN-001: em Usuários, diretoria edita papéis, gestão RCA e escopo, coordenador ativo só o acesso da equipe', () => {
  assert.deepEqual(partesUsuarios(['DIRETORIA', 'COORDENADOR'], true), { papeis: true, rcaEscopo: false, acesso: true, soEquipe: false });
  assert.deepEqual(partesUsuarios(['GESTOR']), { papeis: false, rcaEscopo: true, acesso: true, soEquipe: false });
  assert.deepEqual(partesUsuarios(['ADMIN']), { papeis: true, rcaEscopo: true, acesso: true, soEquipe: false });
  assert.deepEqual(partesUsuarios(['COORDENADOR'], true), { papeis: false, rcaEscopo: false, acesso: true, soEquipe: true });
  assert.deepEqual(partesUsuarios(['VENDEDOR']), { papeis: false, rcaEscopo: false, acesso: false, soEquipe: true });
});
