// Spec 005 — regra de tela do Dashboard (T-089).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saudacao, compromissosDeHoje, fraseCompromissos, textoMetaComposta, proximaSegunda, mesDe, diasUteis, cardMensal,
  ultimosDiasUteis, variacao, serieDiaria, ultimasAtividades, resumoSemana, pct, MSG_FALHA_BLOCO, DESCRICAO_PADRAO,
} from '../src/lib/dashboard.ts';
import { meta } from '../src/lib/agenda.ts';
import { hojeBrasilia } from '../src/lib/formato.ts';

test('C-001: 08:30, sem nome de exibição, e-mail ana.souza@… → Bom dia, Ana Souza.', () => {
  assert.equal(saudacao('08:30', '', 'ana.souza@benenutri.com'), 'Bom dia, Ana Souza.');
  assert.equal(saudacao('12:00', '', 'ana.souza@benenutri.com'), 'Boa tarde, Ana Souza.');
  assert.equal(saudacao('18:00', '', 'ana.souza@benenutri.com'), 'Boa noite, Ana Souza.');
});

test('RN-001: 11:59 Bom dia; nome com "@" usa o e-mail; "_" e "-" viram espaço; sem nome nem e-mail → você', () => {
  assert.equal(saudacao('11:59', 'Ana', 'x@y'), 'Bom dia, Ana.');
  assert.equal(saudacao('09:00', 'maria_clara-lima@benenutri.com', 'maria_clara-lima@benenutri.com'), 'Bom dia, Maria Clara Lima.');
  assert.equal(saudacao('20:00', '', ''), 'Boa noite, você.');
});

test('C-002 / RN-002: 3 visitas (1 cancelada) + 1 prospecção + 1 interna hoje → 4; 23:30 de Brasília é hoje', () => {
  const hoje = '2026-11-20';
  const itens = [
    { DATA: hoje, STATUS: 'AGENDADA', HORA_INICIO: '10:00' }, { DATA: hoje, STATUS: 'CONCLUIDA', HORA_INICIO: '08:00' },
    { DATA: hoje, STATUS: 'CANCELADA', HORA_INICIO: '09:00' }, { DATA: hoje, STATUS: 'AGENDADA', HORA_INICIO: '11:00', ORIGEM: 'PROSPECCAO' },
    { DATA: hoje, STATUS: 'AGENDADA', HORA_INICIO: '23:30', ORIGEM: 'INTERNA' }, { DATA: '2026-11-21', STATUS: 'AGENDADA', HORA_INICIO: '08:00' },
  ];
  const deHoje = compromissosDeHoje(itens, hoje);
  assert.equal(deHoje.length, 4);
  assert.deepEqual(deHoje.map((i) => i.HORA_INICIO), ['08:00', '10:00', '11:00', '23:30']);
  assert.equal(hojeBrasilia(new Date('2026-11-21T02:30:00Z')), hoje);
  assert.equal(fraseCompromissos(4, 'ME'), 'Você tem 4 compromissos para hoje.');
  assert.equal(fraseCompromissos(1, 'ME'), 'Você tem 1 compromisso para hoje.');
  assert.equal(fraseCompromissos(0, 'ME'), 'Você não tem nenhum compromisso para hoje.');
});

test('C-012: frases no escopo de time e de vendedor específico', () => {
  assert.equal(fraseCompromissos(9, 'TEAM'), 'O time tem 9 compromissos para hoje.');
  assert.equal(fraseCompromissos(9, 'ALL'), 'O time tem 9 compromissos para hoje.');
  assert.equal(fraseCompromissos(4, 'SELLER', 'Ana'), 'Ana tem 4 compromissos para hoje.');
});

test('C-003 / C-004 / RN-005: realizadas 13 de 16 → restantes 3, 81%; meta composta e filtro vazio', () => {
  assert.deepEqual(meta({ REALIZADO: 13, META: 16 }), { realizadas: 13, meta: 16, restantes: 3, percentual: 81 });
  assert.deepEqual(meta({ REALIZADO: 20, META: 16 }).restantes, 0);
  assert.deepEqual(meta({ REALIZADO: 0, META: 0 }).percentual, 0);
  assert.equal(textoMetaComposta('TEAM', { VENDEDOR: 16, COORDENADOR: 8 }, 4), 'Meta composta do filtro atual: vendedores 16/semana e coordenadores 8/semana.');
  assert.equal(textoMetaComposta('ME', { VENDEDOR: 16, COORDENADOR: 8 }, 1), null);
  assert.equal(textoMetaComposta('TEAM', null, 0), 'Nenhuma pessoa no filtro atual.');
});

