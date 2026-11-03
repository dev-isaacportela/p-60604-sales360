import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HotTable } from '@handsontable/react-wrapper';
import { registerAllModules } from 'handsontable/registry';
import 'handsontable/styles/handsontable.min.css';
import 'handsontable/styles/ht-theme-main.min.css';
import { AlertTriangle, BarChart3, Building2, ChevronDown, Filter, Loader2, RefreshCw, ShieldCheck, Target, TrendingUp, Undo2, Users } from 'lucide-react';
import { callSF, callSFSingle, callSFWithMeta, formatCurrency, getBrasiliaDate, SF } from '../hooks/useMitra';
import { ChartContainer, ShadcnBarChart, ShadcnComposedChart, ShadcnPieChart } from '../components/ui/Chart';

registerAllModules();

interface Option {
  value: string;
  label: string;
  codfilial?: number;
  codepto?: number;
}

interface PermissaoDiretoria {
  PODE_ACESSAR: number;
  CARGO_ATUAL?: string;
}

interface DiretoriaFilters {
  mes: string;
  ano: string;
  codSupervisor: string;
  buValue: string;
}

interface ResumoDiretoria {
  META_TOTAL: number;
  FATURAMENTO_BRUTO: number;
  DEVOLVIDO: number;
  REALIZADO_LIQUIDO: number;
  GAP_META: number;
  PERCENTUAL_META: number;
  PERCENTUAL_DEVOLUCAO: number;
  QTD_PEDIDOS: number;
  CLIENTES_COM_COMPRA: number;
  TICKET_MEDIO: number;
  TOTAL_BUS: number;
  TOTAL_COORDENADORES: number;
  BUS_SEM_META: number;
  BUS_ABAIXO_80: number;
  BUS_SEM_COORDENADOR: number;
}

interface BuRow {
  CODFILIAL: number;
  CODEPTO: number;
  DEPARTAMENTO: string;
  COD_SUPERVISOR: number;
  COORDENADOR: string;
  META_VALOR: number;
  FATURAMENTO_BRUTO: number;
  DEVOLVIDO: number;
  REALIZADO_LIQUIDO: number;
  GAP_META: number;
  PERCENTUAL_META: number;
  PERCENTUAL_DEVOLUCAO: number;
  QTD_PEDIDOS: number;
  CLIENTES_COM_COMPRA: number;
  STATUS_EXECUTIVO: string;
}

interface CoordenadorRow {
  COD_SUPERVISOR: number;
  COORDENADOR: string;
  META_VALOR: number;
  FATURAMENTO_BRUTO: number;
  DEVOLVIDO: number;
  REALIZADO_LIQUIDO: number;
  GAP_META: number;
  PERCENTUAL_META: number;
  PERCENTUAL_DEVOLUCAO: number;
  QTD_PEDIDOS: number;
  CLIENTES_COM_COMPRA: number;
  TOTAL_BUS: number;
  BUS_CRITICAS: number;
}

interface TendenciaRow {
  MES_ANO: string;
  META_VALOR: number;
  REALIZADO_LIQUIDO: number;
  DEVOLVIDO: number;
  PERCENTUAL_META: number;
}

interface RiscoRow {
  CODFILIAL: number;
  CODEPTO: number;
  DEPARTAMENTO: string;
  COORDENADOR: string;
  META_VALOR: number;
  REALIZADO_LIQUIDO: number;
  GAP_META: number;
  PERCENTUAL_META: number;
  PERCENTUAL_DEVOLUCAO: number;
  RISCO: string;
  PRIORIDADE: number;
}

interface DiretoriaData {
  resumo: ResumoDiretoria | null;
  bus: BuRow[];
  coordenadores: CoordenadorRow[];
  tendencia: TendenciaRow[];
  riscos: RiscoRow[];
  errors: string[];
}

