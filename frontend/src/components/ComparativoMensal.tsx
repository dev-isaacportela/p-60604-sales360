import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, FileDown, Minus } from 'lucide-react';
import { callSF, callSFSingle, formatCurrency, SF } from '../hooks/useMitra';
import { getOperationalWeek, getOperationalWeekNumber } from '../lib/operational-week';
import { gerarPdfComparativoMensal } from '../lib/comparativoMensalPdf';
import { FilterDropdown, type OptionItem, type WeeklyScopeParams } from '../pages/AcompanhamentoSemanalVendedorPage';

/**
 * Visão mensal do Comparativo: cliente a cliente, os dois meses anteriores fechados,
 * o mês selecionado (até hoje, se for o corrente) e a variação contra o mês anterior.
 * Reaproveita a SF do B/W semanal: a chamada do mês traz o mês e o anterior; a do mês
 * anterior traz o antepenúltimo.
 */

interface LinhaMensal {
  CLIENTE_ID: number;
  CLIENTE: string;
  RAMO: string;
  MES_2: number;
  MES_1: number;
  ATUAL: number;
}

type Recorte = '' | 'queda' | 'alta' | 'zerou' | 'novo';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const RECORTES: OptionItem[] = [
  { value: '', label: 'Todos os clientes' },
  { value: 'queda', label: 'Em queda' },
  { value: 'alta', label: 'Em alta' },
  { value: 'zerou', label: 'Não compraram no mês' },
  { value: 'novo', label: 'Novos no mês' },
];

function mesAnterior(mes: number, ano: number) {
  return mes === 1 ? { mes: 12, ano: ano - 1 } : { mes: mes - 1, ano };
}

function formatPercent(value: number) {
  return `${value > 0 ? '+' : ''}${(value * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function variacao(linha: LinhaMensal) {
  const valor = linha.ATUAL - linha.MES_1;
  const pct = linha.MES_1 > 0 ? valor / linha.MES_1 : null;
  return { valor, pct };
}

function Semaforo({ valor }: { valor: number }) {
  const cor = valor > 0 ? 'var(--color-saldo-pos)' : valor < 0 ? 'var(--color-saldo-neg)' : 'var(--color-text-secondary)';
  const Icone = valor > 0 ? ArrowUpRight : valor < 0 ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${cor} 16%, transparent)`, color: cor }}>
      <Icone size={14} strokeWidth={2.5} />
    </span>
  );
}

function Kpi({ rotulo, valor, nota, tom }: { rotulo: string; valor: string; nota?: string; tom?: 'pos' | 'neg' }) {
  const cor = tom === 'pos' ? 'var(--color-saldo-pos)' : tom === 'neg' ? 'var(--color-saldo-neg)' : 'var(--color-text)';
  return (
    <div className="rounded-2xl p-4" style={{ backgroundColor: 'var(--color-surface-lowest)', border: '1px solid var(--color-border)' }}>
      <div className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>{rotulo}</div>
      <div className="text-2xl font-extrabold mt-1" style={{ color: cor }}>{valor}</div>
      {nota ? <div className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>{nota}</div> : null}
    </div>
  );
}

