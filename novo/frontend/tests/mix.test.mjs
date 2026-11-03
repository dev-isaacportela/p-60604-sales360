// Spec 009 — Mix Builder, regras de tela (T-931).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pct, lerValor, limitarMargem, precoPelaMargem, margemPeloPreco, custoInicial, itemNovo, trocarCusto,
  mudarMargem, mudarPreco, aplicarTrocaCliente, calcularItem, totais, faixaMargem, faixaCmvConcorrente,
  motivoBloqueioSalvar, duplicar, idadeCustos, fotoSegura, csvMix, nomeArquivo, htmlProposta, abrirProposta,
  payloadItens, filtrarOrdenar, itemGravado, AVISO_SEM_CUSTO, AVISO_POPUP, AVISO_FORA_CARTEIRA,
} from '../src/lib/mix.ts';

const padrao = (custo) => ({ tipo: 'PADRAO', custo, politicaId: 0, politicaNome: '' });
const especial = (custo, politicaId, politicaNome) => ({ tipo: 'ESPECIAL', custo, politicaId, politicaNome });
const produto = (codprod, nome = `Produto ${codprod}`) => ({ codprod, nome, categoria: 'Depto 1 / Seção 101', foto: '' });

// C-007: A(70; preço 100; 10) + B(50; margem 20; 4).
const itemA = { ...itemNovo(produto(9714, 'Dieta Enteral'), [padrao(70)], 'PADRAO').item, qtd: 10 };
const itemB = { ...mudarMargem(itemNovo(produto(9715, 'Suplemento'), [padrao(50)], 'PADRAO').item, 20), qtd: 4 };
const c007 = [mudarPreco(itemA, 100), itemB];

test('C-001: custo 70 entra com margem 30 e preço 100; qtd 10 → subtotal 1.000', () => {
  const { item } = itemNovo(produto(9714), [padrao(70)], 'PADRAO');
  assert.equal(item.margem, 30);
  assert.equal(item.preco, 100);
  assert.equal(calcularItem({ ...item, qtd: 10 }).subtotal, 1000);
});

test('C-002 / RN-003: margem 20 → 87,50; preço 65 → −7,7% e faixa Baixa', () => {
  const item = itemNovo(produto(9714), [padrao(70)], 'PADRAO').item;
  assert.equal(mudarMargem(item, 20).preco, 87.5);
  const porPreco = mudarPreco(item, 65);
  assert.equal(porPreco.margem, -7.69);
  assert.equal(pct(porPreco.margem), '−7,7%');
  assert.equal(faixaMargem(porPreco.margem), 'Baixa');
  assert.equal(margemPeloPreco(70, 0), 0);
});

test('RN-008 (escolha): especial usa o menor; padrão usa o padrão; sem padrão, o primeiro especial', () => {
  const opcoes = [padrao(70), especial(60, 1, 'A'), especial(55, 2, 'B')];
  assert.equal(custoInicial(opcoes, 'ESPECIAL').custo, 55);
  assert.equal(custoInicial(opcoes, 'PADRAO').custo, 70);
  assert.equal(custoInicial([especial(60, 1, 'A'), especial(55, 2, 'B')], 'PADRAO').custo, 55);
  assert.equal(custoInicial([padrao(70)], 'ESPECIAL').custo, 70);
});

test('C-005 / RN-009: produto sem opção entra com custo 0, tipo sem custo e aviso', () => {
  const { item, aviso } = itemNovo(produto(9001), [], 'ESPECIAL');
  assert.deepEqual([item.custo, item.tipo, item.preco], [0, 'SEM_CUSTO', 0]);
  assert.equal(aviso, AVISO_SEM_CUSTO);
});

test('C-006 / RN-010: trocar cliente devolve o especial ao padrão mantendo a margem', () => {
  const i714 = itemNovo(produto(9714), [padrao(70), especial(60, 901, 'Rede Sul')], 'ESPECIAL').item;
  const i715 = itemNovo(produto(9715), [padrao(40)], 'ESPECIAL').item;
  assert.equal(i714.custo, 60);
  const novas = new Map([[9714, [padrao(70)]], [9715, [padrao(40)]]]);
  const r = aplicarTrocaCliente([i714, i715], novas);
  assert.equal(r.itens[0].custo, 70);
  assert.equal(r.itens[0].tipo, 'PADRAO');
  assert.equal(r.itens[0].margem, 30);
  assert.equal(r.itens[0].preco, 100);
  assert.deepEqual(r.itens[1], i715);
  assert.equal(r.trocados, 1);
  assert.equal(r.mensagem, '1 item teve o custo trocado para o padrão porque o novo cliente não tem direito ao custo especial.');
  // Mesma política vale para o novo cliente → nada muda.
  assert.equal(aplicarTrocaCliente([i714], new Map([[9714, [padrao(70), especial(60, 901, 'Rede Sul')]]])).trocados, 0);
});

