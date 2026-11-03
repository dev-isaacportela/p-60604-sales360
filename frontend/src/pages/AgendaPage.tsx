import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Eye,
  Pencil,
  Flag,
  PackageCheck,
  Plus,
  MapPin,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { callSF, callSFMutation, callSFSingle, callSFWithMeta, formatCurrency, formatDate, getBrasiliaDate, getBrasiliaTimestamp, SF } from '../hooks/useMitra';
import { sincronizarGoogleAgenda } from '../lib/googleAgenda';
import Select from '../components/ui/Select';
import Modal from '../components/ui/Modal';
import RichTextEditor, { richTextToPlainText } from '../components/ui/RichTextEditor';
import { CoordinatorScopeFilter, useCoordinatorScope } from '../components/CoordinatorScopeFilter';

type ViewMode = 'DIA' | 'SEMANA' | 'MES';
type EditMode = 'planejamento' | 'reagendamento' | 'relato';

interface AgendaPageProps {
  coordinatorReadOnly?: boolean;
}

const META_VISITAS_SEMANAIS_POR_VENDEDOR = 16;
const META_VISITAS_SEMANAIS_POR_COORDENADOR = 8;
const CLIENTE_SEARCH_MIN_LENGTH = 2;
const CLIENTE_SEARCH_LIMIT = '50';

function getMetaSemanalPessoa(item: { IS_OWN_SCOPE?: number | boolean; IS_COORDENADOR?: number | boolean } | null | undefined): number {
  return Number(item?.IS_COORDENADOR || item?.IS_OWN_SCOPE || 0) === 1
    ? META_VISITAS_SEMANAIS_POR_COORDENADOR
    : META_VISITAS_SEMANAIS_POR_VENDEDOR;
}

interface Visita {
  ID: number;
  CLIENTE_ID?: number | null;
  PROSPECT_ID?: number | null;
  PROSPECT_VISITA_ID?: number | null;
  DATA_AGENDADA: string;
  HORA_INICIO: string;
  HORA_FIM: string;
  TIPO: string;
  STATUS: 'AGENDADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA' | string;
  CHECKIN_HORA?: string;
  CHECKOUT_HORA?: string;
  RELATO?: string;
  PLANEJAMENTO?: string;
  VENDEDOR_ID?: number;
  COD_RCA?: number;
  VENDEDOR_NOME?: string;
  PODE_OPERAR?: number;
  ORIGEM?: 'VISITA' | 'INTERNA' | string;
  TITULO_INTERNO?: string;
  ORIGEM_DESLOCAMENTO?: string;
  DESTINO_DESLOCAMENTO?: string;
  PARTICIPANTES?: string;
  CLIENTE: string;
  CIDADE: string;
  ENDERECO?: string;
}

interface EditForm {
  titulo: string;
  origemDeslocamento: string;
  destinoDeslocamento: string;
  dataAgendada: string;
  horaInicio: string;
  horaFim: string;
  tipo: string;
  planejamento: string;
  relato: string;
}

interface CreateForm {
  modo: 'VISITA' | 'PROSPECCAO' | 'INTERNA' | 'DESLOCAMENTO';
  clienteId: string;
  prospectId: string;
  titulo: string;
  origemDeslocamento: string;
  destinoDeslocamento: string;
  participantesIds: string[];
  dataAgendada: string;
  horaInicio: string;
  horaFim: string;
  tipo: string;
  relato: string;
}

interface CarteiraCliente {
  ID: number;
  CODCLI?: number | string;
  WINTHOR_CODCLI?: number | string;
  NOME_FANTASIA?: string;
  RAZAO_SOCIAL?: string;
  CIDADE?: string;
  UF?: string;
  TAG_COBERTURA?: string;
}

interface ProspectAgendaOption {
  ID: number;
  RAZAO_SOCIAL: string;
  NOME_FANTASIA?: string;
  CIDADE?: string;
  UF?: string;
  STATUS_PIPELINE?: string;
}

interface VendedorConvite {
  USER_ID: number;
  NOME: string;
  EMAIL?: string;
}

interface CheckoutActivityForm {
  titulo: string;
  descricao: string;
  prioridade: string;
  dataLimite: string;
}

interface HistoricoVisitaCliente {
  ID: number;
  DATA_AGENDADA: string;
  HORA_INICIO?: string;
  TIPO?: string;
  STATUS: string;
  RELATO?: string;
  PLANEJAMENTO?: string;
  CRIADO_EM?: string;
  DATA_CONCLUSAO?: string;
  TIPO_REGISTRO?: 'VISITA' | 'TAREFA' | string;
}

interface HistoricoPedidoCliente {
  PEDIDO_ID: number;
  DATA_PEDIDO: string;
  STATUS_PEDIDO: string;
  VALOR_TOTAL: number;
  TOTAL_ITENS: number;
  MIX_ENVIADO?: number;
}

const VISITA_TIPO_OPTIONS = [
  { value: 'Aumento de mix', label: 'Aumento de mix' },
  { value: 'Gerar demanda', label: 'Gerar demanda' },
  { value: 'Padronização de produto', label: 'Padronização de produto' },
  { value: 'Positivação', label: 'Positivação' },
  { value: 'Financeiro', label: 'Financeiro' },
  { value: 'Renegociação', label: 'Renegociação' },
  { value: 'Manutenção', label: 'Manutenção' },
];

const AGENDA_INTERNA_TIPO_OPTIONS = [
  { value: 'Reunião interna', label: 'Reunião interna' },
  { value: 'Outros', label: 'Outros' },
];

const DESLOCAMENTO_TIPO_OPTIONS = [
  { value: 'Deslocamento', label: 'Deslocamento' },
];

const PROSPECCAO_TIPO_OPTIONS = [
  { value: 'Prospecção', label: 'Prospecção' },
  { value: 'Apresentação comercial', label: 'Apresentação comercial' },
  { value: 'Diagnóstico inicial', label: 'Diagnóstico inicial' },
  { value: 'Follow-up de prospecção', label: 'Follow-up de prospecção' },
];

const ATIVIDADE_PRIORIDADE_OPTIONS = [
  { value: 'ALTA', label: 'Alta' },
  { value: 'MEDIA', label: 'Média' },
  { value: 'BAIXA', label: 'Baixa' },
];

const EMPTY_CHECKOUT_ACTIVITY: CheckoutActivityForm = {
  titulo: '',
  descricao: '',
  prioridade: 'MEDIA',
  dataLimite: '',
};

function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateFromIso(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getMinAvailableVisitDate(): string {
  return toIsoDate(addDays(dateFromIso(getBrasiliaDate()), -5));
}

function isVisitDateAvailable(value: string, minDate: string): boolean {
  return !value || value >= minDate;
}

function isBusinessDayIso(value: string): boolean {
  if (!value) return false;
  const day = dateFromIso(value.slice(0, 10)).getDay();
  return day >= 1 && day <= 5;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const shift = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + shift);
  return d;
}

