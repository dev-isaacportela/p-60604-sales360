import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HotTable } from '@handsontable/react-wrapper';
import { registerAllModules } from 'handsontable/registry';
import 'handsontable/styles/handsontable.min.css';
import 'handsontable/styles/ht-theme-main.min.css';
import { AlertTriangle, BarChart3, Boxes, Check, ChevronDown, Filter, Loader2, PackageSearch, ReceiptText, RefreshCw, Search, ShoppingBag, TrendingUp, Users, X } from 'lucide-react';
import { callSF, callSFSingle, callSFWithMeta, formatCurrency, getBrasiliaDate, SF } from '../hooks/useMitra';
import { dedupeOptions } from '../lib/utils';
import { ChartContainer, ShadcnBarChart } from '../components/ui/Chart';

registerAllModules();

interface Option {
  value: string;
  label: string;
}

interface Filters {
  mes: string;
  ano: string;
  codSupervisor: string;
  codfilial: string;
  codRca: string;
  codCli: string;
  codProd: string;
}

interface PermissaoRow {
  PODE_ACESSAR: number;
}

interface ResumoRow {
  FATURAMENTO: number;
  QTD_PEDIDOS: number;
  QTD_FILIAIS: number;
  QTD_COORDENADORES: number;
  QTD_VENDEDORES: number;
  QTD_CLIENTES: number;
  QTD_PRODUTOS: number;
  QTD_ITENS: number;
  TICKET_MEDIO: number;
}

interface CoordenadorRow {
  COD_SUPERVISOR: number;
  COORDENADOR: string;
  FATURAMENTO: number;
  QTD_VENDEDORES: number;
  QTD_CLIENTES: number;
  QTD_PRODUTOS: number;
  QTD_PEDIDOS: number;
  QTD_ITENS: number;
}

interface FilialRow {
  CODFILIAL: number;
  FILIAL: string;
  FATURAMENTO: number;
  QTD_COORDENADORES: number;
  QTD_VENDEDORES: number;
  QTD_CLIENTES: number;
  QTD_PRODUTOS: number;
  QTD_PEDIDOS: number;
  QTD_ITENS: number;
}

interface VendedorRow {
  COD_SUPERVISOR: number;
  COORDENADOR: string;
  CODFILIAL: number;
  FILIAL: string;
  COD_RCA: number;
  VENDEDOR: string;
  FATURAMENTO: number;
  QTD_CLIENTES: number;
  QTD_PRODUTOS: number;
  QTD_PEDIDOS: number;
  QTD_ITENS: number;
}

interface ProdutoRow {
  CODPROD: number;
  PRODUTO: string;
  FATURAMENTO: number;
  QTD_ITENS: number;
  QTD_CLIENTES: number;
  QTD_VENDEDORES: number;
  QTD_PEDIDOS: number;
}

interface ClienteRow {
  CODCLI: number;
  CLIENTE: string;
  FATURAMENTO: number;
  QTD_PEDIDOS: number;
  QTD_PRODUTOS: number;
  QTD_VENDEDORES: number;
  QTD_ITENS: number;
}

interface DetalheRow {
  COORDENADOR: string;
  VENDEDOR: string;
  CODFILIAL: number;
  FILIAL: string;
  CODCLI: number;
  CLIENTE: string;
  CODPROD: number;
  PRODUTO: string;
  DEPARTAMENTO: string;
  SECAO: string;
  FATURAMENTO: number;
  QTD_ITENS: number;
  QTD_PEDIDOS: number;
}

interface PageData {
  resumo: ResumoRow | null;
  coordenadores: CoordenadorRow[];
  filiais: FilialRow[];
  vendedores: VendedorRow[];
  produtos: ProdutoRow[];
  clientes: ClienteRow[];
  detalhe: DetalheRow[];
  errors: string[];
}

const EMPTY_DATA: PageData = {
  resumo: null,
  coordenadores: [],
  filiais: [],
  vendedores: [],
  produtos: [],
  clientes: [],
  detalhe: [],
  errors: [],
};

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

function toNumber(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatInteger(value: unknown): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(toNumber(value));
}

