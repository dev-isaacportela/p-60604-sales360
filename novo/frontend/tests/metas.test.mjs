// Spec 007 — regra de tela da aba Metas.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lerValor, alteracoes, statusRateio, statusVendedor, ratear, mensagemSalvar, mensagemInvalido, mensagemRamosAcima,
  mensagemMotivo, perguntaDescartar, rotuloBu, origem, ramosDoVendedor, validarRamos, aplicarRamos, insights, planilhaMetas,
  chaveVendedor, MSG_NADA,
} from '../src/lib/metas.ts';

test('C-010 / RN-018: campo de meta', () => {
  assert.equal(lerValor('1.500,50'), 1500.5);
  assert.equal(lerValor('1500.50'), 1500.5);
  assert.equal(lerValor('R$ 1.500,50'), 1500.5);
  assert.equal(lerValor('1,500'), 1500);
  assert.equal(lerValor('0'), 0);
  assert.equal(lerValor(''), null);
  assert.equal(lerValor('-10'), null);
  assert.equal(lerValor('abc'), null);
});

const V = (id, nome, meta, extra = {}) => ({ VENDEDOR_ID: id, NOME: nome, CODFILIAL: 71, CODEPTO: 1, UF: 'DF', META: meta, REALIZADO: 0, ...extra });

test('C-009 / C-010 / RN-019: só o que mudou; inválido barra tudo', () => {
  const vend = [V(1, 'Ana', 1000), V(2, 'Bruno', 2000), V(3, 'Caio', 0)];
  const ed = { [chaveVendedor(vend[0])]: '1.200,00', [chaveVendedor(vend[1])]: '2000', [chaveVendedor(vend[2])]: '500' };
  const r = alteracoes(vend, ed);
  assert.deepEqual(r.metas.map(m => m.vendedorId), [1, 3]);
  assert.equal(r.invalidos.length, 0);
  assert.equal(alteracoes(vend, { [chaveVendedor(vend[0])]: '1000,00' }).metas.length, 0, 'reescrito igual');
  const ruim = alteracoes(vend, { ...ed, [chaveVendedor(vend[1])]: '' });
  assert.deepEqual(ruim.invalidos, ['Bruno']);
  assert.equal(mensagemInvalido(ruim.invalidos), 'Valor de meta inválido em: Bruno. Nada foi gravado.');
  assert.equal(MSG_NADA, 'Nenhuma alteração para salvar.');
  assert.equal(mensagemSalvar(2, 0), 'Metas salvas: 2 vendedor(es).');
  assert.equal(mensagemSalvar(2, 3), 'Metas salvas: 2 vendedor(es) e 3 ajuste(s) por ramo/UF.');
  assert.equal(mensagemSalvar(0, 1), 'Metas salvas: 1 ajuste(s) por ramo/UF.');
});

test('C-011: motivo da recusa', () => {
  assert.equal(mensagemMotivo({ MOTIVO: 'BU_NAO_COORDENADA', CODFILIAL: 73, DEPTO: 'Medicamento' }), 'Nada foi alterado: você não coordena a BU Filial 73 · Medicamento.');
  assert.match(mensagemMotivo({ MOTIVO: 'SOMENTE_LEITURA' }), /^Nada foi alterado/);
});

test('RF-019: confirmação de descarte', () => {
  assert.equal(perguntaDescartar(2), 'Existem 2 alterações de meta ainda não salvas. Recarregar os dados vai descartar essas alterações. Deseja continuar?');
});

test('RN-013: status do rateio', () => {
  assert.equal(statusRateio({ meta: 90000, distribuido: 90000 }), 'rateio fechado');
  assert.equal(statusRateio({ meta: 90000, distribuido: 0 }), 'não distribuído');
  assert.equal(statusRateio({ meta: 90000, distribuido: 60000 }), 'em aberto');
  assert.equal(statusRateio({ meta: 90000, distribuido: 60000, pendente: true }), 'alterações não salvas');
  assert.equal(statusRateio({ meta: 0, distribuido: 0, semEquipe: true }), 'sem equipe no escopo');
});

test('RN-014: status do vendedor', () => {
  assert.equal(statusVendedor(10000, 10000), 'acima');
  assert.equal(statusVendedor(10000, 8500), 'atenção');
  assert.equal(statusVendedor(10000, 7000), 'risco');
  assert.equal(statusVendedor(0, 7000), 'sem meta');
});

test('C-012 / RN-015: rateio rápido', () => {
  const tres = (r, m) => r.map((x, i) => ({ realizado: x, meta: m[i] }));
  assert.deepEqual(ratear('IGUAL', 90000, tres([0, 0, 0], [0, 0, 0])), [30000, 30000, 30000]);
  assert.deepEqual(ratear('IGUAL', 60000, tres([0, 0], [0, 0])), [30000, 30000]);
  assert.deepEqual(ratear('REALIZADO', 90000, tres([50000, 30000, 20000], [0, 0, 0])), [45000, 27000, 18000]);
  assert.deepEqual(ratear('PROPORCAO', 90000, tres([0, 0, 0], [40000, 40000, 20000])), [36000, 36000, 18000]);
  assert.deepEqual(ratear('REALIZADO', 90000, tres([0, 0, 0], [0, 0, 0])), [30000, 30000, 30000]);
  assert.deepEqual(ratear('REALIZADO', 90000, tres([-10, 50, 50], [0, 0, 0])), [0, 45000, 45000]);
});

