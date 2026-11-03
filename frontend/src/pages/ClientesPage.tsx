import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Pencil, Trash2, X, Bell, ClipboardList } from 'lucide-react';
import { getRecordMitra } from 'mitra-interactions-sdk';
import { callSF, callSFMutation, callSFSingle, callSFWithMeta, formatCurrency, getBrasiliaTimestamp, SF } from '../hooks/useMitra';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import LegendaCarteira from '../components/LegendaCarteira';
import TemperaturaDetalhePopover from '../components/TemperaturaDetalhePopover';
import { ChartContainer, ShadcnBarChart } from '../components/ui/Chart';
import HistoricoClientesPage from './HistoricoClientesPage';
import { smartSearchScore } from '../lib/smartSearch';
import { CoordinatorScopeFilter, useCoordinatorScope } from '../components/CoordinatorScopeFilter';

interface Cliente {
  ID: number;
  RAZAO_SOCIAL: string;
  NOME_FANTASIA: string;
  CNPJ: string;
  CIDADE: string;
  UF: string;
  SEGMENTO: string;
  STATUS: string;
  TELEFONE?: string;
  EMAIL?: string;
  ENDERECO?: string;
  COMPRAS_90D?: number;
  COMPRAS_MES_ATUAL?: number;
  VISITAS_60D?: number;
  DIAS_ULTIMA_COMPRA?: number;
  DIAS_SEM_VISITA?: number;
  SCORE_RANKING?: number;
  RANKING?: CarteiraCurva;
  CODFILIAL?: string;
  ID_SECAO?: number | string;
  WINTHOR_CODCLI?: number | string;
  CODCLI?: number | string;
  RAMO_CLIENTE?: string;
  ID_VENDEDOR?: number | string;
}

type CarteiraCurva = 'A' | 'B' | 'C' | 'D';

interface ClienteAlertaRow {
  ID_CLIENTE?: number | string;
}

interface TemperaturaClienteRow extends ClienteAlertaRow {
  TEMPERATURA?: string;
  SCORE_TOTAL?: number | string;
}

interface RamoDistribuicaoItem {
  name: string;
  value: number;
}

type Tab = 'CARTEIRA' | 'DISPONIVEIS' | 'HISTORICO';

interface CarteiraFilters {
  busca: string;
  segmento: string;
  ramoCliente: string;
  status: string;
  cidade: string;
  uf: string;
}

interface SegmentoOption {
  value: string;
  label: string;
}

interface ProspectClienteForm {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  segmento: string;
  porte: string;
  origem: string;
  cidade: string;
  uf: string;
  potencial: string;
  probabilidade: string;
  observacoes: string;
  contatoNome: string;
  contatoCargo: string;
  contatoTelefone: string;
  contatoEmail: string;
}

function parseFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatClienteNomeCurto(nome: string): string {
  const normalized = String(nome || '').trim();
  if (normalized.length <= 12) return normalized;
  return `${normalized.slice(0, 11)}…`;
}

function getCodigoCliente(cliente: Cliente): string {
  return String(cliente.WINTHOR_CODCLI ?? cliente.CODCLI ?? cliente.ID ?? '').trim();
}

function getClienteSearchFields(cliente: Cliente): unknown[] {
  return [
    cliente.NOME_FANTASIA,
    cliente.RAZAO_SOCIAL,
    cliente.CNPJ,
    getCodigoCliente(cliente),
    cliente.ID,
    cliente.CIDADE,
    cliente.UF,
    cliente.RAMO_CLIENTE,
    cliente.SEGMENTO,
  ];
}

function getClienteSearchScore(cliente: Cliente, busca: string): number {
  return smartSearchScore(getClienteSearchFields(cliente), busca);
}

function dedupeClientesById(clientes: Cliente[]): Cliente[] {
  const byId = new Map<number, Cliente>();

  clientes.forEach((cliente) => {
    const id = Number(cliente.ID || 0);
    if (!Number.isFinite(id) || id <= 0) return;

    if (!byId.has(id)) {
      byId.set(id, cliente);
    }
  });

  return Array.from(byId.values());
}

function getLimiteDiasSemVisitaPorCurva(curva: unknown): number | null {
  const normalized = String(curva || '').trim().toUpperCase();
  if (normalized === 'A') return 8;
  if (normalized === 'B') return 16;
  if (normalized === 'C') return 32;
  if (normalized === 'D') return 61;
  return null;
}

function getCarteiraErrorMessage(status: string, fallback: string): string {
  if (status === 'CLIENTE_NAO_ENCONTRADO') return 'Cliente não encontrado para vinculação.';
  if (status === 'JA_NA_SUA_CARTEIRA') return 'Cliente já está na sua carteira para este escopo.';
  if (status === 'MESMO_ESCOPO_OCUPADO') return fallback || 'Este cliente já está na carteira de outro vendedor no mesmo escopo.';
  return fallback || 'Não foi possível adicionar o cliente à sua carteira.';
}