const MONTHS: Option[] = [
  { value: '1', label: 'Janeiro' },
  { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' },
  { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

const EMPTY_DATA: DiretoriaData = {
  resumo: null,
  bus: [],
  coordenadores: [],
  tendencia: [],
  riscos: [],
  errors: [],
};

function toNumber(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatInteger(value: unknown): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(toNumber(value));
}

function formatPercent(value: unknown): string {
  return `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(toNumber(value))}%`;
}

function chartLabel(value: unknown, maxLength = 22): string {
  const label = String(value || 'Sem nome').replace(/\s+/g, ' ').trim();
  if (label.length <= maxLength) return label;
  return `${label.slice(0, maxLength - 1).trimEnd()}...`;
}

function currentPeriod() {
  const [ano, mes] = getBrasiliaDate().split('-');
  return { mes: String(Number(mes)), ano };
}

function parseBu(value: string) {
  const [codfilial, codepto] = value.split('|');
  return { codfilial: codfilial || '', codepto: codepto || '' };
}

function inputFromFilters(filters: DiretoriaFilters) {
  const { codfilial, codepto } = parseBu(filters.buValue);
  return {
    mes: filters.mes,
    ano: filters.ano,
    codSupervisor: filters.codSupervisor,
    codfilial,
    codepto,
  };
}

function DropdownFilter({ label, value, options, onChange, minWidth = 220 }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; minWidth?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value)?.label || 'Todos';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div ref={ref} className="relative" style={{ minWidth }}>
      <p className="text-xs label-ui font-semibold mb-1" style={{ color: '#748070' }}>{label}</p>
      <button type="button" onClick={() => setOpen((prev) => !prev)} className="h-10 w-full px-3 rounded-xl text-sm font-semibold flex items-center justify-between gap-2" style={{ backgroundColor: 'var(--color-surface-container)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
        <span className="truncate">{selected}</span>
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-full min-w-[280px] max-h-[320px] overflow-auto rounded-2xl p-2 z-30 animate-scaleIn" style={{ backgroundColor: '#ffffff', border: '1px solid #dde5d8', boxShadow: '0 12px 26px rgba(23,40,30,0.12)' }}>
          {options.map((option) => (
            <button key={`${label}-${option.value || 'all'}`} type="button" onClick={() => { onChange(option.value); setOpen(false); }} className="w-full text-left rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: value === option.value ? '#dfeadf' : 'transparent', color: value === option.value ? '#1f6f39' : '#4e5a4e', fontWeight: value === option.value ? 700 : 500 }}>
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, subtitle, action, children, warm = false }: { title: string; subtitle: string; action?: ReactNode; children: ReactNode; warm?: boolean }) {
  return (
    <section className="rounded-[26px] overflow-hidden analytics-soft-card" style={{ backgroundColor: warm ? '#fff8f1' : '#ffffff', border: warm ? '1px solid #f0dfcc' : '1px solid #edf0eb' }}>
      <div className="px-6 py-5 border-b flex items-start justify-between gap-4 flex-wrap" style={{ borderColor: warm ? '#f0dfcc' : '#edf0eb' }}>
        <div>
          <h2 className="font-display text-[26px] leading-tight font-extrabold" style={{ color: warm ? '#281b10' : 'var(--color-text)' }}>{title}</h2>
          <p className="text-sm mt-1" style={{ color: warm ? '#6f563b' : 'var(--color-text-secondary)' }}>{subtitle}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MetricCard({ label, value, helper, icon, tone = 'green' }: { label: string; value: string; helper: string; icon: ReactNode; tone?: 'green' | 'blue' | 'amber' | 'red' | 'purple' }) {
  const tones = {
    green: { bg: 'var(--kpi-bg-green)', color: 'var(--color-primary)', border: 'var(--color-primary)' },
    blue: { bg: 'var(--kpi-bg-blue)', color: '#2d5cc5', border: '#2d5cc5' },
    amber: { bg: 'var(--kpi-bg-amber)', color: '#a46a18', border: '#a46a18' },
    red: { bg: '#fff1f0', color: '#b42318', border: '#d92d20' },
    purple: { bg: 'var(--kpi-bg-purple)', color: '#6f3db3', border: '#6f3db3' },
  }[tone];

  return (
    <div className="rounded-[22px] p-4 analytics-soft-card relative overflow-hidden" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}>
      <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: tones.border }} />
      <div className="flex items-start gap-3">
        <div className="rounded-full p-2 shrink-0" style={{ backgroundColor: tones.bg, color: tones.color }}>{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] label-ui font-semibold" style={{ color: '#8c9489' }}>{label}</p>
          <p className="text-[25px] leading-tight font-extrabold mt-1" style={{ color: 'var(--color-text)' }}>{value}</p>
          <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>{helper}</p>
        </div>
      </div>
    </div>
  );
}

export default function AnaliseDiretoriaPage() {
  const initial = currentPeriod();
  const [loadingPermissao, setLoadingPermissao] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [permissao, setPermissao] = useState<PermissaoDiretoria | null>(null);
  const [filters, setFilters] = useState<DiretoriaFilters>({ mes: initial.mes, ano: initial.ano, codSupervisor: '', buValue: '' });
  const [appliedFilters, setAppliedFilters] = useState<DiretoriaFilters>({ mes: initial.mes, ano: initial.ano, codSupervisor: '', buValue: '' });
  const [filterOptions, setFilterOptions] = useState<{ coordenadores: Option[]; bus: Option[] }>({ coordenadores: [], bus: [] });
  const [data, setData] = useState<DiretoriaData>(EMPTY_DATA);

  const podeAcessar = Number(permissao?.PODE_ACESSAR || 0) === 1;
  const yearOptions = useMemo(() => {
    const base = Number(initial.ano);
    return Array.from({ length: 7 }, (_, index) => String(base - 3 + index)).map((year) => ({ value: year, label: year }));
  }, [initial.ano]);

  async function loadFilters() {
    const rows = await callSF(SF.analiseDiretoriaFiltros, inputFromFilters(filters));
    setFilterOptions({
      coordenadores: [{ value: '', label: 'Todos os coordenadores' }, ...rows.filter((row) => row.TIPO === 'COORDENADOR').map((row) => ({ value: String(row.VALUE), label: String(row.LABEL || row.VALUE) }))],
      bus: [{ value: '', label: 'Todas as BUs' }, ...rows.filter((row) => row.TIPO === 'BU').map((row) => ({ value: String(row.VALUE), label: String(row.LABEL || row.VALUE), codfilial: Number(row.CODFILIAL), codepto: Number(row.CODEPTO) }))],
    });
  }

  async function loadData(nextFilters = filters) {
    setLoadingData(true);
    const input = inputFromFilters(nextFilters);
    const [resumo, bus, coordenadores, tendencia, riscos] = await Promise.all([
      callSFWithMeta(SF.analiseDiretoriaResumo, input),
      callSFWithMeta(SF.analiseDiretoriaBus, input),
      callSFWithMeta(SF.analiseDiretoriaCoordenadores, input),
      callSFWithMeta(SF.analiseDiretoriaTendencia, input),
      callSFWithMeta(SF.analiseDiretoriaRiscos, input),
    ]);
    const errors = [resumo, bus, coordenadores, tendencia, riscos].map((result) => result.error).filter((error): error is string => Boolean(error));
    setData({
      resumo: (resumo.rows[0] as ResumoDiretoria) || null,
      bus: bus.rows as BuRow[],
      coordenadores: coordenadores.rows as CoordenadorRow[],
      tendencia: tendencia.rows as TendenciaRow[],
      riscos: riscos.rows as RiscoRow[],
      errors,
    });
    setAppliedFilters(nextFilters);
    setLoadingData(false);
  }

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      setLoadingPermissao(true);
      const row = await callSFSingle(SF.gestaoMetasDiretoriaPermissao);
      if (!active) return;
      setPermissao(row as PermissaoDiretoria | null);
      setLoadingPermissao(false);
    }
    bootstrap();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!podeAcessar) return;
    void loadFilters();
    void loadData(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeAcessar]);

  const resumo = data.resumo || ({} as ResumoDiretoria);
  const percentualMeta = toNumber(resumo.PERCENTUAL_META);
  const progressWidth = Math.min(100, Math.max(0, percentualMeta));
  const appliedBuLabel = filterOptions.bus.find((option) => option.value === appliedFilters.buValue)?.label || 'Todas as BUs';
  const appliedCoordLabel = filterOptions.coordenadores.find((option) => option.value === appliedFilters.codSupervisor)?.label || 'Todos os coordenadores';
  const periodLabel = `${MONTHS.find((month) => month.value === appliedFilters.mes)?.label || appliedFilters.mes}/${appliedFilters.ano}`;

  const tendenciaChartData = data.tendencia.map((row) => ({
    name: row.MES_ANO,
    realizado: toNumber(row.REALIZADO_LIQUIDO),
    meta: toNumber(row.META_VALOR),
    devolvido: toNumber(row.DEVOLVIDO),
  }));
  const buChartData = data.bus.slice(0, 10).map((row) => ({
    name: chartLabel(`${row.CODFILIAL}.${row.CODEPTO} ${row.DEPARTAMENTO}`, 28),
    value: toNumber(row.REALIZADO_LIQUIDO),
    codfilial: row.CODFILIAL,
    codepto: row.CODEPTO,
  }));
  const coordenadorChartData = data.coordenadores.map((row) => ({
    name: chartLabel(row.COORDENADOR, 24),
    value: toNumber(row.REALIZADO_LIQUIDO),
    codSupervisor: String(row.COD_SUPERVISOR || ''),
  }));
  const riscosPieData = Object.entries(data.riscos.reduce<Record<string, number>>((acc, row) => {
    const key = row.RISCO || 'Monitorar';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {})).map(([name, value], index) => ({
    name,
    value,
    color: ['#b42318', '#a46a18', '#6f3db3', '#2d5cc5', 'var(--color-primary)'][index % 5],
  }));

  const buRows = data.bus.map((row) => ({
    BU: `Filial ${row.CODFILIAL} · Depto ${row.CODEPTO}`,
    DEPARTAMENTO: row.DEPARTAMENTO,
    COORDENADOR: row.COORDENADOR,
    META: formatCurrency(toNumber(row.META_VALOR)),
    LIQUIDO: formatCurrency(toNumber(row.REALIZADO_LIQUIDO)),
    GAP: formatCurrency(toNumber(row.GAP_META)),
    PERCENTUAL_META: formatPercent(row.PERCENTUAL_META),
    DEVOLUCAO: formatPercent(row.PERCENTUAL_DEVOLUCAO),
    STATUS: row.STATUS_EXECUTIVO,
  }));
  const coordenadorRows = data.coordenadores.map((row) => ({
    COORDENADOR: row.COORDENADOR,
    BUS: toNumber(row.TOTAL_BUS),
    META: formatCurrency(toNumber(row.META_VALOR)),
    LIQUIDO: formatCurrency(toNumber(row.REALIZADO_LIQUIDO)),
    GAP: formatCurrency(toNumber(row.GAP_META)),
    PERCENTUAL_META: formatPercent(row.PERCENTUAL_META),
    DEVOLUCAO: formatPercent(row.PERCENTUAL_DEVOLUCAO),
    BUS_CRITICAS: toNumber(row.BUS_CRITICAS),
  }));
  const riscoRows = data.riscos.map((row) => ({
    BU: `Filial ${row.CODFILIAL} · Depto ${row.CODEPTO}`,
    DEPARTAMENTO: row.DEPARTAMENTO,
    COORDENADOR: row.COORDENADOR,
    RISCO: row.RISCO,
    GAP: formatCurrency(toNumber(row.GAP_META)),
    PERCENTUAL_META: formatPercent(row.PERCENTUAL_META),
    DEVOLUCAO: formatPercent(row.PERCENTUAL_DEVOLUCAO),
  }));

  function applyBuFilter(codfilial: unknown, codepto: unknown) {
    const next = { ...filters, buValue: `${codfilial}|${codepto}` };
    setFilters(next);
    void loadData(next);
  }

  function applyCoordenadorFilter(codSupervisor: unknown) {
    const next = { ...filters, codSupervisor: String(codSupervisor || '') };
    setFilters(next);
    void loadData(next);
  }

  if (loadingPermissao) {
    return <div className="rounded-3xl p-6 analytics-soft-card" style={{ backgroundColor: '#ffffff' }}>Carregando permissões...</div>;
  }

  if (!podeAcessar) {
    return (
      <div className="rounded-3xl p-6 analytics-soft-card" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}>
        <h1 className="font-display text-3xl font-extrabold" style={{ color: 'var(--color-text)' }}>Acesso restrito</h1>
        <p className="mt-2" style={{ color: 'var(--color-text-secondary)' }}>Esta análise é exclusiva para Diretoria e administradores.</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-5 analytics-page mx-auto max-w-[1320px]">
      <div className="rounded-[30px] analytics-hero px-6 py-5 flex items-center justify-between gap-5 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#137432', color: '#ffffff' }}>
            <ShieldCheck size={24} />
          </div>
          <div>
            <p className="text-[11px] label-ui font-bold" style={{ color: '#137432' }}>Diretoria Comercial</p>
            <h1 className="font-display text-[34px] leading-none font-extrabold tracking-[0.04em]" style={{ color: 'var(--color-text)' }}>ANÁLISE DIRETORIA</h1>
            <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>Meta, realizado líquido, devoluções, riscos e execução por BU e coordenador.</p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 px-4 py-3 rounded-full text-sm font-semibold" style={{ backgroundColor: '#eef2eb', color: '#516153' }}>
          <Building2 size={18} /> {periodLabel} · {appliedCoordLabel} · {appliedBuLabel}
        </div>
      </div>

      <section className="sticky top-3 z-20 rounded-[26px] p-4 analytics-soft-card" style={{ backgroundColor: 'rgba(255, 255, 255, 0.96)', border: '1px solid #edf0eb', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Filter size={18} style={{ color: 'var(--color-primary)' }} />
          <h2 className="font-display text-lg font-extrabold" style={{ color: 'var(--color-text)' }}>Filtros executivos</h2>
          {loadingData ? <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--color-primary)' }}><Loader2 size={14} className="animate-spin" /> Atualizando</span> : null}
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <DropdownFilter label="Mês" value={filters.mes} options={MONTHS} onChange={(mes) => setFilters((current) => ({ ...current, mes }))} minWidth={160} />
          <DropdownFilter label="Ano" value={filters.ano} options={yearOptions} onChange={(ano) => setFilters((current) => ({ ...current, ano }))} minWidth={140} />
          <DropdownFilter label="Coordenador" value={filters.codSupervisor} options={filterOptions.coordenadores} onChange={(codSupervisor) => setFilters((current) => ({ ...current, codSupervisor }))} minWidth={260} />
          <DropdownFilter label="BU" value={filters.buValue} options={filterOptions.bus} onChange={(buValue) => setFilters((current) => ({ ...current, buValue }))} minWidth={320} />
          <button type="button" disabled={loadingData} onClick={() => loadData(filters)} className="h-10 px-5 rounded-xl font-bold inline-flex items-center gap-2 mt-5 disabled:opacity-70" style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}>
            {loadingData ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            Atualizar análise
          </button>
        </div>
      </section>

      {data.errors.length > 0 ? (
        <div className="rounded-3xl p-4 flex items-start gap-3" style={{ backgroundColor: '#fff1f0', border: '1px solid #ffd8d3', color: '#b42318' }}>
          <AlertTriangle size={20} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Alguns blocos não carregaram.</p>
            <p className="text-sm mt-1">{data.errors.join(' ')}</p>
          </div>
        </div>
      ) : null}

      <Section title="Resumo Executivo" subtitle="Indicadores consolidados do período aplicado.">
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <MetricCard label="Meta total" value={formatCurrency(toNumber(resumo.META_TOTAL))} helper={`${formatInteger(resumo.TOTAL_BUS)} BUs no escopo.`} icon={<Target size={20} />} tone="green" />
            <MetricCard label="Realizado líquido" value={formatCurrency(toNumber(resumo.REALIZADO_LIQUIDO))} helper={`${formatCurrency(toNumber(resumo.FATURAMENTO_BRUTO))} bruto.`} icon={<TrendingUp size={20} />} tone="blue" />
            <MetricCard label="Gap para meta" value={formatCurrency(toNumber(resumo.GAP_META))} helper={`${formatPercent(resumo.PERCENTUAL_META)} de atingimento.`} icon={<BarChart3 size={20} />} tone={percentualMeta >= 100 ? 'green' : 'amber'} />
            <MetricCard label="Devoluções" value={formatCurrency(toNumber(resumo.DEVOLVIDO))} helper={`${formatPercent(resumo.PERCENTUAL_DEVOLUCAO)} do bruto.`} icon={<Undo2 size={20} />} tone="red" />
            <MetricCard label="Clientes com compra" value={formatInteger(resumo.CLIENTES_COM_COMPRA)} helper={`${formatInteger(resumo.QTD_PEDIDOS)} pedidos.`} icon={<Users size={20} />} tone="purple" />
          </div>
          <div className="rounded-[26px] p-5" style={{ backgroundColor: '#f6f7f4', border: '1px solid #edf0eb' }}>
            <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
              <div>
                <p className="text-xs label-ui font-semibold" style={{ color: '#748070' }}>Atingimento consolidado</p>
                <p className="text-[36px] leading-tight font-extrabold" style={{ color: percentualMeta >= 100 ? 'var(--color-primary)' : '#a46a18' }}>{formatPercent(percentualMeta)}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-right">
                <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}><p className="text-xs label-ui" style={{ color: '#748070' }}>BUs críticas</p><p className="text-xl font-bold" style={{ color: '#b42318' }}>{formatInteger(resumo.BUS_ABAIXO_80)}</p></div>
                <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}><p className="text-xs label-ui" style={{ color: '#748070' }}>Sem meta</p><p className="text-xl font-bold" style={{ color: '#a46a18' }}>{formatInteger(resumo.BUS_SEM_META)}</p></div>
                <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}><p className="text-xs label-ui" style={{ color: '#748070' }}>Sem coord.</p><p className="text-xl font-bold" style={{ color: '#6f3db3' }}>{formatInteger(resumo.BUS_SEM_COORDENADOR)}</p></div>
              </div>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: '#dce5d7' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${progressWidth}%`, backgroundColor: percentualMeta >= 100 ? 'var(--color-primary)' : '#a46a18' }} />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Tendência e Comparativos" subtitle="Últimos 6 meses e ranking por BU/coordenador. Clique nas barras para filtrar toda a página.">
        <div className="p-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartContainer title="Realizado vs Meta" subtitle="Linha de meta e barras de realizado líquido.">
            <ShadcnComposedChart data={tendenciaChartData} xKey="name" bars={[{ dataKey: 'realizado', name: 'Realizado', color: '#2d5cc5' }]} lines={[{ dataKey: 'meta', name: 'Meta', color: '#b42318', dashed: true }]} height={320} formatter={(value) => formatCurrency(Number(value))} />
          </ChartContainer>
          <ChartContainer title="Top BUs por realizado" subtitle="Clique em uma BU para aprofundar a análise.">
            <ShadcnBarChart data={buChartData} xKey="name" layout="vertical" height={Math.max(320, buChartData.length * 38)} bars={[{ dataKey: 'value', name: 'Líquido', color: 'var(--color-primary)' }]} formatter={(value) => formatCurrency(Number(value))} onBarClick={(item) => applyBuFilter(item.codfilial, item.codepto)} />
          </ChartContainer>
          <ChartContainer title="Coordenadores" subtitle="Comparativo de realizado líquido por coordenador.">
            <ShadcnBarChart data={coordenadorChartData} xKey="name" layout="vertical" height={Math.max(260, coordenadorChartData.length * 46)} bars={[{ dataKey: 'value', name: 'Líquido', color: '#2d5cc5' }]} formatter={(value) => formatCurrency(Number(value))} onBarClick={(item) => applyCoordenadorFilter(item.codSupervisor)} />
          </ChartContainer>
          <ChartContainer title="Mapa de riscos" subtitle="Distribuição das BUs por tipo de alerta executivo.">
            <ShadcnPieChart data={riscosPieData} height={300} formatter={(value) => formatInteger(value)} donut showLabel labelType="name-percent" />
          </ChartContainer>
        </div>
      </Section>

      <Section title="BUs e Coordenadores" subtitle="Detalhamento financeiro por unidade de negócio e responsável.">
        <div className="p-5 space-y-4">
          <div className="validation-hot-wrapper analytics-detail-table rounded-2xl">
            <div className="px-1 pb-3">
              <h3 className="font-display text-xl font-extrabold" style={{ color: 'var(--color-text)' }}>Ranking de BUs</h3>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Selecione uma linha para filtrar a página pela BU.</p>
            </div>
            <HotTable data={buRows} columns={[{ data: 'BU', width: 150 }, { data: 'DEPARTAMENTO', width: 180 }, { data: 'COORDENADOR', width: 180 }, { data: 'META', width: 130 }, { data: 'LIQUIDO', width: 130 }, { data: 'GAP', width: 130 }, { data: 'PERCENTUAL_META', width: 105 }, { data: 'DEVOLUCAO', width: 105 }, { data: 'STATUS', width: 135 }]} colHeaders={['BU', 'Departamento', 'Coordenador', 'Meta', 'Líquido', 'Gap', '% Meta', '% Dev.', 'Status']} rowHeaders={false} height={360} width="100%" stretchH="all" manualColumnResize columnSorting={{ indicator: true, headerAction: true }} afterSelectionEnd={(row: number) => { const selected = data.bus[row]; if (selected) applyBuFilter(selected.CODFILIAL, selected.CODEPTO); }} readOnly licenseKey="non-commercial-and-evaluation" className="ht-theme-main" />
          </div>
          <div className="validation-hot-wrapper analytics-detail-table rounded-2xl">
            <div className="px-1 pb-3">
              <h3 className="font-display text-xl font-extrabold" style={{ color: 'var(--color-text)' }}>Performance por coordenador</h3>
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Resumo consolidado para priorização de conversas de gestão.</p>
            </div>
            <HotTable data={coordenadorRows} columns={[{ data: 'COORDENADOR', width: 220 }, { data: 'BUS', width: 80 }, { data: 'META', width: 130 }, { data: 'LIQUIDO', width: 130 }, { data: 'GAP', width: 130 }, { data: 'PERCENTUAL_META', width: 105 }, { data: 'DEVOLUCAO', width: 105 }, { data: 'BUS_CRITICAS', width: 105 }]} colHeaders={['Coordenador', 'BUs', 'Meta', 'Líquido', 'Gap', '% Meta', '% Dev.', 'BUs críticas']} rowHeaders={false} height={280} width="100%" stretchH="all" manualColumnResize columnSorting={{ indicator: true, headerAction: true }} readOnly licenseKey="non-commercial-and-evaluation" className="ht-theme-main" />
          </div>
        </div>
      </Section>

      <Section title="Riscos Prioritários" subtitle="BUs que exigem decisão da diretoria por meta, devolução ou governança." warm>
        <div className="p-5">
          <div className="validation-hot-wrapper rounded-2xl">
            <HotTable data={riscoRows} columns={[{ data: 'RISCO', width: 160 }, { data: 'BU', width: 145 }, { data: 'DEPARTAMENTO', width: 180 }, { data: 'COORDENADOR', width: 180 }, { data: 'GAP', width: 130 }, { data: 'PERCENTUAL_META', width: 105 }, { data: 'DEVOLUCAO', width: 105 }]} colHeaders={['Risco', 'BU', 'Departamento', 'Coordenador', 'Gap', '% Meta', '% Dev.']} rowHeaders={false} height={360} width="100%" stretchH="all" manualColumnResize columnSorting={{ indicator: true, headerAction: true }} readOnly licenseKey="non-commercial-and-evaluation" className="ht-theme-main" />
          </div>
        </div>
      </Section>

      <div className="rounded-3xl p-4 flex items-center gap-2 text-sm" style={{ backgroundColor: '#eef2eb', color: '#526052' }}>
        <BarChart3 size={16} /> Dados calculados a partir das tabelas locais importadas e das metas da Diretoria. Cliques nos rankings aplicam filtros executivos na página.
      </div>
    </div>
  );
}
