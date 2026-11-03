// Spec 010 — Gestão de Carteira (T-207).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mensagemTransferencia, resumoTransferencia, escoposDoVendedor, precisaEscolherEscopo, rotuloEscopo,
} from '../src/lib/gestao-carteira.ts';
import { confirmacao, ACOES_CONFIRMADAS } from '../src/lib/gestao.ts';

test('C-018 / RN-018: transferência que não muda nada diz por quê', () => {
  assert.equal(mensagemTransferencia('JA_TEM', 'Bruno', ''), 'Nada foi alterado: Bruno já tem este cliente nesta filial e seção.');
  assert.equal(mensagemTransferencia('SEM_ESCOPO', 'Bruno', 'Filial 2 · Nutrição'), 'Nada foi alterado: Bruno não atua em Filial 2 · Nutrição.');
  assert.match(mensagemTransferencia('FORA_DA_EQUIPE', 'Bruno', ''), /^Nada foi alterado: /);
});

test('C-019: carteira inteira responde transferidos e já existentes', () => {
  assert.equal(resumoTransferencia(37, 3, 'Bruno'), '37 clientes transferidos. 3 já estavam com Bruno.');
  assert.equal(resumoTransferencia(1, 0, 'Bruno'), '1 cliente transferido.');
  assert.equal(resumoTransferencia(0, 1, 'Bruno'), 'Nada foi alterado: 1 já estava com Bruno.');
  assert.equal(resumoTransferencia(0, 0, 'Bruno'), 'Nada foi alterado.');
});

test('C-020: dois escopos pedem escolha; um não pede', () => {
  const linhas = [
    { VENDEDOR_ID: 7, CODFILIAL: '1', FILIAL: 'Brasília', CODEPTO: '1', BU: 'Nutrição', ID_SECAO: 10001, SECAO: 'Seção 1' },
    { VENDEDOR_ID: 7, CODFILIAL: '2', FILIAL: null, CODEPTO: '1', BU: 'Nutrição', ID_SECAO: 10001, SECAO: 'Seção 1' },
    { VENDEDOR_ID: 8, CODFILIAL: '1', FILIAL: 'Brasília', CODEPTO: '1', BU: 'Nutrição', ID_SECAO: null, SECAO: null },
  ];
  const ana = escoposDoVendedor(linhas, '7');
  assert.equal(precisaEscolherEscopo(ana), true);
  assert.deepEqual(ana.map(e => e.rotulo), ['Brasília · Nutrição · Seção 1', 'Filial 2 · Nutrição · Seção 1']);
  const bruno = escoposDoVendedor(linhas, 8);
  assert.equal(precisaEscolherEscopo(bruno), false);
  assert.deepEqual(bruno[0], { codFilial: '1', codepto: '1', idSecao: '', rotulo: 'Brasília · Nutrição' });
  assert.equal(rotuloEscopo({ CODFILIAL: '3', CODEPTO: '15' }), 'Filial 3 · 15');
});

test('RN-025: Transferir toda carteira pede confirmação nomeando origem e destino', () => {
  assert.ok(ACOES_CONFIRMADAS.includes('transferirCarteira'));
  const c = confirmacao('transferirCarteira', 'de Ana para Bruno (40 clientes; 3 já estão com Bruno)');
  assert.equal(c.titulo, 'Transferir toda carteira');
  assert.match(c.texto, /de Ana para Bruno \(40 clientes; 3 já estão com Bruno\)/);
  assert.equal(c.perigo, true);
});
