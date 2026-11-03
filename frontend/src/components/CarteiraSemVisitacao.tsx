import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, FileSpreadsheet, Loader2, Search } from 'lucide-react';
import { downloadExcelWorkbook, excelColumn } from '../lib/excel-export';
import { callSF, formatDate, SF } from '../hooks/useMitra';

interface ClienteOcioso {
  EXECUTIVO_ID: number;
  EXECUTIVO_NOME: string;
  CLIENTE_ID: number;
  CLIENTE: string;
  CIDADE?: string;
  COD_CLIENTE?: number | string | null;
  CURVA?: string | null;
  ULTIMA_VISITA?: string | null;
  DIAS_SEM_VISITA?: number | string | null;
  PROXIMA_VISITA?: string | null;
}

type Faixa = 'todas' | 'nunca' | '31-60' | '61-90' | '90+';

const FAIXAS: { key: Faixa; label: string }[] = [
  { key: 'todas', label: 'Todos' },
  { key: 'nunca', label: 'Nunca visitados' },
  { key: '31-60', label: '31 a 60 dias' },
  { key: '61-90', label: '61 a 90 dias' },
  { key: '90+', label: 'Mais de 90 dias' },
];

const PAGINA = 30;

function faixaDe(c: ClienteOcioso): Exclude<Faixa, 'todas'> {
  if (c.ULTIMA_VISITA == null) return 'nunca';
  const d = Number(c.DIAS_SEM_VISITA);
  return d <= 60 ? '31-60' : d <= 90 ? '61-90' : '90+';
}

