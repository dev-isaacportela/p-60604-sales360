import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, FileSpreadsheet, Loader2 } from 'lucide-react';
import { downloadExcelWorkbook, excelColumn } from '../lib/excel-export';
import { callSF, formatCurrency, formatDate, SF } from '../hooks/useMitra';

interface ClienteCritico {
  EXECUTIVO_ID: number;
  EXECUTIVO_NOME: string;
  CLIENTE_ID: number;
  CLIENTE: string;
  CIDADE?: string;
  COD_CLIENTE?: number | string | null;
  IMPORTANCIA: 'A' | 'TOP';
  ULTIMA_COMPRA: string;
  CICLO: number;
  DATA_PREVISTA: string;
  TICKET_MEDIO: number | string;
  COMPROU: number | string;
  AINDA_NO_PRAZO: number | string;
}

interface ResumoExecutivo {
  id: number;
  nome: string;
  previstos: number;
  compraram: number;
  semCompra: ClienteCritico[];
  valorEmRisco: number;
}

const dt = (iso?: string | null) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`) : null);

interface Props {
  semanaInicio: string;
  hoje: string;
  scopeParams: object;
  loadingScope: boolean;
}

export function ClientesCriticosSemCompra({ semanaInicio, hoje, scopeParams, loadingScope }: Props) {
  const [rows, setRows] = useState<ClienteCritico[]>([]);
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState<number | null>(null);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    if (loadingScope) return;
    let active = true;
    setLoading(true);
    callSF(SF.direcionamentoClientesCriticosSemCompra, { dataInicio: semanaInicio, hoje, ...scopeParams })
      .then((r) => { if (active) setRows((r || []) as ClienteCritico[]); })
      .catch(() => { if (active) setRows([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadingScope, scopeParams, semanaInicio, hoje]);

  const executivos = useMemo<ResumoExecutivo[]>(() => {
    const map = new Map<number, ResumoExecutivo>();
    for (const r of rows) {
      const id = Number(r.EXECUTIVO_ID);
      let e = map.get(id);
      if (!e) { e = { id, nome: r.EXECUTIVO_NOME, previstos: 0, compraram: 0, semCompra: [], valorEmRisco: 0 }; map.set(id, e); }
      e.previstos += 1;
      if (Number(r.COMPROU) === 1) e.compraram += 1;
      else { e.semCompra.push(r); e.valorEmRisco += Number(r.TICKET_MEDIO) || 0; }
    }
    return [...map.values()]
      .filter((e) => e.semCompra.length > 0)
      .sort((a, b) => b.valorEmRisco - a.valorEmRisco);
  }, [rows]);

  async function exportar() {
    setExportando(true);
    try {
      await downloadExcelWorkbook({
        fileName: `clientes-criticos-sem-compra-${semanaInicio}.xlsx`,
        creator: 'Benenutri - Direcionamento Semanal',
        sheets: [{
          name: 'Clientes críticos',
          title: `Clientes críticos com previsão de compra — semana de ${formatDate(semanaInicio)}`,
          subtitle: 'Importante = curva A ou top 20% do faturamento 180 dias da carteira. Previsão = última compra + ciclo médio.',
          columns: [
            excelColumn('Executivo', { type: 'text', width: 28 }),
            excelColumn('Cód. cliente', { type: 'integer', width: 12 }),
            excelColumn('Cliente', { type: 'text', width: 42 }),
            excelColumn('Cidade', { type: 'text', width: 18 }),
            excelColumn('Importância', { type: 'text', width: 12 }),
            excelColumn('Última compra', { type: 'date', width: 14 }),
            excelColumn('Ciclo (dias)', { type: 'integer', width: 12 }),
            excelColumn('Compra prevista', { type: 'date', width: 15 }),
            excelColumn('Ticket médio', { type: 'currency', width: 15 }),
            excelColumn('Situação', { type: 'text', width: 16 }),
          ],
          rows: rows.map((c) => [c.EXECUTIVO_NOME, c.COD_CLIENTE != null ? Number(c.COD_CLIENTE) : null, c.CLIENTE, c.CIDADE || '', c.IMPORTANCIA === 'A' ? 'Curva A' : 'Top 20%', dt(c.ULTIMA_COMPRA), Number(c.CICLO), dt(c.DATA_PREVISTA), Number(c.TICKET_MEDIO) || 0, Number(c.COMPROU) === 1 ? 'Comprou' : Number(c.AINDA_NO_PRAZO) === 1 ? 'Ainda no prazo' : 'Não comprou']),
          freezeColumns: 3,
          autoFilter: true,
          emptyMessage: 'Nenhum cliente importante com compra prevista na semana.',
        }],
      });
    } finally {
      setExportando(false);
    }
  }

  const totalSemCompra = executivos.reduce((s, e) => s + e.semCompra.length, 0);
  const totalRisco = executivos.reduce((s, e) => s + e.valorEmRisco, 0);

  return (
    <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 mb-3" style={{ borderColor: '#edf0eb' }}>
        <div>
          <h2 className="text-lg font-bold" style={{ color: '#1b1c1a' }}>Clientes Críticos sem Compra</h2>
          <p className="text-xs mt-0.5" style={{ color: '#7b8379' }}>
            Clientes importantes (curva A ou top 20% do faturamento da carteira nos últimos 180 dias) com compra prevista para a semana, pelo ciclo médio de compra, que não compraram.
          </p>
        </div>
        {!loading ? (
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <button
            type="button"
            onClick={exportar}
            disabled={exportando}
            className="h-9 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
            style={{ backgroundColor: '#137432', color: '#ffffff' }}
          >
            {exportando ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Exportar Excel
          </button>
            <span className="rounded-lg px-3 py-1.5" style={{ backgroundColor: '#fde8e8', color: '#b42318' }}>{totalSemCompra} sem compra</span>
            <span className="rounded-lg px-3 py-1.5" style={{ backgroundColor: '#fff4e0', color: '#b45309' }}>{formatCurrency(totalRisco)} em ticket médio</span>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 justify-center text-sm" style={{ color: '#647062' }}>
          <Loader2 size={16} className="animate-spin" /> Carregando previsões de compra...
        </div>
      ) : executivos.length === 0 ? (
        <div className="py-10 text-center text-sm" style={{ color: '#647062' }}>
          {rows.length === 0 ? 'Nenhum cliente importante com compra prevista nesta semana no escopo selecionado.' : 'Todos os clientes importantes com compra prevista compraram na semana.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase" style={{ color: '#7b8379' }}>
                <th className="py-2 pr-3">Executivo</th>
                <th className="py-2 px-3 text-right">Com previsão</th>
                <th className="py-2 px-3 text-right">Compraram</th>
                <th className="py-2 px-3 text-right">Sem compra</th>
                <th className="py-2 px-3 text-right">Ticket médio em risco</th>
                <th className="py-2 pl-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {executivos.map((e) => {
                const expanded = aberto === e.id;
                return (
                  <Fragment key={e.id}>
                    <tr onClick={() => setAberto(expanded ? null : e.id)} className="cursor-pointer border-t transition-colors hover:bg-[#f7f9f6]" style={{ borderColor: '#edf0eb' }}>
                      <td className="py-3 pr-3 font-semibold" style={{ color: '#1b1c1a' }}>{e.nome}</td>
                      <td className="py-3 px-3 text-right">{e.previstos}</td>
                      <td className="py-3 px-3 text-right" style={{ color: '#137432' }}>{e.compraram}</td>
                      <td className="py-3 px-3 text-right font-bold" style={{ color: '#b42318' }}>{e.semCompra.length}</td>
                      <td className="py-3 px-3 text-right font-bold" style={{ color: '#b45309' }}>{formatCurrency(e.valorEmRisco)}</td>
                      <td className="py-3 pl-3">
                        <ChevronDown size={16} className="transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : undefined, color: '#7b8379' }} />
                      </td>
                    </tr>
                    {expanded ? (
                      <tr>
                        <td colSpan={6} className="pb-3">
                          <div className="rounded-xl p-2" style={{ backgroundColor: '#f7f9f6' }}>
                            {e.semCompra.map((c) => {
                              const noPrazo = Number(c.AINDA_NO_PRAZO) === 1;
                              return (
                                <div key={c.CLIENTE_ID} className="grid items-center gap-x-4 gap-y-1 px-2 py-1.5 text-xs grid-cols-1 md:grid-cols-[70px_minmax(200px,1fr)_76px_190px_130px_130px_100px]">
                                  <span className="font-semibold tabular-nums" style={{ color: '#647062' }}>{c.COD_CLIENTE ?? '–'}</span>
                                  <span className="font-semibold truncate" title={`${c.CLIENTE}${c.CIDADE ? ` · ${c.CIDADE}` : ''}`} style={{ color: '#1b1c1a' }}>{c.CLIENTE}{c.CIDADE ? ` · ${c.CIDADE}` : ''}</span>
                                  <span className="justify-self-start rounded-full px-2 py-0.5 font-bold" style={{ backgroundColor: '#e8f0fd', color: '#1d4ed8' }}>{c.IMPORTANCIA === 'A' ? 'Curva A' : 'Top 20%'}</span>
                                  <span className="tabular-nums" style={{ color: '#647062' }}>Última compra {formatDate(c.ULTIMA_COMPRA)} · ciclo {c.CICLO} dias</span>
                                  <span className="tabular-nums" style={{ color: '#2f3a2f' }}>Previsto {formatDate(c.DATA_PREVISTA)}</span>
                                  <span className="text-right tabular-nums" style={{ color: '#647062' }}>Ticket {formatCurrency(Number(c.TICKET_MEDIO) || 0)}</span>
                                  <span className="justify-self-start rounded-full px-2 py-0.5 font-bold" style={{ backgroundColor: noPrazo ? '#fff4e0' : '#fde8e8', color: noPrazo ? '#b45309' : '#b42318' }}>
                                    {noPrazo ? 'Ainda no prazo' : 'Não comprou'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
