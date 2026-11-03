import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Eye, Filter, MapPin, MessageSquarePlus, MessageSquareText, PackageCheck, Tag, UsersRound, XCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import { callSFWithMeta, SF, formatCurrency, formatDate } from '../hooks/useMitra';
import { CoordinatorScopeFilter, useCoordinatorScope } from '../components/CoordinatorScopeFilter';
import {
  buildPaginationInput,
  filterClientesByBusca,
  isLatestRequest,
  shouldShowNextPage,
} from './historicoClientes.utils';

interface Cliente {
  ID: number;
  NOME_FANTASIA: string;
  RAZAO_SOCIAL: string;
  CIDADE: string;
  UF: string;
  SEGMENTO: string;
  STATUS: string;
  RAMO_CLIENTE?: string;
  IS_COBERTURA?: number;
  TAG_COBERTURA?: string;
}

interface VisitaHistorico {
  ID: number;
  DATA_AGENDADA: string;
  HORA_INICIO: string;
  TIPO: string;
  STATUS: string;
  RELATO: string;
  PLANEJAMENTO?: string;
  CRIADO_EM?: string;
  DATA_CONCLUSAO?: string;
  TIPO_REGISTRO?: 'VISITA' | 'TAREFA' | string;
  TOTAL_VISITAS_PERIODO?: number;
  TOTAL_TAREFAS_PERIODO?: number;
}

interface PedidoCliente {
  PEDIDO_ID: number;
  DATA_PEDIDO: string;
  STATUS_PEDIDO: string;
  VALOR_TOTAL: number;
  MARGEM_MEDIA: number;
  TOTAL_ITENS: number;
  MIX_ENVIADO?: number;
}

interface PedidoItem {
  ITEM_ID: number;
  PEDIDO_ID: number;
  PRODUTO_CODIGO: string;
  PRODUTO_NOME: string;
  QUANTIDADE: number;
  PRECO_UNITARIO: number;
  DESCONTO_PERC: number;
  TOTAL_ITEM: number;
}

interface VisitaSemanaResumo {
  ID: number;
  DATA_VISITA: string;
  DATA_RELATO: string;
  CLIENTE: string;
  STATUS_VISITA: string;
  SITUACAO_VISITA?: string;
  STATUS_RELATO: string;
  RELATO?: string;
  RESPONSAVEL_VISITA?: string;
}

type TipoHistorico = 'VISITA' | 'ATIVIDADE' | 'RELATO' | 'PEDIDO' | 'MIX';

type TimelineEntry =
  | { kind: 'VISITA'; key: string; date: string; time: string; item: VisitaHistorico }
  | { kind: 'ATIVIDADE'; key: string; date: string; time: string; item: VisitaHistorico }
  | { kind: 'RELATO'; key: string; date: string; time: string; item: VisitaHistorico }
  | { kind: 'PEDIDO'; key: string; date: string; time: string; item: PedidoCliente }
  | { kind: 'MIX'; key: string; date: string; time: string; item: PedidoCliente };

const VISITAS_PAGE_SIZE = 20;
const PEDIDOS_PAGE_SIZE = 20;
const CLIENTES_PAGE_SIZE = 300;
const CLIENTES_MAX_OFFSET = 12000;

const TIPOS_CONTATO = ['Ligação', 'WhatsApp', 'E-mail', 'Reunião on-line', 'Outro'];

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TIPO_OPTIONS: Array<{ value: TipoHistorico; label: string }> = [
  { value: 'VISITA', label: 'Visitas' },
  { value: 'ATIVIDADE', label: 'Atividades concluídas' },
  { value: 'RELATO', label: 'Relatos avulsos' },
  { value: 'PEDIDO', label: 'Pedidos' },
  { value: 'MIX', label: 'Mix' },
];

function statusColor(status: string) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'CONCLUIDA' || normalized === 'FATURADO' || normalized === 'FINALIZADA' || normalized === 'APROVADA') {
    return { bg: '#e7f6ea', text: '#1f7d3f' };
  }
  if (normalized === 'EM_ANDAMENTO') return { bg: '#e8efff', text: '#3559c7' };
  if (normalized === 'REAGENDADA') return { bg: '#fff4da', text: '#a06a07' };
  if (normalized === 'AGENDADA' || normalized === 'LIBERADO' || normalized === 'RASCUNHO') return { bg: '#eef0f5', text: '#46556f' };
  if (normalized === 'PENDENTE') return { bg: '#fff4da', text: '#a06a07' };
  return { bg: '#fdecec', text: '#b33a3a' };
}

function statusLabel(status: string) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'CONCLUIDA') return 'Concluída';
  if (normalized === 'EM_ANDAMENTO') return 'Em andamento';
  if (normalized === 'AGENDADA') return 'Agendada';
  if (normalized === 'REAGENDADA') return 'Reagendada';
  if (normalized === 'CANCELADA') return 'Cancelada';
  if (normalized === 'FATURADO') return 'Faturado';
  if (normalized === 'CANCELADO') return 'Cancelado';
  if (normalized === 'LIBERADO') return 'Liberado';
  if (normalized === 'BLOQUEADO') return 'Bloqueado';
  if (normalized === 'PENDENTE') return 'Pendente';
  if (normalized === 'FINALIZADA') return 'Finalizado';
  if (normalized === 'RASCUNHO') return 'Rascunho';
  if (normalized === 'APROVADA') return 'Aprovado';
  return status || '-';
}

function pedidoLabel(pedidoId: number) {
  if (pedidoId < 0) return `MIX #${Math.abs(pedidoId)}`;
  return `Pedido #${pedidoId}`;
}

function pedidoTitle(pedidoId: number) {
  if (pedidoId < 0) return `Detalhes do MIX #${Math.abs(pedidoId)}`;
  return `Detalhes do Pedido #${pedidoId}`;
}

