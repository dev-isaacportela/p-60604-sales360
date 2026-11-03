import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { callSF, callSFSingle, callSFWithMeta, formatCurrency, formatServerDateTimeBrasilia, SF } from '../hooks/useMitra';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';
import DetalheClienteInline from '../components/DetalheClienteInline';
import { CoordinatorScopeFilter, useCoordinatorScope } from '../components/CoordinatorScopeFilter';
import { buildOperationalWeeksForMonth, formatOperationalWeekRange, getOperationalWeek, getOperationalWeekNumber } from '../lib/operational-week';

interface OptionItem {
  value: string;
  label: string;
}

interface LinhaAcompanhamento {
  CLIENTE_ID: number;
  CLIENTE: string;
  CURVA: string;
  SEGMENTO: string;
  RAMO_CLIENTE: string;
  VENDEDOR_ID: number;
  VENDEDOR: string;
  SEM_1: number;
  DELTA_BW_SEM_1: number;
  SEM_2: number;
  DELTA_BW_SEM_2: number;
  SEM_3: number;
  DELTA_BW_SEM_3: number;
  SEM_4: number;
  DELTA_BW_SEM_4: number;
  SEM_5: number;
  DELTA_BW_SEM_5: number;
  SEM_6: number;
  DELTA_BW_SEM_6: number;
  FECHAMENTO_MES: number;
  DELTA_BW: number;
  STATUS: string;
}

const WEEK_NUMBERS = [1, 2, 3, 4, 5, 6] as const;
type WeekNumber = typeof WEEK_NUMBERS[number];

function isWeekNumber(value: number): value is WeekNumber {
  return WEEK_NUMBERS.includes(value as WeekNumber);
}

function getWeekValue(row: LinhaAcompanhamento, week: WeekNumber): number {
  return Number(row[`SEM_${week}` as keyof LinhaAcompanhamento] || 0);
}

function getWeekDelta(row: LinhaAcompanhamento, week: WeekNumber): number {
  return Number(row[`DELTA_BW_SEM_${week}` as keyof LinhaAcompanhamento] ?? -1);
}

interface SyncStatus {
  EXECUCAO_ID: string;
  STATUS: string;
  INICIO_EM: string;
  FIM_EM: string;
  TOTAL_FONTE: number;
  TOTAL_PROCESSADOS: number;
  TOTAL_VALIDOS: number;
  TOTAL_ERROS: number;
  TOTAL_INATIVADOS_RAW: number;
  TOTAL_INATIVADOS_AGG: number;
  TOTAL_AGREGADOS_ATIVOS: number;
  MENSAGEM: string;
}

interface BuOptionRow {
  CODFILIAL: string | number;
  CODEPTO: string | number;
  DEPARTAMENTO?: string;
}

function formatBw(delta: number) {
  if (delta === -1 || Number.isNaN(delta)) return 'Sem base';
  const percentual = delta * 100;
  const sinal = percentual > 0 ? '+' : '';
  return `${sinal}${percentual.toFixed(1).replace('.', ',')}%`;
}

function styleBw(delta: number) {
  if (delta === -1 || Number.isNaN(delta)) return { bg: '#eceee9', color: '#7f887c' };
  if (delta > 0) return { bg: '#e6f4ea', color: '#1f7d3f' };
  if (delta < 0) return { bg: '#fde8e8', color: '#b42318' };
  return { bg: '#eceee9', color: '#7f887c' };
}

function styleStatus(status: string) {
  const key = (status || '').toUpperCase();
  if (key === 'ALERTA') return { bg: '#fff4dc', color: '#a26a00' };
  if (key === 'FORA DO PADRÃO' || key === 'FORA DO PADRAO') return { bg: '#fde8e8', color: '#b42318' };
  return { bg: '#e6f4ea', color: '#1f7d3f' };
}

function SemanaValue({ value, delta }: { value: number; delta: number }) {
  const bwStyle = styleBw(delta);
  return (
    <div className="flex flex-col gap-1 whitespace-nowrap">
      <span>{formatCurrency(value)}</span>
      <span className="w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: bwStyle.bg, color: bwStyle.color }}>
        B/W {formatBw(delta)}
      </span>
    </div>
  );
}

