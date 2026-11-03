import { Fragment, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CalendarX2, CheckCircle2, Ban, Repeat, ChevronDown, ChevronLeft, ChevronRight, Loader2, FileSpreadsheet } from 'lucide-react';
import { downloadExcelWorkbook, excelColumn } from '../lib/excel-export';
import { callSF, formatDate, getBrasiliaDate, SF } from '../hooks/useMitra';
import { CoordinatorScopeFilter, useCoordinatorScope } from '../components/CoordinatorScopeFilter';
import { ClientesCriticosSemCompra } from '../components/ClientesCriticosSemCompra';
import { CarteiraSemVisitacao } from '../components/CarteiraSemVisitacao';

interface ItemAgenda {
  ORIGEM: 'VISITA' | 'PROSPECCAO';
  ID: number;
  EXECUTIVO_ID: number;
  EXECUTIVO_NOME: string;
  DATA_AGENDADA: string;
  HORA_INICIO?: string;
  TIPO?: string;
  STATUS: string;
  CONTA?: string;
  CIDADE?: string;
  COD_CLIENTE?: number | string | null;
  ATRASADO: number | string;
  SEM_RELATO: number | string;
  REAGENDADA: number | string;
}

interface ResumoExecutivo {
  id: number;
  nome: string;
  agendados: number;
  concluidos: number;
  pendentes: ItemAgenda[];
  atrasados: number;
  semRelato: number;
  reagendadas: ItemAgenda[];
  canceladas: ItemAgenda[];
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const dow = d.getDay();
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

const STATUS_LABEL: Record<string, string> = {
  AGENDADA: 'Agendada',
  EM_ANDAMENTO: 'Em andamento (sem checkout)',
};

export default function DirecionamentoSemanalPage() {
  const coordinatorScope = useCoordinatorScope('direcionamento-semanal');
  const hoje = getBrasiliaDate();
  const [semanaInicio, setSemanaInicio] = useState(() => mondayOf(hoje));
  const semanaFim = addDays(semanaInicio, 4);
  const [itens, setItens] = useState<ItemAgenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState<number | null>(null);
  const [somentePendentes, setSomentePendentes] = useState(true);
  const [exemplo, setExemplo] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [aba, setAba] = useState<'agenda' | 'clientes' | 'carteira'>('agenda');
  const vendedorExemplo = useMemo(() => {
    if (coordinatorScope.scopeParams.scopeMode !== 'SELLER') return null;
    const v = coordinatorScope.vendedoresScope.find((item) => String(item.COD_RCA) === coordinatorScope.vendedorSelecionado);
    return v ? { id: Number(v.USER_ID), nome: v.RCA } : null;
  }, [coordinatorScope.scopeParams.scopeMode, coordinatorScope.vendedoresScope, coordinatorScope.vendedorSelecionado]);
  const itensExibidos = useMemo(
    () => (exemplo ? gerarItensExemplo(semanaInicio, hoje, vendedorExemplo) : itens),
    [exemplo, itens, semanaInicio, hoje, vendedorExemplo],
  );

  useEffect(() => {
    if (coordinatorScope.loadingScope) return;
    let active = true;
    setLoading(true);
    callSF(SF.direcionamentoAgendaSemanaExecutivos, {
      dataInicio: semanaInicio,
      dataFim: semanaFim,
      hoje,
      ...coordinatorScope.scopeParams,
    })
      .then((rows) => { if (active) setItens((rows || []) as ItemAgenda[]); })
      .catch(() => { if (active) setItens([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [coordinatorScope.loadingScope, coordinatorScope.scopeParams, semanaInicio, semanaFim, hoje]);

  const executivos = useMemo<ResumoExecutivo[]>(() => {
    const map = new Map<number, ResumoExecutivo>();
    for (const item of itensExibidos) {
      const id = Number(item.EXECUTIVO_ID);
      let r = map.get(id);
      if (!r) {
        r = { id, nome: item.EXECUTIVO_NOME, agendados: 0, concluidos: 0, pendentes: [], atrasados: 0, semRelato: 0, reagendadas: [], canceladas: [] };
        map.set(id, r);
      }
      if (Number(item.REAGENDADA) === 1) r.reagendadas.push(item);
      if (item.STATUS === 'CANCELADA') { r.canceladas.push(item); continue; }
      r.agendados += 1;
      if (item.STATUS === 'CONCLUIDA') r.concluidos += 1;
      else {
        r.pendentes.push(item);
        if (Number(item.ATRASADO) === 1) r.atrasados += 1;
        if (Number(item.SEM_RELATO) === 1) r.semRelato += 1;
      }
    }
    return [...map.values()].sort((a, b) => b.pendentes.length - a.pendentes.length || a.nome.localeCompare(b.nome));
  }, [itensExibidos]);

  const temOcorrencia = (e: ResumoExecutivo) => e.pendentes.length > 0 || e.reagendadas.length > 0 || e.canceladas.length > 0;
  const lista = somentePendentes ? executivos.filter(temOcorrencia) : executivos;
  const totais = useMemo(() => ({
    agendados: executivos.reduce((s, e) => s + e.agendados, 0),
    concluidos: executivos.reduce((s, e) => s + e.concluidos, 0),
    pendentes: executivos.reduce((s, e) => s + e.pendentes.length, 0),
    semRelato: executivos.reduce((s, e) => s + e.semRelato, 0),
    reagendadas: executivos.reduce((s, e) => s + e.reagendadas.length, 0),
    canceladas: executivos.reduce((s, e) => s + e.canceladas.length, 0),
  }), [executivos]);

  async function exportarAgenda() {
    setExportando(true);
    try {
      const periodo = `${formatDate(semanaInicio)} a ${formatDate(semanaFim)}`;
      const situacao = (p: ItemAgenda) => (p.STATUS === 'CANCELADA' || p.STATUS === 'CONCLUIDA' ? (p.STATUS === 'CANCELADA' ? 'Cancelada' : 'Concluída') : badgeItem(p).label);
      await downloadExcelWorkbook({
        fileName: `controle-agenda-${semanaInicio}.xlsx`,
        creator: 'Benenutri - Direcionamento Semanal',
        sheets: [
          {
            name: 'Resumo por executivo',
            title: `Controle de Agenda e Visitas — semana ${periodo}`,
            subtitle: exemplo ? 'DADOS DE EXEMPLO — não representam a equipe real.' : 'Canceladas não entram em Agendadas. Sem relato está contido em Não concluídas.',
            columns: [
              excelColumn('Executivo', { type: 'text', width: 30 }),
              excelColumn('Agendadas', { type: 'integer', width: 12, total: true }),
              excelColumn('Concluídas', { type: 'integer', width: 12, total: true }),
              excelColumn('Não concluídas', { type: 'integer', width: 15, total: true }),
              excelColumn('Sem relato', { type: 'integer', width: 12, total: true }),
              excelColumn('Vencidas', { type: 'integer', width: 12, total: true }),
              excelColumn('Reagendadas', { type: 'integer', width: 13, total: true }),
              excelColumn('Canceladas', { type: 'integer', width: 12, total: true }),
              excelColumn('Execução', { type: 'percent', width: 11 }),
            ],
            rows: executivos.map((e) => [e.nome, e.agendados, e.concluidos, e.pendentes.length, e.semRelato, e.atrasados, e.reagendadas.length, e.canceladas.length, e.agendados ? e.concluidos / e.agendados : 0]),
            totalsLabel: 'Total',
            freezeColumns: 1,
            autoFilter: true,
          },
          {
            name: 'Compromissos',
            title: `Compromissos da semana ${periodo}`,
            columns: [
              excelColumn('Executivo', { type: 'text', width: 28 }),
              excelColumn('Data', { type: 'date', width: 12 }),
              excelColumn('Hora', { type: 'text', width: 8 }),
              excelColumn('Cód. cliente', { type: 'integer', width: 12 }),
              excelColumn('Cliente / Prospect', { type: 'text', width: 40 }),
              excelColumn('Cidade', { type: 'text', width: 18 }),
              excelColumn('Tipo', { type: 'text', width: 20 }),
              excelColumn('Situação', { type: 'text', width: 26 }),
              excelColumn('Sem relato', { type: 'text', width: 11 }),
              excelColumn('Reagendada', { type: 'text', width: 11 }),
            ],
            rows: itensExibidos.map((p) => [p.EXECUTIVO_NOME, dt(p.DATA_AGENDADA), p.HORA_INICIO || '', p.COD_CLIENTE != null ? Number(p.COD_CLIENTE) : null, p.CONTA || '', p.CIDADE || '', p.ORIGEM === 'PROSPECCAO' ? 'Prospecção' : p.TIPO || 'Visita', situacao(p), Number(p.SEM_RELATO) === 1 && p.STATUS !== 'CONCLUIDA' && p.STATUS !== 'CANCELADA' ? 'Sim' : 'Não', Number(p.REAGENDADA) === 1 ? 'Sim' : 'Não']),
            freezeColumns: 1,
            autoFilter: true,
            emptyMessage: 'Nenhum compromisso na semana.',
          },
        ],
      });
    } finally {
      setExportando(false);
    }
  }

  const kpis = [
    { label: 'Visitas agendadas', value: totais.agendados, icon: <CalendarClock size={18} />, bg: '#e8f0fd', color: '#1d4ed8' },
    { label: 'Concluídas', value: totais.concluidos, icon: <CheckCircle2 size={18} />, bg: '#e6f6ea', color: '#137432' },
    { label: 'Não visitadas / não concluídas', value: totais.pendentes, icon: <CalendarX2 size={18} />, bg: '#fff4e0', color: '#b45309', sub: `${totais.semRelato} sem relato` },
    { label: 'Reagendadas', value: totais.reagendadas, icon: <Repeat size={18} />, bg: '#f1e8fd', color: '#6d28d9' },
    { label: 'Canceladas', value: totais.canceladas, icon: <Ban size={18} />, bg: '#fde8e8', color: '#b42318' },
  ];

  // Tela da gestão: só diretoria e coordenação (o servidor também não devolve dados para vendedor)
  if (!coordinatorScope.loadingScope && !coordinatorScope.isDirectorScope && !coordinatorScope.isCoordinatorScope) {
    return (
      <div className="animate-fadeIn rounded-2xl p-8 text-center shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}>
        <h1 className="text-lg font-bold" style={{ color: '#1b1c1a' }}>Acesso restrito</h1>
        <p className="text-sm mt-1" style={{ color: '#647062' }}>O Direcionamento Estratégico Semanal está disponível apenas para diretoria e coordenação.</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="mb-4">
        <CoordinatorScopeFilter scope={coordinatorScope} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Direcionamento Estratégico Semanal</h1>
          <p className="text-sm mt-1" style={{ color: '#647062' }}>Controle de agenda e visitas e clientes críticos sem compra, por executivo de vendas.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setSemanaInicio(addDays(semanaInicio, -7))} className="h-10 w-10 inline-flex items-center justify-center rounded-xl shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb', color: '#2f3a2f' }} title="Semana anterior">
            <ChevronLeft size={18} />
          </button>
          <span className="h-10 inline-flex items-center rounded-xl px-4 text-sm font-bold shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb', color: '#2f3a2f' }}>
            {formatDate(semanaInicio)} – {formatDate(semanaFim)}
          </span>
          <button type="button" onClick={() => setSemanaInicio(addDays(semanaInicio, 7))} className="h-10 w-10 inline-flex items-center justify-center rounded-xl shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb', color: '#2f3a2f' }} title="Próxima semana">
            <ChevronRight size={18} />
          </button>
          {semanaInicio !== mondayOf(hoje) ? (
            <button type="button" onClick={() => setSemanaInicio(mondayOf(hoje))} className="h-10 px-4 rounded-xl text-sm font-bold shadow-sm" style={{ backgroundColor: '#137432', color: '#ffffff' }}>
              Semana atual
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-5 border-b" style={{ borderColor: '#edf0eb' }}>
        {([['agenda', 'Controle de Agenda e Visitas'], ['clientes', 'Clientes Críticos sem Compra'], ['carteira', 'Carteira sem Visitação']] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setAba(k)}
            className="px-4 py-2.5 text-sm font-bold -mb-px border-b-2 transition-colors"
            style={{ borderColor: aba === k ? '#137432' : 'transparent', color: aba === k ? '#137432' : '#647062' }}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === 'agenda' ? (<>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5 mb-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}>
            <div className="flex items-start gap-3">
              <span className="shrink-0 rounded-full p-2" style={{ backgroundColor: k.bg, color: k.color }}>{k.icon}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold leading-4 min-h-8" style={{ color: '#7b8379' }}>{k.label}</p>
                <p className="text-2xl font-extrabold leading-8" style={{ color: '#1b1c1a' }}>{loading && !exemplo ? '–' : k.value}</p>
                <p className="text-xs font-semibold leading-4 min-h-4" style={{ color: '#b45309' }}>{k.sub && (!loading || exemplo) ? k.sub : '\u00A0'}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 mb-3" style={{ borderColor: '#edf0eb' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: '#1b1c1a' }}>Controle de Agenda e Visitas por Executivo</h2>
            <p className="text-xs mt-0.5" style={{ color: '#7b8379' }}>
              Visitas a clientes e prospecções da semana: não visitadas/não concluídas (incluindo as sem relato), reagendadas e canceladas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportarAgenda}
            disabled={exportando}
            className="h-9 px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
            style={{ backgroundColor: '#137432', color: '#ffffff' }}
          >
            {exportando ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Exportar Excel
          </button>
          <button
            type="button"
            onClick={() => setExemplo((v) => !v)}
            className="h-9 px-3 rounded-lg text-xs font-bold"
            style={{ backgroundColor: exemplo ? '#fff4e0' : '#f4f5f3', color: exemplo ? '#b45309' : '#4a5248', border: '1px solid #edf0eb' }}
          >
            {exemplo ? 'Voltar aos dados reais' : 'Ver dados de exemplo'}
          </button>
          <button
            type="button"
            onClick={() => setSomentePendentes((v) => !v)}
            className="h-9 px-3 rounded-lg text-xs font-bold"
            style={{ backgroundColor: somentePendentes ? '#e6f6ea' : '#f4f5f3', color: somentePendentes ? '#137432' : '#4a5248', border: '1px solid #edf0eb' }}
          >
            {somentePendentes ? 'Mostrando só quem tem ocorrência' : 'Mostrando todos os executivos'}
          </button>
          </div>
        </div>

        {exemplo ? (
          <div className="mb-3 rounded-lg px-3 py-2 text-xs font-semibold" style={{ backgroundColor: '#fff4e0', color: '#b45309' }}>
            Dados de exemplo, apenas para visualização. Nada foi gravado e os números não representam a equipe real.
          </div>
        ) : null}
        {loading && !exemplo ? (
          <div className="flex items-center gap-2 py-10 justify-center text-sm" style={{ color: '#647062' }}>
            <Loader2 size={16} className="animate-spin" /> Carregando agenda da semana...
          </div>
        ) : lista.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: '#647062' }}>
            {executivos.length === 0 ? 'Nenhum compromisso agendado nesta semana no escopo selecionado.' : 'Todos os executivos concluíram os compromissos da semana.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase" style={{ color: '#7b8379' }}>
                  <th className="py-2 pr-3">Executivo</th>
                  <th className="py-2 px-3 text-right">Agendadas</th>
                  <th className="py-2 px-3 text-right">Concluídas</th>
                  <th className="py-2 px-3 text-right">Não concluídas</th>
                  <th className="py-2 px-3 text-right">Sem relato</th>
                  <th className="py-2 px-3 text-right">Reagendadas</th>
                  <th className="py-2 px-3 text-right">Canceladas</th>
                  <th className="py-2 px-3 text-right">Execução</th>
                  <th className="py-2 pl-3 w-8" />
                </tr>
              </thead>
              <tbody>
                {lista.map((e) => {
                  const pct = e.agendados ? Math.round((e.concluidos / e.agendados) * 100) : 0;
                  const expanded = aberto === e.id;
                  return (
                    <Fragment key={e.id}>
                      <tr
                        onClick={() => setAberto(expanded ? null : e.id)}
                        className="cursor-pointer border-t transition-colors hover:bg-[#f7f9f6]"
                        style={{ borderColor: '#edf0eb' }}
                      >
                        <td className="py-3 pr-3 font-semibold" style={{ color: '#1b1c1a' }}>{e.nome}</td>
                        <td className="py-3 px-3 text-right">{e.agendados}</td>
                        <td className="py-3 px-3 text-right" style={{ color: '#137432' }}>{e.concluidos}</td>
                        <td className="py-3 px-3 text-right font-bold" style={{ color: e.pendentes.length ? '#b45309' : '#647062' }}>{e.pendentes.length}</td>
                        <td className="py-3 px-3 text-right font-bold" style={{ color: e.semRelato ? '#b42318' : '#647062' }}>{e.semRelato}</td>
                        <td className="py-3 px-3 text-right font-bold" style={{ color: e.reagendadas.length ? '#6d28d9' : '#647062' }}>{e.reagendadas.length}</td>
                        <td className="py-3 px-3 text-right font-bold" style={{ color: e.canceladas.length ? '#b42318' : '#647062' }}>{e.canceladas.length}</td>
                        <td className="py-3 px-3 text-right">
                          <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: pct >= 80 ? '#e6f6ea' : pct >= 50 ? '#fff4e0' : '#fde8e8', color: pct >= 80 ? '#137432' : pct >= 50 ? '#b45309' : '#b42318' }}>
                            {pct}%
                          </span>
                        </td>
                        <td className="py-3 pl-3">
                          <ChevronDown size={16} className="transition-transform" style={{ transform: expanded ? 'rotate(180deg)' : undefined, color: '#7b8379' }} />
                        </td>
                      </tr>
                      {expanded ? (
                        <tr>
                          <td colSpan={9} className="pb-3">
                            <div className="rounded-xl p-2 space-y-2" style={{ backgroundColor: '#f7f9f6' }}>
                              <GrupoDetalhe titulo="Não visitadas / não concluídas" itens={e.pendentes} vazio="Todas as visitas agendadas foram concluídas." />
                              <GrupoDetalhe titulo="Reagendadas" itens={e.reagendadas} vazio="Nenhuma visita reagendada." />
                              <GrupoDetalhe titulo="Canceladas" itens={e.canceladas} vazio="Nenhuma visita cancelada." />
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

      </>) : aba === 'carteira' ? (
      <CarteiraSemVisitacao
        hoje={hoje}
        scopeParams={coordinatorScope.scopeParams}
        loadingScope={coordinatorScope.loadingScope}
      />
      ) : (
      <ClientesCriticosSemCompra
        semanaInicio={semanaInicio}
        hoje={hoje}
        scopeParams={coordinatorScope.scopeParams}
        loadingScope={coordinatorScope.loadingScope}
      />
      )}
    </div>
  );
}

const dt = (iso?: string | null) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`) : null);

function badgeItem(p: ItemAgenda): { label: string; bg: string; color: string } {
  if (p.STATUS === 'CANCELADA') return { label: 'Cancelada', bg: '#fde8e8', color: '#b42318' };
  if (p.STATUS === 'CONCLUIDA') return { label: 'Concluída', bg: '#e6f6ea', color: '#137432' };
  if (Number(p.SEM_RELATO) === 1 && Number(p.ATRASADO) === 1) return { label: 'Vencida sem relato', bg: '#fde8e8', color: '#b42318' };
  if (Number(p.SEM_RELATO) === 1) return { label: `${STATUS_LABEL[p.STATUS] || p.STATUS} · sem relato`, bg: '#fff4e0', color: '#b45309' };
  if (Number(p.ATRASADO) === 1) return { label: 'Vencida sem conclusão', bg: '#fde8e8', color: '#b42318' };
  return { label: STATUS_LABEL[p.STATUS] || p.STATUS, bg: '#e8f0fd', color: '#1d4ed8' };
}

function GrupoDetalhe({ titulo, itens, vazio }: { titulo: string; itens: ItemAgenda[]; vazio: string }) {
  return (
    <div>
      <p className="px-2 pt-1 text-[11px] font-bold uppercase" style={{ color: '#7b8379' }}>{titulo} ({itens.length})</p>
      {itens.length === 0 ? (
        <p className="text-xs px-2 py-1" style={{ color: '#647062' }}>{vazio}</p>
      ) : itens.map((p) => {
        const badge = badgeItem(p);
        return (
          <div key={`${p.ORIGEM}-${p.ID}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-1.5 text-xs">
            <span className="font-semibold w-24" style={{ color: '#2f3a2f' }}>{formatDate(p.DATA_AGENDADA)} {p.HORA_INICIO || ''}</span>
            <span className="flex-1 min-w-[180px]" style={{ color: '#1b1c1a' }}>{p.COD_CLIENTE != null ? <span className="font-semibold tabular-nums" style={{ color: '#647062' }}>{p.COD_CLIENTE} · </span> : null}{p.CONTA}{p.CIDADE ? ` · ${p.CIDADE}` : ''}</span>
            <span style={{ color: '#647062' }}>{p.ORIGEM === 'PROSPECCAO' ? 'Prospecção' : p.TIPO || 'Visita'}</span>
            <span className="rounded-full px-2 py-0.5 font-bold" style={{ backgroundColor: badge.bg, color: badge.color }}>{badge.label}</span>
          </div>
        );
      })}
    </div>
  );
}

const EXEMPLO_EXECUTIVOS = ['Ana Souza (exemplo)', 'Bruno Lima (exemplo)', 'Carla Mendes (exemplo)', 'Diego Rocha (exemplo)', 'Elisa Prado (exemplo)'];
const EXEMPLO_CONTAS = ['Hospital Santa Clara', 'Clínica Vida Plena', 'Casa de Repouso Bem Viver', 'Restaurante Sabor & Saúde', 'Hospital Regional Norte', 'Farmácia Central', 'Clínica Nutrir', 'Lar dos Idosos São José'];
const EXEMPLO_CIDADES = ['Brasília', 'Goiânia', 'Anápolis', 'Taguatinga'];
const EXEMPLO_TIPOS = ['Gerar demanda', 'Manutenção', 'Pós-venda', 'Apresentação de produto'];
// [concluídas, pendentes com relato, pendentes sem relato, reagendadas, canceladas] por executivo
const EXEMPLO_PERFIS: number[][] = [[12, 0, 1, 0, 0], [6, 1, 5, 2, 1], [3, 0, 8, 3, 2], [9, 1, 2, 1, 0], [10, 0, 0, 0, 1]];

function gerarItensExemplo(semanaInicio: string, hoje: string, vendedor: { id: number; nome: string } | null): ItemAgenda[] {
  const itens: ItemAgenda[] = [];
  let id = 1;
  // Vendedor específico no filtro: só ele, com o perfil mais completo (tem todas as ocorrências)
  const perfis = vendedor ? [EXEMPLO_PERFIS[1]] : EXEMPLO_PERFIS;
  perfis.forEach(([conc, pendRel, pendSem, reag, canc], e) => {
    const total = conc + pendRel + pendSem + canc;
    for (let k = 0; k < total; k++) {
      const data = addDays(semanaInicio, k % 5);
      const status = k < conc ? 'CONCLUIDA' : k < conc + pendRel + pendSem ? (k % 4 === 0 ? 'EM_ANDAMENTO' : 'AGENDADA') : 'CANCELADA';
      const pendente = status === 'AGENDADA' || status === 'EM_ANDAMENTO';
      const semRelato = pendente && k >= conc + pendRel;
      itens.push({
        ORIGEM: k % 6 === 5 ? 'PROSPECCAO' : 'VISITA',
        ID: id++,
        EXECUTIVO_ID: vendedor ? vendedor.id : -(e + 1),
        EXECUTIVO_NOME: vendedor ? `${vendedor.nome} (exemplo)` : EXEMPLO_EXECUTIVOS[e],
        DATA_AGENDADA: data,
        HORA_INICIO: `${String(8 + (k % 8)).padStart(2, '0')}:00`,
        TIPO: k % 6 === 5 ? 'Prospecção' : EXEMPLO_TIPOS[k % EXEMPLO_TIPOS.length],
        STATUS: status,
        CONTA: EXEMPLO_CONTAS[(k + e) % EXEMPLO_CONTAS.length],
        CIDADE: EXEMPLO_CIDADES[(k + e) % EXEMPLO_CIDADES.length],
        ATRASADO: pendente && data < hoje ? 1 : 0,
        SEM_RELATO: semRelato ? 1 : 0,
        REAGENDADA: k >= conc && k - conc < reag ? 1 : 0,
      });
    }
  });
  return itens;
}
