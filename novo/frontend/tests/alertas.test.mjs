// Spec 008 — regras de tela de Alertas, Prospecção e Prospects.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filtrosDaUrl, urlDosFiltros, mudarFiltro, paraEntrada, agruparPorCliente, mensagemMarcar, oportunidades,
  serieHistorica, tituloHistorico, etapasPermitidas, validarContato, validarConversao, linkAgendarVisita, subtituloProspeccao,
} from '../src/lib/alertas.ts';

test('RN-010: filtros vão e voltam do endereço; trocar filtro volta à página 1', () => {
  const f = filtrosDaUrl('?tipo=REPOSICAO&valorMin=1.500,50&pagina=3&situacao=XYZ');
  assert.equal(f.tipo, 'REPOSICAO');
  assert.equal(f.pagina, 3);
  assert.equal(f.situacao, 'NAO_LIDOS');
  assert.equal(urlDosFiltros(f), '?tipo=REPOSICAO&valorMin=1.500%2C50&pagina=3');
  assert.equal(mudarFiltro(f, 'ramo', 'Hospital').pagina, 1);
  assert.equal(urlDosFiltros(filtrosDaUrl('')), '');
  const e = paraEntrada({ ...f, busca: ' 12.345.678/0001-90 ' });
  assert.equal(e.valorMin, '1500.5');
  assert.equal(e.buscaDigitos, '12345678000190');
});

test('RN-010: agrupa por cliente na ordem da SF; até 2 alertas abre', () => {
  const g = agruparPorCliente([
    { ID: 1, ID_CLIENTE: 9, CLIENTE: 'X', N_CLIENTE: 3, POTENCIAL_CLIENTE: 900 },
    { ID: 2, ID_CLIENTE: 9, CLIENTE: 'X', N_CLIENTE: 3, POTENCIAL_CLIENTE: 900 },
    { ID: 3, ID_CLIENTE: 7, CLIENTE: 'Y', N_CLIENTE: 1, POTENCIAL_CLIENTE: 100 },
  ]);
  assert.deepEqual(g.map(x => [x.id, x.alertas.length, x.aberto]), [[9, 2, false], [7, 1, true]]);
});

test('C-005 / C-008: mensagem de marcar diz quantos mudaram e, se zero, por quê', () => {
  assert.equal(mensagemMarcar(1).texto, 'Alerta marcado como lido.');
  assert.equal(mensagemMarcar(4, { todos: true }).texto, '4 alertas marcados como lidos.');
  assert.equal(mensagemMarcar(0, { podeMarcar: false }).tom, 'error');
  assert.match(mensagemMarcar(0, { podeMarcar: false }).texto, /outro vendedor/);
});

test('RF-006: oportunidades são as 3 de maior potencial', () => {
  const painel = ['A', 'B', 'C', 'D'].map((p, i) => ({ TIPO_LINHA: 'PRODUTO', PRODUTO: p, N: 1, POTENCIAL: i * 10 }));
  assert.deepEqual(oportunidades(painel).map(o => o.produto), ['D', 'C', 'B']);
  assert.equal(oportunidades(painel, true).length, 4);
});

test('RN-014: série de 13 meses com zero onde não comprou', () => {
  const s = serieHistorica('2026-11-03', [{ MES: '2025-11', VALOR: 100, PEDIDOS: 1 }, { MES: '2026-11', VALOR: 50, PEDIDOS: 1 }]);
  assert.equal(s.length, 13);
  assert.equal(s[0].mes, '2025-11');
  assert.equal(s[0].rotulo, 'nov/25');
  assert.equal(s[6].valor, 0);
  assert.equal(tituloHistorico(s), 'padrão de sazonalidade confirmado');
  assert.equal(tituloHistorico(serieHistorica('2026-11-03', [])), 'Sem histórico neste período');
});

test('RN-022 / RN-023: etapas manuais, Convertido final, contato e código validados', () => {
  assert.ok(!etapasPermitidas('NOVO').some(e => e.value === 'CONVERTIDO' || e.value === 'NOVO'));
  assert.deepEqual(etapasPermitidas('CONVERTIDO'), []);
  assert.equal(validarContato({ nome: ' ', email: '' }), 'Informe o nome do contato.');
  assert.equal(validarContato({ nome: 'Rita', email: 'rita@' }), 'Informe um e-mail válido.');
  assert.equal(validarContato({ nome: 'Rita', email: '' }), null);
  assert.equal(validarConversao('45210'), null);
  assert.ok(validarConversao('45-210'));
});

test('RF-012 / RF-014: subtítulo da prospecção e link de agendar com o cliente', () => {
  assert.equal(subtituloProspeccao({ semana: 1, mes: 'Novembro', altas: 3 }), 'Semana 1 de Novembro — 3 clientes com alta tendência de recompra');
  assert.equal(linkAgendarVisita(8001, 'Clínica São José'), '/agenda?clienteId=8001&cliente=Cl%C3%ADnica+S%C3%A3o+Jos%C3%A9');
});
