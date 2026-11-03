import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { BarChart3, Building2, CalendarDays, Check, ChevronLeft, ChevronRight, ClipboardList, Info, Loader2, PackagePlus, Plus, Search, ShieldCheck, Trash2, Users } from 'lucide-react';
import { callSF, callSFMutation, callSFSingle, formatDate, getBrasiliaTimestamp, SF } from '../hooks/useMitra';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import Select from '../components/ui/Select';
import { ChartContainer, FORMATTERS, ShadcnBarChart } from '../components/ui/Chart';

interface SolicitacaoCompra {
  ID: number;
  CLIENTE: string;
  TIPO_SOLICITACAO: string;
  DESCRICAO?: string;
  PRIORIDADE: string;
  STATUS: string;
  PRAZO_DESEJADO?: string;
  EXECUTIVO_ID?: number;
  EXECUTIVO_EMAIL?: string;
  RESPONSAVEL?: string;
  REFERENCIA_COMERCIAL_ID?: string;
  CRIADO_EM?: string;
  ATUALIZADO_EM?: string;
  MOTIVO_RECUSA?: string;
}

interface ExecutivoOption {
  ID: number;
  NOME?: string;
  EMAIL?: string;
}

interface FormState {
  clienteId: string;
  cliente: string;
  filialId: string;
  filialNome: string;
  tipoSolicitacao: string;
  descricao: string;
  prioridade: string;
  prazoDesejado: string;
  referenciaComercialId: string;
}

interface ClienteOption {
  ID: number;
  NOME_FANTASIA?: string;
  RAZAO_SOCIAL?: string;
  CNPJ?: string;
  CIDADE?: string;
  UF?: string;
  WINTHOR_CODCLI?: number | string;
  CODCLI?: number | string;
}

interface FilialOption {
  CODFILIAL: number | string;
  NOME_FILIAL?: string;
}

interface ProdutoOption {
  PRODUCT_ID: number;
  CODPROD: number;
  CODFORNEC?: number | string;
  FORNECEDOR_ID?: number | string;
  CODIGO: string;
  NOME: string;
  CATEGORIA?: string;
}

interface ProdutoSolicitado {
  codprod: string;
  codfornec: string;
  produto: string;
  quantidade: number;
}

interface SolicitacaoItemDetalhe {
  ID: number;
  SOLICITACAO_ID: number;
  CODPROD?: string;
  CODFORNEC?: number | string;
  PRODUTO: string;
  QUANTIDADE: number;
  OBSERVACAO?: string;
  COMPRAS_SOLICITACAO_ID?: number;
  COMPRAS_STATUS?: string;
  COMPRAS_CARD_ID?: number;
  COMPRAS_AVALIADO_EM?: string;
  COMPRAS_OBS_AVALIACAO?: string;
  COMPRAS_SYNC_EM?: string;
  COMPRAS_SYNC_ERRO?: string;
  CRIADO_EM?: string;
}

interface ProdutoSaidaData {
  name: string;
  quantidade: number;
}

interface ProdutoClienteData {
  codcli: string;
  nome: string;
  quantidade: number;
}

const DEFAULT_FORM: FormState = {
  clienteId: '',
  cliente: '',
  filialId: '',
  filialNome: '',
  tipoSolicitacao: 'PRODUTO',
  descricao: '',
  prioridade: 'MEDIA',
  prazoDesejado: '',
  referenciaComercialId: '',
};

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'ABERTA', label: 'Aberta' },
  { value: 'EM_ANALISE', label: 'Em análise' },
  { value: 'APROVADA', label: 'Aprovada' },
  { value: 'RECUSADA', label: 'Recusada' },
  { value: 'CONCLUIDA', label: 'Concluída' },
];

const PRIORIDADE_OPTIONS = [
  { value: '', label: 'Todas as prioridades' },
  { value: 'ALTA', label: 'Alta' },
  { value: 'MEDIA', label: 'Média' },
  { value: 'BAIXA', label: 'Baixa' },
];

const FORM_PRIORIDADE_OPTIONS = PRIORIDADE_OPTIONS.filter((option) => option.value);

const TIPO_OPTIONS = [
  { value: 'PRODUTO', label: 'Produto' },
  { value: 'COMPLEMENTO_MIX', label: 'Complemento de mix' },
  { value: 'COTACAO', label: 'Cotação' },
  { value: 'OUTRO', label: 'Outro' },
];

const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
  ABERTA: { label: 'Aberta', bg: '#eceff5', text: '#35455a' },
  EM_ANALISE: { label: 'Em análise', bg: '#fff4da', text: '#9a6507' },
  APROVADA: { label: 'Aprovada', bg: '#e7f5ea', text: '#17783f' },
  RECUSADA: { label: 'Recusada', bg: '#ffe7e6', text: '#b42318' },
  CONCLUIDA: { label: 'Concluída', bg: '#e8f3e7', text: '#4f7a4f' },
};

const PRIORIDADE_META: Record<string, { bg: string; text: string }> = {
  ALTA: { bg: '#ffe7e6', text: '#c63c3c' },
  MEDIA: { bg: '#fff4da', text: '#b57b12' },
  BAIXA: { bg: '#e7f6ea', text: '#27884c' },
};

function statusLabel(status: string) {
  return STATUS_META[status]?.label || status || '-';
}

function formatTipo(tipo: string) {
  return TIPO_OPTIONS.find((option) => option.value === tipo)?.label || tipo || '-';
}

function formatPrazo(value?: string) {
  return value ? formatDate(value.slice(0, 10)) : '-';
}

function formatCriadoEm(value?: string) {
  return value ? formatDate(value.slice(0, 10)) : '-';
}

function clienteLabel(cliente: ClienteOption) {
  const nome = cliente.NOME_FANTASIA || cliente.RAZAO_SOCIAL || `Cliente ${cliente.ID}`;
  const codigo = String(cliente.WINTHOR_CODCLI ?? cliente.CODCLI ?? cliente.ID ?? '').trim();
  return `${nome}${codigo ? ` — Cód. ${codigo}` : ''}`;
}