test('RF-004: meta salva na quinta 12/11 ou no domingo 15/11 vale a partir de 16/11', () => {
  assert.equal(proximaSegunda('2026-11-12'), '2026-11-16');
  assert.equal(proximaSegunda('2026-11-15'), '2026-11-16');
  assert.equal(proximaSegunda('2026-11-16'), '2026-11-23');
});

test('C-005: hoje 20/11/2026, 15 de 21 dias úteis, líquido 65.000 e meta 100.000 → 65,0%, projeção 91.000, No ritmo', () => {
  const { inicio, fim } = mesDe('2026-11-20');
  assert.deepEqual([inicio, fim], ['2026-11-01', '2026-11-30']);
  assert.deepEqual(diasUteis(inicio, fim, '2026-11-20'), { total: 21, decorridos: 15 });
  const c = cardMensal({ liquido: 65000, meta: 100000, inicio, fim, hoje: '2026-11-20' });
  assert.equal(pct(c.percentual), '65,0%');
  assert.equal(Math.round(c.projecao), 91000);
  assert.equal(c.selo, 'No ritmo');
});

test('C-006: meta 50.000 e líquido 60.000 → 120,0%, círculo 100, Acima da meta', () => {
  const c = cardMensal({ liquido: 60000, meta: 50000, ...mesDe('2026-11-20'), hoje: '2026-11-20' });
  assert.equal(pct(c.percentual), '120,0%');
  assert.equal(c.circulo, 100);
  assert.equal(c.selo, 'Acima da meta');
});

test('C-007: meta não distribuída (nula ou zero) → sem percentual nem selo', () => {
  for (const m of [null, 0]) {
    const c = cardMensal({ liquido: 1000, meta: m, ...mesDe('2026-11-20'), hoje: '2026-11-20' });
    assert.deepEqual([c.distribuida, c.percentual, c.selo], [false, null, null]);
  }
});

test('RN-007: mês passado, sábado 21/11 (feriado 20/11 conta) e mês que começa no sábado', () => {
  const out = cardMensal({ liquido: 50000, meta: 100000, ...mesDe('2026-10-15'), hoje: '2026-11-03' });
  assert.equal(out.projecao, 50000);
  assert.equal(diasUteis('2026-11-01', '2026-11-30', '2026-11-21').decorridos, 15);
  assert.equal(diasUteis('2026-08-01', '2026-08-31', '2026-08-01').decorridos, 0);
  assert.equal(cardMensal({ liquido: 700, meta: 1000, ...mesDe('2026-08-01'), hoje: '2026-08-01' }).projecao, 700);
  assert.equal(diasUteis('2026-10-01', '2026-10-31', '2026-10-31').total, 22);
});

test('RN-008: o selo segue a projeção, nunca o percentual atingido', () => {
  const { inicio, fim } = mesDe('2026-11-30');
  const selo = (projecao) => cardMensal({ liquido: projecao, meta: 100000, inicio, fim, hoje: '2026-11-30' }).selo;
  assert.equal(selo(100000), 'Acima da meta');
  assert.equal(selo(90000), 'No ritmo');
  assert.equal(selo(89999), 'Abaixo da meta');
  // 85.000 realizados (85%) em 20 de 21 dias úteis → projeção 89.250
  const c = cardMensal({ liquido: 85000, meta: 100000, inicio, fim, hoje: '2026-11-27' });
  assert.equal(pct(c.percentual), '85,0%');
  assert.equal(c.selo, 'Abaixo da meta');
});