function sanitizeRelatoHtmlForView(html: string): string {
  const sanitized = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, '$1="#"');

  return sanitized.replace(/<a\b([^>]*)>/gi, (_match, attrs) => {
    const safeAttrs = String(attrs)
      .replace(/\starget\s*=\s*(['"]).*?\1/gi, '')
      .replace(/\srel\s*=\s*(['"]).*?\1/gi, '');

    return `<a${safeAttrs} target="_blank" rel="noopener noreferrer">`;
  });
}

function stripHtml(value: string): string {
  return sanitizeRelatoHtmlForView(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function dateInRange(date: string, start: string, end: string): boolean {
  if (!date) return false;
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function formatDateTime(value?: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const date = raw.slice(0, 10);
  const time = raw.slice(11, 16);
  return `${formatDate(date)}${time ? ` às ${time}` : ''}`;
}

function formatDateSafe(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return 'Pendente';
  return formatDate(raw);
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function getCalendarDays(monthDate: Date): Array<Date | null> {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const startOffset = firstDay.getDay();
  const days: Array<Date | null> = [];

  for (let i = 0; i < startOffset; i += 1) days.push(null);
  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    days.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }
  while (days.length % 7 !== 0) days.push(null);

  return days;
}

function CalendarDatePicker({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = parseIsoDate(value);
  const [visibleMonth, setVisibleMonth] = useState(() => selectedDate || new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const days = getCalendarDays(visibleMonth);

  useEffect(() => {
    if (selectedDate) setVisibleMonth(selectedDate);
  }, [selectedDate?.getTime()]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const monthLabel = visibleMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border px-3 text-left text-sm transition-all duration-200 focus:outline-none focus:ring-2"
        style={{ backgroundColor: '#ffffff', borderColor: '#dfe6da', color: value ? '#2d352c' : '#7c8579' }}
      >
        <span className="truncate">{value ? formatDate(value) : placeholder}</span>
        <CalendarClock size={16} style={{ color: '#365940' }} />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-[286px] rounded-2xl border p-3 shadow-xl" style={{ backgroundColor: '#ffffff', borderColor: '#e5e9e1' }}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: '#edf2ee', color: '#365940' }}
              aria-label="Mês anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <strong className="text-sm capitalize" style={{ color: '#1b1c1a' }}>{monthLabel}</strong>
            <button
              type="button"
              onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: '#edf2ee', color: '#365940' }}
              aria-label="Próximo mês"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-extrabold uppercase tracking-[0.08em]" style={{ color: '#8a9287' }}>
            {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((weekday, index) => <span key={`${weekday}-${index}`}>{weekday}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, index) => {
              const iso = day ? toIsoDate(day) : '';
              const selected = iso === value;
              const today = iso === toIsoDate(new Date());
              return (
                <button
                  key={day ? iso : `empty-${index}`}
                  type="button"
                  disabled={!day}
                  onClick={() => {
                    if (!day) return;
                    onChange(iso);
                    setOpen(false);
                  }}
                  className="h-8 rounded-lg text-xs font-semibold disabled:cursor-default disabled:opacity-0"
                  style={{
                    backgroundColor: selected ? '#2f8d2f' : today ? '#edf7ef' : 'transparent',
                    color: selected ? '#ffffff' : today ? '#2f8d2f' : '#2d352c',
                  }}
                >
                  {day?.getDate()}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
            className="mt-3 flex h-9 w-full items-center justify-center gap-1 rounded-lg text-xs font-semibold"
            style={{ backgroundColor: '#edf2ee', color: '#365940' }}
          >
            <XCircle size={14} /> Limpar data
          </button>
        </div>
      ) : null}
    </div>
  );
}

function tipoLabel(value: string): string {
  if (value === 'VISITA') return 'Visitas';
  if (value === 'ATIVIDADE') return 'Atividades concluídas';
  if (value === 'PEDIDO') return 'Pedidos';
  if (value === 'MIX') return 'Mix';
  return 'Todos os tipos';
}

export default function HistoricoClientesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const coordinatorScope = useCoordinatorScope('historico-clientes');
  const clienteIdFromQuery = searchParams.get('clienteId') || '';
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState('');
  const [visitasSemanaResumo, setVisitasSemanaResumo] = useState<VisitaSemanaResumo[]>([]);
  const [historico, setHistorico] = useState<VisitaHistorico[]>([]);
  const [pedidos, setPedidos] = useState<PedidoCliente[]>([]);
  const [pedidoSelecionado, setPedidoSelecionado] = useState<PedidoCliente | null>(null);
  const [relatoSelecionado, setRelatoSelecionado] = useState<VisitaHistorico | null>(null);
  const [visitaSemanaSelecionada, setVisitaSemanaSelecionada] = useState<VisitaSemanaResumo | null>(null);
  const [itensPedido, setItensPedido] = useState<PedidoItem[]>([]);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [ramoClienteFiltro, setRamoClienteFiltro] = useState('');
  const [tipoSelecionado, setTipoSelecionado] = useState('TODOS');
  const [historicoDateRange, setHistoricoDateRange] = useState({ dataInicio: '', dataFim: '' });
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [loadingPedidos, setLoadingPedidos] = useState(false);
  const [loadingItensPedido, setLoadingItensPedido] = useState(false);
  const [errorClientes, setErrorClientes] = useState('');
  const [errorHistorico, setErrorHistorico] = useState('');
  const [errorPedidos, setErrorPedidos] = useState('');
  const [errorItensPedido, setErrorItensPedido] = useState('');
  const [historicoPage, setHistoricoPage] = useState(0);
  const [pedidosPage, setPedidosPage] = useState(0);
  const [historicoHasMore, setHistoricoHasMore] = useState(false);
  const [pedidosHasMore, setPedidosHasMore] = useState(false);

  const clientesRequestRef = useRef(0);
  const visitasSemanaRequestRef = useRef(0);
  const historicoRequestRef = useRef(0);
  const pedidosRequestRef = useRef(0);
  const itensPedidoRequestRef = useRef(0);

  const loadClientes = useCallback(async () => {
    if (coordinatorScope.loadingScope) return;
    const requestId = ++clientesRequestRef.current;
    setLoadingClientes(true);
    setErrorClientes('');
    const pageSize = CLIENTES_PAGE_SIZE;
    let offset = 0;
    const clientesRows: Cliente[] = [];

    while (true) {
      const pageInput = buildPaginationInput(offset / pageSize, pageSize);
      const { rows, error } = await callSFWithMeta(SF.minhaCarteiraClientes, {
        busca: '',
        idBu: '',
        segmento: '',
        ramoCliente: '',
        status: '',
        cidade: '',
        uf: '',
        ...coordinatorScope.scopeParams,
        ...pageInput,
      });
      if (!isLatestRequest(requestId, clientesRequestRef.current)) return;
      if (error) {
        setClientes([]);
        setClienteSelecionadoId('');
        setErrorClientes('Não foi possível carregar sua carteira de clientes. Tente novamente.');
        setLoadingClientes(false);
        return;
      }

      const batch = rows as Cliente[];
      clientesRows.push(...batch);
      setClientes([...clientesRows]);

      if (batch.length < pageSize) break;
      offset += pageSize;
      if (offset >= CLIENTES_MAX_OFFSET) break;
    }

    if (!isLatestRequest(requestId, clientesRequestRef.current)) return;

    setClientes(clientesRows);
    if (clientesRows.length === 0) {
      setClienteSelecionadoId('');
      setLoadingClientes(false);
      return;
    }
    const hasQueryClient = clientesRows.some((cliente) => String(cliente.ID) === clienteIdFromQuery);
    setClienteSelecionadoId((prev) => {
      if (clienteIdFromQuery && hasQueryClient) return clienteIdFromQuery;
      if (prev && clientesRows.some((cliente) => String(cliente.ID) === prev)) return prev;
      return String(clientesRows[0].ID);
    });
    setLoadingClientes(false);
  }, [clienteIdFromQuery, coordinatorScope.loadingScope, coordinatorScope.scopeParams]);

  const loadVisitasSemana = useCallback(async () => {
    if (coordinatorScope.loadingScope) return;
    const requestId = ++visitasSemanaRequestRef.current;
    const { rows, error } = await callSFWithMeta(SF.dashboardVisitasSemanaResumo, {
      ...coordinatorScope.scopeParams,
    });
    if (!isLatestRequest(requestId, visitasSemanaRequestRef.current)) return;
    setVisitasSemanaResumo(error ? [] : rows as VisitaSemanaResumo[]);
  }, [coordinatorScope.loadingScope, coordinatorScope.scopeParams]);

  const loadHistorico = useCallback(async (clienteId: string, page: number, dataInicio: string, dataFim: string) => {
    if (coordinatorScope.loadingScope) return;
    const requestId = ++historicoRequestRef.current;
    if (!clienteId) {
      setHistorico([]);
      setHistoricoHasMore(false);
      setErrorHistorico('');
      setLoadingHistorico(false);
      return;
    }

    const pageInput = buildPaginationInput(page, VISITAS_PAGE_SIZE);

    setLoadingHistorico(true);
    setErrorHistorico('');
    const { rows, error } = await callSFWithMeta(SF.historicoVisitasCliente, {
      clienteId,
      status: '',
      dataInicio,
      dataFim,
      ...coordinatorScope.scopeParams,
      ...pageInput,
    });
    if (!isLatestRequest(requestId, historicoRequestRef.current)) return;
    if (error) {
      setHistorico([]);
      setHistoricoHasMore(false);
      setErrorHistorico('Não foi possível carregar o histórico de atividades deste cliente.');
      setLoadingHistorico(false);
      return;
    }

    const historicoRows = rows as VisitaHistorico[];
    setHistorico(historicoRows);
    setHistoricoHasMore(shouldShowNextPage(rows.length, VISITAS_PAGE_SIZE));
    setLoadingHistorico(false);
  }, [coordinatorScope.loadingScope, coordinatorScope.scopeParams]);

  const loadPedidos = useCallback(async (clienteId: string, page: number) => {
    if (coordinatorScope.loadingScope) return;
    const requestId = ++pedidosRequestRef.current;
    if (!clienteId) {
      setPedidos([]);
      setPedidosHasMore(false);
      setErrorPedidos('');
      setLoadingPedidos(false);
      return;
    }

    const pageInput = buildPaginationInput(page, PEDIDOS_PAGE_SIZE);

    setLoadingPedidos(true);
    setErrorPedidos('');
    const { rows, error } = await callSFWithMeta(SF.historicoPedidosCliente, {
      clienteId,
      ...coordinatorScope.scopeParams,
      ...pageInput,
    });
    if (!isLatestRequest(requestId, pedidosRequestRef.current)) return;
    if (error) {
      setPedidos([]);
      setPedidosHasMore(false);
      setErrorPedidos('Não foi possível carregar os pedidos deste cliente.');
      setLoadingPedidos(false);
      return;
    }

    setPedidos((rows as PedidoCliente[]).filter((pedido) => pedido.PEDIDO_ID > 0 || Number(pedido.MIX_ENVIADO || 0) === 1));
    setPedidosHasMore(shouldShowNextPage(rows.length, PEDIDOS_PAGE_SIZE));
    setLoadingPedidos(false);
  }, [coordinatorScope.loadingScope, coordinatorScope.scopeParams]);

  const abrirDetalhesPedido = useCallback(async (pedido: PedidoCliente) => {
    const requestId = ++itensPedidoRequestRef.current;
    if (!clienteSelecionadoId) return;
    setPedidoSelecionado(pedido);
    setItensPedido([]);
    setLoadingItensPedido(true);
    setErrorItensPedido('');
    const isMix = pedido.PEDIDO_ID < 0;
    const { rows, error } = await callSFWithMeta(SF.detalhesPedidoCliente, {
      clienteId: clienteSelecionadoId,
      pedidoId: String(pedido.PEDIDO_ID),
      ...coordinatorScope.scopeParams,
    });
    if (!isLatestRequest(requestId, itensPedidoRequestRef.current)) return;
    if (error) {
      setItensPedido([]);
      setErrorItensPedido(isMix ? 'Não foi possível carregar os itens deste mix.' : 'Não foi possível carregar os itens deste pedido.');
      setLoadingItensPedido(false);
      return;
    }

    setItensPedido(rows as PedidoItem[]);
    setLoadingItensPedido(false);
  }, [clienteSelecionadoId, coordinatorScope.scopeParams]);

  function fecharDetalhesPedido() {
    setPedidoSelecionado(null);
    setItensPedido([]);
    setErrorItensPedido('');
  }

  function abrirRelato(item: VisitaHistorico) {
    setRelatoSelecionado(item);
  }

  function fecharRelato() {
    setRelatoSelecionado(null);
  }

  function abrirVisitaSemana(visita: VisitaSemanaResumo) {
    setVisitaSemanaSelecionada(visita);
  }

  function fecharVisitaSemana() {
    setVisitaSemanaSelecionada(null);
  }

  useEffect(() => {
    loadClientes();
  }, [loadClientes]);

  useEffect(() => {
    setClienteSelecionadoId('');
    setClientes([]);
    setHistorico([]);
    setPedidos([]);
    setHistoricoPage(0);
    setPedidosPage(0);
    setHistoricoHasMore(false);
    setPedidosHasMore(false);
    setPedidoSelecionado(null);
    setItensPedido([]);
    setErrorHistorico('');
    setErrorPedidos('');
    setErrorItensPedido('');
  }, [coordinatorScope.scopeParams]);

  useEffect(() => {
    loadVisitasSemana();
  }, [loadVisitasSemana]);

  useEffect(() => {
    setHistoricoPage(0);
  }, [clienteSelecionadoId, historicoDateRange.dataInicio, historicoDateRange.dataFim]);

  useEffect(() => {
    loadHistorico(clienteSelecionadoId, historicoPage, historicoDateRange.dataInicio, historicoDateRange.dataFim);
  }, [clienteSelecionadoId, historicoPage, historicoDateRange.dataInicio, historicoDateRange.dataFim, loadHistorico]);

  useEffect(() => {
    setPedidosPage(0);
  }, [clienteSelecionadoId]);

  useEffect(() => {
    loadPedidos(clienteSelecionadoId, pedidosPage);
    setPedidoSelecionado(null);
    setItensPedido([]);
    setErrorItensPedido('');
  }, [clienteSelecionadoId, pedidosPage, loadPedidos]);

  useEffect(() => {
    if (!clienteSelecionadoId) return;
    if (clienteIdFromQuery === clienteSelecionadoId) return;
    setSearchParams({ clienteId: clienteSelecionadoId }, { replace: true });
  }, [clienteSelecionadoId, clienteIdFromQuery, setSearchParams]);

  const ramoOptions = useMemo(() => {
    const values = new Set<string>();
    clientes.forEach((cliente) => {
      const ramo = String(cliente.RAMO_CLIENTE || '').trim();
      if (ramo) values.add(ramo);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [clientes]);

  const clientesFiltrados = useMemo(() => {
    return filterClientesByBusca(clientes, buscaCliente).filter((cliente) => {
      if (!ramoClienteFiltro) return true;
      return String(cliente.RAMO_CLIENTE || '') === ramoClienteFiltro;
    });
  }, [clientes, buscaCliente, ramoClienteFiltro]);

  const clienteOptions = useMemo(() => {
    return clientesFiltrados.map((cliente) => ({
      value: String(cliente.ID),
      label: `${cliente.NOME_FANTASIA || cliente.RAZAO_SOCIAL || `Cliente ${cliente.ID}`} - Cód. ${cliente.ID}`,
    }));
  }, [clientesFiltrados]);

  const ramoSelectOptions = useMemo(() => {
    return [
      { value: '', label: 'Todos os ramos' },
      ...ramoOptions.map((ramo) => ({ value: ramo, label: ramo })),
    ];
  }, [ramoOptions]);

  const tipoSelectOptions = useMemo(() => {
    return [
      { value: 'TODOS', label: 'Todos os tipos' },
      ...TIPO_OPTIONS,
    ];
  }, []);

  const clienteSelecionado = useMemo(() => {
    return clientes.find((cliente) => String(cliente.ID) === clienteSelecionadoId) || null;
  }, [clientes, clienteSelecionadoId]);

  useEffect(() => {
    if (loadingClientes) return;
    if (clientesFiltrados.length === 0) {
      setClienteSelecionadoId('');
      return;
    }
    if (!clientesFiltrados.some((cliente) => String(cliente.ID) === clienteSelecionadoId)) {
      setClienteSelecionadoId(String(clientesFiltrados[0].ID));
    }
  }, [clientesFiltrados, clienteSelecionadoId, loadingClientes]);

  const [novoRelatoAberto, setNovoRelatoAberto] = useState(false);
  const [novoRelato, setNovoRelato] = useState({ data: '', hora: '', tipo: TIPOS_CONTATO[0], texto: '' });
  const [salvandoRelato, setSalvandoRelato] = useState(false);
  const [erroNovoRelato, setErroNovoRelato] = useState('');
  const clienteSelecionadoNome = useMemo(() => {
    const cliente = clientes.find((c) => String(c.ID) === clienteSelecionadoId);
    return cliente ? String(cliente.NOME_FANTASIA || cliente.RAZAO_SOCIAL || '') : '';
  }, [clientes, clienteSelecionadoId]);

  function abrirNovoRelato() {
    const agora = new Date();
    setNovoRelato({ data: hojeIso(), hora: `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`, tipo: TIPOS_CONTATO[0], texto: '' });
    setErroNovoRelato('');
    setNovoRelatoAberto(true);
  }

  async function salvarNovoRelato() {
    if (!clienteSelecionadoId || !novoRelato.texto.trim() || !novoRelato.data) return;
    setSalvandoRelato(true);
    setErroNovoRelato('');
    const { error } = await callSFWithMeta(SF.registrarRelatoCliente, {
      clienteId: clienteSelecionadoId,
      dataContato: novoRelato.data,
      horaContato: novoRelato.hora,
      tipoContato: novoRelato.tipo,
      relato: novoRelato.texto.trim(),
    });
    setSalvandoRelato(false);
    if (error) {
      setErroNovoRelato('Não foi possível salvar o relato. Tente de novo.');
      return;
    }
    setNovoRelatoAberto(false);
    loadHistorico(clienteSelecionadoId, historicoPage, historicoDateRange.dataInicio, historicoDateRange.dataFim);
  }

  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [];
    historico.forEach((item) => {
      const tipoRegistro = String(item.TIPO_REGISTRO || '').toUpperCase();
      if (tipoRegistro === 'RELATO') {
        entries.push({ kind: 'RELATO', key: `relato-${item.ID}`, date: item.DATA_AGENDADA, time: item.HORA_INICIO && item.HORA_INICIO !== '--:--' ? item.HORA_INICIO : '', item });
        return;
      }
      if (tipoRegistro === 'TAREFA') {
        entries.push({ kind: 'ATIVIDADE', key: `atividade-${item.ID}`, date: item.DATA_CONCLUSAO || item.DATA_AGENDADA, time: String(item.DATA_CONCLUSAO || '').slice(11, 16), item });
        return;
      }
      entries.push({ kind: 'VISITA', key: `visita-${item.ID}`, date: item.DATA_AGENDADA, time: item.HORA_INICIO || '', item });
    });

    pedidos.forEach((pedido) => {
      const kind = pedido.PEDIDO_ID < 0 ? 'MIX' : 'PEDIDO';
      entries.push({ kind, key: `${kind.toLowerCase()}-${pedido.PEDIDO_ID}`, date: pedido.DATA_PEDIDO, time: '', item: pedido });
    });

    return entries
      .filter((entry) => tipoSelecionado === 'TODOS' || entry.kind === tipoSelecionado)
      .filter((entry) => dateInRange(entry.date, historicoDateRange.dataInicio, historicoDateRange.dataFim))
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
  }, [historico, pedidos, tipoSelecionado, historicoDateRange.dataInicio, historicoDateRange.dataFim]);

  const filtrosAtivos = useMemo(() => {
    const filtros: Array<{ key: string; label: string }> = [];
    if (buscaCliente.trim()) filtros.push({ key: 'busca', label: `Busca: ${buscaCliente.trim()}` });
    if (ramoClienteFiltro) filtros.push({ key: 'ramo', label: `Ramo: ${ramoClienteFiltro}` });
    if (tipoSelecionado !== 'TODOS') filtros.push({ key: 'tipo', label: `Tipo: ${tipoLabel(tipoSelecionado)}` });
    if (historicoDateRange.dataInicio || historicoDateRange.dataFim) {
      const inicio = historicoDateRange.dataInicio || 'início';
      const fim = historicoDateRange.dataFim || 'hoje';
      filtros.push({ key: 'periodo', label: `Período: ${inicio} até ${fim}` });
    }
    return filtros;
  }, [buscaCliente, ramoClienteFiltro, tipoSelecionado, historicoDateRange.dataInicio, historicoDateRange.dataFim]);

  function limparFiltros() {
    setBuscaCliente('');
    setRamoClienteFiltro('');
    setTipoSelecionado('TODOS');
    setHistoricoDateRange({ dataInicio: '', dataFim: '' });
    setHistoricoPage(0);
    setPedidosPage(0);
  }

  const totalItensPedido = useMemo(() => {
    return itensPedido.reduce((sum, item) => sum + Number(item.TOTAL_ITEM || 0), 0);
  }, [itensPedido]);

  const visitasSemanaPendentes = useMemo(() => {
    return visitasSemanaResumo.filter((visita) => String(visita.STATUS_RELATO || '').toUpperCase() !== 'OK').length;
  }, [visitasSemanaResumo]);

  const visitasSemanaConcluidas = visitasSemanaResumo.length - visitasSemanaPendentes;

  function renderTimelineEntry(entry: TimelineEntry) {
    if (entry.kind === 'PEDIDO' || entry.kind === 'MIX') {
      const colors = statusColor(entry.item.STATUS_PEDIDO);
      return (
        <article key={entry.key} className="relative pl-12">
          <div className="absolute left-0 top-2 flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: '#e7f6ea', color: '#1f7d3f', boxShadow: '0 0 0 6px #f8faf7' }}>
            <PackageCheck size={17} />
          </div>
          <div className="rounded-2xl p-4" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0ea', boxShadow: '0 8px 22px rgba(27, 28, 26, 0.05)' }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: '#7a8379' }}>{formatDate(entry.item.DATA_PEDIDO)}</p>
                <h3 className="mt-1 text-xl font-bold" style={{ color: '#1b1c1a' }}>{pedidoLabel(entry.item.PEDIDO_ID)}</h3>
              </div>
              <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: colors.bg, color: colors.text }}>{statusLabel(entry.item.STATUS_PEDIDO)}</span>
            </div>
            <div className="mt-3 rounded-xl p-3" style={{ backgroundColor: '#f8faf7' }}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span style={{ color: '#677064' }}>{entry.item.TOTAL_ITENS} item(ns)</span>
                <strong style={{ color: '#1f7d3f' }}>{formatCurrency(Number(entry.item.VALOR_TOTAL || 0))}</strong>
              </div>
            </div>
            <button
              type="button"
              onClick={() => abrirDetalhesPedido(entry.item)}
              className="mt-3 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ backgroundColor: '#edf2ee', color: '#365940' }}
            >
              <Eye size={13} /> {entry.kind === 'MIX' ? 'Ver detalhes do mix' : 'Ver detalhes do pedido'}
            </button>
          </div>
        </article>
      );
    }

    if (entry.kind === 'RELATO') {
      return (
        <article key={entry.key} className="relative pl-12">
          <div className="absolute left-0 top-2 flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: '#f3ecfb', color: '#6f3db3', boxShadow: '0 0 0 6px #f8faf7' }}>
            <MessageSquareText size={17} />
          </div>
          <div className="rounded-2xl p-4" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0ea', boxShadow: '0 8px 22px rgba(27, 28, 26, 0.05)' }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: '#7a8379' }}>
                  {formatDate(entry.date)}{entry.time ? ` às ${entry.time}` : ''}
                </p>
                <h3 className="mt-1 text-xl font-bold" style={{ color: '#1b1c1a' }}>{entry.item.TIPO || 'Contato'}</h3>
              </div>
              <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: '#f3ecfb', color: '#6f3db3' }}>Relato avulso</span>
            </div>
            <div className="mt-3 rounded-xl p-3" style={{ backgroundColor: '#f8faf7' }}>
              <p className="text-sm whitespace-pre-wrap" style={{ color: '#536052' }}>{String(entry.item.RELATO || '').trim() || 'Sem detalhes registrados.'}</p>
            </div>
          </div>
        </article>
      );
    }

    const colors = statusColor(entry.item.STATUS);
    const isVisita = entry.kind === 'VISITA';
    const planejamento = String(entry.item.PLANEJAMENTO || '').trim();
    const relato = String(entry.item.RELATO || '').trim();
    const descricao = relato || planejamento || 'Sem detalhes registrados.';

    return (
      <article key={entry.key} className="relative pl-12">
        <div className="absolute left-0 top-2 flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: isVisita ? '#e8efff' : '#e7f6ea', color: isVisita ? '#3559c7' : '#1f7d3f', boxShadow: '0 0 0 6px #f8faf7' }}>
          {isVisita ? <CalendarClock size={17} /> : <CheckCircle2 size={17} />}
        </div>
        <div className="rounded-2xl p-4" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0ea', boxShadow: '0 8px 22px rgba(27, 28, 26, 0.05)' }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: '#7a8379' }}>
                {formatDate(entry.date)}{entry.time ? ` às ${entry.time}` : ''}
              </p>
              <h3 className="mt-1 text-xl font-bold" style={{ color: '#1b1c1a' }}>
                {isVisita ? `Visita #${entry.item.ID}` : entry.item.TIPO || `Atividade #${entry.item.ID}`}
              </h3>
            </div>
            <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: colors.bg, color: colors.text }}>{statusLabel(entry.item.STATUS)}</span>
          </div>

          {isVisita ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl p-3" style={{ backgroundColor: '#f8faf7' }}>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: '#8a9287' }}>Planejamento</p>
                <p className="mt-1 text-sm" style={{ color: '#536052' }}>{stripHtml(planejamento) || 'Sem planejamento registrado ao agendar.'}</p>
              </div>
              <div className="rounded-xl p-3" style={{ backgroundColor: relato ? '#f0faf2' : '#fff4da' }}>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: relato ? '#1f7d3f' : '#a06a07' }}>Relato</p>
                <p className="mt-1 text-sm" style={{ color: '#536052' }}>{relato ? `Resumo: ${stripHtml(relato)}` : 'Relato pendente.'}</p>
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-xl p-3" style={{ backgroundColor: '#f8faf7' }}>
              <p className="text-sm" style={{ color: '#536052' }}>{stripHtml(descricao)}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold" style={{ color: '#687466' }}>
                <span>Criada em {formatDateTime(entry.item.CRIADO_EM)}</span>
                <span>Concluída em {formatDateTime(entry.item.DATA_CONCLUSAO || entry.item.DATA_AGENDADA)}</span>
              </div>
            </div>
          )}

          {relato ? (
            <button
              type="button"
              onClick={() => abrirRelato(entry.item)}
              className="mt-3 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ backgroundColor: '#edf2ee', color: '#365940' }}
            >
              <Eye size={13} /> Ver relato completo
            </button>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <div className="animate-fadeIn flex flex-col pr-1">
      <section className="mb-5 rounded-[2rem] p-4" style={{ background: 'linear-gradient(135deg, #ffffff 0%, #f8faf7 62%, #eef6ea 100%)', border: '1px solid #e4e9df', boxShadow: '0 16px 34px rgba(27, 28, 26, 0.055)' }}>
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-extrabold" style={{ color: '#1b1c1a' }}>Últimas visitas da última semana</h2>
            <p className="text-sm" style={{ color: '#6f786d' }}>Visitas feitas pelo vendedor, sem filtro por cliente.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <span className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-extrabold" style={{ backgroundColor: '#edf7ef', color: '#1f7d3f' }}>
              <CheckCircle2 size={14} /> {visitasSemanaConcluidas} com relato
            </span>
            <span className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-extrabold" style={{ backgroundColor: '#fdecec', color: '#b33a3a' }}>
              <CalendarClock size={14} /> {visitasSemanaPendentes} pendente(s)
            </span>
            <button
              type="button"
              onClick={loadVisitasSemana}
              className="rounded-full px-4 py-2 text-xs font-extrabold transition-transform hover:-translate-y-0.5"
              style={{ color: '#2f8d2f', backgroundColor: '#ffffff', border: '1px solid #dfe9dc' }}
            >
              Atualizar agenda
            </button>
          </div>
        </div>

        <div className="visitas-semana-scroll overflow-x-auto overflow-y-hidden pb-3">
          {visitasSemanaResumo.length === 0 ? (
            <div className="min-w-full rounded-2xl px-4 py-8 text-center text-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #e5e9e1', color: '#6f786d' }}>
              Nenhuma visita registrada na última semana.
            </div>
          ) : (
            <div className="visitas-semana-track snap-x">
              {visitasSemanaResumo.map((visita, index) => {
                const relatoOk = String(visita.STATUS_RELATO || '').toUpperCase() === 'OK';
                const situacaoVisita = visita.SITUACAO_VISITA || visita.STATUS_VISITA;
                const colors = statusColor(situacaoVisita);
                const responsavelVisita = visita.RESPONSAVEL_VISITA || 'Responsável não informado';
                const iconColor = relatoOk ? '#1f7d3f' : index % 2 === 0 ? '#3559c7' : '#a06a07';
                return (
                  <button
                    type="button"
                    key={visita.ID}
                    onClick={() => abrirVisitaSemana(visita)}
                    className="relative w-[340px] flex-none snap-start overflow-hidden rounded-3xl p-4 pt-5 text-left shadow-sm transition-transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#9bc79b]"
                    style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df', boxShadow: '0 10px 24px rgba(27, 28, 26, 0.05)' }}
                  >
                    <div className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: relatoOk ? '#1f7d3f' : '#d15656' }} />
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: relatoOk ? '#e7f6ea' : '#fff4da', color: iconColor }}>
                        {relatoOk ? <CheckCircle2 size={17} /> : <CalendarClock size={17} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="line-clamp-2 text-sm font-extrabold leading-tight" style={{ color: '#2d352c' }} title={visita.CLIENTE}>{visita.CLIENTE}</h3>
                        <p className="mt-1 flex items-center gap-1 text-xs font-semibold" style={{ color: '#6f786d' }}>
                          <Eye size={13} /> Clique para ver detalhes
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: '#7c8579' }}>Visita</span>
                        <span className="font-extrabold" style={{ color: '#3e483c' }}>{formatDateSafe(visita.DATA_VISITA)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: '#7c8579' }}>Responsável</span>
                        <span className="max-w-[190px] truncate font-extrabold" style={{ color: '#3e483c' }} title={responsavelVisita}>{responsavelVisita}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: relatoOk ? '#1f7d3f' : '#b33a3a' }}>Relato</span>
                        <span className="font-extrabold" style={{ color: relatoOk ? '#1f7d3f' : '#b33a3a' }}>{formatDateSafe(visita.DATA_RELATO)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em]" style={{ backgroundColor: colors.bg, color: colors.text }}>
                          Situação: {statusLabel(situacaoVisita)}
                        </span>
                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em]" style={{ backgroundColor: relatoOk ? '#e7f6ea' : '#fdecec', color: relatoOk ? '#1f7d3f' : '#b33a3a' }}>
                          {relatoOk ? 'Relato ok' : 'Pendente'}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl p-4 flex flex-col gap-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e4e9df' }}>
        <CoordinatorScopeFilter scope={coordinatorScope} />

        <div className="rounded-2xl p-4" style={{ backgroundColor: '#ffffff', border: '1px solid #e5e9e1', boxShadow: '0 8px 22px rgba(27, 28, 26, 0.04)' }}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: '#e7f6ea', color: '#1f7d3f' }}>
                <Building2 size={22} />
              </div>
              <div>
                <p className="text-[10px] label-ui font-semibold" style={{ color: '#8a9287' }}>Cliente selecionado</p>
                <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>
                  {clienteSelecionado ? clienteSelecionado.NOME_FANTASIA : 'Nenhum cliente encontrado'}
                </h2>
                <p className="mt-1 text-sm" style={{ color: '#737d72' }}>
                  {clienteSelecionado ? clienteSelecionado.RAZAO_SOCIAL : 'Ajuste os filtros abaixo para localizar um cliente.'}
                </p>
              </div>
            </div>

            {clienteSelecionado ? (
              <div className="flex flex-wrap gap-2 xl:justify-end">
                <span className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ backgroundColor: '#edf2ee', color: '#365940' }}>
                  <Tag size={13} /> Cód. {clienteSelecionado.ID}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ backgroundColor: '#edf2ee', color: '#365940' }}>
                  <MapPin size={13} /> {clienteSelecionado.CIDADE}/{clienteSelecionado.UF}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ backgroundColor: '#edf2ee', color: '#365940' }}>
                  <Building2 size={13} /> {clienteSelecionado.RAMO_CLIENTE || clienteSelecionado.SEGMENTO || 'Sem ramo'}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl p-4" style={{ backgroundColor: '#ffffff', border: '1px solid #e5e9e1' }}>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: '#edf2ee', color: '#365940' }}>
                <Filter size={15} />
              </div>
              <div>
                <h3 className="text-sm font-extrabold" style={{ color: '#1b1c1a' }}>Filtros do histórico</h3>
                <p className="text-xs" style={{ color: '#7c8579' }}>{clientesFiltrados.length} cliente(s) disponível(is) após os filtros.</p>
              </div>
            </div>
            {filtrosAtivos.length > 0 ? (
              <button
                type="button"
                onClick={limparFiltros}
                className="self-start rounded-full px-3 py-1.5 text-xs font-semibold sm:self-auto"
                style={{ backgroundColor: '#edf2ee', color: '#365940' }}
              >
                Limpar todos
              </button>
            ) : null}
          </div>

          {errorClientes && (
            <div className="mb-3 rounded-xl px-3 py-2 text-xs font-semibold" style={{ backgroundColor: '#fdecec', color: '#b33a3a' }}>
              {errorClientes}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-12 xl:items-end">
            <label className="text-[11px] label-ui font-semibold xl:col-span-3" style={{ color: '#7c8579' }}>
              Buscar cliente:
              <input
                value={buscaCliente}
                onChange={(event) => setBuscaCliente(event.target.value)}
                placeholder="Nome, razão, código ou cidade"
                className="mt-1 h-10 w-full rounded-lg px-2 text-sm outline-none"
                style={{ backgroundColor: '#ffffff', border: '1px solid #dfe6da', color: '#2d352c' }}
              />
            </label>
            <Select
              className="xl:col-span-3"
              label="Cliente"
              value={clienteSelecionadoId}
              onChange={(value) => {
                setClienteSelecionadoId(value);
                setHistoricoPage(0);
                setPedidosPage(0);
              }}
              placeholder={loadingClientes ? 'Carregando clientes...' : 'Selecione o cliente'}
              options={clienteOptions}
              disabled={clienteOptions.length === 0}
            />
            <Select
              className="xl:col-span-2"
              label="Ramo"
              value={ramoClienteFiltro}
              onChange={(value) => {
                setRamoClienteFiltro(value);
                setHistoricoPage(0);
                setPedidosPage(0);
              }}
              options={ramoSelectOptions}
            />
            <Select
              className="xl:col-span-2"
              label="Tipo de histórico"
              value={tipoSelecionado}
              onChange={setTipoSelecionado}
              options={tipoSelectOptions}
            />
            <CalendarDatePicker
              label="De"
              value={historicoDateRange.dataInicio}
              placeholder="Data inicial"
              onChange={(value) => {
                setHistoricoDateRange((current) => ({ ...current, dataInicio: value }));
                setHistoricoPage(0);
              }}
            />
            <CalendarDatePicker
              label="Até"
              value={historicoDateRange.dataFim}
              placeholder="Data final"
              onChange={(value) => {
                setHistoricoDateRange((current) => ({ ...current, dataFim: value }));
                setHistoricoPage(0);
              }}
            />
            <div className="flex gap-2 lg:col-span-2 xl:col-span-12 xl:justify-end">
              <button
                type="button"
                onClick={() => {
                  setHistoricoDateRange({ dataInicio: '', dataFim: '' });
                  setHistoricoPage(0);
                }}
                className="h-10 rounded-lg px-4 text-xs font-semibold disabled:opacity-50"
                style={{ backgroundColor: '#edf2ee', color: '#365940' }}
                disabled={!historicoDateRange.dataInicio && !historicoDateRange.dataFim}
              >
                Limpar período
              </button>
            </div>
          </div>

          {filtrosAtivos.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {filtrosAtivos.map((filtro) => (
                <span key={filtro.key} className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: '#f0faf2', color: '#1f7d3f' }}>
                  {filtro.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {clienteSelecionado ? (
          <div className="pr-1 flex flex-col">
            {(errorHistorico || errorPedidos) && (
              <div className="mb-3 rounded-xl px-3 py-2 text-sm font-semibold" style={{ backgroundColor: '#fdecec', color: '#b33a3a' }}>
                {errorHistorico || errorPedidos}
              </div>
            )}

            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="hidden h-px flex-1 sm:block" style={{ backgroundColor: '#e4e9df' }} />
              <div className="text-center">
                <h3 className="label-ui text-[11px] font-extrabold tracking-[0.2em]" style={{ color: '#a0a79d' }}>HISTÓRICO DE INTERAÇÕES</h3>
                <p className="mt-1 text-xs" style={{ color: '#737d72' }}>Mensagens do relacionamento em ordem cronológica.</p>
              </div>
              <div className="hidden h-px flex-1 sm:block" style={{ backgroundColor: '#e4e9df' }} />
              <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: '#edf2ee', color: '#365940' }}>
                {timelineEntries.length} registro(s) exibido(s)
              </span>
              <button
                type="button"
                onClick={abrirNovoRelato}
                disabled={!clienteSelecionadoId}
                className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold disabled:opacity-50"
                style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}
              >
                <MessageSquarePlus size={14} /> Registrar relato
              </button>
            </div>

            <div className="relative space-y-5 before:absolute before:left-[17px] before:top-2 before:h-full before:w-px before:bg-[#dfe6da]">
              {loadingHistorico || loadingPedidos ? (
                <div className="rounded-2xl p-8 text-center text-sm" style={{ backgroundColor: '#ffffff', color: '#728070' }}>Carregando histórico...</div>
              ) : timelineEntries.length === 0 ? (
                <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: '#ffffff' }}>
                  <UsersRound size={20} className="mx-auto mb-2" style={{ color: '#8a9287' }} />
                  <p className="text-sm" style={{ color: '#728070' }}>Não há registros para os filtros selecionados.</p>
                  {filtrosAtivos.length > 0 ? (
                    <button
                      type="button"
                      onClick={limparFiltros}
                      className="mt-3 rounded-full px-3 py-1.5 text-xs font-semibold"
                      style={{ backgroundColor: '#edf2ee', color: '#365940' }}
                    >
                      Limpar filtros
                    </button>
                  ) : null}
                </div>
              ) : (
                timelineEntries.map((entry, index) => {
                  const showDate = index === 0 || timelineEntries[index - 1]?.date !== entry.date;
                  return (
                    <div key={`timeline-${entry.key}`}>
                      {showDate ? (
                        <div className="relative z-10 mb-4 flex justify-center">
                          <span className="rounded-full px-3 py-1 text-xs font-extrabold shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df', color: '#7c8579' }}>
                            {formatDate(entry.date)}
                          </span>
                        </div>
                      ) : null}
                      {renderTimelineEntry(entry)}
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold" style={{ color: '#7c8579' }}>Histórico</span>
                <button
                  type="button"
                  onClick={() => setHistoricoPage((prev) => Math.max(0, prev - 1))}
                  disabled={historicoPage === 0 || loadingHistorico}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  style={{ backgroundColor: '#edf2ee', color: '#365940' }}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setHistoricoPage((prev) => prev + 1)}
                  disabled={!historicoHasMore || loadingHistorico}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  style={{ backgroundColor: '#edf2ee', color: '#365940' }}
                >
                  Próxima
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold" style={{ color: '#7c8579' }}>Pedidos</span>
                <button
                  type="button"
                  onClick={() => setPedidosPage((prev) => Math.max(0, prev - 1))}
                  disabled={pedidosPage === 0 || loadingPedidos}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  style={{ backgroundColor: '#edf2ee', color: '#365940' }}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setPedidosPage((prev) => prev + 1)}
                  disabled={!pedidosHasMore || loadingPedidos}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  style={{ backgroundColor: '#edf2ee', color: '#365940' }}
                >
                  Próxima
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="min-h-[260px] rounded-2xl flex flex-col items-center justify-center gap-3 px-6 py-10 text-center" style={{ backgroundColor: '#ffffff', border: '1px solid #e5e9e1' }}>
            <UsersRound size={24} style={{ color: '#8a9287' }} />
            <div>
              <p className="text-base font-semibold" style={{ color: '#2d352c' }}>Nenhum cliente para exibir</p>
              <p className="mt-1 text-sm" style={{ color: '#728070' }}>Refine a busca ou limpe os filtros para carregar a linha do tempo.</p>
            </div>
            {filtrosAtivos.length > 0 ? (
              <button
                type="button"
                onClick={limparFiltros}
                className="rounded-full px-4 py-2 text-xs font-semibold"
                style={{ backgroundColor: '#2f8d2f', color: '#ffffff' }}
              >
                Limpar filtros
              </button>
            ) : null}
          </div>
        )}
      </section>

      <Modal isOpen={Boolean(visitaSemanaSelecionada)} onClose={fecharVisitaSemana} title="Informações da visita" size="md">
        {visitaSemanaSelecionada ? (() => {
          const relatoOk = String(visitaSemanaSelecionada.STATUS_RELATO || '').toUpperCase() === 'OK';
          const situacaoVisita = visitaSemanaSelecionada.SITUACAO_VISITA || visitaSemanaSelecionada.STATUS_VISITA;
          const colors = statusColor(situacaoVisita);
          const responsavelVisita = visitaSemanaSelecionada.RESPONSAVEL_VISITA || 'Responsável não informado';
          const relatoHtml = sanitizeRelatoHtmlForView(visitaSemanaSelecionada.RELATO || '');
          const textoRelato = relatoHtml.replace(/<[^>]*>/g, ' ').trim();
          const temImagem = /<img\b/i.test(relatoHtml);

          return (
            <div className="space-y-4">
              <div className="rounded-2xl p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e5e9e1' }}>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: '#7c8579' }}>Cliente</p>
                <h3 className="mt-1 text-lg font-extrabold" style={{ color: '#2d352c' }}>{visitaSemanaSelecionada.CLIENTE}</h3>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl p-4" style={{ backgroundColor: '#ffffff', border: '1px solid #e5e9e1' }}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: '#7c8579' }}>Data da visita</p>
                  <p className="mt-1 text-base font-extrabold" style={{ color: '#2d352c' }}>{formatDateSafe(visitaSemanaSelecionada.DATA_VISITA)}</p>
                </div>
                <div className="rounded-2xl p-4" style={{ backgroundColor: '#ffffff', border: '1px solid #e5e9e1' }}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: '#7c8579' }}>Responsável</p>
                  <p className="mt-1 text-base font-extrabold" style={{ color: '#2d352c' }}>{responsavelVisita}</p>
                </div>
                <div className="rounded-2xl p-4" style={{ backgroundColor: relatoOk ? '#f0faf2' : '#fff7f7', border: `1px solid ${relatoOk ? '#d8efdd' : '#f2dddd'}` }}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: relatoOk ? '#1f7d3f' : '#b33a3a' }}>Data do relato</p>
                  <p className="mt-1 text-base font-extrabold" style={{ color: relatoOk ? '#1f7d3f' : '#b33a3a' }}>{formatDateSafe(visitaSemanaSelecionada.DATA_RELATO)}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em]" style={{ backgroundColor: colors.bg, color: colors.text }}>
                  Situação: {statusLabel(situacaoVisita)}
                </span>
                <span className="inline-flex items-center rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em]" style={{ backgroundColor: relatoOk ? '#e7f6ea' : '#fdecec', color: relatoOk ? '#1f7d3f' : '#b33a3a' }}>
                  {relatoOk ? 'Relato ok' : 'Relato pendente'}
                </span>
              </div>

              {textoRelato || temImagem ? (
                <div className="rounded-2xl p-4" style={{ backgroundColor: '#f9faf8', border: '1px solid #e5e9e1' }}>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: '#7c8579' }}>Relato</p>
                  <div className="rich-text-editor-content text-sm" style={{ color: '#2d352c' }} dangerouslySetInnerHTML={{ __html: relatoHtml }} />
                </div>
              ) : (
                <div className="rounded-2xl p-4 text-sm" style={{ backgroundColor: '#fff7f7', border: '1px solid #f2dddd', color: '#b33a3a' }}>
                  Sem relato registrado para esta visita.
                </div>
              )}
            </div>
          );
        })() : null}
      </Modal>

      <Modal isOpen={novoRelatoAberto} onClose={() => !salvandoRelato && setNovoRelatoAberto(false)} title="Registrar relato" size="md">
        <div className="space-y-4">
          <p className="text-sm" style={{ color: '#6f786d' }}>
            Contato com <strong>{clienteSelecionadoNome || 'o cliente'}</strong> fora de uma visita. O relato entra no histórico do cliente.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>Data</label>
              <input type="date" value={novoRelato.data} max={hojeIso()} onChange={(e) => setNovoRelato((prev) => ({ ...prev, data: e.target.value }))} className="w-full mt-1 p-3 text-sm rounded-lg" style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }} disabled={salvandoRelato} />
            </div>
            <div>
              <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>Hora</label>
              <input type="time" value={novoRelato.hora} onChange={(e) => setNovoRelato((prev) => ({ ...prev, hora: e.target.value }))} className="w-full mt-1 p-3 text-sm rounded-lg" style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }} disabled={salvandoRelato} />
            </div>
          </div>
          <div>
            <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>Tipo de contato</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {TIPOS_CONTATO.map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setNovoRelato((prev) => ({ ...prev, tipo }))}
                  disabled={salvandoRelato}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold"
                  style={novoRelato.tipo === tipo ? { backgroundColor: 'var(--color-primary)', color: '#ffffff' } : { backgroundColor: '#edf2ee', color: '#365940' }}
                >
                  {tipo}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>Relato</label>
            <textarea value={novoRelato.texto} onChange={(e) => setNovoRelato((prev) => ({ ...prev, texto: e.target.value }))} rows={6} maxLength={4000} placeholder="O que foi conversado, combinado ou atualizado com o cliente." className="w-full mt-1 p-3 text-sm rounded-lg" style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }} disabled={salvandoRelato} />
          </div>
          {erroNovoRelato ? <p className="text-sm font-semibold" style={{ color: '#b42318' }}>{erroNovoRelato}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setNovoRelatoAberto(false)} disabled={salvandoRelato} className="rounded-full px-4 py-2 text-sm font-semibold" style={{ backgroundColor: '#edf2ee', color: '#365940' }}>Cancelar</button>
            <button type="button" onClick={salvarNovoRelato} disabled={salvandoRelato || !novoRelato.texto.trim() || !novoRelato.data} className="rounded-full px-4 py-2 text-sm font-bold disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)', color: '#ffffff' }}>
              {salvandoRelato ? 'Salvando...' : 'Salvar relato'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(relatoSelecionado)} onClose={fecharRelato} title="Relato da visita" size="lg">
        {relatoSelecionado ? (
          <div className="space-y-3">
            <div className="rounded-xl px-3 py-2 text-xs" style={{ backgroundColor: '#edf2ee', color: '#4f5c4c' }}>
              {formatDate(relatoSelecionado.DATA_AGENDADA)} • {relatoSelecionado.HORA_INICIO || '--:--'} • {relatoSelecionado.TIPO || '-'}
            </div>

            <div className="rounded-xl p-4 max-h-[55vh] overflow-y-auto" style={{ backgroundColor: '#f9faf8', border: '1px solid #e5e9e1' }}>
              {(() => {
                const relatoHtml = sanitizeRelatoHtmlForView(relatoSelecionado.RELATO || relatoSelecionado.PLANEJAMENTO || '');
                const textoRelato = relatoHtml.replace(/<[^>]*>/g, ' ').trim();
                const temImagem = /<img\b/i.test(relatoHtml);

                if (!textoRelato && !temImagem) {
                  return <p className="text-sm" style={{ color: '#728070' }}>Sem relato registrado.</p>;
                }

                return <div className="rich-text-editor-content text-sm" style={{ color: '#2d352c' }} dangerouslySetInnerHTML={{ __html: relatoHtml }} />;
              })()}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal isOpen={Boolean(pedidoSelecionado)} onClose={fecharDetalhesPedido} title={pedidoSelecionado ? pedidoTitle(pedidoSelecionado.PEDIDO_ID) : 'Detalhes do pedido'} size="lg">
        {loadingItensPedido ? (
          <div className="py-8 text-center text-sm" style={{ color: '#728070' }}>Carregando itens {pedidoSelecionado?.PEDIDO_ID && pedidoSelecionado.PEDIDO_ID < 0 ? 'do mix' : 'do pedido'}...</div>
        ) : errorItensPedido ? (
          <div className="py-8 text-center text-sm font-semibold" style={{ color: '#b33a3a' }}>{errorItensPedido}</div>
        ) : itensPedido.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: '#728070' }}>Nenhum item encontrado para este {pedidoSelecionado?.PEDIDO_ID && pedidoSelecionado.PEDIDO_ID < 0 ? 'mix' : 'pedido'}.</div>
        ) : (
          <div>
            <div className="grid grid-cols-12 px-3 py-2 text-[10px] label-ui font-semibold rounded-xl" style={{ backgroundColor: '#edf0eb', color: '#7c8579' }}>
              <div className="col-span-4">Produto</div>
              <div className="col-span-2">Quantidade</div>
              <div className="col-span-2">Preço unitário</div>
              <div className="col-span-2">Desconto</div>
              <div className="col-span-2 text-right">Total</div>
            </div>

            <div className="mt-2 space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {itensPedido.map((item) => (
                <div key={item.ITEM_ID} className="grid grid-cols-12 px-3 py-3 rounded-xl" style={{ backgroundColor: '#f9faf8', border: '1px solid #e5e9e1' }}>
                  <div className="col-span-4">
                    <p className="text-sm font-semibold" style={{ color: '#1b1c1a' }}>{item.PRODUTO_NOME}</p>
                    <p className="text-xs" style={{ color: '#7a8379' }}>{item.PRODUTO_CODIGO}</p>
                  </div>
                  <div className="col-span-2 text-sm" style={{ color: '#2d352c' }}>{item.QUANTIDADE}</div>
                  <div className="col-span-2 text-sm" style={{ color: '#2d352c' }}>{formatCurrency(Number(item.PRECO_UNITARIO || 0))}</div>
                  <div className="col-span-2 text-sm" style={{ color: '#2d352c' }}>{Number(item.DESCONTO_PERC || 0).toFixed(1)}%</div>
                  <div className="col-span-2 text-right text-sm font-semibold" style={{ color: '#2d352c' }}>{formatCurrency(Number(item.TOTAL_ITEM || 0))}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl px-4 py-3 flex items-center justify-between" style={{ backgroundColor: '#edf2ee' }}>
              <span className="text-sm font-semibold" style={{ color: '#365940' }}>Total {pedidoSelecionado?.PEDIDO_ID && pedidoSelecionado.PEDIDO_ID < 0 ? 'do mix' : 'do pedido'}</span>
              <span className="text-sm font-extrabold" style={{ color: '#1c3e2c' }}>{formatCurrency(totalItensPedido)}</span>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