function WeekColumnHeader({ label, range }: { label: string; range?: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span>{label}</span>
      {range ? <span className="text-[10px] font-medium" style={{ color: '#95a092' }}>{range}</span> : null}
    </span>
  );
}

function formatSyncDateTime(value?: string) {
  if (!value) return 'Nao sincronizado';
  return formatServerDateTimeBrasilia(value) || value;
}

function parseSyncStatus(row: any): SyncStatus | null {
  if (!row) return null;

  return {
    EXECUCAO_ID: String(row.EXECUCAO_ID || ''),
    STATUS: String(row.STATUS || ''),
    INICIO_EM: String(row.INICIO_EM || ''),
    FIM_EM: String(row.FIM_EM || ''),
    TOTAL_FONTE: Number(row.TOTAL_FONTE || 0),
    TOTAL_PROCESSADOS: Number(row.TOTAL_PROCESSADOS || 0),
    TOTAL_VALIDOS: Number(row.TOTAL_VALIDOS || 0),
    TOTAL_ERROS: Number(row.TOTAL_ERROS || 0),
    TOTAL_INATIVADOS_RAW: Number(row.TOTAL_INATIVADOS_RAW || 0),
    TOTAL_INATIVADOS_AGG: Number(row.TOTAL_INATIVADOS_AGG || 0),
    TOTAL_AGREGADOS_ATIVOS: Number(row.TOTAL_AGREGADOS_ATIVOS || 0),
    MENSAGEM: String(row.MENSAGEM || ''),
  };
}

