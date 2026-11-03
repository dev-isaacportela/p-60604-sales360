import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Bell, CalendarClock, CheckCircle2, ChevronRight, MapPin, PackagePlus, ShoppingCart, Target, X, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { callSF, callSFSingle, SF, formatCurrency, getBrasiliaDate } from '../hooks/useMitra';
import { CoordinatorScopeFilter, useCoordinatorScope } from '../components/CoordinatorScopeFilter';

interface KpiData {
  VENDAS_MES: number;
  VENDAS_BRUTAS_MES?: number;
  DEVOLUCOES_MES?: number;
  META_MES: number;
  VISITAS_MES: number;
  CLIENTES_ATIVOS: number;
}

interface MetaResumoData {
  VALOR_META: number;
  VALOR_REALIZADO: number;
  PERCENTUAL_ATINGIDO: number;
  PROJECAO_FECHAMENTO: number;
  STATUS: 'acima' | 'no_ritmo' | 'abaixo' | string;
}

interface AlertaInteligenteResumo {
  ID: number;
  ID_CLIENTE: number;
  NOME_CLIENTE: string;
  TITULO: string;
  PRIORIDADE: string;
}

interface VisitaSemanaResumo {
  ID: number;
  DATA_VISITA: string;
  DATA_RELATO: string;
  CLIENTE: string;
  STATUS_VISITA: string;
  STATUS_RELATO: string;
}

interface VisitaSemanaMeta {
  DATA_AGENDADA?: string;
  DATA_VISITA?: string;
  STATUS?: string;
  STATUS_VISITA?: string;
  ORIGEM?: string;
  TIPO?: string;
}

const META_VISITAS_SEMANAIS_POR_VENDEDOR = 16;
const META_VISITAS_SEMANAIS_POR_COORDENADOR = 8;

function getMetaSemanalPessoa(item: { IS_OWN_SCOPE?: number | boolean; IS_COORDENADOR?: number | boolean } | null | undefined): number {
  return Number(item?.IS_COORDENADOR || item?.IS_OWN_SCOPE || 0) === 1
    ? META_VISITAS_SEMANAIS_POR_COORDENADOR
    : META_VISITAS_SEMANAIS_POR_VENDEDOR;
}

function mapProspectVisitsToMeta(rows: any[], targetUserIds: number[]): VisitaSemanaMeta[] {
  const allowed = new Set(targetUserIds.filter((id) => Number.isFinite(id) && id > 0));
  if (allowed.size === 0) return [];
  return rows
    .filter((row) => allowed.has(Number(row.EXECUTIVO_ID || 0)))
    .map((row) => ({
      DATA_AGENDADA: row.DATA_VISITA || '',
      STATUS: row.STATUS || '',
      ORIGEM: 'PROSPECCAO',
    }));
}