const dt = (iso?: string | null) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`) : null);

interface Props {
  hoje: string;
  scopeParams: object;
  loadingScope: boolean;
}

export function CarteiraSemVisitacao({ hoje, scopeParams, loadingScope }: Props) {
  const [rows, setRows] = useState<ClienteOcioso[]>([]);
  const [loading, setLoading] = useState(true);
  const [faixa, setFaixa] = useState<Faixa>('todas');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<number | null>(null);
  const [limite, setLimite] = useState(PAGINA);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    if (loadingScope) return;
    let active = true;
    setLoading(true);
    callSF(SF.direcionamentoCarteiraSemVisita, { hoje, ...scopeParams })
      .then((r) => { if (active) setRows((r || []) as ClienteOcioso[]); })
      .catch(() => { if (active) setRows([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadingScope, scopeParams, hoje]);

  // Totais por cliente distinto: o mesmo cliente pode estar na carteira de mais de um executivo
  const contagem = useMemo(() => {
    const porCliente = new Map<number, Exclude<Faixa, 'todas'>>();
    for (const r of rows) porCliente.set(Number(r.CLIENTE_ID), faixaDe(r));
    const c: Record<Faixa, number> = { todas: porCliente.size, nunca: 0, '31-60': 0, '61-90': 0, '90+': 0 };
    for (const f of porCliente.values()) c[f] += 1;
    return c;
  }, [rows]);

  const executivos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const map = new Map<number, { id: number; nome: string; clientes: ClienteOcioso[] }>();
    for (const r of rows) {
      if (faixa !== 'todas' && faixaDe(r) !== faixa) continue;
      if (termo && !`${r.CLIENTE} ${r.CIDADE || ''}`.toLowerCase().includes(termo)) continue;
      const id = Number(r.EXECUTIVO_ID);
      let e = map.get(id);
      if (!e) { e = { id, nome: r.EXECUTIVO_NOME, clientes: [] }; map.set(id, e); }
      e.clientes.push(r);
    }
    return [...map.values()].sort((a, b) => b.clientes.length - a.clientes.length);
  }, [rows, faixa, busca]);

  async function exportar() {
    setExportando(true);
    try {
      const lista = executivos.flatMap((e) => e.clientes);
      const filtro = FAIXAS.find((f) => f.key === faixa)?.label || 'Todos';
      await downloadExcelWorkbook({
        fileName: `carteira-sem-visitacao-${hoje}.xlsx`,
        creator: 'Benenutri - Direcionamento Semanal',
        sheets: [{
          name: 'Carteira sem visitação',
          title: `Carteira sem visitação há mais de 30 dias — posição em ${formatDate(hoje)}`,
          subtitle: `Filtro: ${filtro}${busca.trim() ? ` · busca "${busca.trim()}"` : ''}. Cliente em mais de uma carteira aparece uma vez por executivo.`,
          columns: [
            excelColumn('Executivo', { type: 'text', width: 28 }),
            excelColumn('Cód. cliente', { type: 'integer', width: 12 }),
            excelColumn('Cliente', { type: 'text', width: 42 }),
            excelColumn('Cidade', { type: 'text', width: 18 }),
            excelColumn('Curva', { type: 'text', width: 8 }),
            excelColumn('Última visita', { type: 'date', width: 14 }),
            excelColumn('Dias sem visita', { type: 'integer', width: 15 }),
            excelColumn('Faixa', { type: 'text', width: 16 }),
            excelColumn('Próxima visita agendada', { type: 'date', width: 22 }),
          ],
          rows: lista.map((c) => [c.EXECUTIVO_NOME, c.COD_CLIENTE != null ? Number(c.COD_CLIENTE) : null, c.CLIENTE, c.CIDADE || '', c.CURVA || '', dt(c.ULTIMA_VISITA), c.ULTIMA_VISITA ? Number(c.DIAS_SEM_VISITA) : null, FAIXAS.find((f) => f.key === faixaDe(c))?.label || '', dt(c.PROXIMA_VISITA)]),
          freezeColumns: 3,
          autoFilter: true,
          emptyMessage: 'Nenhum cliente sem visitação no filtro.',
        }],
      });
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 mb-3" style={{ borderColor: '#edf0eb' }}>
        <div>
          <h2 className="text-lg font-bold" style={{ color: '#1b1c1a' }}>Carteira de Clientes sem Visitação (&gt;30 dias)</h2>
          <p className="text-xs mt-0.5" style={{ color: '#7b8379' }}>
            Clientes da carteira sem nenhuma visita realizada nos últimos 30 dias, contados até hoje (independe da semana selecionada).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportar}
            disabled={exportando}
            className="h-9 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
            style={{ backgroundColor: '#137432', color: '#ffffff' }}
          >
            {exportando ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Exportar Excel
          </button>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#7b8379' }} />
          <input
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setLimite(PAGINA); }}
            placeholder="Buscar cliente ou cidade"
            className="h-9 w-60 rounded-lg pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-[#137432]/30"
            style={{ backgroundColor: '#f7f9f6', border: '1px solid #edf0eb', color: '#1b1c1a' }}
          />
        </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {FAIXAS.map((f) => {
          const ativo = faixa === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => { setFaixa(f.key); setLimite(PAGINA); }}
              className="h-9 px-3 rounded-lg text-xs font-bold"
              style={{ backgroundColor: ativo ? '#137432' : '#f4f5f3', color: ativo ? '#ffffff' : '#4a5248', border: '1px solid #edf0eb' }}
            >
              {f.label} <span className="ml-1 opacity-80">{loading ? '–' : contagem[f.key]}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 justify-center text-sm" style={{ color: '#647062' }}>
          <Loader2 size={16} className="animate-spin" /> Carregando carteira...
        </div>
      ) : executivos.length === 0 ? (
        <div className="py-10 text-center text-sm" style={{ color: '#647062' }}>
          {rows.length === 0 ? 'Todos os clientes da carteira foram visitados nos últimos 30 dias.' : 'Nenhum cliente encontrado com esse filtro.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase" style={{ color: '#7b8379' }}>
                <th className="py-2 pr-3">Executivo</th>
                <th className="py-2 px-3 text-right">Clientes sem visita</th>
                <th className="py-2 px-3 text-right">Nunca visitados</th>
                <th className="py-2 px-3 text-right">Mais de 90 dias</th>
                <th className="py-2 px-3 text-right">Com visita agendada</th>
                <th className="py-2 pl-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {executivos.map((e) => {
                const expanded = aberto === e.id;
                const nunca = e.clientes.filter((c) => faixaDe(c) === 'nunca').length;
                const mais90 = e.clientes.filter((c) => faixaDe(c) === '90+').length;
                const agendados = e.clientes.filter((c) => c.PROXIMA_VISITA).length;
                return (
                  <Fragment key={e.id}>
                    <tr onClick={() => { setAberto(expanded ? null : e.id); setLimite(PAGINA); }} className="cursor-pointer border-t transition-colors hover:bg-[#f7f9f6]" style={{ borderColor: '#edf0eb' }}>
                      <td className="py-3 pr-3 font-semibold" style={{ color: '#1b1c1a' }}>{e.nome}</td>
                      <td className="py-3 px-3 text-right font-bold" style={{ color: '#b45309' }}>{e.clientes.length}</td>
                      <td className="py-3 px-3 text-right font-bold" style={{ color: nunca ? '#b42318' : '#647062' }}>{nunca}</td>
                      <td className="py-3 px-3 text-right" style={{ color: mais90 ? '#b42318' : '#647062' }}>{mais90}</td>
                      <td className="py-3 px-3 text-right" style={{ color: '#137432' }}>{agendados}</td>
                      <td className="py-3 pl-3">
                        <ChevronDown size={16} className="transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : undefined, color: '#7b8379' }} />
                      </td>
                    </tr>
                    {expanded ? (
                      <tr>
                        <td colSpan={6} className="pb-3">
                          <div className="rounded-xl p-2" style={{ backgroundColor: '#f7f9f6' }}>
                            {e.clientes.slice(0, limite).map((c) => {
                              const f = faixaDe(c);
                              const nome = `${c.CLIENTE}${c.CIDADE ? ` · ${c.CIDADE}` : ''}`;
                              return (
                                <div key={c.CLIENTE_ID} className="grid items-center gap-x-4 gap-y-1 px-2 py-1.5 text-xs grid-cols-1 md:grid-cols-[70px_minmax(200px,1fr)_70px_170px_130px_160px]">
                                  <span className="font-semibold tabular-nums" style={{ color: '#647062' }}>{c.COD_CLIENTE ?? '–'}</span>
                                  <span className="font-semibold truncate" title={nome} style={{ color: '#1b1c1a' }}>{nome}</span>
                                  <span className="justify-self-start rounded-full px-2 py-0.5 font-bold" style={{ backgroundColor: '#e8f0fd', color: '#1d4ed8' }}>{c.CURVA ? `Curva ${c.CURVA}` : 'Sem curva'}</span>
                                  <span className="tabular-nums" style={{ color: '#647062' }}>{c.ULTIMA_VISITA ? `Última visita ${formatDate(c.ULTIMA_VISITA)}` : 'Nunca visitado'}</span>
                                  <span className="justify-self-start rounded-full px-2 py-0.5 font-bold tabular-nums" style={{ backgroundColor: f === '31-60' ? '#fff4e0' : '#fde8e8', color: f === '31-60' ? '#b45309' : '#b42318' }}>
                                    {f === 'nunca' ? 'Sem histórico' : `${c.DIAS_SEM_VISITA} dias`}
                                  </span>
                                  <span className="tabular-nums" style={{ color: c.PROXIMA_VISITA ? '#137432' : '#7b8379' }}>
                                    {c.PROXIMA_VISITA ? `Agendada ${formatDate(c.PROXIMA_VISITA)}` : 'Sem visita agendada'}
                                  </span>
                                </div>
                              );
                            })}
                            {e.clientes.length > limite ? (
                              <button type="button" onClick={() => setLimite((l) => l + PAGINA)} className="mt-1 ml-2 text-xs font-bold underline" style={{ color: '#137432' }}>
                                Ver mais {Math.min(PAGINA, e.clientes.length - limite)} de {e.clientes.length - limite} restantes
                              </button>
                            ) : null}
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