function FilterDropdown({
  label,
  value,
  options,
  onChange,
  widthClass = 'min-w-[220px]',
}: {
  label: string;
  value: string;
  options: OptionItem[];
  onChange: (next: string) => void;
  widthClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const selected = options.find((item) => item.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${widthClass}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="h-11 w-full px-4 rounded-2xl text-sm font-semibold flex items-center justify-between gap-2"
        style={{ backgroundColor: '#eef2eb', color: '#425242', border: '1px solid #d7dfd3' }}
      >
        <span className="truncate">{label}: {selected?.label || 'Todos'}</span>
        <ChevronDown size={16} />
      </button>

      {open ? (
        <div
          className="absolute z-30 mt-2 w-full max-h-72 overflow-y-auto rounded-2xl p-2 animate-scaleIn"
          style={{ backgroundColor: '#ffffff', border: '1px solid #dde5d8', boxShadow: '0 12px 26px rgba(23,40,30,0.12)' }}
        >
          {options.map((item) => (
            <button
              key={`${label}-${item.value || 'all'}`}
              type="button"
              onClick={() => {
                onChange(item.value);
                setOpen(false);
              }}
              className="w-full text-left rounded-xl px-3 py-2 text-sm"
              style={{
                backgroundColor: value === item.value ? '#dfeadf' : 'transparent',
                color: value === item.value ? '#1f6f39' : '#4e5a4e',
                fontWeight: value === item.value ? 700 : 500,
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function AcompanhamentoSemanalPage() {
  const { toasts, addToast, removeToast } = useToast();
  const coordinatorScope = useCoordinatorScope('acompanhamento-semanal');
  const now = new Date();
  const operationalNow = getOperationalWeek(now);
  const [loading, setLoading] = useState(true);
  const [loadingTabela, setLoadingTabela] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [podeAcessar, setPodeAcessar] = useState(false);
  const [cargoAtual, setCargoAtual] = useState('');

  const [vendedorId, setVendedorId] = useState('');
  const [ramos, setRamos] = useState<OptionItem[]>([]);
  const [ramoCliente, setRamoCliente] = useState('');
  const [codFilial, setCodFilial] = useState('');
  const [codepto, setCodepto] = useState('');
  const [mes, setMes] = useState(String(operationalNow.month));
  const [ano, setAno] = useState(String(operationalNow.year));

  const [linhas, setLinhas] = useState<LinhaAcompanhamento[]>([]);
  const [vendedores, setVendedores] = useState<OptionItem[]>([]);
  const [busCoordenador, setBusCoordenador] = useState<BuOptionRow[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [clienteExpandidoId, setClienteExpandidoId] = useState<number | null>(null);
  const [semanaAbertaPorCliente, setSemanaAbertaPorCliente] = useState<Record<number, string | null>>({});

  const carregarStatusSync = useCallback(async () => {
    const status = await callSFSingle(SF.acompanhamentoSemanalStatusSync);
    setSyncStatus(parseSyncStatus(status));
  }, []);

  const ramosOptions = useMemo<OptionItem[]>(() => ([
    { value: '', label: 'Todos' },
    ...ramos,
  ]), [ramos]);

  const weekHeaders = useMemo(() => {
    return [...buildOperationalWeeksForMonth(Number(ano), Number(mes))]
      .sort((a, b) => a.SEMANA_NUMERO - b.SEMANA_NUMERO)
      .map((semana) => ({
        label: `${semana.SEMANA_NUMERO}ª sem`,
        weekNumber: semana.SEMANA_NUMERO,
        range: formatOperationalWeekRange(semana.DATA_INICIO_SEMANA, semana.DATA_FIM_SEMANA),
      }));
  }, [ano, mes]);

  const visibleWeeks = useMemo<WeekNumber[]>(() => weekHeaders.map((header) => header.weekNumber).filter(isWeekNumber), [weekHeaders]);
  const tableColSpan = 4 + visibleWeeks.length + 2;

  const mesesOptions = useMemo<OptionItem[]>(() => (
    [
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
    ]
  ), []);

  const anosOptions = useMemo<OptionItem[]>(() => {
    const currentYear = now.getFullYear();
    return [
      { value: String(currentYear - 1), label: String(currentYear - 1) },
      { value: String(currentYear), label: String(currentYear) },
      { value: String(currentYear + 1), label: String(currentYear + 1) },
    ];
  }, [now]);

  const filiaisOptions = useMemo<OptionItem[]>(() => {
    const map = new Map<string, OptionItem>();
    busCoordenador.forEach((row) => {
      const value = String(row.CODFILIAL || '').trim();
      if (!value || map.has(value)) return;
      map.set(value, { value, label: `Filial ${value}` });
    });
    return [{ value: '', label: 'Todas' }, ...Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))];
  }, [busCoordenador]);

  const departamentosOptions = useMemo<OptionItem[]>(() => {
    const map = new Map<string, OptionItem>();
    busCoordenador
      .filter((row) => !codFilial || String(row.CODFILIAL || '').trim() === codFilial)
      .forEach((row) => {
        const value = String(row.CODEPTO || '').trim();
        if (!value || map.has(value)) return;
        map.set(value, { value, label: `Depto ${value}${row.DEPARTAMENTO ? ` - ${row.DEPARTAMENTO}` : ''}` });
      });
    return [{ value: '', label: 'Todos' }, ...Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label))];
  }, [busCoordenador, codFilial]);

  const carregarTabela = useCallback(async () => {
    setLoadingTabela(true);
    try {
      const result = await callSFWithMeta(SF.calcularBwSemanal, {
        vendedorId,
        ramoCliente,
        codFilial,
        codepto,
        mes,
        ano,
        semanaNumero: String(getOperationalWeekNumber()),
        ...coordinatorScope.scopeParams,
      });

      if (result.error) {
        throw new Error(result.error);
      }

      const rows = result.rows;

      const parsed = rows.map((row: any) => ({
        CLIENTE_ID: Number(row.CLIENTE_ID || 0),
        CLIENTE: row.CLIENTE || 'Cliente sem nome',
        CURVA: row.CURVA || 'C',
        SEGMENTO: row.SEGMENTO || 'Sem segmento',
        RAMO_CLIENTE: row.RAMO_CLIENTE || 'Sem ramo',
        VENDEDOR_ID: Number(row.VENDEDOR_ID || 0),
        VENDEDOR: row.VENDEDOR || `Usuario ${row.VENDEDOR_ID || 0}`,
        SEM_1: Number(row.SEM_1 || 0),
        DELTA_BW_SEM_1: Number(row.DELTA_BW_SEM_1 ?? -1),
        SEM_2: Number(row.SEM_2 || 0),
        DELTA_BW_SEM_2: Number(row.DELTA_BW_SEM_2 ?? -1),
        SEM_3: Number(row.SEM_3 || 0),
        DELTA_BW_SEM_3: Number(row.DELTA_BW_SEM_3 ?? -1),
        SEM_4: Number(row.SEM_4 || 0),
        DELTA_BW_SEM_4: Number(row.DELTA_BW_SEM_4 ?? -1),
        SEM_5: Number(row.SEM_5 || 0),
        DELTA_BW_SEM_5: Number(row.DELTA_BW_SEM_5 ?? -1),
        SEM_6: Number(row.SEM_6 || 0),
        DELTA_BW_SEM_6: Number(row.DELTA_BW_SEM_6 ?? -1),
        FECHAMENTO_MES: Number(row.FECHAMENTO_MES || 0),
        DELTA_BW: Number(row.DELTA_BW ?? -1),
        STATUS: row.STATUS || 'No padrao',
      } as LinhaAcompanhamento));

      const deduplicado = new Map<string, LinhaAcompanhamento>();
      parsed.forEach((row) => {
        const key = `${row.VENDEDOR_ID}-${row.CLIENTE_ID}`;
        if (!deduplicado.has(key)) {
          deduplicado.set(key, row);
        }
      });

      setLinhas(Array.from(deduplicado.values()));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao carregar dados sincronizados do acompanhamento semanal.';
      addToast('error', message);
      setLinhas([]);
    } finally {
      setLoadingTabela(false);
    }
  }, [addToast, ano, codFilial, codepto, coordinatorScope.scopeParams, mes, ramoCliente, vendedorId]);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      setLoading(true);

      const [permissaoResp, vendedoresResp, ramosResp, busResp] = await Promise.allSettled([
        callSFSingle(SF.painelGestaoPermissao),
        callSF(SF.painelGestaoVendedores),
        callSF(SF.listarRamosClientesTotvs),
        callSF(SF.painelCoordenadorMetasBuRecebidas, { mes, ano }),
      ]);

      if (!mounted) return;

      const permissao = permissaoResp.status === 'fulfilled' ? permissaoResp.value : null;
      const acesso = Number(permissao?.PODE_ACESSAR || 0) === 1;
      setPodeAcessar(acesso);
      setCargoAtual(String(permissao?.CARGO_ATUAL || ''));

      if (vendedoresResp.status === 'fulfilled') {
        const source = coordinatorScope.canUseScope && coordinatorScope.vendedoresScope.length
          ? coordinatorScope.vendedoresScope.map((row) => ({ VENDEDOR_ID: row.USER_ID, VENDEDOR_NOME: row.RCA || `RCA ${row.COD_RCA}` }))
          : vendedoresResp.value;
        const options = source.map((row: any) => ({
          value: String(row.VENDEDOR_ID),
          label: row.VENDEDOR_NOME || row.EMAIL || `Usuário ${row.VENDEDOR_ID}`,
        }));
        setVendedores([{ value: '', label: 'Todos' }, ...options]);
      }

      if (busResp.status === 'fulfilled') {
        setBusCoordenador(busResp.value as BuOptionRow[]);
      }

      if (ramosResp.status === 'fulfilled') {
        const seen = new Set<string>();
        const options: OptionItem[] = [];
        for (const row of ramosResp.value || []) {
          const nome = String(row.NOME || '').trim();
          if (!nome) continue;
          const key = nome.toUpperCase();
          if (seen.has(key)) continue;
          seen.add(key);
          options.push({ value: nome, label: nome });
        }
        setRamos(options);
      }

      await carregarStatusSync();

      if (mounted) setLoading(false);
    }

    bootstrap();

    return () => {
      mounted = false;
    };
  }, [addToast, ano, carregarStatusSync, coordinatorScope.canUseScope, coordinatorScope.vendedoresScope, mes]);

  useEffect(() => {
    if (loading || !podeAcessar) return;
    if (coordinatorScope.loadingScope) return;
    carregarTabela();
  }, [carregarTabela, coordinatorScope.loadingScope, loading, podeAcessar]);

  useEffect(() => {
    if (!codFilial) return;
    if (departamentosOptions.some((item) => item.value === codepto)) return;
    setCodepto('');
  }, [codFilial, codepto, departamentosOptions]);

  const sincronizarAgora = useCallback(async () => {
    setSyncing(true);
    const result = await callSFWithMeta(SF.acompanhamentoSemanalSincronizarManual);

    if (result.error) {
      addToast('error', 'Falha ao disparar sincronizacao manual do TOTVS.');
      await carregarStatusSync();
      setSyncing(false);
      return;
    }

    const syncResult = result.rows[0] || null;
    const status = String(syncResult?.STATUS || '').toUpperCase();
    const message = String(syncResult?.MENSAGEM || '');

    if (status === 'SUCCESS') {
      addToast('success', `Sincronizacao concluida. Validos: ${Number(syncResult?.TOTAL_VALIDOS || 0)} | Erros: ${Number(syncResult?.TOTAL_ERROS || 0)}`);
    } else {
      addToast('error', message || 'A sincronizacao manual terminou com falha.');
    }

    await carregarStatusSync();
    await carregarTabela();
    setSyncing(false);
  }, [addToast, carregarStatusSync, carregarTabela]);

  const gruposPorVendedor = useMemo(() => {
    const agrupado = new Map<string, LinhaAcompanhamento[]>();

    linhas.forEach((linha) => {
      const key = linha.VENDEDOR || 'Sem vendedor';
      const atual = agrupado.get(key) || [];
      atual.push(linha);
      agrupado.set(key, atual);
    });

    return Array.from(agrupado.entries()).map(([vendedor, itens]) => ({ vendedor, itens }));
  }, [linhas]);

  const toggleClienteExpandido = useCallback((clienteId: number) => {
    setClienteExpandidoId((prev) => (prev === clienteId ? null : clienteId));
    setSemanaAbertaPorCliente((prev) => {
      if (Object.prototype.hasOwnProperty.call(prev, clienteId)) return prev;
      return { ...prev, [clienteId]: null };
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '3px solid #d5dbd3', borderTopColor: '#137432' }} />
      </div>
    );
  }

  if (!podeAcessar) {
    return (
      <div className="animate-fadeIn rounded-3xl p-8" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <h1 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>Acompanhamento Semanal de Clientes</h1>
        <p className="mt-3 text-lg" style={{ color: '#636d63' }}>Este módulo está disponível apenas para perfis de gestão.</p>
        <p className="mt-2 text-sm" style={{ color: '#7b857b' }}>
          Perfil atual: <strong>{cargoAtual || 'NÃO DEFINIDO'}</strong>. Solicite ao administrador a liberação de acesso.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>Acompanhamento Semanal de Clientes</h1>
          <p className="text-2xl mt-1" style={{ color: '#515b51' }}>
            Monitoramento de recorrência para hospitais, home care e concessionárias.
          </p>
        </div>

        <div className="rounded-2xl px-4 py-3 min-w-[300px]" style={{ backgroundColor: '#ffffff', border: '1px solid #dde5d8' }}>
          <div className="text-xs font-semibold uppercase" style={{ color: '#7b857b' }}>Ultima sincronizacao TOTVS</div>
          <div className="text-sm font-bold mt-1" style={{ color: '#2f4f35' }}>
            {formatSyncDateTime(syncStatus?.FIM_EM || syncStatus?.INICIO_EM)}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs" style={{ color: '#556254' }}>
            <span className="rounded-full px-2 py-1" style={{ backgroundColor: '#eef2eb' }}>
              Status: {syncStatus?.STATUS || 'SEM EXECUCAO'}
            </span>
            <span className="rounded-full px-2 py-1" style={{ backgroundColor: '#eef2eb' }}>
              Validos: {syncStatus?.TOTAL_VALIDOS || 0}
            </span>
            <span className="rounded-full px-2 py-1" style={{ backgroundColor: '#fff4dc', color: '#a26a00' }}>
              Erros: {syncStatus?.TOTAL_ERROS || 0}
            </span>
          </div>
          <button
            type="button"
            onClick={sincronizarAgora}
            disabled={syncing}
            className="mt-3 h-9 rounded-xl px-3 text-sm font-semibold"
            style={{
              backgroundColor: syncing ? '#d9e2d7' : '#1f6f39',
              color: syncing ? '#5f6a5d' : '#ffffff',
              cursor: syncing ? 'not-allowed' : 'pointer',
            }}
          >
            {syncing ? 'Sincronizando...' : 'Sincronizar agora'}
          </button>
        </div>
      </div>

      {!syncStatus ? (
        <div className="rounded-2xl p-3 mb-4 text-sm flex items-start gap-2" style={{ backgroundColor: '#fff8e8', color: '#7f5c00', border: '1px solid #f3e2b8' }}>
          <AlertTriangle size={16} className="mt-0.5" />
          <span>A sincronizacao TOTVS ainda nao possui execucao registrada neste ambiente.</span>
        </div>
      ) : null}

      <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <div className="mb-3">
          <CoordinatorScopeFilter scope={coordinatorScope} />
        </div>
        <div className="flex flex-wrap gap-3">
          <FilterDropdown label="Vendedor" value={vendedorId} options={vendedores} onChange={setVendedorId} widthClass="min-w-[250px]" />
          <FilterDropdown label="Filial" value={codFilial} options={filiaisOptions} onChange={setCodFilial} widthClass="min-w-[180px]" />
          <FilterDropdown label="Departamento" value={codepto} options={departamentosOptions} onChange={setCodepto} widthClass="min-w-[250px]" />
          <FilterDropdown label="Ramo" value={ramoCliente} options={ramosOptions} onChange={setRamoCliente} widthClass="min-w-[240px]" />
          <FilterDropdown label="Mês" value={mes} options={mesesOptions} onChange={setMes} widthClass="min-w-[180px]" />
          <FilterDropdown label="Ano" value={ano} options={anosOptions} onChange={setAno} widthClass="min-w-[140px]" />
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Tabela Semanal</h2>
          {loadingTabela ? (
            <div className="w-5 h-5 rounded-full animate-spin" style={{ border: '2px solid #d5dbd3', borderTopColor: '#137432' }} />
          ) : null}
        </div>

        {gruposPorVendedor.length === 0 ? (
          <div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#ffffff', color: '#6e786d' }}>
            Nenhum registro encontrado para os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1420px]">
              <thead>
                <tr className="text-left text-xs" style={{ color: '#788378' }}>
                  <th className="px-3 py-3">Cliente</th>
                  <th className="px-3 py-3">Curva</th>
                  <th className="px-3 py-3">Ramo</th>
                  <th className="px-3 py-3">Vendedor</th>
                  {weekHeaders.map((header) => (
                    <th key={`head-week-${header.weekNumber}`} className="px-3 py-3"><WeekColumnHeader label={header.label} range={header.range} /></th>
                  ))}
                  <th className="px-3 py-3">Fechamento do mês</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>

              <tbody>
                {gruposPorVendedor.map((grupo) => {
                  const totalSemanas = Object.fromEntries(
                    visibleWeeks.map((week) => [week, grupo.itens.reduce((sum, item) => sum + getWeekValue(item, week), 0)]),
                  ) as Record<number, number>;
                  const totalFechamento = grupo.itens.reduce((sum, item) => sum + item.FECHAMENTO_MES, 0);

                  return (
                    <Fragment key={`grp-block-${grupo.vendedor}`}>
                      <tr key={`grp-${grupo.vendedor}`} style={{ borderTop: '1px solid #e6ebe1' }}>
                        <td colSpan={tableColSpan} className="px-3 py-3 text-sm font-semibold" style={{ backgroundColor: '#edf3ec', color: '#2f4f35' }}>
                          Vendedor: {grupo.vendedor}
                        </td>
                      </tr>

                      {grupo.itens.map((linha) => {
                        const statusStyle = styleStatus(linha.STATUS);
                        const isExpanded = clienteExpandidoId === linha.CLIENTE_ID;
                        const weekKey = semanaAbertaPorCliente[linha.CLIENTE_ID] || null;

                        return (
                          <Fragment key={`row-block-${grupo.vendedor}-${linha.CLIENTE_ID}`}>
                            <tr style={{ borderTop: '1px solid #e6ebe1' }}>
                              <td className="px-3 py-3 text-sm font-semibold" style={{ color: '#2a312a' }}>
                                <button
                                  type="button"
                                  onClick={() => toggleClienteExpandido(linha.CLIENTE_ID)}
                                  className="text-left whitespace-nowrap"
                                  style={{ color: '#2a312a' }}
                                >
                                  <span className="mr-2" style={{ color: '#6a7568' }}>{isExpanded ? '▼' : '▶'}</span>
                                  <span className="text-xs text-gray-400 mr-1">[{linha.CLIENTE_ID}]</span>
                                  <span className="underline underline-offset-2">{linha.CLIENTE}</span>
                                </button>
                              </td>
                              <td className="px-3 py-3 text-sm" style={{ color: '#434c43' }}>{linha.CURVA}</td>
                              <td className="px-3 py-3 text-sm" style={{ color: '#434c43' }}>{linha.RAMO_CLIENTE}</td>
                              <td className="px-3 py-3 text-sm" style={{ color: '#434c43' }}>{linha.VENDEDOR}</td>
                              {visibleWeeks.map((week) => (
                                <td key={`cell-${linha.CLIENTE_ID}-${week}`} className="px-3 py-3 text-sm" style={{ color: '#434c43' }}>
                                  <SemanaValue value={getWeekValue(linha, week)} delta={getWeekDelta(linha, week)} />
                                </td>
                              ))}
                              <td className="px-3 py-3 text-sm font-semibold" style={{ color: '#1f6f39' }}>{formatCurrency(linha.FECHAMENTO_MES)}</td>
                              <td className="px-3 py-3">
                                <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}>
                                  {linha.STATUS}
                                </span>
                              </td>
                            </tr>

                            {isExpanded ? (
                              <tr style={{ borderTop: '1px solid #edf2eb', backgroundColor: '#ffffff' }}>
                                <td colSpan={tableColSpan} className="px-3 py-3">
                                  <DetalheClienteInline
                                    clienteId={linha.CLIENTE_ID}
                                    clienteNome={linha.CLIENTE || `Cliente ${linha.CLIENTE_ID}`}
                                    clienteCodigo={String(linha.CLIENTE_ID)}
                                    vendedorId={linha.VENDEDOR_ID}
                                    mesFiltrado={mes}
                                    openWeekKey={weekKey}
                                    onChangeOpenWeekKey={(nextKey) => {
                                      setSemanaAbertaPorCliente((prev) => ({ ...prev, [linha.CLIENTE_ID]: nextKey }));
                                    }}
                                  />
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}

                      <tr key={`total-${grupo.vendedor}`} style={{ borderTop: '2px solid #dce5d8', backgroundColor: '#f0f5ee' }}>
                        <td className="px-3 py-3 text-sm font-bold" style={{ color: '#2a312a' }}>TOTAL</td>
                        <td className="px-3 py-3" colSpan={3} />
                        {visibleWeeks.map((week) => (
                          <td key={`total-week-${grupo.vendedor}-${week}`} className="px-3 py-3 text-sm font-bold" style={{ color: '#2f4f35' }}>{formatCurrency(totalSemanas[week] || 0)}</td>
                        ))}
                        <td className="px-3 py-3 text-sm font-bold" style={{ color: '#1f6f39' }}>{formatCurrency(totalFechamento)}</td>
                        <td className="px-3 py-3 text-sm font-bold" style={{ color: '#7f887c' }}>—</td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
