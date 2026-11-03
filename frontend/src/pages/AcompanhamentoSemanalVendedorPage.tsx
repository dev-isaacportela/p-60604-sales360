import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download } from 'lucide-react';
import { callSF, callSFSingle, SF, formatCurrency } from '../hooks/useMitra';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';
import DetalheClienteInline from '../components/DetalheClienteInline';
import { buildOperationalWeeksForMonth, formatOperationalWeekRange, getOperationalWeek, getOperationalWeekNumber } from '../lib/operational-week';
import { downloadExcelWorkbook, excelColumn } from '../lib/excel-export';

export interface OptionItem {
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
  FECHAMENTO_MES_ANTERIOR: number;
  DELTA_BW_FECHAMENTO_MES: number;
  VALOR_SEMANA_ATUAL: number;
  VALOR_SEMANA_ANTERIOR: number;
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

interface ProdutoSemanaExport {
  CODPROD: number;
  DESCRICAO_PRODUTO: string;
  QTD_SEMANA_ATUAL: number;
  QTD_SEMANA_MES_ANTERIOR: number;
  DELTA_QTD_SEMANA: number;
  VALOR_UNITARIO: number;
  VALOR_TOTAL_PRODUTO_SEMANA: number;
  QTD_PICO_HISTORICO: number;
  TOTAL_SEMANAS_HISTORICO: number;
  STATUS_COMPARATIVO: string;
}

export interface WeeklyScopeParams {
  scopeMode?: string;
  scopeUserId?: string;
  scopeCodRca?: string;
  scopeCodSupervisor?: string;
  scopeCodFilial?: string;
  scopeCodepto?: string;
  scopeIdSecao?: string;
}

interface WeeklyAnalyticsFilters {
  filiais?: string[];
  departamentos?: string[];
  secoes?: string[];
  ramos?: string[];
  clientes?: string[];
  mes?: string;
  ano?: string;
  periodoLabel?: string;
}

function formatBw(delta: number) {
  if (delta === -1 || Number.isNaN(delta)) return 'Sem base';
  const percentual = delta * 100;
  const sinal = percentual > 0 ? '+' : '';
  return `${sinal}${percentual.toFixed(1).replace('.', ',')}%`;
}

/**
 * Valor de B/W para a planilha: numero puro (0.123 = +12,3%), com o formato de
 * porcentagem aplicado na celula. -1 e o sentinela de "sem base" da SF e vira
 * celula vazia, igual ao que a tela mostra.
 */
function bwExcelValue(delta: number): number | null {
  if (delta === -1 || !Number.isFinite(delta)) return null;
  return delta;
}

function styleBw(delta: number) {
  if (delta === -1 || Number.isNaN(delta)) return { bg: '#eceee9', color: '#7f887c' };
  if (delta > 0) return { bg: '#e6f4ea', color: '#1f7d3f' };
  if (delta < 0) return { bg: '#fde8e8', color: '#b42318' };
  return { bg: '#eceee9', color: '#7f887c' };
}

function styleMonthlyBw(delta: number) {
  if (delta === -1 || Number.isNaN(delta)) return { bg: '#eceee9', color: '#7f887c', label: 'Sem base' };

  const absDelta = Math.abs(delta);
  if (absDelta > 0.25) return { bg: '#fff4dc', color: '#a26a00', label: 'Alerta' };
  if (absDelta >= 0.15) return { bg: '#fde8e8', color: '#b42318', label: 'Fora do padrão' };
  return { bg: '#e6f4ea', color: '#1f7d3f', label: 'No padrão' };
}

function monthlyStatusFromDelta(delta: number) {
  return styleMonthlyBw(delta).label;
}

function styleStatus(status: string) {
  const key = (status || '').toUpperCase();
  if (key === 'ALERTA') return { bg: '#fff4dc', color: '#a26a00' };
  if (key === 'FORA DO PADRÃO' || key === 'FORA DO PADRAO') return { bg: '#fde8e8', color: '#b42318' };
  return { bg: '#e6f4ea', color: '#1f7d3f' };
}

function previousFromDelta(value: number, delta: number) {
  if (!Number.isFinite(delta) || delta === -1 || 1 + delta === 0) return 0;
  return value / (1 + delta);
}

function deltaFromValues(current: number, previous: number) {
  if (!previous) return -1;
  return (current - previous) / previous;
}

function mergeCurva(current: string, next: string) {
  const rank: Record<string, number> = { A: 3, B: 2, C: 1 };
  return (rank[next] || 0) > (rank[current] || 0) ? next : current;
}

function mergeStatus(current: string, next: string) {
  const currentKey = (current || '').toUpperCase();
  const nextKey = (next || '').toUpperCase();
  if (currentKey === 'ALERTA' || nextKey === 'ALERTA') return 'Alerta';
  if (currentKey === 'FORA DO PADRÃO' || currentKey === 'FORA DO PADRAO' || nextKey === 'FORA DO PADRÃO' || nextKey === 'FORA DO PADRAO') return 'Fora do padrao';
  return 'No padrao';
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

function FechamentoMesValue({ value, delta }: { value: number; delta: number }) {
  const bwStyle = styleMonthlyBw(delta);
  return (
    <div className="flex flex-col gap-1 whitespace-nowrap">
      <span>{formatCurrency(value)}</span>
      <span className="w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: bwStyle.bg, color: bwStyle.color }}>
        B/W {formatBw(delta)}
      </span>
    </div>
  );
}

export function FilterDropdown({
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

export default function AcompanhamentoSemanalVendedorPage({ scopeParams, scopeLabel, analyticsFilters, embeddedScroll = false }: { scopeParams?: WeeklyScopeParams; scopeLabel?: string; analyticsFilters?: WeeklyAnalyticsFilters; embeddedScroll?: boolean }) {
  const { toasts, addToast, removeToast } = useToast();
  const now = new Date();
  const operationalNow = getOperationalWeek(now);

  const [loading, setLoading] = useState(true);
  const [loadingTabela, setLoadingTabela] = useState(false);
  const [vendedorId, setVendedorId] = useState('');
  const [vendedorNome, setVendedorNome] = useState('');
  const [ramos, setRamos] = useState<OptionItem[]>([]);
  const [ramoCliente, setRamoCliente] = useState('');
  const [mes, setMes] = useState(analyticsFilters?.mes || String(operationalNow.month));
  const [ano, setAno] = useState(analyticsFilters?.ano || String(operationalNow.year));
  const [linhas, setLinhas] = useState<LinhaAcompanhamento[]>([]);
  const [clienteExpandidoId, setClienteExpandidoId] = useState<number | null>(null);
  const [semanaAbertaPorCliente, setSemanaAbertaPorCliente] = useState<Record<number, string | null>>({});
  const [exportandoExcel, setExportandoExcel] = useState(false);
  const [semanaAbaixo, setSemanaAbaixo] = useState('');

  const isAggregateScope = scopeParams?.scopeMode === 'TEAM' || scopeParams?.scopeMode === 'GLOBAL';
  const vendedorAlvoId = scopeParams?.scopeMode === 'SELLER' && scopeParams.scopeUserId ? scopeParams.scopeUserId : (isAggregateScope ? '' : vendedorId);
  const vendedorAlvoNome = scopeParams?.scopeMode === 'SELLER' || isAggregateScope ? (scopeLabel || vendedorNome) : vendedorNome;
  const analyticsFiliais = analyticsFilters?.filiais?.join('|') || '';
  const analyticsDepartamentos = analyticsFilters?.departamentos?.join('|') || '';
  const analyticsSecoes = analyticsFilters?.secoes?.join('|') || '';
  const analyticsRamos = analyticsFilters?.ramos?.join('|') || '';
  const analyticsClientes = analyticsFilters?.clientes?.join('|') || '';
  const ramoConsulta = analyticsRamos || ramoCliente;

  useEffect(() => {
    if (analyticsFilters?.mes) setMes(analyticsFilters.mes);
    if (analyticsFilters?.ano) setAno(analyticsFilters.ano);
  }, [analyticsFilters?.ano, analyticsFilters?.mes]);

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

  const visibleWeekHeaders = useMemo<Array<{ label: string; weekNumber: WeekNumber; range: string }>>(() => (
    weekHeaders
      .filter((header) => isWeekNumber(header.weekNumber))
      .map((header) => ({ ...header, weekNumber: header.weekNumber as WeekNumber }))
  ), [weekHeaders]);
  const visibleWeeks = useMemo<WeekNumber[]>(() => visibleWeekHeaders.map((header) => header.weekNumber), [visibleWeekHeaders]);
  const tableColSpan = 3 + visibleWeeks.length + 3;

  const weekExportLabels = useMemo(() => {
    return visibleWeekHeaders.map((header) => {
      if (!header.range) return header.label;
      return `${header.label} (${header.range})`;
    });
  }, [visibleWeekHeaders]);

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

  const carregarTabela = useCallback(async () => {
    if (!vendedorAlvoId && !isAggregateScope) {
      setLinhas([]);
      return;
    }

    setLoadingTabela(true);
    try {
      const rows = await callSF(SF.calcularBwSemanal, {
        vendedorId: vendedorAlvoId,
        scopeMode: scopeParams?.scopeMode || 'ME',
        scopeUserId: scopeParams?.scopeUserId || '',
        scopeCodRca: scopeParams?.scopeCodRca || '',
        scopeCodSupervisor: scopeParams?.scopeCodSupervisor || '',
        scopeCodFilial: analyticsFiliais || scopeParams?.scopeCodFilial || '',
        scopeCodepto: analyticsDepartamentos || scopeParams?.scopeCodepto || '',
        scopeIdSecao: analyticsSecoes || scopeParams?.scopeIdSecao || '',
        cliente: analyticsClientes,
        ramoCliente: ramoConsulta,
        mes,
        ano,
        semanaNumero: String(getOperationalWeekNumber()),
      });

      const parsed = rows
        .map((row: any) => ({
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
          FECHAMENTO_MES_ANTERIOR: Number(row.FECHAMENTO_MES_ANTERIOR || 0),
          DELTA_BW_FECHAMENTO_MES: Number(row.DELTA_BW_FECHAMENTO_MES ?? -1),
          VALOR_SEMANA_ATUAL: Number(row.VALOR_SEMANA_ATUAL || 0),
          VALOR_SEMANA_ANTERIOR: Number(row.VALOR_SEMANA_ANTERIOR || 0),
          DELTA_BW: Number(row.DELTA_BW ?? -1),
          STATUS: row.STATUS || 'No padrao',
        } as LinhaAcompanhamento));

      setLinhas(parsed);
    } catch {
      addToast('error', 'Falha ao carregar seu acompanhamento semanal.');
      setLinhas([]);
    } finally {
      setLoadingTabela(false);
    }
  }, [addToast, analyticsClientes, analyticsDepartamentos, analyticsFiliais, analyticsSecoes, ano, isAggregateScope, mes, ramoConsulta, scopeParams, vendedorAlvoId]);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      setLoading(true);

      const [user, ramosRows] = await Promise.all([
        callSFSingle(SF.dadosUsuarioLogado, {}),
        callSF(SF.listarRamosClientesTotvs, {}),
      ]);
      if (!mounted) return;

      const seen = new Set<string>();
      const ramosOptionsLoaded: OptionItem[] = [];
      for (const row of ramosRows || []) {
        const nome = String(row.NOME || '').trim();
        if (!nome) continue;
        const key = nome.toUpperCase();
        if (seen.has(key)) continue;
        seen.add(key);
        ramosOptionsLoaded.push({ value: nome, label: nome });
      }
      setRamos(ramosOptionsLoaded);

      const idLogado = Number(user?.ID || 0);
      if (!idLogado) {
        addToast('error', 'Não foi possível identificar o vendedor logado.');
        setLoading(false);
        return;
      }

      setVendedorId(String(idLogado));
      setVendedorNome(String(user?.NOME_INTERNO || user?.EMAIL || `Usuário ${idLogado}`));
      setLoading(false);
    }

    bootstrap();
    return () => {
      mounted = false;
    };
  }, [addToast]);

  useEffect(() => {
    if (!vendedorId) return;
    carregarTabela();
  }, [carregarTabela, vendedorId]);

  const linhasBase = useMemo<LinhaAcompanhamento[]>(() => {
    if (!isAggregateScope) return linhas;

    const map = new Map<number, LinhaAcompanhamento>();
    for (const item of linhas) {
      const current = map.get(item.CLIENTE_ID);
      if (!current) {
        map.set(item.CLIENTE_ID, { ...item, VENDEDOR_ID: 0, VENDEDOR: 'Coordenador' });
        continue;
      }

      const previousByWeek = Object.fromEntries(
        WEEK_NUMBERS.map((week) => [week, previousFromDelta(getWeekValue(current, week), getWeekDelta(current, week)) + previousFromDelta(getWeekValue(item, week), getWeekDelta(item, week))]),
      ) as Record<number, number>;

      WEEK_NUMBERS.forEach((week) => {
        const semKey = `SEM_${week}` as keyof LinhaAcompanhamento;
        const deltaKey = `DELTA_BW_SEM_${week}` as keyof LinhaAcompanhamento;
        (current as any)[semKey] = getWeekValue(current, week) + getWeekValue(item, week);
        (current as any)[deltaKey] = deltaFromValues(getWeekValue(current, week), previousByWeek[week] || 0);
      });
      current.FECHAMENTO_MES += item.FECHAMENTO_MES;
      current.FECHAMENTO_MES_ANTERIOR += item.FECHAMENTO_MES_ANTERIOR;
      current.VALOR_SEMANA_ATUAL += item.VALOR_SEMANA_ATUAL;
      current.VALOR_SEMANA_ANTERIOR += item.VALOR_SEMANA_ANTERIOR;
      current.DELTA_BW_FECHAMENTO_MES = deltaFromValues(current.FECHAMENTO_MES, current.FECHAMENTO_MES_ANTERIOR);
      current.DELTA_BW = deltaFromValues(current.VALOR_SEMANA_ATUAL, current.VALOR_SEMANA_ANTERIOR);
      current.CURVA = mergeCurva(current.CURVA, item.CURVA);
      current.STATUS = mergeStatus(current.STATUS, item.STATUS);
    }

    return Array.from(map.values()).sort((a, b) => a.CLIENTE.localeCompare(b.CLIENTE));
  }, [isAggregateScope, linhas]);

  // Abaixo da expectativa na semana: B/W da semana em -15% ou pior contra a mesma semana
  // do mês anterior (Fora do padrão ou Alerta para baixo). -1 é o "sem base" da SF e fica de fora.
  const linhasTabela = useMemo<LinhaAcompanhamento[]>(() => {
    const semana = Number(semanaAbaixo);
    if (!isWeekNumber(semana)) return linhasBase;
    return linhasBase.filter((linha) => {
      const delta = getWeekDelta(linha, semana);
      return delta !== -1 && delta <= -0.15;
    });
  }, [linhasBase, semanaAbaixo]);

  const semanaAbaixoOptions = useMemo<OptionItem[]>(() => ([
    { value: '', label: 'Todos os clientes' },
    ...visibleWeekHeaders.map((header) => ({ value: String(header.weekNumber), label: `${header.label} (${header.range})` })),
  ]), [visibleWeekHeaders]);

  const totais = useMemo(() => {
    return linhasTabela.reduce((acc, item) => {
      WEEK_NUMBERS.forEach((week) => {
        (acc as any)[`sem${week}`] += getWeekValue(item, week);
      });
      acc.fechamento += item.FECHAMENTO_MES;
      acc.fechamentoAnterior += item.FECHAMENTO_MES_ANTERIOR;
      if ((item.STATUS || '').toUpperCase() === 'ALERTA') acc.alertas += 1;
      return acc;
    }, {
      sem1: 0,
      sem2: 0,
      sem3: 0,
      sem4: 0,
      sem5: 0,
      sem6: 0,
      fechamento: 0,
      fechamentoAnterior: 0,
      alertas: 0,
    });
  }, [linhasTabela]);

  const deltaFechamentoTotal = deltaFromValues(totais.fechamento, totais.fechamentoAnterior);
  const statusMensalTotal = monthlyStatusFromDelta(deltaFechamentoTotal);
  const statusStyleTotal = styleStatus(statusMensalTotal);

  const toggleClienteExpandido = useCallback((clienteId: number) => {
    setClienteExpandidoId((prev) => (prev === clienteId ? null : clienteId));
    setSemanaAbertaPorCliente((prev) => {
      if (Object.prototype.hasOwnProperty.call(prev, clienteId)) return prev;
      return { ...prev, [clienteId]: null };
    });
  }, []);

  const exportarExcelSemanal = useCallback(async () => {
    if (linhasTabela.length === 0) {
      addToast('error', 'Não há dados semanais para exportar.');
      return;
    }

    setExportandoExcel(true);
    try {
      const semanas = visibleWeeks;
      const produtosRows: Array<Array<string | number | null>> = [];

      for (const linha of linhasTabela) {
        const scopedInput = {
          vendedorId: String(linha.VENDEDOR_ID || vendedorAlvoId || ''),
          scopeMode: scopeParams?.scopeMode || 'ME',
          scopeUserId: scopeParams?.scopeUserId || '',
          scopeCodRca: scopeParams?.scopeCodRca || '',
          scopeCodSupervisor: scopeParams?.scopeCodSupervisor || '',
          scopeCodFilial: analyticsFiliais || scopeParams?.scopeCodFilial || '',
          scopeCodepto: analyticsDepartamentos || scopeParams?.scopeCodepto || '',
          scopeIdSecao: analyticsSecoes || scopeParams?.scopeIdSecao || '',
        };

        for (const semanaNumero of semanas) {
          // Cliente da carteira sem movimento na semana nao tem item para detalhar.
          // Pular evita milhares de chamadas de Server Function (limite de 300/min por projeto)
          // agora que a tabela lista a carteira inteira, e nao so quem vendeu.
          if (getWeekValue(linha, semanaNumero) === 0) continue;

          const produtos = await callSF(SF.clienteDetalheItensSemana, {
            ID_CLIENTE: String(linha.CLIENTE_ID),
            ...scopedInput,
            ANO: ano,
            MES: mes,
            SEMANA_NUMERO: String(semanaNumero),
          }) as ProdutoSemanaExport[];

          produtos.forEach((produto) => {
            produtosRows.push([
              linha.CLIENTE_ID,
              linha.CLIENTE,
              linha.RAMO_CLIENTE,
              linha.VENDEDOR_ID,
              linha.VENDEDOR,
              Number(ano),
              Number(mes),
              semanaNumero,
              Number(produto.CODPROD || 0),
              produto.DESCRICAO_PRODUTO,
              Number(produto.QTD_SEMANA_ATUAL || 0),
              Number(produto.QTD_SEMANA_MES_ANTERIOR || 0),
              bwExcelValue(Number(produto.DELTA_QTD_SEMANA ?? -1)),
              Number(produto.VALOR_UNITARIO || 0),
              Number(produto.VALOR_TOTAL_PRODUTO_SEMANA || 0),
              Number(produto.QTD_PICO_HISTORICO || 0),
              Number(produto.TOTAL_SEMANAS_HISTORICO || 0),
              produto.STATUS_COMPARATIVO || '',
            ]);
          });
        }
      }

      const semanalRows: Array<Array<string | number | null>> = linhasTabela.map((linha) => ([
        linha.CLIENTE_ID,
        linha.CLIENTE,
        linha.CURVA,
        linha.SEGMENTO,
        linha.RAMO_CLIENTE,
        linha.VENDEDOR_ID,
        linha.VENDEDOR,
        ...visibleWeeks.flatMap((week) => [getWeekValue(linha, week), bwExcelValue(getWeekDelta(linha, week))]),
        linha.FECHAMENTO_MES_ANTERIOR,
        linha.FECHAMENTO_MES,
        bwExcelValue(linha.DELTA_BW_FECHAMENTO_MES),
        monthlyStatusFromDelta(linha.DELTA_BW_FECHAMENTO_MES),
      ]));

      const periodoLabel = `${mesesOptions.find((item) => item.value === String(Number(mes)))?.label || mes}/${ano}`;

      await downloadExcelWorkbook({
        fileName: `analytics-semanal-${ano}-${String(mes).padStart(2, '0')}.xlsx`,
        creator: 'Benenutri - Acompanhamento semanal',
        sheets: [
          {
            name: 'Dados semanais',
            title: `Acompanhamento semanal — ${vendedorAlvoNome || 'Carteira'}`,
            subtitle: `Período ${periodoLabel}. Toda a carteira entra na planilha, inclusive clientes sem venda no mês (linha zerada). Valores gravados como número puro (sem "R$") e B/W como porcentagem — dá para somar, filtrar e usar em tabela dinâmica.`,
            columns: [
              excelColumn('Cliente ID', { type: 'integer', width: 12 }),
              excelColumn('Cliente', { type: 'text', width: 42 }),
              excelColumn('Curva', { type: 'text', width: 8 }),
              excelColumn('Segmento', { type: 'text', width: 24 }),
              excelColumn('Ramo', { type: 'text', width: 24 }),
              excelColumn('Vendedor ID', { type: 'integer', width: 12 }),
              excelColumn('Vendedor', { type: 'text', width: 24 }),
              ...weekExportLabels.flatMap((label) => ([
                excelColumn(label, { type: 'currency', width: 16, total: true }),
                excelColumn(`B/W ${label}`, { type: 'percent', width: 12 }),
              ])),
              excelColumn('Fechamento mês anterior', { type: 'currency', width: 18, total: true }),
              excelColumn('Fechamento do mês', { type: 'currency', width: 18, total: true }),
              excelColumn('B/W fechamento', { type: 'percent', width: 14 }),
              excelColumn('Status', { type: 'text', width: 16 }),
            ],
            rows: semanalRows,
            totalsLabel: 'TOTAL',
            freezeColumns: 2,
          },
          {
            name: 'Produtos',
            title: 'Itens por cliente e semana',
            subtitle: 'Detalhe dos itens das semanas com movimento. Quantidades e valores são números puros.',
            columns: [
              excelColumn('Cliente ID', { type: 'integer', width: 12 }),
              excelColumn('Cliente', { type: 'text', width: 42 }),
              excelColumn('Ramo', { type: 'text', width: 24 }),
              excelColumn('Vendedor ID', { type: 'integer', width: 12 }),
              excelColumn('Vendedor', { type: 'text', width: 24 }),
              excelColumn('Ano', { type: 'integer', width: 8 }),
              excelColumn('Mês', { type: 'integer', width: 8 }),
              excelColumn('Semana', { type: 'integer', width: 10 }),
              excelColumn('Cód. produto', { type: 'integer', width: 13 }),
              excelColumn('Produto', { type: 'text', width: 46 }),
              excelColumn('QTD semana atual', { type: 'decimal', width: 16, total: true }),
              excelColumn('QTD mês anterior', { type: 'decimal', width: 16, total: true }),
              excelColumn('B/W QTD', { type: 'percent', width: 12 }),
              excelColumn('Valor unitário', { type: 'currency', width: 15 }),
              excelColumn('Valor total produto', { type: 'currency', width: 18, total: true }),
              excelColumn('Pico histórico', { type: 'decimal', width: 14 }),
              excelColumn('Semanas histórico', { type: 'integer', width: 16 }),
              excelColumn('Status comparativo', { type: 'text', width: 20 }),
            ],
            rows: produtosRows,
            totalsLabel: 'TOTAL',
            freezeColumns: 2,
            emptyMessage: 'Nenhum item encontrado nas semanas do período selecionado.',
          },
        ],
      });
      addToast('success', 'Excel semanal exportado com sucesso.');
    } catch {
      addToast('error', 'Falha ao exportar o Excel semanal.');
    } finally {
      setExportandoExcel(false);
    }
  }, [addToast, analyticsDepartamentos, analyticsFiliais, analyticsSecoes, ano, linhasTabela, mes, mesesOptions, scopeParams, vendedorAlvoId, vendedorAlvoNome, visibleWeeks, weekExportLabels]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '3px solid #d5dbd3', borderTopColor: '#137432' }} />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <p className="text-2xl mt-1" style={{ color: '#515b51' }}>
            Visão semanal das suas métricas de clientes e fechamento no mês.
          </p>
          <p className="text-sm mt-2" style={{ color: '#667266' }}>
            Vendedor: <strong>{vendedorAlvoNome}</strong>
          </p>
          {analyticsFilters?.periodoLabel ? (
            <p className="text-xs mt-2 font-semibold" style={{ color: '#137432' }}>
              Período herdado do Analytics: {analyticsFilters.periodoLabel}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 min-w-[320px]">
          <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: '#ffffff', border: '1px solid #dde5d8' }}>
            <div className="text-xs font-semibold uppercase" style={{ color: '#7b857b' }}>Clientes no mês</div>
            <div className="text-2xl font-extrabold mt-1" style={{ color: '#2f4f35' }}>{linhasTabela.length}</div>
          </div>
          <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: '#ffffff', border: '1px solid #dde5d8' }}>
            <div className="text-xs font-semibold uppercase" style={{ color: '#7b857b' }}>Fechamento do mês</div>
            <div className="text-2xl font-extrabold mt-1" style={{ color: '#1f6f39' }}>{formatCurrency(totais.fechamento)}</div>
          </div>
          <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: '#ffffff', border: '1px solid #dde5d8' }}>
            <div className="text-xs font-semibold uppercase" style={{ color: '#7b857b' }}>Clientes em alerta</div>
            <div className="text-2xl font-extrabold mt-1" style={{ color: totais.alertas > 0 ? '#b42318' : '#2f4f35' }}>{totais.alertas}</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <div className="flex flex-wrap gap-3">
          <FilterDropdown label="Ramo" value={ramoCliente} options={ramosOptions} onChange={setRamoCliente} widthClass="min-w-[240px]" />
          <FilterDropdown label="Mês" value={mes} options={mesesOptions} onChange={setMes} widthClass="min-w-[180px]" />
          <FilterDropdown label="Ano" value={ano} options={anosOptions} onChange={setAno} widthClass="min-w-[140px]" />
          <FilterDropdown label="Abaixo da expectativa" value={semanaAbaixo} options={semanaAbaixoOptions} onChange={setSemanaAbaixo} widthClass="min-w-[240px]" />
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Tabela Semanal</h2>
          <div className="flex items-center gap-2">
            {loadingTabela ? (
              <div className="w-5 h-5 rounded-full animate-spin" style={{ border: '2px solid #d5dbd3', borderTopColor: '#137432' }} />
            ) : null}
            <button
              type="button"
              onClick={exportarExcelSemanal}
              disabled={loadingTabela || exportandoExcel || linhasTabela.length === 0}
              className="h-10 px-4 rounded-xl text-sm font-bold inline-flex items-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: '#eef2eb', color: '#425242', border: '1px solid #d7dfd3' }}
            >
              {exportandoExcel ? <span className="w-4 h-4 rounded-full animate-spin" style={{ border: '2px solid #cbd5c5', borderTopColor: '#137432' }} /> : <Download size={16} />}
              Exportar Excel
            </button>
          </div>
        </div>

        {linhasTabela.length === 0 ? (
          <div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#ffffff', color: '#6e786d' }}>
            Nenhum registro encontrado para os filtros selecionados.
          </div>
        ) : (
          <div className={embeddedScroll ? 'overflow-auto max-h-[560px] rounded-xl' : 'overflow-x-auto'}>
            <table className="w-full min-w-[1480px]">
              <thead className={embeddedScroll ? 'sticky top-0 z-10' : undefined} style={embeddedScroll ? { backgroundColor: '#f8faf7' } : undefined}>
                <tr className="text-left text-xs" style={{ color: '#788378' }}>
                  <th className="px-3 py-3">Cliente</th>
                  <th className="px-3 py-3">Curva</th>
                  <th className="px-3 py-3">Ramo</th>
                  {visibleWeekHeaders.map((header) => (
                    <th key={`head-week-${header.weekNumber}`} className="px-3 py-3"><WeekColumnHeader label={header.label} range={header.range} /></th>
                  ))}
                  <th className="px-3 py-3">Fechamento mês anterior</th>
                  <th className="px-3 py-3">Fechamento do mês</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>

              <tbody>
                {linhasTabela.map((linha) => {
                  const statusMensal = monthlyStatusFromDelta(linha.DELTA_BW_FECHAMENTO_MES);
                  const statusStyle = styleStatus(statusMensal);
                  const isExpanded = clienteExpandidoId === linha.CLIENTE_ID;
                  const weekKey = semanaAbertaPorCliente[linha.CLIENTE_ID] || null;

                  return (
                    <Fragment key={`row-block-${linha.CLIENTE_ID}`}>
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
                        {visibleWeeks.map((week) => (
                          <td key={`cell-${linha.CLIENTE_ID}-${week}`} className="px-3 py-3 text-sm" style={{ color: '#434c43' }}>
                            <SemanaValue value={getWeekValue(linha, week)} delta={getWeekDelta(linha, week)} />
                          </td>
                        ))}
                        <td className="px-3 py-3 text-sm font-semibold" style={{ color: '#5f6b5d' }}>{formatCurrency(linha.FECHAMENTO_MES_ANTERIOR)}</td>
                        <td className="px-3 py-3 text-sm font-semibold" style={{ color: '#1f6f39' }}><FechamentoMesValue value={linha.FECHAMENTO_MES} delta={linha.DELTA_BW_FECHAMENTO_MES} /></td>
                        <td className="px-3 py-3">
                          <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}>
                            {statusMensal}
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
                              anoFiltrado={ano}
                              scopeParams={scopeParams}
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

                <tr style={{ borderTop: '2px solid #dce5d8', backgroundColor: '#f0f5ee' }}>
                  <td className="px-3 py-3 text-sm font-bold" style={{ color: '#2a312a' }}>TOTAL</td>
                  <td className="px-3 py-3" colSpan={2} />
                  {visibleWeeks.map((week) => (
                    <td key={`total-week-${week}`} className="px-3 py-3 text-sm font-bold" style={{ color: '#2f4f35' }}>{formatCurrency((totais as any)[`sem${week}`] || 0)}</td>
                  ))}
                  <td className="px-3 py-3 text-sm font-bold" style={{ color: '#5f6b5d' }}>{formatCurrency(totais.fechamentoAnterior)}</td>
                  <td className="px-3 py-3 text-sm font-bold" style={{ color: '#1f6f39' }}><FechamentoMesValue value={totais.fechamento} delta={deltaFechamentoTotal} /></td>
                  <td className="px-3 py-3">
                    <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: statusStyleTotal.bg, color: statusStyleTotal.color }}>
                      {statusMensalTotal}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