test('C-008 / RN-009: 7 barras de 04/11 a 12/11, 12/11 = -25,0%, 06/11 = —', () => {
  const linhas = [['2026-11-03', 1000], ['2026-11-04', 3000], ['2026-11-06', 2000], ['2026-11-09', 5000], ['2026-11-10', 4000], ['2026-11-11', 8000], ['2026-11-12', 6000]]
    .map(([DIA, LIQUIDO]) => ({ DIA, LIQUIDO }));
  const s = serieDiaria(linhas, '2026-11-12');
  assert.deepEqual(s.map((d) => d.dia), ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12']);
  assert.deepEqual(s.map((d) => d.valor), [3000, 0, 2000, 5000, 4000, 8000, 6000]);
  assert.equal(s[6].variacao, '-25,0%');
  assert.equal(s[2].variacao, '—');
  assert.equal(s[4].variacao, '-20,0%');
  assert.equal(s[0].variacao, '+200,0%');
});

test('RN-009: 0 e 0 → 0,0%; anterior −200 → —; sábado 14/11 → última barra 13/11', () => {
  assert.equal(variacao(0, 0), '0,0%');
  assert.equal(variacao(500, -200), '—');
  assert.equal(variacao(500, null), '—');
  assert.deepEqual(ultimosDiasUteis('2026-11-14', 7).at(-1), '2026-11-13');
  assert.equal(ultimosDiasUteis('2026-11-14', 7).length, 7);
});

test('RN-011: pendentes por prazo (vencida primeiro, sem prazo por último), 3 de 5, descrição padrão', () => {
  const abertas = [
    { ID: 1, DATA_LIMITE: '2026-11-20', DESCRICAO: 'a' }, { ID: 2, DATA_LIMITE: null, DESCRICAO: '' },
    { ID: 3, DATA_LIMITE: '2026-11-10', DESCRICAO: 'c' },
  ];
  assert.deepEqual(ultimasAtividades(abertas).map((a) => a.ID), [3, 1, 2]);
  assert.equal(ultimasAtividades(abertas)[2].DESCRICAO, DESCRICAO_PADRAO);
  assert.equal(ultimasAtividades([...abertas, { ID: 4, DATA_LIMITE: '2026-11-01' }, { ID: 5, DATA_LIMITE: '2026-11-02' }]).length, 3);
});

test('C-009 / RN-012: relatos do cenário, da mais recente para a mais antiga', () => {
  const hoje = '2026-11-11';
  const itens = [
    { ORIGEM: 'VISITA', DATA: '2026-11-10', HORA_INICIO: '09:00', STATUS: 'CONCLUIDA', CHECKOUT_HORA: '2026-11-11 08:00:00' },
    { ORIGEM: 'VISITA', DATA: '2026-11-10', HORA_INICIO: '14:00', STATUS: 'AGENDADA' },
    { ORIGEM: 'VISITA', DATA: '2026-11-13', HORA_INICIO: '09:00', STATUS: 'AGENDADA' },
    { ORIGEM: 'VISITA', DATA: '2026-11-09', HORA_INICIO: '09:00', STATUS: 'CANCELADA' },
    { ORIGEM: 'PROSPECCAO', DATA: '2026-11-09', HORA_INICIO: '11:00', STATUS: 'CONCLUIDA', CHECKOUT_HORA: '2026-11-09 12:05:00' },
    { ORIGEM: 'INTERNA', DATA: '2026-11-09', HORA_INICIO: '07:00', STATUS: 'CONCLUIDA' },
  ];
  const r = resumoSemana(itens, hoje);
  assert.deepEqual(r.map((i) => i.relato), ['—', 'Relato pendente', 'Ok', 'Ok', 'Cancelada']);
  assert.equal(r[2].dataRelato, '2026-11-11');
  const quinze = Array.from({ length: 15 }, (_, i) => ({ ORIGEM: 'VISITA', DATA: '2026-11-10', HORA_INICIO: String(i).padStart(2, '0'), STATUS: 'AGENDADA' }));
  assert.equal(resumoSemana(quinze, hoje).length, 12);
  assert.equal(resumoSemana([{ ORIGEM: 'VISITA', DATA: '2026-11-10', STATUS: 'EM_ANDAMENTO' }], hoje)[0].relato, 'Relato pendente');
});

test('C-011: mensagem padrão do bloco com falha (C-007 da 000)', () => {
  assert.equal(MSG_FALHA_BLOCO, 'Não foi possível carregar este bloco agora. Tente atualizar a tela.');
});