function endOfWeek(date: Date): Date {
  return addDays(startOfWeek(date), 6);
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getRangeByView(anchor: Date, view: ViewMode): { start: Date; end: Date } {
  if (view === 'DIA') return { start: anchor, end: anchor };
  if (view === 'SEMANA') return { start: startOfWeek(anchor), end: endOfWeek(anchor) };
  return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
}

function prettyDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function prettyDateLong(date: Date): string {
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function periodLabel(anchor: Date, view: ViewMode): string {
  if (view === 'DIA') {
    return anchor.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }
  if (view === 'SEMANA') {
    const start = startOfWeek(anchor);
    const end = endOfWeek(anchor);
    return `${prettyDate(start)} - ${prettyDate(end)}`;
  }
  return anchor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function shiftAnchor(anchor: Date, view: ViewMode, direction: -1 | 1): Date {
  if (view === 'DIA') return addDays(anchor, direction);
  if (view === 'SEMANA') return addDays(anchor, direction * 7);
  return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
}

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function statusColor(status: string): { bg: string; text: string } {
  if (status === 'CONCLUIDA') return { bg: '#dff2e2', text: '#1f6a30' };
  if (status === 'EM_ANDAMENTO') return { bg: '#dce9fb', text: '#2257a8' };
  if (status === 'CANCELADA') return { bg: '#f6dfdf', text: '#9f2d2d' };
  return { bg: '#f4eddc', text: '#9a6a1d' };
}

function sanitizeRelato(value: string): string {
  return value.trim().replace(/\n/g, ' ').replace(/'/g, "''").slice(0, 20000);
}

function hasRelatoContent(value: string): boolean {
  return richTextToPlainText(value).length > 0;
}

function appendRelatoAlteracao(relatoAtual: string, relatoAlteracao: string, houveReagendamento: boolean): string {
  const relatoAtualSanitizado = sanitizeRelato(relatoAtual || '');
  const relatoAlteracaoSanitizado = sanitizeRelato(relatoAlteracao || '');

  if (!relatoAlteracaoSanitizado) return relatoAtualSanitizado;

  const titulo = houveReagendamento ? 'Reagendamento' : 'Alteração';
  const dataHora = getBrasiliaTimestamp().replace('T', ' ').slice(0, 16);
  const blocoAlteracao = `<p><strong>${titulo} em ${dataHora}:</strong></p>${relatoAlteracaoSanitizado}`;

  return [relatoAtualSanitizado, blocoAlteracao].filter(Boolean).join('<hr />').slice(0, 20000);
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

function stripHtmlForResumo(value?: string): string {
  return sanitizeRelatoHtmlForView(String(value || '')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function statusLabel(status: string): string {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'CONCLUIDA') return 'Concluída';
  if (normalized === 'EM_ANDAMENTO') return 'Em andamento';
  if (normalized === 'AGENDADA') return 'Agendada';
  if (normalized === 'CANCELADA') return 'Cancelada';
  if (normalized === 'FATURADO') return 'Faturado';
  if (normalized === 'CANCELADO') return 'Cancelado';
  if (normalized === 'PENDENTE') return 'Pendente';
  if (normalized === 'FINALIZADA') return 'Finalizada';
  if (normalized === 'APROVADA') return 'Aprovada';
  return status || '-';
}

function formatHistoricoDateTime(value?: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const date = raw.slice(0, 10);
  const time = raw.slice(11, 16);
  return `${formatDate(date)}${time ? ` às ${time}` : ''}`;
}

function sanitizeAtividadeTexto(value: string, maxLength: number): string {
  return value.trim().replace(/\n/g, ' ').replace(/'/g, "''").slice(0, maxLength);
}

function sanitizeAgendaTexto(value: string, maxLength: number): string {
  return value.trim().replace(/\n/g, ' ').replace(/'/g, "''").slice(0, maxLength);
}

function createCheckoutActivity(defaultDate = ''): CheckoutActivityForm {
  return {
    ...EMPTY_CHECKOUT_ACTIVITY,
    dataLimite: defaultDate,
  };
}

function mapProspectVisitsToAgenda(rows: any[]): Visita[] {
  return rows.map((row) => ({
    ID: -Number(row.ID || 0),
    PROSPECT_VISITA_ID: Number(row.ID || 0),
    PROSPECT_ID: Number(row.PROSPECT_ID || 0),
    CLIENTE_ID: null,
    DATA_AGENDADA: row.DATA_VISITA || '',
    HORA_INICIO: row.HORA_INICIO || '',
    HORA_FIM: row.HORA_FIM || '',
    TIPO: 'Prospecção',
    STATUS: row.STATUS || 'AGENDADA',
    RELATO: row.RESUMO || '',
    PLANEJAMENTO: row.OBJETIVO || '',
    VENDEDOR_ID: Number(row.EXECUTIVO_ID || 0) || undefined,
    VENDEDOR_NOME: row.EXECUTIVO_NOME || '',
    PODE_OPERAR: 1,
    ORIGEM: 'PROSPECCAO',
    CLIENTE: row.RAZAO_SOCIAL || 'Prospect',
    CIDADE: 'Prospect',
  }));
}

function applyIntUserNamesToVisits(rows: Visita[], users: VendedorConvite[]): Visita[] {
  const namesByUserId = new Map(
    users
      .map((user) => [Number(user.USER_ID || 0), String(user.NOME || '').trim()] as const)
      .filter(([userId, nome]) => userId > 0 && Boolean(nome)),
  );

  if (namesByUserId.size === 0) return rows;

  return rows.map((visita) => {
    const nome = namesByUserId.get(Number(visita.VENDEDOR_ID || 0));
    return nome ? { ...visita, VENDEDOR_NOME: nome } : visita;
  });
}

function getProspectVisitId(visita: Visita | null): number {
  if (!visita) return 0;
  return Number(visita.PROSPECT_VISITA_ID || Math.abs(Number(visita.ID || 0)) || 0);
}

function getLoggedUserId(usuario: any): number {
  return Number(usuario?.ID || usuario?.USER_ID || usuario?.userId || 0) || 0;
}

function isProspectVisitFromUser(visita: any, userId: number): boolean {
  return userId > 0 && Number(visita.EXECUTIVO_ID || 0) === userId;
}

function mergeCarteiraClientes(current: CarteiraCliente[], incoming: CarteiraCliente[]): CarteiraCliente[] {
  const byId = new Map<string, CarteiraCliente>();
  current.forEach((cliente) => byId.set(String(cliente.ID), cliente));
  incoming.forEach((cliente) => byId.set(String(cliente.ID), cliente));
  return Array.from(byId.values());
}

function filterProspectVisitsByVisibility(
  rows: any[],
  usuario: any,
  coordinatorReadOnly: boolean,
  scopeParams: { scopeMode: string; scopeUserId: string },
  vendedoresScope: Array<{ USER_ID?: number | string }>,
): any[] {
  if (coordinatorReadOnly || scopeParams.scopeMode === 'TEAM') {
    const allowed = new Set(vendedoresScope.map((vendedor) => Number(vendedor.USER_ID || 0)).filter((id) => id > 0));
    return rows.filter((row) => allowed.has(Number(row.EXECUTIVO_ID || 0)));
  }

  if (scopeParams.scopeMode === 'SELLER') {
    const userId = Number(scopeParams.scopeUserId || 0);
    return rows.filter((row) => Number(row.EXECUTIVO_ID || 0) === userId);
  }

  const userId = getLoggedUserId(usuario);
  if (!userId) return [];
  return rows.filter((row) => Number(row.EXECUTIVO_ID || 0) === userId);
}

function getVendedorDisplay(visita: Visita, showRca = true): string {
  const nome = visita.VENDEDOR_NOME || `Usuário ${visita.VENDEDOR_ID || '-'}`;
  if (!showRca || !visita.COD_RCA) return nome;
  return `${nome} · RCA ${visita.COD_RCA}`;
}

function buildInitialCreateForm(): CreateForm {
  return {
    modo: 'VISITA',
    clienteId: '',
    prospectId: '',
    titulo: '',
    origemDeslocamento: '',
    destinoDeslocamento: '',
    participantesIds: [],
    dataAgendada: getBrasiliaDate(),
    horaInicio: '08:00',
    horaFim: '09:00',
    tipo: VISITA_TIPO_OPTIONS[0].value,
    relato: '',
  };
}

export default function AgendaPage({ coordinatorReadOnly = false }: AgendaPageProps = {}) {
  const coordinatorScope = useCoordinatorScope(coordinatorReadOnly ? 'agenda-coordenador' : 'agenda');
  const [view, setView] = useState<ViewMode>('SEMANA');
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [visitasSemanaMeta, setVisitasSemanaMeta] = useState<Visita[]>([]);
  const [loading, setLoading] = useState(true);
  const [metaPopupOpen, setMetaPopupOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(buildInitialCreateForm);
  const [carteiraClientes, setCarteiraClientes] = useState<CarteiraCliente[]>([]);
  const [clienteCarteiraSearch, setClienteCarteiraSearch] = useState('');
  const [prospectsAgenda, setProspectsAgenda] = useState<ProspectAgendaOption[]>([]);
  const [vendedoresConvite, setVendedoresConvite] = useState<VendedorConvite[]>([]);
  const [loadingCarteiraClientes, setLoadingCarteiraClientes] = useState(false);
  const [loadingBuscaCarteiraClientes, setLoadingBuscaCarteiraClientes] = useState(false);
  const [loadingProspectsAgenda, setLoadingProspectsAgenda] = useState(false);
  const [loadingVendedoresConvite, setLoadingVendedoresConvite] = useState(false);
  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);
  const [createError, setCreateError] = useState('');
  const [savingCreate, setSavingCreate] = useState(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutRelato, setCheckoutRelato] = useState('');
  const [checkoutVisitaId, setCheckoutVisitaId] = useState<number | null>(null);
  const [checkoutVisita, setCheckoutVisita] = useState<Visita | null>(null);
  const [checkoutAtividades, setCheckoutAtividades] = useState<CheckoutActivityForm[]>([createCheckoutActivity()]);
  const [checkoutSaving, setCheckoutSaving] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [checkoutCompleted, setCheckoutCompleted] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelVisitaId, setCancelVisitaId] = useState<number | null>(null);
  const [cancelRelato, setCancelRelato] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [cancelSaving, setCancelSaving] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const [editingVisita, setEditingVisita] = useState<Visita | null>(null);
  const [editMode, setEditMode] = useState<EditMode>('reagendamento');
  const [actionChoiceVisita, setActionChoiceVisita] = useState<Visita | null>(null);
  const [conteudoSelecionado, setConteudoSelecionado] = useState<{ visita: Visita; tipo: 'planejamento' | 'relato' } | null>(null);
  const [clienteHistoricoVisita, setClienteHistoricoVisita] = useState<Visita | null>(null);
  const [clienteHistoricoVisitas, setClienteHistoricoVisitas] = useState<HistoricoVisitaCliente[]>([]);
  const [clienteHistoricoPedidos, setClienteHistoricoPedidos] = useState<HistoricoPedidoCliente[]>([]);
  const [clienteHistoricoLoading, setClienteHistoricoLoading] = useState(false);
  const [clienteHistoricoError, setClienteHistoricoError] = useState('');
  const [editForm, setEditForm] = useState<EditForm>({
    titulo: '',
    origemDeslocamento: '',
    destinoDeslocamento: '',
    dataAgendada: '',
    horaInicio: '',
    horaFim: '',
    tipo: '',
    planejamento: '',
    relato: '',
  });
  const carteiraSearchRequestRef = useRef(0);

  const loadAgenda = useCallback(async () => {
    if (coordinatorScope.loadingScope) return;
    setLoading(true);
    const range = getRangeByView(anchorDate, view);
    const inputPeriodo = {
      dataInicio: toIsoDate(range.start),
      dataFim: toIsoDate(range.end),
      ...coordinatorScope.scopeParams,
    };
    const [rows, prospectRows, usuario, vendedoresNomes] = await Promise.all([
      callSF(SF.listarVisitasPeriodo, inputPeriodo),
      callSF(SF.prospectsVisitasListar, {
        dataInicio: inputPeriodo.dataInicio,
        dataFim: inputPeriodo.dataFim,
        status: '',
        limit: '500',
        offset: '0',
      }),
      coordinatorReadOnly ? Promise.resolve(null) : callSFSingle(SF.dadosUsuarioLogado, {}),
      callSF(SF.agendaListarVendedoresConvite, {}).catch(() => []),
    ]);
    const vendedoresMetaScope = coordinatorScope.vendedoresFiltradosScope.length
      ? coordinatorScope.vendedoresFiltradosScope
      : coordinatorScope.vendedoresScope;
    const visibleProspects = filterProspectVisitsByVisibility(prospectRows, usuario, coordinatorReadOnly, coordinatorScope.scopeParams, vendedoresMetaScope);
    setVisitas(applyIntUserNamesToVisits([...(rows as Visita[]), ...mapProspectVisitsToAgenda(visibleProspects)], vendedoresNomes as VendedorConvite[]));
    setLoading(false);
  }, [anchorDate, coordinatorReadOnly, coordinatorScope.loadingScope, coordinatorScope.scopeParams, coordinatorScope.vendedoresFiltradosScope, coordinatorScope.vendedoresScope, view]);

  const loadSemanaMeta = useCallback(async () => {
    if (coordinatorScope.loadingScope) return;
    const ini = startOfWeek(anchorDate);
    const fim = endOfWeek(anchorDate);
    const inputPeriodo = {
      dataInicio: toIsoDate(ini),
      dataFim: toIsoDate(fim),
      ...coordinatorScope.scopeParams,
    };
    const [rows, prospectRows, usuario, vendedoresNomes] = await Promise.all([
      callSF(SF.listarVisitasPeriodo, inputPeriodo),
      callSF(SF.prospectsVisitasListar, {
        dataInicio: inputPeriodo.dataInicio,
        dataFim: inputPeriodo.dataFim,
        status: '',
        limit: '500',
        offset: '0',
      }),
      coordinatorReadOnly ? Promise.resolve(null) : callSFSingle(SF.dadosUsuarioLogado, {}),
      callSF(SF.agendaListarVendedoresConvite, {}).catch(() => []),
    ]);
    const vendedoresMetaScope = coordinatorScope.vendedoresFiltradosScope.length
      ? coordinatorScope.vendedoresFiltradosScope
      : coordinatorScope.vendedoresScope;
    const visibleProspects = filterProspectVisitsByVisibility(prospectRows, usuario, coordinatorReadOnly, coordinatorScope.scopeParams, vendedoresMetaScope);
    setVisitasSemanaMeta(applyIntUserNamesToVisits([...(rows as Visita[]), ...mapProspectVisitsToAgenda(visibleProspects)], vendedoresNomes as VendedorConvite[]));
  }, [anchorDate, coordinatorReadOnly, coordinatorScope.loadingScope, coordinatorScope.scopeParams, coordinatorScope.vendedoresFiltradosScope, coordinatorScope.vendedoresScope]);

  useEffect(() => {
    loadAgenda();
  }, [loadAgenda]);

  useEffect(() => {
    loadSemanaMeta();
  }, [loadSemanaMeta]);

  useEffect(() => {
    const normalizedSearch = clienteCarteiraSearch.trim();
    const requestId = ++carteiraSearchRequestRef.current;

    if (
      !createModalOpen
      || createForm.modo === 'INTERNA'
      || createForm.modo === 'PROSPECCAO'
      || createForm.modo === 'DESLOCAMENTO'
      || normalizedSearch.length < CLIENTE_SEARCH_MIN_LENGTH
    ) {
      setLoadingBuscaCarteiraClientes(false);
      return;
    }

    setLoadingBuscaCarteiraClientes(true);
    const timeoutId = window.setTimeout(async () => {
      try {
        const rows = await callSF(SF.minhaCarteiraClientes, {
          busca: normalizedSearch,
          idBu: '',
          segmento: '',
          ramoCliente: '',
          status: '',
          cidade: '',
          uf: '',
          limit: CLIENTE_SEARCH_LIMIT,
          offset: '0',
          ...coordinatorScope.scopeParams,
        });

        if (requestId !== carteiraSearchRequestRef.current) return;
        setCarteiraClientes((current) => mergeCarteiraClientes(current, rows as CarteiraCliente[]));
      } finally {
        if (requestId === carteiraSearchRequestRef.current) setLoadingBuscaCarteiraClientes(false);
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [clienteCarteiraSearch, coordinatorScope.scopeParams, createForm.modo, createModalOpen]);

  useEffect(() => {
    setSelectedDate(anchorDate);
  }, [anchorDate, view]);

  const visitasPorDia = useMemo(() => {
    const map = new Map<string, Visita[]>();
    visitas.forEach((v) => {
      if (!map.has(v.DATA_AGENDADA)) map.set(v.DATA_AGENDADA, []);
      map.get(v.DATA_AGENDADA)!.push(v);
    });
    map.forEach((list) => list.sort((a, b) => a.HORA_INICIO.localeCompare(b.HORA_INICIO)));
    return map;
  }, [visitas]);

  const selectedKey = toIsoDate(selectedDate);
  const visitasDiaSelecionado = visitasPorDia.get(selectedKey) || [];
  const isCoordinatorOwnScope = coordinatorScope.isCoordinatorScope && coordinatorScope.scopeParams.scopeMode === 'ME';
  const vendedorSelecionadoMeta = coordinatorScope.vendedoresScope.find((vendedor) => String(vendedor.USER_ID || '') === coordinatorScope.scopeParams.scopeUserId) || null;
  const vendedoresMetaScope = coordinatorScope.vendedoresFiltradosScope.length
    ? coordinatorScope.vendedoresFiltradosScope
    : coordinatorScope.vendedoresScope;
  const metaVisitasSemana = isCoordinatorOwnScope ? META_VISITAS_SEMANAIS_POR_COORDENADOR : getMetaSemanalPessoa(vendedorSelecionadoMeta);

  const semanaStats = useMemo(() => {
    const visitasUteis = visitasSemanaMeta.filter((v) => {
      const origem = String(v.ORIGEM || 'VISITA').toUpperCase();
      const tipo = String(v.TIPO || '').toLowerCase();
      const contaNaMeta = origem !== 'INTERNA' || tipo === 'deslocamento';
      return contaNaMeta && isBusinessDayIso(v.DATA_AGENDADA);
    });
    const total = visitasUteis.length;
    const concluidas = visitasUteis.filter((v) => v.STATUS === 'CONCLUIDA').length;
    const andamento = visitasUteis.filter((v) => v.STATUS === 'EM_ANDAMENTO').length;
    const agendadas = visitasUteis.filter((v) => v.STATUS === 'AGENDADA').length;
    const canceladas = visitasUteis.filter((v) => v.STATUS === 'CANCELADA').length;
    const vendedoresMeta = coordinatorScope.scopeParams.scopeMode === 'TEAM' || coordinatorScope.scopeParams.scopeMode === 'GLOBAL' ? Math.max(1, vendedoresMetaScope.length) : 1;
    const meta = coordinatorScope.scopeParams.scopeMode === 'TEAM' || coordinatorScope.scopeParams.scopeMode === 'GLOBAL'
      ? Math.max(1, vendedoresMetaScope.reduce((total, vendedor) => total + getMetaSemanalPessoa(vendedor), 0))
      : metaVisitasSemana;
    const progresso = Math.min(100, Math.round((concluidas / Math.max(meta, 1)) * 100));
    return { total, concluidas, andamento, agendadas, canceladas, meta, progresso, vendedoresMeta };
  }, [coordinatorScope.scopeParams.scopeMode, metaVisitasSemana, vendedoresMetaScope, visitasSemanaMeta]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(anchorDate);
    return Array.from({ length: 7 }).map((_, idx) => addDays(start, idx));
  }, [anchorDate]);

  const monthGridDays = useMemo(() => {
    const first = startOfMonth(anchorDate);
    const offset = (first.getDay() + 6) % 7;
    const gridStart = addDays(first, -offset);
    return Array.from({ length: 42 }).map((_, i) => addDays(gridStart, i));
  }, [anchorDate]);

  const tipoVisitaOptions = useMemo(() => {
    const currentTipo = editForm.tipo.trim();
    const baseOptions = editingVisita && isDisplacementAgenda(editingVisita)
      ? DESLOCAMENTO_TIPO_OPTIONS
      : editingVisita && isInternalAgenda(editingVisita)
      ? AGENDA_INTERNA_TIPO_OPTIONS
      : editingVisita && isProspectionAgenda(editingVisita)
        ? PROSPECCAO_TIPO_OPTIONS
        : VISITA_TIPO_OPTIONS;
    if (!currentTipo) return baseOptions;
    if (baseOptions.some((opt) => opt.value === currentTipo)) return baseOptions;
    return [{ value: currentTipo, label: currentTipo }, ...baseOptions];
  }, [editForm.tipo, editingVisita]);

  const carteiraClienteOptions = useMemo(() => {
    return carteiraClientes.map((cliente) => {
      const nome = cliente.NOME_FANTASIA || cliente.RAZAO_SOCIAL || `Cliente #${cliente.ID}`;
      const codigo = String(cliente.WINTHOR_CODCLI ?? cliente.CODCLI ?? cliente.ID ?? '').trim();
      const cidadeUf = cliente.CIDADE
        ? `${cliente.CIDADE}${cliente.UF ? `/${cliente.UF}` : ''}`
        : 'Local não informado';
      const cobertura = cliente.TAG_COBERTURA === 'COBERTURA' ? ' • Cobertura' : '';

      return {
        value: String(cliente.ID),
        label: `${nome} • ${cidadeUf}${cobertura}`,
        searchText: [codigo, cliente.ID, cliente.CODCLI, cliente.WINTHOR_CODCLI, cliente.NOME_FANTASIA, cliente.RAZAO_SOCIAL].filter(Boolean).join(' '),
      };
    });
  }, [carteiraClientes]);

  const prospectAgendaOptions = useMemo(() => {
    return prospectsAgenda
      .filter((prospect) => !['CONVERTIDO', 'PERDIDO'].includes(String(prospect.STATUS_PIPELINE || '')))
      .map((prospect) => {
        const nome = prospect.NOME_FANTASIA || prospect.RAZAO_SOCIAL || `Prospect #${prospect.ID}`;
        const cidadeUf = prospect.CIDADE
          ? `${prospect.CIDADE}${prospect.UF ? `/${prospect.UF}` : ''}`
          : 'Local não informado';

        return {
          value: String(prospect.ID),
          label: `${nome} • ${cidadeUf}`,
        };
      });
  }, [prospectsAgenda]);

  const vendedoresConviteOptions = useMemo(() => {
    return [
      { value: '', label: loadingVendedoresConvite ? 'Carregando vendedores...' : 'Adicionar vendedor' },
      ...vendedoresConvite
        .filter((vendedor) => !createForm.participantesIds.includes(String(vendedor.USER_ID)))
        .map((vendedor) => ({
          value: String(vendedor.USER_ID),
          label: `${vendedor.NOME || `Vendedor ${vendedor.USER_ID}`}${vendedor.EMAIL ? ` (${vendedor.EMAIL})` : ''}`,
        })),
    ];
  }, [createForm.participantesIds, loadingVendedoresConvite, vendedoresConvite]);

  const participantesSelecionados = useMemo(() => {
    return createForm.participantesIds
      .map((id) => vendedoresConvite.find((vendedor) => String(vendedor.USER_ID) === id))
      .filter(Boolean) as VendedorConvite[];
  }, [createForm.participantesIds, vendedoresConvite]);

  const minAvailableVisitDate = useMemo(() => getMinAvailableVisitDate(), []);
  const isCreatingInternalAgenda = createForm.modo === 'INTERNA';
  const isCreatingProspectionVisit = createForm.modo === 'PROSPECCAO';
  const isCreatingDisplacement = createForm.modo === 'DESLOCAMENTO';

  async function refreshAfterAction() {
    await Promise.all([loadAgenda(), loadSemanaMeta()]);
  }

  async function syncGoogleAgendaEntidade(entidade: 'VISITA' | 'PROSPECCAO' | 'INTERNA', entidadeId: number) {
    if (!entidadeId) return;
    await sincronizarGoogleAgenda(entidade, Number(entidadeId));
  }

  async function syncGoogleAgendaItem(entidadeId: number) {
    await syncGoogleAgendaEntidade('VISITA', entidadeId);
  }

  /**
   * A agenda mistura visita a cliente, prospecção e compromisso interno na mesma lista.
   * Prospecção entra com ID negativo (o real fica em PROSPECT_VISITA_ID), então a
   * entidade e o ID têm que ser resolvidos a partir da ORIGEM.
   */
  async function syncGoogleAgendaVisita(visita: Visita | null) {
    if (!visita) return;
    const origem = String(visita.ORIGEM || 'VISITA').toUpperCase();
    if (origem === 'INTERNA') {
      await syncGoogleAgendaEntidade('INTERNA', Number(visita.ID));
      return;
    }
    if (origem === 'PROSPECCAO') {
      await syncGoogleAgendaEntidade('PROSPECCAO', getProspectVisitId(visita));
      return;
    }
    await syncGoogleAgendaEntidade('VISITA', Number(visita.ID));
  }

  async function syncGoogleAgendaTask(entidadeId: number) {
    if (!entidadeId) return;
    await sincronizarGoogleAgenda('TAREFA', Number(entidadeId));
  }

  async function findCreatedVisitId(formData: CreateForm): Promise<number | null> {
    const rows = await callSF(SF.agendaListarVisitasPaginado, {
      dataInicio: formData.dataAgendada,
      dataFim: formData.dataAgendada,
      status: '',
      busca: '',
      limit: '20',
      offset: '0',
      ...coordinatorScope.scopeParams,
    });
    const found = (rows as Visita[]).find((visita) => (
      String(visita.CLIENTE_ID) === String(formData.clienteId)
      && visita.DATA_AGENDADA === formData.dataAgendada
      && visita.HORA_INICIO === formData.horaInicio
      && visita.HORA_FIM === formData.horaFim
      && visita.STATUS === 'AGENDADA'
    ));
    return found?.ID || null;
  }

  async function findCreatedInternalAgendaId(formData: CreateForm): Promise<number | null> {
    const tituloBusca = formData.modo === 'DESLOCAMENTO'
      ? `${formData.origemDeslocamento.trim()} → ${formData.destinoDeslocamento.trim()}`
      : formData.titulo.trim();
    const rows = await callSF(SF.agendaListarVisitasPaginado, {
      dataInicio: formData.dataAgendada,
      dataFim: formData.dataAgendada,
      status: '',
      busca: sanitizeAgendaTexto(tituloBusca, 200),
      limit: '20',
      offset: '0',
      ...coordinatorScope.scopeParams,
    });
    const found = (rows as Visita[]).find((agenda) => (
      agenda.ORIGEM === 'INTERNA'
      && String(agenda.TITULO_INTERNO || agenda.CLIENTE || '') === tituloBusca
      && agenda.DATA_AGENDADA === formData.dataAgendada
      && agenda.HORA_INICIO === formData.horaInicio
      && agenda.HORA_FIM === formData.horaFim
      && agenda.STATUS === 'AGENDADA'
    ));
    return found?.ID || null;
  }

  async function findCreatedProspectVisitId(formData: CreateForm): Promise<number | null> {
    const rows = await callSF(SF.agendaListarVisitasPaginado, {
      dataInicio: formData.dataAgendada,
      dataFim: formData.dataAgendada,
      status: '',
      busca: '',
      limit: '50',
      offset: '0',
      ...coordinatorScope.scopeParams,
    });
    const found = (rows as Visita[]).find((agenda) => (
      String(agenda.ORIGEM || '').toUpperCase() === 'PROSPECCAO'
      && String(agenda.PROSPECT_ID || '') === String(formData.prospectId || '')
      && agenda.DATA_AGENDADA === formData.dataAgendada
      && agenda.HORA_INICIO === formData.horaInicio
      && agenda.HORA_FIM === formData.horaFim
      && agenda.STATUS === 'AGENDADA'
    ));
    return getProspectVisitId(found || null) || null;
  }

  async function findCreatedTaskId(atividade: CheckoutActivityForm, clienteId: string): Promise<number | null> {
    const rows = await callSF(SF.listarTarefas, { status: '', prioridade: '', ...coordinatorScope.scopeParams });
    const found = rows.find((task: any) => (
      String(task.TITULO || '') === atividade.titulo.trim()
      && String(task.DATA_LIMITE || '') === String(atividade.dataLimite || '')
      && String(task.CLIENTE_ID || '') === String(clienteId || '')
    ));
    return Number((found as any)?.ID || 0) || null;
  }

  async function loadCarteiraClientes() {
    setLoadingCarteiraClientes(true);
    try {
      const rows = await callSF(SF.minhaCarteiraClientes, {
        busca: '',
        idBu: '',
        segmento: '',
        ramoCliente: '',
        status: '',
        cidade: '',
        uf: '',
        limit: '200',
        offset: '0',
        ...coordinatorScope.scopeParams,
      });

      const clientes = rows as CarteiraCliente[];
      setCarteiraClientes(clientes);
      setCreateForm((prev) => {
        const stillSelected = clientes.some((cliente) => String(cliente.ID) === prev.clienteId);
        return {
          ...prev,
          clienteId: stillSelected ? prev.clienteId : (clientes[0] ? String(clientes[0].ID) : ''),
        };
      });
    } finally {
      setLoadingCarteiraClientes(false);
    }
  }

  async function loadProspectsAgenda() {
    setLoadingProspectsAgenda(true);
    try {
      const rows = await callSF(SF.prospectsListar, {
        status: '',
        busca: '',
        limit: '200',
        offset: '0',
      });

      const prospects = rows as ProspectAgendaOption[];
      setProspectsAgenda(prospects);
      setCreateForm((prev) => {
        const stillSelected = prospects.some((prospect) => String(prospect.ID) === prev.prospectId);
        return {
          ...prev,
          prospectId: stillSelected ? prev.prospectId : (prospects[0] ? String(prospects[0].ID) : ''),
        };
      });
    } finally {
      setLoadingProspectsAgenda(false);
    }
  }

  async function loadUsuarioLogado() {
    try {
      const rows = await callSF(SF.dadosUsuarioLogado, {});
      setUsuarioLogado(rows?.[0] || null);
    } catch {
      setUsuarioLogado(null);
    }
  }

  async function loadVendedoresConvite() {
    setLoadingVendedoresConvite(true);
    try {
      const rows = await callSF(SF.agendaListarVendedoresConvite, {});
      setVendedoresConvite(rows as VendedorConvite[]);
    } finally {
      setLoadingVendedoresConvite(false);
    }
  }

  function openCreate() {
    setCreateError('');
    setClienteCarteiraSearch('');
    setCreateForm(buildInitialCreateForm());
    setCreateModalOpen(true);
    void loadCarteiraClientes();
    void loadProspectsAgenda();
    void loadVendedoresConvite();
    void loadUsuarioLogado();
  }

  function closeCreate() {
    if (savingCreate) return;
    setCreateModalOpen(false);
    setCreateError('');
    setClienteCarteiraSearch('');
  }

  async function onCreateVisita() {
    if (!createForm.dataAgendada || !createForm.horaInicio || !createForm.horaFim || !createForm.tipo.trim()) {
      setCreateError('Preencha data, horário e tipo.');
      return;
    }

    if (!isCreatingInternalAgenda && !isCreatingProspectionVisit && !isCreatingDisplacement && !createForm.clienteId) {
      setCreateError('Selecione o cliente da visita.');
      return;
    }

    if (isCreatingProspectionVisit && !createForm.prospectId) {
      setCreateError('Selecione o prospect da visita.');
      return;
    }

    if (isCreatingInternalAgenda && !createForm.titulo.trim()) {
      setCreateError('Informe o título da agenda interna.');
      return;
    }

    if (isCreatingDisplacement && (!createForm.origemDeslocamento.trim() || !createForm.destinoDeslocamento.trim())) {
      setCreateError('Informe a origem e o destino do deslocamento.');
      return;
    }

    if (createForm.horaFim <= createForm.horaInicio) {
      setCreateError('O horário de fim deve ser maior que o horário de início.');
      return;
    }

    if (!isVisitDateAvailable(createForm.dataAgendada, minAvailableVisitDate)) {
      setCreateError('É permitido lançar visitas retroativas em até 5 dias.');
      return;
    }

    setSavingCreate(true);
    setCreateError('');

    try {
      const vendedoresAlvo = createForm.participantesIds.length > 0 ? createForm.participantesIds : [''];

      if (!isCreatingInternalAgenda && !isCreatingDisplacement) {
        for (const vendedorId of vendedoresAlvo) {
          const conflitos = await callSF(SF.agendaVerificarConflitoVisita, {
            dataAgendada: createForm.dataAgendada,
            horaInicio: createForm.horaInicio,
            visitaId: '',
            vendedorId,
          });
          const totalConflitos = Number((conflitos?.[0] as any)?.TOTAL || 0);
          if (totalConflitos > 0) {
            const vendedor = vendedoresConvite.find((item) => String(item.USER_ID) === vendedorId);
            const nome = vendedor?.NOME || (vendedorId ? `vendedor ${vendedorId}` : 'você');
            setCreateError(`Já existe uma visita agendada para ${nome} às ${createForm.horaInicio} neste dia. Escolha outro horário.`);
            return;
          }
        }

        const conflitosProspeccao = await callSF(SF.prospectsVisitasListar, {
          dataInicio: createForm.dataAgendada,
          dataFim: createForm.dataAgendada,
          status: 'AGENDADA',
          limit: '200',
          offset: '0',
        });
        for (const vendedorId of vendedoresAlvo) {
          const usuarioId = Number(vendedorId || getLoggedUserId(usuarioLogado) || 0);
          const totalConflitosProspeccao = conflitosProspeccao.filter((visita: any) => (
            isProspectVisitFromUser(visita, usuarioId)
            && String(visita.HORA_INICIO || '') === createForm.horaInicio
          )).length;
          if (totalConflitosProspeccao > 0) {
            const vendedor = vendedoresConvite.find((item) => String(item.USER_ID) === vendedorId);
            const nome = vendedor?.NOME || (vendedorId ? `vendedor ${vendedorId}` : 'você');
            setCreateError(`Já existe uma visita de prospecção agendada para ${nome} às ${createForm.horaInicio} neste dia. Escolha outro horário.`);
            return;
          }
        }
      }

      if (isCreatingInternalAgenda || isCreatingDisplacement) {
        const ok = await callSFMutation(SF.agendaCriarCompromissoInterno, {
          titulo: sanitizeAgendaTexto(isCreatingDisplacement ? `${createForm.origemDeslocamento.trim()} → ${createForm.destinoDeslocamento.trim()}` : createForm.titulo, 200),
          descricao: sanitizeRelato(createForm.relato || ''),
          dataAgendada: createForm.dataAgendada,
          horaInicio: createForm.horaInicio,
          horaFim: createForm.horaFim,
          tipo: sanitizeAgendaTexto(createForm.tipo, 50),
          origemDeslocamento: sanitizeAgendaTexto(createForm.origemDeslocamento, 200),
          destinoDeslocamento: sanitizeAgendaTexto(createForm.destinoDeslocamento, 200),
          criadoEm: getBrasiliaTimestamp(),
        });

        if (!ok) {
          setCreateError(isCreatingDisplacement ? 'Não foi possível criar o deslocamento.' : 'Não foi possível criar a agenda interna.');
          return;
        }

        const agendaId = await findCreatedInternalAgendaId(createForm);
        if (agendaId) {
          await Promise.all(createForm.participantesIds.map((vendedorId) => callSFMutation(SF.agendaAdicionarParticipanteInterno, {
            agendaId: String(agendaId),
            vendedorId,
            criadoEm: getBrasiliaTimestamp(),
          })));
          // Depois dos participantes: cada convidado recebe o evento na própria agenda.
          await syncGoogleAgendaEntidade('INTERNA', agendaId);
        }

        setCreateModalOpen(false);
        setCreateError('');
        setCreateForm(buildInitialCreateForm());
        await refreshAfterAction();
        return;
      }

      if (isCreatingProspectionVisit) {
        const resultados = await Promise.all(vendedoresAlvo.map((vendedorId) => callSFMutation(SF.prospectsAgendarVisita, {
          prospectId: createForm.prospectId,
          dataVisita: createForm.dataAgendada,
          horaInicio: createForm.horaInicio,
          horaFim: createForm.horaFim,
          objetivo: sanitizeAgendaTexto(richTextToPlainText(createForm.relato) || createForm.tipo.trim(), 200),
          userId: usuarioLogado?.ID || usuarioLogado?.USER_ID || usuarioLogado?.userId || null,
          vendedorId,
          criadoEm: getBrasiliaTimestamp(),
        })));
        const ok = resultados.every(Boolean);

        if (!ok) {
          setCreateError('Não foi possível criar a visita de prospecção.');
          return;
        }

        const prospectVisitId = await findCreatedProspectVisitId(createForm);
        if (prospectVisitId) await syncGoogleAgendaEntidade('PROSPECCAO', prospectVisitId);

        setCreateModalOpen(false);
        setCreateError('');
        setCreateForm(buildInitialCreateForm());
        await refreshAfterAction();
        return;
      }

      const resultados = await Promise.all(vendedoresAlvo.map((vendedorId) => callSFMutation(SF.agendaCriarVisita, {
        clienteId: createForm.clienteId,
        dataAgendada: createForm.dataAgendada,
        horaInicio: createForm.horaInicio,
        horaFim: createForm.horaFim,
        tipo: createForm.tipo.trim(),
        relato: sanitizeRelato(createForm.relato || ''),
        planejamento: sanitizeRelato(createForm.relato || ''),
        vendedorId,
      })));
      const ok = resultados.every(Boolean);

      if (!ok) {
        setCreateError('Não foi possível criar a visita. Verifique se o cliente pertence à sua carteira.');
        return;
      }

      const createdVisitId = await findCreatedVisitId(createForm);
      if (createdVisitId) await syncGoogleAgendaItem(createdVisitId);

      setCreateModalOpen(false);
      setCreateError('');
      setCreateForm(buildInitialCreateForm());
      await refreshAfterAction();
    } finally {
      setSavingCreate(false);
    }
  }

  async function onCheckin(visita: Visita) {
    const checkinHora = nowTime();
    const isProspeccao = isProspectionAgenda(visita);
    const ok = await callSFMutation(isProspeccao ? SF.prospectsCheckinVisita : SF.checkinVisita, {
      visitaId: isProspeccao ? getProspectVisitId(visita) : visita.ID,
      checkinHora,
    });
    if (ok) {
      openCheckout(visita.ID, { ...visita, STATUS: 'EM_ANDAMENTO', CHECKIN_HORA: checkinHora });
      await refreshAfterAction();
    }
  }

  function openCancel(visitaId: number) {
    setCancelVisitaId(visitaId);
    setCancelRelato('');
    setCancelError('');
    setCancelSaving(false);
    setCancelModalOpen(true);
  }

  function closeCancel() {
    if (cancelSaving) return;
    setCancelModalOpen(false);
    setCancelVisitaId(null);
    setCancelRelato('');
    setCancelError('');
  }

  async function onConfirmCancel() {
    if (!cancelVisitaId) return;

    const relatoOriginal = cancelRelato || '';
    const relatoSanitizado = sanitizeRelato(relatoOriginal);
    const visitaCancelada = visitas.find((visita) => visita.ID === cancelVisitaId) || null;
    const isInterna = !!visitaCancelada && isInternalAgenda(visitaCancelada);
    if (!isInterna && !hasRelatoContent(relatoOriginal)) {
      setCancelError('Informe o motivo do cancelamento da visita.');
      return;
    }

    setCancelSaving(true);
    setCancelError('');

    try {
      const isProspeccao = !!visitaCancelada && isProspectionAgenda(visitaCancelada);
      const ok = isInterna
        ? await callSFMutation(SF.agendaCancelarCompromissoInterno, {
          agendaId: String(cancelVisitaId),
          motivo: relatoSanitizado,
          atualizadoEm: getBrasiliaTimestamp(),
        })
        : await callSFMutation(isProspeccao ? SF.prospectsCancelarVisita : SF.agendaCancelarVisitaSeguro, {
          visitaId: isProspeccao ? getProspectVisitId(visitaCancelada) : cancelVisitaId,
          relato: relatoSanitizado,
        });

      if (!ok) {
        setCancelError(isInterna ? 'Não foi possível cancelar a agenda interna. Tente novamente.' : 'Não foi possível cancelar a visita. Tente novamente.');
        return;
      }

      setCancelModalOpen(false);
      setCancelVisitaId(null);
      setCancelRelato('');
      setCancelError('');
      await syncGoogleAgendaVisita(visitaCancelada);
      await refreshAfterAction();
    } finally {
      setCancelSaving(false);
    }
  }

  async function onConfirmCheckout() {
    if (!checkoutVisitaId) return;

    if (!checkoutCompleted && !hasRelatoContent(checkoutRelato)) {
      setCheckoutError('Para finalizar a visita, preencha o relato.');
      return;
    }

    setCheckoutSaving(true);
    setCheckoutError('');

    try {
      if (!checkoutCompleted) {
        const isProspeccao = !!checkoutVisita && isProspectionAgenda(checkoutVisita);
        const checkoutOk = await callSFMutation(isProspeccao ? SF.prospectsCheckoutVisita : SF.checkoutVisita, isProspeccao
          ? {
            visitaId: getProspectVisitId(checkoutVisita),
            prospectId: String(checkoutVisita?.PROSPECT_ID || ''),
            checkoutHora: nowTime(),
            relato: sanitizeRelato(checkoutRelato),
          }
          : {
            visitaId: checkoutVisitaId,
            checkoutHora: nowTime(),
            relato: sanitizeRelato(checkoutRelato),
          });

        if (!checkoutOk) {
          setCheckoutError('Não foi possível encerrar a visita. Tente novamente.');
          return;
        }

        setCheckoutCompleted(true);

        if (isProspeccao) {
          setCheckoutModalOpen(false);
          setCheckoutRelato('');
          setCheckoutVisitaId(null);
          setCheckoutVisita(null);
          setCheckoutAtividades([createCheckoutActivity()]);
          setCheckoutCompleted(false);
          await refreshAfterAction();
          return;
        }
      }

      const atividadesParaCriar = checkoutAtividades.filter((atividade) => atividade.titulo.trim() !== '');

      if (atividadesParaCriar.length === 0) {
        setCheckoutModalOpen(false);
        setCheckoutRelato('');
        setCheckoutVisitaId(null);
        setCheckoutVisita(null);
        setCheckoutAtividades([createCheckoutActivity()]);
        setCheckoutCompleted(false);
        await refreshAfterAction();
        return;
      }

      const atividadesFalharam: CheckoutActivityForm[] = [];
      const clienteId = checkoutVisita?.CLIENTE_ID ? String(checkoutVisita.CLIENTE_ID) : '';

      for (const atividade of atividadesParaCriar) {
        const ok = await callSFMutation(SF.criarTarefa, {
          titulo: sanitizeAtividadeTexto(atividade.titulo, 300),
          descricao: sanitizeAtividadeTexto(atividade.descricao, 500),
          prioridade: atividade.prioridade,
          dataLimite: atividade.dataLimite,
          criadoEm: getBrasiliaTimestamp(),
          clienteId,
        });

        if (!ok) {
          atividadesFalharam.push(atividade);
        } else if (atividade.dataLimite) {
          const tarefaId = await findCreatedTaskId(atividade, clienteId);
          if (tarefaId) await syncGoogleAgendaTask(tarefaId);
        }
      }

      if (atividadesFalharam.length > 0) {
        setCheckoutAtividades(atividadesFalharam);
        setCheckoutError(
          `Visita encerrada, mas ${atividadesFalharam.length} atividade(s) não foram salvas. Revise e tente novamente.`,
        );
        return;
      }

      setCheckoutModalOpen(false);
      setCheckoutRelato('');
      setCheckoutVisitaId(null);
      setCheckoutVisita(null);
      setCheckoutAtividades([createCheckoutActivity()]);
      setCheckoutCompleted(false);
      await refreshAfterAction();
    } finally {
      setCheckoutSaving(false);
    }
  }

  function openCheckout(visitaId: number, visitaOverride?: Visita) {
    const visitaSelecionada = visitaOverride || visitas.find((visita) => visita.ID === visitaId) || null;
    setCheckoutVisitaId(visitaId);
    setCheckoutVisita(visitaSelecionada);
    setCheckoutRelato('');
    setCheckoutAtividades([createCheckoutActivity(visitaSelecionada?.DATA_AGENDADA || '')]);
    setCheckoutSaving(false);
    setCheckoutError('');
    setCheckoutCompleted(false);
    setCheckoutModalOpen(true);
  }

  function openEdit(visita: Visita, mode: EditMode) {
    setEditingVisita(visita);
    setEditMode(mode);
    setEditForm({
      titulo: visita.TITULO_INTERNO || visita.CLIENTE || '',
      origemDeslocamento: visita.ORIGEM_DESLOCAMENTO || '',
      destinoDeslocamento: visita.DESTINO_DESLOCAMENTO || '',
      dataAgendada: visita.DATA_AGENDADA || '',
      horaInicio: visita.HORA_INICIO || '',
      horaFim: visita.HORA_FIM || '',
      tipo: visita.TIPO || '',
      planejamento: getPlanejamentoHtml(visita),
      relato: mode === 'relato' ? getRelatoHtml(visita) : '',
    });
    setEditError('');
    setEditModalOpen(true);
  }

  function openConteudo(visita: Visita, tipo: 'planejamento' | 'relato') {
    setConteudoSelecionado({ visita, tipo });
  }

  async function openClienteHistorico(visita: Visita) {
    if (!visita.CLIENTE_ID || isInternalAgenda(visita) || isProspectionAgenda(visita)) return;

    setClienteHistoricoVisita(visita);
    setClienteHistoricoVisitas([]);
    setClienteHistoricoPedidos([]);
    setClienteHistoricoError('');
    setClienteHistoricoLoading(true);

    const input = {
      clienteId: String(visita.CLIENTE_ID),
      ...coordinatorScope.scopeParams,
      limit: '12',
      offset: '0',
    };

    const [visitasResult, pedidosResult] = await Promise.all([
      callSFWithMeta(SF.historicoVisitasCliente, {
        ...input,
        status: '',
        dataInicio: '',
        dataFim: '',
      }),
      callSFWithMeta(SF.historicoPedidosCliente, input),
    ]);

    if (visitasResult.error || pedidosResult.error) {
      setClienteHistoricoError('Não foi possível carregar todo o histórico deste cliente agora.');
    }

    setClienteHistoricoVisitas(visitasResult.rows as HistoricoVisitaCliente[]);
    setClienteHistoricoPedidos((pedidosResult.rows as HistoricoPedidoCliente[]).filter((pedido) => pedido.PEDIDO_ID > 0 || Number(pedido.MIX_ENVIADO || 0) === 1));
    setClienteHistoricoLoading(false);
  }

  function closeClienteHistorico() {
    setClienteHistoricoVisita(null);
    setClienteHistoricoVisitas([]);
    setClienteHistoricoPedidos([]);
    setClienteHistoricoError('');
    setClienteHistoricoLoading(false);
  }

  function closeActionChoice() {
    setActionChoiceVisita(null);
  }

  function chooseReagendar(visita: Visita) {
    closeActionChoice();
    openEdit(visita, 'reagendamento');
  }

  function chooseEditarPlanejamento(visita: Visita) {
    closeActionChoice();
    openEdit(visita, 'planejamento');
  }

  function chooseEditarRelato(visita: Visita) {
    closeActionChoice();
    openEdit(visita, 'relato');
  }

  function chooseCancel(visita: Visita) {
    closeActionChoice();
    openCancel(visita.ID);
  }

  function getPlanejamentoHtml(visita: Visita): string {
    return visita.PLANEJAMENTO || (visita.STATUS !== 'CONCLUIDA' && visita.STATUS !== 'CANCELADA' ? visita.RELATO || '' : '');
  }

  function getRelatoHtml(visita: Visita): string {
    return visita.STATUS === 'CONCLUIDA' || visita.STATUS === 'CANCELADA' ? visita.RELATO || '' : '';
  }

  function canOperateVisit(visita: Visita): boolean {
    return Number(visita.PODE_OPERAR ?? 1) === 1;
  }

  function isInternalAgenda(visita: Visita): boolean {
    return String(visita.ORIGEM || '').toUpperCase() === 'INTERNA';
  }

  function isDisplacementAgenda(visita: Visita): boolean {
    return isInternalAgenda(visita) && String(visita.TIPO || '').toLowerCase() === 'deslocamento';
  }

  function isProspectionAgenda(visita: Visita): boolean {
    return String(visita.ORIGEM || '').toUpperCase() === 'PROSPECCAO';
  }

  function getAgendaTitle(visita: Visita): string {
    if (isProspectionAgenda(visita)) return `${visita.CLIENTE} (prospecção)`;
    if (isDisplacementAgenda(visita)) {
      const origem = visita.ORIGEM_DESLOCAMENTO || 'Origem não informada';
      const destino = visita.DESTINO_DESLOCAMENTO || 'Destino não informado';
      return `Deslocamento: ${origem} → ${destino}`;
    }
    return isInternalAgenda(visita) ? (visita.TITULO_INTERNO || visita.CLIENTE || 'Agenda interna') : visita.CLIENTE;
  }

  function renderAgendaTitle(visita: Visita, className: string, prefix = '') {
    const title = getAgendaTitle(visita);
    const canOpenHistory = Boolean(visita.CLIENTE_ID && !isInternalAgenda(visita) && !isProspectionAgenda(visita));

    if (!canOpenHistory) {
      return <span className={className} style={{ color: '#1b1c1a' }}>{prefix}{title}</span>;
    }

    return (
      <button
        type="button"
        onClick={() => openClienteHistorico(visita)}
        className={`${className} text-left underline-offset-4 transition-colors hover:underline`}
        style={{ color: '#165a3a' }}
        title="Ver histórico do cliente"
      >
        {prefix}{title}
      </button>
    );
  }

  function getAgendaTimeLabel(visita: Visita): string {
    if (isDisplacementAgenda(visita)) return `Saída ${visita.HORA_INICIO} · Chegada ${visita.HORA_FIM}`;
    return `${visita.HORA_INICIO} - ${visita.HORA_FIM}`;
  }

  function toggleParticipante(vendedorId: string) {
    setCreateForm((prev) => {
      const exists = prev.participantesIds.includes(vendedorId);
      return {
        ...prev,
        participantesIds: exists
          ? prev.participantesIds.filter((id) => id !== vendedorId)
          : [...prev.participantesIds, vendedorId],
      };
    });
  }

  function setCreateMode(modo: CreateForm['modo']) {
    setCreateForm((prev) => ({
      ...prev,
      modo,
      tipo: modo === 'INTERNA'
        ? AGENDA_INTERNA_TIPO_OPTIONS[0].value
        : modo === 'DESLOCAMENTO'
          ? DESLOCAMENTO_TIPO_OPTIONS[0].value
        : modo === 'PROSPECCAO'
          ? PROSPECCAO_TIPO_OPTIONS[0].value
          : VISITA_TIPO_OPTIONS[0].value,
    }));
  }

  function renderVisitActions(visita: Visita, compact = false) {
    const actionClass = compact
      ? 'px-2.5 py-1 rounded-md text-[11px] font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap'
      : 'px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap';

    if (isInternalAgenda(visita)) {
      const canOperate = !coordinatorReadOnly && canOperateVisit(visita);
      return (
        <>
          {canOperate && visita.STATUS === 'AGENDADA' ? (
            <button onClick={() => setActionChoiceVisita(visita)} className={actionClass} style={{ backgroundColor: '#e9eefb', color: '#3156a3' }}>
              <Pencil size={compact ? 11 : 12} /> Editar / Reagendar / Cancelar
            </button>
          ) : null}
          <button onClick={() => openConteudo(visita, 'planejamento')} className={compact ? 'px-2.5 py-1 rounded-md text-[11px] font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap' : 'px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1 whitespace-nowrap'} style={{ backgroundColor: '#eef2eb', color: '#425242' }}>
            <Eye size={compact ? 11 : 12} /> Ver detalhes
          </button>
            <span className={compact ? 'px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap' : 'px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap'} style={{ backgroundColor: isDisplacementAgenda(visita) ? '#e7f0fb' : '#e9eefb', color: '#3156a3' }}>
            {isDisplacementAgenda(visita) ? 'Deslocamento' : 'Agenda interna'}
          </span>
        </>
      );
    }

    const canOperate = !coordinatorReadOnly && canOperateVisit(visita);
    const isProspeccao = isProspectionAgenda(visita);
    return (
      <>
        {canOperate && visita.STATUS === 'AGENDADA' && (
          <>
            <button onClick={() => setActionChoiceVisita(visita)} className={actionClass} style={{ backgroundColor: '#e9eefb', color: '#3156a3' }}>
              <Pencil size={compact ? 11 : 12} /> Editar / Reagendar / Cancelar
            </button>
            <button onClick={() => onCheckin(visita)} className={compact ? 'px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap' : 'px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap'} style={{ backgroundColor: '#dff2e2', color: '#1f6a30' }}>
              {compact ? 'Iniciar' : 'Iniciar (Check-in)'}
            </button>
          </>
        )}
        {canOperate && visita.STATUS === 'EM_ANDAMENTO' && (
          <button onClick={() => openCheckout(visita.ID)} className={compact ? 'px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap' : 'px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap'} style={{ backgroundColor: '#dce9fb', color: '#2257a8' }}>
            Encerrar visita
          </button>
        )}
        <button onClick={() => openConteudo(visita, 'planejamento')} className={actionClass} style={{ backgroundColor: '#eef2eb', color: '#425242' }}>
          <Eye size={compact ? 11 : 12} /> {isProspeccao ? 'Ver objetivo' : 'Ver Planejamento'}
        </button>
        <button onClick={() => openConteudo(visita, 'relato')} className={actionClass} style={{ backgroundColor: '#eef2eb', color: '#425242' }}>
          <Eye size={compact ? 11 : 12} /> Ver Relato
        </button>
        {canOperate && visita.STATUS === 'CONCLUIDA' ? (
          <button onClick={() => chooseEditarRelato(visita)} className={actionClass} style={{ backgroundColor: '#e9eefb', color: '#3156a3' }}>
            <Pencil size={compact ? 11 : 12} /> Editar Relato
          </button>
        ) : null}
        {isProspeccao ? (
          <span className={compact ? 'px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap' : 'px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap'} style={{ backgroundColor: '#fff4dc', color: '#8a5a00' }}>
            Prospecção
          </span>
        ) : null}
        {!canOperate ? (
          <span className={compact ? 'px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap' : 'px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap'} style={{ backgroundColor: '#f4f6f2', color: '#6f796d' }}>
            Somente visualização
          </span>
        ) : null}
      </>
    );
  }

  function closeEdit() {
    if (savingEdit) return;
    setEditModalOpen(false);
    setEditingVisita(null);
    setEditError('');
  }

  async function onSaveEdit() {
    if (!editingVisita) return;

    if (editMode === 'relato') {
      if (!hasRelatoContent(editForm.relato)) {
        setEditError('Informe o relato da visita.');
        return;
      }

      setSavingEdit(true);
      setEditError('');

      try {
        const isProspeccao = isProspectionAgenda(editingVisita);
        const ok = await callSFMutation(isProspeccao ? SF.prospectsAtualizarVisita : SF.agendaAtualizarVisita, isProspeccao
          ? {
            visitaId: String(getProspectVisitId(editingVisita)),
            dataVisita: editingVisita.DATA_AGENDADA,
            horaInicio: editingVisita.HORA_INICIO,
            horaFim: editingVisita.HORA_FIM,
            objetivo: sanitizeRelato(getPlanejamentoHtml(editingVisita)),
            relato: sanitizeRelato(editForm.relato),
            planejamento: sanitizeRelato(getPlanejamentoHtml(editingVisita)),
          }
          : {
            visitaId: String(editingVisita.ID),
            clienteId: String(editingVisita.CLIENTE_ID),
            dataAgendada: editingVisita.DATA_AGENDADA,
            horaInicio: editingVisita.HORA_INICIO,
            horaFim: editingVisita.HORA_FIM,
            tipo: editingVisita.TIPO,
            relato: sanitizeRelato(editForm.relato),
            planejamento: sanitizeRelato(getPlanejamentoHtml(editingVisita)),
          });

        if (ok) {
          await syncGoogleAgendaVisita(editingVisita);
          closeEdit();
          await refreshAfterAction();
        } else {
          setEditError('Não foi possível salvar o relato da visita.');
        }
      } finally {
        setSavingEdit(false);
      }
      return;
    }

    if (!editForm.dataAgendada || !editForm.horaInicio || !editForm.horaFim || !editForm.tipo.trim()) return;

    const isInterna = isInternalAgenda(editingVisita);
    const isDeslocamento = isDisplacementAgenda(editingVisita);

    if (isInterna && !editForm.titulo.trim()) {
      setEditError('Informe o título da agenda interna.');
      return;
    }

    if (isDeslocamento && (!editForm.origemDeslocamento.trim() || !editForm.destinoDeslocamento.trim())) {
      setEditError('Informe a origem e o destino do deslocamento.');
      return;
    }

    if (editForm.horaFim <= editForm.horaInicio) {
      setEditError('O horário de fim deve ser maior que o horário de início.');
      return;
    }

    if (!isVisitDateAvailable(editForm.dataAgendada, minAvailableVisitDate)) {
      setEditError('É permitido lançar ou reagendar visitas retroativas em até 5 dias.');
      return;
    }

    const relatoAlteracao = editForm.relato || '';
    const dataModificada = editingVisita.DATA_AGENDADA !== editForm.dataAgendada;
    const horarioModificado = editingVisita.HORA_INICIO !== editForm.horaInicio || editingVisita.HORA_FIM !== editForm.horaFim;
    const houveReagendamento = dataModificada || horarioModificado;

    if (!isInterna && dataModificada && !hasRelatoContent(relatoAlteracao)) {
      setEditError('Ao alterar a data da visita, informe o motivo no relato.');
      return;
    }

    setSavingEdit(true);
    setEditError('');
    try {
      if (!isInterna && houveReagendamento) {
        const conflitos = await callSF(SF.agendaVerificarConflitoVisita, {
          dataAgendada: editForm.dataAgendada,
          horaInicio: editForm.horaInicio,
          visitaId: isProspectionAgenda(editingVisita) ? '' : String(editingVisita.ID),
        });
        const totalConflitos = Number((conflitos?.[0] as any)?.TOTAL || 0);
        if (totalConflitos > 0) {
          setEditError(`Já existe uma visita agendada para ${editForm.horaInicio} neste dia. Escolha outro horário.`);
          return;
        }

        const conflitosProspeccao = await callSF(SF.prospectsVisitasListar, {
          dataInicio: editForm.dataAgendada,
          dataFim: editForm.dataAgendada,
          status: '',
          limit: '200',
          offset: '0',
        });
        const prospectVisitId = getProspectVisitId(editingVisita);
        const vendedorConflitoId = Number(editingVisita.VENDEDOR_ID || getLoggedUserId(usuarioLogado));
        const totalConflitosProspeccao = conflitosProspeccao.filter((visita: any) => (
          Number(visita.ID || 0) !== prospectVisitId
          && isProspectVisitFromUser(visita, vendedorConflitoId)
          && String(visita.STATUS || '') !== 'CANCELADA'
          && String(visita.HORA_INICIO || '') === editForm.horaInicio
        )).length;
        if (totalConflitosProspeccao > 0) {
          setEditError(`Já existe uma visita de prospecção agendada para ${editForm.horaInicio} neste dia. Escolha outro horário.`);
          return;
        }
      }

      if (isInterna) {
        const ok = await callSFMutation(SF.agendaAtualizarCompromissoInterno, {
          agendaId: String(editingVisita.ID),
          titulo: sanitizeAgendaTexto(isDeslocamento ? `${editForm.origemDeslocamento.trim()} → ${editForm.destinoDeslocamento.trim()}` : editForm.titulo, 200),
          descricao: sanitizeRelato(editForm.planejamento || ''),
          dataAgendada: editForm.dataAgendada,
          horaInicio: editForm.horaInicio,
          horaFim: editForm.horaFim,
          tipo: sanitizeAgendaTexto(editForm.tipo, 50),
          origemDeslocamento: sanitizeAgendaTexto(editForm.origemDeslocamento, 200),
          destinoDeslocamento: sanitizeAgendaTexto(editForm.destinoDeslocamento, 200),
          atualizadoEm: getBrasiliaTimestamp(),
        });

        if (ok) {
          await syncGoogleAgendaEntidade('INTERNA', Number(editingVisita.ID));
          closeEdit();
          await refreshAfterAction();
        } else {
          setEditError('Não foi possível salvar as alterações da agenda interna.');
        }
        return;
      }

      const relatoAtualizado = appendRelatoAlteracao(editingVisita.RELATO || '', relatoAlteracao, dataModificada);

      const isProspeccao = isProspectionAgenda(editingVisita);
      const ok = await callSFMutation(isProspeccao ? SF.prospectsAtualizarVisita : SF.agendaAtualizarVisita, isProspeccao
        ? {
          visitaId: String(getProspectVisitId(editingVisita)),
          dataVisita: editForm.dataAgendada,
          horaInicio: editForm.horaInicio,
          horaFim: editForm.horaFim,
          objetivo: sanitizeRelato(editForm.planejamento || ''),
          relato: relatoAtualizado,
          planejamento: sanitizeRelato(editForm.planejamento || ''),
        }
        : {
          visitaId: String(editingVisita.ID),
          clienteId: String(editingVisita.CLIENTE_ID),
          dataAgendada: editForm.dataAgendada,
          horaInicio: editForm.horaInicio,
          horaFim: editForm.horaFim,
          tipo: editForm.tipo.trim(),
          relato: relatoAtualizado,
          planejamento: sanitizeRelato(editForm.planejamento || ''),
        });

      if (ok) {
        await syncGoogleAgendaVisita(editingVisita);
        closeEdit();
        await refreshAfterAction();
      } else {
        setEditError('Não foi possível salvar as alterações da visita.');
      }
    } finally {
      setSavingEdit(false);
    }
  }

  const isReagendamento = !!editingVisita && editingVisita.DATA_AGENDADA !== editForm.dataAgendada;
  const canConfirmCheckout = checkoutCompleted || hasRelatoContent(checkoutRelato);
  const isCheckoutProspection = !!checkoutVisita && isProspectionAgenda(checkoutVisita);
  const clienteHistoricoTarefas = clienteHistoricoVisitas.filter((item) => String(item.TIPO_REGISTRO || '').toUpperCase() === 'TAREFA');
  const clienteHistoricoVisitasApenas = clienteHistoricoVisitas.filter((item) => String(item.TIPO_REGISTRO || '').toUpperCase() !== 'TAREFA');
  const clienteHistoricoVendasTotal = clienteHistoricoPedidos.reduce((sum, pedido) => sum + Number(pedido.VALOR_TOTAL || 0), 0);
  const clienteHistoricoEventos = [
    ...clienteHistoricoVisitas.map((item) => ({
      key: `${String(item.TIPO_REGISTRO || 'VISITA').toLowerCase()}-${item.ID}`,
      tipo: String(item.TIPO_REGISTRO || '').toUpperCase() === 'TAREFA' ? 'Tarefa' : 'Visita',
      data: String(item.DATA_CONCLUSAO || item.DATA_AGENDADA || item.CRIADO_EM || ''),
      titulo: String(item.TIPO_REGISTRO || '').toUpperCase() === 'TAREFA' ? (item.TIPO || `Tarefa #${item.ID}`) : `Visita #${item.ID}`,
      status: item.STATUS,
      detalhe: stripHtmlForResumo(item.RELATO || item.PLANEJAMENTO) || 'Sem detalhes registrados.',
    })),
    ...clienteHistoricoPedidos.map((pedido) => ({
      key: `pedido-${pedido.PEDIDO_ID}`,
      tipo: pedido.PEDIDO_ID < 0 ? 'Mix' : 'Venda',
      data: String(pedido.DATA_PEDIDO || ''),
      titulo: pedido.PEDIDO_ID < 0 ? `Mix #${Math.abs(Number(pedido.PEDIDO_ID || 0))}` : `Pedido #${pedido.PEDIDO_ID}`,
      status: pedido.STATUS_PEDIDO,
      detalhe: `${pedido.TOTAL_ITENS || 0} item(ns) · ${formatCurrency(Number(pedido.VALOR_TOTAL || 0))}`,
    })),
  ].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 10);

  return (
    <div className="animate-fadeIn">
      {!coordinatorReadOnly ? (
        <div className="mb-5">
          <CoordinatorScopeFilter scope={coordinatorScope} />
        </div>
      ) : null}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl" style={{ color: '#165a3a' }}>
            {coordinatorReadOnly ? 'Agenda dos Vendedores' : 'Agenda'}
          </h1>
          <p className="mt-1 text-sm sm:text-base" style={{ color: '#6f786d' }}>
            {coordinatorReadOnly
              ? 'Visualização da agenda dos vendedores do seu escopo, incluindo relatos registrados.'
              : 'Visão operacional com modos de dia, semana e mês.'}
          </p>
        </div>
        {!coordinatorReadOnly ? (
          <button
            onClick={openCreate}
            className="btn-pill-primary w-full px-5 py-2.5 text-sm font-semibold sm:w-auto sm:py-2"
          >
            + Nova agenda
          </button>
        ) : null}
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-3xl p-3 sm:flex-row sm:flex-wrap sm:items-center sm:p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <div className="flex w-full items-center overflow-x-auto rounded-full p-1 sm:w-auto" style={{ backgroundColor: '#eef2eb' }}>
          {(['DIA', 'SEMANA', 'MES'] as ViewMode[]).map((option) => (
            <button
              key={option}
              onClick={() => setView(option)}
              className="flex-1 whitespace-nowrap px-4 py-1.5 text-center text-sm font-semibold rounded-full sm:flex-none"
              style={{
                backgroundColor: view === option ? '#17743b' : 'transparent',
                color: view === option ? '#ffffff' : '#5c665a',
              }}
            >
              {option === 'DIA' ? 'Dia' : option === 'SEMANA' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>

        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <button
            onClick={() => setAnchorDate((prev) => shiftAnchor(prev, view, -1))}
            className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center sm:h-9 sm:w-9"
            style={{ backgroundColor: '#edf1e9', color: '#5d685b' }}
          >
            <ChevronLeft size={17} />
          </button>
          <div className="min-w-0 flex-1 rounded-xl px-3 py-2 text-center text-sm font-semibold capitalize sm:flex-none sm:px-4" style={{ backgroundColor: '#ffffff', color: '#2f3a2d' }}>
            {periodLabel(anchorDate, view)}
          </div>
          <button
            onClick={() => setAnchorDate((prev) => shiftAnchor(prev, view, 1))}
            className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center sm:h-9 sm:w-9"
            style={{ backgroundColor: '#edf1e9', color: '#5d685b' }}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <section className="xl:col-span-8 rounded-3xl p-3 sm:p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
          {view === 'DIA' && (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between sm:px-2">
                <h2 className="font-display text-2xl font-extrabold sm:text-3xl" style={{ color: '#1b1c1a' }}>
                  {prettyDateLong(selectedDate)}
                </h2>
                <button
                  onClick={() => setSelectedDate(anchorDate)}
                  className="w-full px-3 py-2 rounded-full text-xs font-semibold sm:w-auto sm:py-1.5"
                  style={{ backgroundColor: '#ebf3e6', color: '#1d6a36' }}
                >
                  Hoje
                </button>
              </div>

              {loading ? (
                <p className="text-sm px-2" style={{ color: '#7a8479' }}>Carregando visitas...</p>
              ) : visitasDiaSelecionado.length === 0 ? (
                <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: '#ffffff' }}>
                  <CalendarDays size={22} className="mx-auto mb-2" style={{ color: '#8f988d' }} />
                  <p className="text-base" style={{ color: '#7a8479' }}>Sem visitas para esta data.</p>
                </div>
              ) : (
                visitasDiaSelecionado.map((visita) => {
                  const c = statusColor(visita.STATUS);
                  return (
                    <article key={visita.ID} className="rounded-2xl p-3 sm:p-4" style={{ backgroundColor: '#ffffff' }}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          {renderAgendaTitle(visita, 'font-display text-xl font-extrabold sm:text-2xl')}
                          <p className="text-sm mt-1" style={{ color: '#6b7569' }}>
                            {getAgendaTimeLabel(visita)} | {visita.TIPO} | {visita.CIDADE}
                          </p>
                          {isDisplacementAgenda(visita) ? (
                            <p className="text-xs mt-1" style={{ color: '#6b7569' }}>
                              Origem: {visita.ORIGEM_DESLOCAMENTO || '-'} · Destino: {visita.DESTINO_DESLOCAMENTO || '-'}
                            </p>
                          ) : null}
                          {isInternalAgenda(visita) && visita.PARTICIPANTES ? (
                            <p className="text-xs mt-1" style={{ color: '#6b7569' }}>Convidados: {visita.PARTICIPANTES}</p>
                          ) : null}
                          <p className="text-xs mt-1 font-semibold" style={{ color: '#697568' }}>
                            Vendedor: {getVendedorDisplay(visita, !coordinatorReadOnly)}
                          </p>
                        </div>
                        <span className="self-start px-3 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: c.bg, color: c.text }}>
                          {visita.STATUS.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {renderVisitActions(visita)}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          )}

          {view === 'SEMANA' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {weekDays.map((day) => {
                  const key = toIsoDate(day);
                  const count = (visitasPorDia.get(key) || []).length;
                  const selected = key === selectedKey;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedDate(day)}
                      className="text-left rounded-2xl p-3"
                      style={{
                        backgroundColor: selected ? '#dff1e2' : '#ffffff',
                        border: selected ? '1px solid #c7e5cd' : '1px solid #edf1e9',
                      }}
                    >
                      <p className="text-xs label-ui font-semibold" style={{ color: '#7b857a' }}>
                        {day.toLocaleDateString('pt-BR', { weekday: 'short' })}
                      </p>
                      <p className="font-display text-2xl font-extrabold mt-1" style={{ color: '#1b1c1a' }}>{String(day.getDate()).padStart(2, '0')}</p>
                      <p className="text-xs mt-1" style={{ color: '#5f6a5d' }}>{count} visita(s)</p>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl p-4" style={{ backgroundColor: '#ffffff' }}>
                <h3 className="font-display text-2xl font-extrabold mb-2 sm:text-3xl" style={{ color: '#1b1c1a' }}>
                  Detalhes de {selectedDate.toLocaleDateString('pt-BR')}
                </h3>
                {visitasDiaSelecionado.length === 0 ? (
                  <p className="text-sm" style={{ color: '#748073' }}>Sem visitas para o dia selecionado.</p>
                ) : (
                  <div className="space-y-2">
                    {visitasDiaSelecionado.map((visita) => {
                      const c = statusColor(visita.STATUS);
                      return (
                        <div key={visita.ID} className="rounded-xl p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" style={{ backgroundColor: '#f8faf7', border: '1px solid #e8eee4' }}>
                          <div className="min-w-0">
                            {renderAgendaTitle(visita, 'text-base font-semibold')}
                            <p className="text-xs" style={{ color: '#6f796d' }}>{getAgendaTimeLabel(visita)} | {visita.TIPO}</p>
                            {isDisplacementAgenda(visita) ? (
                              <p className="text-[11px] mt-0.5" style={{ color: '#6f796d' }}>
                                {visita.ORIGEM_DESLOCAMENTO || '-'} → {visita.DESTINO_DESLOCAMENTO || '-'}
                              </p>
                            ) : null}
                            {isInternalAgenda(visita) && visita.PARTICIPANTES ? (
                              <p className="text-[11px] mt-0.5" style={{ color: '#6f796d' }}>Convidados: {visita.PARTICIPANTES}</p>
                            ) : null}
                            <p className="text-[11px] font-semibold mt-0.5" style={{ color: '#697568' }}>
                              {getVendedorDisplay(visita, !coordinatorReadOnly)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                            {renderVisitActions(visita, true)}
                            <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: c.bg, color: c.text }}>
                              {visita.STATUS.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {view === 'MES' && (
            <div className="space-y-3">
              <div className="overflow-x-auto pb-2">
                <div className="grid min-w-[520px] grid-cols-7 gap-2 text-[11px] label-ui font-semibold px-1" style={{ color: '#7c8579' }}>
                  <span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sab</span><span>Dom</span>
                </div>
                <div className="mt-2 grid min-w-[520px] grid-cols-7 gap-2">
                  {monthGridDays.map((day) => {
                  const key = toIsoDate(day);
                  const count = (visitasPorDia.get(key) || []).length;
                  const inMonth = day.getMonth() === anchorDate.getMonth();
                  const selected = key === selectedKey;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedDate(day)}
                      className="rounded-xl p-2 h-[74px] text-left"
                      style={{
                        backgroundColor: selected ? '#dff1e2' : '#ffffff',
                        border: selected ? '1px solid #c7e5cd' : '1px solid #edf1e9',
                        opacity: inMonth ? 1 : 0.45,
                      }}
                    >
                      <p className="text-xs font-semibold" style={{ color: '#4e5a4d' }}>{day.getDate()}</p>
                      {count > 0 && (
                        <p className="mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block" style={{ backgroundColor: '#ebf3e6', color: '#1d6a36' }}>
                          {count} visita(s)
                        </p>
                      )}
                    </button>
                  );
                  })}
                </div>
              </div>

              <div className="rounded-2xl p-4" style={{ backgroundColor: '#ffffff' }}>
                <h3 className="font-display text-2xl font-extrabold mb-2 sm:text-3xl" style={{ color: '#1b1c1a' }}>
                  Dia selecionado: {selectedDate.toLocaleDateString('pt-BR')}
                </h3>
                {visitasDiaSelecionado.length === 0 ? (
                  <p className="text-sm" style={{ color: '#748073' }}>Nenhuma visita neste dia.</p>
                ) : (
                  <ul className="space-y-2">
                    {visitasDiaSelecionado.map((visita) => {
                      const c = statusColor(visita.STATUS);
                      return (
                        <li key={visita.ID} className="rounded-xl p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" style={{ backgroundColor: '#f8faf7', border: '1px solid #e8eee4' }}>
                          <div className="flex min-w-0 items-start gap-2 sm:items-center">
                            <Clock3 size={14} style={{ color: '#68736a' }} />
                            {renderAgendaTitle(visita, 'min-w-0 text-sm', `${isDisplacementAgenda(visita) ? getAgendaTimeLabel(visita) : visita.HORA_INICIO} - `)}
                            <span className="text-[11px] font-semibold" style={{ color: '#697568' }}>
                              {visita.VENDEDOR_NOME || `Usuário ${visita.VENDEDOR_ID || '-'}`}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                            {renderVisitActions(visita, true)}
                            <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: c.bg, color: c.text }}>
                              {visita.STATUS.replace('_', ' ')}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>

        <aside className="xl:col-span-4 space-y-4">
          {!coordinatorReadOnly ? (
          <article className="rounded-3xl p-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Status da Meta Semanal</h3>
              <Target size={20} style={{ color: '#17743b' }} />
            </div>

            <div className="mt-4 h-2.5 rounded-full" style={{ backgroundColor: '#dfe5db' }}>
              <div className="h-2.5 rounded-full" style={{ width: `${semanaStats.progresso}%`, backgroundColor: '#17743b' }} />
            </div>

            <div className="mt-3 flex items-center justify-between text-sm" style={{ color: '#5f6a5d' }}>
              <span>{semanaStats.concluidas} concluidas</span>
              <span>{semanaStats.meta} alvo</span>
            </div>
            <p className="mt-2 text-xs font-semibold" style={{ color: '#7b8379' }}>
              {coordinatorScope.scopeParams.scopeMode === 'TEAM' ? `Meta composta: vendedores ${META_VISITAS_SEMANAIS_POR_VENDEDOR}/semana e coordenadores ${META_VISITAS_SEMANAIS_POR_COORDENADOR}/semana.` : `${metaVisitasSemana} visitas ou deslocamentos úteis de segunda a sexta.`}
            </p>

            <button
              onClick={() => setMetaPopupOpen(true)}
              className="w-full mt-4 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: '#eaf3e6', color: '#1c6a35' }}
            >
              Ver status detalhado
            </button>
          </article>
          ) : null}

          <article className="rounded-3xl p-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
            <h3 className="font-display text-3xl font-extrabold mb-3" style={{ color: '#1b1c1a' }}>Resumo do Periodo</h3>
            <div className="space-y-2 text-sm">
              <div className="rounded-xl p-3 flex items-center justify-between" style={{ backgroundColor: '#ffffff' }}>
                <span style={{ color: '#596558' }}>Agendadas</span>
                <span className="font-semibold" style={{ color: '#9a6a1d' }}>{semanaStats.agendadas}</span>
              </div>
              <div className="rounded-xl p-3 flex items-center justify-between" style={{ backgroundColor: '#ffffff' }}>
                <span style={{ color: '#596558' }}>Em andamento</span>
                <span className="font-semibold" style={{ color: '#2257a8' }}>{semanaStats.andamento}</span>
              </div>
              <div className="rounded-xl p-3 flex items-center justify-between" style={{ backgroundColor: '#ffffff' }}>
                <span style={{ color: '#596558' }}>Concluidas</span>
                <span className="font-semibold" style={{ color: '#1f6a30' }}>{semanaStats.concluidas}</span>
              </div>
              <div className="rounded-xl p-3 flex items-center justify-between" style={{ backgroundColor: '#ffffff' }}>
                <span style={{ color: '#596558' }}>Canceladas</span>
                <span className="font-semibold" style={{ color: '#9f2d2d' }}>{semanaStats.canceladas}</span>
              </div>
            </div>
          </article>

          <article className="rounded-3xl p-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
            <h3 className="font-display text-3xl font-extrabold mb-3" style={{ color: '#1b1c1a' }}>Legenda</h3>
            <div className="space-y-2 text-sm" style={{ color: '#5f6a5d' }}>
              <div className="flex items-center gap-2"><Circle size={12} fill="#9a6a1d" style={{ color: '#9a6a1d' }} /> Agendada</div>
              <div className="flex items-center gap-2"><Circle size={12} fill="#2257a8" style={{ color: '#2257a8' }} /> Em andamento</div>
              <div className="flex items-center gap-2"><Circle size={12} fill="#1f6a30" style={{ color: '#1f6a30' }} /> Concluida</div>
              <div className="flex items-center gap-2"><Circle size={12} fill="#9f2d2d" style={{ color: '#9f2d2d' }} /> Cancelada</div>
            </div>
          </article>
        </aside>
      </div>

      <Modal
        isOpen={Boolean(clienteHistoricoVisita)}
        onClose={closeClienteHistorico}
        title={clienteHistoricoVisita ? `Histórico de ${clienteHistoricoVisita.CLIENTE}` : 'Histórico do cliente'}
        size="xl"
      >
        {clienteHistoricoVisita ? (
          <div className="space-y-5">
            <div className="rounded-2xl p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#7c8579' }}>Cliente</p>
                  <h3 className="font-display text-2xl font-extrabold" style={{ color: '#1b1c1a' }}>{clienteHistoricoVisita.CLIENTE}</h3>
                  <p className="mt-1 text-sm" style={{ color: '#667064' }}>
                    Cód. {clienteHistoricoVisita.CLIENTE_ID} · {clienteHistoricoVisita.CIDADE || 'Cidade não informada'} · {getVendedorDisplay(clienteHistoricoVisita, true)}
                  </p>
                </div>
                <span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: '#eaf3e6', color: '#1c6a35' }}>
                  Últimos registros
                </span>
              </div>
            </div>

            {clienteHistoricoError ? (
              <div className="rounded-2xl p-3 text-sm" style={{ backgroundColor: '#fff4da', color: '#8a5a00' }}>{clienteHistoricoError}</div>
            ) : null}

            {clienteHistoricoLoading ? (
              <div className="rounded-2xl p-8 text-center text-sm" style={{ backgroundColor: '#f8faf7', color: '#6f786d' }}>
                Carregando histórico do cliente...
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: '#e8efff', color: '#3559c7' }}>
                      <CalendarDays size={18} />
                    </div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#7c8579' }}>Visitas</p>
                    <p className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>{clienteHistoricoVisitasApenas.length}</p>
                  </div>
                  <div className="rounded-2xl p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: '#e7f6ea', color: '#1f7d3f' }}>
                      <CheckCircle2 size={18} />
                    </div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#7c8579' }}>Tarefas</p>
                    <p className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>{clienteHistoricoTarefas.length}</p>
                  </div>
                  <div className="rounded-2xl p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: '#fff4dc', color: '#8a5a00' }}>
                      <PackageCheck size={18} />
                    </div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: '#7c8579' }}>Vendas</p>
                    <p className="font-display text-2xl font-extrabold" style={{ color: '#1b1c1a' }}>{formatCurrency(clienteHistoricoVendasTotal)}</p>
                    <p className="text-xs" style={{ color: '#667064' }}>{clienteHistoricoPedidos.length} pedido(s)/mix</p>
                  </div>
                </div>

                <section className="rounded-2xl p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-base font-extrabold" style={{ color: '#1b1c1a' }}>Linha do tempo recente</h4>
                      <p className="text-xs" style={{ color: '#6f786d' }}>Visitas, tarefas, vendas e mix mais recentes do cliente.</p>
                    </div>
                  </div>

                  {clienteHistoricoEventos.length === 0 ? (
                    <div className="rounded-xl p-5 text-center text-sm" style={{ backgroundColor: '#ffffff', color: '#6f786d' }}>
                      Nenhum registro encontrado para este cliente.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {clienteHistoricoEventos.map((evento) => {
                        const colors = statusColor(evento.status);
                        return (
                          <article key={evento.key} className="rounded-2xl p-4" style={{ backgroundColor: '#ffffff', border: '1px solid #edf1e9' }}>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold" style={{ color: '#7c8579' }}>{evento.tipo} · {formatHistoricoDateTime(evento.data)}</p>
                                <h5 className="mt-1 text-base font-bold" style={{ color: '#1b1c1a' }}>{evento.titulo}</h5>
                              </div>
                              <span className="self-start rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: colors.bg, color: colors.text }}>
                                {statusLabel(evento.status)}
                              </span>
                            </div>
                            <p className="mt-2 line-clamp-3 text-sm" style={{ color: '#536052' }}>{evento.detalhe}</p>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                <div className="rounded-2xl p-3 text-xs" style={{ backgroundColor: '#edf2ee', color: '#536052' }}>
                  Histórico carregado pelos registros disponíveis para este usuário. Para análises completas, use a tela de Histórico de Clientes.
                </div>
              </>
            )}
          </div>
        ) : null}
      </Modal>

      {metaPopupOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22, 26, 22, 0.36)' }}>
          <div className="w-full max-w-xl rounded-3xl p-6 animate-scaleIn" style={{ backgroundColor: '#f8faf7', border: '1px solid #dfe6da' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>Status da Meta Semanal</h3>
              <button
                onClick={() => setMetaPopupOpen(false)}
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: '#edf1e9', color: '#5f6a5d' }}
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-sm mt-1" style={{ color: '#6f796d' }}>
              Janela considerada: {prettyDate(startOfWeek(anchorDate))} até {prettyDate(addDays(startOfWeek(anchorDate), 4))}. Meta: {metaVisitasSemana} visitas ou deslocamentos úteis por {isCoordinatorOwnScope ? 'coordenador' : 'vendedor'}.
            </p>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-2xl p-4" style={{ backgroundColor: '#ffffff' }}>
                <p className="text-[11px] label-ui font-semibold" style={{ color: '#7f897d' }}>Concluidas</p>
                <p className="font-display text-4xl font-extrabold" style={{ color: '#1f6a30' }}>{semanaStats.concluidas}</p>
              </div>
              <div className="rounded-2xl p-4" style={{ backgroundColor: '#ffffff' }}>
                <p className="text-[11px] label-ui font-semibold" style={{ color: '#7f897d' }}>Taxa de cumprimento</p>
                <p className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>{semanaStats.progresso}%</p>
                <p className="text-xs mt-1" style={{ color: '#7f897d' }}>{semanaStats.meta} visitas alvo</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl p-4" style={{ backgroundColor: '#ffffff' }}>
              <p className="text-xs label-ui font-semibold mb-2" style={{ color: '#7f897d' }}>Distribuicao</p>
              <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: '#e4e9e1' }}>
                <div className="h-3" style={{ width: `${(semanaStats.concluidas / Math.max(1, semanaStats.total)) * 100}%`, backgroundColor: '#1f6a30', display: 'inline-block' }} />
                <div className="h-3" style={{ width: `${(semanaStats.andamento / Math.max(1, semanaStats.total)) * 100}%`, backgroundColor: '#2257a8', display: 'inline-block' }} />
                <div className="h-3" style={{ width: `${(semanaStats.agendadas / Math.max(1, semanaStats.total)) * 100}%`, backgroundColor: '#9a6a1d', display: 'inline-block' }} />
                <div className="h-3" style={{ width: `${(semanaStats.canceladas / Math.max(1, semanaStats.total)) * 100}%`, backgroundColor: '#9f2d2d', display: 'inline-block' }} />
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs" style={{ color: '#5f6a5d' }}>
                <div className="flex items-center gap-2"><Circle size={10} fill="#1f6a30" style={{ color: '#1f6a30' }} /> Concluidas: {semanaStats.concluidas}</div>
                <div className="flex items-center gap-2"><Circle size={10} fill="#2257a8" style={{ color: '#2257a8' }} /> Em andamento: {semanaStats.andamento}</div>
                <div className="flex items-center gap-2"><Circle size={10} fill="#9a6a1d" style={{ color: '#9a6a1d' }} /> Agendadas: {semanaStats.agendadas}</div>
                <div className="flex items-center gap-2"><Circle size={10} fill="#9f2d2d" style={{ color: '#9f2d2d' }} /> Canceladas: {semanaStats.canceladas}</div>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setMetaPopupOpen(false)}
                className="px-5 py-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: '#17743b', color: '#ffffff' }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {actionChoiceVisita && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22, 26, 22, 0.36)' }}>
          <div className="w-full max-w-lg rounded-3xl p-6 animate-scaleIn" style={{ backgroundColor: '#f8faf7', border: '1px solid #dfe6da' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Editar / Reagendar / Cancelar</h3>
                <p className="text-sm mt-1" style={{ color: '#6f796d' }}>
                  Escolha a ação para {getAgendaTitle(actionChoiceVisita)} em {actionChoiceVisita.DATA_AGENDADA} às {actionChoiceVisita.HORA_INICIO}.
                </p>
              </div>
              <button
                onClick={closeActionChoice}
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: '#edf1e9', color: '#5f6a5d' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <button
                onClick={() => chooseEditarPlanejamento(actionChoiceVisita)}
                className="rounded-2xl p-4 text-left transition-all duration-200"
                style={{ backgroundColor: '#ffffff', border: '1px solid #dfe6da', color: '#1b1c1a' }}
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: '#e9eefb', color: '#3156a3' }}>
                  <Pencil size={16} />
                </span>
                <strong className="mt-3 block text-sm">
                  {isInternalAgenda(actionChoiceVisita) ? 'Editar descrição' : 'Editar planejamento'}
                </strong>
                <span className="mt-1 block text-xs" style={{ color: '#6f796d' }}>
                  {isInternalAgenda(actionChoiceVisita) ? 'Alterar a descrição ou pauta da agenda interna.' : 'Alterar o objetivo e os pontos a tratar na visita.'}
                </span>
              </button>

              <button
                onClick={() => chooseReagendar(actionChoiceVisita)}
                className="rounded-2xl p-4 text-left transition-all duration-200"
                style={{ backgroundColor: '#ffffff', border: '1px solid #dfe6da', color: '#1b1c1a' }}
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: '#fff4dc', color: '#8a5a00' }}>
                  <CalendarDays size={16} />
                </span>
                <strong className="mt-3 block text-sm">Reagendar</strong>
                <span className="mt-1 block text-xs" style={{ color: '#6f796d' }}>
                  {isInternalAgenda(actionChoiceVisita) ? 'Alterar data, horário ou tipo da agenda interna.' : 'Alterar data, horário ou tipo da visita.'}
                </span>
              </button>

              <button
                onClick={() => chooseCancel(actionChoiceVisita)}
                className="rounded-2xl p-4 text-left transition-all duration-200"
                style={{ backgroundColor: '#ffffff', border: '1px solid #dfe6da', color: '#1b1c1a' }}
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: '#f6dfdf', color: '#9f2d2d' }}>
                  <X size={16} />
                </span>
                <strong className="mt-3 block text-sm">Cancelar</strong>
                <span className="mt-1 block text-xs" style={{ color: '#6f796d' }}>
                  {isInternalAgenda(actionChoiceVisita) ? 'Registrar o motivo e cancelar a agenda interna.' : 'Registrar o motivo e cancelar a visita.'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {conteudoSelecionado && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22, 26, 22, 0.36)' }}>
          <div className="w-full max-w-2xl rounded-3xl p-6 animate-scaleIn" style={{ backgroundColor: '#f8faf7', border: '1px solid #dfe6da' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>
                   {isInternalAgenda(conteudoSelecionado.visita) ? 'Detalhes da agenda interna' : isProspectionAgenda(conteudoSelecionado.visita) ? 'Objetivo da prospecção' : conteudoSelecionado.tipo === 'planejamento' ? 'Planejamento da visita' : 'Relato da visita'}
                </h3>
                <p className="text-sm mt-1" style={{ color: '#6f796d' }}>
                   {getAgendaTitle(conteudoSelecionado.visita)} · {conteudoSelecionado.visita.DATA_AGENDADA} · {isDisplacementAgenda(conteudoSelecionado.visita) ? getAgendaTimeLabel(conteudoSelecionado.visita) : (conteudoSelecionado.visita.HORA_INICIO || '--:--')}
                </p>
                {isDisplacementAgenda(conteudoSelecionado.visita) ? (
                  <p className="text-xs mt-1 font-semibold" style={{ color: '#697568' }}>
                    Origem: {conteudoSelecionado.visita.ORIGEM_DESLOCAMENTO || '-'} · Destino: {conteudoSelecionado.visita.DESTINO_DESLOCAMENTO || '-'}
                  </p>
                ) : null}
                <p className="text-xs mt-1 font-semibold" style={{ color: '#697568' }}>
                  Vendedor: {getVendedorDisplay(conteudoSelecionado.visita, !coordinatorReadOnly)}
                </p>
              </div>
              <button
                onClick={() => setConteudoSelecionado(null)}
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: '#edf1e9', color: '#5f6a5d' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 rounded-2xl p-4 max-h-[52vh] overflow-y-auto relato-content" style={{ backgroundColor: '#ffffff', border: '1px solid #e3e8de', color: '#2d352c' }}>
              {(() => {
                const htmlOriginal = conteudoSelecionado.tipo === 'planejamento'
                  ? getPlanejamentoHtml(conteudoSelecionado.visita)
                  : getRelatoHtml(conteudoSelecionado.visita);
                const relatoHtml = sanitizeRelatoHtmlForView(htmlOriginal);
                const textoRelato = relatoHtml.replace(/<[^>]*>/g, ' ').trim();
                const temImagem = /<img\b/i.test(relatoHtml);

                if (!textoRelato && !temImagem) {
                  return <p className="text-sm" style={{ color: '#728070' }}>{conteudoSelecionado.tipo === 'planejamento' ? 'Sem planejamento registrado.' : 'Sem relato registrado.'}</p>;
                }

                return (
                  <div
                    className="text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: relatoHtml }}
                  />
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {createModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22, 26, 22, 0.36)' }}>
          <div className="w-full max-w-3xl rounded-3xl p-6 animate-scaleIn h-[88vh] max-h-[88vh] flex flex-col" style={{ backgroundColor: '#f8faf7', border: '1px solid #dfe6da' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>{isCreatingDisplacement ? 'Novo deslocamento' : isCreatingInternalAgenda ? 'Nova agenda interna' : isCreatingProspectionVisit ? 'Nova visita de prospecção' : 'Nova visita'}</h3>
              <button
                onClick={closeCreate}
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: '#edf1e9', color: '#5f6a5d' }}
                disabled={savingCreate}
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-2 overflow-y-auto pr-1">
              <p className="text-sm" style={{ color: '#6f796d' }}>
                {isCreatingInternalAgenda
                  ? 'Crie um compromisso interno e convide outros vendedores para aparecer na agenda deles.'
                  : isCreatingDisplacement
                    ? 'Registre origem, destino, saída, chegada e vendedores envolvidos no deslocamento.'
                  : isCreatingProspectionVisit
                    ? 'Selecione um prospect e convide os vendedores que terão essa visita na agenda e na meta.'
                    : 'Selecione um cliente da sua carteira e convide os vendedores que terão essa visita na agenda e na meta.'}
              </p>

              <div className="mt-4 grid grid-cols-1 gap-2 rounded-2xl p-1 sm:grid-cols-4" style={{ backgroundColor: '#eef2eb' }}>
                {([
                  { value: 'VISITA', label: 'Visita com cliente' },
                  { value: 'PROSPECCAO', label: 'Visita de prospecção' },
                  { value: 'INTERNA', label: 'Agenda interna' },
                  { value: 'DESLOCAMENTO', label: 'Deslocamento' },
                ] as const).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCreateMode(option.value)}
                    className="rounded-xl px-3 py-2 text-sm font-semibold transition-all duration-200"
                    style={{
                      backgroundColor: createForm.modo === option.value ? '#17743b' : 'transparent',
                      color: createForm.modo === option.value ? '#ffffff' : '#5c665a',
                    }}
                    disabled={savingCreate}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                {!isCreatingInternalAgenda && !isCreatingProspectionVisit && !isCreatingDisplacement ? (
                <div className="md:col-span-2">
                  <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>Cliente da carteira</label>
                  <Select
                    options={carteiraClienteOptions}
                    value={createForm.clienteId}
                    onChange={(value) => setCreateForm((prev) => ({ ...prev, clienteId: value }))}
                    placeholder={loadingCarteiraClientes ? 'Carregando clientes...' : 'Selecione um cliente'}
                    searchable
                    searchPlaceholder="Pesquisar por nome ou código"
                    onSearchChange={setClienteCarteiraSearch}
                    searching={loadingBuscaCarteiraClientes}
                    className="mt-1"
                    disabled={loadingCarteiraClientes || carteiraClienteOptions.length === 0 || savingCreate}
                  />
                  {carteiraClienteOptions.length === 0 && !loadingCarteiraClientes && (
                    <p className="text-xs mt-2" style={{ color: '#a33b3b' }}>
                      Nenhum cliente encontrado na sua carteira.
                    </p>
                  )}
                </div>
                ) : isCreatingProspectionVisit ? (
                <div className="md:col-span-2">
                  <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>Prospect</label>
                  <Select
                    options={prospectAgendaOptions}
                    searchable
                    value={createForm.prospectId}
                    onChange={(value) => setCreateForm((prev) => ({ ...prev, prospectId: value }))}
                    placeholder={loadingProspectsAgenda ? 'Carregando prospects...' : 'Selecione um prospect'}
                    className="mt-1"
                    disabled={loadingProspectsAgenda || prospectAgendaOptions.length === 0 || savingCreate}
                  />
                  {prospectAgendaOptions.length === 0 && !loadingProspectsAgenda && (
                    <p className="text-xs mt-2" style={{ color: '#a33b3b' }}>
                      Nenhum prospect ativo encontrado. Cadastre o prospect na tela de prospecção antes de agendar.
                    </p>
                  )}
                </div>
                ) : isCreatingDisplacement ? (
                <>
                  <div>
                    <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>Origem</label>
                    <input
                      type="text"
                      value={createForm.origemDeslocamento}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, origemDeslocamento: e.target.value }))}
                      className="w-full mt-1 p-3 text-sm rounded-lg"
                      placeholder="Ex.: Matriz"
                      style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }}
                      disabled={savingCreate}
                    />
                  </div>

                  <div>
                    <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>Destino</label>
                    <input
                      type="text"
                      value={createForm.destinoDeslocamento}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, destinoDeslocamento: e.target.value }))}
                      className="w-full mt-1 p-3 text-sm rounded-lg"
                      placeholder="Ex.: Cliente ou cidade"
                      style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }}
                      disabled={savingCreate}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>Vendedores convidados</label>
                    <Select
                      options={vendedoresConviteOptions}
                      searchable
                      value=""
                      onChange={(value) => {
                        if (value) toggleParticipante(value);
                      }}
                      placeholder={loadingVendedoresConvite ? 'Carregando vendedores...' : 'Adicionar vendedor'}
                      className="mt-1"
                      disabled={savingCreate || loadingVendedoresConvite || vendedoresConviteOptions.length <= 1}
                    />
                    {participantesSelecionados.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {participantesSelecionados.map((vendedor) => (
                          <button
                            key={vendedor.USER_ID}
                            type="button"
                            onClick={() => toggleParticipante(String(vendedor.USER_ID))}
                            className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200"
                            style={{ backgroundColor: '#e0f0e4', color: '#1d6a36', border: '1px solid #b7d9c0' }}
                            disabled={savingCreate}
                            title="Remover vendedor"
                          >
                            {vendedor.NOME || `Vendedor ${vendedor.USER_ID}`} ×
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs mt-2" style={{ color: loadingVendedoresConvite ? '#7d887c' : '#6f796d' }}>
                        {loadingVendedoresConvite ? 'Carregando vendedores...' : 'Nenhum vendedor convidado.'}
                      </p>
                    )}
                    <p className="text-[11px] mt-1" style={{ color: '#7d887c' }}>
                      O deslocamento aparece para quem criou e também para os vendedores convidados.
                    </p>
                  </div>
                </>
                ) : (
                <>
                  <div className="md:col-span-2">
                    <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>Título da agenda</label>
                    <input
                      type="text"
                      value={createForm.titulo}
                      onChange={(e) => setCreateForm((prev) => ({ ...prev, titulo: e.target.value }))}
                      className="w-full mt-1 p-3 text-sm rounded-lg"
                      placeholder="Ex.: Reunião interna de alinhamento"
                      style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }}
                      disabled={savingCreate}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>Vendedores convidados</label>
                    <Select
                      options={vendedoresConviteOptions}
                      searchable
                      value=""
                      onChange={(value) => {
                        if (value) toggleParticipante(value);
                      }}
                      placeholder={loadingVendedoresConvite ? 'Carregando vendedores...' : 'Adicionar vendedor'}
                      className="mt-1"
                      disabled={savingCreate || loadingVendedoresConvite || vendedoresConviteOptions.length <= 1}
                    />
                    {participantesSelecionados.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {participantesSelecionados.map((vendedor) => (
                          <button
                            key={vendedor.USER_ID}
                            type="button"
                            onClick={() => toggleParticipante(String(vendedor.USER_ID))}
                            className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200"
                            style={{ backgroundColor: '#e0f0e4', color: '#1d6a36', border: '1px solid #b7d9c0' }}
                            disabled={savingCreate}
                            title="Remover vendedor"
                          >
                            {vendedor.NOME || `Vendedor ${vendedor.USER_ID}`} ×
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs mt-2" style={{ color: loadingVendedoresConvite ? '#7d887c' : '#6f796d' }}>
                        {loadingVendedoresConvite ? 'Carregando vendedores...' : 'Nenhum vendedor convidado.'}
                      </p>
                    )}
                    <p className="text-[11px] mt-1" style={{ color: '#7d887c' }}>
                      A agenda sempre aparece para quem criou e também para os vendedores selecionados.
                    </p>
                  </div>
                </>
                )}

                {!isCreatingInternalAgenda && !isCreatingDisplacement ? (
                  <div className="md:col-span-2">
                    <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>Vendedores convidados</label>
                    <Select
                      options={vendedoresConviteOptions}
                      value=""
                      onChange={(value) => {
                        if (value) toggleParticipante(value);
                      }}
                      placeholder={loadingVendedoresConvite ? 'Carregando vendedores...' : 'Adicionar vendedor'}
                      searchable
                      searchPlaceholder="Pesquisar vendedor"
                      className="mt-1"
                      disabled={savingCreate || loadingVendedoresConvite || vendedoresConviteOptions.length <= 1}
                    />
                    {participantesSelecionados.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {participantesSelecionados.map((vendedor) => (
                          <button
                            key={vendedor.USER_ID}
                            type="button"
                            onClick={() => toggleParticipante(String(vendedor.USER_ID))}
                            className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200"
                            style={{ backgroundColor: '#e0f0e4', color: '#1d6a36', border: '1px solid #b7d9c0' }}
                            disabled={savingCreate}
                            title="Remover vendedor"
                          >
                            {vendedor.NOME || `Vendedor ${vendedor.USER_ID}`} ×
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs mt-2" style={{ color: loadingVendedoresConvite ? '#7d887c' : '#6f796d' }}>
                        {loadingVendedoresConvite ? 'Carregando vendedores...' : 'Nenhum vendedor convidado. Sem seleção, a visita fica na sua agenda e meta.'}
                      </p>
                    )}
                    <p className="text-[11px] mt-1" style={{ color: '#7d887c' }}>
                      Para vendedores selecionados, a visita entra na agenda e contabiliza também na meta deles.
                    </p>
                  </div>
                ) : null}

                <div>
                  <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>Data</label>
                  <input
                    type="date"
                    value={createForm.dataAgendada}
                    min={minAvailableVisitDate}
                    title="Permite lançamento retroativo em até 5 dias"
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, dataAgendada: e.target.value }))}
                    className="w-full mt-1 p-3 text-sm rounded-lg"
                    style={{
                      backgroundColor: '#ffffff',
                      border: `1px solid ${isVisitDateAvailable(createForm.dataAgendada, minAvailableVisitDate) ? '#e1e8dc' : '#d84d4d'}`,
                      color: '#1b1c1a',
                    }}
                    disabled={savingCreate}
                  />
                  <p className="text-[11px] mt-1" style={{ color: '#7d887c' }}>
                    Permite lançamento retroativo até {prettyDate(dateFromIso(minAvailableVisitDate))}.
                  </p>
                </div>

                <div>
                  <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>Tipo</label>
                  <Select
                    options={isCreatingDisplacement ? DESLOCAMENTO_TIPO_OPTIONS : isCreatingInternalAgenda ? AGENDA_INTERNA_TIPO_OPTIONS : isCreatingProspectionVisit ? PROSPECCAO_TIPO_OPTIONS : VISITA_TIPO_OPTIONS}
                    value={createForm.tipo}
                    onChange={(value) => setCreateForm((prev) => ({ ...prev, tipo: value }))}
                    placeholder="Selecione o tipo"
                    className="mt-1"
                    disabled={savingCreate}
                  />
                </div>

                <div>
                  <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>{isCreatingDisplacement ? 'Hora de saída' : 'Hora início'}</label>
                  <input
                    type="time"
                    value={createForm.horaInicio}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, horaInicio: e.target.value }))}
                    className="w-full mt-1 p-3 text-sm rounded-lg"
                    style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }}
                    disabled={savingCreate}
                  />
                </div>

                <div>
                  <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>{isCreatingDisplacement ? 'Hora de chegada' : 'Hora fim'}</label>
                  <input
                    type="time"
                    value={createForm.horaFim}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, horaFim: e.target.value }))}
                    className="w-full mt-1 p-3 text-sm rounded-lg"
                    style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }}
                    disabled={savingCreate}
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>{isCreatingDisplacement ? 'Observações do deslocamento (Opcional)' : isCreatingInternalAgenda ? 'Descrição (Opcional)' : isCreatingProspectionVisit ? 'Objetivo da prospecção (Opcional)' : 'Planejamento (Opcional)'}</label>
                <RichTextEditor
                  value={createForm.relato}
                  onChange={(value) => setCreateForm((prev) => ({ ...prev, relato: value }))}
                  minHeight={130}
                  className="mt-1"
                  placeholder={isCreatingDisplacement ? 'Contexto, rota, veículo ou observações do deslocamento' : isCreatingInternalAgenda ? 'Pauta, objetivo ou observações do compromisso interno' : isCreatingProspectionVisit ? 'Objetivo, contexto inicial ou pontos a levantar no prospect' : 'Contexto inicial, objetivo da visita ou pontos a tratar'}
                  disabled={savingCreate}
                />
              </div>

              {createError ? (
                <p className="text-xs mt-2" style={{ color: '#a33b3b' }}>{createError}</p>
              ) : null}
            </div>

            <div className="mt-4 pt-4 border-t flex items-center justify-end gap-2" style={{ borderColor: '#dfe6da' }}>
              <button
                onClick={closeCreate}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: '#edf1e9', color: '#5f6a5d' }}
                disabled={savingCreate}
              >
                Cancelar
              </button>
              <button
                onClick={onCreateVisita}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: '#1d6a36', color: '#ffffff' }}
                  disabled={savingCreate || (!isCreatingInternalAgenda && !isCreatingProspectionVisit && !isCreatingDisplacement && (loadingCarteiraClientes || carteiraClienteOptions.length === 0)) || (isCreatingProspectionVisit && (loadingProspectsAgenda || prospectAgendaOptions.length === 0))}
                >
                  {savingCreate ? 'Criando...' : isCreatingDisplacement ? 'Criar deslocamento' : isCreatingInternalAgenda ? 'Criar agenda interna' : isCreatingProspectionVisit ? 'Criar visita de prospecção' : 'Criar visita'}
                </button>
            </div>
          </div>
        </div>
      )}

      {checkoutModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22, 26, 22, 0.36)' }}>
          <div className="w-full max-w-4xl rounded-3xl p-6 animate-scaleIn h-[88vh] max-h-[88vh] flex flex-col" style={{ backgroundColor: '#f8faf7', border: '1px solid #dfe6da' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>{isCheckoutProspection ? 'Relato da prospecção' : 'Relato e atividades'}</h3>
              <button
                onClick={() => {
                  if (checkoutSaving) return;
                  setCheckoutModalOpen(false);
                }}
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: '#edf1e9', color: '#5f6a5d' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-2 overflow-y-auto pr-1">
              <p className="text-sm" style={{ color: '#6f796d' }}>
                {isCheckoutProspection
                  ? 'Registre o resultado da visita de prospecção para concluir o ciclo operacional.'
                  : 'Registre o relato da visita e, se necessário, adicione atividades já vinculadas ao cliente.'}
              </p>

              {checkoutVisita && (
                <div className="mt-3 rounded-xl p-3 text-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#5f6a5d' }}>
                  {isCheckoutProspection ? 'Prospect' : 'Cliente vinculado'}: <strong style={{ color: '#1f6a30' }}>{checkoutVisita.CLIENTE}</strong>
                </div>
              )}

              <div className="mt-4">
                <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>Relato</label>
                <RichTextEditor
                  value={checkoutRelato}
                  onChange={setCheckoutRelato}
                  minHeight={150}
                  className="mt-1"
                  placeholder="Ex.: Cliente aprovou proposta de reposicao com foco em mercearia seca."
                  disabled={checkoutSaving}
                />
              </div>
              {!isCheckoutProspection && (
              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>
                    Atividades para incluir no fechamento
                  </p>
                  <button
                    onClick={() => setCheckoutAtividades((prev) => [...prev, createCheckoutActivity(checkoutVisita?.DATA_AGENDADA || '')])}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                    style={{ backgroundColor: '#eaf3e6', color: '#1d6a36' }}
                    disabled={checkoutSaving}
                  >
                    <Plus size={13} /> Adicionar atividade
                  </button>
                </div>

                <div className="mt-2 max-h-[280px] overflow-auto pr-1 space-y-2">
                  {checkoutAtividades.map((atividade, index) => (
                    <div key={`checkout-atividade-${index}`} className="rounded-xl p-3" style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc' }}>
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] label-ui font-semibold" style={{ color: '#7d887c' }}>
                          Atividade {index + 1}
                        </p>
                        {checkoutAtividades.length > 1 && (
                          <button
                            onClick={() => setCheckoutAtividades((prev) => prev.filter((_, idx) => idx !== index))}
                            className="w-7 h-7 rounded-md flex items-center justify-center"
                            style={{ backgroundColor: '#f8eceb', color: '#ab3d3a' }}
                            disabled={checkoutSaving}
                            title="Remover atividade"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                        <div className="md:col-span-2">
                          <label className="text-[11px] label-ui font-semibold" style={{ color: '#7d887c' }}>Título</label>
                          <input
                            type="text"
                            value={atividade.titulo}
                            onChange={(e) =>
                              setCheckoutAtividades((prev) => prev.map((item, idx) => (idx === index ? { ...item, titulo: e.target.value } : item)))
                            }
                            className="w-full mt-1 p-2 text-sm rounded-lg"
                            placeholder="Ex.: Retornar com proposta comercial"
                            style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }}
                          />
                        </div>

                        <div>
                          <label className="text-[11px] label-ui font-semibold" style={{ color: '#7d887c' }}>Prioridade</label>
                          <Select
                            options={ATIVIDADE_PRIORIDADE_OPTIONS}
                            value={atividade.prioridade}
                            onChange={(value) =>
                              setCheckoutAtividades((prev) => prev.map((item, idx) => (idx === index ? { ...item, prioridade: value } : item)))
                            }
                            className="mt-1"
                            placeholder="Selecione"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                        <div>
                          <label className="text-[11px] label-ui font-semibold" style={{ color: '#7d887c' }}>Data limite</label>
                          <input
                            type="date"
                            value={atividade.dataLimite}
                            onChange={(e) =>
                              setCheckoutAtividades((prev) => prev.map((item, idx) => (idx === index ? { ...item, dataLimite: e.target.value } : item)))
                            }
                            className="w-full mt-1 p-2 text-sm rounded-lg"
                            style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }}
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="text-[11px] label-ui font-semibold" style={{ color: '#7d887c' }}>Descrição</label>
                          <input
                            type="text"
                            value={atividade.descricao}
                            onChange={(e) =>
                              setCheckoutAtividades((prev) => prev.map((item, idx) => (idx === index ? { ...item, descricao: e.target.value } : item)))
                            }
                            className="w-full mt-1 p-2 text-sm rounded-lg"
                            placeholder="Detalhes rápidos da atividade"
                            style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {checkoutError && (
                <div className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: '#fdecec', border: '1px solid #f5c9c8', color: '#9f2d2d' }}>
                  {checkoutError}
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t flex items-center justify-end gap-2" style={{ borderColor: '#dfe6da' }}>
              <button
                onClick={() => {
                  if (checkoutSaving) return;
                  setCheckoutModalOpen(false);
                }}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: '#edf1e9', color: '#5f6a5d' }}
                disabled={checkoutSaving}
              >
                Voltar
              </button>
              <button
                onClick={onConfirmCheckout}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: '#1d6a36', color: '#ffffff' }}
                disabled={checkoutSaving || !canConfirmCheckout}
              >
                {checkoutSaving
                  ? 'Salvando...'
                  : checkoutCompleted
                    ? 'Salvar atividades pendentes'
                    : 'Concluir visita'}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22, 26, 22, 0.36)' }}>
          <div className="w-full max-w-xl rounded-3xl p-6 animate-scaleIn h-[88vh] max-h-[88vh] flex flex-col" style={{ backgroundColor: '#f8faf7', border: '1px solid #dfe6da' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>
                {isInternalAgenda(visitas.find((visita) => visita.ID === cancelVisitaId) || ({} as Visita)) ? 'Cancelar agenda interna' : 'Cancelar visita'}
              </h3>
              <button
                onClick={closeCancel}
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: '#edf1e9', color: '#5f6a5d' }}
                disabled={cancelSaving}
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-2 overflow-y-auto pr-1">
              <p className="text-sm" style={{ color: '#6f796d' }}>
                {isInternalAgenda(visitas.find((visita) => visita.ID === cancelVisitaId) || ({} as Visita))
                  ? 'Confirme o cancelamento da agenda interna. O motivo é opcional.'
                  : 'Informe o motivo do cancelamento para registrar no histórico da visita.'}
              </p>

              <div className="mt-4">
                <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>
                  {isInternalAgenda(visitas.find((visita) => visita.ID === cancelVisitaId) || ({} as Visita)) ? 'Motivo do cancelamento (opcional)' : 'Relato do cancelamento'}
                </label>
                <RichTextEditor
                  value={cancelRelato}
                  onChange={setCancelRelato}
                  minHeight={140}
                  className="mt-1"
                  placeholder={isInternalAgenda(visitas.find((visita) => visita.ID === cancelVisitaId) || ({} as Visita)) ? 'Opcional' : 'Ex.: Cliente pediu reagendamento para a próxima semana por indisponibilidade hoje.'}
                  disabled={cancelSaving}
                />
              </div>

              {cancelError ? (
                <p className="text-xs mt-2" style={{ color: '#a33b3b' }}>{cancelError}</p>
              ) : null}
            </div>

            <div className="mt-4 pt-4 border-t flex items-center justify-end gap-2" style={{ borderColor: '#dfe6da' }}>
              <button
                onClick={closeCancel}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: '#edf1e9', color: '#5f6a5d' }}
                disabled={cancelSaving}
              >
                Voltar
              </button>
              <button
                onClick={onConfirmCancel}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: '#a33b3b', color: '#ffffff' }}
                disabled={cancelSaving}
              >
                {cancelSaving ? 'Cancelando...' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editModalOpen && editingVisita && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22, 26, 22, 0.36)' }}>
          <div className="w-full max-w-2xl rounded-3xl p-6 animate-scaleIn h-[88vh] max-h-[88vh] flex flex-col overflow-hidden" style={{ backgroundColor: '#f8faf7', border: '1px solid #dfe6da' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>
                {editMode === 'planejamento'
                  ? (isDisplacementAgenda(editingVisita) ? 'Editar observações do deslocamento' : isInternalAgenda(editingVisita) ? 'Editar descrição da agenda interna' : isProspectionAgenda(editingVisita) ? 'Editar objetivo da prospecção' : 'Editar planejamento da visita')
                  : editMode === 'relato' ? 'Editar relato da visita'
                  : isDisplacementAgenda(editingVisita) ? 'Editar deslocamento' : isInternalAgenda(editingVisita) ? 'Editar agenda interna' : (isProspectionAgenda(editingVisita) ? 'Reagendar visita de prospecção' : 'Reagendar visita')}
              </h3>
              <button
                onClick={closeEdit}
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: '#edf1e9', color: '#5f6a5d' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-2 flex-1 min-h-0 overflow-y-auto pr-1">
              <p className="text-sm" style={{ color: '#6f796d' }}>
                {isInternalAgenda(editingVisita) ? 'Agenda' : isProspectionAgenda(editingVisita) ? 'Prospect' : 'Cliente'}: <strong>{getAgendaTitle(editingVisita)}</strong>
              </p>

              {editMode === 'reagendamento' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                {isDisplacementAgenda(editingVisita) ? (
                  <>
                    <div>
                      <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>Origem</label>
                      <input
                        type="text"
                        value={editForm.origemDeslocamento}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, origemDeslocamento: e.target.value }))}
                        className="w-full mt-1 p-3 text-sm rounded-lg"
                        placeholder="Ex.: Matriz"
                        style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }}
                        disabled={savingEdit}
                      />
                    </div>
                    <div>
                      <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>Destino</label>
                      <input
                        type="text"
                        value={editForm.destinoDeslocamento}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, destinoDeslocamento: e.target.value }))}
                        className="w-full mt-1 p-3 text-sm rounded-lg"
                        placeholder="Ex.: Cliente ou cidade"
                        style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }}
                        disabled={savingEdit}
                      />
                    </div>
                  </>
                ) : isInternalAgenda(editingVisita) ? (
                  <div className="md:col-span-2">
                    <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>Título da agenda</label>
                    <input
                      type="text"
                      value={editForm.titulo}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, titulo: e.target.value }))}
                      className="w-full mt-1 p-3 text-sm rounded-lg"
                      placeholder="Ex.: Reunião interna de alinhamento"
                      style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }}
                      disabled={savingEdit}
                    />
                  </div>
                ) : null}
                <div>
                  <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>Data</label>
                  <input
                    type="date"
                    value={editForm.dataAgendada}
                    min={minAvailableVisitDate}
                    title="Permite reagendamento retroativo em até 5 dias"
                    onChange={(e) => setEditForm((prev) => ({ ...prev, dataAgendada: e.target.value }))}
                    className="w-full mt-1 p-3 text-sm rounded-lg"
                    placeholder="YYYY-MM-DD"
                    style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }}
                  />
                  <p className="text-[11px] mt-1" style={{ color: '#7d887c' }}>
                    Retroativo permitido até {prettyDate(dateFromIso(minAvailableVisitDate))}.
                  </p>
                </div>

                <div>
                  <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>Tipo</label>
                  <Select
                    options={tipoVisitaOptions}
                    value={editForm.tipo}
                    onChange={(value) => setEditForm((prev) => ({ ...prev, tipo: value }))}
                    placeholder="Selecione o tipo"
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>{isDisplacementAgenda(editingVisita) ? 'Hora de saída' : 'Hora início'}</label>
                  <input
                    type="time"
                    value={editForm.horaInicio}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, horaInicio: e.target.value }))}
                    className="w-full mt-1 p-3 text-sm rounded-lg"
                    placeholder="HH:mm"
                    style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }}
                  />
                </div>

                <div>
                  <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>{isDisplacementAgenda(editingVisita) ? 'Hora de chegada' : 'Hora fim'}</label>
                  <input
                    type="time"
                    value={editForm.horaFim}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, horaFim: e.target.value }))}
                    className="w-full mt-1 p-3 text-sm rounded-lg"
                    placeholder="HH:mm"
                    style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }}
                  />
                </div>
              </div>
              ) : null}

              {editMode === 'planejamento' ? (
              <div className="mt-3">
                <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>
                  {isDisplacementAgenda(editingVisita) ? 'Observações do deslocamento' : isInternalAgenda(editingVisita) ? 'Descrição da agenda interna' : isProspectionAgenda(editingVisita) ? 'Objetivo da prospecção' : 'Planejamento da visita'}
                </label>
                <RichTextEditor
                  value={editForm.planejamento}
                  onChange={(value) => setEditForm((prev) => ({ ...prev, planejamento: value }))}
                  minHeight={130}
                  className="mt-1"
                  placeholder={isDisplacementAgenda(editingVisita) ? 'Contexto, rota, veículo ou observações do deslocamento' : isInternalAgenda(editingVisita) ? 'Pauta, objetivo ou observações do compromisso interno' : isProspectionAgenda(editingVisita) ? 'Objetivo, contexto inicial ou pontos a levantar no prospect' : 'Contexto inicial, objetivo da visita ou pontos a tratar'}
                  disabled={savingEdit}
                />
              </div>
              ) : null}

              {editMode === 'relato' ? (
              <div className="mt-3">
                <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>
                  Relato da visita
                </label>
                <RichTextEditor
                  value={editForm.relato}
                  onChange={(value) => setEditForm((prev) => ({ ...prev, relato: value }))}
                  minHeight={180}
                  className="mt-1"
                  placeholder="Atualize o relato registrado no encerramento da visita"
                  disabled={savingEdit}
                />
              </div>
              ) : null}

              {editMode === 'reagendamento' && isInternalAgenda(editingVisita) ? (
              <div className="mt-3">
                <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>
                  Descrição (Opcional)
                </label>
                <RichTextEditor
                  value={editForm.planejamento}
                  onChange={(value) => setEditForm((prev) => ({ ...prev, planejamento: value }))}
                  minHeight={130}
                  className="mt-1"
                  placeholder="Pauta, objetivo ou observações do compromisso interno"
                  disabled={savingEdit}
                />
              </div>
              ) : null}

              {editMode === 'reagendamento' && !isInternalAgenda(editingVisita) ? (
              <div className="mt-3">
                <label className="text-xs label-ui font-semibold" style={{ color: '#7d887c' }}>
                  Relato da alteração {isReagendamento ? '(obrigatório ao alterar a data)' : '(opcional)'}
                </label>
                <RichTextEditor
                  value={editForm.relato}
                  onChange={(value) => setEditForm((prev) => ({ ...prev, relato: value }))}
                  minHeight={130}
                  className="mt-1"
                  placeholder={isReagendamento ? 'Descreva o motivo da alteração de data' : 'Opcional'}
                  disabled={savingEdit}
                />
              </div>
              ) : null}

              {editError ? (
                <p className="text-xs mt-2" style={{ color: '#a33b3b' }}>{editError}</p>
              ) : null}
            </div>

            <div className="mt-4 pt-4 border-t flex items-center justify-end gap-2 shrink-0" style={{ borderColor: '#dfe6da' }}>
              <button
                onClick={closeEdit}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: '#edf1e9', color: '#5f6a5d' }}
                disabled={savingEdit}
              >
                Cancelar
              </button>
              <button
                onClick={onSaveEdit}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: '#1d6a36', color: '#ffffff' }}
                disabled={savingEdit}
              >
                {savingEdit ? 'Salvando...' : editMode === 'relato' ? 'Salvar relato' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-2xl p-3 flex items-center gap-2" style={{ backgroundColor: '#eef3eb', color: '#60705f' }}>
        <Flag size={14} />
        <span className="text-xs">
          Dica operacional: no modo Semana e Mes, clique em um dia para ver os detalhes e executar acoes de agenda.
        </span>
        <MapPin size={14} className="ml-auto" />
      </div>
    </div>
  );
}
