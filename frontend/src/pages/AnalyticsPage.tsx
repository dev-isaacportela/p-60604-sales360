import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { HotTable } from '@handsontable/react-wrapper';
import { registerAllModules } from 'handsontable/registry';
import 'handsontable/styles/handsontable.min.css';
import 'handsontable/styles/ht-theme-main.min.css';
import {
  AlertTriangle,
  BarChart3,
  Banknote,
  CalendarRange,
  ChevronDown,
  Edit3,
  Download,
  Filter,
  Loader2,
  MapPin,
  MoreVertical,
  Package,
  Percent,
  RefreshCw,
  Save,
  Search,
  Target,
  TrendingUp,
  Undo2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { callSFWithMeta, formatCurrency, getBrasiliaDate, SF } from '../hooks/useMitra';
import { normalizeCurrencyInput, parseCurrencyInput } from './metas.utils';
import { ChartContainer, ShadcnBarChart, ShadcnComposedChart, ShadcnPieChart } from '../components/ui/Chart';
import { CoordinatorScopeFilter, useCoordinatorScope } from '../components/CoordinatorScopeFilter';
import { downloadExcelWorkbook, excelColumn } from '../lib/excel-export';

registerAllModules();

type PresetPeriodo = 'mes' | 'ultimos3' | 'ultimoAno' | 'customizado';
type AnalyticsTab = 'overview' | 'clientes' | 'produtos' | 'metas' | 'comparativo';
type ComparativoCategoria = 'Cliente' | 'Ramo' | 'Seção' | 'Produto' | 'Departamento';
type ComparativoMetrica = 'QTD' | 'Preço/Faturamento';
type CarteiraDetalheTipo = 'INATIVO' | 'RISCO';

interface ComparativoBlock {
  categoria: ComparativoCategoria;
  metrica: ComparativoMetrica;
  dataInicio: string;
  dataFim: string;
  busca: string;
  selecionados: string[];
}

interface ComparativoChartRow {
  name: string;
  value: number;
  fullName?: string;
  productCode?: unknown;
  customerCode?: unknown;
}

interface Option {
  value: string;
  label: string;
}

interface AnalyticsFilters {
  preset: PresetPeriodo;
  mes: string;
  ano: string;
  dataInicio: string;
  dataFim: string;
  filiais: string[];
  departamentos: string[];
  secoes: string[];
  ramos: string[];
  cliente: string;
}

interface AnalyticsData {
  meta: Record<string, unknown> | null;
  evolucao: Record<string, unknown>[];
  mix: Record<string, unknown>[];
  carteira: Record<string, unknown>[];
  topClientes: Record<string, unknown>[];
  visitas: Record<string, unknown>[];
  devolucoes: Record<string, unknown>[];
  errors: string[];
}

interface MetaBuRecebida {
  CODFILIAL: string | number;
  CODEPTO: string | number;
  DEPARTAMENTO?: string;
  UF?: string;
  META_DIRETORIA: number;
  META_UF_TOTAL?: number;
  META_UF_FILIAL?: number;
  META_OUTRAS_UF?: number;
  ORIGEM_META?: string;
  TOTAL_VENDEDORES: number;
  VENDEDORES_COM_META: number;
  PERCENTUAL_DISTRIBUIDO: number;
}

interface MetaVendedorBu {
  CODFILIAL: string | number;
  CODEPTO: string | number;
  VENDEDOR_ID: number;
  COD_RCA: number;
  RCA: string;
  META_VALOR: number;
  REALIZADO_LIQUIDO: number;
  PERCENTUAL_META: number;
  QTD_PEDIDOS: number;
}

// A distribuicao por ramo/UF e por VENDEDOR + BU (CODEPTO) — nao por filial.
// A SF rateia a meta total do vendedor sobre a base de planejamento, que nao
// tem filial no agrupamento. Carimbar filial aqui fazia a mesma linha ser
// contada uma vez por filial do vendedor.
interface MetaVendedorRamoUf {
  CODEPTO: string | number;
  VENDEDOR_ID: number;
  COD_RCA: number;
  RCA: string;
  BU_CODE: string;
  UF: string;
  RAMO_CODE: string;
  RAMO_NOME: string;
  META_BASE_RITMO: number;
  META_VENDEDOR_TOTAL: number;
  PERCENTUAL_DISTRIBUICAO: number;
  META_VENDEDOR_RAMO_UF: number;
  PERSONALIZADO: number;
  PLANEJADO: number;
  FATURAMENTO_BRUTO: number;
  DEVOLVIDO: number;
  FATURAMENTO_LIQUIDO: number;
  PERCENTUAL_META: number;
}

const PAGE_SIZE = 50;
const PERIOD_OPTIONS: Option[] = [
  { value: 'mes', label: 'Último mês' },
  { value: 'ultimos3', label: 'Último trimestre' },
  { value: 'ultimoAno', label: 'Último ano' },
  { value: 'customizado', label: 'Intervalo personalizado' },
];

const MONTH_OPTIONS: Option[] = [
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

const ANALYTICS_TABS: { value: AnalyticsTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'clientes', label: 'Clientes' },
  { value: 'produtos', label: 'Produtos' },
  { value: 'metas', label: 'Metas' },
  { value: 'comparativo', label: 'Modular' },
];

const COMPARATIVO_CATEGORIAS: Option[] = ['Cliente', 'Ramo', 'Seção', 'Produto', 'Departamento'].map((value) => ({ value, label: value }));
const COMPARATIVO_METRICAS: Option[] = ['QTD', 'Preço/Faturamento'].map((value) => ({ value, label: value }));
const VISITA_TIPO_CORES = ['var(--color-primary)', '#2d5cc5', '#a46a18', '#6f3db3', '#d92d20', '#0f766e'];
const FORNECEDOR_CORES = ['var(--color-primary)', '#2d5cc5', '#a46a18', '#6f3db3', '#0f766e', '#b45309', '#475569', '#d92d20'];

const emptyData: AnalyticsData = {
  meta: null,
  evolucao: [],
  mix: [],
  carteira: [],
  topClientes: [],
  visitas: [],
  devolucoes: [],
  errors: [],
};

function toNumber(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function dateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function addMonths(year: number, month: number, delta: number) {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function businessDaysBetween(startIso: string, endIso: string): number {
  if (!isIsoDate(startIso) || !isIsoDate(endIso)) return 0;
  const start = dateFromIso(startIso);
  const end = dateFromIso(endIso);
  if (start > end) return 0;

  let total = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) total += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return total;
}

function calendarDaysBetween(startIso: string, endIso: string): number {
  if (!isIsoDate(startIso) || !isIsoDate(endIso)) return 0;
  const start = dateFromIso(startIso);
  const end = dateFromIso(endIso);
  if (start > end) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function minIsoDate(a: string, b: string): string {
  return dateFromIso(a) <= dateFromIso(b) ? a : b;
}

function formatDateBr(value?: string): string {
  const raw = String(value || '').slice(0, 10);
  if (!isIsoDate(raw)) return 'Sem data';
  const [year, month, day] = raw.split('-');
  return `${day}/${month}/${year}`;
}

function isoToDateInputBr(value: string): string {
  return isIsoDate(value) ? formatDateBr(value) : value;
}

function dateInputBrToIso(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return trimmed;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function formatDecimal(value: unknown, digits = 0): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toNumber(value));
}

function formatPercent(value: unknown): string {
  return `${formatDecimal(value, 1)}%`;
}

function formatEditablePercent(value: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatEditableCurrencyValue(value: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

function chartLabel(value: unknown, maxLength = 20): string {
  const label = String(value || 'Sem nome').replace(/\s+/g, ' ').trim();
  if (label.length <= maxLength) return label;
  const sliced = label.slice(0, maxLength - 1).trimEnd();
  const lastSpace = sliced.lastIndexOf(' ');
  const base = lastSpace > 8 ? sliced.slice(0, lastSpace) : sliced;
  return `${base}...`;
}

function fullChartName(value: unknown): string {
  return String(value || 'Sem nome').replace(/\s+/g, ' ').trim();
}

function chartDatum(value: unknown, metricValue: number, maxLength = 22, extra: Record<string, unknown> = {}) {
  const fullName = fullChartName(value);
  return {
    name: chartLabel(fullName, maxLength),
    fullName,
    value: metricValue,
    ...extra,
  };
}

function normalizeSearch(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function comparativoSearchPlaceholder(categoria: ComparativoCategoria): string {
  const placeholders: Record<ComparativoCategoria, string> = {
    Cliente: 'Pesquisar cliente ou código',
    Produto: 'Pesquisar produto ou código',
    Ramo: 'Pesquisar ramo',
    Seção: 'Pesquisar seção',
    Departamento: 'Pesquisar departamento',
  };
  return placeholders[categoria];
}

function comparativoRowId(row: ComparativoChartRow): string {
  return [row.fullName || row.name, row.productCode || '', row.customerCode || ''].map(String).join('::');
}

function comparativoRowLabel(row: ComparativoChartRow): string {
  const code = row.productCode || row.customerCode;
  return code ? `${row.fullName || row.name} · ${code}` : String(row.fullName || row.name);
}

function matchesComparativoSearch(row: ComparativoChartRow, busca: string) {
  const term = normalizeSearch(busca);
  if (!term) return true;
  return [row.name, row.fullName, row.productCode, row.customerCode]
    .some((value) => normalizeSearch(value).includes(term));
}

function filterComparativoData(rows: ComparativoChartRow[], selecionados: string[]) {
  if (selecionados.length === 0) return rows;
  const selectedSet = new Set(selecionados);
  return rows.filter((row) => selectedSet.has(comparativoRowId(row)));
}

function comparativoSearchResults(rows: ComparativoChartRow[], busca: string, selecionados: string[]) {
  const selectedSet = new Set(selecionados);
  return rows
    .filter((row) => !selectedSet.has(comparativoRowId(row)))
    .filter((row) => matchesComparativoSearch(row, busca))
    .slice(0, 8);
}

const COMPARATIVO_BLOCO_CORES = ['FF156B16', 'FF2D5CC5', 'FFA46A18', 'FF6F3DB3'];
const COMPARATIVO_VARIACAO_COR = 'FF52605A';

function comparativoMetricaLabel(metrica: ComparativoMetrica): string {
  return metrica === 'QTD' ? 'Quantidade' : 'Faturamento';
}

function comparativoUnidadeLabel(metrica: ComparativoMetrica): string {
  return metrica === 'QTD' ? 'Qtd' : 'R$';
}

function comparativoPeriodoLabel(block: ComparativoBlock): string {
  return `${formatDateBr(block.dataInicio)} a ${formatDateBr(block.dataFim)}`;
}

function isoToDate(value?: string): Date | null {
  const raw = String(value || '').slice(0, 10);
  if (!isIsoDate(raw)) return null;
  const [year, month, day] = raw.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function optionListLabel(options: Option[], values: string[], emptyLabel = 'Todos'): string {
  if (values.length === 0) return emptyLabel;
  return values.map((value) => optionLabel(options, value)).join(', ');
}

function createDefaultFilters(): AnalyticsFilters {
  const [year, month] = getBrasiliaDate().split('-').map(Number);
  return {
    preset: 'mes',
    mes: String(month),
    ano: String(year),
    dataInicio: isoDate(year, month, 1),
    dataFim: isoDate(year, month, lastDayOfMonth(year, month)),
    filiais: [],
    departamentos: [],
    secoes: [],
    ramos: [],
    cliente: '',
  };
}

function resolvePeriod(filters: AnalyticsFilters) {
  const todayIso = getBrasiliaDate();
  const [todayYear, todayMonth] = todayIso.split('-').map(Number);
  const selectedYear = Number(filters.ano) || todayYear;
  const selectedMonth = Number(filters.mes) || todayMonth;

  if (filters.preset === 'customizado') {
    return {
      dataInicio: isIsoDate(filters.dataInicio) ? filters.dataInicio : isoDate(selectedYear, selectedMonth, 1),
      dataFim: isIsoDate(filters.dataFim) ? filters.dataFim : isoDate(selectedYear, selectedMonth, lastDayOfMonth(selectedYear, selectedMonth)),
    };
  }

  if (filters.preset === 'ultimos3' || filters.preset === 'ultimoAno') {
    const monthsBack = filters.preset === 'ultimos3' ? -2 : -11;
    const start = addMonths(todayYear, todayMonth, monthsBack);
    return {
      dataInicio: isoDate(start.year, start.month, 1),
      dataFim: isoDate(todayYear, todayMonth, lastDayOfMonth(todayYear, todayMonth)),
    };
  }

  return {
    dataInicio: isoDate(selectedYear, selectedMonth, 1),
    dataFim: isoDate(selectedYear, selectedMonth, lastDayOfMonth(selectedYear, selectedMonth)),
  };
}

function inputFromFilters(filters: AnalyticsFilters, limit = PAGE_SIZE, page = 0) {
  const period = resolvePeriod(filters);
  return {
    ...period,
    filiais: filters.filiais.join('|'),
    departamentos: filters.departamentos.join('|'),
    secoes: filters.secoes.join('|'),
    ramos: filters.ramos.join('|'),
    cliente: filters.cliente,
    limit,
    offset: page * limit,
  };
}

function vendedorBuKey(row: Pick<MetaVendedorBu, 'CODFILIAL' | 'CODEPTO' | 'VENDEDOR_ID'>): string {
  return `${row.CODFILIAL}::${row.CODEPTO}::${row.VENDEDOR_ID}`;
}

function vendedorRamoUfKey(row: Pick<MetaVendedorRamoUf, 'CODEPTO' | 'VENDEDOR_ID' | 'RAMO_CODE' | 'UF'>): string {
  return `${row.CODEPTO}::${row.VENDEDOR_ID}|${String(row.RAMO_CODE || 'SEM_RAMO')}|${String(row.UF || 'NAO_INFORMADO')}`;
}

/** A meta rateada por ramo/UF e a meta TOTAL do vendedor no periodo, somando as BUs. */
function vendedorTotalKey(row: { VENDEDOR_ID: number | string }): string {
  return String(row.VENDEDOR_ID);
}

function normalizePercentInput(value: string): string {
  const cleaned = String(value || '0').replace('%', '').trim();
  if (cleaned.includes(',')) return cleaned.replace(/\./g, '').replace(',', '.') || '0';
  return cleaned || '0';
}

function buKey(codfilial: string | number, codepto: string | number): string {
  return `${codfilial}::${codepto}`;
}

function initialsFromName(value: unknown): string {
  const parts = String(value || 'Sem nome').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'SN';
  return `${parts[0]?.[0] || ''}${parts.length > 1 ? parts[parts.length - 1]?.[0] || '' : parts[0]?.[1] || ''}`.toUpperCase();
}

function optionLabel(options: Option[], value: string): string {
  if (!value) return 'Todos da carteira';
  return options.find((option) => option.value === value)?.label || value;
}

function selectedValues(value: string): string[] {
  return value.split('|').map((item) => item.trim()).filter(Boolean);
}

function multiOptionLabel(options: Option[], value: string, emptyLabel = 'Todos da carteira'): string {
  const values = selectedValues(value);
  if (values.length === 0) return emptyLabel;
  if (values.length === 1) return optionLabel(options, values[0]);
  return `${values.length} clientes selecionados`;
}

function uniqueOptions(options: Option[]): Option[] {
  const map = new Map<string, Option>();
  options.forEach((option) => {
    if (!option.value) return;
    const current = map.get(option.value);
    if (!current || current.label === option.value || current.label.startsWith('Seção ')) {
      map.set(option.value, option);
    }
  });
  return Array.from(map.values());
}

function clienteOption(row: Record<string, unknown>): Option {
  const value = String(row.VALUE || '').trim();
  const label = String(row.LABEL || value).trim();
  const cleanLabel = label.replace(new RegExp(`^${value}\\s*[·\\-–—:]\\s*`), '').replace(new RegExp(`\\s*[·\\-–—:]\\s*C[oó]d\\.?\\s*${value}$`, 'i'), '').trim();
  return { value, label: value && cleanLabel && cleanLabel !== value ? `${value} · ${cleanLabel}` : value || cleanLabel };
}

function Section({ title, subtitle, action, children, warm = false }: { title: string; subtitle: string; action?: ReactNode; children: ReactNode; warm?: boolean }) {
  return (
    <section
      className="rounded-[26px] overflow-hidden analytics-soft-card"
      style={{ backgroundColor: warm ? '#fff8f1' : '#ffffff', border: warm ? '1px solid #f0dfcc' : '1px solid #edf0eb' }}
    >
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

function MetricCard({ label, value, helper, icon, tone = 'green', onClick }: { label: string; value: string; helper: string; icon: ReactNode; tone?: 'green' | 'blue' | 'amber' | 'red' | 'purple'; onClick?: () => void }) {
  const tones = {
    green: { bg: 'var(--kpi-bg-green)', color: 'var(--color-primary)', border: 'var(--color-primary)' },
    blue: { bg: 'var(--kpi-bg-blue)', color: '#2d5cc5', border: '#2d5cc5' },
    amber: { bg: 'var(--kpi-bg-amber)', color: '#a46a18', border: '#a46a18' },
    red: { bg: '#fff1f0', color: '#b42318', border: '#d92d20' },
    purple: { bg: 'var(--kpi-bg-purple)', color: '#6f3db3', border: '#6f3db3' },
  }[tone];

  const content = (
    <>
      <div className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: tones.border }} />
      <div className="flex items-start gap-3">
        <div className="rounded-full p-2 shrink-0" style={{ backgroundColor: tones.bg, color: tones.color }}>{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] label-ui font-semibold" style={{ color: '#8c9489' }}>{label}</p>
          <p className="text-[25px] leading-tight font-extrabold mt-1" style={{ color: 'var(--color-text)' }}>{value}</p>
          <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>{helper}</p>
        </div>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded-[22px] p-4 analytics-soft-card relative overflow-hidden text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2"
        style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb', '--tw-ring-color': tones.border } as CSSProperties}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="rounded-[22px] p-4 analytics-soft-card relative overflow-hidden" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}>
      {content}
    </div>
  );
}

function SingleSelect({ label, value, options, onChange, disabled = false }: { label: string; value: string; options: Option[]; onChange: (value: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  return (
    <div ref={ref} className="relative min-w-[180px]">
      <p className="text-xs label-ui font-semibold mb-1" style={{ color: '#748070' }}>{label}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="h-10 w-full px-3 rounded-xl flex items-center justify-between gap-2 text-sm font-semibold disabled:opacity-50"
        style={{ backgroundColor: 'var(--color-surface-container)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
      >
        <span className="truncate">{optionLabel(options, value)}</span>
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="absolute z-30 mt-2 w-full rounded-2xl p-1 ambient-float max-h-64 overflow-auto" style={{ backgroundColor: '#ffffff', border: '1px solid #e3e8de' }}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold transition-colors"
              style={{ backgroundColor: option.value === value ? 'var(--color-primary-bg)' : 'transparent', color: option.value === value ? 'var(--color-primary)' : 'var(--color-text)' }}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MultiSelect({ label, options, selected, onChange, placeholder }: { label: string; options: Option[]; selected: string[]; onChange: (next: string[]) => void; placeholder: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedOptions = options.filter((option) => selected.includes(option.value));

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  }

  return (
    <div ref={ref} className="relative min-w-[220px]">
      <p className="text-xs label-ui font-semibold mb-1" style={{ color: '#748070' }}>{label}</p>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="h-10 w-full px-3 rounded-xl flex items-center justify-between gap-2 text-sm font-semibold"
        style={{ backgroundColor: 'var(--color-surface-container)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
      >
        <span className="truncate">{selectedOptions.length ? `${selectedOptions.length} selecionado(s)` : placeholder}</span>
        <ChevronDown size={16} />
      </button>
      {selectedOptions.length > 0 ? (
        <div className="flex flex-wrap gap-1 mt-2">
          {selectedOptions.slice(0, 3).map((option) => (
            <span key={option.value} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
              {option.label}
              <button type="button" onClick={() => toggle(option.value)} aria-label={`Remover ${option.label}`}><X size={12} /></button>
            </span>
          ))}
          {selectedOptions.length > 3 ? <span className="px-2 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: '#eef2eb', color: '#596457' }}>+{selectedOptions.length - 3}</span> : null}
        </div>
      ) : null}
      {open ? (
        <div className="absolute z-30 mt-2 w-full rounded-2xl p-2 ambient-float max-h-72 overflow-auto" style={{ backgroundColor: '#ffffff', border: '1px solid #e3e8de' }}>
          {selected.length > 0 ? (
            <button type="button" className="w-full text-left px-3 py-2 rounded-xl text-xs label-ui font-semibold" style={{ color: '#b42318' }} onClick={() => onChange([])}>Limpar seleção</button>
          ) : null}
          {options.length === 0 ? <p className="px-3 py-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Nenhuma opção disponível</p> : null}
          {options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <button key={option.value} type="button" className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-2" onClick={() => toggle(option.value)}>
                <span className="h-4 w-4 rounded-md flex items-center justify-center" style={{ backgroundColor: checked ? 'var(--color-primary)' : '#ffffff', border: checked ? '1px solid var(--color-primary)' : '1px solid #cdd6c8' }}>
                  {checked ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                </span>
                <span style={{ color: checked ? 'var(--color-primary)' : 'var(--color-text)' }}>{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function SearchableMultiSelect({ label, options, value, onChange, placeholder, disabled = false }: { label: string; options: Option[]; value: string; onChange: (next: string) => void; placeholder: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = selectedValues(value);
  const selectedSet = new Set(selected);
  const selectedOptions = options.filter((option) => option.value && selectedSet.has(option.value));
  const term = normalizeSearch(search);
  const searchableOptions = options.filter((option) => option.value);
  const visibleOptions = searchableOptions
    .filter((option) => !term || normalizeSearch(`${option.label} ${option.value}`).includes(term))
    .slice(0, 120);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  function toggle(nextValue: string) {
    const next = new Set(selected);
    if (next.has(nextValue)) next.delete(nextValue);
    else next.add(nextValue);
    onChange(Array.from(next).join('|'));
  }

  return (
    <div ref={ref} className="relative min-w-[240px]">
      <p className="text-xs label-ui font-semibold mb-1" style={{ color: '#748070' }}>{label}</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="h-10 w-full px-3 rounded-xl flex items-center justify-between gap-2 text-sm font-semibold disabled:opacity-50"
        style={{ backgroundColor: 'var(--color-surface-container)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
      >
        <span className="truncate">{multiOptionLabel(options, value, placeholder)}</span>
        <ChevronDown size={16} />
      </button>
      {selectedOptions.length > 0 ? (
        <div className="flex flex-wrap gap-1 mt-2">
          {selectedOptions.slice(0, 2).map((option) => (
            <span key={option.value} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
              {option.label}
              <button type="button" onClick={() => toggle(option.value)} aria-label={`Remover ${option.label}`}><X size={12} /></button>
            </span>
          ))}
          {selected.length > 2 ? <span className="px-2 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: '#eef2eb', color: '#596457' }}>+{selected.length - 2}</span> : null}
        </div>
      ) : null}
      {open ? (
        <div className="absolute z-30 mt-2 w-full min-w-[320px] rounded-2xl p-2 ambient-float" style={{ backgroundColor: '#ffffff', border: '1px solid #e3e8de' }}>
          <div className="flex items-center gap-2 h-10 rounded-xl px-3 mb-2" style={{ backgroundColor: '#f6f8f4', border: '1px solid #dde5d8', color: '#4e5a4e' }}>
            <Search size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar cliente ou código"
              className="w-full bg-transparent outline-none text-sm font-medium"
              style={{ color: 'var(--color-text)' }}
            />
          </div>
          {selected.length > 0 ? (
            <button type="button" className="w-full text-left px-3 py-2 rounded-xl text-xs label-ui font-semibold" style={{ color: '#b42318' }} onClick={() => onChange('')}>Limpar seleção</button>
          ) : null}
          <div className="max-h-72 overflow-auto">
            {visibleOptions.length === 0 ? <p className="px-3 py-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Nenhum cliente encontrado.</p> : null}
            {visibleOptions.map((option) => {
              const checked = selectedSet.has(option.value);
              return (
                <button key={option.value} type="button" className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-2" onClick={() => toggle(option.value)}>
                  <span className="h-4 w-4 rounded-md flex items-center justify-center" style={{ backgroundColor: checked ? 'var(--color-primary)' : '#ffffff', border: checked ? '1px solid var(--color-primary)' : '1px solid #cdd6c8' }}>
                    {checked ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                  </span>
                  <span style={{ color: checked ? 'var(--color-primary)' : 'var(--color-text)' }}>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AnalyticsPage() {
  const coordinatorScope = useCoordinatorScope('analytics');
  const defaultFilters = useMemo(() => createDefaultFilters(), []);

  const [filters, setFilters] = useState<AnalyticsFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<AnalyticsFilters>(defaultFilters);
  const [filterOptions, setFilterOptions] = useState<{ filiais: Option[]; departamentos: Option[]; secoes: Option[]; ramos: Option[]; clientes: Option[] }>({ filiais: [], departamentos: [], secoes: [], ramos: [], clientes: [] });
  const [data, setData] = useState<AnalyticsData>(emptyData);
  const [loadingFilters, setLoadingFilters] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [devolucaoPage, setDevolucaoPage] = useState(0);
  const [filtrosMobileOpen, setFiltrosMobileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');
  const [comparativoBlocks, setComparativoBlocks] = useState<ComparativoBlock[]>(() => ([
    { categoria: 'Cliente', metrica: 'Preço/Faturamento', dataInicio: '2025-01-01', dataFim: '2025-03-31', busca: '', selecionados: [] },
    { categoria: 'Cliente', metrica: 'Preço/Faturamento', dataInicio: '2026-01-01', dataFim: '2026-03-31', busca: '', selecionados: [] },
  ]));
  const [comparativoData, setComparativoData] = useState<Record<number, ComparativoChartRow[]>>({});
  const [exportandoComparativo, setExportandoComparativo] = useState(false);
  const [loadingComparativo, setLoadingComparativo] = useState(false);
  const [metaMes, setMetaMes] = useState(defaultFilters.mes);
  const [metaAno, setMetaAno] = useState(defaultFilters.ano);
  const [metasBu, setMetasBu] = useState<MetaBuRecebida[]>([]);
  const [metaBuSelecionada, setMetaBuSelecionada] = useState('');
  const [metaUfSelecionada, setMetaUfSelecionada] = useState('');
  const [metaRamoSelecionado, setMetaRamoSelecionado] = useState('');
  const [metasVendedores, setMetasVendedores] = useState<MetaVendedorBu[]>([]);
  const [metasRamoUf, setMetasRamoUf] = useState<MetaVendedorRamoUf[]>([]);
  const [metaEdits, setMetaEdits] = useState<Record<string, string>>({});
  const [metaRamoPercentEdits, setMetaRamoPercentEdits] = useState<Record<string, string>>({});
  const [metaRamoValueEdits, setMetaRamoValueEdits] = useState<Record<string, string>>({});
  const [selectedMetaVendedorKey, setSelectedMetaVendedorKey] = useState<string | null>(null);
  const [loadingMetas, setLoadingMetas] = useState(false);
  const [salvandoMetas, setSalvandoMetas] = useState(false);
  const [metaStatusMsg, setMetaStatusMsg] = useState('');
  const [metaError, setMetaError] = useState('');
  const [metaSearch, setMetaSearch] = useState('');
  const metasCarregadasRef = useRef(false);
  const [carteiraDetalhe, setCarteiraDetalhe] = useState<{ tipo: CarteiraDetalheTipo; rows: Record<string, unknown>[] } | null>(null);
  const [loadingCarteiraDetalhe, setLoadingCarteiraDetalhe] = useState(false);
  const [clienteEvolucao, setClienteEvolucao] = useState<Record<string, unknown>[]>([]);
  const [loadingClienteEvolucao, setLoadingClienteEvolucao] = useState(false);
  const canSeeMetasTab = coordinatorScope.isCoordinatorScope || coordinatorScope.isDirectorScope;
  const canEditMetas = coordinatorScope.isCoordinatorScope && !coordinatorScope.isDirectorScope;

  const yearOptions = useMemo<Option[]>(() => {
    const currentYear = Number(getBrasiliaDate().slice(0, 4));
    return Array.from({ length: 4 }).map((_, index) => {
      const year = currentYear - 1 + index;
      return { value: String(year), label: String(year) };
    });
  }, []);

  const metaUfOptions = useMemo<Option[]>(() => {
    const ufs = Array.from(new Set(metasRamoUf.map((row) => String(row.UF || 'NAO_INFORMADO'))));
    return [
      { value: '', label: 'Todas as UFs' },
      ...ufs.sort((a, b) => a.localeCompare(b)).map((uf) => ({
        value: uf,
        label: uf === 'NAO_INFORMADO' ? 'Sem UF informada' : uf,
      })),
    ];
  }, [metasRamoUf]);

  const metaRamoOptions = useMemo<Option[]>(() => {
    const ramos = Array.from(new Map(metasRamoUf.map((row) => {
      const value = String(row.RAMO_CODE || 'SEM_RAMO');
      const label = String(row.RAMO_NOME || row.RAMO_CODE || 'Sem ramo');
      return [value, label];
    })));
    return [
      { value: '', label: 'Todos os ramos' },
      ...ramos
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [metasRamoUf]);

  /**
   * O mesmo vendedor aparece uma vez por BU (filial + departamento) em que ele
   * atua — cada uma com meta propria vinda da diretoria. Sem rotular a linha, a
   * tabela parecia repetir o mesmo usuario varias vezes. Este mapa da o rotulo
   * "Filial N · UF · Departamento" para cada linha e alimenta o filtro de BU.
   * A UF entra no rotulo porque a meta do planejamento estrategico e por UF: e
   * ela que explica por que duas filiais da mesma BU recebem valores diferentes.
   */
  const metaBuLabelPorChave = useMemo(() => {
    const map: Record<string, string> = {};
    metasBu.forEach((row) => {
      const departamento = String(row.DEPARTAMENTO || `Departamento ${row.CODEPTO}`).trim();
      const uf = String(row.UF || '').trim();
      const ufLabel = uf && uf !== 'NAO_INFORMADO' ? ` · ${uf}` : '';
      map[buKey(row.CODFILIAL, row.CODEPTO)] = `Filial ${row.CODFILIAL}${ufLabel} · ${departamento}`;
    });
    return map;
  }, [metasBu]);

  function metaBuLabel(row: Pick<MetaVendedorBu, 'CODFILIAL' | 'CODEPTO'>): string {
    const key = buKey(row.CODFILIAL, row.CODEPTO);
    return metaBuLabelPorChave[key] || `Filial ${row.CODFILIAL} · Departamento ${row.CODEPTO}`;
  }

  const metaBuOptions = useMemo<Option[]>(() => ([
    { value: '', label: 'Todas as BUs do escopo' },
    ...metasBu
      .map((row) => ({
        value: buKey(row.CODFILIAL, row.CODEPTO),
        label: metaBuLabelPorChave[buKey(row.CODFILIAL, row.CODEPTO)] || `Filial ${row.CODFILIAL} · Departamento ${row.CODEPTO}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ]), [metaBuLabelPorChave, metasBu]);

  const metaDiretoriaTotal = useMemo(() => {
    const rows = metaBuSelecionada
      ? metasBu.filter((row) => buKey(row.CODFILIAL, row.CODEPTO) === metaBuSelecionada)
      : metasBu;
    return rows.reduce((total, row) => total + toNumber(row.META_DIRETORIA), 0);
  }, [metaBuSelecionada, metasBu]);

  const metaBaseTotalPorVendedor = useMemo(() => metasRamoUf.reduce<Record<string, number>>((acc, row) => {
    const vendedorId = vendedorTotalKey(row);
    acc[vendedorId] = (acc[vendedorId] || 0) + toNumber(row.META_BASE_RITMO);
    return acc;
  }, {}), [metasRamoUf]);

  /**
   * Meta considerada para o vendedor naquela BU: o que esta digitado, se houver
   * edicao; senao o que esta salvo. Zero digitado e um valor legitimo (vendedor
   * de ferias, por exemplo) — antes caia no salvo e a tela mostrava um numero
   * diferente do que o Salvar gravaria.
   */
  function metaEfetivaVendedor(row: Pick<MetaVendedorBu, 'CODFILIAL' | 'CODEPTO' | 'VENDEDOR_ID' | 'META_VALOR'>): number {
    const vendedorId = vendedorBuKey(row);
    const rawEdit = metaEdits[vendedorId];
    if (rawEdit == null) return toNumber(row.META_VALOR);
    const editedValue = parseCurrencyInput(rawEdit);
    if (editedValue == null) return toNumber(row.META_VALOR);
    return editedValue;
  }

  function metaInputValueVendedor(row: Pick<MetaVendedorBu, 'CODFILIAL' | 'CODEPTO' | 'VENDEDOR_ID' | 'META_VALOR'>): string {
    const vendedorId = vendedorBuKey(row);
    const rawEdit = metaEdits[vendedorId];
    if (rawEdit != null) return rawEdit;
    const savedValue = toNumber(row.META_VALOR);
    return savedValue > 0 ? formatEditableCurrencyValue(savedValue) : '';
  }

  const comparativoConfigKey = useMemo(() => JSON.stringify(comparativoBlocks.map((block) => ({
    categoria: block.categoria,
    metrica: block.metrica,
    dataInicio: block.dataInicio,
    dataFim: block.dataFim,
  }))), [comparativoBlocks]);

  const totalMetaDigitada = useMemo(() => metasVendedores.reduce((total, row) => {
    return total + metaEfetivaVendedor(row);
  }, 0), [metaEdits, metasVendedores]);

  const acompanhamentoMetasVendedores = useMemo(() => metasVendedores.map((row) => {
    const metaFinal = metaEfetivaVendedor(row);
    const realizado = toNumber(row.REALIZADO_LIQUIDO);
    const atingimento = metaFinal > 0 ? (realizado / metaFinal) * 100 : 0;
    return {
      ...row,
      META_PROPOSTA: metaFinal,
      GAP_PROPOSTO: metaFinal - realizado,
      ATINGIMENTO_PROPOSTO: atingimento,
      STATUS_META: metaFinal <= 0 ? 'sem-meta' : atingimento >= 100 ? 'acima' : atingimento >= 80 ? 'atenção' : 'risco',
    };
  }), [metaEdits, metasVendedores]);

  const vendedoresEmRisco = acompanhamentoMetasVendedores.filter((row) => row.STATUS_META === 'risco').length;
  const vendedoresNoRitmo = acompanhamentoMetasVendedores.filter((row) => row.STATUS_META === 'acima' || row.STATUS_META === 'atenção').length;

  async function loadFilterOptions() {
    if (coordinatorScope.loadingScope) return;
    setLoadingFilters(true);
    const res = await callSFWithMeta(SF.analyticsRcaFiltros, { ...inputFromFilters(defaultFilters), ...coordinatorScope.scopeParams });
    const rows = res.rows;
    setFilterOptions({
      filiais: uniqueOptions(rows.filter((row) => row.TIPO === 'FILIAL').map((row) => ({ value: String(row.VALUE), label: String(row.LABEL || row.VALUE) }))),
      departamentos: uniqueOptions(rows.filter((row) => row.TIPO === 'DEPARTAMENTO').map((row) => ({ value: String(row.VALUE), label: String(row.LABEL || row.VALUE) }))),
      secoes: uniqueOptions(rows.filter((row) => row.TIPO === 'SECAO').map((row) => ({ value: String(row.VALUE), label: String(row.LABEL || row.VALUE) }))),
      ramos: uniqueOptions(rows.filter((row) => row.TIPO === 'RAMO').map((row) => ({ value: String(row.VALUE), label: String(row.LABEL || row.VALUE) }))),
      clientes: [{ value: '', label: 'Todos da carteira' }, ...uniqueOptions(rows.filter((row) => row.TIPO === 'CLIENTE').map(clienteOption))],
    });
    setLoadingFilters(false);
  }

  async function loadAnalytics(nextFilters: AnalyticsFilters, nextPage = 0) {
    if (coordinatorScope.loadingScope) return;
    setLoadingData(true);
    const baseInput = { ...inputFromFilters(nextFilters, PAGE_SIZE, 0), ...coordinatorScope.scopeParams };
    const pagedInput = { ...inputFromFilters(nextFilters, PAGE_SIZE, nextPage), ...coordinatorScope.scopeParams };
    const [meta, evolucao, mix, carteira, topClientes, visitas, devolucoes] = await Promise.all([
      callSFWithMeta(SF.analyticsRcaMetaResumo, baseInput),
      callSFWithMeta(SF.analyticsRcaEvolucao24m, baseInput),
      callSFWithMeta(SF.analyticsRcaMixProdutos, baseInput),
      callSFWithMeta(SF.analyticsRcaCarteira, baseInput),
      callSFWithMeta(SF.analyticsRcaTopClientes, baseInput),
      callSFWithMeta(SF.analyticsRcaVisitas, baseInput),
      callSFWithMeta(SF.analyticsRcaDevolucoes, pagedInput),
    ]);

    const errors = [meta, evolucao, mix, carteira, topClientes, visitas, devolucoes]
      .map((result) => result.error)
      .filter((error): error is string => Boolean(error));

    setData({
      meta: meta.rows[0] || null,
      evolucao: evolucao.rows,
      mix: mix.rows,
      carteira: carteira.rows,
      topClientes: topClientes.rows,
      visitas: visitas.rows,
      devolucoes: devolucoes.rows,
      errors,
    });
    setAppliedFilters(nextFilters);
    setDevolucaoPage(nextPage);
    setLoadingData(false);
  }

  async function loadClienteEvolucao(nextFilters: AnalyticsFilters) {
    if (coordinatorScope.loadingScope || !nextFilters.cliente) {
      setClienteEvolucao([]);
      return;
    }

    setLoadingClienteEvolucao(true);
    const result = await callSFWithMeta(SF.analyticsRcaEvolucaoCliente, { ...inputFromFilters(nextFilters, PAGE_SIZE, 0), ...coordinatorScope.scopeParams });
    setClienteEvolucao(result.rows);
    setLoadingClienteEvolucao(false);
  }

  async function abrirDetalheCarteira(tipo: CarteiraDetalheTipo) {
    setCarteiraDetalhe({ tipo, rows: [] });
    setLoadingCarteiraDetalhe(true);
    const input = { ...inputFromFilters(appliedFilters, 500, 0), ...coordinatorScope.scopeParams };
    const result = await callSFWithMeta(SF.analyticsRcaCarteira, input);
    const rows = result.rows
      .filter((row) => row.TIPO === 'CLIENTE')
      .filter((row) => tipo === 'INATIVO' || String(row.STATUS_CARTEIRA || '').toUpperCase() === 'RISCO');

    setCarteiraDetalhe({ tipo, rows });
    setLoadingCarteiraDetalhe(false);
  }

  async function loadMetas(periodoMes = metaMes, periodoAno = metaAno, selectedBu = metaBuSelecionada) {
    if (!coordinatorScope.canUseScope) return;
    setLoadingMetas(true);
    setMetaError('');
    setMetaStatusMsg('');

    const metaScopeInput = { mes: periodoMes, ano: periodoAno, ...coordinatorScope.scopeParams };
    const metasResp = await callSFWithMeta(SF.painelCoordenadorMetasBuRecebidas, metaScopeInput);
    const metasRows = metasResp.rows as MetaBuRecebida[];
    setMetasBu(metasRows);

    const selectedStillExists = selectedBu ? metasRows.some((row) => buKey(row.CODFILIAL, row.CODEPTO) === selectedBu) : true;
    const nextBu = selectedStillExists ? selectedBu : '';
    if (nextBu !== metaBuSelecionada) setMetaBuSelecionada(nextBu);

    if (metasRows.length === 0) {
      setMetasVendedores([]);
      setMetasRamoUf([]);
      setMetaEdits({});
      setMetaRamoPercentEdits({});
      setMetaRamoValueEdits({});
      setSelectedMetaVendedorKey(null);
      setMetaError(metasResp.error || 'Nenhuma meta da diretoria encontrada para o período.');
      setLoadingMetas(false);
      return;
    }

    // Uma chamada para todas as BUs do escopo (antes era uma por BU).
    const vendedoresResp = await callSFWithMeta(SF.painelCoordenadorMetasVendedoresBu, {
      ...metaScopeInput,
      ...(nextBu ? { codfilial: nextBu.split('::')[0], codepto: nextBu.split('::')[1] } : {}),
    });
    const vendedoresRows = vendedoresResp.rows as MetaVendedorBu[];
    setMetasVendedores(vendedoresRows);
    // metaEdits comeca vazio de proposito: so entra aqui o que o coordenador
    // digitar, e so isso e gravado no Salvar.
    setMetaEdits({});
    setMetaRamoPercentEdits({});
    setMetaRamoValueEdits({});
    setSelectedMetaVendedorKey(null);

    // Uma chamada para todos os vendedores (antes era uma por vendedor/BU/filial,
    // o que ainda duplicava as linhas do vendedor presente em varias filiais).
    const vendedorPorId = new Map(vendedoresRows.map((row) => [String(row.VENDEDOR_ID), row]));
    const idsVendedores = Array.from(new Set(vendedoresRows.map((row) => String(row.VENDEDOR_ID))));
    const distribuicaoResp = idsVendedores.length === 0
      ? { rows: [], error: null }
      : await callSFWithMeta(SF.metasVendedorRamoUfAplicadas, {
        mes: periodoMes,
        ano: periodoAno,
        vendedorIds: idsVendedores.join(','),
        ramoCode: '',
        uf: '',
      });
    const distribuicaoRows = distribuicaoResp.rows.map((raw) => {
      const vendedor = vendedorPorId.get(String(raw.VENDEDOR_ID)) || null;
      return {
        CODEPTO: toNumber(raw.CODEPTO),
        VENDEDOR_ID: toNumber(raw.VENDEDOR_ID),
        COD_RCA: toNumber(vendedor?.COD_RCA),
        RCA: String(vendedor?.RCA || 'Sem nome'),
        BU_CODE: String(raw.BU_CODE || '-'),
        UF: String(raw.UF || 'NAO_INFORMADO'),
        RAMO_CODE: String(raw.RAMO_CODE || '-'),
        RAMO_NOME: String(raw.RAMO_NOME || raw.RAMO_CODE || 'Sem ramo'),
        META_BASE_RITMO: toNumber(raw.META_BASE_RITMO),
        META_VENDEDOR_TOTAL: toNumber(raw.META_VENDEDOR_TOTAL),
        PERCENTUAL_DISTRIBUICAO: toNumber(raw.PERCENTUAL_DISTRIBUICAO),
        META_VENDEDOR_RAMO_UF: toNumber(raw.META_VENDEDOR_RAMO_UF),
        PERSONALIZADO: toNumber(raw.PERSONALIZADO),
        PLANEJADO: raw.PLANEJADO == null ? 1 : toNumber(raw.PLANEJADO),
        FATURAMENTO_BRUTO: toNumber(raw.FATURAMENTO_BRUTO),
        DEVOLVIDO: toNumber(raw.DEVOLVIDO),
        FATURAMENTO_LIQUIDO: toNumber(raw.FATURAMENTO_LIQUIDO),
        PERCENTUAL_META: toNumber(raw.PERCENTUAL_META),
      };
    }) as MetaVendedorRamoUf[];
    setMetasRamoUf(distribuicaoRows);
    if (metaUfSelecionada && !distribuicaoRows.some((row) => String(row.UF || 'NAO_INFORMADO') === metaUfSelecionada)) {
      setMetaUfSelecionada('');
    }
    if (metaRamoSelecionado && !distribuicaoRows.some((row) => String(row.RAMO_CODE || 'SEM_RAMO') === metaRamoSelecionado)) {
      setMetaRamoSelecionado('');
    }
    setMetaError(metasResp.error || vendedoresResp.error || distribuicaoResp.error || '');
    setLoadingMetas(false);
  }

  async function salvarRedistribuicaoMetas() {
    if (!canEditMetas) {
      setMetaStatusMsg('Diretoria acompanha as metas em modo leitura. A redistribuição permanece com os coordenadores.');
      return;
    }

    if (metasVendedores.length === 0) {
      setMetaError('Carregue a equipe do coordenador antes de redistribuir a meta.');
      return;
    }

    // 1) Monta a lista do que realmente mudou. Gravar a equipe inteira a cada
    //    clique era o que criava meta zero para quem nunca foi editado.
    const vendedoresAlterados: { row: MetaVendedorBu; valor: number }[] = [];
    const vendedoresInvalidos: string[] = [];
    for (const row of metasVendedores) {
      const digitado = metaEdits[vendedorBuKey(row)];
      if (digitado == null) continue;
      const valor = parseCurrencyInput(digitado);
      if (valor == null || valor < 0) {
        vendedoresInvalidos.push(String(row.RCA || row.VENDEDOR_ID));
        continue;
      }
      if (Math.abs(valor - toNumber(row.META_VALOR)) < 0.005) continue;
      vendedoresAlterados.push({ row, valor });
    }

    const ramosAlterados: { row: MetaVendedorRamoUf; metaValor: number; percentual: number; codfilial: string }[] = [];
    const ramosInvalidos: string[] = [];
    // Vendedor com algum ramo editado: grava TODOS os ramos planejados dele como
    // estao na tela. Assim o servidor nao redistribui nada (zerar um ramo nao
    // joga o valor para os outros).
    const ramoEditado = (key: string) => metaRamoValueEdits[key] != null || metaRamoPercentEdits[key] != null;
    const vendedoresComRamoEditado = new Set(
      metasRamoUf.filter((row) => ramoEditado(vendedorRamoUfKey(row))).map((row) => vendedorTotalKey(row)),
    );
    for (const row of metasRamoUf) {
      const key = vendedorRamoUfKey(row);
      if (!vendedoresComRamoEditado.has(vendedorTotalKey(row))) continue;
      if (toNumber(row.PLANEJADO) !== 1) continue;
      let metaValor: number | null;
      if (metaRamoValueEdits[key] != null) {
        metaValor = metaRamoValueEdits[key].trim() === '' ? 0 : parseCurrencyInput(metaRamoValueEdits[key]);
      } else if (metaRamoPercentEdits[key] != null) {
        const pct = Number(normalizePercentInput(metaRamoPercentEdits[key] || '0'));
        metaValor = Number.isFinite(pct) && pct >= 0 ? (pct / 100) * (metaTotalPorVendedor[vendedorTotalKey(row)] ?? 0) : null;
      } else {
        metaValor = metaAjustadaRamoUf(row);
      }
      const metaTotalVendedor = metaTotalPorVendedor[vendedorTotalKey(row)] ?? 0;
      const percentual = metaTotalVendedor > 0 && metaValor != null ? (metaValor / metaTotalVendedor) * 100 : 0;
      // A SF de escrita confere se quem chama coordena aquela (filial, BU) antes
      // de gravar — precisa de uma filial real do vendedor naquela BU.
      const vendedorNaBu = metasVendedores.find((vendedor) => (
        vendedorTotalKey(vendedor) === vendedorTotalKey(row)
        && String(vendedor.CODEPTO) === String(row.CODEPTO)
      ));
      if (metaValor == null || metaValor < 0 || !vendedorNaBu) {
        ramosInvalidos.push(`${row.RCA || row.VENDEDOR_ID} / ${row.RAMO_NOME}`);
        continue;
      }
      ramosAlterados.push({ row, metaValor: Math.round(metaValor * 100) / 100, percentual: Math.round(percentual * 10000) / 10000, codfilial: String(vendedorNaBu.CODFILIAL) });
    }

    // 2) Valida tudo ANTES de gravar qualquer coisa. Antes a validacao ficava
    //    dentro do laco e um valor invalido no meio deixava a gravacao pela metade.
    if (vendedoresInvalidos.length > 0 || ramosInvalidos.length > 0) {
      const alvos = [...vendedoresInvalidos, ...ramosInvalidos].slice(0, 3).join(', ');
      setMetaError(`Valor de meta invalido em: ${alvos}${vendedoresInvalidos.length + ramosInvalidos.length > 3 ? '...' : ''}. Nada foi gravado.`);
      return;
    }

    // Ramos fixados manualmente nao podem passar da meta total do vendedor: os
    // ramos automaticos dividem so o que sobra, entao acima de 100% nao fecha.
    if (ramosAlterados.length > 0) {
      const metaTotalNova: Record<string, number> = { ...metaTotalPorVendedor };
      for (const { row, valor } of vendedoresAlterados) {
        const key = vendedorTotalKey(row);
        metaTotalNova[key] = (metaTotalNova[key] ?? 0) - toNumber(row.META_VALOR) + valor;
      }
      const editado = new Map(ramosAlterados.map((item) => [vendedorRamoUfKey(item.row), item.metaValor]));
      const fixadoPorVendedor: Record<string, { total: number; nome: string }> = {};
      for (const row of metasRamoUf) {
        const valor = editado.get(vendedorRamoUfKey(row)) ?? (toNumber(row.PERSONALIZADO) === 1 ? toNumber(row.META_VENDEDOR_RAMO_UF) : 0);
        const key = vendedorTotalKey(row);
        fixadoPorVendedor[key] = { total: (fixadoPorVendedor[key]?.total ?? 0) + valor, nome: String(row.RCA || row.VENDEDOR_ID) };
      }
      const estourados = Object.entries(fixadoPorVendedor)
        .filter(([key, item]) => item.total - (metaTotalNova[key] ?? 0) > 0.01)
        .map(([, item]) => item.nome);
      if (estourados.length > 0) {
        setMetaError(`Os ramos ajustados passam da meta total de: ${estourados.slice(0, 3).join(', ')}. Reduza os valores. Nada foi gravado.`);
        return;
      }
    }

    if (vendedoresAlterados.length === 0 && ramosAlterados.length === 0) {
      setMetaStatusMsg('Nenhuma alteração para salvar.');
      return;
    }

    setSalvandoMetas(true);
    setMetaError('');
    setMetaStatusMsg('');

    const gravados: string[] = [];
    try {
      for (const { row, valor } of vendedoresAlterados) {
        const result = await callSFWithMeta(SF.painelCoordenadorSalvarMetaVendedorBu, {
          codfilial: String(row.CODFILIAL),
          codepto: String(row.CODEPTO),
          vendedorId: String(row.VENDEDOR_ID),
          mes: metaMes,
          ano: metaAno,
          metaValor: String(valor),
        });
        if (result.error) throw new Error(result.error);
        gravados.push(String(row.RCA || row.VENDEDOR_ID));
      }

      for (const { row, metaValor, percentual, codfilial } of ramosAlterados) {
        const result = await callSFWithMeta(SF.painelCoordenadorSalvarMetaVendedorRamoUf, {
          codfilial,
          codepto: String(row.CODEPTO),
          vendedorId: String(row.VENDEDOR_ID),
          mes: metaMes,
          ano: metaAno,
          ramoCode: String(row.RAMO_CODE || 'SEM_RAMO'),
          ramoNome: String(row.RAMO_NOME || row.RAMO_CODE || 'Sem ramo'),
          uf: String(row.UF || 'NAO_INFORMADO'),
          percentual: String(percentual),
          metaValor: String(metaValor),
        });
        if (result.error) throw new Error(result.error);
      }

      // A meta total do vendedor passa a ser a soma dos ramos salvos (1 chamada por vendedor/depto)
      const sincronizar = new Map<string, { vendedorId: string; codepto: string }>();
      for (const { row } of ramosAlterados) {
        const chave = `${row.VENDEDOR_ID}|${row.CODEPTO}`;
        if (!sincronizar.has(chave)) sincronizar.set(chave, { vendedorId: String(row.VENDEDOR_ID), codepto: String(row.CODEPTO) });
      }
      for (const alvo of sincronizar.values()) {
        const result = await callSFWithMeta(SF.painelCoordenadorSincronizarMetaVendedorPorRamo, { ...alvo, mes: metaMes, ano: metaAno });
        if (result.error) throw new Error(result.error);
      }

      const partes = [
        vendedoresAlterados.length > 0 ? `${vendedoresAlterados.length} vendedor(es)` : '',
        ramosAlterados.length > 0 ? `${ramosAlterados.length} ajuste(s) por ramo/UF` : '',
      ].filter(Boolean).join(' e ');
      setMetaStatusMsg(`Metas salvas: ${partes}.`);
      await loadMetas(metaMes, metaAno, metaBuSelecionada);
      await loadAnalytics(appliedFilters, devolucaoPage);
    } catch (error) {
      const motivo = error instanceof Error ? error.message : 'Falha ao salvar a redistribuição de metas.';
      setMetaError(gravados.length > 0
        ? `${motivo} A gravação parou no meio: ${gravados.length} vendedor(es) já foram salvos. Recarregue os dados antes de tentar de novo.`
        : `${motivo} Nada foi gravado.`);
    } finally {
      setSalvandoMetas(false);
    }
  }

  function atualizarMetaPorValor(key: string, value: string) {
    setMetaEdits((current) => ({ ...current, [key]: value }));
  }

  /**
   * Recarregar ou trocar de periodo descarta o que esta digitado — as edicoes
   * pertencem ao mes/ano que estava na tela. Antes isso acontecia em silencio.
   */
  function confirmarDescarteMetas(): boolean {
    if (metaEditsPendentes === 0) return true;
    return window.confirm(`Existem ${metaEditsPendentes} alteracao(oes) de meta ainda nao salva(s). Recarregar os dados vai descartar essas alteracoes. Deseja continuar?`);
  }

  function trocarPeriodoMetas(campo: 'mes' | 'ano', valor: string) {
    if (!confirmarDescarteMetas()) return;
    setMetaEdits({});
    setMetaRamoPercentEdits({});
    setMetaRamoValueEdits({});
    setMetaStatusMsg('');
    setMetaError('');
    const proximoMes = campo === 'mes' ? valor : metaMes;
    const proximoAno = campo === 'ano' ? valor : metaAno;
    if (campo === 'mes') setMetaMes(valor); else setMetaAno(valor);
    loadMetas(proximoMes, proximoAno, metaBuSelecionada);
  }

  /**
   * Trocar de BU recarrega a lista de vendedores daquela BU. Como cada BU tem
   * meta propria, misturar todas na mesma tabela e o que fazia o mesmo vendedor
   * aparecer varias vezes.
   */
  function trocarBuMetas(valor: string) {
    if (valor === metaBuSelecionada) return;
    if (!confirmarDescarteMetas()) return;
    setMetaEdits({});
    setMetaRamoPercentEdits({});
    setMetaRamoValueEdits({});
    setMetaStatusMsg('');
    setMetaError('');
    setMetaBuSelecionada(valor);
    loadMetas(metaMes, metaAno, valor);
  }

  function aplicarRateioRapido(tipo: 'igual' | 'realizado' | 'atual') {
    if (!canEditMetas) {
      setMetaStatusMsg('Diretoria acompanha as metas em modo leitura. A redistribuição permanece com os coordenadores.');
      return;
    }

    const metaDiretoria = metaDiretoriaTotal;
    if (metaDiretoria <= 0 || metasVendedores.length === 0) {
      setMetaError('Carregue as metas gerais e os vendedores antes de aplicar o rateio.');
      return;
    }

    const pesos = metasVendedores.map((row) => {
      if (tipo === 'realizado') return Math.max(0, toNumber(row.REALIZADO_LIQUIDO));
      if (tipo === 'atual') return Math.max(0, toNumber(row.META_VALOR));
      return 1;
    });
    const pesoTotal = pesos.reduce((total, value) => total + value, 0);
    const divisor = pesoTotal > 0 ? pesoTotal : metasVendedores.length;
    const nextMetaEdits: Record<string, string> = {};

    metasVendedores.forEach((row, index) => {
      const peso = pesoTotal > 0 ? pesos[index] : 1;
      const metaCalculada = (metaDiretoria * peso) / divisor;
      const key = vendedorBuKey(row);
      nextMetaEdits[key] = formatEditableCurrencyValue(metaCalculada);
    });

    setMetaEdits(nextMetaEdits);
    setMetaError('');
    setMetaStatusMsg(tipo === 'igual'
      ? 'Rateio igual aplicado. Revise o acompanhamento antes de salvar.'
      : tipo === 'realizado'
        ? 'Rateio por realizado líquido aplicado. Revise os vendedores em risco antes de salvar.'
        : 'Rateio proporcional à distribuição atual aplicado. Revise antes de salvar.');
  }

  async function exportarComparativoExcel() {
    const blocos = comparativoBlocks
      .map((block, index) => ({
        numero: index + 1,
        block,
        rows: filterComparativoData(comparativoData[index] || [], block.selecionados),
      }))
      .filter((item) => item.rows.length > 0);

    if (blocos.length === 0) {
      window.alert('Nao ha dados carregados para exportar.');
      return;
    }

    const geradoEm = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const periodoAplicado = `${formatDateBr(resolvedAppliedPeriod.dataInicio)} a ${formatDateBr(resolvedAppliedPeriod.dataFim)}`;
    const filtrosLabel = [
      `Filiais: ${optionListLabel(filterOptions.filiais, appliedFilters.filiais, 'Todas')}`,
      `Departamentos: ${optionListLabel(filterOptions.departamentos, appliedFilters.departamentos)}`,
      `Secoes: ${optionListLabel(filterOptions.secoes, appliedFilters.secoes, 'Todas')}`,
      `Ramos: ${optionListLabel(filterOptions.ramos, appliedFilters.ramos)}`,
      `Cliente: ${optionListLabel(filterOptions.clientes, selectedValues(appliedFilters.cliente), 'Todos da carteira')}`,
    ].join(' | ');

    // Blocos com mesma categoria e mesma metrica sao comparaveis: viram colunas lado a lado.
    const grupos = new Map<string, typeof blocos>();
    blocos.forEach((item) => {
      const key = `${item.block.categoria}|${item.block.metrica}`;
      const atual = grupos.get(key) || [];
      atual.push(item);
      grupos.set(key, atual);
    });

    const sheets = [];

    for (const grupo of grupos.values()) {
      const { categoria, metrica } = grupo[0].block;
      const valueType = metrica === 'QTD' ? 'decimal' as const : 'currency' as const;
      const unidade = comparativoUnidadeLabel(metrica);
      const totaisPorBloco = grupo.map((item) => item.rows.reduce((total, row) => total + toNumber(row.value), 0));

      const itens = new Map<string, { label: string; codigo: string; valores: number[] }>();
      grupo.forEach((item, blocoIndex) => {
        item.rows.forEach((row) => {
          const id = comparativoRowId(row);
          const atual = itens.get(id) || {
            label: String(row.fullName || row.name),
            codigo: String(row.productCode || row.customerCode || ''),
            valores: grupo.map(() => 0),
          };
          atual.valores[blocoIndex] += toNumber(row.value);
          itens.set(id, atual);
        });
      });

      const linhas = Array.from(itens.values()).sort((a, b) => {
        const porBase = b.valores[0] - a.valores[0];
        if (porBase !== 0) return porBase;
        return Math.max(...b.valores) - Math.max(...a.valores);
      });

      const columns = [
        excelColumn(categoria, { type: 'text', width: 44 }),
        excelColumn('Codigo', { type: 'text', width: 14 }),
      ];
      grupo.forEach((item) => {
        const group = `Bloco ${item.numero} - ${comparativoPeriodoLabel(item.block)}`;
        const groupColor = COMPARATIVO_BLOCO_CORES[(item.numero - 1) % COMPARATIVO_BLOCO_CORES.length];
        columns.push(excelColumn(unidade, { type: valueType, width: 16, group, groupColor, total: true }));
        columns.push(excelColumn('% do total', { type: 'percent', width: 12, group, groupColor }));
      });
      grupo.slice(1).forEach((item) => {
        const group = `Variacao B${item.numero} vs B${grupo[0].numero}`;
        columns.push(excelColumn(`Dif. ${unidade}`, { type: valueType, width: 16, group, groupColor: COMPARATIVO_VARIACAO_COR, total: true }));
        columns.push(excelColumn('Dif. %', { type: 'percent', width: 12, group, groupColor: COMPARATIVO_VARIACAO_COR }));
      });

      const rows = linhas.map((linha) => {
        const cells: (string | number | null)[] = [linha.label, linha.codigo || null];
        linha.valores.forEach((valor, index) => {
          cells.push(valor);
          cells.push(totaisPorBloco[index] > 0 ? valor / totaisPorBloco[index] : null);
        });
        linha.valores.slice(1).forEach((valor) => {
          const base = linha.valores[0];
          cells.push(valor - base);
          cells.push(base !== 0 ? (valor - base) / Math.abs(base) : null);
        });
        return cells;
      });

      const periodos = grupo.map((item) => `B${item.numero}: ${comparativoPeriodoLabel(item.block)}`).join('  |  ');
      sheets.push({
        name: `${categoria} - ${comparativoMetricaLabel(metrica)}`,
        title: `Comparativo por ${categoria} - ${comparativoMetricaLabel(metrica)}`,
        subtitle: `${periodos}\nGerado em ${geradoEm} | ${filtrosLabel}`,
        columns,
        rows,
        totalsLabel: 'TOTAL',
        freezeColumns: 2,
        autoFilter: true,
        emptyMessage: 'Sem itens no recorte selecionado.',
      });
    }

    const baseRows = blocos.flatMap((item) => {
      const totalBloco = item.rows.reduce((total, row) => total + toNumber(row.value), 0);
      return item.rows.map((row) => ([
        `B${item.numero}`,
        item.block.categoria,
        comparativoMetricaLabel(item.block.metrica),
        comparativoUnidadeLabel(item.block.metrica),
        isoToDate(item.block.dataInicio),
        isoToDate(item.block.dataFim),
        comparativoPeriodoLabel(item.block),
        String(row.fullName || row.name),
        String(row.productCode || row.customerCode || '') || null,
        toNumber(row.value),
        totalBloco > 0 ? toNumber(row.value) / totalBloco : null,
      ]));
    });

    sheets.push({
      name: 'Base de dados',
      title: 'Base de dados - uma linha por item e bloco',
      subtitle: `Gerado em ${geradoEm} | ${filtrosLabel}\nFormato pronto para filtro, ordenacao e tabela dinamica.`,
      columns: [
        excelColumn('Bloco', { type: 'text', width: 9 }),
        excelColumn('Categoria', { type: 'text', width: 15 }),
        excelColumn('Metrica', { type: 'text', width: 15 }),
        excelColumn('Unidade', { type: 'text', width: 10 }),
        excelColumn('Data inicial', { type: 'date', width: 13 }),
        excelColumn('Data final', { type: 'date', width: 13 }),
        excelColumn('Periodo', { type: 'text', width: 26 }),
        excelColumn('Item', { type: 'text', width: 44 }),
        excelColumn('Codigo', { type: 'text', width: 14 }),
        excelColumn('Valor', { type: 'decimal', width: 16, total: true }),
        excelColumn('% do bloco', { type: 'percent', width: 12 }),
      ],
      rows: baseRows,
      totalsLabel: 'TOTAL',
      freezeColumns: 1,
      autoFilter: true,
    });

    sheets.push({
      name: 'Parametros',
      title: 'Parametros da exportacao',
      columns: [
        excelColumn('Parametro', { type: 'text', width: 26 }),
        excelColumn('Valor', { type: 'text', width: 80 }),
      ],
      rows: [
        ['Gerado em', geradoEm],
        ['Periodo aplicado', periodoAplicado],
        ['Filiais', optionListLabel(filterOptions.filiais, appliedFilters.filiais, 'Todas')],
        ['Departamentos', optionListLabel(filterOptions.departamentos, appliedFilters.departamentos)],
        ['Secoes', optionListLabel(filterOptions.secoes, appliedFilters.secoes, 'Todas')],
        ['Ramos', optionListLabel(filterOptions.ramos, appliedFilters.ramos)],
        ['Cliente', optionListLabel(filterOptions.clientes, selectedValues(appliedFilters.cliente), 'Todos da carteira')],
        ...blocos.map((item) => ([
          `Bloco ${item.numero}`,
          `${item.block.categoria} | ${comparativoMetricaLabel(item.block.metrica)} | ${comparativoPeriodoLabel(item.block)} | ${item.rows.length} itens${item.block.selecionados.length > 0 ? ' (selecao manual)' : ''}`,
        ])),
        ['Observacao', 'Os valores estao gravados como numero puro (sem R$), com formato de exibicao aplicado na celula. Da para filtrar, somar e usar em tabela dinamica.'],
      ],
      autoFilter: false,
    });

    try {
      setExportandoComparativo(true);
      await downloadExcelWorkbook({
        fileName: `comparativo-analytics-${getBrasiliaDate()}.xlsx`,
        sheets,
        creator: 'Benenutri - Analytics',
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Falha ao gerar a planilha do comparativo.');
    } finally {
      setExportandoComparativo(false);
    }
  }

  useEffect(() => {
    if (coordinatorScope.loadingScope) return;
    loadFilterOptions();
    loadAnalytics(defaultFilters, 0);
    loadClienteEvolucao(defaultFilters);
    metasCarregadasRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coordinatorScope.loadingScope, coordinatorScope.scopeParams]);

  // As metas so carregam quando a aba e aberta. Antes o carregamento disparava
  // em toda visita ao Analytics, mesmo para quem nunca clicava em "Metas" —
  // eram ~100 execucoes de Server Function por abertura, contra um limite de
  // 300/min compartilhado por todos os usuarios do projeto.
  useEffect(() => {
    if (coordinatorScope.loadingScope) return;
    if (activeTab !== 'metas' || !canSeeMetasTab) return;
    if (metasCarregadasRef.current) return;
    metasCarregadasRef.current = true;
    loadMetas(metaMes, metaAno);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, canSeeMetasTab, coordinatorScope.loadingScope, coordinatorScope.scopeParams]);

  useEffect(() => {
    if (activeTab !== 'comparativo') return;
    let mounted = true;

    async function loadComparativo() {
      setLoadingComparativo(true);
      const entries = await Promise.all(comparativoBlocks.map(async (block, index) => {
        const blockFilters: AnalyticsFilters = {
          ...appliedFilters,
          preset: 'customizado',
          dataInicio: block.dataInicio,
          dataFim: block.dataFim,
        };
        const input = { ...inputFromFilters(blockFilters, PAGE_SIZE, 0), ...coordinatorScope.scopeParams };

        if (block.categoria === 'Cliente' || block.categoria === 'Ramo') {
          const res = await callSFWithMeta(SF.analyticsRcaTopClientes, input);
          const rows = res.rows;
          if (block.categoria === 'Ramo') {
            const grouped = rows.reduce<Record<string, number>>((acc, row) => {
              const key = String(row.RAMO || 'Sem ramo');
              acc[key] = (acc[key] || 0) + (block.metrica === 'QTD' ? toNumber(row.QTD_PEDIDOS) : toNumber(row.FATURAMENTO_LIQUIDO));
              return acc;
            }, {});
            const chartRows = Object.entries(grouped).map(([name, value]) => chartDatum(name, value, 24)).sort((a, b) => b.value - a.value);
            return [index, chartRows] as const;
          }
          const chartRows = rows.map((row) => ({
            name: chartLabel(row.CLIENTE || row.CODCLI, 24),
            fullName: fullChartName(row.CLIENTE || row.CODCLI),
            customerCode: row.CODCLI,
            value: block.metrica === 'QTD' ? toNumber(row.QTD_PEDIDOS) : toNumber(row.FATURAMENTO_LIQUIDO),
          }));
          return [index, chartRows] as const;
        }

        const res = await callSFWithMeta(SF.analyticsRcaMixProdutos, input);
        const rows = res.rows;
        if (block.categoria === 'Produto') {
          const chartRows = rows.filter((row) => row.TIPO === 'TOP_PRODUTO').map((row) => ({
            name: chartLabel(row.DESCRICAO || row.CODPROD, 24),
            fullName: fullChartName(row.DESCRICAO || row.CODPROD),
            productCode: row.CODPROD,
            value: block.metrica === 'QTD' ? toNumber(row.QT) : toNumber(row.VALOR),
          })).sort((a, b) => b.value - a.value);
          return [index, chartRows] as const;
        }

        const grouped = rows.filter((row) => row.TIPO === 'DEPTO_SECAO').reduce<Record<string, number>>((acc, row) => {
          const key = block.categoria === 'Seção' ? String(row.SECAO || 'Sem seção') : String(row.DEPARTAMENTO || 'Sem departamento');
          acc[key] = (acc[key] || 0) + toNumber(row.VALOR);
          return acc;
        }, {});
        const chartRows = Object.entries(grouped).map(([name, value]) => chartDatum(name, value, 24)).sort((a, b) => b.value - a.value);
        return [index, chartRows] as const;
      }));

      if (!mounted) return;
      setComparativoData(Object.fromEntries(entries));
      setLoadingComparativo(false);
    }

    loadComparativo();
    return () => {
      mounted = false;
    };
  }, [activeTab, appliedFilters, comparativoConfigKey, coordinatorScope.scopeParams]);

  const resolvedAppliedPeriod = resolvePeriod(appliedFilters);
  const todayOrEnd = minIsoDate(getBrasiliaDate(), resolvedAppliedPeriod.dataFim);
  const calendarDaysInPeriod = calendarDaysBetween(resolvedAppliedPeriod.dataInicio, resolvedAppliedPeriod.dataFim);
  const businessDaysTotal = businessDaysBetween(resolvedAppliedPeriod.dataInicio, resolvedAppliedPeriod.dataFim);
  const businessDaysElapsed = Math.max(1, businessDaysBetween(resolvedAppliedPeriod.dataInicio, todayOrEnd));
  const isDailyEvolution = calendarDaysInPeriod <= 31;

  const meta = data.meta || {};
  const faturamentoLiquido = toNumber(meta.FATURAMENTO_LIQUIDO);
  const valorMeta = toNumber(meta.VALOR_META);
  const percentualMeta = toNumber(meta.PERCENTUAL_META);
  const projecao = businessDaysTotal > 0 ? (faturamentoLiquido / businessDaysElapsed) * businessDaysTotal : faturamentoLiquido;
  const progressWidth = Math.min(100, Math.max(0, percentualMeta));

  const evolucaoChartData = data.evolucao.map((row) => ({
    name: String(row.MES_ANO || row.PERIODO || ''),
    realizado: toNumber(row.VALOR_REALIZADO),
    meta: toNumber(row.VALOR_META),
    qtd: toNumber(row.QTD || row.QTD_VENDIDA || row.QTD_PEDIDOS),
  }));

  const topProdutos = data.mix.filter((row) => row.TIPO === 'TOP_PRODUTO');
  const topProdutosRamo = data.mix.filter((row) => row.TIPO === 'TOP_PRODUTO_RAMO');
  const produtosDevolucao = data.mix.filter((row) => row.TIPO === 'PRODUTO_DEVOLUCAO');
  const fornecedoresProduto = data.mix.filter((row) => row.TIPO === 'FORNECEDOR');
  const mixChartData = topProdutos.slice(0, 8).map((row) => chartDatum(row.DESCRICAO || row.CODPROD, toNumber(row.VALOR), 22, { productCode: row.CODPROD }));
  const mixQtdChartData = [...topProdutos]
    .sort((a, b) => toNumber(b.QT) - toNumber(a.QT))
    .slice(0, 8)
    .map((row) => chartDatum(row.DESCRICAO || row.CODPROD, toNumber(row.QT), 22, { productCode: row.CODPROD }));
  const ramoTotals = data.topClientes.reduce<Record<string, { faturamento: number; clientes: number }>>((acc, row) => {
    const ramo = String(row.RAMO || 'Sem ramo');
    if (!acc[ramo]) acc[ramo] = { faturamento: 0, clientes: 0 };
    acc[ramo].faturamento += toNumber(row.FATURAMENTO_LIQUIDO);
    acc[ramo].clientes += 1;
    return acc;
  }, {});
  const ramosData = Object.entries(ramoTotals)
    .map(([ramo, item]) => ({ ramo, ...chartDatum(ramo, item.faturamento, 22, { clientes: item.clientes }) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  const devolucaoProdutosChartData = produtosDevolucao.slice(0, 8).map((row) => chartDatum(row.DESCRICAO || row.CODPROD, toNumber(row.VALOR_DEVOLVIDO), 22, { productCode: row.CODPROD }));
  const fornecedorTotal = fornecedoresProduto.reduce((total, row) => total + toNumber(row.VALOR_FORNECEDOR), 0);
  const fornecedorQtdTotal = fornecedoresProduto.reduce((total, row) => total + toNumber(row.QTD_FORNECEDOR), 0);
  const fornecedorDestaque = [...fornecedoresProduto].sort((a, b) => toNumber(b.VALOR_FORNECEDOR) - toNumber(a.VALOR_FORNECEDOR))[0] || null;
  const fornecedorChartData = fornecedoresProduto.slice(0, 8).map((row, index) => ({
    name: chartLabel(row.FORNECEDOR || `Fornecedor ${row.CODFORNEC || '-'}`, 22),
    fullName: fullChartName(row.FORNECEDOR || `Fornecedor ${row.CODFORNEC || '-'}`),
    value: toNumber(row.VALOR_FORNECEDOR),
    color: FORNECEDOR_CORES[index % FORNECEDOR_CORES.length],
  }));
  const fornecedorQtdChartData = fornecedoresProduto.slice(0, 8).map((row) => ({
    name: chartLabel(row.FORNECEDOR || `Fornecedor ${row.CODFORNEC || '-'}`, 22),
    fullName: fullChartName(row.FORNECEDOR || `Fornecedor ${row.CODFORNEC || '-'}`),
    value: toNumber(row.QTD_FORNECEDOR),
  }));
  const visitaResumo = data.visitas.find((row) => row.TIPO === 'RESUMO') || {};
  const visitaTipoRows = data.visitas.filter((row) => row.TIPO === 'TIPO_VISITA');
  const visitaTipoTotal = visitaTipoRows.reduce((total, row) => total + toNumber(row.QTD_TIPO), 0);
  const visitaTipoDestaque = [...visitaTipoRows].filter((row) => toNumber(row.QTD_TIPO) > 0).sort((a, b) => toNumber(b.QTD_TIPO) - toNumber(a.QTD_TIPO))[0] || null;
  const visitaTipoChartData = visitaTipoRows
    .map((row, index) => ({
      name: chartLabel(row.TIPO_VISITA || 'Sem tipo', 22),
      fullName: fullChartName(row.TIPO_VISITA || 'Sem tipo'),
      value: toNumber(row.QTD_TIPO),
      color: VISITA_TIPO_CORES[index % VISITA_TIPO_CORES.length],
    }))
    .filter((item) => item.value > 0);
  const produtosRamoRows = topProdutosRamo.map((row) => ({
    RAMO: row.RAMO || 'Sem ramo',
    PRODUTO: row.DESCRICAO || row.CODPROD,
    FATURAMENTO: formatCurrency(toNumber(row.VALOR)),
    QTD: formatDecimal(row.QT, 2),
  }));

  const carteiraResumo = data.carteira.find((row) => row.TIPO === 'RESUMO') || {};
  const carteiraClientes = data.carteira.filter((row) => row.TIPO === 'CLIENTE');
  const totalDevolucoes = toNumber(data.devolucoes[0]?.TOTAL_REGISTROS);
  const totalDevolucaoPages = Math.max(1, Math.ceil(totalDevolucoes / PAGE_SIZE));
  const totalDevolvidoFiltrado = toNumber(data.devolucoes[0]?.TOTAL_DEVOLVIDO_FILTRADO);
  const devolucaoQuantidadeTotal = data.devolucoes.reduce((acc, row) => acc + toNumber(row.QT_DEVOLVIDA), 0);
  const devolucaoTicketMedio = totalDevolucoes > 0 ? totalDevolvidoFiltrado / totalDevolucoes : 0;
  const devolucaoCasosCriticos = data.devolucoes.filter((row) => toNumber(row.DIAS) > 30);
  const maiorDevolucaoRow = [...data.devolucoes].sort((a, b) => toNumber(b.VALOR_DEVOLVIDO) - toNumber(a.VALOR_DEVOLVIDO))[0] || null;
  const devolucaoHighlights = [...data.devolucoes]
    .sort((a, b) => {
      const valueDiff = toNumber(b.VALOR_DEVOLVIDO) - toNumber(a.VALOR_DEVOLVIDO);
      if (valueDiff !== 0) return valueDiff;
      return toNumber(b.DIAS) - toNumber(a.DIAS);
    })
    .slice(0, 4);
  const carteiraStatusChartData = [
    { name: 'Ativos', value: toNumber(carteiraResumo.CLIENTES_ATIVOS), color: 'var(--color-primary)' },
    { name: 'Inativos', value: toNumber(carteiraResumo.CLIENTES_INATIVOS), color: '#a46a18' },
    { name: 'Em risco', value: toNumber(carteiraResumo.CLIENTES_RISCO), color: '#d92d20' },
    { name: 'Novos', value: toNumber(carteiraResumo.CLIENTES_NOVOS), color: '#6f3db3' },
  ].filter((item) => item.value > 0);
  const topClientesChartData = data.topClientes.slice(0, 10).map((row) => chartDatum(row.CLIENTE || row.CODCLI, toNumber(row.FATURAMENTO_LIQUIDO), 24));
  const clienteSelecionadoLabel = filters.cliente ? multiOptionLabel(filterOptions.clientes, filters.cliente) : '';
  const clienteEvolucaoChartData = clienteEvolucao.map((row) => ({
    name: String(row.MES_ANO || row.PERIODO || ''),
    faturamento: toNumber(row.VALOR_REALIZADO),
    qtd: toNumber(row.QTD || row.QTD_VENDIDA || row.QTD_PEDIDOS),
  }));
  const clienteSegmentoPieData = ramosData.map((row, index) => ({
    name: row.name,
    fullName: row.fullName,
    value: row.value,
    color: ['var(--color-primary)', '#2d5cc5', '#a46a18', '#6f3db3', '#d92d20', '#0f766e', '#b45309', '#475569'][index % 8],
  }));
  const devolucoesChartData = data.devolucoes.slice(0, 10).map((row) => chartDatum(row.PRODUTO || row.CODPROD || row.NOTA_DEVOLUCAO, toNumber(row.VALOR_DEVOLVIDO), 22, { productCode: row.CODPROD }));

  const carteiraRows = carteiraClientes.map((row) => ({
    CODCLI: row.CODCLI,
    CLIENTE: row.CLIENTE,
    RAMO: row.RAMO,
    ULTIMO_PEDIDO: row.ULTIMO_PEDIDO ? formatDateBr(String(row.ULTIMO_PEDIDO)) : 'Sem pedido',
    DIAS_SEM_COMPRA: toNumber(row.DIAS_SEM_COMPRA),
    STATUS: row.STATUS_CARTEIRA,
  }));

  const carteiraDetalheTitulo = carteiraDetalhe?.tipo === 'RISCO' ? 'Clientes em risco' : 'Clientes inativos';
  const carteiraDetalheRows = (carteiraDetalhe?.rows || []).map((row) => ({
    CODCLI: row.CODCLI,
    CLIENTE: row.CLIENTE,
    RAMO: row.RAMO,
    ULTIMO_PEDIDO: row.ULTIMO_PEDIDO ? formatDateBr(String(row.ULTIMO_PEDIDO)) : 'Sem pedido',
    DIAS_SEM_COMPRA: toNumber(row.DIAS_SEM_COMPRA),
    STATUS: row.STATUS_CARTEIRA,
  }));

  const topClienteRows = data.topClientes.map((row) => ({
    CODCLI: row.CODCLI,
    CLIENTE: row.CLIENTE,
    RAMO: row.RAMO,
    BRUTO: formatCurrency(toNumber(row.FATURAMENTO_BRUTO)),
    DEVOLVIDO: formatCurrency(toNumber(row.DEVOLVIDO)),
    LIQUIDO: formatCurrency(toNumber(row.FATURAMENTO_LIQUIDO)),
    PEDIDOS: formatDecimal(row.QTD_PEDIDOS),
    TICKET: formatCurrency(toNumber(row.TICKET_MEDIO)),
    PARTICIPACAO: formatPercent(row.PERC_TOTAL),
  }));
  const devolucaoRows = data.devolucoes.map((row) => ({
    NOTA_DEVOLUCAO: row.NOTA_DEVOLUCAO,
    NOTA_VENDA_ORIGINAL: row.NOTA_VENDA_ORIGINAL,
    NUMPED: row.NUMPED,
    DATA_VENDA: formatDateBr(String(row.DATA_VENDA || '')),
    DATA_DEVOLUCAO: formatDateBr(String(row.DATA_DEVOLUCAO || '')),
    DIAS: row.DIAS ?? '',
    CODCLI: row.CODCLI,
    CLIENTE: row.CLIENTE,
    CODPROD: row.CODPROD,
    PRODUTO: row.PRODUTO,
    QT_DEVOLVIDA: formatDecimal(row.QT_DEVOLVIDA, 2),
    VALOR_DEVOLVIDO: formatCurrency(toNumber(row.VALOR_DEVOLVIDO)),
  }));

  const metasRamoUfFiltradas = metasRamoUf.filter((row) => {
    const matchesUf = !metaUfSelecionada || String(row.UF || 'NAO_INFORMADO') === metaUfSelecionada;
    const matchesRamo = !metaRamoSelecionado || String(row.RAMO_CODE || 'SEM_RAMO') === metaRamoSelecionado;
    return matchesUf && matchesRamo;
  });
  /** Meta total do vendedor no periodo — soma das BUs/filiais em que ele atua. */
  const metaTotalPorVendedor = useMemo(() => metasVendedores.reduce<Record<string, number>>((acc, row) => {
    const id = vendedorTotalKey(row);
    acc[id] = (acc[id] || 0) + metaEfetivaVendedor(row);
    return acc;
  }, {}), [metaEdits, metasVendedores]);

  /**
   * Meta do recorte ramo/UF considerando o que o coordenador esta digitando.
   * Linha personalizada (salva pelo coordenador) nao e reescalada: o valor dele
   * manda. As demais acompanham a meta total do vendedor.
   */
  const metaAjustadaRamoUf = (row: MetaVendedorRamoUf) => {
    if (toNumber(row.PERSONALIZADO) === 1) return toNumber(row.META_VENDEDOR_RAMO_UF);
    const vendedorId = vendedorTotalKey(row);
    const metaVendedorAtual = metaTotalPorVendedor[vendedorId];
    const metaVendedorBase = toNumber(row.META_VENDEDOR_TOTAL);
    if (metaVendedorAtual == null || !Number.isFinite(metaVendedorAtual)) return toNumber(row.META_VENDEDOR_RAMO_UF);
    if (metaVendedorBase <= 0) {
      const targetBaseTotal = metaBaseTotalPorVendedor[vendedorId] || 0;
      return targetBaseTotal > 0 ? metaVendedorAtual * (toNumber(row.META_BASE_RITMO) / targetBaseTotal) : toNumber(row.META_VENDEDOR_RAMO_UF);
    }
    return toNumber(row.META_VENDEDOR_RAMO_UF) * (metaVendedorAtual / metaVendedorBase);
  };
  const totalMetaRamoUf = metasRamoUfFiltradas.reduce((total, row) => total + metaAjustadaRamoUf(row), 0);
  const totalRealizadoRamoUf = metasRamoUfFiltradas.reduce((total, row) => total + toNumber(row.FATURAMENTO_LIQUIDO), 0);
  const totalDevolvidoRamoUf = metasRamoUfFiltradas.reduce((total, row) => total + toNumber(row.DEVOLVIDO), 0);
  const percentualMetaRamoUf = totalMetaRamoUf > 0 ? (totalRealizadoRamoUf / totalMetaRamoUf) * 100 : 0;
  const hasMetaSegmentFilter = Boolean(metaUfSelecionada || metaRamoSelecionado);
  // Com filtro de UF/ramo, "meta geral" e "total distribuido" eram o MESMO numero:
  // o saldo dava sempre zero e o percentual sempre 100%. Os tres cards nao
  // informavam nada. Sob recorte, o par que faz sentido e meta x realizado.
  const metaGeralExibida = hasMetaSegmentFilter ? totalMetaRamoUf : metaDiretoriaTotal;
  const totalDistribuidoExibido = hasMetaSegmentFilter ? totalRealizadoRamoUf : totalMetaDigitada;
  const percentualDistribuidoExibido = metaGeralExibida > 0 ? (totalDistribuidoExibido / metaGeralExibida) * 100 : 0;
  const saldoExibido = metaGeralExibida - totalDistribuidoExibido;
  const metasRamoUfChartData = Object.entries(metasRamoUfFiltradas.reduce<Record<string, number>>((acc, row) => {
    const key = row.RAMO_NOME || 'Sem ramo';
    acc[key] = (acc[key] || 0) + metaAjustadaRamoUf(row);
    return acc;
  }, {}))
    .map(([name, value]) => chartDatum(name, value, 24))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const metaUfLabel = metaUfSelecionada
    ? (metaUfSelecionada === 'NAO_INFORMADO' ? 'Sem UF informada' : metaUfSelecionada)
    : 'Todas as UFs';
  const metaRamoLabel = metaRamoSelecionado
    ? (metaRamoOptions.find((option) => option.value === metaRamoSelecionado)?.label || metaRamoSelecionado)
    : 'Todos os ramos';
  const metaRecorteLabel = `${metaUfLabel} / ${metaRamoLabel}`;

  /**
   * De onde veio a meta geral. O planejamento estrategico define a meta por BU e
   * UF; cada filial recebe a meta da sua propria UF. Quando a diretoria lanca um
   * valor manual em METAS_BU, ele prevalece — e o rotulo precisa dizer isso, senao
   * o coordenador nao entende por que o numero nao bate com o planejamento.
   */
  const metaOrigemLabel = useMemo(() => {
    const rows = metaBuSelecionada
      ? metasBu.filter((row) => buKey(row.CODFILIAL, row.CODEPTO) === metaBuSelecionada)
      : metasBu;
    if (rows.length === 0) return '';
    const ufs = Array.from(new Set(rows
      .map((row) => String(row.UF || '').trim())
      .filter((uf) => uf && uf !== 'NAO_INFORMADO')));
    const temManual = rows.some((row) => row.ORIGEM_META === 'MANUAL');
    const temPlanejamento = rows.some((row) => row.ORIGEM_META !== 'MANUAL');
    if (temManual && !temPlanejamento) return 'Meta lançada manualmente pela diretoria';
    const base = ufs.length > 0
      ? `Planejamento estratégico · ${ufs.join(', ')}`
      : 'Planejamento estratégico';
    return temManual ? `${base} (com ajuste manual da diretoria)` : base;
  }, [metaBuSelecionada, metasBu]);
  const metaSearchTerm = normalizeSearch(metaSearch);
  const metasVendedoresFiltrados = metasVendedores.filter((row) => {
    if (!metaSearchTerm) return true;
    return [row.RCA, row.COD_RCA, row.VENDEDOR_ID, metaBuLabel(row)].some((value) => normalizeSearch(value).includes(metaSearchTerm));
  });
  const metaVendedoresDistintosExibidos = new Set(metasVendedoresFiltrados.map((row) => String(row.VENDEDOR_ID))).size;
  // Quantas edicoes ainda nao foram gravadas — e o que o Salvar vai enviar.
  const metaEditsPendentes = metasVendedores.filter((row) => {
    const digitado = metaEdits[vendedorBuKey(row)];
    if (digitado == null) return false;
    const valor = parseCurrencyInput(digitado);
    if (valor == null) return true;
    return Math.abs(valor - toNumber(row.META_VALOR)) >= 0.005;
  }).length
    + Object.keys(metaRamoValueEdits).length;

  const metaStatusRateio = loadingMetas
    ? 'Status: carregando'
    : metasVendedores.length === 0
      ? 'Status: sem equipe no escopo'
      : metaEditsPendentes > 0
        ? 'Status: alteracoes nao salvas'
        : Math.abs(metaDiretoriaTotal - totalMetaDigitada) < 0.01
          ? 'Status: rateio fechado'
          : totalMetaDigitada <= 0
            ? 'Status: nao distribuido'
            : 'Status: em aberto';

  const totalVendedoresAtivos = new Set(metasVendedores.map((row) => String(row.VENDEDOR_ID))).size;
  const vendedoresComMeta = new Set(metasVendedores.filter((row) => metaEfetivaVendedor(row) > 0).map((row) => String(row.VENDEDOR_ID))).size;
  const percentualVendedoresComMeta = totalVendedoresAtivos > 0
    ? (vendedoresComMeta / totalVendedoresAtivos) * 100
    : 0;
  const ocupacaoPorRegiao = Object.entries(metasRamoUfFiltradas.reduce<Record<string, { meta: number; realizado: number }>>((acc, row) => {
    const key = row.UF === 'NAO_INFORMADO' ? 'Sem UF informada' : `UF ${row.UF}`;
    if (!acc[key]) acc[key] = { meta: 0, realizado: 0 };
    acc[key].meta += metaAjustadaRamoUf(row);
    acc[key].realizado += toNumber(row.FATURAMENTO_LIQUIDO);
    return acc;
  }, {}))
    .map(([name, item]) => ({ name, ...item, percent: item.meta > 0 ? (item.realizado / item.meta) * 100 : 0 }))
    .sort((a, b) => b.meta - a.meta)
    .slice(0, 3);
  const regiaoDestaque = ocupacaoPorRegiao[0] || null;
  const ramoDestaque = metasRamoUfChartData[0] || null;
  const desempenhoEstados = [...ocupacaoPorRegiao].sort((a, b) => b.percent - a.percent);
  const selectedMetaVendedor = selectedMetaVendedorKey == null
    ? null
    : metasVendedores.find((row) => vendedorBuKey(row) === selectedMetaVendedorKey) || null;
  // O rateio por ramo/UF e sobre a meta TOTAL do vendedor no periodo, somando
  // as BUs em que ele atua — e nao sobre a meta da BU de onde o popup foi aberto.
  const selectedMetaTotal = selectedMetaVendedor ? (metaTotalPorVendedor[vendedorTotalKey(selectedMetaVendedor)] ?? 0) : 0;
  const selectedMetaTotalSafe = Number.isFinite(selectedMetaTotal) ? selectedMetaTotal : 0;
  const selectedVendedorRamos = selectedMetaVendedor
    ? metasRamoUfFiltradas.filter((row) => vendedorTotalKey(row) === vendedorTotalKey(selectedMetaVendedor))
    : [];
  const selectedMetaRecorteSafe = hasMetaSegmentFilter && selectedVendedorRamos.length > 0
    ? selectedVendedorRamos.reduce((total, row) => total + metaAjustadaRamoUf(row), 0)
    : selectedMetaTotalSafe;
  function valorRamoEditado(key: string): number {
    if (metaRamoValueEdits[key] != null) return parseCurrencyInput(metaRamoValueEdits[key]) ?? 0;
    const pct = Number(normalizePercentInput(metaRamoPercentEdits[key] ?? '0'));
    return Number.isFinite(pct) ? (Math.max(0, pct) / 100) * selectedMetaRecorteSafe : 0;
  }
  const selectedVendedorRamoRows = selectedVendedorRamos.map((row) => {
    const key = vendedorRamoUfKey(row);
    // So a linha editada muda; as demais mantem o valor atual (nada e redirecionado).
    const editado = metaRamoValueEdits[key] != null || metaRamoPercentEdits[key] != null;
    const valorCalculado = editado ? valorRamoEditado(key) : metaAjustadaRamoUf(row);
    const percentCalculado = selectedMetaRecorteSafe > 0 ? (valorCalculado / selectedMetaRecorteSafe) * 100 : 0;
    const percentText = metaRamoPercentEdits[key] ?? formatEditablePercent(percentCalculado);
    const valueText = metaRamoValueEdits[key] ?? formatEditableCurrencyValue(valorCalculado);
    const realizado = toNumber(row.FATURAMENTO_LIQUIDO);
    return {
      key,
      ramo: String(row.RAMO_NOME || row.RAMO_CODE || 'Sem ramo'),
      uf: String(row.UF || 'NAO_INFORMADO') === 'NAO_INFORMADO' ? 'Sem UF informada' : String(row.UF),
      metaBase: toNumber(row.META_BASE_RITMO),
      percentText,
      valueText,
      valueNumber: valorCalculado,
      // Linha ja gravada pelo coordenador, ou editada agora: nao segue o rateio automatico.
      personalizado: editado || toNumber(row.PERSONALIZADO) === 1,
      realizado,
      faltaParaMeta: Math.max(valorCalculado - realizado, 0),
      // Venda em ramo/UF sem meta planejada: aparece pelo realizado, mas nao recebe meta.
      editavel: toNumber(row.PLANEJADO) === 1,
    };
  });
  const selectedVendedorTotalAjustado = selectedVendedorRamoRows.reduce((total, row) => total + row.valueNumber, 0);
  const selectedVendedorDisponivel = selectedMetaRecorteSafe - selectedVendedorTotalAjustado;

  function atualizarPercentualRamoVendedor(key: string, percentValue: string) {
    const percent = Number(normalizePercentInput(percentValue));
    const safePercent = Number.isFinite(percent) ? Math.max(0, percent) : 0;
    setMetaRamoPercentEdits((current) => ({ ...current, [key]: percentValue }));
    setMetaRamoValueEdits((current) => ({ ...current, [key]: formatEditableCurrencyValue((selectedMetaRecorteSafe * safePercent) / 100) }));
  }

  function atualizarValorRamoVendedor(key: string, value: string) {
    const valueNumber = Number(normalizeCurrencyInput(value));
    const safeValue = Number.isFinite(valueNumber) ? Math.max(0, valueNumber) : 0;
    setMetaRamoValueEdits((current) => ({ ...current, [key]: value }));
    setMetaRamoPercentEdits((current) => ({ ...current, [key]: formatEditablePercent(selectedMetaRecorteSafe > 0 ? (safeValue / selectedMetaRecorteSafe) * 100 : 0) }));
  }

  const periodLabel = `${formatDateBr(resolvedAppliedPeriod.dataInicio)} a ${formatDateBr(resolvedAppliedPeriod.dataFim)}`;
  const evolucaoSubtitle = isDailyEvolution
    ? 'Acompanhamento dos dias úteis do período selecionado com realizado líquido comparado à meta.'
    : appliedFilters.preset === 'ultimos3'
      ? 'Acompanhamento mensal do último trimestre com realizado líquido comparado à meta.'
      : appliedFilters.preset === 'ultimoAno'
        ? 'Acompanhamento mensal do último ano com realizado líquido comparado à meta.'
        : 'Acompanhamento mensal do período selecionado com realizado líquido comparado à meta.';
  const draftPeriod = resolvePeriod(filters);
  const draftPeriodLabel = `${formatDateBr(draftPeriod.dataInicio)} a ${formatDateBr(draftPeriod.dataFim)}`;
  const activeFiltersCount = 1 + filters.filiais.length + filters.departamentos.length + filters.secoes.length + filters.ramos.length + selectedValues(filters.cliente).length;
  const visibleTabs = ANALYTICS_TABS.filter((tab) => tab.value !== 'metas' || canSeeMetasTab);

  return (
    <div className="animate-fadeIn space-y-5 analytics-page mx-auto max-w-[1280px]">
      <CoordinatorScopeFilter scope={coordinatorScope} />

      <div className="rounded-[30px] analytics-hero px-6 py-5 flex items-center justify-between gap-5 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#137432', color: '#ffffff' }}>
            <BarChart3 size={24} />
          </div>
          <div>
            <p className="text-[11px] label-ui font-bold" style={{ color: '#137432' }}>Analytics Comercial RCA</p>
            <h1 className="font-display text-[34px] leading-none font-extrabold tracking-[0.08em]" style={{ color: 'var(--color-text)' }}>ANALYTICS COMERCIAL</h1>
            <p className="text-sm mt-2" style={{ color: 'var(--color-text-secondary)' }}>Performance, carteira, mix e devoluções do vendedor logado.</p>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 px-4 py-3 rounded-full text-sm font-semibold" style={{ backgroundColor: '#eef2eb', color: '#516153' }}>
          <CalendarRange size={18} /> {periodLabel}
        </div>
      </div>

      <div className="md:hidden space-y-2">
        <button
          type="button"
          onClick={() => setFiltrosMobileOpen(true)}
          className="w-full rounded-2xl px-4 py-3 flex items-center justify-between gap-3 analytics-soft-card"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.96)', border: '1px solid #edf0eb' }}
        >
          <span className="inline-flex items-center gap-2 text-sm font-extrabold" style={{ color: 'var(--color-text)' }}>
            <Filter size={17} style={{ color: 'var(--color-primary)' }} />
            Filtros
          </span>
          <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
            {activeFiltersCount} ativo(s)
            <ChevronDown size={14} />
          </span>
        </button>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <span className="shrink-0 rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: '#eef2eb', color: '#516153' }}>{draftPeriodLabel}</span>
          {coordinatorScope.canUseScope && filters.filiais.length ? <span className="shrink-0 rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>Filiais: {filters.filiais.length}</span> : null}
          {coordinatorScope.canUseScope && filters.departamentos.length ? <span className="shrink-0 rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>Deptos: {filters.departamentos.length}</span> : null}
          {coordinatorScope.canUseScope && filters.secoes.length ? <span className="shrink-0 rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>Seções: {filters.secoes.length}</span> : null}
          {filters.ramos.length ? <span className="shrink-0 rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>Ramos: {filters.ramos.length}</span> : null}
          {filters.cliente ? <span className="shrink-0 rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>Clientes: {clienteSelecionadoLabel}</span> : null}
        </div>
      </div>

      <section className="hidden md:block sticky top-3 z-20 rounded-[26px] p-4 analytics-soft-card" style={{ backgroundColor: 'rgba(255, 255, 255, 0.96)', border: '1px solid #edf0eb', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Filter size={18} style={{ color: 'var(--color-primary)' }} />
          <h2 className="font-display text-lg font-extrabold" style={{ color: 'var(--color-text)' }}>Filtros da análise</h2>
          {loadingFilters ? <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--color-primary)' }}><Loader2 size={14} className="animate-spin" /> Carregando filtros</span> : null}
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <SingleSelect label="Período" value={filters.preset} options={PERIOD_OPTIONS} onChange={(value) => setFilters((current) => ({ ...current, preset: value as PresetPeriodo }))} />
          {filters.preset === 'customizado' ? (
            <>
              <label className="min-w-[150px]">
                <span className="block text-xs label-ui font-semibold mb-1" style={{ color: '#748070' }}>Início</span>
                <input
                  type="text"
                  value={isoToDateInputBr(filters.dataInicio)}
                  placeholder="DD/MM/AAAA"
                  onChange={(event) => setFilters((current) => ({ ...current, dataInicio: dateInputBrToIso(event.target.value) }))}
                  className="h-10 w-full px-3 rounded-xl text-sm font-semibold"
                  style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                />
              </label>
              <label className="min-w-[150px]">
                <span className="block text-xs label-ui font-semibold mb-1" style={{ color: '#748070' }}>Fim</span>
                <input
                  type="text"
                  value={isoToDateInputBr(filters.dataFim)}
                  placeholder="DD/MM/AAAA"
                  onChange={(event) => setFilters((current) => ({ ...current, dataFim: dateInputBrToIso(event.target.value) }))}
                  className="h-10 w-full px-3 rounded-xl text-sm font-semibold"
                  style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                />
              </label>
            </>
          ) : null}
          {coordinatorScope.canUseScope ? <MultiSelect label="Filiais" options={filterOptions.filiais} selected={filters.filiais} placeholder="Todas" onChange={(filiais) => setFilters((current) => ({ ...current, filiais }))} /> : null}
          {coordinatorScope.canUseScope ? <MultiSelect label="Departamentos" options={filterOptions.departamentos} selected={filters.departamentos} placeholder="Todos" onChange={(departamentos) => setFilters((current) => ({ ...current, departamentos }))} /> : null}
          {coordinatorScope.canUseScope ? <MultiSelect label="Seções" options={filterOptions.secoes} selected={filters.secoes} placeholder="Todas" onChange={(secoes) => setFilters((current) => ({ ...current, secoes }))} /> : null}
          <MultiSelect label="Ramos" options={filterOptions.ramos} selected={filters.ramos} placeholder="Todos" onChange={(ramos) => setFilters((current) => ({ ...current, ramos }))} />
          <SearchableMultiSelect label="Cliente" value={filters.cliente} options={filterOptions.clientes} onChange={(cliente) => setFilters((current) => ({ ...current, cliente }))} placeholder="Todos da carteira" disabled={loadingFilters} />
          <button
            type="button"
            disabled={loadingData}
            onClick={() => {
              loadAnalytics(filters, 0);
              loadClienteEvolucao(filters);
            }}
            className="h-10 px-5 rounded-xl font-bold inline-flex items-center gap-2 mt-5 disabled:opacity-70"
            style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}
          >
            {loadingData ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
            Buscar
          </button>
        </div>
      </section>

      {filtrosMobileOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-3 md:hidden" onClick={() => setFiltrosMobileOpen(false)}>
          <div
            className="w-full max-w-md rounded-[28px] p-4 animate-slideIn analytics-soft-card"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] label-ui font-bold" style={{ color: 'var(--color-primary)' }}>Filtros</p>
                <h2 className="font-display text-xl font-extrabold" style={{ color: 'var(--color-text)' }}>Filtros da análise</h2>
                <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Ajuste a análise sem ocupar espaço na tela.</p>
              </div>
              <button
                type="button"
                onClick={() => setFiltrosMobileOpen(false)}
                className="h-10 w-10 rounded-full inline-flex items-center justify-center"
                style={{ backgroundColor: '#eef2eb', color: '#516153' }}
                aria-label="Fechar filtros"
              >
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[72vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><SingleSelect label="Período" value={filters.preset} options={PERIOD_OPTIONS} onChange={(value) => setFilters((current) => ({ ...current, preset: value as PresetPeriodo }))} /></div>
                {filters.preset === 'customizado' ? (
                  <>
                    <label className="min-w-0">
                      <span className="block text-xs label-ui font-semibold mb-1" style={{ color: '#748070' }}>Início</span>
                      <input
                        type="text"
                        value={isoToDateInputBr(filters.dataInicio)}
                        placeholder="DD/MM/AAAA"
                        onChange={(event) => setFilters((current) => ({ ...current, dataInicio: dateInputBrToIso(event.target.value) }))}
                        className="h-10 w-full px-3 rounded-xl text-sm font-semibold"
                        style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                      />
                    </label>
                    <label className="min-w-0">
                      <span className="block text-xs label-ui font-semibold mb-1" style={{ color: '#748070' }}>Fim</span>
                      <input
                        type="text"
                        value={isoToDateInputBr(filters.dataFim)}
                        placeholder="DD/MM/AAAA"
                        onChange={(event) => setFilters((current) => ({ ...current, dataFim: dateInputBrToIso(event.target.value) }))}
                        className="h-10 w-full px-3 rounded-xl text-sm font-semibold"
                        style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                      />
                    </label>
                  </>
                ) : null}
                {coordinatorScope.canUseScope ? <div className="col-span-2"><MultiSelect label="Filiais" options={filterOptions.filiais} selected={filters.filiais} placeholder="Todas" onChange={(filiais) => setFilters((current) => ({ ...current, filiais }))} /></div> : null}
                {coordinatorScope.canUseScope ? <div className="col-span-2"><MultiSelect label="Departamentos" options={filterOptions.departamentos} selected={filters.departamentos} placeholder="Todos" onChange={(departamentos) => setFilters((current) => ({ ...current, departamentos }))} /></div> : null}
                {coordinatorScope.canUseScope ? <div className="col-span-2"><MultiSelect label="Seções" options={filterOptions.secoes} selected={filters.secoes} placeholder="Todas" onChange={(secoes) => setFilters((current) => ({ ...current, secoes }))} /></div> : null}
                <div className="col-span-2"><MultiSelect label="Ramos" options={filterOptions.ramos} selected={filters.ramos} placeholder="Todos" onChange={(ramos) => setFilters((current) => ({ ...current, ramos }))} /></div>
                <div className="col-span-2"><SearchableMultiSelect label="Cliente" value={filters.cliente} options={filterOptions.clientes} onChange={(cliente) => setFilters((current) => ({ ...current, cliente }))} placeholder="Todos da carteira" disabled={loadingFilters} /></div>
              </div>
            </div>
            <button
              type="button"
              disabled={loadingData}
              onClick={() => {
                loadAnalytics(filters, 0);
                loadClienteEvolucao(filters);
                setFiltrosMobileOpen(false);
              }}
              className="mt-4 h-11 w-full rounded-xl font-bold inline-flex items-center justify-center gap-2 disabled:opacity-70"
              style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}
            >
              {loadingData ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
              Buscar
            </button>
          </div>
        </div>
      ) : null}

      {data.errors.length > 0 ? (
        <div className="rounded-3xl p-4 flex items-start gap-3" style={{ backgroundColor: '#fff1f0', border: '1px solid #ffd8d3', color: '#b42318' }}>
          <AlertTriangle size={20} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Alguns blocos não carregaram.</p>
            <p className="text-sm mt-1">{data.errors.join(' ')}</p>
          </div>
        </div>
      ) : null}

      <nav className="rounded-[24px] p-2 analytics-soft-card flex gap-2 overflow-x-auto" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }} aria-label="Sub-abas do Analytics">
        {visibleTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className="h-10 shrink-0 rounded-2xl px-4 text-sm font-extrabold transition-all"
            style={{
              backgroundColor: activeTab === tab.value ? 'var(--color-primary)' : '#eef2eb',
              color: activeTab === tab.value ? '#ffffff' : '#516153',
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {canSeeMetasTab ? (
        <div className={activeTab === 'metas' ? 'space-y-5' : 'hidden'}>
          <div className="rounded-[30px] overflow-hidden analytics-soft-card" style={{ backgroundColor: '#fbfcfa', border: '1px solid #edf0eb' }}>
            <div className="px-6 py-5 flex items-start justify-between gap-4 flex-wrap" style={{ borderBottom: '1px solid #edf0eb' }}>
              <div>
                <p className="text-[11px] label-ui font-bold" style={{ color: 'var(--color-primary)' }}>{metaStatusRateio}</p>
                <h2 className="font-display text-[28px] leading-tight font-extrabold" style={{ color: 'var(--color-text)' }}>{canEditMetas ? 'Redistribuição de Metas' : 'Acompanhamento de Metas por Coordenador'}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: 'var(--color-text-secondary)' }}>{canEditMetas ? 'Gerencie o rateio da meta geral entre sua equipe. Os ajustes manuais nos valores dos vendedores são refletidos instantaneamente nos indicadores de saldo e distribuição.' : 'Acompanhe a distribuição das metas por coordenador, BU, vendedor, UF e ramo usando o escopo selecionado acima.'}</p>
              </div>
              <button
                type="button"
                onClick={salvarRedistribuicaoMetas}
                disabled={!canEditMetas || salvandoMetas || loadingMetas || metasVendedores.length === 0}
                className="h-11 px-6 rounded-2xl font-extrabold inline-flex items-center gap-2 disabled:opacity-60 shadow-sm"
                style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}
              >
                {salvandoMetas ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
                {canEditMetas ? 'Salvar' : 'Somente leitura'}
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="rounded-[22px] p-5" style={{ backgroundColor: '#ffffff', border: '1px solid #e3e9df', boxShadow: '0 14px 32px rgba(27,28,26,0.045)' }}>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.8fr_1.2fr_1.6fr_auto] gap-4 items-end">
                  <SingleSelect label="Mês de referência" value={metaMes} options={MONTH_OPTIONS} onChange={(value) => trocarPeriodoMetas('mes', value)} />
                  <SingleSelect label="Ano" value={metaAno} options={yearOptions} onChange={(value) => trocarPeriodoMetas('ano', value)} />
                  <SingleSelect label="Filial / BU" value={metaBuSelecionada} options={metaBuOptions} onChange={trocarBuMetas} disabled={loadingMetas || metaBuOptions.length <= 1} />
                  <SingleSelect label="UF" value={metaUfSelecionada} options={metaUfOptions} onChange={setMetaUfSelecionada} disabled={loadingMetas || metaUfOptions.length <= 1} />
                  <SingleSelect label="Ramo" value={metaRamoSelecionado} options={metaRamoOptions} onChange={setMetaRamoSelecionado} disabled={loadingMetas || metaRamoOptions.length <= 1} />
                  <button
                    type="button"
                    onClick={() => { if (confirmarDescarteMetas()) loadMetas(metaMes, metaAno, metaBuSelecionada); }}
                    disabled={loadingMetas}
                    className="h-10 px-5 rounded-2xl font-extrabold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                    style={{ backgroundColor: '#ffffff', color: 'var(--color-primary)', border: '1px solid var(--color-primary)' }}
                  >
                    {loadingMetas ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    Atualizar Dados
                  </button>
                </div>
              </div>

              {metaError ? (
                <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ backgroundColor: '#fff1f0', color: '#b42318', border: '1px solid #ffd8d3' }}>{metaError}</div>
              ) : null}
              {metaStatusMsg ? (
                <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ backgroundColor: '#e6f4ea', color: '#137432', border: '1px solid #cde7d3' }}>{metaStatusMsg}</div>
              ) : null}

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                <MetricCard label={hasMetaSegmentFilter ? 'Meta do recorte' : 'Meta geral'} value={formatCurrency(metaGeralExibida)} helper={hasMetaSegmentFilter ? `Recorte: ${metaRecorteLabel}` : (metaOrigemLabel || `Recorte: ${metaRecorteLabel}`)} icon={<Target size={20} />} tone="green" />
                <MetricCard
                  label={hasMetaSegmentFilter ? 'Realizado no recorte' : 'Total distribuído'}
                  value={formatCurrency(totalDistribuidoExibido)}
                  helper={`${formatPercent(percentualDistribuidoExibido)} ${hasMetaSegmentFilter ? 'da meta do recorte' : 'da meta geral'}`}
                  icon={<TrendingUp size={20} />}
                  tone="blue"
                />
                <MetricCard
                  label={hasMetaSegmentFilter ? 'Falta para a meta' : 'Saldo disponível'}
                  value={formatCurrency(saldoExibido)}
                  helper={hasMetaSegmentFilter
                    ? (saldoExibido <= 0.01 ? 'Meta do recorte atingida' : 'Ainda a realizar')
                    : (Math.abs(saldoExibido) < 0.01 ? 'Rateio fechado' : 'Pendente de alocação')}
                  icon={<Banknote size={20} />}
                  tone={hasMetaSegmentFilter
                    ? (saldoExibido <= 0.01 ? 'green' : 'amber')
                    : (Math.abs(saldoExibido) < 0.01 ? 'green' : 'amber')}
                />
                <MetricCard label="Vendedores com meta" value={formatPercent(percentualVendedoresComMeta)} helper={`${formatDecimal(vendedoresComMeta)} de ${formatDecimal(totalVendedoresAtivos)} colaboradores`} icon={<Users size={20} />} tone="purple" />
              </div>

              <div className="relative overflow-hidden rounded-[24px] p-6" style={{ backgroundColor: '#f2f8f0', border: '1px solid #e3efdf' }}>
                <div className="absolute -right-8 -top-8 h-40 w-40 rounded-[36px] rotate-12" style={{ backgroundColor: 'rgba(21,107,22,0.05)' }} />
                <div className="relative flex items-start justify-between gap-5 flex-wrap">
                  <div>
                    <h3 className="font-display text-2xl font-extrabold" style={{ color: 'var(--color-text)' }}>Ajuste inteligente de metas</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'var(--color-text-secondary)' }}>Utilize ferramentas de automação para acelerar o processo de rateio com base em critérios históricos ou de performance.</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full px-3 py-1 text-xs font-extrabold" style={{ backgroundColor: '#ffffff', color: 'var(--color-primary)', border: '1px solid #dce7d7' }}>{vendedoresNoRitmo} no ritmo</span>
                      <span className="rounded-full px-3 py-1 text-xs font-extrabold" style={{ backgroundColor: vendedoresEmRisco > 0 ? '#fff1f0' : '#ffffff', color: vendedoresEmRisco > 0 ? '#b42318' : 'var(--color-primary)', border: vendedoresEmRisco > 0 ? '1px solid #ffd8d3' : '1px solid #dce7d7' }}>{vendedoresEmRisco} em risco</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={() => aplicarRateioRapido('igual')} disabled={!canEditMetas || loadingMetas || metasVendedores.length === 0} className="h-10 px-4 rounded-2xl text-sm font-extrabold inline-flex items-center gap-2 disabled:opacity-50" style={{ backgroundColor: '#ffffff', color: 'var(--color-primary)', border: '1px solid #dce7d7' }}><BarChart3 size={15} /> Ratear igual</button>
                    <button type="button" onClick={() => aplicarRateioRapido('realizado')} disabled={!canEditMetas || loadingMetas || metasVendedores.length === 0} className="h-10 px-4 rounded-2xl text-sm font-extrabold inline-flex items-center gap-2 disabled:opacity-50" style={{ backgroundColor: '#ffffff', color: 'var(--color-primary)', border: '1px solid #dce7d7' }}><TrendingUp size={15} /> Por realizado</button>
                    <button type="button" onClick={() => aplicarRateioRapido('atual')} disabled={!canEditMetas || loadingMetas || metasVendedores.length === 0} className="h-10 px-4 rounded-2xl text-sm font-extrabold inline-flex items-center gap-2 disabled:opacity-50" style={{ backgroundColor: '#ffffff', color: 'var(--color-primary)', border: '1px solid #dce7d7' }}><Percent size={15} /> Manter proporção</button>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] overflow-hidden" style={{ backgroundColor: '#ffffff', border: '1px solid #e3e9df', boxShadow: '0 14px 32px rgba(27,28,26,0.045)' }}>
                <div className="px-6 py-5 flex items-center justify-between gap-4 flex-wrap" style={{ borderBottom: '1px solid #edf0eb' }}>
                  <div>
                    <h3 className="font-display text-xl font-extrabold" style={{ color: 'var(--color-text)' }}>Detalhamento por Vendedor</h3>
                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{canEditMetas ? 'Ajuste os valores individuais na coluna "Nova meta".' : 'Visualize a meta atual, realizado e atingimento por vendedor.'} Cada vendedor aparece uma vez por Filial/BU em que atua — use o filtro "Filial / BU" acima para trabalhar uma de cada vez.</p>
                  </div>
                  <label className="h-10 min-w-[260px] rounded-2xl px-4 inline-flex items-center gap-2" style={{ backgroundColor: '#f6f7f4', border: '1px solid #dfe6dc', color: '#788276' }}>
                    <Search size={16} />
                    <input value={metaSearch} onChange={(event) => setMetaSearch(event.target.value)} className="w-full bg-transparent outline-none text-sm font-semibold" style={{ color: 'var(--color-text)' }} placeholder="Filtrar por nome, ID ou BU..." />
                  </label>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-sm">
                    <thead>
                      <tr style={{ backgroundColor: '#fbfcfa', color: '#7a8378', borderBottom: '1px solid #edf0eb' }}>
                        {['Vendedor', 'Meta atual', 'Nova meta (R$)', 'Impacto', 'Ações'].map((header) => (
                          <th key={header} className="px-6 py-4 text-left text-[11px] font-extrabold uppercase tracking-[0.14em]">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {metasVendedoresFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{metaSearchTerm ? `Nenhum vendedor corresponde a "${metaSearch}".` : 'Nenhum vendedor ativo nas BUs deste escopo para o periodo selecionado.'}</td>
                        </tr>
                      ) : metasVendedoresFiltrados.map((row, index) => {
                        const vendedorId = vendedorBuKey(row);
                        const metaAtual = toNumber(row.META_VALOR);
                        const metaValue = metaInputValueVendedor(row);
                        const metaProposta = parseCurrencyInput(metaValue);
                        const impacto = metaAtual > 0 && metaProposta != null ? ((metaProposta - metaAtual) / metaAtual) * 100 : 0;
                        const impactColor = impacto < 0 ? '#b42318' : impacto > 0 ? 'var(--color-primary)' : '#7a8378';
                        const impactBg = impacto < 0 ? '#fff1f0' : impacto > 0 ? 'var(--color-primary-bg)' : '#eef2eb';
                        return (
                          <tr key={vendedorId} style={{ borderBottom: '1px solid #f0f2ee' }}>
                            <td className="px-6 py-4">
                              <button type="button" onClick={() => setSelectedMetaVendedorKey(vendedorBuKey(row))} className="flex items-center gap-3 text-left rounded-2xl px-2 py-1 -ml-2 transition-colors" style={{ color: 'inherit' }}>
                                <span className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-extrabold" style={{ backgroundColor: index % 3 === 0 ? 'var(--color-primary-bg)' : index % 3 === 1 ? '#edf2f0' : '#f5f1ed', color: index % 3 === 0 ? 'var(--color-primary)' : '#42685d' }}>{initialsFromName(row.RCA)}</span>
                                <div>
                                  <p className="font-extrabold" style={{ color: 'var(--color-text)' }}>{row.RCA || 'Sem nome'}</p>
                                  <p className="text-xs mt-0.5 font-bold" style={{ color: 'var(--color-primary)' }}>{metaBuLabel(row)}</p>
                                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>ID: {row.COD_RCA || row.VENDEDOR_ID} · detalhamento por UF e ramo</p>
                                </div>
                              </button>
                            </td>
                            <td className="px-6 py-4 font-bold" style={{ color: 'var(--color-text)' }}>{formatCurrency(metaAtual)}</td>
                            <td className="px-6 py-4">
                              <input
                                value={metaValue}
                                onChange={(event) => atualizarMetaPorValor(vendedorId, event.target.value)}
                                readOnly={!canEditMetas}
                                className="h-10 w-44 rounded-2xl px-4 text-sm font-bold outline-none transition-colors"
                                style={{ backgroundColor: impacto < 0 ? '#fff8f7' : '#ffffff', color: 'var(--color-text)', border: impacto < 0 ? '1px solid #efc6c0' : '1px solid #dfe6dc' }}
                              />
                            </td>
                            <td className="px-6 py-4">
                              <span className="inline-flex rounded-full px-3 py-1 text-xs font-extrabold" style={{ backgroundColor: impactBg, color: impactColor }}>{impacto > 0 ? '+' : ''}{formatPercent(impacto)}</span>
                            </td>
                            <td className="px-6 py-4">
                              <button type="button" onClick={() => setSelectedMetaVendedorKey(vendedorBuKey(row))} className="h-9 w-9 rounded-full inline-flex items-center justify-center" style={{ backgroundColor: '#ffffff', color: '#5d675a' }} aria-label={`Editar ramos de ${row.RCA || 'vendedor'}`}>
                                <Edit3 size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-6 py-4 flex items-center justify-between gap-3 flex-wrap" style={{ backgroundColor: '#ffffff' }}>
                  <p className="text-[11px] label-ui font-extrabold" style={{ color: '#7a8378' }}>Exibindo {metasVendedoresFiltrados.length} de {metasVendedores.length} linhas · {metaVendedoresDistintosExibidos} vendedor(es) — uma linha por Filial/BU</p>
                  {metaEditsPendentes > 0 ? (
                    <p className="text-[11px] label-ui font-extrabold" style={{ color: '#b26a00' }}>{metaEditsPendentes} alteração(ões) não salva(s)</p>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="rounded-[24px] p-6" style={{ backgroundColor: '#ffffff', border: '1px solid #e3e9df', boxShadow: '0 14px 32px rgba(27,28,26,0.045)' }}>
                  <div className="flex items-start justify-between gap-3 mb-6">
                    <div>
                      <h3 className="font-display text-xl font-extrabold" style={{ color: 'var(--color-text)' }}>Ocupação por Região</h3>
                      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Distribuição da meta total por UF.</p>
                    </div>
                    <MoreVertical size={18} style={{ color: '#7a8378' }} />
                  </div>
                  <div className="space-y-5">
                    {(ocupacaoPorRegiao.length ? ocupacaoPorRegiao : [{ name: 'Sem dados', meta: 0, realizado: 0, percent: 0 }]).map((row, index) => (
                      <div key={row.name}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="text-sm font-extrabold" style={{ color: 'var(--color-text)' }}>{row.name}</p>
                          <p className="text-sm font-bold" style={{ color: '#5f675c' }}>{formatCurrency(row.realizado)} <span style={{ color: '#a5aea1' }}>/ {formatCurrency(row.meta)}</span></p>
                        </div>
                        <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: '#eef2eb' }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, row.percent))}%`, backgroundColor: index === 1 ? '#42685d' : 'var(--color-primary)' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-8 grid grid-cols-2 gap-4 pt-5" style={{ borderTop: '1px solid #edf0eb' }}>
                    <div className="text-center">
                      <p className="text-[11px] label-ui font-bold" style={{ color: '#7a8378' }}>Meta média</p>
                      <p className="mt-1 text-2xl font-extrabold" style={{ color: 'var(--color-primary)' }}>{formatCurrency(metasVendedores.length ? totalMetaDigitada / metasVendedores.length : 0)}</p>
                    </div>
                    <div className="text-center" style={{ borderLeft: '1px solid #edf0eb' }}>
                      <p className="text-[11px] label-ui font-bold" style={{ color: '#7a8378' }}>Aderência</p>
                      <p className="mt-1 text-2xl font-extrabold" style={{ color: 'var(--color-text)' }}>{formatPercent(percentualMetaRamoUf)}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] p-6" style={{ backgroundColor: '#ffffff', border: '1px solid #e3e9df', boxShadow: '0 14px 32px rgba(27,28,26,0.045)' }}>
                  <div className="flex items-start justify-between gap-3 mb-6">
                    <div>
                      <h3 className="font-display text-xl font-extrabold" style={{ color: 'var(--color-text)' }}>Insights Estratégicos</h3>
                      <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Cruzamento de ramo e UF.</p>
                      <p className="mt-1 text-xs font-bold" style={{ color: '#7a8378' }}>Devoluções no recorte: {formatCurrency(totalDevolvidoRamoUf)}</p>
                    </div>
                    <button type="button" onClick={exportarComparativoExcel} className="h-8 rounded-full px-4 text-xs font-extrabold" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>Exportar relatório</button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-[18px] p-5" style={{ backgroundColor: '#fbfcfa', border: '1px solid #edf0eb' }}>
                      <p className="text-[11px] label-ui font-extrabold inline-flex items-center gap-2" style={{ color: 'var(--color-primary)' }}><MapPin size={15} /> Região destaque</p>
                      <p className="mt-3 text-4xl font-extrabold" style={{ color: 'var(--color-text)' }}>{formatPercent(regiaoDestaque?.percent || 0)}</p>
                      <p className="mt-1 text-xs font-bold uppercase" style={{ color: '#7a8378' }}>{regiaoDestaque?.name || 'Sem dados'}</p>
                    </div>
                    <div className="rounded-[18px] p-5" style={{ backgroundColor: '#fbfcfa', border: '1px solid #edf0eb' }}>
                      <p className="text-[11px] label-ui font-extrabold inline-flex items-center gap-2" style={{ color: '#42685d' }}><Package size={15} /> Ramo líder</p>
                      <p className="mt-3 text-4xl font-extrabold" style={{ color: 'var(--color-text)' }}>{formatPercent(ramoDestaque && totalMetaRamoUf > 0 ? (ramoDestaque.value / totalMetaRamoUf) * 100 : 0)}</p>
                      <p className="mt-1 text-xs font-bold uppercase truncate" style={{ color: '#7a8378' }}>{ramoDestaque?.fullName || ramoDestaque?.name || 'Sem dados'}</p>
                    </div>
                  </div>
                  <div className="mt-6">
                    <p className="mb-4 text-[11px] label-ui font-extrabold" style={{ color: '#7a8378' }}>Performance por estado</p>
                    <div className="space-y-4">
                      {(desempenhoEstados.length ? desempenhoEstados : [{ name: 'Sem dados', percent: 0 }]).map((row, index) => (
                        <div key={row.name} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-5">
                            <span className="w-6 text-xs font-bold" style={{ color: '#7a8378' }}>{String(index + 1).padStart(2, '0')}</span>
                            <p className="font-bold" style={{ color: 'var(--color-text)' }}>{row.name.replace('UF ', '')}</p>
                          </div>
                          <span className="rounded-full px-3 py-1 text-[11px] font-extrabold uppercase" style={{ backgroundColor: index === 0 ? 'var(--color-primary-bg)' : row.percent < 80 ? '#fff1f0' : '#eef2eb', color: index === 0 ? 'var(--color-primary)' : row.percent < 80 ? '#b42318' : '#6f786d' }}>{index === 0 ? 'Top performance' : row.percent < 80 ? 'Alerta déficit' : 'Estável'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {selectedMetaVendedor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={() => setSelectedMetaVendedorKey(null)}>
          <div className="w-full max-w-5xl max-h-[88vh] overflow-hidden rounded-[30px] animate-scaleIn" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', boxShadow: '0 24px 70px rgba(18,30,22,0.24)' }} onClick={(event) => event.stopPropagation()}>
            <div className="px-6 py-5 flex items-start justify-between gap-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div>
                <p className="text-[11px] label-ui font-bold" style={{ color: 'var(--color-primary)' }}>Meta por ramo de atividade</p>
                <h3 className="font-display text-2xl font-extrabold" style={{ color: 'var(--color-text)' }}>{selectedMetaVendedor.RCA || 'Vendedor'}</h3>
                <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Redirecione o percentual da meta do vendedor entre os ramos disponíveis no recorte atual.</p>
              </div>
              <button type="button" onClick={() => setSelectedMetaVendedorKey(null)} className="h-10 w-10 rounded-full inline-flex items-center justify-center" style={{ backgroundColor: '#eef2eb', color: '#516153' }} aria-label="Fechar popup de metas por ramo">
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto max-h-[calc(88vh-92px)]">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <MetricCard label="Meta do vendedor" value={formatCurrency(selectedMetaRecorteSafe)} helper={`Valor base para distribuir em ${metaRecorteLabel}.`} icon={<Target size={20} />} tone="green" />
                <MetricCard label="Já ajustado" value={formatCurrency(selectedVendedorTotalAjustado)} helper={`${formatPercent(selectedMetaRecorteSafe > 0 ? (selectedVendedorTotalAjustado / selectedMetaRecorteSafe) * 100 : 0)} da meta`} icon={<TrendingUp size={20} />} tone="blue" />
                <MetricCard label="Disponível" value={formatCurrency(selectedVendedorDisponivel)} helper={Math.abs(selectedVendedorDisponivel) < 0.01 ? 'Distribuição fechada' : selectedVendedorDisponivel < 0 ? 'Ramos fixos passam da meta' : 'Falta distribuir'} icon={<Banknote size={20} />} tone={selectedVendedorDisponivel < -0.01 ? 'red' : Math.abs(selectedVendedorDisponivel) < 0.01 ? 'green' : 'amber'} />
                <MetricCard label="Ramos" value={formatDecimal(selectedVendedorRamoRows.length)} helper="Ramos/UF disponíveis para este vendedor." icon={<Package size={20} />} tone="purple" />
              </div>

              {selectedVendedorRamoRows.length === 0 ? (
                <div className="rounded-[18px] p-4 text-sm font-semibold" style={{ backgroundColor: '#f6f7f4', color: '#6f786d', border: '1px solid #edf0eb' }}>Nenhum ramo encontrado para este vendedor no filtro atual.</div>
              ) : (
                <div className="space-y-3">
                  {selectedVendedorRamoRows.map((row) => (
                    <div key={row.key} className="rounded-[20px] p-4 grid grid-cols-1 lg:grid-cols-[minmax(220px,1fr)_120px_150px_150px_150px] gap-3 items-center" style={{ backgroundColor: '#fbfcfa', border: '1px solid #e3e9df' }}>
                      <div className="min-w-0">
                        <p className="font-extrabold truncate" style={{ color: 'var(--color-text)' }}>{row.ramo}</p>
                        <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>UF: {row.uf} · {row.editavel ? `Base: ${formatCurrency(row.metaBase)}` : 'Sem meta planejada (só realizado)'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] label-ui font-bold mb-1" style={{ color: '#7a8378' }}>% da meta</p>
                        <input value={row.percentText} onChange={(event) => atualizarPercentualRamoVendedor(row.key, event.target.value)} readOnly={!canEditMetas || !row.editavel} className="h-10 w-full rounded-2xl px-3 text-sm font-bold outline-none" style={{ backgroundColor: '#ffffff', color: 'var(--color-text)', border: '1px solid #dfe6dc' }} />
                      </div>
                      <div>
                        <p className="text-[10px] label-ui font-bold mb-1 inline-flex items-center gap-1.5" style={{ color: '#7a8378' }}>
                          Meta do ramo
                          {row.personalizado ? (
                            <span className="rounded-full px-1.5 py-0.5 text-[9px] font-extrabold" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>personalizada</span>
                          ) : null}
                        </p>
                        <input value={row.valueText} onChange={(event) => atualizarValorRamoVendedor(row.key, event.target.value)} readOnly={!canEditMetas || !row.editavel} className="h-10 w-full rounded-2xl px-3 text-sm font-bold outline-none" style={{ backgroundColor: '#ffffff', color: 'var(--color-text)', border: '1px solid #dfe6dc' }} />
                      </div>
                      <div>
                        <p className="text-[10px] label-ui font-bold mb-1" style={{ color: '#7a8378' }}>Realizado</p>
                        <p className="text-sm font-extrabold" style={{ color: 'var(--color-text)' }}>{formatCurrency(row.realizado)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] label-ui font-bold mb-1" style={{ color: '#7a8378' }}>Falta para meta</p>
                        <p className="text-sm font-extrabold" style={{ color: row.faltaParaMeta > 0.01 ? '#a26a00' : 'var(--color-primary)' }}>{formatCurrency(row.faltaParaMeta)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" onClick={() => setSelectedMetaVendedorKey(null)} className="h-10 px-4 rounded-2xl text-sm font-extrabold" style={{ backgroundColor: '#eef2eb', color: '#516153' }}>Cancelar</button>
                <button type="button" disabled={!canEditMetas} onClick={() => { setMetaStatusMsg('Distribuição por ramo/UF ajustada. Clique em Salvar para gravar.'); setSelectedMetaVendedorKey(null); }} className="h-10 px-5 rounded-2xl text-sm font-extrabold disabled:opacity-60" style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}>{canEditMetas ? 'Aplicar ao vendedor' : 'Somente leitura'}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className={activeTab === 'overview' ? 'space-y-5' : 'hidden'}>
      <Section title="Overview Comercial" subtitle="Resumo de meta, faturamento líquido, devoluções, QTD e projeção para o período." action={loadingData ? <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--color-primary)' }}><Loader2 size={16} className="animate-spin" /> Atualizando</span> : null}>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard label="Meta do período" value={formatCurrency(valorMeta)} helper="Meta distribuída pelo coordenador para o usuário logado." icon={<Target size={20} />} tone="green" />
            <MetricCard label="Faturamento líquido" value={formatCurrency(faturamentoLiquido)} helper={`${formatCurrency(toNumber(meta.FATURAMENTO_BRUTO))} bruto menos devoluções.`} icon={<TrendingUp size={20} />} tone="blue" />
            <MetricCard label="Falta para meta" value={formatCurrency(toNumber(meta.VALOR_FALTANTE))} helper={`${formatPercent(percentualMeta)} da meta atingida.`} icon={<BarChart3 size={20} />} tone={percentualMeta >= 100 ? 'green' : 'amber'} />
            <MetricCard label="Total devolvido" value={formatCurrency(toNumber(meta.TOTAL_DEVOLVIDO))} helper={`${formatPercent(meta.PERCENTUAL_DEVOLVIDO)} do faturamento bruto.`} icon={<Undo2 size={20} />} tone="red" />
          </div>
          <div className="rounded-[26px] p-5" style={{ backgroundColor: '#f6f7f4', border: '1px solid #edf0eb' }}>
            <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
              <div>
                <p className="text-xs label-ui font-semibold" style={{ color: '#748070' }}>Progresso da meta</p>
                <p className="text-[36px] leading-tight font-extrabold" style={{ color: percentualMeta >= 100 ? 'var(--color-primary)' : '#a46a18' }}>{formatPercent(percentualMeta)}</p>
              </div>
              <div className="text-right rounded-2xl px-5 py-4" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}>
                <p className="text-xs label-ui font-semibold" style={{ color: '#748070' }}>Projeção por dias úteis</p>
                <p className="text-2xl font-bold" style={{ color: projecao >= valorMeta ? 'var(--color-primary)' : '#a46a18' }}>{formatCurrency(projecao)}</p>
              </div>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: '#dce5d7' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${progressWidth}%`, backgroundColor: percentualMeta >= 100 ? 'var(--color-primary)' : '#a46a18' }} />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Evolução Histórica" subtitle={evolucaoSubtitle} action={<RefreshCw size={18} style={{ color: loadingData ? 'var(--color-primary)' : '#8a9387' }} className={loadingData ? 'animate-spin' : ''} />}>
        <div className="p-5">
          <ChartContainer title="Realizado vs Meta" subtitle="Barras representam faturamento líquido; linha tracejada representa meta.">
            <ShadcnComposedChart
              data={evolucaoChartData}
              xKey="name"
              bars={[{ dataKey: 'realizado', name: 'Realizado', color: '#2d5cc5' }]}
              lines={[{ dataKey: 'meta', name: 'Meta', color: '#b42318', dashed: true }]}
              height={320}
              formatter={(value) => formatCurrency(Number(value))}
            />
          </ChartContainer>
        </div>
      </Section>

      <Section title="Ranking de Produtos" subtitle="Produtos ordenados por faturamento e quantidade no período aplicado.">
        <div className="p-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartContainer title="Produtos por valor" subtitle="Itens com maior faturamento no período.">
            <ShadcnBarChart data={mixChartData} xKey="name" layout="vertical" height={Math.max(300, mixChartData.length * 42)} bars={[{ dataKey: 'value', name: 'Valor', color: 'var(--color-primary)' }]} formatter={(value) => formatCurrency(Number(value))} />
          </ChartContainer>
          <ChartContainer title="Produtos por QTD" subtitle="Itens com maior quantidade vendida.">
            <ShadcnBarChart data={mixQtdChartData} xKey="name" layout="vertical" height={Math.max(300, mixQtdChartData.length * 42)} bars={[{ dataKey: 'value', name: 'QTD', color: '#2d5cc5' }]} formatter={(value) => formatDecimal(Number(value), 2)} />
          </ChartContainer>
        </div>
      </Section>

      </div>

      <div className={activeTab === 'produtos' ? 'space-y-5' : 'hidden'}>
      <Section title="Mix de Produtos" subtitle="Produtos, departamentos/seções e itens com devolução no período.">
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <ChartContainer title="Top produtos" subtitle="Ranking por faturamento líquido.">
              <ShadcnBarChart data={mixChartData} xKey="name" layout="vertical" height={Math.max(260, mixChartData.length * 44)} bars={[{ dataKey: 'value', name: 'Valor', color: 'var(--color-primary)' }]} formatter={(value) => formatCurrency(Number(value))} />
            </ChartContainer>
            <ChartContainer title="Top produtos por QTD" subtitle="Ranking separado por quantidade vendida.">
              <ShadcnBarChart data={mixQtdChartData} xKey="name" layout="vertical" height={Math.max(260, mixQtdChartData.length * 44)} bars={[{ dataKey: 'value', name: 'QTD', color: '#2d5cc5' }]} formatter={(value) => formatDecimal(Number(value), 2)} />
            </ChartContainer>
            <ChartContainer title="Produtos com devolução" subtitle="Maiores valores devolvidos por produto.">
              <ShadcnBarChart data={devolucaoProdutosChartData} xKey="name" layout="vertical" height={Math.max(260, devolucaoProdutosChartData.length * 42)} bars={[{ dataKey: 'value', name: 'Devolvido', color: '#d92d20' }]} formatter={(value) => formatCurrency(Number(value))} />
            </ChartContainer>
          </div>
          <Section title="Distribuição por Fornecedores" subtitle="Concentração de faturamento e quantidade por fornecedor no período aplicado.">
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard label="Faturamento fornecedor" value={formatCurrency(fornecedorTotal)} helper="Total dos fornecedores retornados no ranking." icon={<Package size={20} />} tone="green" />
                <MetricCard label="Quantidade vendida" value={formatDecimal(fornecedorQtdTotal, 2)} helper="Soma de QTD dos fornecedores no período." icon={<BarChart3 size={20} />} tone="blue" />
                <MetricCard label="Fornecedor líder" value={String(fornecedorDestaque?.FORNECEDOR || fornecedorDestaque?.CODFORNEC || 'Sem dados')} helper={fornecedorDestaque ? `${formatCurrency(toNumber(fornecedorDestaque.VALOR_FORNECEDOR))}, ${formatPercent(fornecedorDestaque.PERC_FORNECEDOR)} do total.` : 'Sem vendas no filtro.'} icon={<TrendingUp size={20} />} tone="purple" />
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-4">
                <ChartContainer title="Participação por fornecedor" subtitle="Percentual do faturamento líquido por fornecedor.">
                  <ShadcnPieChart data={fornecedorChartData} height={320} formatter={(value) => formatCurrency(Number(value))} donut showLabel labelType="name-percent" />
                </ChartContainer>
                <ChartContainer title="Quantidade por fornecedor" subtitle="Volume vendido por fornecedor no mesmo período.">
                  <ShadcnBarChart data={fornecedorQtdChartData} xKey="name" layout="vertical" height={Math.max(320, fornecedorQtdChartData.length * 42)} bars={[{ dataKey: 'value', name: 'QTD', color: '#2d5cc5' }]} formatter={(value) => formatDecimal(Number(value), 2)} />
                </ChartContainer>
              </div>
            </div>
          </Section>
          <ChartContainer title="Tendência de ranking" subtitle="Evolução mensal de faturamento e QTD para identificar avanço ou queda no período.">
            <ShadcnComposedChart
              data={evolucaoChartData}
              xKey="name"
              bars={[{ dataKey: 'realizado', name: 'Faturamento', color: 'var(--color-primary)' }]}
              lines={[{ dataKey: 'qtd', name: 'QTD', color: '#2d5cc5' }]}
              height={300}
              formatter={(value) => formatDecimal(Number(value), 2)}
            />
          </ChartContainer>
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
            <ChartContainer title="Faturamento por ramo" subtitle="Distribuição do faturamento líquido por ramo de cliente.">
              <ShadcnBarChart data={ramosData} xKey="name" layout="vertical" height={Math.max(300, ramosData.length * 46)} bars={[{ dataKey: 'value', name: 'Faturamento', color: '#2d5cc5' }]} formatter={(value) => formatCurrency(Number(value))} />
            </ChartContainer>
            <ChartContainer title="Pizza de segmento" subtitle="Percentual da carteira por ramo no faturamento.">
              <ShadcnPieChart data={clienteSegmentoPieData} height={300} formatter={(value) => formatCurrency(Number(value))} donut showLabel labelType="name-percent" />
            </ChartContainer>
          </div>
          <div className="validation-hot-wrapper rounded-2xl">
            <div className="px-1 pb-3 flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-display text-xl font-extrabold" style={{ color: 'var(--color-text)' }}>Top produtos por ramo</h3>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Ranking por faturamento e quantidade dentro de cada ramo.</p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>{produtosRamoRows.length} item(ns)</span>
            </div>
            <HotTable data={produtosRamoRows} columns={[{ data: 'RAMO', width: 220 }, { data: 'PRODUTO', width: 320 }, { data: 'FATURAMENTO', width: 150 }, { data: 'QTD', width: 110 }]} colHeaders={['Ramo', 'Produto', 'Faturamento', 'QTD']} rowHeaders={false} height={360} width="100%" stretchH="all" manualColumnResize columnSorting={{ indicator: true, headerAction: true }} readOnly licenseKey="non-commercial-and-evaluation" className="ht-theme-main" />
          </div>
        </div>
      </Section>
      </div>

      <div className={activeTab === 'clientes' ? 'space-y-5' : 'hidden'}>
      <Section title="Análise de Carteira" subtitle="Clientes ativos, inativos, em risco e novos na carteira do vendedor.">
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 xl:grid-cols-6 gap-4">
            <MetricCard label="Carteira" value={formatDecimal(carteiraResumo.TOTAL_CARTEIRA)} helper="Clientes vinculados." icon={<Users size={20} />} tone="green" />
            <MetricCard label="Ativos" value={formatDecimal(carteiraResumo.CLIENTES_ATIVOS)} helper="Compraram no período." icon={<UserCheck size={20} />} tone="blue" />
            <MetricCard label="Inativos" value={formatDecimal(carteiraResumo.CLIENTES_INATIVOS)} helper="Clique para ver a lista." icon={<AlertTriangle size={20} />} tone="amber" onClick={() => abrirDetalheCarteira('INATIVO')} />
            <MetricCard label="Em risco" value={formatDecimal(carteiraResumo.CLIENTES_RISCO)} helper="Clique para ver a lista." icon={<AlertTriangle size={20} />} tone="red" onClick={() => abrirDetalheCarteira('RISCO')} />
            <MetricCard label="Novos" value={formatDecimal(carteiraResumo.CLIENTES_NOVOS)} helper="Primeira compra no período." icon={<UserCheck size={20} />} tone="purple" />
            <MetricCard label="Ticket médio" value={formatCurrency(toNumber(carteiraResumo.TICKET_MEDIO))} helper="Por cliente ativo." icon={<TrendingUp size={20} />} tone="green" />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-4">
            <ChartContainer title="Composição da carteira" subtitle="Ativos, inativos, risco e novos clientes.">
              <ShadcnPieChart data={carteiraStatusChartData} height={300} formatter={(value) => formatDecimal(Number(value))} donut showLabel labelType="name-percent" />
            </ChartContainer>
            <ChartContainer title="Clientes por dias sem compra" subtitle="Clientes com maior tempo desde o último pedido.">
              <ShadcnBarChart data={carteiraRows.slice(0, 10).map((row) => chartDatum(row.CLIENTE, toNumber(row.DIAS_SEM_COMPRA), 24))} xKey="name" layout="vertical" height={Math.max(360, Math.min(10, carteiraRows.length) * 42)} bars={[{ dataKey: 'value', name: 'Dias', color: '#a46a18' }]} formatter={(value) => `${formatDecimal(Number(value))} dias`} />
            </ChartContainer>
          </div>
        </div>
      </Section>

      <Section title="Indicador de Tipos de Visita" subtitle="Distribuição das visitas concluídas no período aplicado por objetivo comercial.">
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard label="Visitas concluídas" value={formatDecimal(visitaTipoTotal || visitaResumo.TOTAL_VISITAS)} helper="Total de visitas concluídas consideradas no período." icon={<CalendarRange size={20} />} tone="green" />
            <MetricCard label="Média semanal" value={formatDecimal(visitaResumo.MEDIA_SEMANAL, 2)} helper="Ritmo médio de visitas concluídas por semana." icon={<TrendingUp size={20} />} tone="blue" />
            <MetricCard label="Tipo mais frequente" value={String(visitaTipoDestaque?.TIPO_VISITA || 'Sem dados')} helper={visitaTipoDestaque ? `${formatDecimal(visitaTipoDestaque.QTD_TIPO)} visita(s), ${formatPercent(visitaTipoDestaque.PERC_TIPO)} do total.` : 'Sem visitas concluídas no filtro.'} icon={<Target size={20} />} tone="purple" />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-4">
            <ChartContainer title="Distribuição por tipo" subtitle="Percentual de visitas concluídas por tipo informado na agenda.">
              <ShadcnPieChart data={visitaTipoChartData} height={320} formatter={(value) => formatDecimal(Number(value))} donut showLabel labelType="name-percent" />
            </ChartContainer>
            <div className="rounded-[22px] p-4 analytics-soft-card" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
              <div className="mb-4">
                <p className="text-[11px] label-ui font-bold uppercase tracking-[0.18em]" style={{ color: '#7c8579' }}>Tipos monitorados</p>
                <h3 className="font-display text-xl font-extrabold" style={{ color: 'var(--color-text)' }}>Composição das visitas</h3>
                <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>Use o indicador para equilibrar aumento de mix, padronização, positivação, renegociação e manutenção.</p>
              </div>
              <div className="space-y-3">
                {visitaTipoRows.length === 0 ? (
                  <div className="rounded-[18px] p-4 text-sm font-semibold" style={{ backgroundColor: '#f6f7f4', color: '#6f786d', border: '1px solid #edf0eb' }}>Nenhuma visita concluída no período selecionado.</div>
                ) : visitaTipoRows.map((row, index) => {
                  const percent = Math.max(0, Math.min(100, toNumber(row.PERC_TIPO)));
                  return (
                    <div key={String(row.TIPO_VISITA || index)} className="rounded-[18px] p-3" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-extrabold truncate" style={{ color: 'var(--color-text)' }}>{String(row.TIPO_VISITA || 'Sem tipo')}</p>
                          <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#edf0eb' }}>
                            <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: VISITA_TIPO_CORES[index % VISITA_TIPO_CORES.length] }} />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-extrabold" style={{ color: 'var(--color-text)' }}>{formatDecimal(row.QTD_TIPO)}</p>
                          <p className="text-xs font-semibold" style={{ color: '#7c8579' }}>{formatPercent(row.PERC_TIPO)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Top Clientes" subtitle="Maiores clientes por faturamento líquido no período.">
        <div className="p-5 space-y-4">
          <ChartContainer
            title="Evolução do cliente"
            subtitle={filters.cliente ? `Faturamento líquido de ${clienteSelecionadoLabel} no período aplicado.` : 'Selecione um ou mais clientes nos filtros para visualizar a evolução.'}
            action={loadingClienteEvolucao ? <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--color-primary)' }}><Loader2 size={16} className="animate-spin" /> Atualizando</span> : null}
          >
            <ShadcnComposedChart
              data={clienteEvolucaoChartData}
              xKey="name"
              bars={[{ dataKey: 'faturamento', name: 'Faturamento', color: 'var(--color-primary)' }]}
              lines={[{ dataKey: 'qtd', name: 'QTD', color: '#2d5cc5' }]}
              height={300}
              formatter={(value) => formatCurrency(Number(value))}
            />
          </ChartContainer>
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
            <ChartContainer title="Ranking de clientes" subtitle="Top clientes por faturamento líquido.">
              <ShadcnBarChart data={topClientesChartData} xKey="name" layout="vertical" height={Math.max(320, topClientesChartData.length * 38)} bars={[{ dataKey: 'value', name: 'Líquido', color: 'var(--color-primary)' }]} formatter={(value) => formatCurrency(Number(value))} />
            </ChartContainer>
            <ChartContainer title="Segmento por faturamento" subtitle="Percentual do faturamento por ramo/cliente.">
              <ShadcnPieChart data={clienteSegmentoPieData} height={320} formatter={(value) => formatCurrency(Number(value))} donut showLabel labelType="name-percent" />
            </ChartContainer>
          </div>
          <div className="validation-hot-wrapper rounded-2xl">
            <HotTable data={topClienteRows.slice(0, 8)} columns={[{ data: 'CLIENTE', width: 300 }, { data: 'LIQUIDO', width: 140 }, { data: 'PEDIDOS', width: 100 }, { data: 'TICKET', width: 140 }, { data: 'PARTICIPACAO', width: 120 }]} colHeaders={['Cliente', 'Líquido', 'Pedidos', 'Ticket', '% Total']} rowHeaders={false} height={300} width="100%" stretchH="all" manualColumnResize columnSorting={{ indicator: true, headerAction: true }} readOnly licenseKey="non-commercial-and-evaluation" className="ht-theme-main" />
          </div>
        </div>
      </Section>
      </div>

      <div className={activeTab === 'overview' ? 'space-y-5' : 'hidden'}>
      <Section
        title="Devoluções do Período"
        subtitle={`${totalDevolucoes} registros filtrados. Total devolvido na seleção: ${formatCurrency(totalDevolvidoFiltrado)}.`}
        action={loadingData ? <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--color-primary)' }}><Loader2 size={16} className="animate-spin" /> Atualizando</span> : null}
      >
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard label="Total devolvido" value={formatCurrency(totalDevolvidoFiltrado)} helper="Valor acumulado na seleção aplicada." icon={<Undo2 size={20} />} tone="red" />
            <MetricCard label="Registros" value={formatDecimal(totalDevolucoes)} helper="Ocorrências retornadas pelos filtros." icon={<Package size={20} />} tone="amber" />
            <MetricCard label="Média por devolução" value={formatCurrency(devolucaoTicketMedio)} helper="Ticket médio calculado sobre os registros filtrados." icon={<TrendingUp size={20} />} tone="blue" />
            <MetricCard label="Casos acima de 30 dias" value={formatDecimal(devolucaoCasosCriticos.length)} helper="Ocorrências críticas na página atual." icon={<AlertTriangle size={20} />} tone="purple" />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
            <ChartContainer title="Maiores devoluções" subtitle="Produtos ou notas com maior valor devolvido na página atual.">
              <ShadcnBarChart data={devolucoesChartData} xKey="name" layout="vertical" height={Math.max(320, devolucoesChartData.length * 38)} bars={[{ dataKey: 'value', name: 'Valor devolvido', color: '#d92d20' }]} formatter={(value) => formatCurrency(Number(value))} />
            </ChartContainer>
            <div className="rounded-[22px] p-4 analytics-soft-card space-y-4" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] label-ui font-bold uppercase tracking-[0.18em]" style={{ color: '#7c8579' }}>Monitoramento</p>
                  <h3 className="font-display text-xl font-extrabold" style={{ color: 'var(--color-text)' }}>Pontos de atenção</h3>
                  <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>Resumo rápido das devoluções mais sensíveis da página atual.</p>
                </div>
                <div className="rounded-2xl px-3 py-2 text-right" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
                  <p className="text-[10px] label-ui font-bold uppercase tracking-[0.14em]" style={{ color: '#7c8579' }}>Qtd. devolvida</p>
                  <p className="text-lg font-extrabold" style={{ color: 'var(--color-text)' }}>{formatDecimal(devolucaoQuantidadeTotal, 2)}</p>
                </div>
              </div>
              {maiorDevolucaoRow ? (
                <div className="rounded-[20px] p-4" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] label-ui font-bold uppercase tracking-[0.14em]" style={{ color: '#7c8579' }}>Maior impacto</p>
                      <p className="text-base font-extrabold mt-1" style={{ color: 'var(--color-text)' }}>{String(maiorDevolucaoRow.PRODUTO || maiorDevolucaoRow.CODPROD || maiorDevolucaoRow.NOTA_DEVOLUCAO || 'Sem identificação')}</p>
                      <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{String(maiorDevolucaoRow.CLIENTE || 'Cliente não informado')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-extrabold" style={{ color: '#b42318' }}>{formatCurrency(toNumber(maiorDevolucaoRow.VALOR_DEVOLVIDO))}</p>
                      <p className="text-xs font-semibold" style={{ color: '#7c8579' }}>{formatDateBr(String(maiorDevolucaoRow.DATA_DEVOLUCAO || ''))}</p>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="space-y-3">
                {devolucaoHighlights.map((row, index) => (
                  <div key={`devolucao-highlight-${index}`} className="rounded-[18px] p-3" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color: 'var(--color-text)' }}>{String(row.PRODUTO || row.CODPROD || row.NOTA_DEVOLUCAO || 'Sem identificação')}</p>
                        <p className="text-xs mt-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>{String(row.CLIENTE || 'Cliente não informado')}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-extrabold" style={{ color: '#b42318' }}>{formatCurrency(toNumber(row.VALOR_DEVOLVIDO))}</p>
                        <p className="text-[11px] mt-1" style={{ color: toNumber(row.DIAS) > 30 ? '#b42318' : '#7c8579' }}>{formatDecimal(row.DIAS)} dias</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="validation-hot-wrapper analytics-minimal-table rounded-2xl" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
            <div className="px-1 pb-3 flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-display text-xl font-extrabold" style={{ color: 'var(--color-text)' }}>Detalhamento das devoluções</h3>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Lista resumida da página atual com destaque visual para casos acima de 30 dias.</p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: '#ffffff', color: '#7c8579', border: '1px solid #e4e9df' }}>Página atual</span>
            </div>
            <HotTable data={devolucaoRows.slice(0, 8)} columns={[{ data: 'DATA_DEVOLUCAO', width: 120 }, { data: 'CLIENTE', width: 220 }, { data: 'PRODUTO', width: 220 }, { data: 'VALOR_DEVOLVIDO', width: 140 }]} colHeaders={['Data Dev.', 'Cliente', 'Produto', 'Valor']} rowHeaders={false} height={360} width="100%" stretchH="none" manualColumnResize columnSorting={{ indicator: true, headerAction: true }} cells={(row, col) => {
              const classes: string[] = [];
              if (col === 0) classes.push('analytics-hot-muted');
              if (col === 1) classes.push('analytics-hot-secondary');
              if (col === 2) classes.push('analytics-hot-primary');
              if (col === 3) classes.push('analytics-hot-value');
              if (toNumber(devolucaoRows[row]?.DIAS) > 30) classes.push('coord-hot-alert');
              return classes.length > 0 ? { className: classes.join(' ') } : {};
            }} readOnly licenseKey="non-commercial-and-evaluation" className="ht-theme-main" />
          </div>
        </div>
        <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap" style={{ borderTop: '1px solid #edf0eb' }}>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Página {devolucaoPage + 1} de {totalDevolucaoPages}</p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={devolucaoPage === 0 || loadingData} onClick={() => loadAnalytics(appliedFilters, Math.max(0, devolucaoPage - 1))} className="px-4 h-9 rounded-xl text-sm font-bold disabled:opacity-50" style={{ backgroundColor: '#ffffff', color: '#7c8579', border: '1px solid #e4e9df' }}>Anterior</button>
            <button type="button" disabled={devolucaoPage + 1 >= totalDevolucaoPages || loadingData} onClick={() => loadAnalytics(appliedFilters, devolucaoPage + 1)} className="px-4 h-9 rounded-xl text-sm font-bold disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}>Próxima</button>
          </div>
        </div>
      </Section>
      </div>

      <div className={activeTab === 'comparativo' ? 'space-y-5' : 'hidden'}>
        <Section title="Painel Modular Comparativo" subtitle="Configure até 4 blocos para comparar categoria, métrica e períodos livres lado a lado.">
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Exemplo: compare Q1/2025 versus Q1/2026 por cliente, produto, seção ou departamento.</p>
              {loadingComparativo ? <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--color-primary)' }}><Loader2 size={16} className="animate-spin" /> Atualizando blocos</span> : null}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={exportarComparativoExcel}
                  disabled={loadingComparativo || exportandoComparativo}
                  className="h-10 px-4 rounded-xl text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50"
                  style={{ backgroundColor: '#eef2eb', color: '#516153' }}
                >
                  {exportandoComparativo ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  {exportandoComparativo ? 'Gerando planilha' : 'Exportar Excel'}
                </button>
                <button
                  type="button"
                  disabled={comparativoBlocks.length >= 4}
                  onClick={() => setComparativoBlocks((current) => [...current, { categoria: 'Produto', metrica: 'QTD', dataInicio: resolvedAppliedPeriod.dataInicio, dataFim: resolvedAppliedPeriod.dataFim, busca: '', selecionados: [] }])}
                  className="h-10 px-4 rounded-xl text-sm font-bold disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}
                >
                  Adicionar bloco
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {comparativoBlocks.map((block, index) => {
                const baseData = comparativoData[index] || [];
                const selectedData = filterComparativoData(baseData, block.selecionados);
                const chartData = block.selecionados.length > 0 ? selectedData : baseData;
                const searchResults = comparativoSearchResults(baseData, block.busca, block.selecionados);
                const selectedRows = block.selecionados
                  .map((selectedId) => baseData.find((row) => comparativoRowId(row) === selectedId))
                  .filter((row): row is ComparativoChartRow => Boolean(row));
                return (
                  <div key={`comparativo-${index}`} className="rounded-[24px] p-4 space-y-4" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-display text-xl font-extrabold" style={{ color: 'var(--color-text)' }}>Bloco {index + 1}</h3>
                        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{formatDateBr(block.dataInicio)} a {formatDateBr(block.dataFim)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setComparativoBlocks((current) => current.filter((_, blockIndex) => blockIndex !== index))}
                        className="h-9 w-9 rounded-full inline-flex items-center justify-center"
                        style={{ backgroundColor: '#eef2eb', color: '#516153' }}
                        aria-label={`Remover bloco ${index + 1}`}
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <SingleSelect label="Categoria" value={block.categoria} options={COMPARATIVO_CATEGORIAS} onChange={(value) => setComparativoBlocks((current) => current.map((item, blockIndex) => blockIndex === index ? { ...item, categoria: value as ComparativoCategoria, busca: '', selecionados: [] } : item))} />
                      <SingleSelect label="Métrica" value={block.metrica} options={COMPARATIVO_METRICAS} onChange={(value) => setComparativoBlocks((current) => current.map((item, blockIndex) => blockIndex === index ? { ...item, metrica: value as ComparativoMetrica } : item))} />
                      <label className="md:col-span-2 min-w-0">
                        <span className="block text-xs label-ui font-semibold mb-1" style={{ color: '#748070' }}>Pesquisar em {block.categoria.toLowerCase()}</span>
                        <div className="relative">
                          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#748070' }} />
                          <input
                            type="text"
                            value={block.busca}
                            placeholder={comparativoSearchPlaceholder(block.categoria)}
                            onChange={(event) => setComparativoBlocks((current) => current.map((item, blockIndex) => blockIndex === index ? { ...item, busca: event.target.value } : item))}
                            className="h-10 w-full rounded-xl pl-9 pr-3 text-sm font-semibold outline-none"
                            style={{ backgroundColor: 'var(--color-surface-container)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                          />
                          {block.busca.trim() ? (
                            <div className="absolute z-30 mt-2 w-full rounded-2xl p-2 ambient-float max-h-72 overflow-auto" style={{ backgroundColor: '#ffffff', border: '1px solid #e3e8de' }}>
                              {searchResults.length === 0 ? (
                                <p className="px-3 py-2 text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Nenhum resultado encontrado.</p>
                              ) : searchResults.map((row) => {
                                const rowId = comparativoRowId(row);
                                return (
                                  <button
                                    key={rowId}
                                    type="button"
                                    className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold transition-colors"
                                    style={{ color: 'var(--color-text)' }}
                                    onClick={() => setComparativoBlocks((current) => current.map((item, blockIndex) => blockIndex === index ? {
                                      ...item,
                                      busca: '',
                                      selecionados: item.selecionados.includes(rowId) ? item.selecionados : [...item.selecionados, rowId],
                                    } : item))}
                                  >
                                    <span className="block truncate">{comparativoRowLabel(row)}</span>
                                    <span className="block text-xs font-semibold mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{block.metrica === 'QTD' ? formatDecimal(row.value, 2) : formatCurrency(row.value)}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                        {selectedRows.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {selectedRows.map((row) => {
                              const rowId = comparativoRowId(row);
                              return (
                                <span key={rowId} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}>
                                  <span className="max-w-[220px] truncate">{comparativoRowLabel(row)}</span>
                                  <button
                                    type="button"
                                    onClick={() => setComparativoBlocks((current) => current.map((item, blockIndex) => blockIndex === index ? { ...item, selecionados: item.selecionados.filter((selectedId) => selectedId !== rowId) } : item))}
                                    aria-label={`Remover ${comparativoRowLabel(row)}`}
                                  >
                                    <X size={12} />
                                  </button>
                                </span>
                              );
                            })}
                            <button
                              type="button"
                              onClick={() => setComparativoBlocks((current) => current.map((item, blockIndex) => blockIndex === index ? { ...item, selecionados: [] } : item))}
                              className="px-2.5 py-1 rounded-full text-xs font-bold"
                              style={{ backgroundColor: '#eef2eb', color: '#516153' }}
                            >
                              Limpar
                            </button>
                          </div>
                        ) : null}
                      </label>
                      <label className="min-w-0">
                        <span className="block text-xs label-ui font-semibold mb-1" style={{ color: '#748070' }}>Início</span>
                        <input type="text" value={isoToDateInputBr(block.dataInicio)} placeholder="DD/MM/AAAA" onChange={(event) => setComparativoBlocks((current) => current.map((item, blockIndex) => blockIndex === index ? { ...item, dataInicio: dateInputBrToIso(event.target.value) } : item))} className="h-10 w-full px-3 rounded-xl text-sm font-semibold" style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
                      </label>
                      <label className="min-w-0">
                        <span className="block text-xs label-ui font-semibold mb-1" style={{ color: '#748070' }}>Fim</span>
                        <input type="text" value={isoToDateInputBr(block.dataFim)} placeholder="DD/MM/AAAA" onChange={(event) => setComparativoBlocks((current) => current.map((item, blockIndex) => blockIndex === index ? { ...item, dataFim: dateInputBrToIso(event.target.value) } : item))} className="h-10 w-full px-3 rounded-xl text-sm font-semibold" style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
                      </label>
                    </div>
                    <ChartContainer title={`${block.categoria} por ${block.metrica}`} subtitle={block.selecionados.length ? `${block.selecionados.length} selecionado(s).` : 'Dados consultados para o período livre deste bloco.'}>
                      <ShadcnBarChart
                        data={chartData.slice(0, 6)}
                        xKey="name"
                        layout="vertical"
                        height={280}
                        bars={[{ dataKey: 'value', name: block.metrica, color: index % 2 === 0 ? 'var(--color-primary)' : '#2d5cc5' }]}
                        formatter={(value) => block.metrica === 'QTD' ? formatDecimal(Number(value), 2) : formatCurrency(Number(value))}
                        showLabel
                        labelFormatter={(value) => block.metrica === 'QTD' ? formatDecimal(value, 2) : formatCurrency(value)}
                      />
                    </ChartContainer>
                  </div>
                );
              })}
            </div>
          </div>
        </Section>
      </div>

      <div className="rounded-3xl p-4 flex items-center gap-2 text-sm" style={{ backgroundColor: '#eef2eb', color: '#526052' }}>
        <Package size={16} /> Dados carregados das tabelas locais importadas. Alterações nos filtros só afetam os blocos após clicar em Buscar.
      </div>

      {carteiraDetalhe ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22, 26, 22, 0.36)' }}>
          <div className="w-full max-w-5xl rounded-[28px] p-5 animate-scaleIn" style={{ backgroundColor: '#ffffff', border: '1px solid #dfe6da' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-3xl font-extrabold" style={{ color: 'var(--color-text)' }}>{carteiraDetalheTitulo}</h3>
                <p className="mt-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  {loadingCarteiraDetalhe ? 'Carregando lista...' : `${formatDecimal(carteiraDetalheRows.length)} cliente(s) encontrados no período aplicado.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCarteiraDetalhe(null)}
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ backgroundColor: '#edf1e9', color: '#5f6a5d' }}
                aria-label="Fechar lista de clientes"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 validation-hot-wrapper rounded-2xl">
              {loadingCarteiraDetalhe ? (
                <div className="flex h-64 items-center justify-center gap-2 text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
                  <Loader2 size={18} className="animate-spin" /> Carregando clientes
                </div>
              ) : carteiraDetalheRows.length === 0 ? (
                <div className="rounded-2xl p-6 text-center text-sm font-semibold" style={{ backgroundColor: '#f6f7f4', color: '#6f786d' }}>
                  Nenhum cliente encontrado para este card no período aplicado.
                </div>
              ) : (
                <HotTable
                  data={carteiraDetalheRows}
                  columns={[{ data: 'CODCLI', width: 100 }, { data: 'CLIENTE', width: 320 }, { data: 'RAMO', width: 220 }, { data: 'ULTIMO_PEDIDO', width: 130 }, { data: 'DIAS_SEM_COMPRA', width: 140 }, { data: 'STATUS', width: 110 }]}
                  colHeaders={['Código', 'Cliente', 'Ramo', 'Último pedido', 'Dias sem compra', 'Status']}
                  rowHeaders={false}
                  height={420}
                  width="100%"
                  stretchH="all"
                  manualColumnResize
                  columnSorting={{ indicator: true, headerAction: true }}
                  readOnly
                  licenseKey="non-commercial-and-evaluation"
                  className="ht-theme-main"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