function chartLabel(value: unknown, maxLength = 24): string {
  const label = String(value || 'Sem nome').replace(/\s+/g, ' ').trim();
  if (label.length <= maxLength) return label;
  return `${label.slice(0, maxLength - 1).trimEnd()}...`;
}

function currentPeriod() {
  const [ano, mes] = getBrasiliaDate().split('-');
  return { mes: String(Number(mes)), ano };
}

function inputFromFilters(filters: Filters) {
  return {
    mes: filters.mes,
    ano: filters.ano,
    codSupervisor: filters.codSupervisor,
    codfilial: filters.codfilial,
    codRca: filters.codRca,
    codCli: filters.codCli,
    codProd: filters.codProd,
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

function MultiSelectFilter({ label, value, options, onChange, minWidth = 300 }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; minWidth?: number }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);
  const selectedValues = value.split(',').map((item) => item.trim()).filter(Boolean);
  const selectedSet = new Set(selectedValues);
  const selectedOptions = options.filter((option) => option.value && selectedSet.has(option.value));
  const selectedLabel = selectedOptions.length === 0
    ? selectedValues.length === 0 ? 'Todos os clientes' : `${selectedValues.length} cliente(s) selecionado(s)`
    : selectedValues.length === 1
      ? selectedOptions[0]?.label || `Cliente ${selectedValues[0]}`
      : `${selectedValues.length} clientes selecionados`;
  const searchTerm = search.trim().toLowerCase();
  const clientOptions = options.filter((option) => option.value);
  const filteredOptions = clientOptions.filter((option) => `${option.label} ${option.value}`.toLowerCase().includes(searchTerm));

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

  function toggleValue(nextValue: string) {
    const next = new Set(selectedValues);
    if (next.has(nextValue)) next.delete(nextValue);
    else next.add(nextValue);
    onChange(Array.from(next).join(','));
  }

  function clearSelection() {
    onChange('');
    setSearch('');
  }

  return (
    <div ref={ref} className="relative" style={{ minWidth }}>
      <p className="text-xs label-ui font-semibold mb-1" style={{ color: '#748070' }}>{label}</p>
      <button type="button" onClick={() => setOpen((prev) => !prev)} className="h-10 w-full px-3 rounded-xl text-sm font-semibold flex items-center justify-between gap-2" style={{ backgroundColor: 'var(--color-surface-container)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-full min-w-[340px] max-h-[390px] rounded-2xl p-2 z-30 animate-scaleIn" style={{ backgroundColor: '#ffffff', border: '1px solid #dde5d8', boxShadow: '0 12px 26px rgba(23,40,30,0.12)' }}>
          <div className="flex items-center gap-2 rounded-xl px-3 h-10 mb-2" style={{ backgroundColor: '#f6f8f4', border: '1px solid #dde5d8', color: '#4e5a4e' }}>
            <Search size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar cliente ou código"
              className="w-full bg-transparent outline-none text-sm font-medium"
              style={{ color: 'var(--color-text)' }}
            />
          </div>
          <div className="flex items-center justify-between gap-2 px-1 pb-2">
            <span className="text-xs font-semibold" style={{ color: '#748070' }}>{selectedValues.length} selecionado(s)</span>
            {selectedValues.length > 0 ? (
              <button type="button" onClick={clearSelection} className="inline-flex items-center gap-1 text-xs font-bold rounded-lg px-2 py-1" style={{ color: '#1f6f39', backgroundColor: '#eef6ed' }}>
                <X size={12} /> Limpar
              </button>
            ) : null}
          </div>
          <div className="max-h-[285px] overflow-auto pr-1">
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-4 text-sm font-medium" style={{ color: '#748070' }}>Nenhum cliente encontrado.</p>
            ) : filteredOptions.map((option) => {
              const selected = selectedSet.has(option.value);
              return (
                <button key={`${label}-${option.value}`} type="button" onClick={() => toggleValue(option.value)} className="w-full text-left rounded-xl px-3 py-2 text-sm flex items-start gap-2" style={{ backgroundColor: selected ? '#dfeadf' : 'transparent', color: selected ? '#1f6f39' : '#4e5a4e', fontWeight: selected ? 700 : 500 }}>
                  <span className="mt-0.5 h-4 w-4 rounded-md shrink-0 inline-flex items-center justify-center" style={{ border: selected ? '1px solid #1f6f39' : '1px solid #cbd7c7', backgroundColor: selected ? '#1f6f39' : '#ffffff', color: '#ffffff' }}>
                    {selected ? <Check size={12} /> : null}
                  </span>
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value, helper, icon, tone = 'green' }: { label: string; value: string; helper: string; icon: ReactNode; tone?: 'green' | 'blue' | 'amber' | 'purple' }) {
  const tones = {
    green: { bg: 'var(--kpi-bg-green)', color: 'var(--color-primary)', border: 'var(--color-primary)' },
    blue: { bg: 'var(--kpi-bg-blue)', color: '#2d5cc5', border: '#2d5cc5' },
    amber: { bg: 'var(--kpi-bg-amber)', color: '#a46a18', border: '#a46a18' },
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

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section className="rounded-[26px] overflow-hidden analytics-soft-card" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}>
      <div className="px-6 py-5 border-b" style={{ borderColor: '#edf0eb' }}>
        <h2 className="font-display text-[26px] leading-tight font-extrabold" style={{ color: 'var(--color-text)' }}>{title}</h2>
        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

export default function FaturamentoDiretoriaPage() {
  const initial = currentPeriod();
  const [loadingPermissao, setLoadingPermissao] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [permissao, setPermissao] = useState<PermissaoRow | null>(null);
  const [filters, setFilters] = useState<Filters>({ mes: initial.mes, ano: initial.ano, codSupervisor: '', codfilial: '', codRca: '', codCli: '', codProd: '' });
  const [appliedFilters, setAppliedFilters] = useState<Filters>({ mes: initial.mes, ano: initial.ano, codSupervisor: '', codfilial: '', codRca: '', codCli: '', codProd: '' });
  const [filterOptions, setFilterOptions] = useState<{ coordenadores: Option[]; filiais: Option[]; vendedores: Option[]; clientes: Option[]; produtos: Option[] }>({ coordenadores: [], filiais: [], vendedores: [], clientes: [], produtos: [] });
  const [data, setData] = useState<PageData>(EMPTY_DATA);

  const podeAcessar = Number(permissao?.PODE_ACESSAR || 0) === 1;
  const yearOptions = useMemo(() => {
    const base = Number(initial.ano);
    return Array.from({ length: 7 }, (_, index) => String(base - 3 + index)).map((year) => ({ value: year, label: year }));
  }, [initial.ano]);

  async function loadFilters(nextFilters = filters) {
    const rows = await callSF(SF.faturamentoDiretoriaFiltros, inputFromFilters(nextFilters));
    const byTipo = (tipo: string) => dedupeOptions(rows
      .filter((row) => row.TIPO === tipo)
      .map((row) => ({ value: String(row.VALUE), label: String(row.LABEL || row.VALUE) })));
    // Cliente e produto: nomes diferentes podem coincidir, entao o codigo entra
    // no rotulo para o usuario conseguir distinguir registros homonimos.
    const byTipoComCodigo = (tipo: string) => dedupeOptions(rows
      .filter((row) => row.TIPO === tipo)
      .map((row) => {
        const value = String(row.VALUE);
        const nome = String(row.LABEL || value).trim();
        return { value, label: nome && nome !== value ? `${nome} · Cód. ${value}` : value };
      }));

    setFilterOptions({
      coordenadores: [{ value: '', label: 'Todos os coordenadores' }, ...byTipo('COORDENADOR')],
      filiais: [{ value: '', label: 'Todas as filiais' }, ...byTipo('FILIAL')],
      vendedores: [{ value: '', label: 'Todos os vendedores' }, ...byTipo('VENDEDOR')],
      clientes: [{ value: '', label: 'Todos os clientes' }, ...byTipoComCodigo('CLIENTE').slice(0, 250)],
      produtos: [{ value: '', label: 'Todos os produtos' }, ...byTipoComCodigo('PRODUTO').slice(0, 250)],
    });
  }

  async function loadData(nextFilters = filters) {
    setLoadingData(true);
    const input = inputFromFilters(nextFilters);
    const [resumo, coordenadores, filiais, vendedores, produtos, clientes, detalhe] = await Promise.all([
      callSFWithMeta(SF.faturamentoDiretoriaResumo, input),
      callSFWithMeta(SF.faturamentoDiretoriaCoordenadores, input),
      callSFWithMeta(SF.faturamentoDiretoriaFiliais, input),
      callSFWithMeta(SF.faturamentoDiretoriaVendedores, input),
      callSFWithMeta(SF.faturamentoDiretoriaProdutos, input),
      callSFWithMeta(SF.faturamentoDiretoriaClientes, input),
      callSFWithMeta(SF.faturamentoDiretoriaDetalhe, input),
    ]);
    const errors = [resumo, coordenadores, filiais, vendedores, produtos, clientes, detalhe].map((result) => result.error).filter((error): error is string => Boolean(error));
    setData({
      resumo: (resumo.rows[0] as ResumoRow) || null,
      coordenadores: coordenadores.rows as CoordenadorRow[],
      filiais: filiais.rows as FilialRow[],
      vendedores: vendedores.rows as VendedorRow[],
      produtos: produtos.rows as ProdutoRow[],
      clientes: clientes.rows as ClienteRow[],
      detalhe: detalhe.rows as DetalheRow[],
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
      setPermissao(row as PermissaoRow | null);
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

  const resumo = data.resumo || ({} as ResumoRow);
  const periodLabel = `${MONTHS.find((month) => month.value === appliedFilters.mes)?.label || appliedFilters.mes}/${appliedFilters.ano}`;

  const coordenadorChartData = data.coordenadores.slice(0, 12).map((row) => ({ name: chartLabel(row.COORDENADOR), value: toNumber(row.FATURAMENTO), codSupervisor: String(row.COD_SUPERVISOR || '') }));
  const filialChartData = data.filiais.slice(0, 12).map((row) => ({ name: chartLabel(row.FILIAL), value: toNumber(row.FATURAMENTO), codfilial: String(row.CODFILIAL || '') }));
  const vendedorChartData = data.vendedores.slice(0, 12).map((row) => ({ name: chartLabel(row.VENDEDOR), value: toNumber(row.FATURAMENTO), codRca: String(row.COD_RCA || '') }));
  const produtoChartData = data.produtos.slice(0, 12).map((row) => ({ name: chartLabel(row.PRODUTO, 28), value: toNumber(row.FATURAMENTO), codProd: String(row.CODPROD || '') }));
  const clienteChartData = data.clientes.slice(0, 12).map((row) => ({ name: chartLabel(row.CLIENTE, 28), value: toNumber(row.FATURAMENTO), codCli: String(row.CODCLI || '') }));

  const detalheRows = data.detalhe.map((row) => ({
    COORDENADOR: row.COORDENADOR,
    VENDEDOR: row.VENDEDOR,
    FILIAL: row.FILIAL,
    CLIENTE: `${row.CODCLI} · ${row.CLIENTE}`,
    PRODUTO: `${row.CODPROD} · ${row.PRODUTO}`,
    DEPARTAMENTO: row.DEPARTAMENTO,
    SECAO: row.SECAO,
    FATURAMENTO: formatCurrency(toNumber(row.FATURAMENTO)),
    QTD_ITENS: formatInteger(row.QTD_ITENS),
    QTD_PEDIDOS: formatInteger(row.QTD_PEDIDOS),
  }));

  function updateAndLoad(next: Filters) {
    setFilters(next);
    void loadFilters(next);
    void loadData(next);
  }

  if (loadingPermissao) {
    return <div className="rounded-3xl p-6 analytics-soft-card" style={{ backgroundColor: '#ffffff' }}>Carregando permissões...</div>;
  }

  if (!podeAcessar) {
    return (
      <div className="rounded-3xl p-6 analytics-soft-card" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}>
        <h1 className="font-display text-3xl font-extrabold" style={{ color: 'var(--color-text)' }}>Acesso restrito</h1>
        <p className="mt-2" style={{ color: 'var(--color-text-secondary)' }}>Esta rota é exclusiva para Diretoria e administradores.</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-5 analytics-page mx-auto max-w-[1320px]">
      <div className="rounded-[30px] analytics-hero px-6 py-5 flex items-center justify-between gap-5 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#137432', color: '#ffffff' }}>
            <ReceiptText size={24} />
          </div>
          <div>
            <p className="text-[11px] label-ui font-bold" style={{ color: '#137432' }}>Diretoria Comercial</p>
            <h1 className="font-display text-[34px] leading-none font-extrabold tracking-[0.04em]" style={{ color: 'var(--color-text)' }}>FATURAMENTO</h1>
            <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>Visão única por filial, coordenadores, vendedores, produtos vendidos e clientes, respeitando filial, departamento e seção do escopo.</p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 px-4 py-3 rounded-full text-sm font-semibold" style={{ backgroundColor: '#eef2eb', color: '#516153' }}>
          <BarChart3 size={18} /> {periodLabel}
        </div>
      </div>

      <section className="sticky top-3 z-20 rounded-[26px] p-4 analytics-soft-card" style={{ backgroundColor: 'rgba(255, 255, 255, 0.96)', border: '1px solid #edf0eb', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Filter size={18} style={{ color: 'var(--color-primary)' }} />
          <h2 className="font-display text-lg font-extrabold" style={{ color: 'var(--color-text)' }}>Filtros de faturamento</h2>
          {loadingData ? <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--color-primary)' }}><Loader2 size={14} className="animate-spin" /> Atualizando</span> : null}
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <DropdownFilter label="Mês" value={filters.mes} options={MONTHS} onChange={(mes) => setFilters((current) => ({ ...current, mes }))} minWidth={150} />
          <DropdownFilter label="Ano" value={filters.ano} options={yearOptions} onChange={(ano) => setFilters((current) => ({ ...current, ano }))} minWidth={130} />
          <DropdownFilter label="Coordenador" value={filters.codSupervisor} options={filterOptions.coordenadores} onChange={(codSupervisor) => setFilters((current) => ({ ...current, codSupervisor, codRca: '' }))} minWidth={240} />
          <DropdownFilter label="Filial" value={filters.codfilial} options={filterOptions.filiais} onChange={(codfilial) => setFilters((current) => ({ ...current, codfilial }))} minWidth={180} />
          <DropdownFilter label="Vendedor" value={filters.codRca} options={filterOptions.vendedores} onChange={(codRca) => setFilters((current) => ({ ...current, codRca }))} minWidth={240} />
          <MultiSelectFilter label="Cliente" value={filters.codCli} options={filterOptions.clientes} onChange={(codCli) => setFilters((current) => ({ ...current, codCli }))} minWidth={300} />
          <DropdownFilter label="Produto" value={filters.codProd} options={filterOptions.produtos} onChange={(codProd) => setFilters((current) => ({ ...current, codProd }))} minWidth={300} />
          <button type="button" disabled={loadingData} onClick={() => updateAndLoad(filters)} className="h-10 px-5 rounded-xl font-bold inline-flex items-center gap-2 mt-5 disabled:opacity-70" style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}>
            {loadingData ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            Atualizar
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

      <Section title="Resumo do Faturamento" subtitle="Indicadores consolidados para o período e filtros aplicados.">
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard label="Faturamento" value={formatCurrency(toNumber(resumo.FATURAMENTO))} helper={`${formatInteger(resumo.QTD_PEDIDOS)} pedidos no período.`} icon={<TrendingUp size={20} />} tone="green" />
          <MetricCard label="Ticket médio" value={formatCurrency(toNumber(resumo.TICKET_MEDIO))} helper={`${formatInteger(resumo.QTD_CLIENTES)} clientes com compra.`} icon={<ShoppingBag size={20} />} tone="blue" />
          <MetricCard label="Produtos vendidos" value={formatInteger(resumo.QTD_PRODUTOS)} helper={`${formatInteger(resumo.QTD_ITENS)} unidades faturadas.`} icon={<Boxes size={20} />} tone="amber" />
          <MetricCard label="Time comercial" value={formatInteger(resumo.QTD_VENDEDORES)} helper={`${formatInteger(resumo.QTD_COORDENADORES)} coordenadores em ${formatInteger(resumo.QTD_FILIAIS)} filiais.`} icon={<Users size={20} />} tone="purple" />
        </div>
      </Section>

      <Section title="Rankings Comerciais" subtitle="Clique nas barras para aplicar o filtro correspondente na página.">
        <div className="p-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartContainer title="Filiais" subtitle="Faturamento separado por filial.">
            <ShadcnBarChart data={filialChartData} xKey="name" layout="vertical" height={Math.max(240, filialChartData.length * 42)} bars={[{ dataKey: 'value', name: 'Faturamento', color: '#6f3db3' }]} formatter={(value) => formatCurrency(Number(value))} onBarClick={(item) => updateAndLoad({ ...filters, codfilial: item.codfilial })} />
          </ChartContainer>
          <ChartContainer title="Coordenadores" subtitle="Faturamento por coordenação.">
            <ShadcnBarChart data={coordenadorChartData} xKey="name" layout="vertical" height={Math.max(240, coordenadorChartData.length * 42)} bars={[{ dataKey: 'value', name: 'Faturamento', color: 'var(--color-primary)' }]} formatter={(value) => formatCurrency(Number(value))} onBarClick={(item) => updateAndLoad({ ...filters, codSupervisor: item.codSupervisor, codRca: '' })} />
          </ChartContainer>
          <ChartContainer title="Vendedores" subtitle="Faturamento por vendedor.">
            <ShadcnBarChart data={vendedorChartData} xKey="name" layout="vertical" height={Math.max(280, vendedorChartData.length * 42)} bars={[{ dataKey: 'value', name: 'Faturamento', color: '#2d5cc5' }]} formatter={(value) => formatCurrency(Number(value))} onBarClick={(item) => updateAndLoad({ ...filters, codRca: item.codRca })} />
          </ChartContainer>
          <ChartContainer title="Produtos" subtitle="Produtos vendidos por valor faturado.">
            <ShadcnBarChart data={produtoChartData} xKey="name" layout="vertical" height={Math.max(280, produtoChartData.length * 42)} bars={[{ dataKey: 'value', name: 'Faturamento', color: '#a46a18' }]} formatter={(value) => formatCurrency(Number(value))} onBarClick={(item) => updateAndLoad({ ...filters, codProd: item.codProd })} />
          </ChartContainer>
          <ChartContainer title="Clientes" subtitle="Clientes com maior faturamento.">
            <ShadcnBarChart data={clienteChartData} xKey="name" layout="vertical" height={Math.max(280, clienteChartData.length * 42)} bars={[{ dataKey: 'value', name: 'Faturamento', color: '#6f3db3' }]} formatter={(value) => formatCurrency(Number(value))} onBarClick={(item) => updateAndLoad({ ...filters, codCli: item.codCli })} />
          </ChartContainer>
        </div>
      </Section>

      <Section title="Detalhamento" subtitle="Base granular por coordenador, vendedor, cliente e produto vendido.">
        <div className="p-5">
          <div className="validation-hot-wrapper analytics-detail-table rounded-2xl">
            <HotTable
              data={detalheRows}
              columns={[{ data: 'COORDENADOR', width: 180 }, { data: 'VENDEDOR', width: 180 }, { data: 'FILIAL', width: 110 }, { data: 'CLIENTE', width: 260 }, { data: 'PRODUTO', width: 300 }, { data: 'DEPARTAMENTO', width: 180 }, { data: 'SECAO', width: 160 }, { data: 'FATURAMENTO', width: 140 }, { data: 'QTD_ITENS', width: 100 }, { data: 'QTD_PEDIDOS', width: 110 }]}
              colHeaders={['Coordenador', 'Vendedor', 'Filial', 'Cliente', 'Produto', 'Departamento', 'Seção', 'Faturamento', 'Qtd. itens', 'Pedidos']}
              rowHeaders={false}
              height={520}
              width="100%"
              stretchH="all"
              manualColumnResize
              columnSorting={{ indicator: true, headerAction: true }}
              readOnly
              licenseKey="non-commercial-and-evaluation"
              className="ht-theme-main"
            />
          </div>
        </div>
      </Section>

      <div className="rounded-3xl p-4 flex items-center gap-2 text-sm" style={{ backgroundColor: '#eef2eb', color: '#526052' }}>
        <PackageSearch size={16} /> A rota usa o faturamento importado localmente e limita a tabela detalhada aos 500 maiores agrupamentos do período para manter a navegação rápida.
      </div>
    </div>
  );
}