test('C-007 / RN-005: totais do mix', () => {
  assert.equal(c007[1].preco, 62.5);
  const t = totais(c007);
  assert.deepEqual([t.custo, t.venda, t.unidades], [900, 1250, 14]);
  assert.equal(pct(t.margem), '28,0%');
  assert.equal(faixaMargem(t.margem), 'Atenção');
  assert.equal(pct(t.cmv), '72,0%');
  assert.equal(pct(t.markup), '38,9%');
});

test('RN-006: faixas de margem e de CMV do concorrente', () => {
  assert.deepEqual([30, 29.99, 19.99].map(faixaMargem), ['Saudável', 'Atenção', 'Baixa']);
  assert.deepEqual([70, 85, 85.1].map(faixaCmvConcorrente), ['verde', 'ambar', 'vermelho']);
});

test('RF-008: CMV do concorrente não muda os totais', () => {
  const comConc = [{ ...c007[0], precoConcorrente: 80 }, c007[1]];
  assert.equal(calcularItem(comConc[0]).cmvConcorrente, 87.5);
  assert.equal(faixaCmvConcorrente(87.5), 'vermelho');
  assert.deepEqual(totais(comConc), totais(c007));
  assert.equal(calcularItem(c007[0]).cmvConcorrente, null);
});

test('RN-001: preço pela margem com margem limitada a 95', () => {
  assert.equal(precoPelaMargem(10, 95), 200);
  assert.equal(limitarMargem(99), 95);
  assert.equal(mudarMargem(itemA, 99).preco, precoPelaMargem(70, 95));
  assert.equal(limitarMargem(-5), 0);
});

test('RN-002 / RN-004: entra com 30; trocar custo 70 → 60 mantém a margem → 85,71', () => {
  const item = itemNovo(produto(9714), [padrao(70)], 'PADRAO').item;
  const trocado = trocarCusto(item, especial(60, 901, 'Rede Sul'));
  assert.equal(trocado.margem, 30);
  assert.equal(trocado.preco, 85.71);
});

test('C-008: motivo do salvar bloqueado', () => {
  assert.equal(motivoBloqueioSalvar({ clienteId: null, nome: 'x', itens: c007 }), 'Selecione o cliente para salvar');
  assert.equal(motivoBloqueioSalvar({ clienteId: 9001, nome: ' ', itens: c007 }), 'Informe o nome do mix para salvar');
  assert.equal(motivoBloqueioSalvar({ clienteId: 9001, nome: 'x', itens: [] }), 'Adicione ao menos um produto para salvar');
  assert.equal(motivoBloqueioSalvar({ clienteId: 9001, nome: 'x', itens: c007 }), null);
});

test('C-017: cliente fora da carteira bloqueia o salvar com o aviso', () => {
  assert.equal(motivoBloqueioSalvar({ clienteId: 9003, nome: 'Inverno', itens: c007, foraDaCarteira: true }), AVISO_FORA_CARTEIRA);
});

test('C-011: duplicar abre a cópia sem id e com os mesmos itens', () => {
  const copia = duplicar({ id: 9001, nome: 'Campanha Verão', clienteId: 9001 }, c007);
  assert.equal(copia.nome, 'Campanha Verão - Cópia');
  assert.equal(copia.id, null);
  assert.deepEqual(copia.itens, c007);
  assert.notEqual(copia.itens[0], c007[0]);
});

test('contrato itens: só os campos do item, sem totais', () => {
  assert.deepEqual(JSON.parse(payloadItens([c007[0]])), [{ p: 9714, q: 10, t: 'PADRAO', c: 70, m: 30, v: 100, k: 0 }]);
});

