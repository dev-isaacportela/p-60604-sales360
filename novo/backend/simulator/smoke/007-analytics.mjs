// Smoke da spec 007 — blocos do Analytics, comparativo e aba Metas.
// Leituras primeiro; gravacoes de meta no fim.

import { CLIENTE, COORD } from '../seeds/007-analytics.mjs';
import { metaRecebida, ramoDoCliente, unidadeDoDepto } from '../../lib/007-regras.mjs';

export default async function ({ teste, chamar, linhas, banco, db, ID, assert }) {
  const id = (email) => banco(`SELECT ID FROM INT_USER WHERE DESCR = '${email}'`)[0].ID;
  const AMELIA = id('amelia.torres@benenutri.local');
  const BENICIO = id('benicio.alves@benenutri.local');
  const VERA = id('vera.lins@benenutri.local');
  const HUGO = id('hugo.matos@benenutri.local');
  const CAIO = id('caio.prates@benenutri.local');
  const DALVA = id('dalva.rocha@benenutri.local');
  const GIL = ID.GIL;
  const exec = (sql) => db.exec(sql);

  const RECORTE = {
    modo: 'ME', coordenador: '', vendedor: '', filial: '', depto: '', secao: '', hoje: '2026-10-15',
    de: '2026-10-01', ate: '2026-10-31', deAnt: '2026-09-01', ateAnt: '2026-09-30',
    ramos: '', clientes: '', produtos: '', porDia: '0', pagina: '1',
  };
  const bloco = (nome, userId, input = {}) => linhas(`s360Analytics${nome}`, { ...RECORTE, ...input }, userId);
  const soma = (rows, col) => rows.reduce((s, r) => s + Number(r[col] || 0), 0);

  /* ─────────────── blocos ─────────────── */

  await teste('C-001 / RN-004: overview do mes', async () => {
    const [r] = await bloco('Resumo', AMELIA);
    assert.deepEqual([r.META, r.BRUTO, r.DEVOLVIDO, r.LIQUIDO].map(Number), [50000, 42000, 2000, 40000]);
  });

  await teste('RNT-003 / RN-011: modo sem permissao nao devolve venda', async () => {
    const [r] = await bloco('Resumo', AMELIA, { modo: 'TEAM' });
    assert.deepEqual([Number(r.META), Number(r.LIQUIDO)], [0, 0]);
  });

  await teste('C-005 / RN-003: equipe recortada pela BU do coordenador', async () => {
    const [caio] = await bloco('Resumo', CAIO, { modo: 'SELLER', vendedor: String(BENICIO) });
    const [dalva] = await bloco('Resumo', DALVA, { modo: 'SELLER', vendedor: String(BENICIO) });
    assert.deepEqual([Number(caio.LIQUIDO), Number(dalva.LIQUIDO)], [30000, 20000]);
    const [time] = await bloco('Resumo', DALVA, { modo: 'TEAM' });
    assert.equal(Number(time.LIQUIDO), 20000);
  });

  await teste('C-003 / RN-002: filtro de filial vale para todos os blocos', async () => {
    const f = { filial: '72' };
    const [r] = await bloco('Resumo', BENICIO, f);
    assert.equal(Number(r.LIQUIDO), 20000);
    assert.equal(Number(r.META), 20000);
    assert.equal(soma((await bloco('Evolucao', BENICIO, f)).filter((x) => x.TIPO === 'L'), 'VALOR'), 20000);
    assert.equal(soma((await bloco('Produtos', BENICIO, f)).filter((x) => x.GRUPO === 'RAMO'), 'VALOR'), 20000);
    assert.equal(Number((await bloco('Clientes', BENICIO, f))[0].TOTAL_LIQUIDO), 20000);
    assert.equal(Number((await bloco('Carteira', BENICIO, f))[0].LIQUIDO), 20000);
    assert.equal(soma(await bloco('Comparativo', BENICIO, { ...f, categoria: 'CLIENTE', metrica: 'FATURAMENTO' }), 'VALOR'), 20000);
    assert.equal(Number((await bloco('Devolucoes', BENICIO, f)).find((x) => x.PARTE === 'TOTAL').VALOR_TOTAL), 0);
    assert.equal(Number((await bloco('Resumo', BENICIO))[0].LIQUIDO), 50000, 'sem filtro: as duas BUs');
  });

  await teste('C-004 / RN-007: analise de carteira', async () => {
    const [c] = await bloco('Carteira', AMELIA);
    assert.deepEqual(['CARTEIRA', 'ATIVOS', 'INATIVOS', 'EM_RISCO', 'NOVOS', 'LIQUIDO'].map((k) => Number(c[k])), [40, 25, 15, 6, 2, 40000]);
    const risco = await bloco('CarteiraLista', AMELIA, { situacao: 'EM_RISCO' });
    assert.equal(risco.length, 6);
    assert.equal(Number(risco[0].TOTAL), 6);
    assert.equal(Number(risco.find((x) => Number(x.CODCLI) === CLIENTE.RISCO1).DIAS_SEM_COMPRA), 40, 'de 05/09 a 15/10');
    const inativos = await bloco('CarteiraLista', AMELIA, { situacao: 'INATIVO' });
    assert.equal(Number(inativos[0].TOTAL), 15);
    assert.equal(inativos.length, 15);
    const encerrado = await bloco('CarteiraLista', AMELIA, { situacao: 'EM_RISCO', hoje: '2026-11-20' });
    assert.equal(Number(encerrado.find((x) => Number(x.CODCLI) === CLIENTE.RISCO1).DIAS_SEM_COMPRA), 56, 'periodo encerrado: ate o fim dele');
  });

  await teste('RN-006: meta da evolucao segue o escopo', async () => {
    const r = await bloco('Evolucao', CAIO, { modo: 'TEAM' });
    assert.equal(Number(r.find((x) => x.TIPO === 'M' && x.CHAVE === '2026-10').VALOR), 105000, 'Amelia 50 + 4 x 10 + Benicio 15');
    const dias = await bloco('Evolucao', AMELIA, { porDia: '1' });
    assert.ok(dias.filter((x) => x.TIPO === 'L').every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.CHAVE)));
  });

  await teste('RN-008: rankings sobre todo o recorte, valor liquido', async () => {
    const r = await bloco('Produtos', AMELIA);
    const g = (nome) => r.filter((x) => x.GRUPO === nome);
    assert.equal(soma(g('RAMO'), 'VALOR'), 40000, 'faturamento por ramo soma todos os clientes');
    assert.equal(soma(g('SEGMENTO'), 'VALOR'), 40000);
    assert.equal(g('VALOR').length, 10);
    assert.equal(g('QTD').length, 10);
    const top3 = g('RAMO_TOP3');
    assert.ok([...new Set(top3.map((x) => x.RAMO))].every((ramo) => top3.filter((x) => x.RAMO === ramo).length <= 3));
    assert.equal(Number(top3.find((x) => x.CHAVE === '7101' && x.RAMO === 'CLINICA MEDICA').VALOR), 10000, '12.000 - 2.000 de devolucao');
    const devol = g('DEVOLUCAO')[0];
    assert.deepEqual([devol.CHAVE, Number(devol.VALOR), Number(devol.BRUTO)], ['7101', 2000, 14000], '% devolvido sobre o bruto do produto (12.000 + 2 x 1.000)');
    assert.equal(g('FORNECEDOR').some((x) => x.NOME === 'NUTRIMED'), true);
    const clientes = await bloco('Clientes', AMELIA);
    assert.equal(clientes.length, 10);
    assert.equal(Number(clientes[0].CODCLI), CLIENTE.TOP);
    assert.equal(Number(clientes[0].TOTAL_LIQUIDO), 40000);
  });

  await teste('RN-009: visitas concluidas de cliente e prospeccao', async () => {
    const r = await bloco('Visitas', AMELIA, { de: '2026-09-16', ate: '2026-10-15' });
    assert.equal(soma(r, 'N'), 12, '8 de cliente + 4 de prospeccao; agendada nao conta');
    assert.equal(soma(r.filter((x) => x.ORIGEM === 'PROSPECCAO'), 'N'), 4);
  });

  await teste('RF-009: evolucao do cliente so com cliente marcado', async () => {
    assert.equal((await bloco('EvolucaoCliente', AMELIA)).length, 0);
    const r = await bloco('EvolucaoCliente', AMELIA, { clientes: `,${CLIENTE.X},`, de: '2025-01-01', ate: '2026-10-31' });
    assert.deepEqual(r.map((x) => [x.MES, Number(x.LIQUIDO)]), [['2025-02', 10000], ['2026-02', 12500], ['2026-08', 100], ['2026-10', 1000]]);
  });

  await teste('RF-006: devolucoes paginadas de 50 e 4 maiores', async () => {
    const stmt = db.prepare(`INSERT INTO IMP_DEVOLUCOES_TOTVS (NOTA_DEVOLUCAO, NUMPED, DATA_VENDA, DATA_DEVOLUCAO, CODFILIAL, CODEPTO, CODSEC, CODCLI, CODPROD, DESCRICAO, QT_DEVOLVIDA, VALOR_DEVOLVIDO)
      VALUES (?, ?, '2026-10-10', '2026-10-12', '71', '1', '101', ?, 7102, 'Produto 7102', 1, ?)`);
    for (let i = 0; i < 119; i += 1) stmt.run(`DX${i}`, `79${i}`, 7004 + (i % 20), 10 + i);
    const p1 = await bloco('Devolucoes', AMELIA);
    const total = p1.find((x) => x.PARTE === 'TOTAL');
    assert.deepEqual([Number(total.REGISTROS), Number(total.ACIMA_30)], [120, 1]);
    assert.equal(p1.filter((x) => x.PARTE === 'LINHA').length, 50);
    assert.equal(p1.filter((x) => x.PARTE === 'TOP').length, 4);
    assert.equal(Number(p1.find((x) => x.PARTE === 'TOP' && Number(x.ORDEM) === 1).VALOR), 2000);
    assert.equal(Number(p1.find((x) => x.PARTE === 'LINHA').VALOR), 2000);
    assert.equal((await bloco('Devolucoes', AMELIA, { pagina: '3' })).filter((x) => x.PARTE === 'LINHA').length, 20);
    exec("DELETE FROM IMP_DEVOLUCOES_TOTVS WHERE NOTA_DEVOLUCAO LIKE 'DX%'");
  });

  await teste('C-015 / RN-016: comparativo modular por bloco', async () => {
    const valorDe = async (de, ate, metrica = 'FATURAMENTO', categoria = 'CLIENTE') =>
      Number((await bloco('Comparativo', AMELIA, { de, ate, categoria, metrica })).find((x) => Number(x.CHAVE) === CLIENTE.X)?.VALOR ?? 0);
    assert.equal(await valorDe('2025-01-01', '2025-03-31'), 10000);
    assert.equal(await valorDe('2026-01-01', '2026-03-31'), 12500);
    assert.equal(await valorDe('2026-01-01', '2026-03-31', 'PEDIDOS'), 1);
    const secao = await bloco('Comparativo', AMELIA, { categoria: 'SECAO', metrica: 'PEDIDOS' });
    assert.equal(soma(secao, 'VALOR'), 40000, 'Secao so tem Faturamento');
    const prod = await bloco('Comparativo', AMELIA, { categoria: 'PRODUTO', metrica: 'QUANTIDADE' });
    assert.equal(Number(prod.find((x) => x.CHAVE === '7101').VALOR), 10 + 1 + 1 - 2, '10 + 1 + 1 vendidos - 2 devolvidos');
  });

  /* ─────────────── metas ─────────────── */

  const carregar = (userId, input = {}) => chamar('s360MetasCarregar', { ano: 2026, mes: 11, coordenador: '', ...input }, userId);
  const salvar = async (userId, { metas = [], ramosUf = [], ramosLimpar = [], mes = 11 } = {}) => {
    const p = { ano: '2026', mes: String(mes), metas: JSON.stringify(metas), ramosUf: JSON.stringify(ramosUf), ramosLimpar: JSON.stringify(ramosLimpar) };
    const r = await chamar('s360MetasSalvar', p, userId);
    const [motivo] = await linhas('s360MetasMotivo', p, userId);
    return { afetadas: r.affectedRows, motivo };
  };
  // Universo do rateio = so os coordenadores desta spec (os de outras specs tem BUs de Nutricao).
  exec(`UPDATE COORDENADORES SET ATIVO = 0 WHERE COD_SUPERVISOR NOT IN (${Object.values(COORD).join(', ')}, 900)`);

  await teste('C-006 / RN-010: meta recebida do planejamento por UF', async () => {
    const r = await carregar(CAIO);
    assert.equal(r.leitura, false);
    const meta = Object.fromEntries(r.bus.map((b) => [`${b.CODFILIAL}|${b.CODEPTO}`, [b.META, b.UF]]));
    assert.deepEqual(meta, { '71|1': [110000, 'DF'], '72|1': [220000, 'GO'], '74|1': [110000, 'GO'] });
    const semHistorico = metaRecebida({
      planejamento: [{ UNIDADE: 'NUTRICAO', UF: 'GO', VALOR: 300000 }],
      filiais: [{ CODFILIAL: 72, CODEPTO: 1, UF: 'GO' }, { CODFILIAL: 74, CODEPTO: 1, UF: 'GO' }],
      pesos: [],
    });
    assert.deepEqual(semHistorico.map((f) => f.META), [150000, 150000]);
  });

  await teste('C-007: lancamento manual antigo nao conta', async () => {
    assert.equal(banco('SELECT META_VALOR FROM METAS_BU WHERE CODFILIAL = 72')[0].META_VALOR, 250000);
    assert.equal((await carregar(CAIO)).bus.find((b) => b.CODFILIAL === 72).META, 220000);
  });

  await teste('RN-010 (unidade): departamento 8 e 9 leem a propria unidade', async () => {
    assert.equal(unidadeDoDepto(8), 'MEDICAMENTO');
    assert.equal(unidadeDoDepto(9), 'ESTETICA_E_INJETAVEIS');
    const r = await carregar(DALVA);
    assert.equal(r.bus.find((b) => b.CODFILIAL === 73 && b.CODEPTO === 9).META, 90000);
    assert.equal(r.bus.filter((b) => b.CODEPTO === 8).length, 8);
    assert.equal(ramoDoCliente('Órgão Público Sul'), 'ORGAO_PUBLICO');
    assert.equal(ramoDoCliente('HOSPITAL PRIVADO'), 'HOSPITAL_PRIVADO');
  });

  await teste('C-008: BU com dois coordenadores conta uma vez', async () => {
    const r = await carregar(GIL);
    assert.equal(r.diretoria, true);
    const med = r.bus.filter((b) => b.CODEPTO === 8);
    assert.equal(med.length, 8);
    assert.equal(med.reduce((s, b) => s + b.META, 0), 800000);
    const soDalva = await carregar(GIL, { coordenador: String(COORD.DALVA) });
    assert.equal(soDalva.bus.length, 9);
  });

  await teste('RF-015 / RN-014: vendedores por BU com meta e realizado', async () => {
    const out = await carregar(CAIO, { mes: 10 });
    const linha = (v, f) => out.vendedores.find((x) => x.VENDEDOR_ID === v && x.CODFILIAL === f);
    assert.deepEqual([linha(AMELIA, 71).META, linha(AMELIA, 71).REALIZADO], [50000, 40000]);
    assert.deepEqual([linha(BENICIO, 71).META, linha(BENICIO, 71).REALIZADO], [15000, 30000]);
    assert.equal(out.vendedores.some((x) => x.VENDEDOR_ID === DALVA), false, 'outro coordenador nao recebe meta');
    assert.deepEqual(out.ufs.filter((x) => x.VENDEDOR_ID === AMELIA), [{ VENDEDOR_ID: AMELIA, CODEPTO: 1, UF: 'DF' }]);
    const nov = await carregar(CAIO);
    assert.equal(nov.base.filter((b) => b.CODEPTO === 1).reduce((s, b) => s + b.VALOR, 0), 440000);
  });

  await teste('C-014 / RN-011: diretoria so le; vendedor nao ve a aba', async () => {
    assert.equal((await carregar(GIL)).leitura, true);
    const r = await salvar(GIL, { metas: [{ vendedorId: AMELIA, codFilial: 71, codepto: 1, valor: 1 }] });
    assert.deepEqual([r.afetadas, r.motivo.MOTIVO], [0, 'SOMENTE_LEITURA']);
    assert.equal((await carregar(AMELIA)).bus.length, 0);
  });

  await teste('C-009 / RN-019: grava so o que foi enviado', async () => {
    const antes = banco('SELECT COUNT(*) AS N FROM METAS_BU_VENDEDOR')[0].N;
    const r = await salvar(CAIO, { metas: [{ vendedorId: AMELIA, codFilial: 71, codepto: 1, valor: 30000 }, { vendedorId: VERA, codFilial: 71, codepto: 1, valor: 20000 }] });
    assert.equal(r.afetadas, 2);
    assert.equal(r.motivo, undefined);
    assert.equal(banco('SELECT COUNT(*) AS N FROM METAS_BU_VENDEDOR')[0].N, antes + 2);
    const r2 = await salvar(CAIO, { metas: [{ vendedorId: AMELIA, codFilial: 71, codepto: 1, valor: 35000 }] });
    assert.equal(r2.afetadas, 1);
    const nov = await carregar(CAIO);
    const meta = (v) => nov.vendedores.find((x) => x.VENDEDOR_ID === v && x.CODFILIAL === 71).META;
    assert.deepEqual([meta(AMELIA), meta(VERA), meta(HUGO)], [35000, 20000, 0]);
  });

  await teste('C-011: servidor recusa o lote inteiro e diz o motivo', async () => {
    const r = await salvar(CAIO, { metas: [{ vendedorId: AMELIA, codFilial: 71, codepto: 1, valor: 1 }, { vendedorId: HUGO, codFilial: 73, codepto: 8, valor: 5000 }] });
    assert.equal(r.afetadas, 0);
    assert.deepEqual([r.motivo.MOTIVO, Number(r.motivo.CODFILIAL), r.motivo.DEPTO], ['BU_NAO_COORDENADA', 73, 'Medicamento']);
    assert.equal(banco(`SELECT META_VALOR FROM METAS_BU_VENDEDOR WHERE VENDEDOR_ID = ${AMELIA} AND MES = 11`)[0].META_VALOR, 35000);
    const coord = await salvar(CAIO, { metas: [{ vendedorId: DALVA, codFilial: 71, codepto: 1, valor: 100 }] });
    assert.deepEqual([coord.afetadas, coord.motivo.MOTIVO, coord.motivo.VENDEDOR], [0, 'VENDEDOR_COORDENADOR', 'Dalva Rocha']);
    const negativo = await salvar(CAIO, { metas: [{ vendedorId: VERA, codFilial: 71, codepto: 1, valor: -10 }] });
    assert.deepEqual([negativo.afetadas, negativo.motivo.MOTIVO], [0, 'VALOR_INVALIDO']);
  });

  await teste('C-013 / RN-012: ramo/UF personalizado grava e volta a automatico', async () => {
    const ramo = { vendedorId: AMELIA, codepto: 1, ramo: 'CLINICA_MEDICA', ramoNome: 'Clínica Médica', uf: 'DF', valor: 30000, percentual: 0.3 };
    const r = await salvar(CAIO, { ramosUf: [ramo], ramosLimpar: [{ vendedorId: AMELIA, codepto: 1 }] });
    assert.equal(r.afetadas, 1);
    assert.deepEqual((await carregar(CAIO)).personalizadas.map((p) => [p.VENDEDOR_ID, p.RAMO_CODE, p.UF, p.META_VALOR]), [[AMELIA, 'CLINICA_MEDICA', 'DF', 30000]]);
    const de = await salvar(CAIO, { ramosLimpar: [{ vendedorId: AMELIA, codepto: 1 }] });
    assert.equal(de.afetadas, 1);
    assert.equal((await carregar(CAIO)).personalizadas.length, 0);
    const fora = await salvar(CAIO, { ramosUf: [{ ...ramo, codepto: 8 }], ramosLimpar: [{ vendedorId: AMELIA, codepto: 8 }] });
    assert.deepEqual([fora.afetadas, fora.motivo.MOTIVO], [0, 'BU_NAO_COORDENADA']);
  });
}
