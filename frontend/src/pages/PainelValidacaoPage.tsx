import { useEffect, useMemo, useState } from 'react';
import { Download, FilterX, Loader2, Search, ShieldAlert, ChevronDown, ChevronRight, Undo2 } from 'lucide-react';
import { HotTable } from '@handsontable/react-wrapper';
import { registerAllModules } from 'handsontable/registry';
import 'handsontable/styles/handsontable.min.css';
import 'handsontable/styles/ht-theme-main.min.css';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { callSF, callSFSingle, callSFWithMeta, formatCurrency } from '../hooks/useMitra';
import { SF } from '../hooks/useMitra';

registerAllModules();

interface FilterOptionRow {
  TIPO: string;
  VALOR: string | number;
  LABEL: string;
  EXTRA?: string;
}

interface FiltersState {
  codfilial: string;
  codepto: string;
  ramoCliente: string;
  mes: string;
  ano: string;
  cliente: string;
  userId: string;
}

interface ResumoRow {
  TIPO: string;
  RAMO_CLIENTE: string | null;
  CODCLI: string | number | null;
  CLIENTE: string | null;
  TOTAL_REALIZADO: number;
  QTD_CLIENTES: number | null;
  QTD_PEDIDOS: number | null;
  QTD_ITENS: number | null;
  TICKET_MEDIO: number | null;
  PERC_TOTAL: number | null;
}

interface DetalheRow {
  NUMPED: string;
  NUMNOTA: string;
  DTSAIDA: string;
  CODFILIAL: string;
  CODCLI: string | number;
  CLIENTE: string;
  RAMO_CLIENTE: string;
  DEPARTAMENTO: string;
  SECAO: string;
  CODPROD: string | number;
  DESCRICAO: string;
  QT: number;
  VLUNIT: number;
  TOTAL: number;
  COD_RCA: string | number;
  RCA: string;
  VENDEDOR_BU_USER_ID: string | number | null;
  VENDEDOR_BU: string;
  TOTAL_REGISTROS: number;
  QT_FILTRADO: number;
  TOTAL_FILTRADO: number;
}

interface DevolucaoResumoRow {
  TIPO: string;
  RAMO_CLIENTE: string | null;
  TOTAL_DEVOLVIDO: number;
  QT_DEVOLVIDA: number;
  QTD_CLIENTES: number | null;
  QTD_PEDIDOS: number | null;
  QTD_ITENS: number | null;
  QTD_PRODUTOS: number | null;
  PERC_TOTAL: number | null;
}

interface DevolucaoDetalheRow {
  NOTA_DEVOLUCAO: string;
  NUMTRANSENT: string;
  NOTA_VENDA_ORIGINAL: string;
  NUMPED: string;
  DATA_VENDA: string;
  DATA_DEVOLUCAO: string;
  CODFILIAL: string;
  CODCLI: string | number;
  CLIENTE: string;
  RAMO_CLIENTE: string;
  DEPARTAMENTO: string;
  SECAO: string;
  CODPROD: string | number;
  DESCRICAO: string;
  QT_DEVOLVIDA: number;
  VALOR_DEVOLVIDO: number;
  COD_RCA: string | number;
  RCA: string;
  TIPODESCARGA: string;
  VENDEDOR_BU_USER_ID: string | number | null;
  VENDEDOR_BU: string;
  TOTAL_REGISTROS: number;
  QT_DEVOLVIDA_FILTRADO: number;
  VALOR_DEVOLVIDO_FILTRADO: number;
}

interface DetailColumn {
  key: keyof DetalheRow | 'VENDEDOR_BU_LABEL';
  sortKey: string;
  label: string;
  width: number;
}

interface DevolucaoColumn {
  key: keyof DevolucaoDetalheRow | 'VENDEDOR_BU_LABEL';
  sortKey: string;
  label: string;
  width: number;
}

const PAGE_SIZE = 50;
const DEFAULT_SORT_BY = 'DTSAIDA';
const DEFAULT_SORT_DIR = 'DESC';
const DEFAULT_DEVOLUCAO_SORT_BY = 'DATA_DEVOLUCAO';

const MONTHS = [
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

const YEARS = ['2024', '2025', '2026', '2027'];

function defaultFilters(): FiltersState {
  const currentMonth = String(new Date().getMonth() + 1);
  return {
    codfilial: '',
    codepto: '',
    ramoCliente: '',
    mes: currentMonth,
    ano: '2026',
    cliente: '',
    userId: '',
  };
}

function option(value: string, label: string) {
  return { value, label };
}

function normalizeNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string): string {
  if (!value) return '';
  const normalized = String(value).slice(0, 10);
  const [year, month, day] = normalized.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function formatDecimal(value: unknown): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(normalizeNumber(value));
}