test('reabrir: item especial gravado recupera a política pelo custo', () => {
  const item = itemGravado({ ID_PRODUTO: 9714, NOME: 'Dieta', QUANTIDADE: 2, TIPO_CUSTO: 'ESPECIAL', CUSTO_UNITARIO: '60.00', MARGEM_PERCENT: '30.00', PRECO_VENDA: '85.71', FOTO_URL: 'http://x' },
    [padrao(70), especial(60, 901, 'Rede Sul')]);
  assert.deepEqual([item.politicaId, item.politicaNome, item.custo, item.foto], [901, 'Rede Sul', 60, '']);
});

test('RF-009: filtro sem acento e ordenações', () => {
  const lista = [c007[0], c007[1], { ...c007[1], codprod: 9718, nome: 'AÇAÍ', margem: 10 }];
  assert.deepEqual(filtrarOrdenar(lista, 'acai', 'inclusao').map(i => i.codprod), [9718]);
  assert.deepEqual(filtrarOrdenar(lista, '', 'menorMargem').map(i => i.margem), [10, 20, 30]);
  assert.deepEqual(filtrarOrdenar(lista, '', 'maiorSubtotal')[0].codprod, 9714);
});

test('C-013 / RN-015: proposta mostra totais ao cliente e nunca custo, margem ou CMV', () => {
  const html = htmlProposta({ nome: 'Campanha Verão', cliente: '9001 - Mercado Bom', descricao: '', data: '2026-10-30T09:00:00' }, c007, 'logo.png');
  for (const texto of ['R$ 1.250,00', '>14<', 'R$ 89,29', '30/10/2026', 'logo.png', 'Valor Final', 'Preço Médio']) {
    assert.ok(html.replace(/ /g, ' ').includes(texto), texto);
  }
  for (const proibido of ['Custo', 'Margem', 'CMV', 'Mark up', 'oncorrente']) assert.ok(!html.includes(proibido), proibido);
});

test('C-014: pop-up bloqueado → mensagem e nada é escrito', () => {
  assert.deepEqual(abrirProposta(() => null, '<html>'), { ok: false, mensagem: AVISO_POPUP });
  const escrito = [];
  const janela = { document: { open() {}, write: (h) => escrito.push(h), close() {} } };
  assert.equal(abrirProposta(() => janela, '<p>x</p>').ok, true);
  assert.deepEqual(escrito, ['<p>x</p>']);
});

test('C-015 / RN-015: planilha com ";", vírgula decimal, BOM e linha TOTAL', () => {
  const csv = csvMix(c007);
  assert.ok(csv.startsWith('﻿'));
  const linhas = csv.slice(1).split('\r\n');
  assert.equal(linhas.length, 4);
  assert.ok(linhas[0].startsWith('#;Código;Produto;Categoria;Custo Unitário'));
  assert.ok(linhas[3].startsWith('TOTAL;'));
  assert.ok(linhas[3].endsWith(';1250,00'));
  assert.ok(linhas[1].includes(';70,00;10;100,00;70,00;42,86;30,00;;1000,00'));
  assert.equal(nomeArquivo('Campanha Verão'), 'campanha-verao.csv');
});

test('C-016 / RN-014: idade dos custos', () => {
  const ultima = '2026-10-30T14:00:00'; // UTC = 11:00 em Brasília
  const em = (min) => new Date(Date.parse(`${ultima}Z`) + min * 60000);
  assert.deepEqual(idadeCustos(ultima, em(190)), { texto: 'Custos sincronizados há 3h. Os valores podem estar desatualizados.', aviso: true });
  assert.equal(idadeCustos(ultima, em(1500)).texto, 'Custos sincronizados há 1 dia(s). Os valores podem estar desatualizados.');
  assert.deepEqual(idadeCustos(ultima, em(90)), { texto: 'Custos atualizados às 11:00', aviso: false });
});

test('C-019 / RN-017: só endereço https vira foto', () => {
  assert.equal(fotoSegura('http://x/1.jpg'), '');
  assert.equal(fotoSegura(''), '');
  assert.equal(fotoSegura('https://x/1.jpg'), 'https://x/1.jpg');
});

test('RNT-011: percentual com 1 casa e leitura de valor nos dois formatos', () => {
  assert.equal(pct(12.345), '12,3%');
  assert.equal(pct(-7.6923), '−7,7%');
  assert.equal(lerValor('1.500,50'), 1500.5);
  assert.equal(lerValor('1500.50'), 1500.5);
  assert.ok(Number.isNaN(lerValor('')));
});