export default function ComparativoMensal({ scopeParams, scopeLabel }: { scopeParams?: WeeklyScopeParams; scopeLabel?: string }) {
  const agora = getOperationalWeek(new Date());
  const [mes, setMes] = useState(String(agora.month));
  const [ano, setAno] = useState(String(agora.year));
  const [recorte, setRecorte] = useState<Recorte>('');
  const [vendedorId, setVendedorId] = useState('');
  const [linhas, setLinhas] = useState<LinhaMensal[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const isAggregateScope = scopeParams?.scopeMode === 'TEAM' || scopeParams?.scopeMode === 'GLOBAL';
  const vendedorAlvoId = scopeParams?.scopeMode === 'SELLER' && scopeParams.scopeUserId ? scopeParams.scopeUserId : (isAggregateScope ? '' : vendedorId);

  const m = Number(mes);
  const a = Number(ano);
  const ant = mesAnterior(m, a);
  const ant2 = mesAnterior(ant.mes, ant.ano);
  const nomeAtual = MESES[m - 1];
  const nomeAnt = MESES[ant.mes - 1];
  const nomeAnt2 = MESES[ant2.mes - 1];
  const mesCorrente = m === agora.month && a === agora.year;

  useEffect(() => {
    callSFSingle(SF.dadosUsuarioLogado, {}).then((user) => setVendedorId(String(user?.ID || ''))).catch(() => setErro('Não foi possível identificar o vendedor logado.'));
  }, []);

  const carregar = useCallback(async () => {
    if (!vendedorAlvoId && !isAggregateScope) return;
    setCarregando(true);
    setErro('');
    const base = {
      vendedorId: vendedorAlvoId,
      scopeMode: scopeParams?.scopeMode || 'ME',
      scopeUserId: scopeParams?.scopeUserId || '',
      scopeCodRca: scopeParams?.scopeCodRca || '',
      scopeCodSupervisor: scopeParams?.scopeCodSupervisor || '',
      scopeCodFilial: scopeParams?.scopeCodFilial || '',
      scopeCodepto: scopeParams?.scopeCodepto || '',
      scopeIdSecao: scopeParams?.scopeIdSecao || '',
      cliente: '',
      ramoCliente: '',
      semanaNumero: String(getOperationalWeekNumber()),
    };
    try {
      const [doMes, doAnterior] = await Promise.all([
        callSF(SF.calcularBwSemanal, { ...base, mes: String(m), ano: String(a) }),
        callSF(SF.calcularBwSemanal, { ...base, mes: String(ant.mes), ano: String(ant.ano) }),
      ]);
      const mapa = new Map<number, LinhaMensal>();
      const linha = (row: any) => {
        const id = Number(row.CLIENTE_ID || 0);
        let atual = mapa.get(id);
        if (!atual) {
          atual = { CLIENTE_ID: id, CLIENTE: row.CLIENTE || 'Cliente sem nome', RAMO: row.RAMO_CLIENTE || '', MES_2: 0, MES_1: 0, ATUAL: 0 };
          mapa.set(id, atual);
        }
        return atual;
      };
      for (const row of doMes || []) {
        const l = linha(row);
        l.ATUAL += Number(row.FECHAMENTO_MES || 0);
        l.MES_1 += Number(row.FECHAMENTO_MES_ANTERIOR || 0);
      }
      for (const row of doAnterior || []) {
        linha(row).MES_2 += Number(row.FECHAMENTO_MES_ANTERIOR || 0);
      }
      setLinhas(Array.from(mapa.values()).filter((l) => l.MES_2 || l.MES_1 || l.ATUAL));
    } catch {
      setErro('Falha ao carregar o comparativo mensal.');
      setLinhas([]);
    } finally {
      setCarregando(false);
    }
  }, [a, ant.ano, ant.mes, isAggregateScope, m, scopeParams, vendedorAlvoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const filtradas = useMemo(() => {
    const lista = linhas.filter((l) => {
      const v = l.ATUAL - l.MES_1;
      if (recorte === 'queda') return v < 0;
      if (recorte === 'alta') return v > 0;
      if (recorte === 'zerou') return l.MES_1 > 0 && l.ATUAL === 0;
      if (recorte === 'novo') return l.ATUAL > 0 && l.MES_1 === 0 && l.MES_2 === 0;
      return true;
    });
    return lista.sort((x, y) => (y.MES_1 - x.MES_1) || (y.ATUAL - x.ATUAL));
  }, [linhas, recorte]);

  const totais = useMemo(() => {
    const t = { mes2: 0, mes1: 0, atual: 0, queda: 0, alta: 0, zerou: 0, novo: 0 };
    for (const l of linhas) {
      t.mes2 += l.MES_2;
      t.mes1 += l.MES_1;
      t.atual += l.ATUAL;
      const v = l.ATUAL - l.MES_1;
      if (v < 0) t.queda += 1;
      if (v > 0) t.alta += 1;
      if (l.MES_1 > 0 && l.ATUAL === 0) t.zerou += 1;
      if (l.ATUAL > 0 && l.MES_1 === 0 && l.MES_2 === 0) t.novo += 1;
    }
    return t;
  }, [linhas]);

  const totFiltrado = useMemo(() => filtradas.reduce((acc, l) => ({ mes2: acc.mes2 + l.MES_2, mes1: acc.mes1 + l.MES_1, atual: acc.atual + l.ATUAL }), { mes2: 0, mes1: 0, atual: 0 }), [filtradas]);

  const variacaoTotal = totais.atual - totais.mes1;
  const variacaoPct = totais.mes1 > 0 ? variacaoTotal / totais.mes1 : null;

  const mesesOptions: OptionItem[] = MESES.map((nome, i) => ({ value: String(i + 1), label: nome }));
  const anosOptions: OptionItem[] = [agora.year - 1, agora.year].map((y) => ({ value: String(y), label: String(y) }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <FilterDropdown label="Mês" value={mes} options={mesesOptions} onChange={setMes} widthClass="min-w-[180px]" />
        <FilterDropdown label="Ano" value={ano} options={anosOptions} onChange={setAno} widthClass="min-w-[140px]" />
        <FilterDropdown label="Clientes" value={recorte} options={RECORTES} onChange={(v) => setRecorte(v as Recorte)} widthClass="min-w-[240px]" />
        <button
          type="button"
          disabled={carregando || filtradas.length === 0}
          onClick={() => gerarPdfComparativoMensal({
            linhas: filtradas,
            nomeAnt2,
            nomeAnt,
            nomeAtual,
            ano: a,
            mesCorrente,
            escopo: scopeLabel || 'Minha carteira',
            recorte: recorte ? RECORTES.find((r) => r.value === recorte)?.label || '' : '',
          })}
          className="ml-auto h-11 px-5 rounded-2xl text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
        >
          <FileDown size={16} /> Baixar PDF
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi rotulo={nomeAnt2} valor={formatCurrency(totais.mes2)} nota="Faturamento fechado" />
        <Kpi rotulo={nomeAnt} valor={formatCurrency(totais.mes1)} nota="Faturamento fechado" />
        <Kpi rotulo={nomeAtual} valor={formatCurrency(totais.atual)} nota={mesCorrente ? 'Parcial, até hoje' : 'Faturamento fechado'} />
        <Kpi
          rotulo={`Variação ${nomeAtual} x ${nomeAnt}`}
          valor={`${variacaoTotal > 0 ? '+' : ''}${formatCurrency(variacaoTotal)}`}
          nota={`${variacaoPct === null ? '' : formatPercent(variacaoPct) + ' · '}${totais.queda} em queda · ${totais.alta} em alta · ${totais.zerou} sem compra · ${totais.novo} novos`}
          tom={variacaoTotal < 0 ? 'neg' : variacaoTotal > 0 ? 'pos' : undefined}
        />
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--color-surface-lowest)', border: '1px solid var(--color-border)' }}>
        <div className="px-5 py-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h2 className="text-lg font-extrabold" style={{ color: 'var(--color-text)' }}>Comparativo cliente a cliente</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
              {nomeAnt2} e {nomeAnt} fechados; {nomeAtual}{mesCorrente ? ' até hoje' : ''}. A variação compara {nomeAtual} com {nomeAnt}.
            </p>
          </div>
          <span className="text-sm font-bold" style={{ color: 'var(--color-text-secondary)' }}>{filtradas.length} clientes</span>
        </div>

        {erro ? (
          <div className="p-6 text-sm" style={{ color: 'var(--color-saldo-neg)' }}>{erro}</div>
        ) : carregando ? (
          <div className="p-6 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Carregando…</div>
        ) : filtradas.length === 0 ? (
          <div className="p-6 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Nenhum cliente neste recorte.</div>
        ) : (
          <div className="overflow-auto max-h-[640px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10" style={{ backgroundColor: 'var(--color-surface-low)' }}>
                <tr className="text-left text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3 text-right">{nomeAnt2}</th>
                  <th className="px-4 py-3 text-right">{nomeAnt}</th>
                  <th className="px-4 py-3 text-right">{nomeAtual}</th>
                  <th className="px-4 py-3 text-right">Variação</th>
                  <th className="px-4 py-3 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((l) => {
                  const v = variacao(l);
                  const cor = v.valor > 0 ? 'var(--color-saldo-pos)' : v.valor < 0 ? 'var(--color-saldo-neg)' : 'var(--color-text-secondary)';
                  const novo = l.ATUAL > 0 && l.MES_1 === 0 && l.MES_2 === 0;
                  return (
                    <tr key={l.CLIENTE_ID} style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
                      <td className="px-4 py-2.5 tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{l.CLIENTE_ID}</td>
                      <td className="px-4 py-2.5 font-semibold">
                        {l.CLIENTE}
                        {novo ? <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>NOVO</span> : null}
                        {l.MES_1 > 0 && l.ATUAL === 0 ? <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: 'color-mix(in srgb, var(--color-saldo-neg) 14%, transparent)', color: 'var(--color-saldo-neg)' }}>SEM COMPRA</span> : null}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(l.MES_2)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(l.MES_1)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{formatCurrency(l.ATUAL)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold" style={{ color: cor }}>
                        <span className="inline-flex items-center gap-2 justify-end">
                          {v.valor > 0 ? '+' : ''}{formatCurrency(v.valor)}
                          <Semaforo valor={v.valor} />
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: cor }}>{v.pct === null ? '—' : formatPercent(v.pct)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-extrabold" style={{ borderTop: '2px solid var(--color-border)', backgroundColor: 'var(--color-surface-low)', color: 'var(--color-text)' }}>
                  <td className="px-4 py-3" colSpan={2}>Total</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totFiltrado.mes2)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totFiltrado.mes1)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(totFiltrado.atual)}</td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: totFiltrado.atual - totFiltrado.mes1 < 0 ? 'var(--color-saldo-neg)' : 'var(--color-saldo-pos)' }}>
                    {totFiltrado.atual - totFiltrado.mes1 > 0 ? '+' : ''}{formatCurrency(totFiltrado.atual - totFiltrado.mes1)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{totFiltrado.mes1 > 0 ? formatPercent((totFiltrado.atual - totFiltrado.mes1) / totFiltrado.mes1) : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