test('RF-015 / RF-013: rótulo e origem', () => {
  assert.equal(rotuloBu({ CODFILIAL: 71, UF: 'DF', DEPTO: 'Nutrição' }), 'Filial 71 · DF · Nutrição');
  assert.equal(origem([{ UF: 'GO', META: 1 }, { UF: 'DF', META: 2 }, { UF: 'GO', META: 3 }]), 'Planejamento estratégico · DF, GO');
});

const BASE = [
  { CODEPTO: 1, UF: 'DF', RAMO: 'HOSPITAL', RAMO_NOME: 'Hospital', VALOR: 60 },
  { CODEPTO: 1, UF: 'DF', RAMO: 'CLINICA', RAMO_NOME: 'Clínica', VALOR: 40 },
  { CODEPTO: 1, UF: 'GO', RAMO: 'HOSPITAL', RAMO_NOME: 'Hospital', VALOR: 100 },
];
const UFS = [{ VENDEDOR_ID: 1, CODEPTO: 1, UF: 'DF' }];
const ramos = (extra = {}) => ramosDoVendedor({ vendedorId: 1, codepto: 1, metaBu: 100000, base: BASE, ufs: UFS, personalizadas: [], realizado: [], ...extra });
const valor = (linhas, ramo) => linhas.find(l => l.ramo === ramo).valor;

test('C-013 / RN-012: ramo/UF', () => {
  const auto = ramos();
  assert.equal(auto.length, 2, 'só as UFs do vendedor');
  assert.equal(valor(auto, 'HOSPITAL'), 60000);
  assert.equal(valor(auto, 'CLINICA'), 40000);

  const fixada = ramos({ fixados: { 'CLINICA|DF': 30000 } });
  assert.equal(valor(fixada, 'CLINICA'), 30000);
  assert.equal(valor(fixada, 'HOSPITAL'), 70000);
  assert.ok(validarRamos(fixada, 100000));
  assert.equal(aplicarRamos(fixada, [{ meta: 100000 }]), null, 'meta da BU não muda');

  assert.ok(!validarRamos(ramos({ fixados: { 'CLINICA|DF': 150000 } }), 100000));
  assert.equal(mensagemRamosAcima(['Ana']), 'Os ramos ajustados passam da meta total de: Ana. Reduza os valores. Nada foi gravado.');

  const duas = ramos({ fixados: { 'CLINICA|DF': 30000, 'HOSPITAL|DF': 50000 } });
  assert.deepEqual(aplicarRamos(duas, [{ meta: 60000 }, { meta: 40000 }]), [48000, 32000]);

  const gravada = ramos({ personalizadas: [{ VENDEDOR_ID: 1, CODEPTO: 1, RAMO_CODE: 'CLINICA', RAMO_NOME: 'Clínica', UF: 'DF', META_VALOR: 30000 }] });
  assert.equal(valor(gravada, 'HOSPITAL'), 70000);
  assert.equal(valor(ramos({ personalizadas: gravada.length ? [{ VENDEDOR_ID: 1, CODEPTO: 1, RAMO_CODE: 'CLINICA', RAMO_NOME: 'Clínica', UF: 'DF', META_VALOR: 30000 }] : [], fixados: { 'CLINICA|DF': null } }), 'CLINICA'), 40000, 'volta a automática');

  const semPlano = ramos({ realizado: [{ VENDEDOR_ID: 1, CODEPTO: 1, UF: 'DF', RAMO: 'PDV', RAMO_NOME: 'PDV', LIQUIDO: 500 }] });
  const pdv = semPlano.find(l => l.ramo === 'PDV');
  assert.equal(pdv.editavel, false);
  assert.equal(pdv.realizado, 500);
});

test('RF-021: ocupação por região e relatório', () => {
  const bus = [
    { CODFILIAL: 71, CODEPTO: 1, UF: 'DF', META: 100, DEPTO: 'Nutrição' },
    { CODFILIAL: 72, CODEPTO: 1, UF: 'GO', META: 300, DEPTO: 'Nutrição' },
    { CODFILIAL: 73, CODEPTO: 1, UF: 'MG', META: 50, DEPTO: 'Nutrição' },
    { CODFILIAL: 74, CODEPTO: 1, UF: 'BA', META: 10, DEPTO: 'Nutrição' },
  ];
  const vend = [V(1, 'Ana', 100, { REALIZADO: 90 }), V(2, 'Bia', 300, { CODFILIAL: 72, UF: 'GO', REALIZADO: 150 })];
  const i = insights(bus, vend, [{ RAMO_NOME: 'Hospital', LIQUIDO: 200 }, { RAMO_NOME: 'Clínica', LIQUIDO: 40 }]);
  assert.deepEqual(i.ocupacao.map(e => e.uf), ['GO', 'DF', 'MG']);
  assert.equal(i.destaque.uf, 'DF');
  assert.equal(i.ramoLider.ramo, 'Hospital');
  const p = planilhaMetas(2026, 11, bus, vend, [{ vendedor: vend[0], linhas: ramos() }]);
  assert.equal(p.arquivo, 'metas-2026-11.xlsx');
  assert.equal(p.abas[0].linhas.length, 2);
  assert.equal(p.abas[1].linhas.length, 2);
});