function csvValue(value: unknown): string {
  const text = String(value ?? '').replace(/"/g, '""');
  return `"${text}"`;
}

function buildInput(filters: FiltersState, extra: Record<string, string>) {
  return {
    codfilial: filters.codfilial,
    codepto: filters.codepto,
    ramoCliente: filters.ramoCliente,
    mes: filters.mes,
    ano: filters.ano,
    cliente: filters.cliente.trim(),
    userId: filters.userId,
    ...extra,
  };
}

export default function PainelValidacaoPage() {
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [canAccess, setCanAccess] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingDevolucoes, setExportingDevolucoes] = useState(false);
  const [error, setError] = useState('');

  const [draftFilters, setDraftFilters] = useState<FiltersState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FiltersState>(defaultFilters);
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState(DEFAULT_SORT_BY);
  const [sortDir, setSortDir] = useState(DEFAULT_SORT_DIR);
  const [devolucaoPage, setDevolucaoPage] = useState(0);
  const [devolucaoSortBy, setDevolucaoSortBy] = useState(DEFAULT_DEVOLUCAO_SORT_BY);
  const [devolucaoSortDir, setDevolucaoSortDir] = useState(DEFAULT_SORT_DIR);

  const [filterRows, setFilterRows] = useState<FilterOptionRow[]>([]);
  const [resumoRows, setResumoRows] = useState<ResumoRow[]>([]);
  const [detalheRows, setDetalheRows] = useState<DetalheRow[]>([]);
  const [devolucaoResumoRows, setDevolucaoResumoRows] = useState<DevolucaoResumoRow[]>([]);
  const [devolucaoDetalheRows, setDevolucaoDetalheRows] = useState<DevolucaoDetalheRow[]>([]);
  const [expandedRamos, setExpandedRamos] = useState<Set<string>>(new Set());

  const filterOptions = useMemo(() => {
    const byType = (type: string) => filterRows
      .filter((row) => row.TIPO === type)
      .map((row) => option(String(row.VALOR ?? ''), String(row.LABEL ?? row.VALOR ?? '')));

    return {
      filiais: [option('', 'Todas as filiais'), ...byType('FILIAL')],
      departamentos: [option('', 'Todos os departamentos'), ...byType('DEPARTAMENTO')],
      ramos: [option('', 'Todos os ramos'), ...byType('RAMO')],
      vendedores: [option('', 'Todos os vendedores BU'), ...byType('VENDEDOR')],
      meses: MONTHS,
      anos: YEARS.map((year) => option(year, year)),
    };
  }, [filterRows]);

  const resumo = useMemo(() => {
    return resumoRows.find((row) => row.TIPO === 'RESUMO') || null;
  }, [resumoRows]);

  const ramos = useMemo(() => {
    return resumoRows.filter((row) => row.TIPO === 'RAMO');
  }, [resumoRows]);

  const devolucaoResumo = useMemo(() => {
    return devolucaoResumoRows.find((row) => row.TIPO === 'RESUMO') || null;
  }, [devolucaoResumoRows]);

  const clientesPorRamo = useMemo(() => {
    const map = new Map<string, ResumoRow[]>();
    resumoRows.filter((row) => row.TIPO === 'CLIENTE_RAMO').forEach((row) => {
      const ramo = String(row.RAMO_CLIENTE || 'Sem ramo');
      const current = map.get(ramo) || [];
      current.push(row);
      map.set(ramo, current);
    });
    return map;
  }, [resumoRows]);

  const totalRegistros = normalizeNumber(detalheRows[0]?.TOTAL_REGISTROS);
  const totalPages = Math.max(1, Math.ceil(totalRegistros / PAGE_SIZE));
  const qtFiltrado = normalizeNumber(detalheRows[0]?.QT_FILTRADO);
  const totalFiltrado = normalizeNumber(detalheRows[0]?.TOTAL_FILTRADO);
  const totalDevolucaoRegistros = normalizeNumber(devolucaoDetalheRows[0]?.TOTAL_REGISTROS);
  const totalDevolucaoPages = Math.max(1, Math.ceil(totalDevolucaoRegistros / PAGE_SIZE));
  const qtDevolvidaFiltrado = normalizeNumber(devolucaoDetalheRows[0]?.QT_DEVOLVIDA_FILTRADO ?? devolucaoResumo?.QT_DEVOLVIDA);
  const totalDevolvidoFiltrado = normalizeNumber(devolucaoDetalheRows[0]?.VALOR_DEVOLVIDO_FILTRADO ?? devolucaoResumo?.TOTAL_DEVOLVIDO);
  const faturamentoLiquido = normalizeNumber(resumo?.TOTAL_REALIZADO);
  const faturamentoBruto = faturamentoLiquido + totalDevolvidoFiltrado;
  const percentualDevolucao = faturamentoBruto > 0 ? (totalDevolvidoFiltrado / faturamentoBruto) * 100 : 0;

  const detailColumns: DetailColumn[] = useMemo(() => [
    { key: 'NUMPED', sortKey: 'NUMPED', label: 'NUMPED', width: 110 },
    { key: 'NUMNOTA', sortKey: 'NUMNOTA', label: 'NUMNOTA', width: 110 },
    { key: 'DTSAIDA', sortKey: 'DTSAIDA', label: 'DTSAIDA', width: 110 },
    { key: 'CODFILIAL', sortKey: 'CODFILIAL', label: 'CODFILIAL', width: 100 },
    { key: 'CODCLI', sortKey: 'CODCLI', label: 'CODCLI', width: 100 },
    { key: 'CLIENTE', sortKey: 'CLIENTE', label: 'CLIENTE', width: 240 },
    { key: 'RAMO_CLIENTE', sortKey: 'RAMO_CLIENTE', label: 'RAMO_CLIENTE', width: 180 },
    { key: 'DEPARTAMENTO', sortKey: 'DEPARTAMENTO', label: 'DEPARTAMENTO', width: 180 },
    { key: 'SECAO', sortKey: 'SECAO', label: 'SECAO', width: 160 },
    { key: 'CODPROD', sortKey: 'CODPROD', label: 'CODPROD', width: 100 },
    { key: 'DESCRICAO', sortKey: 'DESCRICAO', label: 'DESCRICAO', width: 260 },
    { key: 'QT', sortKey: 'QT', label: 'QT', width: 90 },
    { key: 'VLUNIT', sortKey: 'VLUNIT', label: 'VLUNIT', width: 110 },
    { key: 'TOTAL', sortKey: 'TOTAL', label: 'TOTAL', width: 120 },
    { key: 'COD_RCA', sortKey: 'COD_RCA', label: 'COD_RCA', width: 100 },
    { key: 'RCA', sortKey: 'RCA', label: 'RCA', width: 180 },
    { key: 'VENDEDOR_BU_LABEL', sortKey: 'VENDEDOR_BU', label: 'VENDEDOR BU', width: 220 },
  ], []);

  const devolucaoColumns: DevolucaoColumn[] = useMemo(() => [
    { key: 'NOTA_DEVOLUCAO', sortKey: 'NOTA_DEVOLUCAO', label: 'NOTA DEVOLUÇÃO', width: 140 },
    { key: 'NUMTRANSENT', sortKey: 'NUMTRANSENT', label: 'NUMTRANSENT', width: 130 },
    { key: 'NOTA_VENDA_ORIGINAL', sortKey: 'NOTA_VENDA_ORIGINAL', label: 'NOTA VENDA', width: 120 },
    { key: 'NUMPED', sortKey: 'NUMPED', label: 'NUMPED', width: 110 },
    { key: 'DATA_VENDA', sortKey: 'DATA_VENDA', label: 'DATA VENDA', width: 120 },
    { key: 'DATA_DEVOLUCAO', sortKey: 'DATA_DEVOLUCAO', label: 'DATA DEVOLUÇÃO', width: 140 },
    { key: 'CODFILIAL', sortKey: 'CODFILIAL', label: 'CODFILIAL', width: 100 },
    { key: 'CODCLI', sortKey: 'CODCLI', label: 'CODCLI', width: 100 },
    { key: 'CLIENTE', sortKey: 'CLIENTE', label: 'CLIENTE', width: 240 },
    { key: 'RAMO_CLIENTE', sortKey: 'RAMO_CLIENTE', label: 'RAMO_CLIENTE', width: 180 },
    { key: 'DEPARTAMENTO', sortKey: 'DEPARTAMENTO', label: 'DEPARTAMENTO', width: 180 },
    { key: 'SECAO', sortKey: 'SECAO', label: 'SECAO', width: 160 },
    { key: 'CODPROD', sortKey: 'CODPROD', label: 'CODPROD', width: 100 },
    { key: 'DESCRICAO', sortKey: 'DESCRICAO', label: 'DESCRICAO', width: 260 },
    { key: 'QT_DEVOLVIDA', sortKey: 'QT_DEVOLVIDA', label: 'QT DEVOLVIDA', width: 120 },
    { key: 'VALOR_DEVOLVIDO', sortKey: 'VALOR_DEVOLVIDO', label: 'VALOR DEVOLVIDO', width: 150 },
    { key: 'COD_RCA', sortKey: 'COD_RCA', label: 'COD_RCA', width: 100 },
    { key: 'RCA', sortKey: 'RCA', label: 'RCA', width: 180 },
    { key: 'TIPODESCARGA', sortKey: 'TIPODESCARGA', label: 'TIPODESCARGA', width: 120 },
    { key: 'VENDEDOR_BU_LABEL', sortKey: 'VENDEDOR_BU', label: 'VENDEDOR BU', width: 220 },
  ], []);

  const hotRows = useMemo(() => {
    return detalheRows.map((row) => ({
      ...row,
      DTSAIDA: formatDate(row.DTSAIDA),
      QT: formatDecimal(row.QT),
      VLUNIT: formatCurrency(normalizeNumber(row.VLUNIT)),
      TOTAL: formatCurrency(normalizeNumber(row.TOTAL)),
      VENDEDOR_BU_LABEL: row.VENDEDOR_BU_USER_ID ? `[${row.VENDEDOR_BU_USER_ID}] ${row.VENDEDOR_BU}` : row.VENDEDOR_BU,
    }));
  }, [detalheRows]);

  const hotDevolucaoRows = useMemo(() => {
    return devolucaoDetalheRows.map((row) => ({
      ...row,
      DATA_VENDA: formatDate(row.DATA_VENDA),
      DATA_DEVOLUCAO: formatDate(row.DATA_DEVOLUCAO),
      QT_DEVOLVIDA: formatDecimal(row.QT_DEVOLVIDA),
      VALOR_DEVOLVIDO: formatCurrency(normalizeNumber(row.VALOR_DEVOLVIDO)),
      VENDEDOR_BU_LABEL: row.VENDEDOR_BU_USER_ID ? `[${row.VENDEDOR_BU_USER_ID}] ${row.VENDEDOR_BU}` : row.VENDEDOR_BU,
    }));
  }, [devolucaoDetalheRows]);

  useEffect(() => {
    let active = true;

    async function checkAccess() {
      setLoadingAccess(true);
      const user = await callSFSingle(SF.dadosUsuarioLogado);
      if (!active) return;

      const email = String(user?.DESCR || user?.EMAIL || '').trim().toLowerCase();
      setUserEmail(email);
      setCanAccess(email === 'ti@benenutri.com');
      setLoadingAccess(false);
    }

    checkAccess();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!canAccess) return;
    let active = true;

    async function loadFilters() {
      setLoadingFilters(true);
      const rows = await callSF(SF.validacaoFiltros);
      if (!active) return;
      setFilterRows(rows as FilterOptionRow[]);
      setLoadingFilters(false);
    }

    loadFilters();
    return () => {
      active = false;
    };
  }, [canAccess]);

  useEffect(() => {
    if (!canAccess) return;
    let active = true;

    async function loadData() {
      setLoadingData(true);
      setError('');

      const [resumoResp, detalheResp, devolucaoResumoResp, devolucaoDetalheResp] = await Promise.allSettled([
        callSFWithMeta(SF.validacaoResumo, buildInput(appliedFilters, {})),
        callSFWithMeta(SF.validacaoDetalhe, buildInput(appliedFilters, {
          sortBy,
          sortDir,
          limit: String(PAGE_SIZE),
          offset: String(page * PAGE_SIZE),
        })),
        callSFWithMeta(SF.validacaoDevolucoesResumo, buildInput(appliedFilters, {})),
        callSFWithMeta(SF.validacaoDevolucoesDetalhe, buildInput(appliedFilters, {
          sortBy: devolucaoSortBy,
          sortDir: devolucaoSortDir,
          limit: String(PAGE_SIZE),
          offset: String(devolucaoPage * PAGE_SIZE),
        })),
      ]);

      if (!active) return;

      if (resumoResp.status === 'fulfilled' && !resumoResp.value.error) {
        setResumoRows(resumoResp.value.rows as ResumoRow[]);
      } else {
        setResumoRows([]);
        setError(resumoResp.status === 'fulfilled' ? resumoResp.value.error || 'Falha ao carregar resumo.' : 'Falha ao carregar resumo.');
      }

      if (detalheResp.status === 'fulfilled' && !detalheResp.value.error) {
        setDetalheRows(detalheResp.value.rows as DetalheRow[]);
      } else {
        setDetalheRows([]);
        setError((prev) => prev || (detalheResp.status === 'fulfilled' ? detalheResp.value.error || 'Falha ao carregar detalhe.' : 'Falha ao carregar detalhe.'));
      }

      if (devolucaoResumoResp.status === 'fulfilled' && !devolucaoResumoResp.value.error) {
        setDevolucaoResumoRows(devolucaoResumoResp.value.rows as DevolucaoResumoRow[]);
      } else {
        setDevolucaoResumoRows([]);
        setError((prev) => prev || (devolucaoResumoResp.status === 'fulfilled' ? devolucaoResumoResp.value.error || 'Falha ao carregar resumo de devoluções.' : 'Falha ao carregar resumo de devoluções.'));
      }

      if (devolucaoDetalheResp.status === 'fulfilled' && !devolucaoDetalheResp.value.error) {
        setDevolucaoDetalheRows(devolucaoDetalheResp.value.rows as DevolucaoDetalheRow[]);
      } else {
        setDevolucaoDetalheRows([]);
        setError((prev) => prev || (devolucaoDetalheResp.status === 'fulfilled' ? devolucaoDetalheResp.value.error || 'Falha ao carregar detalhe de devoluções.' : 'Falha ao carregar detalhe de devoluções.'));
      }

      setLoadingData(false);
    }

    loadData();
    return () => {
      active = false;
    };
  }, [canAccess, appliedFilters, page, sortBy, sortDir, devolucaoPage, devolucaoSortBy, devolucaoSortDir]);

  function updateFilter(key: keyof FiltersState, value: string) {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }

  function applyFilters() {
    setAppliedFilters({ ...draftFilters });
    setPage(0);
    setDevolucaoPage(0);
  }

  function clearFilters() {
    const clean = defaultFilters();
    setDraftFilters(clean);
    setAppliedFilters(clean);
    setPage(0);
    setDevolucaoPage(0);
    setSortBy(DEFAULT_SORT_BY);
    setSortDir(DEFAULT_SORT_DIR);
    setDevolucaoSortBy(DEFAULT_DEVOLUCAO_SORT_BY);
    setDevolucaoSortDir(DEFAULT_SORT_DIR);
  }

  function toggleRamo(ramo: string) {
    setExpandedRamos((current) => {
      const next = new Set(current);
      if (next.has(ramo)) next.delete(ramo);
      else next.add(ramo);
      return next;
    });
  }

  function handleHotSort(currentSortConfig: Array<{ column: number; sortOrder: string }>) {
    const config = currentSortConfig[0];
    if (!config) {
      setSortBy(DEFAULT_SORT_BY);
      setSortDir(DEFAULT_SORT_DIR);
      setPage(0);
      return;
    }

    const column = detailColumns[config.column];
    if (!column) return;
    setSortBy(column.sortKey);
    setSortDir(config.sortOrder === 'asc' ? 'ASC' : 'DESC');
    setPage(0);
  }

  function handleHotDevolucaoSort(currentSortConfig: Array<{ column: number; sortOrder: string }>) {
    const config = currentSortConfig[0];
    if (!config) {
      setDevolucaoSortBy(DEFAULT_DEVOLUCAO_SORT_BY);
      setDevolucaoSortDir(DEFAULT_SORT_DIR);
      setDevolucaoPage(0);
      return;
    }

    const column = devolucaoColumns[config.column];
    if (!column) return;
    setDevolucaoSortBy(column.sortKey);
    setDevolucaoSortDir(config.sortOrder === 'asc' ? 'ASC' : 'DESC');
    setDevolucaoPage(0);
  }

  async function exportCsv() {
    setExporting(true);
    setError('');
    const limit = Math.max(totalRegistros, PAGE_SIZE);
    const response = await callSFWithMeta(SF.validacaoDetalhe, buildInput(appliedFilters, {
      sortBy,
      sortDir,
      limit: String(limit),
      offset: '0',
    }));

    if (response.error) {
      setError(response.error);
      setExporting(false);
      return;
    }

    const rows = response.rows as DetalheRow[];
    const headers = detailColumns.map((column) => column.label);
    const lines = [
      headers.map(csvValue).join(';'),
      ...rows.map((row) => detailColumns.map((column) => {
        if (column.key === 'VENDEDOR_BU_LABEL') {
          return csvValue(row.VENDEDOR_BU_USER_ID ? `[${row.VENDEDOR_BU_USER_ID}] ${row.VENDEDOR_BU}` : row.VENDEDOR_BU);
        }
        return csvValue(row[column.key as keyof DetalheRow]);
      }).join(';')),
    ];

    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `painel-validacao-${appliedFilters.ano}-${appliedFilters.mes.padStart(2, '0')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  async function exportDevolucoesCsv() {
    setExportingDevolucoes(true);
    setError('');
    const limit = Math.max(totalDevolucaoRegistros, PAGE_SIZE);
    const response = await callSFWithMeta(SF.validacaoDevolucoesDetalhe, buildInput(appliedFilters, {
      sortBy: devolucaoSortBy,
      sortDir: devolucaoSortDir,
      limit: String(limit),
      offset: '0',
    }));

    if (response.error) {
      setError(response.error);
      setExportingDevolucoes(false);
      return;
    }

    const rows = response.rows as DevolucaoDetalheRow[];
    const headers = devolucaoColumns.map((column) => column.label);
    const lines = [
      headers.map(csvValue).join(';'),
      ...rows.map((row) => devolucaoColumns.map((column) => {
        if (column.key === 'VENDEDOR_BU_LABEL') {
          return csvValue(row.VENDEDOR_BU_USER_ID ? `[${row.VENDEDOR_BU_USER_ID}] ${row.VENDEDOR_BU}` : row.VENDEDOR_BU);
        }
        return csvValue(row[column.key as keyof DevolucaoDetalheRow]);
      }).join(';')),
    ];

    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `painel-validacao-devolucoes-${appliedFilters.ano}-${appliedFilters.mes.padStart(2, '0')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setExportingDevolucoes(false);
  }

  if (loadingAccess) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin" size={30} style={{ color: 'var(--color-primary)' }} />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="animate-fadeIn rounded-3xl p-8" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#fde8e8', color: '#b42318' }}>
          <ShieldAlert size={24} />
        </div>
        <h1 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>Painel de Validação</h1>
        <p className="mt-3 text-lg" style={{ color: '#636d63' }}>
          Esta rota é restrita ao usuário ti@benenutri.com.
        </p>
        <p className="mt-2 text-sm" style={{ color: '#7b857b' }}>
          Usuário atual: <strong>{userEmail || 'não identificado'}</strong>
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="label-ui text-xs font-bold mb-2" style={{ color: '#6f7b6d' }}>Validação comercial</p>
          <h1 className="font-display text-5xl font-extrabold" style={{ color: '#1b1c1a' }}>Painel de Validação</h1>
          <p className="text-xl mt-1" style={{ color: '#515b51' }}>
            Compare vendas reais, metas e vínculo BU com rastreabilidade por pedido, cliente e item.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={exportCsv} disabled={exporting || loadingData || totalRegistros === 0}>
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Exportar vendas
          </Button>
          <Button variant="secondary" onClick={exportDevolucoesCsv} disabled={exportingDevolucoes || loadingData || totalDevolucaoRegistros === 0}>
            {exportingDevolucoes ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Exportar devoluções
          </Button>
        </div>
      </div>

      <section className="rounded-3xl p-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de', boxShadow: '0 14px 30px rgba(23,40,30,0.06)' }}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Select label="Filial" value={draftFilters.codfilial} onChange={(value) => updateFilter('codfilial', value)} options={filterOptions.filiais} disabled={loadingFilters} />
          <Select label="Departamento" value={draftFilters.codepto} onChange={(value) => updateFilter('codepto', value)} options={filterOptions.departamentos} disabled={loadingFilters} />
          <Select label="Ramo de Atividade" value={draftFilters.ramoCliente} onChange={(value) => updateFilter('ramoCliente', value)} options={filterOptions.ramos} disabled={loadingFilters} />
          <Select label="Vendedor" value={draftFilters.userId} onChange={(value) => updateFilter('userId', value)} options={filterOptions.vendedores} disabled={loadingFilters} />
          <Select label="Mês" value={draftFilters.mes} onChange={(value) => updateFilter('mes', value)} options={filterOptions.meses} />
          <Select label="Ano" value={draftFilters.ano} onChange={(value) => updateFilter('ano', value)} options={filterOptions.anos} />
          <div className="xl:col-span-2">
            <Input
              label="Cliente"
              placeholder="Buscar por nome ou código"
              value={draftFilters.cliente}
              onChange={(event) => updateFilter('cliente', event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyFilters();
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <Button onClick={applyFilters} disabled={loadingData}>
            <Search size={16} />
            Buscar
          </Button>
          <Button variant="secondary" onClick={clearFilters} disabled={loadingData}>
            <FilterX size={16} />
            Limpar Filtros
          </Button>
          {loadingFilters ? <span className="text-sm" style={{ color: '#6f7b6d' }}>Carregando listas de filtros...</span> : null}
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ backgroundColor: '#fde8e8', color: '#b42318', border: '1px solid #f7c7c7' }}>
          {error}
        </div>
      ) : null}

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <SummaryCard label="Total Realizado" value={formatCurrency(normalizeNumber(resumo?.TOTAL_REALIZADO))} tone="#eaf5e7" />
        <SummaryCard label="Qtd Clientes" value={String(normalizeNumber(resumo?.QTD_CLIENTES))} tone="#e9f0f6" />
        <SummaryCard label="Qtd Pedidos" value={String(normalizeNumber(resumo?.QTD_PEDIDOS))} tone="#e8f3f2" />
        <SummaryCard label="Qtd Itens" value={String(normalizeNumber(resumo?.QTD_ITENS))} tone="#f8f2e6" />
        <SummaryCard label="Ticket Médio" value={formatCurrency(normalizeNumber(resumo?.TICKET_MEDIO))} tone="#f0ecf8" />
      </section>

      <section className="rounded-3xl p-5" style={{ backgroundColor: '#fff8f1', border: '1px solid #f0dfcc', boxShadow: '0 14px 30px rgba(88,55,21,0.07)' }}>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#f4e3d1', color: '#9a4d12' }}>
            <Undo2 size={20} />
          </div>
          <div>
            <h2 className="font-display text-3xl font-extrabold" style={{ color: '#281b10' }}>Composição do Faturamento</h2>
            <p className="text-sm mt-1" style={{ color: '#6f563b' }}>
              O total realizado considera vendas líquidas; aqui você vê o bruto estimado, as devoluções e o impacto percentual.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <SummaryCard label="Faturamento Bruto" value={formatCurrency(faturamentoBruto)} tone="#f5e5d2" />
          <SummaryCard label="Total Devolvido" value={formatCurrency(totalDevolvidoFiltrado)} tone="#fbe0d9" />
          <SummaryCard label="Faturamento Líquido" value={formatCurrency(faturamentoLiquido)} tone="#eaf5e7" />
          <SummaryCard label="% Devolução" value={`${formatDecimal(percentualDevolucao)}%`} tone="#f8ebcf" />
          <SummaryCard label="Itens Devolvidos" value={`${formatDecimal(qtDevolvidaFiltrado)} (${normalizeNumber(devolucaoResumo?.QTD_ITENS)} linhas)`} tone="#f0ecf8" />
        </div>
      </section>

      <section className="rounded-3xl overflow-hidden" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de', boxShadow: '0 14px 30px rgba(23,40,30,0.06)' }}>
        <div className="p-5 border-b" style={{ borderColor: '#e3e8de' }}>
          <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Total por Ramo</h2>
          <p className="text-sm mt-1" style={{ color: '#657063' }}>Expanda um ramo para ver os clientes que compõem o total.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead style={{ backgroundColor: '#eef2eb', color: '#526052' }}>
              <tr>
                <th className="text-left px-5 py-3 font-bold">RAMO_CLIENTE</th>
                <th className="text-right px-5 py-3 font-bold">TOTAL</th>
                <th className="text-right px-5 py-3 font-bold">% DO TOTAL GERAL</th>
              </tr>
            </thead>
            <tbody>
              {ramos.length === 0 && !loadingData ? (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center" style={{ color: '#6f7b6d' }}>Nenhum ramo encontrado para os filtros aplicados.</td>
                </tr>
              ) : null}

              {ramos.map((ramo) => {
                const ramoLabel = String(ramo.RAMO_CLIENTE || 'Sem ramo');
                const clientes = clientesPorRamo.get(ramoLabel) || [];
                const expanded = expandedRamos.has(ramoLabel);
                return (
                  <tr key={ramoLabel}>
                    <td colSpan={3} className="p-0">
                      <button
                        type="button"
                        className="w-full grid grid-cols-[1fr_180px_160px] items-center px-5 py-3 text-left transition-colors"
                        style={{ borderBottom: '1px solid #e8ece5', color: '#263023' }}
                        onClick={() => toggleRamo(ramoLabel)}
                      >
                        <span className="flex items-center gap-2 font-semibold">
                          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          {ramoLabel}
                        </span>
                        <span className="text-right font-bold">{formatCurrency(normalizeNumber(ramo.TOTAL_REALIZADO))}</span>
                        <span className="text-right">{formatDecimal(ramo.PERC_TOTAL)}%</span>
                      </button>

                      {expanded ? (
                        <div className="px-5 py-3" style={{ backgroundColor: '#ffffff' }}>
                          {clientes.map((cliente) => (
                            <div key={`${ramoLabel}-${cliente.CODCLI}`} className="grid grid-cols-[1fr_160px] gap-4 py-2 border-b last:border-b-0" style={{ borderColor: '#edf0eb' }}>
                              <div>
                                <span className="text-xs text-gray-400 mr-1">[{cliente.CODCLI}]</span>
                                <span className="font-medium" style={{ color: '#313a2f' }}>{cliente.CLIENTE}</span>
                              </div>
                              <div className="text-right font-semibold" style={{ color: '#137432' }}>{formatCurrency(normalizeNumber(cliente.TOTAL_REALIZADO))}</div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl overflow-hidden" style={{ backgroundColor: '#fff8f1', border: '1px solid #f0dfcc', boxShadow: '0 14px 30px rgba(88,55,21,0.07)' }}>
        <div className="p-5 border-b flex items-start justify-between gap-4 flex-wrap" style={{ borderColor: '#f0dfcc' }}>
          <div>
            <h2 className="font-display text-3xl font-extrabold" style={{ color: '#281b10' }}>Detalhamento de Devoluções</h2>
            <p className="text-sm mt-1" style={{ color: '#6f563b' }}>
              {totalDevolucaoRegistros} registros filtrados. Ordenação atual: {devolucaoSortBy} {devolucaoSortDir}.
            </p>
          </div>
          {loadingData ? <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: '#9a4d12' }}><Loader2 size={16} className="animate-spin" /> Atualizando</span> : null}
        </div>

        <div className="validation-hot-wrapper">
          <HotTable
            data={hotDevolucaoRows}
            columns={devolucaoColumns.map((column) => ({ data: column.key, width: column.width }))}
            colHeaders={devolucaoColumns.map((column) => column.label)}
            rowHeaders
            height={380}
            width="100%"
            stretchH="none"
            manualColumnResize
            columnSorting={{ indicator: true, headerAction: true }}
            afterColumnSort={handleHotDevolucaoSort}
            readOnly
            licenseKey="non-commercial-and-evaluation"
            className="ht-theme-main"
          />
        </div>

        <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap" style={{ borderTop: '1px solid #f0dfcc' }}>
          <div className="text-sm" style={{ color: '#6f563b' }}>
            <strong>Totalizador:</strong> QT DEVOLVIDA {formatDecimal(qtDevolvidaFiltrado)} · VALOR DEVOLVIDO {formatCurrency(totalDevolvidoFiltrado)}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" disabled={devolucaoPage === 0 || loadingData} onClick={() => setDevolucaoPage((current) => Math.max(0, current - 1))}>Anterior</Button>
            <span className="text-sm font-semibold px-2" style={{ color: '#6f563b' }}>Página {devolucaoPage + 1} de {totalDevolucaoPages}</span>
            <Button variant="secondary" size="sm" disabled={devolucaoPage + 1 >= totalDevolucaoPages || loadingData} onClick={() => setDevolucaoPage((current) => current + 1)}>Próxima</Button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl overflow-hidden" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de', boxShadow: '0 14px 30px rgba(23,40,30,0.06)' }}>
        <div className="p-5 border-b flex items-start justify-between gap-4 flex-wrap" style={{ borderColor: '#e3e8de' }}>
          <div>
            <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Detalhamento de Vendas</h2>
            <p className="text-sm mt-1" style={{ color: '#657063' }}>
              {totalRegistros} registros filtrados. Ordenação atual: {sortBy} {sortDir}.
            </p>
          </div>
          {loadingData ? <span className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: '#137432' }}><Loader2 size={16} className="animate-spin" /> Atualizando</span> : null}
        </div>

        <div className="validation-hot-wrapper">
          <HotTable
            data={hotRows}
            columns={detailColumns.map((column) => ({ data: column.key, width: column.width }))}
            colHeaders={detailColumns.map((column) => column.label)}
            rowHeaders
            height={460}
            width="100%"
            stretchH="none"
            manualColumnResize
            columnSorting={{ indicator: true, headerAction: true }}
            afterColumnSort={handleHotSort}
            readOnly
            licenseKey="non-commercial-and-evaluation"
            className="ht-theme-main"
          />
        </div>

        <div className="px-5 py-4 flex items-center justify-between gap-4 flex-wrap" style={{ borderTop: '1px solid #e3e8de' }}>
          <div className="text-sm" style={{ color: '#4f5d4d' }}>
            <strong>Totalizador:</strong> QT {formatDecimal(qtFiltrado)} · TOTAL {formatCurrency(totalFiltrado)}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" disabled={page === 0 || loadingData} onClick={() => setPage((current) => Math.max(0, current - 1))}>Anterior</Button>
            <span className="text-sm font-semibold px-2" style={{ color: '#4f5d4d' }}>Página {page + 1} de {totalPages}</span>
            <Button variant="secondary" size="sm" disabled={page + 1 >= totalPages || loadingData} onClick={() => setPage((current) => current + 1)}>Próxima</Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-3xl p-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de', boxShadow: '0 14px 30px rgba(23,40,30,0.06)' }}>
      <div className="w-10 h-10 rounded-2xl mb-4" style={{ backgroundColor: tone }} />
      <p className="text-sm font-semibold" style={{ color: '#667062' }}>{label}</p>
      <p className="font-display text-3xl font-extrabold mt-1" style={{ color: '#1b1c1a' }}>{value}</p>
    </div>
  );
}
