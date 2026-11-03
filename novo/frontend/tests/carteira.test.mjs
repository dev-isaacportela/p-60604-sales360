// Spec 002 — regra de tela da carteira de clientes (T-106).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ABAS, abaInicial, recomendacao, alertaDias, rotuloStatus, aoMudarFiltro, FILTROS_PADRAO,
  validarRelato, validarProspect, CAMPOS_FICHA, mensagemMotivo, ultimaPagina,
} from '../src/lib/carteira.ts';

test('RN-009: recomendação pelo fator com menor proporção; empate segue Recência, Frequência, Tendência, Visitas', () => {
  assert.equal(recomendacao({ recencia: 30, frequencia: 25, tendencia: 5, visitas: 20 }), 'Volume em queda — investigue o motivo na próxima visita.');
  assert.equal(recomendacao({ recencia: 0, frequencia: 25, tendencia: 25, visitas: 0 }), 'Priorize um contato esta semana para reativar o cliente.');
  assert.equal(recomendacao({ recencia: 30, frequencia: 25, tendencia: 25, visitas: 12 }), 'Agende uma visita presencial para fortalecer o relacionamento.');
});

test('C-006 / RN-013: trocar filtro, busca ou ordenação volta à página 1', () => {
  const na2 = { ...FILTROS_PADRAO, pagina: 2 };
  assert.equal(aoMudarFiltro(na2, 'ordem', 'NOME_AZ').pagina, 1);
  assert.equal(aoMudarFiltro(na2, 'busca', 'lucas').busca, 'lucas');
  assert.equal(ultimaPagina(41, 10), 5);
  assert.equal(ultimaPagina(0, 10), 1);
});

test('RN-011: alertas de dias e rótulo do status do cadastro', () => {
  assert.equal(alertaDias('visita', 31), true);
  assert.equal(alertaDias('visita', 30), false);
  assert.equal(alertaDias('compra', 26), true);
  assert.equal(alertaDias('compra', 25), false);
  assert.equal(alertaDias('visita', null), false);
  assert.equal(rotuloStatus('INATIVO'), 'Inativo');
  assert.equal(rotuloStatus('EM_RISCO'), 'Em risco');
});

test('C-016 / RN-016: relato com as mesmas recusas do servidor', () => {
  const ok = { data: '2026-10-30', hora: '10:00', tipo: 'Ligação', relato: 'Pediu tabela nova.' };
  assert.equal(validarRelato(ok, '2026-10-30'), null);
  assert.ok(validarRelato({ ...ok, data: '2026-10-31' }, '2026-10-30'));
  assert.ok(validarRelato({ ...ok, relato: '   ' }, '2026-10-30'));
  assert.ok(validarRelato({ ...ok, relato: 'x'.repeat(4001) }, '2026-10-30'));
  assert.ok(validarRelato({ ...ok, tipo: 'Fax' }, '2026-10-30'));
});

test('C-017 / RN-021: prospect sem razão social é recusado na tela', () => {
  const base = { razaoSocial: '', uf: '', probabilidade: '', observacoes: '' };
  assert.equal(validarProspect(base), 'Informe a razão social ou nome do cliente prospecto.');
  assert.equal(validarProspect({ ...base, razaoSocial: 'Clínica Nova' }), null);
  assert.ok(validarProspect({ ...base, razaoSocial: 'Clínica Nova', probabilidade: '101' }));
});

test('RN-014: ficha mostra os nove campos do cadastro', () => {
  assert.deepEqual(CAMPOS_FICHA.map(c => c.rotulo), [
    'Razão Social', 'Nome Fantasia', 'CNPJ', 'Segmento', 'Cidade', 'UF', 'Telefone', 'E-mail', 'Endereço',
  ]);
});

test('RN-019: motivo da recusa vira a mensagem da spec', () => {
  assert.equal(mensagemMotivo('JA_TEM_RESPONSAVEL'), 'Este cliente já possui responsável no mesmo escopo da sua carteira.');
  assert.equal(mensagemMotivo('SEM_ESCOPO'), 'Seu usuário não possui vínculo ativo de filial/seção para adicionar clientes.');
  assert.equal(mensagemMotivo(undefined), 'Cliente não encontrado para vinculação.');
});

test('RF-015: rota com cliente abre a carteira buscando; ?clienteId abre o histórico', () => {
  assert.deepEqual(abaInicial({ clienteId: '1234' }, ''), { aba: 'carteira', busca: '1234', clienteId: '' });
  assert.deepEqual(abaInicial({}, '?clienteId=1234'), { aba: 'historico', busca: '', clienteId: '1234' });
  assert.equal(abaInicial({}, '').aba, 'carteira');
});

test('RF-018: quatro abas na ordem da spec', () => {
  assert.deepEqual(ABAS.map(a => a.rotulo), ['MINHA CARTEIRA', 'CLIENTES DISPONÍVEIS', 'HISTÓRICO DO CLIENTE', 'PROSPECTS']);
});