function sanitizeProspectField(value: string, maxLength: number): string {
  return String(value || '').trim().replace(/\n/g, ' ').replace(/'/g, "''").slice(0, maxLength);
}

type CarteiraSort =
  | 'RANKING_ASC'
  | 'RANKING_DESC'
  | 'NOME_ASC'
  | 'NOME_DESC'
  | 'STATUS_ASC'
  | 'STATUS_DESC'
  | 'DIAS_VISITA_ASC'
  | 'DIAS_VISITA_DESC';

const RAMO_OPTIONS = [
  { value: '', label: 'Todos os ramos' },
  { value: 'PESSOA FISICA', label: 'PESSOA FISICA' },
  { value: 'CLINICA MEDICA', label: 'CLINICA MEDICA' },
  { value: 'ORGAO PUBLICO CENTRO OESTE', label: 'ORGAO PUBLICO CENTRO OESTE' },
  { value: 'HOME CARE', label: 'HOME CARE' },
  { value: 'HOSPITAL PRIVADO', label: 'HOSPITAL PRIVADO' },
  { value: 'E-COMMERCE', label: 'E-COMMERCE' },
  { value: 'HOSPITAL INTERIOR GO', label: 'HOSPITAL INTERIOR GO' },
  { value: 'DEMAIS CLIENTES', label: 'DEMAIS CLIENTES' },
  { value: 'PDV', label: 'PDV' },
  { value: 'DISTRIBUIDOR', label: 'DISTRIBUIDOR' },
  { value: 'PESSOA JURIDICA', label: 'PESSOA JURIDICA' },
  { value: 'HOSPITAL PUBLICO', label: 'HOSPITAL PUBLICO' },
  { value: 'CONCESSIONARIA', label: 'CONCESSIONARIA' },
  { value: 'INSTITUTO DE LONGA PERMANENCIA', label: 'INSTITUTO DE LONGA PERMANENCIA' },
  { value: 'ORGAO PUBLICO SUDESTE', label: 'ORGAO PUBLICO SUDESTE' },
  { value: 'ORGAO PUBLICO SUL', label: 'ORGAO PUBLICO SUL' },
  { value: 'OPERADORA DE SAUDE', label: 'OPERADORA DE SAUDE' },
  { value: 'ORGAO PUBLICO NORTE', label: 'ORGAO PUBLICO NORTE' },
  { value: 'ORGAO PUBLICO NORDESTE', label: 'ORGAO PUBLICO NORDESTE' },
  { value: 'FILIAL', label: 'FILIAL' },
  { value: 'BIONEXO- OUTROS ESTADOS', label: 'BIONEXO- OUTROS ESTADOS' },
  { value: 'Sem ramo', label: 'Sem ramo' },
];

const CARTEIRA_KPI_PAGE_SIZE = 300;
const CARTEIRA_KPI_MAX_OFFSET = 12000;
const CURVA_OPTIONS: CarteiraCurva[] = ['A', 'B', 'C', 'D'];

const EMPTY_PROSPECT_CLIENTE_FORM: ProspectClienteForm = {
  razaoSocial: '',
  nomeFantasia: '',
  cnpj: '',
  segmento: '',
  porte: '',
  origem: '',
  cidade: '',
  uf: '',
  potencial: '',
  probabilidade: '10',
  observacoes: '',
  contatoNome: '',
  contatoCargo: '',
  contatoTelefone: '',
  contatoEmail: '',
};

export default function ClientesPage() {
  const navigate = useNavigate();
  const { clienteId } = useParams();
  const [searchParams] = useSearchParams();
  const coordinatorScope = useCoordinatorScope('clientes-carteira');
  const clienteIdHistorico = searchParams.get('clienteId') || '';
  const projectId = Number(import.meta.env.VITE_MITRA_PROJECT_ID);
  const { toasts, addToast, removeToast } = useToast();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState<Tab>('CARTEIRA');
  const [addingClientId, setAddingClientId] = useState<number | null>(null);
  const [removingClientId, setRemovingClientId] = useState<number | null>(null);
  const [editingClienteId, setEditingClienteId] = useState<number | null>(null);
  const [editingCurva, setEditingCurva] = useState<CarteiraCurva>('B');
  const [mostrarClientesVisitaPendente, setMostrarClientesVisitaPendente] = useState(false);
  const [prospectModalOpen, setProspectModalOpen] = useState(false);
  const [prospectForm, setProspectForm] = useState<ProspectClienteForm>(EMPTY_PROSPECT_CLIENTE_FORM);
  const [savingProspect, setSavingProspect] = useState(false);
  const [loadingEditData, setLoadingEditData] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [segmentos, setSegmentos] = useState<SegmentoOption[]>([]);
  const [clientesEmAlertaQueda, setClientesEmAlertaQueda] = useState<Set<number>>(new Set());
  const [clientesComAlertasInteligentes, setClientesComAlertasInteligentes] = useState<Set<number>>(new Set());
  const [temperaturaByCliente, setTemperaturaByCliente] = useState<Record<number, { temperatura: string; score: number }>>({});
  const [temperaturaPopover, setTemperaturaPopover] = useState<Cliente | null>(null);
  const [carteiraKpiClientes, setCarteiraKpiClientes] = useState<Cliente[]>([]);
  const [loadingCarteiraKpis, setLoadingCarteiraKpis] = useState(false);
  const [filters, setFilters] = useState<CarteiraFilters>({
    busca: '',
    segmento: '',
    ramoCliente: '',
    status: '',
    cidade: '',
    uf: '',
  });
  const [debouncedFilters, setDebouncedFilters] = useState<CarteiraFilters>(filters);
  const [sortBy, setSortBy] = useState<CarteiraSort>('RANKING_ASC');
  const [clienteForm, setClienteForm] = useState({
    razaoSocial: '',
    nomeFantasia: '',
    cnpj: '',
    cidade: '',
    uf: '',
    segmento: '',
    telefone: '',
    email: '',
    endereco: '',
  });
  const pageSize = 10;

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedFilters(filters);
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [filters]);

  useEffect(() => {
    if (!clienteId) return;
    setTab('CARTEIRA');
    setPage(0);
    setFilters((prev) => ({ ...prev, busca: clienteId }));
  }, [clienteId]);

  useEffect(() => {
    if (!clienteIdHistorico) return;
    setTab('HISTORICO');
  }, [clienteIdHistorico]);

  const aplicarCurvasManuais = useCallback(async (rows: Cliente[], scopeInput: any = {}): Promise<Cliente[]> => {
    if (!rows.length) return rows;

    const curvasRows = await callSF(SF.listarCurvasMinhaCarteira, scopeInput);
    if (!curvasRows.length) return rows;

    const curvaByClienteId = new Map<number, CarteiraCurva>();
    for (const row of curvasRows) {
      const idCliente = Number(row.ID_CLIENTE);
      const curva = String(row.CURVA || '').trim().toUpperCase();
      if (!Number.isFinite(idCliente)) continue;
      if (!CURVA_OPTIONS.includes(curva as CarteiraCurva)) continue;
      curvaByClienteId.set(idCliente, curva as CarteiraCurva);
    }

    if (curvaByClienteId.size === 0) return rows;

    return rows.map((cliente) => {
      const curvaManual = curvaByClienteId.get(Number(cliente.ID));
      return curvaManual ? { ...cliente, RANKING: curvaManual } : cliente;
    });
  }, []);

  const carregarEscopos = useCallback(async () => {
    const segmentoRows = await callSF(SF.listarSegmentosClientes);

    const segmentosOpts = (segmentoRows || [])
      .map((row) => {
        const nome = String(row.NOME || '').trim();
        return {
          value: nome,
          label: nome,
        };
      })
      .filter((row) => row.value);

    setSegmentos(segmentosOpts);
  }, []);

  const carregarAlertasQueda = useCallback(async () => {
    if (coordinatorScope.loadingScope) return;

    const rows = await callSF(SF.alertasQuedaVolume, coordinatorScope.scopeParams);
    const ids = new Set<number>();
    (rows || []).forEach((row: ClienteAlertaRow) => {
      const idCliente = Number(row.ID_CLIENTE || 0);
      if (Number.isFinite(idCliente) && idCliente > 0) {
        ids.add(idCliente);
      }
    });
    setClientesEmAlertaQueda(ids);
  }, [coordinatorScope.loadingScope, coordinatorScope.scopeParams]);

  const carregarTemperaturaClientes = useCallback(async () => {
    if (coordinatorScope.loadingScope) return;

    const rows = await callSF(SF.temperaturaClientesCarteira, coordinatorScope.scopeParams);
    const nextMap: Record<number, { temperatura: string; score: number }> = {};
    (rows || []).forEach((row: TemperaturaClienteRow) => {
      const idCliente = Number(row.ID_CLIENTE || 0);
      if (!Number.isFinite(idCliente) || idCliente <= 0) return;
      nextMap[idCliente] = {
        temperatura: String(row.TEMPERATURA || 'Frio'),
        score: Number(row.SCORE_TOTAL || 0),
      };
    });
    setTemperaturaByCliente(nextMap);
  }, [coordinatorScope.loadingScope, coordinatorScope.scopeParams]);

  const carregarAlertasInteligentes = useCallback(async () => {
    if (coordinatorScope.loadingScope) return;

    const rows = await callSF(SF.alertasInteligentesListar, { somenteNaoLidos: 'true', limite: '200', ...coordinatorScope.scopeParams });
    const ids = new Set<number>();
    (rows || []).forEach((row: ClienteAlertaRow) => {
      const idCliente = Number(row.ID_CLIENTE || 0);
      if (Number.isFinite(idCliente) && idCliente > 0) ids.add(idCliente);
    });
    setClientesComAlertasInteligentes(ids);
  }, [coordinatorScope.loadingScope, coordinatorScope.scopeParams]);

  const carregarKpisCarteira = useCallback(async () => {
    if (coordinatorScope.loadingScope) return;
    setLoadingCarteiraKpis(true);
    try {
      const allRows: Cliente[] = [];
      let offset = 0;

      while (offset < CARTEIRA_KPI_MAX_OFFSET) {
        const rows = await callSF(SF.minhaCarteiraClientesRanking, {
          busca: debouncedFilters.busca,
          idBu: '',
          segmento: debouncedFilters.segmento,
          ramoCliente: debouncedFilters.ramoCliente,
          status: debouncedFilters.status,
          cidade: debouncedFilters.cidade,
          uf: debouncedFilters.uf,
          ...coordinatorScope.scopeParams,
          limit: String(CARTEIRA_KPI_PAGE_SIZE),
          offset: String(offset),
        }) as Cliente[];

        allRows.push(...rows);

        if (rows.length < CARTEIRA_KPI_PAGE_SIZE) break;
        offset += CARTEIRA_KPI_PAGE_SIZE;
      }

      const carteiraComCurvaManual = await aplicarCurvasManuais(allRows, coordinatorScope.scopeParams);
      setCarteiraKpiClientes(carteiraComCurvaManual);
    } catch (error) {
      console.error(error);
      setCarteiraKpiClientes([]);
    } finally {
      setLoadingCarteiraKpis(false);
    }
  }, [aplicarCurvasManuais, coordinatorScope.loadingScope, coordinatorScope.scopeParams, debouncedFilters]);

  const segmentoOptionsEdicao = useMemo(() => {
    const currentValue = String(clienteForm.segmento || '').trim();
    const options = [...segmentos];

    if (currentValue && !options.some((option) => option.value === currentValue)) {
      options.push({ value: currentValue, label: `${currentValue} (atual)` });
    }

    return [
      { value: '', label: 'Selecione um segmento' },
      ...options,
    ];
  }, [clienteForm.segmento, segmentos]);

  const updateFilter = useCallback((key: keyof CarteiraFilters, value: string) => {
    setPage(0);
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setPage(0);
    setFilters({
      busca: '',
      segmento: '',
      ramoCliente: '',
      status: '',
      cidade: '',
      uf: '',
    });
  }, []);

  const load = useCallback(async () => {
    if (tab === 'HISTORICO') return;
    if (tab === 'CARTEIRA' && coordinatorScope.loadingScope) return;

    if (tab === 'CARTEIRA') {
      const buscaInteligente = debouncedFilters.busca.trim();
      const commonInput = {
        busca: buscaInteligente ? '' : debouncedFilters.busca,
        idBu: '',
        segmento: debouncedFilters.segmento,
        ramoCliente: debouncedFilters.ramoCliente,
        status: debouncedFilters.status,
        cidade: debouncedFilters.cidade,
        uf: debouncedFilters.uf,
        ...coordinatorScope.scopeParams,
      };

      if (buscaInteligente) {
        const candidatos: Cliente[] = [];
        let offset = 0;

        while (offset < CARTEIRA_KPI_MAX_OFFSET) {
          const rows = await callSF(SF.minhaCarteiraClientesRanking, {
            ...commonInput,
            limit: String(CARTEIRA_KPI_PAGE_SIZE),
            offset: String(offset),
          }) as Cliente[];

          candidatos.push(...rows);
          if (rows.length < CARTEIRA_KPI_PAGE_SIZE) break;
          offset += CARTEIRA_KPI_PAGE_SIZE;
        }

        const fuzzyMatches = candidatos
          .map((cliente) => ({ cliente, score: getClienteSearchScore(cliente, buscaInteligente) }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .map(({ cliente }) => cliente);

        const pageRows = fuzzyMatches.slice(page * pageSize, (page + 1) * pageSize);
        const carteiraComCurvaManual = await aplicarCurvasManuais(pageRows, coordinatorScope.scopeParams);
        setClientes(carteiraComCurvaManual);
        setTotal(fuzzyMatches.length);
        return;
      }

      const countRow = await callSFSingle(SF.contarMinhaCarteiraClientes, commonInput);
      const totalCarteira = countRow ? Number(countRow.TOTAL) : 0;

      if (totalCarteira === 0) {
        setClientes([]);
        setTotal(0);
        return;
      }

      const rankingResult = await callSFWithMeta(SF.minhaCarteiraClientesRanking, {
        ...commonInput,
        limit: String(pageSize),
        offset: String(page * pageSize),
      });

      let carteiraRows = rankingResult.rows as Cliente[];
      const carteiraTotal = totalCarteira;

      if (carteiraRows.length === 0 && totalCarteira > 0) {
        const fallbackResult = await callSFWithMeta(SF.minhaCarteiraClientes, {
          busca: debouncedFilters.busca,
          idBu: '',
          ...coordinatorScope.scopeParams,
          limit: String(pageSize),
          offset: String(page * pageSize),
        });

        const fallbackRows = fallbackResult.rows as Cliente[];
        carteiraRows = fallbackRows.filter((c) => {
          if (debouncedFilters.busca && getClienteSearchScore(c, debouncedFilters.busca) === 0) return false;
          if (debouncedFilters.segmento && String(c.SEGMENTO || '') !== debouncedFilters.segmento) return false;
          if (debouncedFilters.ramoCliente && String(c.RAMO_CLIENTE || 'Sem ramo') !== debouncedFilters.ramoCliente) return false;
          if (debouncedFilters.status && String(c.STATUS || '') !== debouncedFilters.status) return false;
          if (debouncedFilters.cidade && !String(c.CIDADE || '').toLowerCase().includes(debouncedFilters.cidade.toLowerCase())) return false;
          if (debouncedFilters.uf && String(c.UF || '').toUpperCase() !== debouncedFilters.uf.toUpperCase()) return false;
          return true;
        });
      }

      const carteiraComCurvaManual = await aplicarCurvasManuais(carteiraRows, coordinatorScope.scopeParams);
      setClientes(carteiraComCurvaManual);
      setTotal(carteiraTotal);
      return;
    }

    const buscaInteligenteDisponiveis = debouncedFilters.busca.trim();
    const filtroBase = {
      busca: buscaInteligenteDisponiveis ? '' : debouncedFilters.busca,
      segmento: '',
      ramoCliente: '',
      status: '',
      cidade: '',
      uf: '',
    };

    const listInput = {
      ...filtroBase,
      codFilial: '',
      idSecao: '',
      limit: String(pageSize),
      offset: String(page * pageSize),
    };

    if (buscaInteligenteDisponiveis) {
      const candidatos: Cliente[] = [];
      let offset = 0;

      while (offset < CARTEIRA_KPI_MAX_OFFSET) {
        const rows = await callSF(SF.listarClientesDisponiveisMinhaBu, {
          ...filtroBase,
          codFilial: '',
          idSecao: '',
          limit: String(CARTEIRA_KPI_PAGE_SIZE),
          offset: String(offset),
        }) as Cliente[];

        candidatos.push(...rows);
        if (rows.length < CARTEIRA_KPI_PAGE_SIZE) break;
        offset += CARTEIRA_KPI_PAGE_SIZE;
      }

      const fuzzyMatches = candidatos
        .map((cliente) => ({ cliente, score: getClienteSearchScore(cliente, buscaInteligenteDisponiveis) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .map(({ cliente }) => cliente);

      setTotal(fuzzyMatches.length);
      setClientes(fuzzyMatches.slice(page * pageSize, (page + 1) * pageSize));
      return;
    }

    const [countRow, dedupRows] = await Promise.all([
      callSFSingle(SF.contarClientesDisponiveisMinhaBu, listInput),
      callSF(SF.listarClientesDisponiveisMinhaBu, listInput) as Promise<Cliente[]>,
    ]);

    setTotal(countRow ? Number(countRow.TOTAL || 0) : dedupRows.length);

    if (dedupRows.length === 0) {
      setClientes([]);
      return;
    }

    const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
    const sortedMerged = dedupRows.sort((a, b) => {
      const nameA = a.NOME_FANTASIA || a.RAZAO_SOCIAL || '';
      const nameB = b.NOME_FANTASIA || b.RAZAO_SOCIAL || '';
      return collator.compare(nameA, nameB);
    });

    setClientes(sortedMerged);
  }, [aplicarCurvasManuais, coordinatorScope.loadingScope, coordinatorScope.scopeParams, debouncedFilters, page, tab]);

  useEffect(() => {
    if (tab !== 'CARTEIRA') return;
    setPage(0);
    setClientes([]);
    setTotal(0);
    setCarteiraKpiClientes([]);
  }, [coordinatorScope.scopeParams, tab]);

  useEffect(() => {
    carregarEscopos();
  }, [carregarEscopos]);

  useEffect(() => {
    if (tab !== 'CARTEIRA') return;
    carregarAlertasQueda();
  }, [carregarAlertasQueda, tab]);

  useEffect(() => {
    if (tab !== 'CARTEIRA') return;
    carregarTemperaturaClientes();
  }, [carregarTemperaturaClientes, tab]);

  useEffect(() => {
    if (tab !== 'CARTEIRA') return;
    carregarAlertasInteligentes();
  }, [carregarAlertasInteligentes, tab]);

  useEffect(() => {
    if (tab !== 'CARTEIRA') return;
    carregarKpisCarteira();
  }, [carregarKpisCarteira, tab]);

  useEffect(() => {
    if (filters !== debouncedFilters) return;
    load();
  }, [debouncedFilters, filters, load]);

  async function adicionarNaMinhaCarteira(cliente: Cliente) {
    const clienteId = Number(cliente.ID);
    const codFilial = String(cliente.CODFILIAL || '').trim();
    const idSecao = String(cliente.ID_SECAO || '').trim();
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      console.warn('Cliente sem ID válido para inclusão na carteira.', { cliente });
      addToast('error', 'Não foi possível identificar o cliente para inclusão na carteira.');
      return;
    }

    setAddingClientId(clienteId);
    try {
      const validacao = await callSFSingle(SF.adicionarClienteMinhaCarteira, {
        clienteId: String(clienteId),
        codFilial,
        idSecao,
      });

      const statusValidacao = String(validacao?.STATUS || '').trim();
      const mensagemValidacao = String(validacao?.MESSAGE || '').trim();

      if (!validacao || statusValidacao === '') {
        console.warn('Validação de carteira sem retorno reconhecido.', {
          clienteId,
          codFilial,
          idSecao,
          validacao,
        });
        addToast('error', 'Não foi possível validar a disponibilidade do cliente para sua carteira.');
        return;
      }

      if (statusValidacao !== 'SUCCESS') {
        addToast('error', getCarteiraErrorMessage(statusValidacao, mensagemValidacao));
        return;
      }

      const insercaoOk = await callSFMutation(SF.inserirClienteMinhaCarteira, {
        clienteId: String(clienteId),
        codFilial,
        idSecao,
      });

      if (!insercaoOk) {
        const posInsercao = await callSFSingle(SF.adicionarClienteMinhaCarteira, {
          clienteId: String(clienteId),
          codFilial,
          idSecao,
        });

        const statusPosInsercao = String(posInsercao?.STATUS || '').trim();
        const mensagemPosInsercao = String(posInsercao?.MESSAGE || '').trim();

        if (statusPosInsercao !== 'JA_NA_SUA_CARTEIRA') {
          console.warn('Inserção de carteira não confirmada após tentativa.', {
            clienteId,
            codFilial,
            idSecao,
            posInsercao,
          });
          addToast(
            'error',
            getCarteiraErrorMessage(statusPosInsercao, mensagemPosInsercao || 'Não foi possível confirmar a inclusão do cliente na sua carteira.'),
          );
          return;
        }
      }

      addToast('success', 'Cliente adicionado à sua carteira com sucesso.');
      await load();
    } catch (error) {
      console.error(error);
      addToast('error', 'Falha ao adicionar cliente na sua carteira.');
    } finally {
      setAddingClientId(null);
    }
  }

  async function abrirEdicaoCliente(cliente: Cliente) {
    setEditingClienteId(cliente.ID);
    setLoadingEditData(true);
    setEditingCurva((CURVA_OPTIONS.includes(String(cliente.RANKING || '').toUpperCase() as CarteiraCurva)
      ? String(cliente.RANKING || '').toUpperCase()
      : 'B') as CarteiraCurva);
    setClienteForm({
      razaoSocial: cliente.RAZAO_SOCIAL || '',
      nomeFantasia: cliente.NOME_FANTASIA || '',
      cnpj: cliente.CNPJ || '',
      cidade: cliente.CIDADE || '',
      uf: cliente.UF || '',
      segmento: cliente.SEGMENTO || '',
      telefone: cliente.TELEFONE || '',
      email: cliente.EMAIL || '',
      endereco: cliente.ENDERECO || '',
    });

    try {
      const [record, curvasRows] = await Promise.all([
        getRecordMitra({
          projectId,
          tableName: 'CLIENTES',
          id: cliente.ID,
        }),
        callSF(SF.listarCurvasMinhaCarteira, coordinatorScope.scopeParams),
      ]);
      const data = (record as { result?: Record<string, unknown> })?.result || {};
      setClienteForm({
        razaoSocial: String(data.RAZAO_SOCIAL ?? cliente.RAZAO_SOCIAL ?? ''),
        nomeFantasia: String(data.NOME_FANTASIA ?? cliente.NOME_FANTASIA ?? ''),
        cnpj: String(data.CNPJ ?? cliente.CNPJ ?? ''),
        cidade: String(data.CIDADE ?? cliente.CIDADE ?? ''),
        uf: String(data.UF ?? cliente.UF ?? ''),
        segmento: String(data.SEGMENTO ?? cliente.SEGMENTO ?? ''),
        telefone: String(data.TELEFONE ?? cliente.TELEFONE ?? ''),
        email: String(data.EMAIL ?? cliente.EMAIL ?? ''),
        endereco: String(data.ENDERECO ?? cliente.ENDERECO ?? ''),
      });

      const curvaAtual = (curvasRows || []).find((row) => Number(row.ID_CLIENTE) === Number(cliente.ID));
      const curvaValor = String(curvaAtual?.CURVA || '').trim().toUpperCase();
      if (CURVA_OPTIONS.includes(curvaValor as CarteiraCurva)) {
        setEditingCurva(curvaValor as CarteiraCurva);
      }
    } catch (error) {
      console.error(error);
      addToast('error', 'Não foi possível carregar todos os dados do cliente.');
    } finally {
      setLoadingEditData(false);
    }
  }

  function fecharEdicaoCliente() {
    if (savingEdit) return;
    setEditingClienteId(null);
  }

  async function salvarEdicaoCliente() {
    if (!editingClienteId) return;

    setSavingEdit(true);
    try {
      const ok = await callSFMutation(SF.clienteAtualizarCarteira, {
        clienteId: String(editingClienteId),
        razaoSocial: clienteForm.razaoSocial.trim(),
        nomeFantasia: clienteForm.nomeFantasia,
        cnpj: clienteForm.cnpj,
        cidade: clienteForm.cidade.trim(),
        uf: clienteForm.uf.trim().toUpperCase().slice(0, 2),
        segmento: clienteForm.segmento.trim(),
        telefone: clienteForm.telefone.trim(),
        email: clienteForm.email.trim(),
        endereco: clienteForm.endereco.trim(),
      });

      if (!ok) {
        addToast('error', 'Não foi possível atualizar os dados do cliente.');
        return;
      }

      const okCurva = await callSFMutation(SF.atualizarCurvaClienteCarteira, {
        clienteId: String(editingClienteId),
        curva: editingCurva,
      });

      if (!okCurva) {
        addToast('error', 'Os dados foram salvos, mas não foi possível atualizar a curva do cliente.');
        return;
      }

      addToast('success', 'Dados do cliente atualizados com sucesso.');
      setEditingClienteId(null);
      await load();
      await carregarKpisCarteira();
    } catch (error) {
      console.error(error);
      addToast('error', 'Falha ao salvar alterações do cliente.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function removerDaMinhaCarteira(cliente: Cliente) {
    const nomeCliente = cliente.NOME_FANTASIA || cliente.RAZAO_SOCIAL || 'este cliente';
    const confirmed = window.confirm(`Deseja remover ${nomeCliente} da sua carteira?`);
    if (!confirmed) return;

    setRemovingClientId(cliente.ID);
    try {
      const ok = await callSFMutation(SF.removerClienteMinhaCarteira, {
        clienteId: String(cliente.ID),
      });

      if (!ok) {
        addToast('error', 'Não foi possível remover o cliente da sua carteira.');
        return;
      }

      addToast('success', 'Cliente removido da sua carteira com sucesso.');
      await load();
      await carregarKpisCarteira();
    } catch (error) {
      console.error(error);
      addToast('error', 'Falha ao remover cliente da sua carteira.');
    } finally {
      setRemovingClientId(null);
    }
  }

  function fecharProspectModal() {
    if (savingProspect) return;
    setProspectModalOpen(false);
  }

  async function salvarClienteProspecto() {
    if (!prospectForm.razaoSocial.trim()) {
      addToast('error', 'Informe a razão social ou nome do cliente prospecto.');
      return;
    }

    setSavingProspect(true);
    try {
      const usuario = await callSFSingle(SF.dadosUsuarioLogado, {});
      const ok = await callSFMutation(SF.prospectsCriar, {
        razaoSocial: sanitizeProspectField(prospectForm.razaoSocial || prospectForm.nomeFantasia, 300),
        nomeFantasia: sanitizeProspectField(prospectForm.nomeFantasia, 300),
        cnpj: sanitizeProspectField(prospectForm.cnpj, 20),
        segmento: sanitizeProspectField(prospectForm.segmento, 120),
        porte: sanitizeProspectField(prospectForm.porte, 60),
        origem: sanitizeProspectField(prospectForm.origem, 100),
        cidade: sanitizeProspectField(prospectForm.cidade, 160),
        uf: sanitizeProspectField(prospectForm.uf, 2).toUpperCase(),
        endereco: '',
        potencial: Number(prospectForm.potencial || 0),
        probabilidade: Number(prospectForm.probabilidade || 10),
        observacoes: sanitizeProspectField(prospectForm.observacoes, 8000),
        contatoNome: sanitizeProspectField(prospectForm.contatoNome, 200),
        contatoCargo: sanitizeProspectField(prospectForm.contatoCargo, 120),
        contatoTelefone: sanitizeProspectField(prospectForm.contatoTelefone, 40),
        contatoEmail: sanitizeProspectField(prospectForm.contatoEmail, 200),
        userId: usuario?.ID || usuario?.USER_ID || usuario?.userId || null,
        criadoEm: getBrasiliaTimestamp(),
      });

      if (!ok) {
        addToast('error', 'Não foi possível criar o cliente prospecto.');
        return;
      }

      addToast('success', 'Cliente prospecto criado. Ele já pode ser usado em visitas de prospecção na agenda.');
      setProspectForm(EMPTY_PROSPECT_CLIENTE_FORM);
      setProspectModalOpen(false);
    } catch (error) {
      console.error(error);
      addToast('error', 'Falha ao criar cliente prospecto.');
    } finally {
      setSavingProspect(false);
    }
  }

  function abrirDetalheTemperatura(cliente: Cliente) {
    setTemperaturaPopover(cliente);
  }

  const kpis = useMemo(() => {
    if (tab !== 'CARTEIRA') {
      return {
        baseTotal: 0,
        ativos: 0,
        coberturaAtivos: 0,
        clientesSemVisitaCritica: 0,
        receitaMesAtual: 0,
        receitaCobertura: 0,
        ticketMedioMesAtual: 0,
        scoreMedio: null,
        scoreBase: 0,
      };
    }

    const kpiClientes = dedupeClientesById(tab === 'CARTEIRA' ? carteiraKpiClientes : clientes);
    const baseTotal = kpiClientes.length;
    const ativos = kpiClientes.filter((c) => String(c.STATUS || '').toUpperCase() === 'ATIVO').length;
    const clientesSemVisitaCritica = kpiClientes.filter((c) => {
      const diasSemVisita = parseFiniteNumber(c.DIAS_SEM_VISITA);
      const limiteDias = getLimiteDiasSemVisitaPorCurva(c.RANKING);
      return diasSemVisita !== null && limiteDias !== null && diasSemVisita >= limiteDias;
    }).length;
    const receitaMesAtual = kpiClientes.reduce(
      (sum, cliente) => sum + (parseFiniteNumber(cliente.COMPRAS_MES_ATUAL) ?? parseFiniteNumber(cliente.COMPRAS_90D) ?? 0),
      0,
    );
    const scoreValues = kpiClientes
      .map((cliente) => parseFiniteNumber(cliente.SCORE_RANKING))
      .filter((value): value is number => value !== null);

    return {
      baseTotal,
      ativos,
      coberturaAtivos: baseTotal > 0 ? Math.min(100, Math.round((ativos / baseTotal) * 100)) : 0,
      clientesSemVisitaCritica,
      receitaMesAtual,
      receitaCobertura: baseTotal > 0 ? Math.min(100, Math.round((receitaMesAtual / (baseTotal * 30000)) * 100)) : 0,
      ticketMedioMesAtual: ativos > 0 ? receitaMesAtual / ativos : 0,
      scoreMedio: scoreValues.length > 0
        ? scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length
        : null,
      scoreBase: scoreValues.length,
    };
  }, [carteiraKpiClientes, clientes, tab]);

  const clientesVisitaPendente = useMemo(() => {
    if (tab !== 'CARTEIRA') return [];

    const source = carteiraKpiClientes.length > 0 ? carteiraKpiClientes : clientes;
    return source
      .filter((cliente) => {
        const diasSemVisita = parseFiniteNumber(cliente.DIAS_SEM_VISITA);
        const limiteDias = getLimiteDiasSemVisitaPorCurva(cliente.RANKING);
        return diasSemVisita !== null && limiteDias !== null && diasSemVisita >= limiteDias;
      })
      .sort((a, b) => {
        const diasA = parseFiniteNumber(a.DIAS_SEM_VISITA) ?? 0;
        const diasB = parseFiniteNumber(b.DIAS_SEM_VISITA) ?? 0;
        return diasB - diasA;
      });
  }, [carteiraKpiClientes, clientes, tab]);

  const ramoDistribuicao = useMemo<RamoDistribuicaoItem[]>(() => {
    if (tab !== 'CARTEIRA') return [];

    const source = carteiraKpiClientes.length > 0 ? carteiraKpiClientes : clientes;
    const countByRamo = new Map<string, number>();

    source.forEach((cliente) => {
      const ramo = String(cliente.RAMO_CLIENTE || cliente.SEGMENTO || '').trim() || 'Sem ramo';
      countByRamo.set(ramo, (countByRamo.get(ramo) || 0) + 1);
    });

    return Array.from(countByRamo.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'pt-BR'));
  }, [carteiraKpiClientes, clientes, tab]);

  const loadingRamoDistribuicao = loadingCarteiraKpis && ramoDistribuicao.length === 0;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const visiblePageIndexes = useMemo(() => {
    if (totalPages <= 3) return Array.from({ length: totalPages }, (_, idx) => idx);
    if (page <= 1) return [0, 1, 2];
    if (page >= totalPages - 2) return [totalPages - 3, totalPages - 2, totalPages - 1];
    return [page - 1, page, page + 1];
  }, [page, totalPages]);
  const paginationStart = total === 0 ? 0 : (page * pageSize) + 1;
  const paginationEnd = total === 0 ? 0 : Math.min((page + 1) * pageSize, total);

  const sortedRows = useMemo(() => {
    const mappedRows = clientes.map((c, idx) => {
      const diasSemVisitaParsed = Number(c.DIAS_SEM_VISITA);
      const diasSemVisita = Number.isFinite(diasSemVisitaParsed) ? diasSemVisitaParsed : null;
      const ultimaCompraParsed = Number(c.DIAS_ULTIMA_COMPRA);
      const ultimaCompra = Number.isFinite(ultimaCompraParsed) ? ultimaCompraParsed : null;
      const rank = (c.RANKING && ['A', 'B', 'C', 'D'].includes(c.RANKING))
        ? c.RANKING
        : (diasSemVisita === null ? 'B' : diasSemVisita <= 8 ? 'A' : diasSemVisita <= 20 ? 'B' : 'C');
      const status: 'Ativo' | 'Risco' | 'Crítico' = rank === 'A' ? 'Ativo' : rank === 'B' ? 'Risco' : 'Crítico';
      const tempInfo = temperaturaByCliente[Number(c.ID)] || { temperatura: 'Frio', score: 0 };
      return {
        ...c,
        rowIndex: idx + 1,
        diasSemVisita,
        ultimaCompra,
        rank,
        status,
        temperatura: tempInfo.temperatura,
        scoreTemperatura: tempInfo.score,
      };
    });

    const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

    const busca = debouncedFilters.busca.trim();

    if (busca) {
      return [...mappedRows]
        .map((row) => ({ row, score: getClienteSearchScore(row, busca) }))
        .sort((a, b) => {
          const scoreDiff = b.score - a.score;
          if (scoreDiff !== 0) return scoreDiff;
          return collator.compare(a.row.NOME_FANTASIA || a.row.RAZAO_SOCIAL || '', b.row.NOME_FANTASIA || b.row.RAZAO_SOCIAL || '');
        })
        .map(({ row }) => row);
    }

    if (tab === 'DISPONIVEIS') {
      return [...mappedRows].sort((a, b) => {
        return collator.compare(a.NOME_FANTASIA || a.RAZAO_SOCIAL || '', b.NOME_FANTASIA || b.RAZAO_SOCIAL || '');
      });
    }

    const rankingWeight: Record<'A' | 'B' | 'C' | 'D', number> = { A: 1, B: 2, C: 3, D: 4 };
    const statusWeight: Record<'Ativo' | 'Risco' | 'Crítico', number> = { Ativo: 1, Risco: 2, Crítico: 3 };

    return [...mappedRows].sort((a, b) => {
      switch (sortBy) {
        case 'NOME_ASC':
          return collator.compare(a.NOME_FANTASIA || a.RAZAO_SOCIAL || '', b.NOME_FANTASIA || b.RAZAO_SOCIAL || '');
        case 'NOME_DESC':
          return collator.compare(b.NOME_FANTASIA || b.RAZAO_SOCIAL || '', a.NOME_FANTASIA || a.RAZAO_SOCIAL || '');
        case 'RANKING_ASC':
          return rankingWeight[a.rank] - rankingWeight[b.rank];
        case 'RANKING_DESC':
          return rankingWeight[b.rank] - rankingWeight[a.rank];
        case 'STATUS_ASC':
          return statusWeight[a.status] - statusWeight[b.status];
        case 'STATUS_DESC':
          return statusWeight[b.status] - statusWeight[a.status];
        case 'DIAS_VISITA_ASC':
          return (a.diasSemVisita ?? Number.POSITIVE_INFINITY) - (b.diasSemVisita ?? Number.POSITIVE_INFINITY);
        case 'DIAS_VISITA_DESC':
          return (b.diasSemVisita ?? Number.NEGATIVE_INFINITY) - (a.diasSemVisita ?? Number.NEGATIVE_INFINITY);
        default:
          return 0;
      }
    });
  }, [clientes, debouncedFilters.busca, sortBy, tab, temperaturaByCliente]);

  const rows = useMemo(() => {
    return sortedRows;
  }, [sortedRows]);

  const scoreCarteiraLabel = useMemo(() => {
    if (kpis.scoreMedio === null) return 'Sem dados';
    if (kpis.scoreMedio >= 70) return 'Quente';
    if (kpis.scoreMedio >= 40) return 'Morno';
    return 'Frio';
  }, [kpis.scoreMedio]);

  return (
    <div className="animate-fadeIn">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      {tab !== 'HISTORICO' ? <LegendaCarteira /> : null}
      {temperaturaPopover ? (
        <TemperaturaDetalhePopover
          clienteId={Number(temperaturaPopover.ID)}
          idVendedor={String(temperaturaPopover.ID_VENDEDOR || '')}
          codFilial={String(temperaturaPopover.CODFILIAL || '')}
          idSecao={String(temperaturaPopover.ID_SECAO || '')}
          onClose={() => setTemperaturaPopover(null)}
        />
      ) : null}

      <div className="flex items-center justify-between gap-3 mb-4 pr-0 lg:pr-36">
        <div className="flex items-center gap-8">
          <h1 className="font-display text-4xl font-extrabold" style={{ color: '#165a3a' }}>Minha Carteira</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setProspectForm(EMPTY_PROSPECT_CLIENTE_FORM);
              setProspectModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
            style={{ backgroundColor: '#17743b', color: '#ffffff' }}
          >
            <Plus size={16} /> Novo cliente prospecto
          </button>
        </div>
      </div>

      <div className="flex items-center gap-6 mb-4">
        <button
          onClick={() => { setTab('CARTEIRA'); setPage(0); }}
          className="pb-2 text-sm font-semibold"
          style={{ color: tab === 'CARTEIRA' ? '#17743b' : '#8a9287', borderBottom: tab === 'CARTEIRA' ? '2px solid #17743b' : '2px solid transparent' }}
        >
          MINHA CARTEIRA ({total})
        </button>
        <button
          onClick={() => {
            setTab('DISPONIVEIS');
            setPage(0);
            setSortBy('NOME_ASC');
            setFilters((prev) => ({
              ...prev,
              segmento: '',
              ramoCliente: '',
              status: '',
              cidade: '',
              uf: '',
            }));
          }}
          className="pb-2 text-sm font-semibold"
          style={{ color: tab === 'DISPONIVEIS' ? '#17743b' : '#8a9287', borderBottom: tab === 'DISPONIVEIS' ? '2px solid #17743b' : '2px solid transparent' }}
        >
          CLIENTES DISPONÍVEIS
        </button>
        <button
          onClick={() => { setTab('HISTORICO'); setPage(0); }}
          className="pb-2 text-sm font-semibold"
          style={{ color: tab === 'HISTORICO' ? '#17743b' : '#8a9287', borderBottom: tab === 'HISTORICO' ? '2px solid #17743b' : '2px solid transparent' }}
        >
          HISTÓRICO DO CLIENTE
        </button>
      </div>

      {tab === 'HISTORICO' ? (
        <HistoricoClientesPage />
      ) : (
        <>
      {tab === 'CARTEIRA' ? (
        <div className="mb-4">
          <CoordinatorScopeFilter scope={coordinatorScope} />
        </div>
      ) : null}

      {tab === 'CARTEIRA' ? (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
        <div className="rounded-2xl p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e4e9df' }}>
          <p className="text-[10px] label-ui font-semibold" style={{ color: '#8a9287' }}>Clientes ativos</p>
          <p className="text-4xl font-display font-extrabold mt-1" style={{ color: '#1b1c1a' }}>
            {String(kpis.ativos).padStart(2, '0')} <span className="text-sm" style={{ color: '#17743b' }}>de {kpis.baseTotal}</span>
          </p>
          <div className="mt-2 h-2 rounded-full" style={{ backgroundColor: '#dfe4dd' }}>
            <div className="h-2 rounded-full" style={{ width: `${kpis.coberturaAtivos}%`, backgroundColor: '#17743b' }} />
          </div>
          <p className="text-sm mt-2" style={{ color: '#7d857a' }}>
            {loadingCarteiraKpis && tab === 'CARTEIRA' ? 'Atualizando carteira completa...' : `${kpis.coberturaAtivos}% da base atual`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setMostrarClientesVisitaPendente((prev) => !prev)}
          className="rounded-2xl p-4 text-left transition-all duration-200 hover:-translate-y-0.5"
          style={{ backgroundColor: mostrarClientesVisitaPendente ? '#fff7f2' : '#f8faf7', border: mostrarClientesVisitaPendente ? '1px solid #f0b7a7' : '1px solid #e4e9df' }}
          title="Clique para ver os clientes com visita pendente"
        >
          <p className="text-[10px] label-ui font-semibold" style={{ color: '#8a9287' }}>Visita pendente por curva</p>
          <p className="text-4xl font-display font-extrabold mt-1" style={{ color: '#c12626' }}>{String(kpis.clientesSemVisitaCritica).padStart(2, '0')} <span className="text-sm" style={{ color: '#7d857a' }}>clientes</span></p>
          <p className="text-sm mt-2" style={{ color: '#7d857a' }}>A 8d, B 16d, C 32d, D 61d sem visita</p>
          <p className="text-xs font-semibold mt-2" style={{ color: '#c12626' }}>{mostrarClientesVisitaPendente ? 'Ocultar clientes' : 'Ver clientes'}</p>
        </button>

        <div className="rounded-2xl p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e4e9df' }}>
          <p className="text-[10px] label-ui font-semibold" style={{ color: '#8a9287' }}>Receita atual da carteira</p>
          <p className="text-3xl font-display font-extrabold mt-1" style={{ color: '#1b1c1a' }}>{formatCurrency(kpis.receitaMesAtual)}</p>
          <div className="mt-2 h-2 rounded-full" style={{ backgroundColor: '#dfe4dd' }}>
            <div className="h-2 rounded-full" style={{ width: `${kpis.receitaCobertura}%`, backgroundColor: '#2d6b62' }} />
          </div>
          <p className="text-sm mt-2" style={{ color: '#7d857a' }}>Carteira paginada 10 em 10 clientes</p>
        </div>

        <div className="rounded-2xl p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e4e9df' }}>
          <p className="text-[10px] label-ui font-semibold" style={{ color: '#8a9287' }}>Ticket médio</p>
          <p className="text-3xl font-display font-extrabold mt-1" style={{ color: '#1b1c1a' }}>{formatCurrency(kpis.ticketMedioMesAtual)}</p>
          <p className="text-sm mt-2" style={{ color: '#7d857a' }}>Receita média por cliente ativo</p>
        </div>

        <div className="rounded-2xl p-4" style={{ backgroundColor: '#2f8d2f', color: '#fff' }}>
          <p className="text-[10px] label-ui font-semibold opacity-90">Score da carteira</p>
          <p className="text-4xl font-display font-extrabold mt-1">{kpis.scoreMedio === null ? '—' : kpis.scoreMedio.toFixed(1)} <span className="text-base font-semibold">/ 100</span></p>
          <p className="text-sm mt-2 opacity-90">Temperatura: {scoreCarteiraLabel}</p>
        </div>
      </div>
      ) : null}

      {tab === 'CARTEIRA' && mostrarClientesVisitaPendente ? (
        <div className="rounded-2xl p-4 mb-4 animate-fadeIn" style={{ backgroundColor: '#fffaf6', border: '1px solid #f0d4c7' }}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] label-ui font-semibold uppercase tracking-[0.14em]" style={{ color: '#a45a45' }}>Clientes com visita pendente</p>
              <h2 className="text-xl font-display font-extrabold mt-1" style={{ color: '#3b241d' }}>{clientesVisitaPendente.length} cliente(s) acima do limite da curva</h2>
              <p className="text-sm mt-1" style={{ color: '#7d665c' }}>Ordenado por maior quantidade de dias sem visita.</p>
            </div>
            <button
              type="button"
              onClick={() => setMostrarClientesVisitaPendente(false)}
              className="h-8 w-8 rounded-full inline-flex items-center justify-center"
              style={{ backgroundColor: '#f5e8df', color: '#8a4d39' }}
              title="Fechar lista"
            >
              <X size={15} />
            </button>
          </div>

          {clientesVisitaPendente.length === 0 ? (
            <p className="text-sm" style={{ color: '#7d665c' }}>Nenhum cliente está com visita pendente pelos limites atuais.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {clientesVisitaPendente.map((cliente) => {
                const nomeCliente = cliente.NOME_FANTASIA || cliente.RAZAO_SOCIAL || 'Cliente';
                const diasSemVisita = parseFiniteNumber(cliente.DIAS_SEM_VISITA);
                const curva = String(cliente.RANKING || '—').toUpperCase();
                const limiteDias = getLimiteDiasSemVisitaPorCurva(cliente.RANKING);

                return (
                  <button
                    key={`cliente-pendente-${cliente.ID}`}
                    type="button"
                    onClick={() => {
                      setTab('HISTORICO');
                      navigate(`/clientes?clienteId=${cliente.ID}`);
                    }}
                    className="rounded-xl p-3 text-left transition-all duration-200 hover:-translate-y-0.5"
                    style={{ backgroundColor: '#ffffff', border: '1px solid #f0d4c7' }}
                    title="Abrir histórico do cliente"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold truncate" style={{ color: '#2d1e18' }}>{nomeCliente}</p>
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: '#fde8e0', color: '#b42318' }}>{curva}</span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: '#7d665c' }}>Código: {getCodigoCliente(cliente) || '—'}</p>
                    <p className="text-sm font-semibold mt-2" style={{ color: '#c12626' }}>
                      {diasSemVisita === null ? 'Sem data de visita' : `${diasSemVisita} dias sem visita`}
                    </p>
                    <p className="text-xs mt-1" style={{ color: '#8a6b5e' }}>Limite da curva: {limiteDias ?? '—'} dias</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e4e9df' }}>
        <div className={tab === 'CARTEIRA' ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3' : 'grid grid-cols-1 gap-3'}>
          <Input
            label="Busca"
            value={filters.busca}
            onChange={(e) => updateFilter('busca', e.target.value)}
            placeholder="Razão social, fantasia, CNPJ ou código"
          />
          {tab === 'CARTEIRA' ? (
            <>
              <Select
                label="Ramo"
                value={filters.ramoCliente}
                onChange={(value) => updateFilter('ramoCliente', value)}
                placeholder="Todos os ramos"
                options={RAMO_OPTIONS}
              />
              <Select
                label="Status"
                value={filters.status}
                onChange={(value) => updateFilter('status', value)}
                placeholder="Todos os status"
                options={[
                  { value: '', label: 'Todos os status' },
                  { value: 'ATIVO', label: 'Ativo' },
                  { value: 'INATIVO', label: 'Inativo' },
                  { value: 'RISCO', label: 'Em risco' },
                ]}
              />
              <Select
                label="Ordenar visualização"
                value={sortBy}
                onChange={(value) => {
                  setPage(0);
                  setSortBy(value as CarteiraSort);
                }}
                options={[
                  { value: 'RANKING_ASC', label: 'Ranking (A para D)' },
                  { value: 'RANKING_DESC', label: 'Ranking (D para A)' },
                  { value: 'NOME_ASC', label: 'Nome (A para Z)' },
                  { value: 'NOME_DESC', label: 'Nome (Z para A)' },
                  { value: 'STATUS_ASC', label: 'Status (Ativo para Crítico)' },
                  { value: 'STATUS_DESC', label: 'Status (Crítico para Ativo)' },
                  { value: 'DIAS_VISITA_ASC', label: 'Dias sem visita (menor primeiro)' },
                  { value: 'DIAS_VISITA_DESC', label: 'Dias sem visita (maior primeiro)' },
                ]}
              />
            </>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {tab === 'DISPONIVEIS' ? (
              filters.busca ? (
                <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: '#e9f5ed', color: '#17743b' }}>Busca: {filters.busca}</span>
              ) : (
                <span className="text-sm" style={{ color: '#6f786d' }}>Busque pelo cliente e adicione à carteira. A listagem segue paginada de 10 em 10.</span>
              )
            ) : filters.busca || filters.ramoCliente || filters.status ? (
              <>
                {filters.busca ? <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: '#e9f5ed', color: '#17743b' }}>Busca: {filters.busca}</span> : null}
                {filters.ramoCliente ? <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: '#eef6ef', color: '#2d6f43' }}>Ramo: {filters.ramoCliente}</span> : null}
                {filters.status ? <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: '#fff4dc', color: '#a26a00' }}>Status: {filters.status}</span> : null}
              </>
            ) : (
              <span className="text-sm" style={{ color: '#6f786d' }}>Use os filtros para refinar a carteira sem perder a paginação.</span>
            )}
          </div>
          <button
            onClick={clearFilters}
            className="px-3 py-2 rounded-full text-sm font-semibold"
            style={{ backgroundColor: '#edf1e9', color: '#5f6a5d' }}
          >
            Limpar filtros
          </button>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden mb-4" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
        {tab === 'DISPONIVEIS' ? (
          <div className="grid grid-cols-12 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: '#7c8579', backgroundColor: '#ffffff', borderBottom: '1px solid #e4e9df' }}>
            <div className="col-span-1">Curva</div>
            <div className="col-span-6">Cliente</div>
            <div className="col-span-3">Ramo</div>
            <div className="col-span-2 text-right">Ação</div>
          </div>
        ) : (
          <div className="grid grid-cols-12 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: '#7c8579', backgroundColor: '#ffffff', borderBottom: '1px solid #e4e9df' }}>
            <div className="col-span-1">Curva</div>
            <div className="col-span-4">Cliente / Razão Social</div>
            <div className="col-span-2">Ramo</div>
            <div className="col-span-1">Dias sem visita</div>
            <div className="col-span-1">Última compra</div>
            <div className="col-span-1">Temp.</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1 text-right">Ações</div>
          </div>
        )}

        {rows.map(r => {
          const emAlertaQueda = clientesEmAlertaQueda.has(Number(r.ID));
          const temAlertaInteligente = clientesComAlertasInteligentes.has(Number(r.ID));
          const nomeCliente = r.NOME_FANTASIA || r.RAZAO_SOCIAL || 'Cliente';
          const codigoCliente = getCodigoCliente(r);
          if (tab === 'DISPONIVEIS') {
            return (
              <div key={r.ID} className="grid grid-cols-12 px-4 py-3 items-center" style={{ borderTop: '1px solid #eef2eb', backgroundColor: '#fff' }}>
                <div className="col-span-1">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: r.rank === 'A' ? '#e7f6ea' : r.rank === 'B' ? '#eef0e9' : '#f2f0ec', color: r.rank === 'A' ? '#17743b' : r.rank === 'B' ? '#5f705d' : '#8a9287' }}>
                    {r.rank}
                  </span>
                </div>
                <div className="col-span-6 min-w-0 pr-3">
                  <p className="text-base font-semibold" style={{ color: '#1b1c1a' }} title={nomeCliente}>{formatClienteNomeCurto(nomeCliente)}</p>
                  <p className="text-sm mt-0.5" style={{ color: '#7a8379' }}>Código: {codigoCliente || '—'}</p>
                </div>
                <div className="col-span-3">
                  <span className="text-sm font-medium" style={{ color: '#4f5b4d' }}>{r.RAMO_CLIENTE || 'Sem ramo'}</span>
                </div>
                <div className="col-span-2 text-right">
                  <button
                    onClick={() => adicionarNaMinhaCarteira(r)}
                    disabled={addingClientId === r.ID}
                    className="h-8 px-3 rounded-full text-xs font-semibold inline-flex items-center gap-1"
                    style={{
                      backgroundColor: addingClientId === r.ID ? '#dfe7dd' : '#17743b',
                      color: addingClientId === r.ID ? '#5a6657' : '#ffffff',
                    }}
                    title="Adicionar cliente à minha carteira"
                  >
                    <Plus size={13} />
                    {addingClientId === r.ID ? 'Adicionando...' : 'Adicionar'}
                  </button>
                </div>
              </div>
            );
          }

          return (
          <div key={r.ID} className="grid grid-cols-12 px-4 py-3 items-center" style={{ borderTop: '1px solid #eef2eb', backgroundColor: '#fff' }}>
            <div className="col-span-1">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: r.rank === 'A' ? '#e7f6ea' : r.rank === 'B' ? '#eef0e9' : '#f2f0ec', color: r.rank === 'A' ? '#17743b' : r.rank === 'B' ? '#5f705d' : '#8a9287' }}>
                {r.rank}
              </span>
            </div>
            <div className="col-span-4 min-w-0 pr-3">
              <div className="flex items-center gap-2">
                <p className="text-base font-semibold" style={{ color: '#1b1c1a' }} title={nomeCliente}>{formatClienteNomeCurto(nomeCliente)}</p>
                {temAlertaInteligente ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/alertas?clienteId=${r.ID}`)}
                    className="w-7 h-7 rounded-full inline-flex items-center justify-center"
                    style={{ backgroundColor: '#fde8e8', color: '#b42318' }}
                    title="Ver alertas inteligentes deste cliente"
                  >
                    <Bell size={14} />
                  </button>
                ) : null}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-sm" style={{ color: '#7a8379' }}>Código: {codigoCliente || '—'}</p>
                {emAlertaQueda ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: '#fde8e8', color: '#b42318' }}>
                    Queda
                  </span>
                ) : null}
              </div>
            </div>
            <div className="col-span-2">
              <span className="text-sm font-medium" style={{ color: '#4f5b4d' }}>{r.RAMO_CLIENTE || 'Sem ramo'}</span>
            </div>
            <div className="col-span-1 text-sm font-semibold" style={{ color: r.diasSemVisita === null ? '#7a8379' : r.diasSemVisita > 30 ? '#b92424' : '#2d352c' }}>
              {r.diasSemVisita === null ? '—' : `${String(r.diasSemVisita).padStart(2, '0')} dias`}
            </div>
            <div className="col-span-1 text-sm font-semibold" style={{ color: r.ultimaCompra === null ? '#7a8379' : r.ultimaCompra > 25 ? '#b92424' : '#2d352c' }}>
              {r.ultimaCompra === null ? '—' : `${String(r.ultimaCompra).padStart(2, '0')} dias`}
            </div>
            <div className="col-span-1">
              <button
                type="button"
                onClick={() => abrirDetalheTemperatura(r)}
                className="inline-flex text-xs font-semibold"
                style={{
                  color: String(r.temperatura || '').toUpperCase() === 'QUENTE'
                    ? '#1f7d3f'
                    : String(r.temperatura || '').toUpperCase() === 'MORNO'
                      ? '#a26a00'
                      : '#6a7368',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textUnderlineOffset: '2px',
                }}
                title="Ver detalhamento da pontuação de temperatura"
              >
                {r.temperatura || 'Frio'} ({Math.round(Number(r.scoreTemperatura || 0))})
              </button>
            </div>
            <div className="col-span-1">
              <span className="text-sm font-semibold" style={{ color: r.status === 'Ativo' ? '#17743b' : r.status === 'Risco' ? '#b98019' : '#c12626' }}>{r.status}</span>
            </div>
            <div className="col-span-1 text-right">
              {tab === 'CARTEIRA' ? (
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      setTab('HISTORICO');
                      navigate(`/clientes?clienteId=${r.ID}`);
                    }}
                    className="w-8 h-8 rounded-full inline-flex items-center justify-center"
                    style={{ backgroundColor: 'transparent', color: '#57715d' }}
                    title="Ver histórico do cliente"
                  >
                    <ClipboardList size={15} />
                  </button>
                  <button
                    onClick={() => abrirEdicaoCliente(r)}
                    className="w-8 h-8 rounded-full inline-flex items-center justify-center"
                    style={{ backgroundColor: 'transparent', color: '#2d6f43' }}
                    title="Editar dados do cliente"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => removerDaMinhaCarteira(r)}
                    disabled={removingClientId === r.ID}
                    className="w-8 h-8 rounded-full inline-flex items-center justify-center"
                    style={{
                      backgroundColor: 'transparent',
                      color: '#ab3d3a',
                      opacity: removingClientId === r.ID ? 0.65 : 1,
                    }}
                    title="Remover cliente da carteira"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => adicionarNaMinhaCarteira(r)}
                  disabled={addingClientId === r.ID}
                  className="h-8 px-3 rounded-full text-xs font-semibold inline-flex items-center gap-1"
                  style={{
                    backgroundColor: addingClientId === r.ID ? '#dfe7dd' : '#17743b',
                    color: addingClientId === r.ID ? '#5a6657' : '#ffffff',
                  }}
                  title="Adicionar cliente à minha carteira"
                >
                  <Plus size={13} />
                  {addingClientId === r.ID ? 'Adicionando...' : 'Adicionar'}
                </button>
              )}
            </div>
          </div>
          );
        })}

        <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid #eef2eb', backgroundColor: '#ffffff' }}>
          <p className="text-sm" style={{ color: '#6f786d' }}>Mostrando {paginationStart}-{paginationEnd} de {total} clientes</p>
          <div className="flex items-center gap-1">
            <button disabled={page === 0} onClick={() => setPage((prev) => Math.max(prev - 1, 0))} className="w-8 h-8 rounded-lg" style={{ backgroundColor: '#eef1eb', color: '#637061' }}>‹</button>
            {visiblePageIndexes.map((pageIndex) => (
              <button key={pageIndex} onClick={() => setPage(pageIndex)} className="w-8 h-8 rounded-lg text-sm font-semibold" style={{ backgroundColor: page === pageIndex ? '#17743b' : '#eef1eb', color: page === pageIndex ? '#fff' : '#617061' }}>{pageIndex + 1}</button>
            ))}
            <button disabled={page >= totalPages - 1} onClick={() => setPage((prev) => Math.min(prev + 1, totalPages - 1))} className="w-8 h-8 rounded-lg" style={{ backgroundColor: '#eef1eb', color: '#637061' }}>›</button>
          </div>
        </div>
      </div>

      {tab === 'CARTEIRA' ? (
        <ChartContainer
          title="Distribuição por ramo de segmento"
          subtitle="Quantidade de clientes por ramo considerando toda a carteira."
          className="mb-4"
        >
          {loadingRamoDistribuicao ? (
            <div className="py-10 text-center text-sm" style={{ color: '#728070' }}>
              Carregando distribuição da carteira...
            </div>
          ) : ramoDistribuicao.length > 0 ? (
            <ShadcnBarChart
              data={ramoDistribuicao}
              xKey="name"
              layout="vertical"
              height={Math.max(240, ramoDistribuicao.length * 46)}
              bars={[{ dataKey: 'value', name: 'Clientes' }]}
              formatter={(value) => `${Number(value).toLocaleString('pt-BR')} cliente(s)`}
              showLabel
              labelFormatter={(value) => Number(value).toLocaleString('pt-BR')}
            />
          ) : (
            <div className="py-10 text-center text-sm" style={{ color: '#728070' }}>
              Nenhum cliente disponível para compor o gráfico.
            </div>
          )}
        </ChartContainer>
      ) : null}

      {prospectModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22, 26, 22, 0.36)' }}>
          <div className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-3xl p-6 animate-scaleIn" style={{ backgroundColor: '#f8faf7', border: '1px solid #dfe6da' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>Novo cliente prospecto</h3>
                <p className="mt-1 text-sm" style={{ color: '#6f796d' }}>
                  Cadastre uma empresa ainda não oficializada como cliente real para usar em visitas de prospecção.
                </p>
              </div>
              <button
                onClick={fecharProspectModal}
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ backgroundColor: '#edf1e9', color: '#5f6a5d' }}
                disabled={savingProspect}
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2 lg:grid-cols-3">
              <Input label="Razão social ou nome" value={prospectForm.razaoSocial} onChange={(e) => setProspectForm((prev) => ({ ...prev, razaoSocial: e.target.value }))} className="lg:col-span-2" />
              <Input label="Nome fantasia" value={prospectForm.nomeFantasia} onChange={(e) => setProspectForm((prev) => ({ ...prev, nomeFantasia: e.target.value }))} />
              <Input label="CNPJ" value={prospectForm.cnpj} onChange={(e) => setProspectForm((prev) => ({ ...prev, cnpj: e.target.value }))} />
              <Select
                label="Segmento"
                value={prospectForm.segmento}
                onChange={(value) => setProspectForm((prev) => ({ ...prev, segmento: value }))}
                options={segmentoOptionsEdicao}
                placeholder="Selecione um segmento"
              />
              <Input label="Porte" value={prospectForm.porte} onChange={(e) => setProspectForm((prev) => ({ ...prev, porte: e.target.value }))} />
              <Input label="Origem" value={prospectForm.origem} onChange={(e) => setProspectForm((prev) => ({ ...prev, origem: e.target.value }))} />
              <Input label="Cidade" value={prospectForm.cidade} onChange={(e) => setProspectForm((prev) => ({ ...prev, cidade: e.target.value }))} />
              <Input label="UF" value={prospectForm.uf} onChange={(e) => setProspectForm((prev) => ({ ...prev, uf: e.target.value.toUpperCase().slice(0, 2) }))} />
              <Input label="Potencial mensal" value={prospectForm.potencial} onChange={(e) => setProspectForm((prev) => ({ ...prev, potencial: e.target.value }))} />
              <Input label="Probabilidade (%)" value={prospectForm.probabilidade} onChange={(e) => setProspectForm((prev) => ({ ...prev, probabilidade: e.target.value }))} />
              <Input label="Contato principal" value={prospectForm.contatoNome} onChange={(e) => setProspectForm((prev) => ({ ...prev, contatoNome: e.target.value }))} />
              <Input label="Cargo" value={prospectForm.contatoCargo} onChange={(e) => setProspectForm((prev) => ({ ...prev, contatoCargo: e.target.value }))} />
              <Input label="Telefone" value={prospectForm.contatoTelefone} onChange={(e) => setProspectForm((prev) => ({ ...prev, contatoTelefone: e.target.value }))} />
              <Input label="E-mail" value={prospectForm.contatoEmail} onChange={(e) => setProspectForm((prev) => ({ ...prev, contatoEmail: e.target.value }))} />
              <Input label="Observações" value={prospectForm.observacoes} onChange={(e) => setProspectForm((prev) => ({ ...prev, observacoes: e.target.value }))} className="lg:col-span-2" />
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t pt-4" style={{ borderColor: '#dfe6da' }}>
              <button
                onClick={fecharProspectModal}
                className="rounded-xl px-4 py-2 text-sm font-semibold"
                style={{ backgroundColor: '#edf1e9', color: '#5f6a5d' }}
                disabled={savingProspect}
              >
                Cancelar
              </button>
              <button
                onClick={salvarClienteProspecto}
                className="rounded-xl px-4 py-2 text-sm font-semibold"
                style={{ backgroundColor: '#17743b', color: '#ffffff' }}
                disabled={savingProspect}
              >
                {savingProspect ? 'Salvando...' : 'Salvar cliente prospecto'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingClienteId !== null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22, 26, 22, 0.36)' }}>
          <div className="w-full max-w-3xl rounded-3xl p-6 animate-scaleIn" style={{ backgroundColor: '#f8faf7', border: '1px solid #dfe6da' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>Editar cliente da carteira</h3>
              <button
                onClick={fecharEdicaoCliente}
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: '#edf1e9', color: '#5f6a5d' }}
                disabled={savingEdit}
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-sm mt-2" style={{ color: '#6f796d' }}>
              Nome Fantasia e CNPJ ficam bloqueados. Você pode atualizar os demais dados cadastrais.
            </p>

            {loadingEditData ? (
              <div className="mt-4 rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#5f6a5d' }}>
                Carregando dados do cliente...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                <div>
                  <label className="text-[11px] label-ui font-semibold" style={{ color: '#7d887c' }}>Nome Fantasia (bloqueado)</label>
                  <input
                    type="text"
                    value={clienteForm.nomeFantasia}
                    readOnly
                    className="w-full mt-1 p-2 text-sm rounded-lg"
                    style={{ backgroundColor: '#eef2ec', border: '1px solid #d6ddd1', color: '#6f786d' }}
                  />
                </div>

                <div>
                  <label className="text-[11px] label-ui font-semibold" style={{ color: '#7d887c' }}>CNPJ (bloqueado)</label>
                  <input
                    type="text"
                    value={clienteForm.cnpj}
                    readOnly
                    className="w-full mt-1 p-2 text-sm rounded-lg"
                    style={{ backgroundColor: '#eef2ec', border: '1px solid #d6ddd1', color: '#6f786d' }}
                  />
                </div>

                <div>
                  <label className="text-[11px] label-ui font-semibold" style={{ color: '#7d887c' }}>Razão Social</label>
                  <input
                    type="text"
                    value={clienteForm.razaoSocial}
                    onChange={(e) => setClienteForm((prev) => ({ ...prev, razaoSocial: e.target.value }))}
                    className="w-full mt-1 p-2 text-sm rounded-lg"
                    style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }}
                  />
                </div>

                <Select
                  label="Segmento"
                  value={clienteForm.segmento}
                  onChange={(value) => setClienteForm((prev) => ({ ...prev, segmento: value }))}
                  options={segmentoOptionsEdicao}
                  placeholder="Selecione o segmento"
                  disabled={savingEdit || loadingEditData}
                />

                <div>
                  <label className="text-[11px] label-ui font-semibold" style={{ color: '#7d887c' }}>Curva da carteira</label>
                  <div className="mt-1 inline-flex items-center rounded-lg p-1" style={{ backgroundColor: '#edf1ea', border: '1px solid #dbe4d6' }}>
                    {CURVA_OPTIONS.map((curva) => (
                      <button
                        key={`edicao-curva-${curva}`}
                        type="button"
                        onClick={() => setEditingCurva(curva)}
                        disabled={savingEdit || loadingEditData}
                        className="h-8 w-10 rounded-md text-sm font-bold"
                        style={{
                          backgroundColor: editingCurva === curva ? '#17743b' : 'transparent',
                          color: editingCurva === curva ? '#ffffff' : '#5f6a5d',
                          opacity: savingEdit || loadingEditData ? 0.65 : 1,
                        }}
                      >
                        {curva}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] label-ui font-semibold" style={{ color: '#7d887c' }}>Cidade</label>
                  <input
                    type="text"
                    value={clienteForm.cidade}
                    onChange={(e) => setClienteForm((prev) => ({ ...prev, cidade: e.target.value }))}
                    className="w-full mt-1 p-2 text-sm rounded-lg"
                    style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }}
                  />
                </div>

                <div>
                  <label className="text-[11px] label-ui font-semibold" style={{ color: '#7d887c' }}>UF</label>
                  <input
                    type="text"
                    value={clienteForm.uf}
                    onChange={(e) => setClienteForm((prev) => ({ ...prev, uf: e.target.value }))}
                    className="w-full mt-1 p-2 text-sm rounded-lg"
                    style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }}
                    maxLength={2}
                  />
                </div>

                <div>
                  <label className="text-[11px] label-ui font-semibold" style={{ color: '#7d887c' }}>Telefone</label>
                  <input
                    type="text"
                    value={clienteForm.telefone}
                    onChange={(e) => setClienteForm((prev) => ({ ...prev, telefone: e.target.value }))}
                    className="w-full mt-1 p-2 text-sm rounded-lg"
                    style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }}
                  />
                </div>

                <div>
                  <label className="text-[11px] label-ui font-semibold" style={{ color: '#7d887c' }}>Email</label>
                  <input
                    type="text"
                    value={clienteForm.email}
                    onChange={(e) => setClienteForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full mt-1 p-2 text-sm rounded-lg"
                    style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="text-[11px] label-ui font-semibold" style={{ color: '#7d887c' }}>Endereço</label>
                  <input
                    type="text"
                    value={clienteForm.endereco}
                    onChange={(e) => setClienteForm((prev) => ({ ...prev, endereco: e.target.value }))}
                    className="w-full mt-1 p-2 text-sm rounded-lg"
                    style={{ backgroundColor: '#ffffff', border: '1px solid #e1e8dc', color: '#1b1c1a' }}
                  />
                </div>
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={fecharEdicaoCliente}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: '#edf1e9', color: '#5f6a5d' }}
                disabled={savingEdit}
              >
                Cancelar
              </button>
              <button
                onClick={salvarEdicaoCliente}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: '#17743b', color: '#ffffff' }}
                disabled={savingEdit || loadingEditData}
              >
                {savingEdit ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
