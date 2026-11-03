// Spec 002 — regra de tela de Titulares de Clientes (RN-020, T-108).
import test from 'node:test';
import assert from 'node:assert/strict';
import { candidatos, trocarFiltro, FILTROS_PADRAO, mensagemTitular, MSG_NAO_SALVO } from '../src/lib/titulares.ts';

test('RN-020: trocar filial limpa departamento e volta à página 1', () => {
  const f = { ...FILTROS_PADRAO, filial: '1', depto: '2', pagina: 3 };
  assert.deepEqual(trocarFiltro(f, 'filial', '2'), { ...f, filial: '2', depto: '', pagina: 1 });
  assert.equal(trocarFiltro(f, 'depto', '1').filial, '1');
});

test('RN-020: candidatos vêm do texto da SF em ordem de nome', () => {
  assert.deepEqual(candidatos('3:Bruno Lima|2:Ana Souza'), [{ id: '2', nome: 'Ana Souza' }, { id: '3', nome: 'Bruno Lima' }]);
  assert.deepEqual(candidatos(''), []);
  assert.deepEqual(candidatos(null), []);
});

test('RN-020: linhas afetadas decidem sucesso ou "Titular não salvo"', () => {
  const linha = { CLIENTE: 'Hospital X', DEPTO: 'Hospitalar', SECAO: 'Todas' };
  assert.equal(mensagemTitular(linha, 'Ana Souza', 1).ok, true);
  assert.match(mensagemTitular(linha, 'Ana Souza', 1).texto, /Ana Souza/);
  assert.deepEqual(mensagemTitular(linha, 'Ana Souza', 0), { ok: false, texto: MSG_NAO_SALVO });
});
