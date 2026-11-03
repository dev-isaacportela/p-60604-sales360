// Spec 008 — regras de tela do Direcionamento Estratégico Semanal.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  segundaDe, navegarSemana, rotuloSemana, resumoAgenda, comOcorrencia, corExecucao, pctExecucao, dadosExemplo,
  planilhaAgenda, valorCelula, FORMATOS, totaisFaixa, comCliente,
} from '../src/lib/direcionamento.ts';

test('RNT-006: semana de segunda a sexta; fim de semana fica com a semana que acabou', () => {
  assert.equal(segundaDe('2026-10-29'), '2026-10-26');
  assert.equal(segundaDe('2026-11-01'), '2026-10-26');
  assert.equal(segundaDe('2026-10-26'), '2026-10-26');
  assert.equal(navegarSemana('2026-10-26', 1), '2026-11-02');
  assert.equal(rotuloSemana('2026-10-26'), '26/10 a 30/10/2026');
});

// C-018: 11 compromissos → 10 agendadas, 8 concluídas, 2 não concluídas, 2 sem relato, 2 reagendadas, 1 cancelada, 80%.
const compromisso = (extra) => ({ EXECUTIVO_ID: 1, EXECUTIVO: 'Ana', CONCLUIDA: 0, NAO_CONCLUIDA: 0, SEM_RELATO: 0, VENCIDA: 0, REAGENDADA: 0, CANCELADA: 0, ...extra });
const C018 = [
  ...Array.from({ length: 8 }, (_, i) => compromisso({ CONCLUIDA: 1, REAGENDADA: i < 2 ? 1 : 0 })),
  compromisso({ NAO_CONCLUIDA: 1, SEM_RELATO: 1, VENCIDA: 1 }),
  compromisso({ NAO_CONCLUIDA: 1, SEM_RELATO: 1 }),
  compromisso({ CANCELADA: 1 }),
];

test('C-018 / RN-026: resumo por executivo e execução 80% verde', () => {
  const [r] = resumoAgenda(C018);
  assert.deepEqual([r.agendadas, r.concluidas, r.naoConcluidas, r.semRelato, r.reagendadas, r.canceladas], [10, 8, 2, 2, 2, 1]);
  assert.equal(r.execucao, 0.8);
  assert.equal(pctExecucao(r.execucao), '80%');
  assert.equal(corExecucao(0.8), 'live');
  assert.equal(corExecucao(0.5), 'attention');
  assert.equal(corExecucao(0.49), 'alert');
  assert.ok(comOcorrencia(r));
});

test('RN-029: planilha com 5 executivos + Total; Execução 0,8 com formato 0%', () => {
  const linhas = [1, 2, 3, 4, 5].flatMap(id => C018.map(c => ({ ...c, EXECUTIVO_ID: id, EXECUTIVO: `E${id}` })));
  const p = planilhaAgenda(resumoAgenda(linhas), '2026-10-30');
  assert.equal(p.arquivo, 'controle-agenda-2026-10-30.xlsx');
  const [resumo, compromissos] = p.abas;
  assert.equal(resumo.nome, 'Resumo por executivo');
  assert.equal(resumo.linhas.length, 6);
  assert.equal(resumo.linhas[5].EXECUTIVO, 'Total');
  assert.equal(resumo.linhas[5].EXECUCAO, 0.8);
  assert.equal(FORMATOS[resumo.colunas.find(c => c.campo === 'EXECUCAO').formato], '0%');
  assert.equal(compromissos.linhas.length, 55);
  assert.ok(valorCelula('2026-10-27', 'data') instanceof Date);
  assert.equal(valorCelula('12.5', 'moeda'), 12.5);
});

test('RF-020: dados de exemplo são locais e a exportação leva o aviso', () => {
  const ex = dadosExemplo('2026-10-26');
  assert.ok(ex.length > 0);
  assert.ok(ex.every(c => c.DATA >= '2026-10-26' && c.DATA <= '2026-10-30'));
  assert.match(planilhaAgenda(resumoAgenda(ex), '2026-10-30', true).aviso, /DADOS DE EXEMPLO/);
});

test('RN-028: totais por faixa vêm da primeira linha; a linha só de totais não é cliente', () => {
  const linhas = [{ ID_CLIENTE: null, N_NUNCA: 2, N_31_60: 1, N_61_90: 0, N_90: 3 }];
  assert.deepEqual(totaisFaixa(linhas), { NUNCA: 2, '31_60': 1, '61_90': 0, '90': 3 });
  assert.equal(comCliente(linhas).length, 0);
});