function filialLabel(filial: FilialOption) {
  return `${filial.CODFILIAL} - ${filial.NOME_FILIAL || `Filial ${filial.CODFILIAL}`}`;
}

function compactProdutoLabel(produto: ProdutoOption) {
  return `${produto.CODPROD || produto.CODIGO} — ${produto.NOME}`;
}

function getNumeric(row: any, keys: string[]) {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function normalizeSaidaProduto(rows: any[]): ProdutoSaidaData[] {
  return rows.map((row) => ({
    name: String(row.MES || row.ANO_MES || row.PERIODO || row.DATA || row.COMPETENCIA || '-'),
    quantidade: getNumeric(row, ['QT_VENDIDA', 'QUANTIDADE', 'QTD', 'QT', 'SAIDA', 'TOTAL', 'VOLUME']),
  })).filter((row) => row.quantidade > 0).slice(-12);
}

function normalizeClientesProduto(rows: any[]): ProdutoClienteData[] {
  return rows.map((row) => ({
    codcli: String(row.CODCLI || row.COD_CLIENTE || row.CLIENTE_ID || ''),
    nome: String(row.NOME_CLIENTE || row.CLIENTE || row.RAZAO_SOCIAL || row.NOME || 'Cliente'),
    quantidade: getNumeric(row, ['QT_VENDIDA', 'QUANTIDADE', 'QTD', 'QT', 'TOTAL', 'VOLUME']),
  })).filter((row) => row.quantidade > 0).slice(0, 6);
}

function formatMonthLabel(value: Date) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(value);
}