function mapProspectVisitsToResumo(rows: any[], targetUserIds: number[]): VisitaSemanaResumo[] {
  const allowed = new Set(targetUserIds.filter((id) => Number.isFinite(id) && id > 0));
  if (allowed.size === 0) return [];
  return rows
    .filter((row) => allowed.has(Number(row.EXECUTIVO_ID || 0)))
    .map((row) => {
      const status = String(row.STATUS || '').toUpperCase();
      const resumo = String(row.RESUMO || '').trim();
      return {
        ID: -Number(row.ID || 0),
        DATA_VISITA: row.DATA_VISITA || '',
        DATA_RELATO: status === 'CONCLUIDA' ? String(row.ATUALIZADO_EM || row.DATA_VISITA || '').slice(0, 10) : '',
        CLIENTE: row.RAZAO_SOCIAL || row.NOME_FANTASIA || 'Prospect',
        STATUS_VISITA: status || 'AGENDADA',
        STATUS_RELATO: resumo ? 'OK' : 'PENDENTE',
      };
    });
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateFromIso(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

function isBusinessDayIso(value: string): boolean {
  if (!value) return false;
  const day = dateFromIso(value.slice(0, 10)).getDay();
  return day >= 1 && day <= 5;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const coordinatorScope = useCoordinatorScope('dashboard');
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [nomeUsuario, setNomeUsuario] = useState('');
  const [vendasDiarias, setVendasDiarias] = useState<any[]>([]);
  const [visitasHoje, setVisitasHoje] = useState<any[]>([]);
  const [tarefas, setTarefas] = useState<any[]>([]);
  const [metaResumo, setMetaResumo] = useState<MetaResumoData | null>(null);
  const [topAlertas, setTopAlertas] = useState<AlertaInteligenteResumo[]>([]);
  const [visitasSemanaResumo, setVisitasSemanaResumo] = useState<VisitaSemanaResumo[]>([]);
  const [visitasSemanaMeta, setVisitasSemanaMeta] = useState<VisitaSemanaMeta[]>([]);
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);
  const [diaEmFoco, setDiaEmFoco] = useState<string | null>(null);
  const [compromissosModalOpen, setCompromissosModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadVersionRef = useRef(0);

  useEffect(() => {
    if (coordinatorScope.loadingScope) return;
    const loadVersion = ++loadVersionRef.current;
    setLoading(true);
    const now = new Date();
    const hoje = getBrasiliaDate();
    const dataInicioMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const dataFimMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
    const inicioSemana = startOfWeek(dateFromIso(hoje));
    const fimSemana = addDays(inicioSemana, 4);
    const filtrosLiquidos = { dataInicio: dataInicioMes, dataFim: dataFimMes, departamentos: '', ramos: '', limit: '100', offset: '0', ...coordinatorScope.scopeParams };
    const scopeInput = coordinatorScope.scopeParams;

    Promise.allSettled([
      callSFSingle(SF.dashboardKpis, scopeInput),
      callSF(SF.dadosUsuarioLogado, {}),
      callSF(SF.dashboardVendasDiarias, scopeInput),
      callSF(SF.visitasDoDia, { data: hoje, ...scopeInput }),
      callSF(SF.listarTarefas, { status: '', prioridade: '', ...scopeInput }),
      callSFSingle(SF.metaRealizadoProjecao, { ANO: String(now.getFullYear()), MES: String(now.getMonth() + 1), ...scopeInput }),
      callSF(SF.alertasInteligentesListar, { somenteNaoLidos: 'true', prioridade: 'ALTA', limite: '5', ...scopeInput }),
      callSFSingle(SF.analyticsRcaMetaResumo, filtrosLiquidos),
      callSF(SF.dashboardVisitasSemanaResumo, scopeInput),
      callSF(SF.listarVisitasPeriodo, { dataInicio: toIsoDate(inicioSemana), dataFim: toIsoDate(fimSemana), ...scopeInput }),
      callSF(SF.prospectsVisitasListar, { dataInicio: toIsoDate(inicioSemana), dataFim: toIsoDate(fimSemana), status: '', limit: '500', offset: '0' }),
    ]).then(async ([kR, uR, vR, visitasHojeR, tR, metaR, alertasInteligentesR, liquidoR, visitasSemanaR, visitasSemanaMetaR, prospectVisitasSemanaR]) => {
      if (loadVersionRef.current !== loadVersion) return;
      const kpisBase = kR.status === 'fulfilled' && kR.value ? kR.value : null;
      const vendasDiariasRows = vR.status === 'fulfilled' ? (vR.value || []) : [];
      const liquidoValue = liquidoR.status === 'fulfilled' ? liquidoR.value : null;
      let usuarioLogadoId = 0;
      if (liquidoValue) {
        setKpis({
          ...(kpisBase || { META_MES: 0, VISITAS_MES: 0, CLIENTES_ATIVOS: 0 }),
          VENDAS_MES: Number(liquidoValue.FATURAMENTO_LIQUIDO || 0),
          VENDAS_BRUTAS_MES: Number(liquidoValue.FATURAMENTO_BRUTO || 0),
          DEVOLUCOES_MES: Number(liquidoValue.TOTAL_DEVOLVIDO || 0),
        });
      } else if (kpisBase) {
        setKpis(kpisBase);
      }

      if (uR.status === 'fulfilled') {
        const userRow = (uR.value?.[0] as any) || {};
        usuarioLogadoId = Number(userRow.ID || userRow.USER_ID || 0) || 0;
        const nomeRaw = String(userRow.NOME_INTERNO || '').trim();
        const emailRaw = String(userRow.EMAIL || '').trim();

        let nome = nomeRaw;
        if (!nome || nome.includes('@')) {
          const localPart = (emailRaw.split('@')[0] || '').trim();
          const normalizado = localPart.replace(/[._-]+/g, ' ').trim();
          nome = normalizado
            .split(' ')
            .filter(Boolean)
            .map((parte: string) => parte.charAt(0).toUpperCase() + parte.slice(1).toLowerCase())
            .join(' ');
        }

        setNomeUsuario(nome);
      }

      if (vR.status === 'fulfilled') setVendasDiarias(vendasDiariasRows);
      setVisitasHoje(visitasHojeR.status === 'fulfilled' ? (visitasHojeR.value || []) : []);
      if (tR.status === 'fulfilled') setTarefas(tR.value);
      if (coordinatorScope.scopeParams.scopeMode !== 'ME' && liquidoValue) {
        const metaTime = liquidoValue as any;
        setMetaResumo({
          VALOR_META: Number(metaTime.VALOR_META || 0),
          VALOR_REALIZADO: Number(metaTime.FATURAMENTO_LIQUIDO || 0),
          PERCENTUAL_ATINGIDO: Number(metaTime.PERCENTUAL_META || 0),
          PROJECAO_FECHAMENTO: Number(metaTime.PROJECAO_FECHAMENTO || 0),
          STATUS: Number(metaTime.PERCENTUAL_META || 0) >= 100 ? 'acima' : Number(metaTime.PERCENTUAL_META || 0) >= 80 ? 'no_ritmo' : 'abaixo',
        });
      } else if (metaR.status === 'fulfilled' && metaR.value) setMetaResumo(metaR.value as MetaResumoData);
      if (alertasInteligentesR.status === 'fulfilled') setTopAlertas((alertasInteligentesR.value || []).slice(0, 5) as AlertaInteligenteResumo[]);
      const scopeMode = coordinatorScope.scopeParams.scopeMode;
      const vendedoresMetaScope = coordinatorScope.vendedoresFiltradosScope.length
        ? coordinatorScope.vendedoresFiltradosScope
        : coordinatorScope.vendedoresScope;
      const targetUserIds = scopeMode === 'SELLER'
        ? [Number(coordinatorScope.scopeParams.scopeUserId || 0)]
        : scopeMode === 'TEAM' || scopeMode === 'GLOBAL'
          ? vendedoresMetaScope.map((vendedor) => Number(vendedor.USER_ID || 0))
          : [usuarioLogadoId];
      const prospectRows = prospectVisitasSemanaR.status === 'fulfilled' ? (prospectVisitasSemanaR.value || []) : [];
      if (visitasSemanaR.status === 'fulfilled') {
        const visitasBase = (visitasSemanaR.value || []) as VisitaSemanaResumo[];
        const visitasProspeccao = mapProspectVisitsToResumo(prospectRows, targetUserIds);
        setVisitasSemanaResumo([...visitasBase, ...visitasProspeccao].sort((a, b) => String(b.DATA_VISITA || '').localeCompare(String(a.DATA_VISITA || ''))));
      }
      if (visitasSemanaMetaR.status === 'fulfilled') {
        const visitasBase = (visitasSemanaMetaR.value || []) as VisitaSemanaMeta[];
        const visitasProspeccao = mapProspectVisitsToMeta(prospectRows, targetUserIds);
        setVisitasSemanaMeta([...visitasBase, ...visitasProspeccao]);
      }
      setLoading(false);
    });
  }, [coordinatorScope.loadingScope, coordinatorScope.scopeParams, coordinatorScope.vendedoresFiltradosScope, coordinatorScope.vendedoresScope]);

  const isCoordinatorOwnScope = coordinatorScope.isCoordinatorScope && coordinatorScope.scopeParams.scopeMode === 'ME';
  const vendedorSelecionadoMeta = coordinatorScope.vendedoresScope.find((vendedor) => String(vendedor.USER_ID || '') === coordinatorScope.scopeParams.scopeUserId) || null;
  const vendedoresMetaScope = coordinatorScope.vendedoresFiltradosScope.length
    ? coordinatorScope.vendedoresFiltradosScope
    : coordinatorScope.vendedoresScope;
  const metaVisitasSemana = isCoordinatorOwnScope ? META_VISITAS_SEMANAIS_POR_COORDENADOR : getMetaSemanalPessoa(vendedorSelecionadoMeta);
  const concluida = visitasSemanaMeta.filter((visita) => {
    const origem = String(visita.ORIGEM || 'VISITA').toUpperCase();
    const tipo = String(visita.TIPO || '').toLowerCase();
    const status = String(visita.STATUS || visita.STATUS_VISITA || '').toUpperCase();
    const data = String(visita.DATA_AGENDADA || visita.DATA_VISITA || '');
    const contaNaMeta = origem !== 'INTERNA' || tipo === 'deslocamento';
    return contaNaMeta && status === 'CONCLUIDA' && isBusinessDayIso(data);
  }).length;
  const metaSemanal = coordinatorScope.scopeParams.scopeMode === 'TEAM' || coordinatorScope.scopeParams.scopeMode === 'GLOBAL'
    ? Math.max(1, vendedoresMetaScope.reduce((total, vendedor) => total + getMetaSemanalPessoa(vendedor), 0))
    : metaVisitasSemana;
  const progresso = Math.min(100, Math.round((concluida / metaSemanal) * 100));
  const visitasRestantesMeta = Math.max(0, metaSemanal - concluida);
  const metaMensalRealizado = Number(metaResumo?.VALOR_REALIZADO ?? kpis?.VENDAS_MES ?? 0);
  const metaMensalValor = Number(metaResumo?.VALOR_META ?? kpis?.META_MES ?? 0);
  const metaPercentual = metaMensalValor > 0 ? Math.max(0, Math.min(100, Math.round((metaMensalRealizado / metaMensalValor) * 100))) : 0;
  const metaStatusKey = String(metaResumo?.STATUS || '').toLowerCase();
  const metaStatus = metaStatusKey === 'acima'
    ? { label: 'Acima da meta', bg: '#e6f4ea', color: '#1f7d3f', bar: '#137432' }
    : metaStatusKey === 'no_ritmo'
      ? { label: 'No ritmo', bg: '#fff4dc', color: '#a26a00', bar: '#d49500' }
      : { label: 'Abaixo da meta', bg: '#fde8e8', color: '#b42318', bar: '#d64545' };

  const serieDiaria = useMemo(() => {
    if (!vendasDiarias.length) return [];
    const max = Math.max(...vendasDiarias.map((item: any) => Number(item.VALOR_ATUAL || 0)), 1);
    return vendasDiarias.map((item: any, idx: number) => {
      const label = String(item.DIA_LABEL || item.DATA_REF || '').trim();
      const amount = Number(item.VALOR_ATUAL || 0);
      const previous = item.VALOR_ANTERIOR === null || item.VALOR_ANTERIOR === undefined ? null : Number(item.VALOR_ANTERIOR || 0);
      const rawPercent = item.VARIACAO_DIA === null || item.VARIACAO_DIA === undefined ? null : Number(item.VARIACAO_DIA);

      return {
        label,
        amount,
        previous,
        percent: Number.isFinite(rawPercent) ? rawPercent : null,
        height: 36 + Math.round((amount / max) * 124),
        selected: diaSelecionado === label,
        focused: diaEmFoco === label,
        today: idx === vendasDiarias.length - 1,
      };
    });
  }, [vendasDiarias, diaSelecionado, diaEmFoco]);

  const resumoDia = useMemo(() => {
    if (!serieDiaria.length) return null;
    const selecionado = serieDiaria.find((dia: any) => dia.selected) || serieDiaria.find((dia: any) => dia.focused);
    return selecionado || serieDiaria[serieDiaria.length - 1];
  }, [serieDiaria]);

  function formatPercentChange(value: number | null) {
    if (value === null || Number.isNaN(value)) return '—';
    const formatted = Math.abs(value).toFixed(1).replace('.', ',');
    if (value > 0) return `+${formatted}%`;
    if (value < 0) return `-${formatted}%`;
    return '0,0%';
  }

  function irParaTarefas() {
    navigate('/tarefas');
  }

  function formatDateSafe(value: string) {
    const raw = String(value || '').trim();
    if (!raw) return 'Pendente';
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return raw;
    const [, year, month, day] = match;
    return `${day}/${month}/${year}`;
  }

  function visitaStatusLabel(status: string) {
    if (status === 'CONCLUIDA') return 'Concluída';
    if (status === 'EM_ANDAMENTO') return 'Em andamento';
    if (status === 'AGENDADA') return 'Agendada';
    if (status === 'CANCELADA') return 'Cancelada';
    return status || '-';
  }

  function compromissoTitulo(item: any) {
    const origem = String(item.ORIGEM || '').toUpperCase();
    if (origem === 'INTERNA') return item.TITULO_INTERNO || item.CLIENTE || 'Agenda interna';
    return item.CLIENTE || 'Visita sem cliente informado';
  }

  function compromissoSubtitulo(item: any) {
    const origem = String(item.ORIGEM || '').toUpperCase();
    if (origem === 'INTERNA') return item.PARTICIPANTES ? `Convidados: ${item.PARTICIPANTES}` : 'Agenda interna';
    return [item.CIDADE, item.VENDEDOR_NOME ? `Vendedor: ${item.VENDEDOR_NOME}` : ''].filter(Boolean).join(' · ');
  }

  const activities = tarefas.slice(0, 3);
  const saudacaoNome = nomeUsuario || 'você';
  const horaAtual = new Date().getHours();
  const saudacao = horaAtual < 12 ? 'Bom dia' : horaAtual < 18 ? 'Boa tarde' : 'Boa noite';
  const quantidadeVisitasHoje = visitasHoje.length;
  const textoVisitasHoje = quantidadeVisitasHoje > 0
    ? <>Você tem <span style={{ color: '#137432', fontWeight: 700 }}>{quantidadeVisitasHoje} {quantidadeVisitasHoje === 1 ? 'compromisso' : 'compromissos'}</span> para hoje.</>
    : <>Você não tem <span style={{ color: '#137432', fontWeight: 700 }}>nenhum compromisso</span> para hoje.</>;
  const resumoDiaPercent = resumoDia?.percent ?? null;

  function CircularGoal({ percent, value, label, color }: { percent: number; value: string; label: string; color: string }) {
    const safePercent = Math.max(0, Math.min(100, percent));
    return (
      <div
        className="h-32 w-32 rounded-full flex items-center justify-center shrink-0 sm:h-36 sm:w-36"
        style={{ background: `conic-gradient(${color} ${safePercent}%, #e2e5df ${safePercent}% 100%)` }}
      >
        <div className="h-24 w-24 rounded-full flex flex-col items-center justify-center sm:h-28 sm:w-28" style={{ backgroundColor: '#f9faf8' }}>
          <p className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>{value}</p>
          <p className="label-ui text-[10px] font-semibold mt-1" style={{ color: '#8a9288' }}>{label}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '3px solid #d4d9d0', borderTopColor: '#137432' }} />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="mb-5 sm:mb-6">
        <CoordinatorScopeFilter scope={coordinatorScope} />
      </div>

      <div className="mb-5 sm:mb-6">
        <h1 className="font-display text-3xl font-extrabold sm:text-5xl" style={{ color: '#1b1c1a' }}>{`${saudacao}, ${saudacaoNome}.`}</h1>
        <button
          type="button"
          onClick={() => setCompromissosModalOpen(true)}
          className="mt-2 block text-left text-base transition-colors hover:underline sm:text-xl"
          style={{ color: '#636c61' }}
        >
          {textoVisitasHoje}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
        <section className="rounded-[30px] p-5 sm:p-7" style={{ backgroundColor: '#f9faf8' }}>
          <div className="flex items-center justify-between gap-5">
            <div>
              <p className="label-ui text-xs font-semibold" style={{ color: '#8a9288' }}>Meta semanal de visitas</p>
              <div className="mt-3 flex items-center gap-2" style={{ color: '#137432' }}>
                <Target size={18} />
                <span className="text-sm font-semibold">Acompanhamento semanal</span>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
                <span style={{ color: '#4d564b' }}>Realizadas: <strong style={{ color: '#1b1c1a' }}>{concluida}</strong></span>
                <span style={{ color: '#4d564b' }}>Meta: <strong style={{ color: '#1b1c1a' }}>{metaSemanal}</strong></span>
                <span style={{ color: '#4d564b' }}>Restantes: <strong style={{ color: '#1b1c1a' }}>{visitasRestantesMeta}</strong></span>
              </div>
              <p className="mt-2 text-xs font-semibold" style={{ color: '#7b8379' }}>{coordinatorScope.scopeParams.scopeMode === 'TEAM' || coordinatorScope.scopeParams.scopeMode === 'GLOBAL' ? `Meta composta do filtro atual: vendedores ${META_VISITAS_SEMANAIS_POR_VENDEDOR}/semana e coordenadores ${META_VISITAS_SEMANAIS_POR_COORDENADOR}/semana.` : `Meta de ${metaVisitasSemana} visitas ou deslocamentos úteis de segunda a sexta.`}</p>
            </div>
            <CircularGoal percent={progresso} value={`${progresso}%`} label="Meta" color="#137432" />
          </div>
        </section>

        <section className="rounded-[30px] p-5 sm:p-7" style={{ backgroundColor: '#f9faf8' }}>
          <div className="flex items-center justify-between gap-5">
            <div>
              <p className="label-ui text-xs font-semibold" style={{ color: '#8a9288' }}>Meta mensal de faturamento</p>
              <p className="font-display text-3xl font-extrabold mt-2 sm:text-4xl" style={{ color: '#1b1c1a' }}>{formatCurrency(metaMensalRealizado)}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                <span style={{ color: '#5f6a5e' }}>{metaPercentual}% de {formatCurrency(metaMensalValor)}</span>
                <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: metaStatus.bg, color: metaStatus.color }}>{metaStatus.label}</span>
              </div>
            </div>
            <CircularGoal percent={metaPercentual} value={`${metaPercentual}%`} label="Meta" color={metaStatus.bar} />
          </div>
        </section>
      </div>

      <section className="rounded-[30px] p-5 sm:p-7 mb-5" style={{ backgroundColor: '#f9faf8' }}>
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
          <div className="min-w-0">
            <p className="label-ui text-xs font-semibold" style={{ color: '#8a9288' }}>Vendas líquidas diárias</p>
            <p className="font-display text-3xl font-extrabold mt-2 sm:text-5xl" style={{ color: '#1b1c1a' }}>{formatCurrency(Number(resumoDia?.amount || 0))}</p>
            <p className="text-xs font-semibold mt-2" style={{ color: '#7b8379' }}>
              Bruto {formatCurrency(Number(kpis?.VENDAS_BRUTAS_MES ?? kpis?.VENDAS_MES ?? 0))} - devoluções {formatCurrency(Number(kpis?.DEVOLUCOES_MES || 0))} no mês
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-3 2xl:w-auto 2xl:justify-end">
            {resumoDia && (
              <div className="rounded-full px-4 py-2 text-sm font-semibold flex items-center gap-2" style={{ backgroundColor: '#ecf7ef', color: '#1f6d52' }}>
                <ArrowUpRight size={16} /> {resumoDia.label}: {formatCurrency(resumoDia.amount)}
              </div>
            )}
            <div
              className="rounded-full px-4 py-2 text-sm font-semibold flex items-center gap-2"
              style={{
                backgroundColor: resumoDiaPercent === null ? '#eceee9' : resumoDiaPercent >= 0 ? '#c9efe0' : '#ffe5dd',
                color: resumoDiaPercent === null ? '#7f887c' : resumoDiaPercent >= 0 ? '#1f6d52' : '#aa3f1e',
              }}
            >
              <ArrowUpRight size={16} /> {formatPercentChange(resumoDiaPercent)} vs dia anterior
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-3xl p-3 sm:mt-10 sm:p-0" style={{ backgroundColor: '#ffffff' }}>
          <div className="mb-3 flex items-center justify-between gap-3 sm:hidden">
            <p className="text-xs font-semibold" style={{ color: '#7b8379' }}>Últimos 7 dias úteis</p>
            <p className="text-xs font-semibold" style={{ color: '#137432' }}>Toque em uma barra</p>
          </div>
          <div className="flex min-w-0 items-end gap-2 sm:min-w-[520px] sm:gap-4">
            {serieDiaria.map((dia: any) => (
              <button
                key={dia.label}
                type="button"
                className="min-w-0 flex-1 text-center group focus:outline-none"
                onClick={() => setDiaSelecionado((atual) => (atual === dia.label ? null : dia.label))}
                onMouseEnter={() => setDiaEmFoco(dia.label)}
                onMouseLeave={() => setDiaEmFoco(null)}
                title={`${dia.label}: ${formatCurrency(dia.amount)} (${formatPercentChange(dia.percent)})`}
                aria-pressed={dia.selected}
              >
                <div className="mb-2 min-h-7 flex flex-col items-center justify-end gap-1 sm:mb-3 sm:min-h-10">
                  <p className="hidden text-[11px] font-semibold transition-opacity sm:block" style={{ color: dia.selected || dia.focused ? '#137432' : '#8a9288', opacity: dia.selected || dia.focused ? 1 : 0.8 }}>{formatCurrency(dia.amount)}</p>
                  <p className="text-[10px] font-medium transition-opacity" style={{ color: dia.selected || dia.focused ? '#1f6d52' : '#9aa39a' }}>{formatPercentChange(dia.percent)}</p>
                </div>
                <div
                  className="mx-auto w-full max-w-8 rounded-xl transition-all duration-200 sm:max-w-none"
                  style={{
                    height: `${dia.height}px`,
                    backgroundColor: dia.selected ? '#0f5f2f' : dia.focused ? '#2b8a4a' : dia.today ? '#137432' : '#e2e2e0',
                    transform: dia.selected || dia.focused ? 'translateY(-2px)' : 'translateY(0)',
                    boxShadow: dia.selected || dia.focused ? '0 10px 24px rgba(19, 116, 50, 0.18)' : 'none',
                  }}
                />
                <p className="mt-2 truncate text-[10px] label-ui font-semibold transition-colors sm:mt-3 sm:text-xs" style={{ color: dia.selected || dia.focused ? '#137432' : '#939b91' }}>{dia.label}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <section className="xl:col-span-9 rounded-[30px] overflow-hidden" style={{ backgroundColor: '#f9faf8' }}>
          <div className="flex items-center justify-between px-7 py-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#fde8e8', color: '#b42318' }}>
                <Bell size={20} />
              </div>
              <h3 className="font-display text-3xl font-extrabold sm:text-4xl" style={{ color: '#1b1c1a' }}>Alertas não lidos</h3>
            </div>
            <button className="text-lg font-semibold" style={{ color: '#137432' }} onClick={() => navigate('/alertas')}>Ver todos</button>
          </div>

          <div className="px-7 pb-6">
            {topAlertas.length === 0 ? (
              <div className="rounded-2xl p-4 text-sm" style={{ backgroundColor: '#ffffff', color: '#6f786d' }}>Nenhum alerta de alta prioridade pendente.</div>
            ) : (
              <div className="space-y-2">
                {topAlertas.map((alerta) => (
                  <button
                    key={`top-alerta-${alerta.ID}`}
                    type="button"
                    className="grid w-full grid-cols-12 items-center gap-3 px-4 py-4 rounded-2xl text-left transition-colors"
                    style={{ backgroundColor: '#ffffff', border: '1px solid #f6caca' }}
                    onClick={() => navigate(`/alertas?alertaId=${alerta.ID}&clienteId=${alerta.ID_CLIENTE}`)}
                  >
                    <div className="col-span-12 sm:col-span-4">
                      <p className="text-xs font-semibold" style={{ color: '#b42318' }}>Cliente</p>
                      <p className="text-lg font-semibold mt-1" style={{ color: '#1b1c1a' }}>{alerta.NOME_CLIENTE || `Cliente ${alerta.ID_CLIENTE}`}</p>
                    </div>
                    <div className="col-span-12 sm:col-span-6">
                      <p className="text-xs font-semibold" style={{ color: '#7b8379' }}>Alerta</p>
                      <p className="text-base font-semibold mt-1" style={{ color: '#1b1c1a' }}>{alerta.TITULO}</p>
                    </div>
                    <div className="col-span-10 sm:col-span-1">
                      <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: '#fde8e8', color: '#b42318' }}>{alerta.PRIORIDADE || 'ALTA'}</span>
                    </div>
                    <div className="col-span-2 sm:col-span-1 flex justify-end" style={{ color: '#8f978c' }}>
                      <ChevronRight size={20} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="xl:col-span-3 rounded-[30px] p-6 relative" style={{ backgroundColor: '#f9faf8' }}>
          <h3 className="font-display text-4xl font-extrabold mb-4" style={{ color: '#1b1c1a' }}>Últimas Atividades</h3>
          <div className="space-y-4">
            {activities.length === 0 ? (
              <div className="rounded-2xl p-4 text-sm" style={{ backgroundColor: '#ffffff', color: '#6f786d' }}>Nenhuma atividade recente.</div>
            ) : activities.map((a: any, idx: number) => (
              <button key={a.ID} className="rounded-2xl p-3 w-full text-left" style={{ backgroundColor: '#ffffff' }} onClick={irParaTarefas}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: idx === 0 ? '#e6f4e8' : idx === 1 ? '#eaf0ff' : '#f2eaff' }}>
                    {idx === 0 ? <ShoppingCart size={16} style={{ color: '#137432' }} /> : idx === 1 ? <PackagePlus size={16} style={{ color: '#3a63c7' }} /> : <MapPin size={16} style={{ color: '#8f40c5' }} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl font-semibold leading-tight" style={{ color: '#1b1c1a' }}>{a.TITULO}</p>
                    <p className="text-base mt-1" style={{ color: '#7b8379' }}>{a.DESCRICAO || 'Atividade registrada na agenda comercial.'}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <button className="w-full mt-5 py-3 rounded-2xl text-sm label-ui font-semibold" style={{ color: '#8e978d', backgroundColor: '#f2f3f0' }} onClick={irParaTarefas}>Ver histórico completo</button>
          <button className="w-full mt-3 py-3 rounded-2xl text-sm label-ui font-semibold" style={{ color: '#ffffff', backgroundColor: '#137432' }} onClick={() => navigate('/agenda')}>Abrir agenda do dia</button>
        </section>
      </div>

      <section className="mt-5 rounded-[30px] overflow-hidden" style={{ backgroundColor: '#f9faf8' }}>
        <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#e8efff', color: '#3559c7' }}>
              <CalendarClock size={20} />
            </div>
            <div>
              <h3 className="font-display text-3xl font-extrabold sm:text-4xl" style={{ color: '#1b1c1a' }}>Resumo da Semana</h3>
              <p className="text-sm" style={{ color: '#6f786d' }}>Últimas visitas da semana e pendências de relato.</p>
            </div>
          </div>
          <button className="text-sm font-semibold sm:text-lg" style={{ color: '#137432' }} onClick={() => navigate('/agenda')}>Ver agenda completa</button>
        </div>

        <div className="px-5 pb-6 sm:px-7">
          <div className="overflow-hidden rounded-2xl" style={{ border: '1px solid #e5e9e1', backgroundColor: '#ffffff' }}>
            <div className="hidden grid-cols-12 px-4 py-3 text-[10px] label-ui font-semibold md:grid" style={{ color: '#7c8579', backgroundColor: '#edf0eb' }}>
              <div className="col-span-2">Data da visita</div>
              <div className="col-span-2">Data do relato</div>
              <div className="col-span-4">Cliente</div>
              <div className="col-span-2">Status da visita</div>
              <div className="col-span-2 text-right">Relato</div>
            </div>

            {visitasSemanaResumo.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm" style={{ color: '#6f786d' }}>Nenhuma visita registrada nesta semana.</div>
            ) : (
              visitasSemanaResumo.map((visita) => {
                const relatoOk = String(visita.STATUS_RELATO || '').toUpperCase() === 'OK';
                return (
                  <div key={visita.ID} className="grid grid-cols-1 gap-2 px-4 py-4 md:grid-cols-12 md:items-center" style={{ borderTop: '1px solid #edf0ea' }}>
                    <div className="text-sm font-semibold md:col-span-2" style={{ color: '#2d352c' }}>
                      <span className="md:hidden" style={{ color: '#7c8579' }}>Visita: </span>{formatDateSafe(visita.DATA_VISITA)}
                    </div>
                    <div className="text-sm md:col-span-2" style={{ color: relatoOk ? '#1f7d3f' : '#b42318' }}>
                      <span className="md:hidden" style={{ color: '#7c8579' }}>Relato: </span>{formatDateSafe(visita.DATA_RELATO)}
                    </div>
                    <div className="text-base font-semibold md:col-span-4" style={{ color: '#1b1c1a' }}>{visita.CLIENTE}</div>
                    <div className="md:col-span-2">
                      <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: '#eef0f5', color: '#46556f' }}>{visitaStatusLabel(visita.STATUS_VISITA)}</span>
                    </div>
                    <div className="md:col-span-2 md:text-right">
                      <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: relatoOk ? '#e7f6ea' : '#fdecec', color: relatoOk ? '#1f7d3f' : '#b33a3a' }}>
                        {relatoOk ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                        {relatoOk ? 'Ok' : 'Relato pendente'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {compromissosModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22, 26, 22, 0.36)' }}>
          <div className="w-full max-w-2xl rounded-[30px] p-6 animate-scaleIn" style={{ backgroundColor: '#f9faf8', border: '1px solid #dfe6da' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-3xl font-extrabold sm:text-4xl" style={{ color: '#1b1c1a' }}>Compromissos de hoje</h3>
                <p className="mt-1 text-sm" style={{ color: '#6f786d' }}>
                  {quantidadeVisitasHoje} {quantidadeVisitasHoje === 1 ? 'compromisso encontrado' : 'compromissos encontrados'} para hoje.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompromissosModalOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ backgroundColor: '#edf1e9', color: '#5f6a5d' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-5 max-h-[58vh] space-y-2 overflow-y-auto pr-1">
              {visitasHoje.length === 0 ? (
                <div className="rounded-2xl p-5 text-sm" style={{ backgroundColor: '#ffffff', color: '#6f786d' }}>
                  Nenhum compromisso agendado para hoje.
                </div>
              ) : (
                visitasHoje.map((item: any) => {
                  const origem = String(item.ORIGEM || '').toUpperCase();
                  const isInterna = origem === 'INTERNA';
                  return (
                    <article key={`${origem || 'VISITA'}-${item.ID}`} className="rounded-2xl p-4" style={{ backgroundColor: '#ffffff', border: '1px solid #e5e9e1' }}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold" style={{ color: '#7b8379' }}>
                            {item.HORA_INICIO || '--:--'}{item.HORA_FIM ? ` - ${item.HORA_FIM}` : ''} · {item.TIPO || (isInterna ? 'Agenda interna' : 'Visita')}
                          </p>
                          <h4 className="mt-1 text-lg font-bold" style={{ color: '#1b1c1a' }}>{compromissoTitulo(item)}</h4>
                          <p className="mt-1 text-sm" style={{ color: '#6f786d' }}>{compromissoSubtitulo(item)}</p>
                        </div>
                        <span className="self-start rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: isInterna ? '#e9eefb' : '#eef0f5', color: isInterna ? '#3156a3' : '#46556f' }}>
                          {isInterna ? 'Agenda interna' : visitaStatusLabel(String(item.STATUS || item.STATUS_VISITA || ''))}
                        </span>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t pt-4" style={{ borderColor: '#dfe6da' }}>
              <button
                type="button"
                onClick={() => navigate('/agenda')}
                className="rounded-xl px-4 py-2 text-sm font-semibold"
                style={{ backgroundColor: '#137432', color: '#ffffff' }}
              >
                Abrir agenda completa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