function formatDateValue(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function Autocomplete({
  label,
  value,
  placeholder,
  loading,
  options,
  selectedKey,
  getKey,
  getLabel,
  onSearch,
  onSelect,
}: {
  label: string;
  value: string;
  placeholder: string;
  loading: boolean;
  options: any[];
  selectedKey: string;
  getKey: (option: any) => string;
  getLabel: (option: any) => string;
  onSearch: (value: string) => void;
  onSelect: (option: any) => void;
}) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  useEffect(() => setFocusedIndex(0), [options]);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setFocusedIndex((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusedIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter' && open && options[focusedIndex]) {
      event.preventDefault();
      onSelect(options[focusedIndex]);
      setOpen(false);
    }
  }

  return (
    <div className="relative flex flex-col gap-1.5" ref={containerRef}>
      <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{label}</label>
      <input
        value={value}
        onChange={(event) => {
          onSearch(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={loading ? 'Carregando...' : placeholder}
        role="combobox"
        aria-expanded={open}
        className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-all focus:ring-2"
        style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)', ['--tw-ring-color' as string]: 'var(--color-primary-light)' }}
      />
      {open ? (
        <div role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-lg border py-1 shadow-lg" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          {loading ? (
            <div className="px-3 py-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Carregando...</div>
          ) : options.length === 0 ? (
            <div className="px-3 py-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Nenhum resultado encontrado.</div>
          ) : options.map((option, index) => {
            const key = getKey(option);
            return (
              <button
                key={key}
                type="button"
                role="option"
                aria-selected={key === selectedKey}
                onMouseEnter={() => setFocusedIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(option);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors"
                style={{ backgroundColor: focusedIndex === index ? 'var(--color-primary-bg)' : 'transparent', color: key === selectedKey ? 'var(--color-primary)' : 'var(--color-text)' }}
              >
                <span className="truncate">{getLabel(option)}</span>
                {key === selectedKey ? <Check size={16} style={{ color: 'var(--color-primary)' }} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function CalendarPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selectedDate = value ? new Date(`${value}T00:00:00`) : new Date();
  const [viewDate, setViewDate] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const firstDay = monthStart.getDay();
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: firstDay + daysInMonth }, (_, index) => index < firstDay ? null : index - firstDay + 1);

  return (
    <div className="rounded-2xl border p-3 shadow-sm" style={{ borderColor: '#e4e9df', backgroundColor: '#ffffff' }}>
      <div className="mb-3 flex items-center justify-between gap-2 rounded-xl px-2 py-1.5" style={{ backgroundColor: '#f8faf6' }}>
        <button type="button" className="rounded-lg p-2 transition-colors hover:bg-white" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))} style={{ color: '#4e574c' }}><ChevronLeft size={16} /></button>
        <span className="text-sm font-bold capitalize" style={{ color: '#1b1c1a' }}>{formatMonthLabel(viewDate)}</span>
        <button type="button" className="rounded-lg p-2 transition-colors hover:bg-white" onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))} style={{ color: '#4e574c' }}><ChevronRight size={16} /></button>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] font-bold uppercase" style={{ color: '#7c8579' }}>
        {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, index) => <div key={`${day}-${index}`}>{day}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} />;
          const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
          const dateValue = formatDateValue(date);
          const active = dateValue === value;
          return (
            <button
              key={dateValue}
              type="button"
              onClick={() => onChange(dateValue)}
              className="h-9 rounded-full text-sm font-semibold transition-all hover:-translate-y-0.5"
              style={{ backgroundColor: active ? 'var(--color-primary)' : '#ffffff', color: active ? '#ffffff' : '#4e574c', border: active ? '1px solid var(--color-primary)' : '1px solid #e4e9df', boxShadow: active ? '0 8px 18px rgba(21, 107, 22, 0.22)' : 'none' }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SolicitacoesComprasPage() {
  const { toasts, addToast, removeToast } = useToast();
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoCompra[]>([]);
  const [executivos, setExecutivos] = useState<ExecutivoOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [prazoCalendarOpen, setPrazoCalendarOpen] = useState(false);
  const [selectedSolicitacao, setSelectedSolicitacao] = useState<SolicitacaoCompra | null>(null);
  const [detalheItens, setDetalheItens] = useState<SolicitacaoItemDetalhe[]>([]);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [canAccess, setCanAccess] = useState(false);
  const [permissionLoaded, setPermissionLoaded] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState('');
  const [prioridade, setPrioridade] = useState('');
  const [executivo, setExecutivo] = useState('');
  const [busca, setBusca] = useState('');
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [clienteBusca, setClienteBusca] = useState('');
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [filiais, setFiliais] = useState<FilialOption[]>([]);
  const [loadingFiliais, setLoadingFiliais] = useState(false);
  const [produtoBusca, setProdutoBusca] = useState('');
  const [produtos, setProdutos] = useState<ProdutoOption[]>([]);
  const [loadingProdutos, setLoadingProdutos] = useState(false);
  const [produtosSolicitados, setProdutosSolicitados] = useState<ProdutoSolicitado[]>([]);
  const [produtoAnalise, setProdutoAnalise] = useState<ProdutoOption | null>(null);
  const [produtoSaida, setProdutoSaida] = useState<ProdutoSaidaData[]>([]);
  const [produtoClientes, setProdutoClientes] = useState<ProdutoClienteData[]>([]);
  const [loadingAnaliseProduto, setLoadingAnaliseProduto] = useState(false);

  const pageSize = 20;

  const executivoOptions = useMemo(() => [
    { value: '', label: 'Todos os executivos' },
    ...executivos.map((item) => {
      const label = item.NOME || item.EMAIL || `Usuário ${item.ID}`;
      return { value: String(item.ID || item.EMAIL || ''), label, searchText: `${label} ${item.EMAIL || ''}` };
    }),
  ], [executivos]);

  const filialOptions = useMemo(() => [
    { value: '', label: loadingFiliais ? 'Carregando filiais...' : 'Selecione a filial' },
    ...filiais.map((item) => ({
      value: String(item.CODFILIAL || ''),
      label: filialLabel(item),
      searchText: `${item.CODFILIAL || ''} ${item.NOME_FILIAL || ''}`,
    })),
  ], [filiais, loadingFiliais]);

  const summary = useMemo(() => {
    const abertas = solicitacoes.filter((item) => ['ABERTA', 'EM_ANALISE'].includes(item.STATUS)).length;
    const alta = solicitacoes.filter((item) => item.PRIORIDADE === 'ALTA').length;
    const vencidas = solicitacoes.filter((item) => item.PRAZO_DESEJADO && item.PRAZO_DESEJADO < new Date().toISOString().slice(0, 10) && !['CONCLUIDA', 'RECUSADA'].includes(item.STATUS)).length;
    return { abertas, alta, vencidas };
  }, [solicitacoes]);

  useEffect(() => {
    if (!showForm) return;
    let cancelled = false;
    setLoadingFiliais(true);
    callSF(SF.listarFiliais)
      .then((rows) => {
        if (!cancelled) setFiliais(rows as FilialOption[]);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) addToast('error', 'Não foi possível carregar as filiais.');
      })
      .finally(() => {
        if (!cancelled) setLoadingFiliais(false);
      });

    return () => { cancelled = true; };
  }, [addToast, showForm]);

  useEffect(() => {
    if (!showForm) return;
    let cancelled = false;
    setLoadingClientes(true);
    const timer = window.setTimeout(async () => {
      try {
        const rows = await callSF(SF.solicitacoesComprasClientesGeral, {
          busca: clienteBusca.trim(),
          limit: '50',
          offset: '0',
        });
        if (!cancelled) setClientes(rows as ClienteOption[]);
      } finally {
        if (!cancelled) setLoadingClientes(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [clienteBusca, showForm]);

  useEffect(() => {
    if (!showForm || !form.filialId || produtoBusca.trim().length < 1) {
      setProdutos([]);
      setLoadingProdutos(false);
      return;
    }

    let cancelled = false;
    setLoadingProdutos(true);
    const timer = window.setTimeout(async () => {
      try {
        const rows = await callSF(SF.mixCatalogoProdutosCustos, {
          busca: produtoBusca.trim(),
          clienteId: form.clienteId || '',
          filialId: form.filialId,
          limit: '20',
          offset: '0',
        });
        if (!cancelled) {
          setProdutos(rows.map((row: any) => ({
            PRODUCT_ID: Number(row.PRODUCT_ID || row.CODPROD || 0),
            CODPROD: Number(row.CODPROD || row.PRODUCT_ID || 0),
            CODFORNEC: row.CODFORNEC || row.FORNECEDOR_ID || '',
            FORNECEDOR_ID: row.FORNECEDOR_ID || row.CODFORNEC || '',
            CODIGO: String(row.CODIGO || row.CODPROD || row.PRODUCT_ID || ''),
            NOME: String(row.NOME || row.DESCRICAO || 'Produto'),
            CATEGORIA: String(row.CATEGORIA || ''),
          })));
        }
      } finally {
        if (!cancelled) setLoadingProdutos(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.clienteId, form.filialId, produtoBusca, showForm]);

  useEffect(() => {
    if (!showForm || !produtoAnalise) {
      setProdutoSaida([]);
      setProdutoClientes([]);
      setLoadingAnaliseProduto(false);
      return;
    }

    let cancelled = false;
    setLoadingAnaliseProduto(true);
    const input = { codprod: String(produtoAnalise.CODPROD || produtoAnalise.PRODUCT_ID) };
    Promise.all([
      callSF(SF.solicitacoesComprasProdutoSaidaGeral, input),
      callSF(SF.solicitacoesComprasProdutoClientesGeral, input),
    ]).then(([saidaRows, clienteRows]) => {
      if (cancelled) return;
      setProdutoSaida(normalizeSaidaProduto(saidaRows));
      setProdutoClientes(normalizeClientesProduto(clienteRows));
    }).catch((error) => {
      console.error(error);
      if (!cancelled) {
        setProdutoSaida([]);
        setProdutoClientes([]);
      }
    }).finally(() => {
      if (!cancelled) setLoadingAnaliseProduto(false);
    });

    return () => { cancelled = true; };
  }, [produtoAnalise, showForm]);

  const load = useCallback(async () => {
    if (!permissionLoaded || !canAccess) return;
    setLoading(true);
    try {
      await callSFMutation(SF.solicitacoesComprasSincronizarStatusCompras, {});
      const input = {
        status,
        prioridade,
        executivo: canManage ? executivo : '',
        busca: busca.trim(),
        limit: String(pageSize),
        offset: String(page * pageSize),
      };
      const [rows, countRow] = await Promise.all([
        callSF(SF.solicitacoesComprasListar, input),
        callSFSingle(SF.solicitacoesComprasContar, input),
      ]);
      setSolicitacoes(rows as SolicitacaoCompra[]);
      setTotal(Number(countRow?.TOTAL || 0));
    } catch (error) {
      console.error(error);
      addToast('error', 'Não foi possível carregar as solicitações.');
    } finally {
      setLoading(false);
    }
  }, [addToast, busca, canAccess, canManage, executivo, page, permissionLoaded, prioridade, status]);

  useEffect(() => {
    async function bootstrap() {
      const permissao = await callSFSingle(SF.solicitacoesComprasPermissaoGestao);
      const podeAcessar = Number(permissao?.PODE_ACESSAR || 0) === 1;
      const podeGerir = Number(permissao?.PODE_GERIR || 0) === 1;
      setCanAccess(podeAcessar);
      setCanManage(podeGerir);
      if (podeGerir) {
        const rows = await callSF(SF.solicitacoesComprasExecutivos);
        setExecutivos(rows as ExecutivoOption[]);
      }
      setPermissionLoaded(true);
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function resetAndSetFilter(setter: (value: string) => void, value: string) {
    setPage(0);
    setter(value);
  }

  function openCreate() {
    setForm(DEFAULT_FORM);
    setClienteBusca('');
    setProdutoBusca('');
    setProdutosSolicitados([]);
    setProdutoAnalise(null);
    setProdutoSaida([]);
    setProdutoClientes([]);
    setPrazoCalendarOpen(false);
    setShowForm(true);
  }

  function closeCreate() {
    if (saving) return;
    setShowForm(false);
    setForm(DEFAULT_FORM);
    setClienteBusca('');
    setProdutoBusca('');
    setProdutosSolicitados([]);
    setProdutoAnalise(null);
    setProdutoSaida([]);
    setProdutoClientes([]);
    setPrazoCalendarOpen(false);
  }

  function addProdutoSolicitado(produto: ProdutoOption) {
    const codprod = String(produto.CODPROD || produto.PRODUCT_ID || produto.CODIGO || '').trim();
    const codfornec = String(produto.CODFORNEC ?? produto.FORNECEDOR_ID ?? '').trim();
    const nome = produto.NOME || `Produto ${codprod}`;
    setProdutosSolicitados((current) => {
      const found = current.find((item) => item.codprod === codprod);
      if (found) {
        return current;
      }
      return [...current, { codprod, codfornec, produto: nome, quantidade: 0 }];
    });
    setProdutoAnalise(produto);
    setProdutoBusca('');
    setProdutos([]);
  }

  function updateProdutoQuantidade(codprod: string, value: string) {
    const quantidade = Math.max(0, Number(value.replace(',', '.')) || 0);
    setProdutosSolicitados((current) => current.map((item) => item.codprod === codprod ? { ...item, quantidade } : item));
  }

  async function openDetalheSolicitacao(solicitacao: SolicitacaoCompra) {
    setSelectedSolicitacao(solicitacao);
    setDetalheItens([]);
    setLoadingDetalhe(true);
    try {
      const rows = await callSF(SF.solicitacoesComprasItensListar, { solicitacaoId: String(solicitacao.ID) });
      setDetalheItens(rows as SolicitacaoItemDetalhe[]);
    } catch (error) {
      console.error(error);
      addToast('error', 'Não foi possível carregar os detalhes da solicitação.');
    } finally {
      setLoadingDetalhe(false);
    }
  }

  function closeDetalheSolicitacao() {
    setSelectedSolicitacao(null);
    setDetalheItens([]);
    setLoadingDetalhe(false);
  }

  function removeProdutoSolicitado(codprod: string) {
    setProdutosSolicitados((current) => current.filter((item) => item.codprod !== codprod));
  }

  async function saveSolicitacao() {
    if (!form.clienteId || !form.cliente.trim()) {
      addToast('error', 'Informe o cliente.');
      return;
    }
    if (!form.tipoSolicitacao.trim()) {
      addToast('error', 'Informe o tipo da solicitação.');
      return;
    }
    if (!form.filialId.trim()) {
      addToast('error', 'Informe a filial.');
      return;
    }
    if (produtosSolicitados.length === 0) {
      addToast('error', 'Adicione ao menos um produto com quantidade.');
      return;
    }
    if (produtosSolicitados.some((item) => item.quantidade <= 0)) {
      addToast('error', 'Informe uma quantidade maior que zero para todos os produtos.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.prazoDesejado.trim())) {
      addToast('error', 'Informe o prazo no formato AAAA-MM-DD.');
      return;
    }

    setSaving(true);
    try {
      const criadoEm = getBrasiliaTimestamp();
      const referenciaBase = form.referenciaComercialId.trim() || `SOL-${Date.now()}`;

      for (const [index, item] of produtosSolicitados.entries()) {
        const referenciaComercialId = produtosSolicitados.length === 1 ? referenciaBase : `${referenciaBase}-${index + 1}`;
        const ok = await callSFMutation(SF.solicitacoesComprasCriar, {
          cliente: form.cliente.trim(),
          tipoSolicitacao: form.tipoSolicitacao,
          descricao: form.descricao.trim(),
          prioridade: form.prioridade,
          prazoDesejado: form.prazoDesejado.trim(),
          codfilial: form.filialId,
          filialNome: form.filialNome,
          referenciaComercialId,
          criadoEm,
        });
        if (!ok) throw new Error(`Falha ao criar solicitação para o produto ${item.codprod}.`);

        const created = await callSFSingle(SF.solicitacoesComprasBuscarPorReferencia, { referenciaComercialId });
        const solicitacaoId = Number(created?.ID || 0);
        if (!solicitacaoId) throw new Error(`Solicitação criada sem ID localizável para o produto ${item.codprod}.`);

        const itemOk = await callSFMutation(SF.solicitacoesComprasAdicionarItem, {
          solicitacaoId: String(solicitacaoId),
          codprod: item.codprod,
          codfornec: item.codfornec || '0',
          produto: item.produto,
          quantidade: String(item.quantidade),
          observacao: '',
          criadoEm,
        });
        if (!itemOk) throw new Error(`Falha ao salvar item ${item.codprod}.`);
        const integracaoOk = await callSFMutation(SF.solicitacoesComprasEnviarItemCompras, {
          solicitacaoId: String(solicitacaoId),
          codprod: item.codprod,
        });
        if (!integracaoOk) throw new Error(`Falha ao enviar item ${item.codprod} para compras.`);
      }

      addToast('success', produtosSolicitados.length === 1 ? 'Solicitação criada e enviada para compras.' : `${produtosSolicitados.length} solicitações criadas e enviadas para compras.`);
      closeCreate();
      setPage(0);
      await load();
    } catch (error) {
      console.error(error);
      addToast('error', 'Não foi possível criar a solicitação.');
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (!permissionLoaded) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl p-10 text-lg" style={{ backgroundColor: '#ffffff', color: '#6a7367', border: '1px solid #e4e9df' }}>
        <Loader2 className="animate-spin" size={20} /> Verificando acesso...
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="rounded-[28px] p-8 shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
        <div className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em]" style={{ backgroundColor: '#ffe7e6', color: '#b42318' }}>
          <ShieldCheck size={14} /> Acesso restrito
        </div>
        <h1 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Página indisponível para este usuário</h1>
        <p className="mt-2 max-w-2xl" style={{ color: '#6a7367' }}>
          Esta tela de desenvolvimento está liberada apenas para o usuário autorizado.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <section className="rounded-[28px] p-6 shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em]" style={{ backgroundColor: '#e8f3e7', color: '#137432' }}>
              <ClipboardList size={14} /> Solicitações de compras
            </div>
            <h1 className="font-display text-4xl font-extrabold leading-tight" style={{ color: '#1b1c1a' }}>Pedidos de produtos</h1>
            <p className="mt-2 max-w-3xl text-base" style={{ color: '#6a7367' }}>
              Acompanhe e registre solicitações integradas ao fluxo de compras. Executivos veem apenas as próprias solicitações.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <span className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold" style={{ backgroundColor: '#edf7ed', color: '#137432' }}>
                <ShieldCheck size={16} /> Visão de gestão
              </span>
            ) : null}
            <Button onClick={openCreate} size="lg"><Plus size={18} /> Nova solicitação</Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl p-5 shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
          <p className="text-sm font-semibold" style={{ color: '#7c8579' }}>Total filtrado</p>
          <p className="mt-2 text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>{total}</p>
        </div>
        <div className="rounded-2xl p-5 shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
          <p className="text-sm font-semibold" style={{ color: '#7c8579' }}>Abertas na página</p>
          <p className="mt-2 text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>{summary.abertas}</p>
        </div>
        <div className="rounded-2xl p-5 shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
          <p className="text-sm font-semibold" style={{ color: '#7c8579' }}>Alta prioridade</p>
          <p className="mt-2 text-3xl font-extrabold" style={{ color: '#b42318' }}>{summary.alta}</p>
        </div>
        <div className="rounded-2xl p-5 shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
          <p className="text-sm font-semibold" style={{ color: '#7c8579' }}>Prazos vencidos</p>
          <p className="mt-2 text-3xl font-extrabold" style={{ color: '#9a6507' }}>{summary.vencidas}</p>
        </div>
      </section>

      <section className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
        <div className="grid gap-3 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Input
              label="Buscar"
              value={busca}
              onChange={(event) => resetAndSetFilter(setBusca, event.target.value)}
              placeholder="Cliente, tipo ou descrição"
            />
          </div>
          <Select label="Status" value={status} onChange={(value) => resetAndSetFilter(setStatus, value)} options={STATUS_OPTIONS} />
          <Select label="Prioridade" value={prioridade} onChange={(value) => resetAndSetFilter(setPrioridade, value)} options={PRIORIDADE_OPTIONS} />
          {canManage ? (
            <Select label="Executivo" value={executivo} onChange={(value) => resetAndSetFilter(setExecutivo, value)} options={executivoOptions} searchable searchPlaceholder="Buscar executivo..." />
          ) : (
            <div className="flex items-end">
              <div className="flex h-10 w-full items-center gap-2 rounded-lg border px-3 text-sm" style={{ borderColor: '#e4e9df', color: '#6a7367', backgroundColor: '#f8faf6' }}>
                <Search size={16} /> Minha carteira
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-2">

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-lg" style={{ color: '#6a7367' }}>
            <Loader2 className="animate-spin" size={20} /> Carregando solicitações...
          </div>
        ) : solicitacoes.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-lg font-bold" style={{ color: '#1b1c1a' }}>Nenhuma solicitação encontrada.</p>
            <p className="mt-1 text-sm" style={{ color: '#6a7367' }}>Crie uma nova solicitação para acionar o fluxo de compras.</p>
          </div>
        ) : (
          solicitacoes.map((item) => {
            const statusMeta = STATUS_META[item.STATUS] || STATUS_META.ABERTA;
            const prioridadeMeta = PRIORIDADE_META[item.PRIORIDADE] || PRIORIDADE_META.MEDIA;
            return (
              <button
                key={item.ID}
                type="button"
                onClick={() => void openDetalheSolicitacao(item)}
                className="grid w-full gap-3 rounded-2xl border px-4 py-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md md:grid-cols-[1fr_auto]"
                style={{ backgroundColor: '#ffffff', borderColor: '#e4e9df' }}
              >
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: '#7c8579' }}>#{item.ID}</span>
                    <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: statusMeta.bg, color: statusMeta.text }}>{statusLabel(item.STATUS)}</span>
                    <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: prioridadeMeta.bg, color: prioridadeMeta.text }}>{item.PRIORIDADE || '-'}</span>
                  </div>
                  <p className="truncate text-base font-bold" style={{ color: '#1b1c1a' }}>{item.CLIENTE}</p>
                  <p className="mt-1 text-sm" style={{ color: '#6a7367' }}>{formatTipo(item.TIPO_SOLICITACAO)} · {item.DESCRICAO || 'Sem descrição.'}</p>
                  {item.STATUS === 'RECUSADA' && item.MOTIVO_RECUSA ? (
                    <p className="mt-2 line-clamp-2 rounded-lg px-2 py-1 text-xs font-semibold leading-snug" style={{ backgroundColor: '#fff1f0', color: '#9f2a1d', border: '1px solid #ffd0cc' }}>
                      Motivo: {item.MOTIVO_RECUSA}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1 text-sm md:items-end" style={{ color: '#4e574c' }}>
                  <span>Criada em {formatCriadoEm(item.CRIADO_EM)}</span>
                  <span className="font-semibold">Prazo {formatPrazo(item.PRAZO_DESEJADO)}</span>
                  <span className="max-w-[240px] truncate text-xs" style={{ color: '#7c8579' }}>{item.RESPONSAVEL || item.EXECUTIVO_EMAIL || '-'}</span>
                </div>
              </button>
            );
          })
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: '#6a7367' }}>Página {page + 1} de {totalPages}</p>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}>Anterior</Button>
          <Button variant="secondary" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((value) => value + 1)}>Próxima</Button>
        </div>
      </div>

      <Modal isOpen={Boolean(selectedSolicitacao)} onClose={closeDetalheSolicitacao} title={selectedSolicitacao ? `Solicitação #${selectedSolicitacao.ID}` : 'Detalhes da solicitação'} size="xl">
        {selectedSolicitacao ? (() => {
          const statusMeta = STATUS_META[selectedSolicitacao.STATUS] || STATUS_META.ABERTA;
          const prioridadeMeta = PRIORIDADE_META[selectedSolicitacao.PRIORIDADE] || PRIORIDADE_META.MEDIA;
          return (
            <div className="space-y-4">
              <div className="rounded-2xl border p-4" style={{ borderColor: '#e4e9df', backgroundColor: '#ffffff' }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: '#7c8579' }}>Cliente</p>
                    <h3 className="mt-1 text-xl font-extrabold" style={{ color: '#1b1c1a' }}>{selectedSolicitacao.CLIENTE}</h3>
                    <p className="mt-2 text-sm" style={{ color: '#6a7367' }}>{selectedSolicitacao.DESCRICAO || 'Sem descrição informada.'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: statusMeta.bg, color: statusMeta.text }}>{statusLabel(selectedSolicitacao.STATUS)}</span>
                    <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: prioridadeMeta.bg, color: prioridadeMeta.text }}>{selectedSolicitacao.PRIORIDADE || '-'}</span>
                  </div>
                </div>
                {selectedSolicitacao.STATUS === 'RECUSADA' && selectedSolicitacao.MOTIVO_RECUSA ? (
                  <div className="mt-4 rounded-xl border px-3 py-2" style={{ backgroundColor: '#fff1f0', borderColor: '#ffd0cc', color: '#9f2a1d' }}>
                    <p className="text-xs font-bold uppercase tracking-[0.12em]">Motivo da recusa</p>
                    <p className="mt-1 text-sm font-semibold">{selectedSolicitacao.MOTIVO_RECUSA}</p>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                {[
                  ['Tipo', formatTipo(selectedSolicitacao.TIPO_SOLICITACAO)],
                  ['Criada em', formatCriadoEm(selectedSolicitacao.CRIADO_EM)],
                  ['Prazo', formatPrazo(selectedSolicitacao.PRAZO_DESEJADO)],
                  ['Responsável', selectedSolicitacao.RESPONSAVEL || selectedSolicitacao.EXECUTIVO_EMAIL || '-'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border p-3" style={{ borderColor: '#e4e9df', backgroundColor: '#f8faf6' }}>
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#7c8579' }}>{label}</p>
                    <p className="mt-1 truncate text-sm font-bold" style={{ color: '#1b1c1a' }}>{value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border p-4" style={{ borderColor: '#e4e9df', backgroundColor: '#ffffff' }}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold" style={{ color: '#1b1c1a' }}>Produtos solicitados</p>
                    <p className="text-xs" style={{ color: '#6a7367' }}>Itens enviados para análise no fluxo de compras.</p>
                  </div>
                  <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: '#f0f5ed', color: '#4e574c' }}>{detalheItens.length} item(ns)</span>
                </div>

                {loadingDetalhe ? (
                  <div className="flex min-h-[160px] items-center justify-center gap-2 text-sm" style={{ color: '#6a7367' }}>
                    <Loader2 className="animate-spin" size={18} /> Carregando detalhes...
                  </div>
                ) : detalheItens.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm" style={{ borderColor: '#dce4d8', color: '#6a7367' }}>
                    Nenhum produto encontrado para esta solicitação.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {detalheItens.map((item) => (
                      <div key={item.ID} className="rounded-xl border p-3" style={{ borderColor: '#eef2eb', backgroundColor: '#fbfcfa' }}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold" style={{ color: '#1b1c1a' }}>{item.CODPROD ? `${item.CODPROD} — ` : ''}{item.PRODUTO}</p>
                            <p className="mt-1 text-xs" style={{ color: '#6a7367' }}>Qtd. {FORMATTERS.number(Number(item.QUANTIDADE || 0))}</p>
                          </div>
                          <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: '#e8f3e7', color: '#137432' }}>{item.COMPRAS_STATUS || 'Enviado'}</span>
                        </div>
                        {item.COMPRAS_OBS_AVALIACAO ? (
                          <p className="mt-2 rounded-lg px-2 py-1 text-xs font-semibold" style={{ backgroundColor: '#fff1f0', color: '#9f2a1d', border: '1px solid #ffd0cc' }}>Motivo: {item.COMPRAS_OBS_AVALIACAO}</p>
                        ) : null}
                        {item.COMPRAS_SYNC_ERRO ? (
                          <p className="mt-2 rounded-lg px-2 py-1 text-xs font-semibold" style={{ backgroundColor: '#fff7ed', color: '#9a3412', border: '1px solid #fed7aa' }}>Erro de sincronização: {item.COMPRAS_SYNC_ERRO}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })() : null}
      </Modal>

      <Modal isOpen={showForm} onClose={closeCreate} title="Nova solicitação de compras" size="xl">
        <div className="space-y-5">
          <div className="rounded-2xl border px-4 py-3" style={{ borderColor: '#e4e9df', background: 'linear-gradient(135deg, #f8faf6 0%, #ffffff 100%)' }}>
            <p className="text-sm font-semibold" style={{ color: '#1b1c1a' }}>Preencha os dados essenciais para abrir o fluxo de compras.</p>
            <p className="mt-1 text-xs" style={{ color: '#6a7367' }}>Cliente, prazo e produtos ajudam o time responsável a priorizar a análise sem retrabalho.</p>
          </div>

          <div className="grid gap-4 rounded-2xl border p-4 md:grid-cols-2 xl:grid-cols-3" style={{ borderColor: '#e4e9df', backgroundColor: '#ffffff' }}>
            <Autocomplete
              label="Cliente"
              value={clienteBusca}
              placeholder="Digite nome ou código do cliente"
              loading={loadingClientes}
              options={clientes}
              selectedKey={form.clienteId}
              getKey={(cliente) => String(cliente.ID)}
              getLabel={clienteLabel}
              onSearch={(value) => {
                setClienteBusca(value);
                setForm((current) => ({ ...current, clienteId: '', cliente: value }));
                setProdutoBusca('');
                setProdutosSolicitados([]);
              }}
              onSelect={(cliente) => {
                const label = clienteLabel(cliente);
                setClienteBusca(label);
                setForm((current) => ({ ...current, clienteId: String(cliente.ID), cliente: label }));
              }}
            />
            <Select
              label="Filial"
              value={form.filialId}
              onChange={(value) => {
                const filial = filiais.find((item) => String(item.CODFILIAL || '') === value);
                setForm((current) => ({ ...current, filialId: value, filialNome: filial ? filialLabel(filial) : '' }));
                setProdutoBusca('');
                setProdutos([]);
                setProdutosSolicitados([]);
                setProdutoAnalise(null);
                setProdutoSaida([]);
                setProdutoClientes([]);
              }}
              options={filialOptions}
              searchable
              searchPlaceholder="Buscar filial..."
              disabled={loadingFiliais}
            />
            <Select label="Tipo" value={form.tipoSolicitacao} onChange={(value) => setForm((current) => ({ ...current, tipoSolicitacao: value }))} options={TIPO_OPTIONS} />
            <Select label="Prioridade" value={form.prioridade} onChange={(value) => setForm((current) => ({ ...current, prioridade: value }))} options={FORM_PRIORIDADE_OPTIONS} />
            <div className="relative flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Prazo desejado</label>
              <button
                type="button"
                onClick={() => setPrazoCalendarOpen((open) => !open)}
                className="flex h-10 items-center justify-between gap-2 rounded-lg border px-3 text-left text-sm outline-none transition-all focus:ring-2"
                style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: form.prazoDesejado ? 'var(--color-text)' : 'var(--color-text-secondary)', ['--tw-ring-color' as string]: 'var(--color-primary-light)' }}
              >
                <span>{form.prazoDesejado ? formatPrazo(form.prazoDesejado) : 'Selecionar data'}</span>
                <CalendarDays size={16} style={{ color: 'var(--color-primary)' }} />
              </button>
              {prazoCalendarOpen ? (
                <div className="absolute left-0 right-0 top-full z-50 mt-2 min-w-[300px]">
                  <CalendarPicker
                    value={form.prazoDesejado}
                    onChange={(value) => {
                      setForm((current) => ({ ...current, prazoDesejado: value }));
                      setPrazoCalendarOpen(false);
                    }}
                  />
                </div>
              ) : null}
            </div>
            <Input label="Referência comercial" value={form.referenciaComercialId} onChange={(event) => setForm((current) => ({ ...current, referenciaComercialId: event.target.value }))} placeholder="Opcional" />
          </div>

          <div className="space-y-4 rounded-2xl border p-4" style={{ borderColor: '#e4e9df', backgroundColor: '#ffffff' }}>
              <div className="flex items-start gap-3">
                <span className="rounded-full p-2" style={{ backgroundColor: '#e8f3e7', color: '#137432' }}><PackagePlus size={18} /></span>
                <div className="flex-1">
                  <p className="text-sm font-bold" style={{ color: '#1b1c1a' }}>Produtos e quantidades</p>
                  <p className="text-xs" style={{ color: '#6a7367' }}>Busque nos produtos cadastrados no sistema de gestão de custos.</p>
                </div>
                <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: '#f0f5ed', color: '#4e574c' }}>{produtosSolicitados.length} item(ns)</span>
              </div>
              <div className="rounded-2xl border p-3" style={{ borderColor: '#eef2eb', backgroundColor: '#f8faf6' }}>
                <Autocomplete
                  label="Produto"
                  value={produtoBusca}
                  placeholder={form.filialId ? 'Digite CODPROD ou nome do produto' : 'Selecione a filial antes do produto'}
                  loading={loadingProdutos}
                  options={produtos}
                  selectedKey=""
                  getKey={(produto) => String(produto.CODPROD || produto.PRODUCT_ID)}
                  getLabel={compactProdutoLabel}
                  onSearch={setProdutoBusca}
                  onSelect={addProdutoSolicitado}
                />
              </div>

              {produtosSolicitados.length === 0 ? (
                <div className="flex min-h-[112px] flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-5 text-center text-sm" style={{ borderColor: '#dce4d8', color: '#6a7367', backgroundColor: '#fbfcfa' }}>
                  <PackagePlus size={24} style={{ color: '#9aa794' }} />
                  <p className="mt-2 font-semibold" style={{ color: '#4e574c' }}>Nenhum produto adicionado</p>
                  <p className="mt-1 text-xs">Selecione um item na busca para montar a lista.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {produtosSolicitados.map((item) => (
                    <div key={item.codprod} className="rounded-xl border px-3 py-2" style={{ borderColor: '#e4e9df', backgroundColor: '#ffffff' }}>
                      <div className="flex items-start gap-3">
                        <PackagePlus size={17} className="mt-0.5" style={{ color: '#137432' }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold" style={{ color: '#1b1c1a' }}>{item.codprod} — {item.produto}</p>
                        </div>
                        <button type="button" onClick={() => removeProdutoSolicitado(item.codprod)} className="rounded-lg p-1.5" style={{ color: '#b42318' }} aria-label="Remover produto">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: '#4e574c' }}>
                        <label className="font-semibold" htmlFor={`qtd-produto-${item.codprod}`}>Qtd:</label>
                        <input
                          id={`qtd-produto-${item.codprod}`}
                          type="number"
                          min="0"
                          step="1"
                          value={item.quantidade}
                          onChange={(event) => updateProdutoQuantidade(item.codprod, event.target.value)}
                          className="h-10 w-20 rounded-lg border px-3 text-sm outline-none transition-all focus:ring-2"
                          style={{ borderColor: '#dce4d8', backgroundColor: '#ffffff', color: '#1b1c1a', '--tw-ring-color': '#13743233' } as CSSProperties}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {produtoAnalise ? (
                <div className="grid gap-4 xl:grid-cols-[1.55fr_0.85fr]">
                  <ChartContainer
                    className="py-4"
                    title="Saída geral do produto"
                    subtitle={compactProdutoLabel(produtoAnalise)}
                    icon={<BarChart3 size={17} style={{ color: 'var(--color-primary)' }} />}
                  >
                    {loadingAnaliseProduto ? (
                      <div className="flex min-h-[320px] items-center justify-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                        <Loader2 className="animate-spin" size={18} /> Carregando análise...
                      </div>
                    ) : produtoSaida.length > 0 ? (
                      <ShadcnBarChart
                        data={produtoSaida}
                        xKey="name"
                        bars={[{ dataKey: 'quantidade', name: 'Saída', color: 'var(--color-primary)' }]}
                        height={320}
                        formatter={FORMATTERS.number}
                      />
                    ) : (
                      <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed px-4 text-center text-sm" style={{ borderColor: '#dce4d8', color: '#6a7367' }}>
                        Sem histórico geral de saída para este produto.
                      </div>
                    )}
                  </ChartContainer>

                  <div className="rounded-xl border p-4 shadow-sm" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
                    <div className="mb-4 flex items-start gap-2">
                      <span className="rounded-full p-2" style={{ backgroundColor: '#e8f3e7', color: '#137432' }}><Users size={16} /></span>
                      <div>
                        <p className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>Clientes compradores</p>
                        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Maiores compradores gerais do produto.</p>
                      </div>
                    </div>
                    {loadingAnaliseProduto ? (
                      <div className="flex min-h-[260px] items-center justify-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                        <Loader2 className="animate-spin" size={18} /> Carregando clientes...
                      </div>
                    ) : produtoClientes.length > 0 ? (
                      <div className="max-h-[280px] space-y-2 overflow-auto pr-1">
                        {produtoClientes.map((cliente, index) => (
                          <div key={`${cliente.codcli}-${index}`} className="rounded-lg border px-3 py-2" style={{ borderColor: '#eef2eb', backgroundColor: '#f8faf6' }}>
                            <p className="truncate text-sm font-bold" style={{ color: '#1b1c1a' }}>{cliente.codcli ? `${cliente.codcli} — ` : ''}{cliente.nome}</p>
                            <p className="mt-1 text-xs font-semibold" style={{ color: '#137432' }}>Qtd. {FORMATTERS.number(cliente.quantidade)}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed px-4 text-center text-sm" style={{ borderColor: '#dce4d8', color: '#6a7367' }}>
                        Nenhum cliente comprador encontrado para o produto.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs" style={{ borderColor: '#eef2eb', backgroundColor: '#fbfcfa', color: '#6a7367' }}>
                  <Building2 size={15} style={{ color: '#137432', flex: '0 0 auto' }} />
                  Selecione a filial, busque um produto e visualize a saída histórica geral e clientes compradores antes de criar a solicitação.
                </div>
              )}
            </div>

          <div className="flex flex-col gap-1.5 rounded-2xl border p-4" style={{ borderColor: '#e4e9df', backgroundColor: '#ffffff' }}>
            <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Descrição</label>
            <textarea
              value={form.descricao}
              onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))}
              placeholder="Complemento opcional: urgência, contexto comercial, observações de compra."
              rows={4}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-all focus:ring-2"
              style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)', ['--tw-ring-color' as string]: 'var(--color-primary-light)' }}
            />
          </div>
          <div className="flex items-start gap-3 rounded-2xl p-4 text-sm" style={{ backgroundColor: '#f8faf6', color: '#5f685c', border: '1px solid #e4e9df' }}>
            <Info size={18} style={{ color: '#137432', flex: '0 0 auto' }} />
            <span>A solicitação será vinculada automaticamente ao usuário logado como executivo responsável.</span>
          </div>
          <div className="sticky -bottom-5 -mx-5 flex justify-end gap-2 border-t px-5 py-4" style={{ borderColor: '#e4e9df', backgroundColor: '#ffffff' }}>
            <Button variant="secondary" onClick={closeCreate} disabled={saving}>Cancelar</Button>
            <Button onClick={saveSolicitacao} disabled={saving}>{saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Criar solicitação</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
