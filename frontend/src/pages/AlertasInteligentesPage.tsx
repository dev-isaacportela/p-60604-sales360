import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bell, CheckCircle2, ChevronDown, ChevronUp, PackageSearch, RefreshCcw, Search, ShoppingCart, TrendingUp, Wallet } from 'lucide-react';
import { callSFWithMeta, callSFMutation, callSFSingle, formatCurrency, formatServerDateTimeBrasilia, SF } from '../hooks/useMitra';
import AlertaSazonalidadeGrafico from '../components/AlertaSazonalidadeGrafico';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import ProspeccaoPage from './ProspeccaoPage';
import { CoordinatorScopeFilter, useCoordinatorScope } from '../components/CoordinatorScopeFilter';

interface AlertaInteligente {
  ID: number;
  ID_VENDEDOR: number;
  CODFILIAL: number;
  ID_SECAO?: string | null;
  ID_CLIENTE: number;
  NOME_CLIENTE: string;
  TIPO_ALERTA: string;
  TITULO: string;
  DESCRICAO: string;
  PRIORIDADE: 'ALTA' | 'MEDIA' | 'BAIXA' | string;
  LIDO: number | boolean | string;
  DATA_GERACAO: string;
  VALOR_REFERENCIA?: number | string | null;
  PRODUTO_REFERENCIA?: string | null;
  RAMO_CLIENTE?: string;
}

interface ClienteResumo {
  idCliente: number;
  nomeCliente: string;
  total: number;
  quantidade: number;
}

interface ProdutoResumo {
  produto: string;
  total: number;
  quantidade: number;
  clientes: ClienteResumo[];
  alertas: AlertaInteligente[];
}

interface ProdutoCrescimentoSugestao {
  produto: string;
  motivo: string;
  valor: number;
  origem: 'cliente' | 'ramo';
}

interface ClienteAlertasGrupo extends ClienteResumo {
  naoLidos: number;
  prioridade: string;
  ramos: string[];
  alertas: AlertaInteligente[];
  ultimaData: string;
}

const tipoLabel: Record<string, string> = {
  PRODUTO_PERDIDO: 'Produto Perdido',
  SAZONALIDADE_NAO_REPETIDA: 'Sazonalidade',
  REPOSICAO_PREVISTA: 'Reposição',
  VOLUME_CRESCENTE: 'Volume Crescente',
  PRODUTO_NAO_EXPLORADO: 'Não Explorado',
  PEDIDO_INCOMPLETO: 'Pedido Incompleto',
};

function isRead(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return String(value || '') === '1' || String(value || '').toLowerCase() === 'true';
}

function priorityStyle(priority: string) {
  const key = String(priority || '').toUpperCase();
  if (key === 'ALTA') return { bg: '#fde8e8', color: '#b42318', border: '#f6caca', label: 'Alta' };
  if (key === 'MEDIA') return { bg: '#fff4dc', color: '#a26a00', border: '#f2d89a', label: 'Média' };
  return { bg: '#eaf2ff', color: '#285cc4', border: '#cbdcff', label: 'Baixa' };
}

function typeIcon(type: string) {
  if (type === 'VOLUME_CRESCENTE') return TrendingUp;
  if (type === 'PEDIDO_INCOMPLETO') return ShoppingCart;
  if (type === 'REPOSICAO_PREVISTA') return RefreshCcw;
  if (type === 'PRODUTO_NAO_EXPLORADO') return PackageSearch;
  return Bell;
}

function shouldShowGrafico(type: string) {
  return type === 'SAZONALIDADE_NAO_REPETIDA' || type === 'REPOSICAO_PREVISTA' || type === 'VOLUME_CRESCENTE';
}

function getAlertValue(alerta: AlertaInteligente): number {
  const raw = alerta.VALOR_REFERENCIA;
  if (raw === null || raw === undefined || raw === '') return 0;
  const value = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function prioridadePeso(priority: string) {
  const key = String(priority || '').toUpperCase();
  if (key === 'ALTA') return 1;
  if (key === 'MEDIA') return 2;
  return 3;
}

function getInitials(name: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'CL';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function getProdutoMotivo(alerta: AlertaInteligente) {
  if (alerta.TIPO_ALERTA === 'PRODUTO_NAO_EXPLORADO') return 'produto ainda não explorado pelo cliente';
  if (alerta.TIPO_ALERTA === 'PRODUTO_PERDIDO') return 'retomar compra perdida';
  if (alerta.TIPO_ALERTA === 'SAZONALIDADE_NAO_REPETIDA') return 'oportunidade sazonal';
  if (alerta.TIPO_ALERTA === 'REPOSICAO_PREVISTA') return 'reposição prevista';
  return tipoLabel[alerta.TIPO_ALERTA] || 'oportunidade relacionada';
}

export default function AlertasInteligentesPage() {
  const navigate = useNavigate();
  const coordinatorScope = useCoordinatorScope('alertas');
  const [searchParams, setSearchParams] = useSearchParams();
  const [alertas, setAlertas] = useState<AlertaInteligente[]>([]);
  const [totalNaoLidos, setTotalNaoLidos] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [produtoModalAberto, setProdutoModalAberto] = useState<ProdutoResumo | null>(null);
  const [clientesExpandidos, setClientesExpandidos] = useState<Record<string, boolean>>({});

  const abaAtual = searchParams.get('aba') === 'prospeccao' ? 'prospeccao' : 'alertas';
  const clienteIdFiltro = searchParams.get('clienteId') || '';
  const clienteBuscaAtual = searchParams.get('cliente') || '';
  const alertaIdFiltro = searchParams.get('alertaId') || '';
  const tipoAtual = searchParams.get('tipo') || '';
  const ramoAtual = searchParams.get('ramo') || '';
  const valorMinAtual = searchParams.get('valorMin') || '';
  const valorMaxAtual = searchParams.get('valorMax') || '';
  const situacaoParam = searchParams.get('situacao') || '';
  const situacaoAtual: 'pendentes' | 'lidos' | 'todos' =
    situacaoParam === 'lidos' ? 'lidos' : situacaoParam === 'todos' ? 'todos' : 'pendentes';

  const carregar = useCallback(async () => {
    if (coordinatorScope.loadingScope) return;
    setLoading(true);
    setError('');
    try {
      const [listaResult, countRow] = await Promise.all([
        callSFWithMeta(SF.alertasInteligentesListar, {
          idCliente: clienteIdFiltro,
          idAlerta: alertaIdFiltro,
          limite: '100',
          // Alerta aberto por link direto sempre aparece, mesmo já lido
          somenteNaoLidos: !alertaIdFiltro && situacaoAtual === 'pendentes' ? 'true' : '',
          somenteLidos: !alertaIdFiltro && situacaoAtual === 'lidos' ? 'true' : '',
          ...coordinatorScope.scopeParams,
        }),
        callSFSingle(SF.alertasInteligentesContarNaoLidos, coordinatorScope.scopeParams),
      ]);

      if (listaResult.error) throw new Error(listaResult.error);
      const rows = listaResult.rows as AlertaInteligente[];
      setAlertas(alertaIdFiltro ? rows.filter((item) => String(item.ID) === alertaIdFiltro) : rows);
      setTotalNaoLidos(Number(countRow?.TOTAL || 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar alertas inteligentes.');
      setAlertas([]);
    } finally {
      setLoading(false);
    }
  }, [alertaIdFiltro, clienteIdFiltro, situacaoAtual, coordinatorScope.loadingScope, coordinatorScope.scopeParams]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const alertaPorClienteAtivo = useMemo(() => {
    if (!clienteIdFiltro) return '';
    const alerta = alertas.find((item) => String(item.ID_CLIENTE) === clienteIdFiltro);
    return alerta?.NOME_CLIENTE || `Cliente ${clienteIdFiltro}`;
  }, [alertas, clienteIdFiltro]);

  const opcoesTipo = useMemo(() => {
    return [
      { value: '', label: 'Todos os avisos' },
      ...Object.entries(tipoLabel).map(([value, label]) => ({ value, label })),
    ];
  }, []);

  const opcoesRamo = useMemo(() => {
    const ramos = Array.from(
      new Set(
        alertas
          .map((alerta) => String(alerta.RAMO_CLIENTE || '').trim() || 'Sem ramo')
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));

    return [
      { value: '', label: 'Todos os ramos' },
      ...ramos.map((ramo) => ({ value: ramo, label: ramo })),
    ];
  }, [alertas]);

  const opcoesSituacao = useMemo(
    () => [
      { value: 'pendentes', label: 'Não lidos' },
      { value: 'lidos', label: 'Lidos' },
      { value: 'todos', label: 'Todos' },
    ],
    []
  );

  const filtrosAtivos = Boolean(
    clienteBuscaAtual || clienteIdFiltro || alertaIdFiltro || tipoAtual || ramoAtual || valorMinAtual || valorMaxAtual || situacaoAtual !== 'pendentes'
  );

  const alertasFiltrados = useMemo(() => {
    const termoCliente = normalizeText(clienteBuscaAtual);
    return [...alertas]
      .filter((alerta) => {
        if (!termoCliente) return true;
        return normalizeText(alerta.NOME_CLIENTE || '').includes(termoCliente);
      })
      .filter((alerta) => {
        if (!tipoAtual) return true;
        return alerta.TIPO_ALERTA === tipoAtual;
      })
      .filter((alerta) => {
        if (!ramoAtual) return true;
        const ramo = String(alerta.RAMO_CLIENTE || '').trim() || 'Sem ramo';
        return ramo === ramoAtual;
      })
      .filter((alerta) => {
        const valor = getAlertValue(alerta);
        const valorMin = Number(valorMinAtual.replace(',', '.'));
        const valorMax = Number(valorMaxAtual.replace(',', '.'));
        if (valorMinAtual && Number.isFinite(valorMin) && valor < valorMin) return false;
        if (valorMaxAtual && Number.isFinite(valorMax) && valor > valorMax) return false;
        return true;
      })
      .sort((a, b) => {
        const valorDiff = getAlertValue(b) - getAlertValue(a);
        if (valorDiff !== 0) return valorDiff;

        const prioridadeDiff = prioridadePeso(a.PRIORIDADE) - prioridadePeso(b.PRIORIDADE);
        if (prioridadeDiff !== 0) return prioridadeDiff;

        return Number(b.ID || 0) - Number(a.ID || 0);
      });
  }, [alertas, clienteBuscaAtual, ramoAtual, tipoAtual, valorMaxAtual, valorMinAtual]);

  const totalFaturamentoPossivel = useMemo(() => {
    return alertasFiltrados.reduce((acc, alerta) => acc + getAlertValue(alerta), 0);
  }, [alertasFiltrados]);

  const clientesResumo = useMemo<ClienteResumo[]>(() => {
    const mapa = new Map<number, ClienteResumo>();
    alertasFiltrados.forEach((alerta) => {
      const atual = mapa.get(alerta.ID_CLIENTE) || {
        idCliente: alerta.ID_CLIENTE,
        nomeCliente: alerta.NOME_CLIENTE || `Cliente ${alerta.ID_CLIENTE}`,
        total: 0,
        quantidade: 0,
      };
      atual.total += getAlertValue(alerta);
      atual.quantidade += 1;
      mapa.set(alerta.ID_CLIENTE, atual);
    });
    return [...mapa.values()].sort((a, b) => b.total - a.total || b.quantidade - a.quantidade || a.nomeCliente.localeCompare(b.nomeCliente));
  }, [alertasFiltrados]);

  const produtosResumo = useMemo<ProdutoResumo[]>(() => {
    const mapa = new Map<string, ProdutoResumo>();

    alertasFiltrados.forEach((alerta) => {
      if (!['PRODUTO_PERDIDO', 'PRODUTO_NAO_EXPLORADO'].includes(alerta.TIPO_ALERTA)) return;
      const produto = String(alerta.PRODUTO_REFERENCIA || '').trim();
      if (!produto) return;

      const valor = getAlertValue(alerta);
      const chaveProduto = produto;
      const atual = mapa.get(chaveProduto) || {
        produto,
        total: 0,
        quantidade: 0,
        clientes: [],
        alertas: [],
      };

      atual.total += valor;
      atual.quantidade += 1;
      atual.alertas.push(alerta);

      const clienteExistente = atual.clientes.find((cliente) => cliente.idCliente === alerta.ID_CLIENTE);
      if (clienteExistente) {
        clienteExistente.total += valor;
        clienteExistente.quantidade += 1;
      } else {
        atual.clientes.push({
          idCliente: alerta.ID_CLIENTE,
          nomeCliente: alerta.NOME_CLIENTE || `Cliente ${alerta.ID_CLIENTE}`,
          total: valor,
          quantidade: 1,
        });
      }

      mapa.set(chaveProduto, atual);
    });

    return [...mapa.values()]
      .map((item) => ({
        ...item,
        alertas: [...item.alertas].sort((a, b) => getAlertValue(b) - getAlertValue(a) || Number(b.ID || 0) - Number(a.ID || 0)),
        clientes: [...item.clientes].sort((a, b) => b.total - a.total || b.quantidade - a.quantidade || a.nomeCliente.localeCompare(b.nomeCliente)),
      }))
      .sort((a, b) => b.total - a.total || b.quantidade - a.quantidade || a.produto.localeCompare(b.produto));
  }, [alertasFiltrados]);

  const produtosParaCrescimento = useMemo(() => {
    const sugestoesPorCliente = new Map<number, Map<string, ProdutoCrescimentoSugestao>>();
    const sugestoesPorRamo = new Map<string, Map<string, ProdutoCrescimentoSugestao>>();

    alertasFiltrados.forEach((alerta) => {
      if (alerta.TIPO_ALERTA === 'VOLUME_CRESCENTE') return;
      const produto = String(alerta.PRODUTO_REFERENCIA || '').trim();
      if (!produto) return;

      const valor = getAlertValue(alerta);
      const motivo = getProdutoMotivo(alerta);
      const ramo = String(alerta.RAMO_CLIENTE || '').trim() || 'Sem ramo';

      const clienteMap = sugestoesPorCliente.get(alerta.ID_CLIENTE) || new Map<string, ProdutoCrescimentoSugestao>();
      const clienteAtual = clienteMap.get(produto);
      clienteMap.set(produto, {
        produto,
        motivo,
        valor: (clienteAtual?.valor || 0) + valor,
        origem: 'cliente',
      });
      sugestoesPorCliente.set(alerta.ID_CLIENTE, clienteMap);

      const ramoMap = sugestoesPorRamo.get(ramo) || new Map<string, ProdutoCrescimentoSugestao>();
      const ramoAtual = ramoMap.get(produto);
      ramoMap.set(produto, {
        produto,
        motivo,
        valor: (ramoAtual?.valor || 0) + valor,
        origem: 'ramo',
      });
      sugestoesPorRamo.set(ramo, ramoMap);
    });

    return { sugestoesPorCliente, sugestoesPorRamo };
  }, [alertasFiltrados]);

  const getSugestoesCrescimento = useCallback((alerta: AlertaInteligente) => {
    const ramo = String(alerta.RAMO_CLIENTE || '').trim() || 'Sem ramo';
    const clienteSugestoes = [...(produtosParaCrescimento.sugestoesPorCliente.get(alerta.ID_CLIENTE)?.values() || [])];
    const ramoSugestoes = [...(produtosParaCrescimento.sugestoesPorRamo.get(ramo)?.values() || [])]
      .filter((item) => !clienteSugestoes.some((clienteItem) => clienteItem.produto === item.produto))
      .map((item) => ({ ...item, origem: 'ramo' as const }));

    return [...clienteSugestoes, ...ramoSugestoes]
      .sort((a, b) => b.valor - a.valor || a.produto.localeCompare(b.produto))
      .slice(0, 5);
  }, [produtosParaCrescimento]);

  const alertasAgrupadosPorCliente = useMemo<ClienteAlertasGrupo[]>(() => {
    const mapa = new Map<number, ClienteAlertasGrupo>();

    alertasFiltrados.forEach((alerta) => {
      const atual = mapa.get(alerta.ID_CLIENTE) || {
        idCliente: alerta.ID_CLIENTE,
        nomeCliente: alerta.NOME_CLIENTE || `Cliente ${alerta.ID_CLIENTE}`,
        total: 0,
        quantidade: 0,
        naoLidos: 0,
        prioridade: alerta.PRIORIDADE,
        ramos: [],
        alertas: [],
        ultimaData: alerta.DATA_GERACAO || '',
      };

      atual.total += getAlertValue(alerta);
      atual.quantidade += 1;
      atual.alertas.push(alerta);
      if (!isRead(alerta.LIDO)) atual.naoLidos += 1;

      if (prioridadePeso(alerta.PRIORIDADE) < prioridadePeso(atual.prioridade)) {
        atual.prioridade = alerta.PRIORIDADE;
      }

      const ramo = String(alerta.RAMO_CLIENTE || '').trim() || 'Sem ramo';
      if (!atual.ramos.includes(ramo)) atual.ramos.push(ramo);

      if (String(alerta.DATA_GERACAO || '') > String(atual.ultimaData || '')) {
        atual.ultimaData = alerta.DATA_GERACAO || atual.ultimaData;
      }

      mapa.set(alerta.ID_CLIENTE, atual);
    });

    return [...mapa.values()]
      .map((grupo) => ({
        ...grupo,
        alertas: [...grupo.alertas].sort((a, b) => {
          const valorDiff = getAlertValue(b) - getAlertValue(a);
          if (valorDiff !== 0) return valorDiff;

          const prioridadeDiff = prioridadePeso(a.PRIORIDADE) - prioridadePeso(b.PRIORIDADE);
          if (prioridadeDiff !== 0) return prioridadeDiff;

          return Number(b.ID || 0) - Number(a.ID || 0);
        }),
      }))
      .sort((a, b) => b.total - a.total || b.quantidade - a.quantidade || a.nomeCliente.localeCompare(b.nomeCliente));
  }, [alertasFiltrados]);

  useEffect(() => {
    if (!produtoModalAberto) return;
    const atualizado = produtosResumo.find((item) => item.produto === produtoModalAberto.produto) || null;
    setProdutoModalAberto(atualizado);
  }, [produtoModalAberto, produtosResumo]);

  function setAba(value: 'alertas' | 'prospeccao') {
    const next = new URLSearchParams(searchParams);
    if (value === 'prospeccao') next.set('aba', 'prospeccao');
    else next.delete('aba');
    setSearchParams(next);
  }

  function setClienteBusca(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('cliente', value);
    else next.delete('cliente');
    next.delete('clienteId');
    setSearchParams(next);
  }

  function setTipo(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('tipo', value);
    else next.delete('tipo');
    setSearchParams(next);
  }

  function setSituacao(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value && value !== 'pendentes') next.set('situacao', value);
    else next.delete('situacao');
    setSearchParams(next);
  }

  function setRamo(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('ramo', value);
    else next.delete('ramo');
    setSearchParams(next);
  }

  function setValorFiltro(key: 'valorMin' | 'valorMax', value: string) {
    const next = new URLSearchParams(searchParams);
    const sanitized = value.replace(/[^0-9,.]/g, '');
    if (sanitized) next.set(key, sanitized);
    else next.delete(key);
    setSearchParams(next);
  }

  function selecionarCliente(idCliente: number, nomeCliente: string) {
    const next = new URLSearchParams(searchParams);
    next.set('clienteId', String(idCliente));
    next.set('cliente', nomeCliente);
    next.delete('alertaId');
    setSearchParams(next);
  }

  function limparFiltros() {
    const next = new URLSearchParams(searchParams);
    next.delete('cliente');
    next.delete('clienteId');
    next.delete('alertaId');
    next.delete('tipo');
    next.delete('ramo');
    next.delete('valorMin');
    next.delete('valorMax');
    next.delete('situacao');
    setSearchParams(next);
  }

  function toggleClienteExpandido(idCliente: number) {
    setClientesExpandidos((current) => ({
      ...current,
      [String(idCliente)]: !current[String(idCliente)],
    }));
  }

  async function marcarLido(idAlerta: number) {
    if (saving) return;
    setSaving(true);
    try {
      const ok = await callSFMutation(SF.alertasInteligentesMarcarLido, { idAlerta: String(idAlerta) });
      if (!ok) throw new Error('Não foi possível marcar o alerta como lido.');
      await carregar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao marcar alerta como lido.');
    } finally {
      setSaving(false);
    }
  }

  async function marcarTodosLidos() {
    if (saving) return;
    setSaving(true);
    try {
      const ok = await callSFMutation(SF.alertasInteligentesMarcarTodosLidos, {
        scopeCodFilial: coordinatorScope.scopeParams.scopeCodFilial,
        scopeCodepto: coordinatorScope.scopeParams.scopeCodepto,
        scopeIdSecao: coordinatorScope.scopeParams.scopeIdSecao,
      });
      if (!ok) throw new Error('Não foi possível marcar todos os alertas como lidos.');
      await carregar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao marcar todos como lidos.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fadeIn alertas-page">
      <div className="mb-4">
        <CoordinatorScopeFilter scope={coordinatorScope} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Alertas e Prospecção</h1>
          <p className="text-sm mt-1" style={{ color: '#647062' }}>Oportunidades, riscos e clientes priorizados em um único fluxo comercial.</p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold shadow-sm" style={{ backgroundColor: '#ffffff', color: '#2f3a2f', border: '1px solid #edf0eb' }}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#d11b2d' }} />
            {totalNaoLidos} alertas pendentes
          </span>
          <span className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold shadow-sm" style={{ backgroundColor: '#ffffff', color: '#2f3a2f', border: '1px solid #edf0eb' }}>
            <Wallet size={15} />
            {formatCurrency(totalFaturamentoPossivel)} potencial
          </span>
          <button
            type="button"
            onClick={marcarTodosLidos}
            disabled={saving || totalNaoLidos === 0 || abaAtual !== 'alertas'}
            className="h-10 px-4 rounded-xl text-sm font-bold shadow-sm disabled:opacity-60"
            style={{ backgroundColor: '#137432', color: '#ffffff' }}
          >
            Marcar tudo como lido
          </button>
        </div>
      </div>

      <div className="rounded-2xl p-4 mb-5 shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}>
        <div className="flex items-center gap-8 border-b pb-3" style={{ borderColor: '#edf0eb' }}>
          <button
            type="button"
            onClick={() => setAba('alertas')}
            className="relative h-8 text-sm font-bold"
            style={{ color: abaAtual === 'alertas' ? '#137432' : '#8c9489' }}
          >
            Alertas
            {abaAtual === 'alertas' ? <span className="absolute -bottom-[13px] left-0 h-0.5 w-full rounded-full" style={{ backgroundColor: '#137432' }} /> : null}
          </button>
          <button
            type="button"
            onClick={() => setAba('prospeccao')}
            className="relative h-8 text-sm font-bold"
            style={{ color: abaAtual === 'prospeccao' ? '#137432' : '#8c9489' }}
          >
            Prospecção
            {abaAtual === 'prospeccao' ? <span className="absolute -bottom-[13px] left-0 h-0.5 w-full rounded-full" style={{ backgroundColor: '#137432' }} /> : null}
          </button>
        </div>

        {abaAtual === 'alertas' ? (
          <div className="pt-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.1fr)_minmax(150px,0.5fr)_minmax(160px,0.5fr)_minmax(160px,0.5fr)_minmax(140px,0.45fr)_auto]">
                  <div className="relative min-w-[280px]">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#80907d' }} />
                    <Input
                      value={clienteBuscaAtual}
                      onChange={(event) => setClienteBusca(event.target.value)}
                      placeholder="Buscar por cliente ou CNPJ..."
                      className="h-10 rounded-xl border-0 pl-10"
                      style={{ backgroundColor: '#ffffff', color: '#2f3a2f', boxShadow: 'inset 0 0 0 1px #dfe5dc' }}
                    />
                  </div>
                  <Select
                    value={ramoAtual}
                    onChange={setRamo}
                    options={opcoesRamo}
                    placeholder="Filtrar por ramo"
                    className="min-w-[220px]"
                  />
                  <Select
                    value={tipoAtual}
                    onChange={setTipo}
                    options={opcoesTipo}
                    placeholder="Filtrar por tipo"
                    className="min-w-[220px]"
                  />
                  <Input
                    value={valorMinAtual}
                    onChange={(event) => setValorFiltro('valorMin', event.target.value)}
                    placeholder="R$ 0,00"
                    className="h-10 rounded-xl border-0"
                    style={{ backgroundColor: '#ffffff', color: '#2f3a2f', boxShadow: 'inset 0 0 0 1px #dfe5dc' }}
                  />
                  <Select
                    value={situacaoAtual}
                    onChange={setSituacao}
                    options={opcoesSituacao}
                    placeholder="Situação"
                    className="min-w-[160px]"
                  />
                  {filtrosAtivos ? (
                    <button
                      type="button"
                      onClick={limparFiltros}
                      className="h-10 px-4 rounded-xl text-sm font-bold"
                      style={{ backgroundColor: '#ffffff', color: '#c21f32' }}
                    >
                      Limpar
                    </button>
                  ) : <div />}
                </div>
                {alertaPorClienteAtivo || alertaIdFiltro || tipoAtual || ramoAtual || valorMinAtual || valorMaxAtual || situacaoAtual !== 'pendentes' ? (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm" style={{ color: '#647062' }}>
                    {alertaPorClienteAtivo ? <span>{`Cliente selecionado: ${alertaPorClienteAtivo}`}</span> : null}
                    {ramoAtual ? <span>{`Ramo: ${ramoAtual}`}</span> : null}
                    {tipoAtual ? <span>{`Tipo: ${tipoLabel[tipoAtual] || tipoAtual}`}</span> : null}
                    {valorMinAtual ? <span>{`Valor mínimo: ${formatCurrency(Number(valorMinAtual.replace(',', '.')) || 0)}`}</span> : null}
                    {valorMaxAtual ? <span>{`Valor máximo: ${formatCurrency(Number(valorMaxAtual.replace(',', '.')) || 0)}`}</span> : null}
                    {alertaIdFiltro ? <span>{`Alerta selecionado: #${alertaIdFiltro}`}</span> : null}
                    {situacaoAtual !== 'pendentes' ? <span>{`Situação: ${situacaoAtual === 'lidos' ? 'Lidos' : 'Todos'}`}</span> : null}
                  </div>
                ) : null}
          </div>
        ) : null}
      </div>

      {abaAtual === 'prospeccao' ? <ProspeccaoPage /> : null}

      {abaAtual === 'alertas' ? (
        <>
          {produtosResumo.length > 0 ? (
            <div className="mb-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2">
                  <TrendingUp size={17} style={{ color: '#2d6f43' }} />
                  <h2 className="text-sm font-extrabold" style={{ color: '#1b1c1a' }}>Oportunidades e Vendas Perdidas</h2>
                </div>
                <button type="button" className="text-xs font-bold" style={{ color: '#137432' }} onClick={() => setProdutoModalAberto(produtosResumo[0])}>
                  Ver todas
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {produtosResumo.slice(0, 3).map((produto, index) => (
                  <button
                    key={`produto-resumo-${produto.produto}`}
                    type="button"
                    className="rounded-2xl p-4 text-left shadow-sm transition-all hover:-translate-y-0.5"
                    style={{ backgroundColor: index === 2 ? '#fbfbfa' : '#ffffff', border: '1px solid #edf0eb', opacity: index === 2 ? 0.68 : 1 }}
                    onClick={() => setProdutoModalAberto(produto)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-extrabold" style={{ color: '#1b1c1a' }}>{produto.produto}</h3>
                        <p className="mt-1 text-xs" style={{ color: '#6f786d' }}>{produto.quantidade} aviso(s) · {produto.clientes.length} cliente(s)</p>
                      </div>
                      <span className="rounded-lg px-2 py-1 text-[10px] font-extrabold" style={{ backgroundColor: '#eef6ef', color: '#2d6f43' }}>
                        {formatCurrency(produto.total)}
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {produto.clientes.slice(0, 2).map((cliente) => (
                        <span key={`produto-${produto.produto}-cliente-${cliente.idCliente}`} className="rounded-lg px-2 py-1 text-[10px] font-bold" style={{ backgroundColor: '#f6f8f4', color: '#667062', border: '1px solid #edf0eb' }}>
                          {cliente.nomeCliente}
                        </span>
                      ))}
                      {produto.clientes.length > 2 ? (
                        <span className="rounded-lg px-2 py-1 text-[10px] font-bold" style={{ backgroundColor: '#f6f8f4', color: '#667062', border: '1px solid #edf0eb' }}>
                          +{produto.clientes.length - 2}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 flex h-8 items-center justify-center rounded-xl text-xs font-extrabold" style={{ backgroundColor: '#fafafa', color: '#1b1c1a' }}>
                      Ver detalhes
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl p-4 mb-4 text-sm" style={{ backgroundColor: '#fde8e8', color: '#b42318', border: '1px solid #f6caca' }}>
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={`skeleton-${idx}`} className="rounded-[26px] p-5 animate-pulse" style={{ backgroundColor: '#f9faf8' }}>
                  <div className="h-5 w-1/3 rounded" style={{ backgroundColor: '#e4e9df' }} />
                  <div className="h-4 w-2/3 mt-3 rounded" style={{ backgroundColor: '#e9eee4' }} />
                  <div className="h-4 w-1/2 mt-2 rounded" style={{ backgroundColor: '#e9eee4' }} />
                </div>
              ))}
            </div>
          ) : alertasFiltrados.length === 0 ? (
            <div className="rounded-[30px] p-10 text-center" style={{ backgroundColor: '#f9faf8' }}>
              <CheckCircle2 size={40} className="mx-auto" style={{ color: '#137432' }} />
              <h2 className="font-display text-4xl font-extrabold mt-4" style={{ color: '#1b1c1a' }}>
                {situacaoAtual === 'lidos' ? 'Nenhum alerta lido' : 'Nenhum alerta no momento'}
              </h2>
              <p className="text-base mt-2" style={{ color: '#647062' }}>
                {situacaoAtual === 'pendentes'
                  ? 'Sua carteira não tem oportunidades ou riscos pendentes para a busca selecionada. Use o filtro de situação para rever os alertas já lidos.'
                  : 'Sua carteira não tem oportunidades ou riscos ativos para a busca selecionada.'}
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2">
                  <Bell size={16} style={{ color: '#52604f' }} />
                  <h2 className="text-sm font-extrabold" style={{ color: '#1b1c1a' }}>Alertas Prioritários por Cliente</h2>
                </div>
                <p className="text-xs font-bold" style={{ color: '#8c9489' }}>
                  {alertasAgrupadosPorCliente.length} cliente(s) · {alertasFiltrados.length} alerta(s)
                </p>
              </div>

              <div className="overflow-hidden rounded-2xl shadow-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}>
                <div className="hidden grid-cols-[minmax(260px,1.35fr)_140px_170px_150px] gap-4 border-b px-5 py-3 text-[10px] font-extrabold uppercase tracking-[0.16em] md:grid" style={{ borderColor: '#edf0eb', color: '#9aa19a' }}>
                  <span>Cliente / Alertas</span>
                  <span>Prioridade</span>
                  <span>Faturamento potencial</span>
                  <span className="text-right">Ações</span>
                </div>

                {alertasAgrupadosPorCliente.map((grupo) => {
                  const prioridadeGrupo = priorityStyle(grupo.prioridade);
                  const expandido = grupo.quantidade <= 2 || clienteIdFiltro === String(grupo.idCliente) || Boolean(clientesExpandidos[String(grupo.idCliente)]);
                  const alertasVisiveis = expandido ? grupo.alertas : grupo.alertas.slice(0, 2);

                  return (
                    <div
                      key={`grupo-cliente-${grupo.idCliente}`}
                      className="border-b last:border-b-0"
                      style={{ borderColor: '#f1f3ef' }}
                    >
                      <div className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(260px,1.35fr)_140px_170px_150px] md:items-center">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-extrabold" style={{ backgroundColor: prioridadeGrupo.bg, color: prioridadeGrupo.color }}>
                            {getInitials(grupo.nomeCliente)}
                          </div>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => navigate(`/clientes/${grupo.idCliente}`)}
                              className="block truncate text-sm font-extrabold text-left underline-offset-2 hover:underline"
                              style={{ color: '#1b1c1a' }}
                            >
                              {grupo.nomeCliente}
                            </button>
                            <p className="mt-0.5 truncate text-xs" style={{ color: '#6f786d' }}>
                              {grupo.quantidade} alerta(s) pendente(s) · {formatServerDateTimeBrasilia(grupo.ultimaData) || 'Data não informada'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 md:block">
                          <span className="rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase" style={{ backgroundColor: prioridadeGrupo.bg, color: prioridadeGrupo.color }}>
                            {priorityStyle(grupo.prioridade).label}
                          </span>
                          {grupo.naoLidos > 0 ? (
                            <span className="rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase md:ml-0 md:mt-1 md:inline-block" style={{ backgroundColor: '#fde8e8', color: '#b42318' }}>
                              {grupo.naoLidos} novo(s)
                            </span>
                          ) : null}
                        </div>

                        <div className="text-sm font-extrabold" style={{ color: '#20843b' }}>
                          {formatCurrency(grupo.total)}
                        </div>

                        <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
                          {grupo.quantidade > 2 ? (
                            <button
                              type="button"
                              onClick={() => toggleClienteExpandido(grupo.idCliente)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold"
                              style={{ backgroundColor: '#ffffff', color: '#52604f', border: '1px solid #edf0eb' }}
                              title={expandido ? 'Recolher alertas' : 'Ver alertas'}
                            >
                              {expandido ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => selecionarCliente(grupo.idCliente, grupo.nomeCliente)}
                            className="h-9 rounded-xl px-3 text-xs font-extrabold"
                            style={{ backgroundColor: '#137432', color: '#ffffff' }}
                          >
                            Ver alertas ({grupo.quantidade})
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`/clientes/${grupo.idCliente}`)}
                            className="h-9 rounded-xl px-3 text-xs font-bold"
                            style={{ backgroundColor: '#f7f7f6', color: '#52604f' }}
                          >
                            Cliente
                          </button>
                        </div>
                      </div>

                      {expandido ? <div className="space-y-3 px-5 pb-4">
                        {alertasVisiveis.map((alerta) => {
                          const prioridade = priorityStyle(alerta.PRIORIDADE);
                          const TipoIcon = typeIcon(alerta.TIPO_ALERTA);
                          const lido = isRead(alerta.LIDO);
                          const valorAlerta = getAlertValue(alerta);
                          const sugestoesCrescimento = alerta.TIPO_ALERTA === 'VOLUME_CRESCENTE' ? getSugestoesCrescimento(alerta) : [];

                          return (
                            <div
                              key={alerta.ID}
                              className="rounded-[22px] p-4 transition-opacity"
                              style={{ backgroundColor: '#ffffff', border: `1px solid ${prioridade.border}`, opacity: lido ? 0.58 : 1 }}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="flex items-start gap-4 min-w-0 flex-1">
                                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: prioridade.bg, color: prioridade.color }}>
                                    <TipoIcon size={18} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h3 className="text-base font-bold" style={{ color: '#1b1c1a' }}>{alerta.TITULO}</h3>
                                      <span className="px-2 py-1 rounded-full text-[11px] font-bold" style={{ backgroundColor: prioridade.bg, color: prioridade.color }}>
                                        {prioridade.label}
                                      </span>
                                      <span className="px-2 py-1 rounded-full text-[11px] font-bold" style={{ backgroundColor: '#edf1ea', color: '#53604f' }}>
                                        {tipoLabel[alerta.TIPO_ALERTA] || alerta.TIPO_ALERTA}
                                      </span>
                                      {valorAlerta > 0 ? (
                                        <span className="px-2 py-1 rounded-full text-[11px] font-bold" style={{ backgroundColor: '#eaf2ff', color: '#285cc4' }}>
                                          Potencial: {formatCurrency(valorAlerta)}
                                        </span>
                                      ) : null}
                                    </div>

                                     <p className="text-sm mt-2" style={{ color: '#5f6a5d' }}>{alerta.DESCRICAO}</p>

                                     {alerta.TIPO_ALERTA === 'VOLUME_CRESCENTE' ? (
                                       <div className="mt-3 rounded-2xl p-3" style={{ backgroundColor: '#f6f8f4', border: '1px solid #e3e8de' }}>
                                         <div className="flex flex-wrap items-center justify-between gap-2">
                                           <p className="text-xs font-extrabold uppercase tracking-[0.12em]" style={{ color: '#2d6f43' }}>
                                             Produtos para oferecer no crescimento
                                           </p>
                                           {sugestoesCrescimento.length > 0 ? (
                                             <span className="text-[11px] font-bold" style={{ color: '#6f786d' }}>
                                               {sugestoesCrescimento.length} sugestão(ões)
                                             </span>
                                           ) : null}
                                         </div>

                                         {sugestoesCrescimento.length > 0 ? (
                                           <div className="mt-3 grid gap-2 md:grid-cols-2">
                                             {sugestoesCrescimento.map((item) => (
                                               <div key={`crescimento-${alerta.ID}-${item.produto}`} className="rounded-xl p-3" style={{ backgroundColor: '#ffffff', border: '1px solid #edf0eb' }}>
                                                 <div className="flex items-start justify-between gap-2">
                                                   <div className="min-w-0">
                                                     <p className="truncate text-sm font-extrabold" style={{ color: '#1b1c1a' }}>{item.produto}</p>
                                                     <p className="mt-1 text-xs" style={{ color: '#6f786d' }}>
                                                       {item.origem === 'cliente' ? 'Indicado pelo histórico do cliente' : 'Indicado por clientes do mesmo ramo'} · {item.motivo}
                                                     </p>
                                                   </div>
                                                   {item.valor > 0 ? (
                                                     <span className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-extrabold" style={{ backgroundColor: '#eef6ef', color: '#2d6f43' }}>
                                                       {formatCurrency(item.valor)}
                                                     </span>
                                                   ) : null}
                                                 </div>
                                               </div>
                                             ))}
                                           </div>
                                         ) : (
                                           <p className="mt-2 text-sm" style={{ color: '#6f786d' }}>
                                             Cliente em crescimento: priorize ampliar o mix com produtos complementares da carteira e valide próximos itens na conversa comercial.
                                           </p>
                                         )}
                                       </div>
                                     ) : null}

                                     <div className="flex flex-wrap items-center gap-3 mt-3 text-sm" style={{ color: '#6f786d' }}>
                                       <span>{formatServerDateTimeBrasilia(alerta.DATA_GERACAO) || 'Data não informada'}</span>
                                     </div>

                                    {expandido && shouldShowGrafico(alerta.TIPO_ALERTA) ? (
                                      <AlertaSazonalidadeGrafico
                                        idAlerta={Number(alerta.ID)}
                                        idCliente={Number(alerta.ID_CLIENTE)}
                                        codigoProduto={String(alerta.PRODUTO_REFERENCIA || '')}
                                        idVendedor={Number(alerta.ID_VENDEDOR || 0)}
                                        codFilial={Number(alerta.CODFILIAL || 0)}
                                        idSecao={alerta.ID_SECAO || ''}
                                        tipoAlerta={alerta.TIPO_ALERTA}
                                      />
                                    ) : null}
                                  </div>
                                </div>

                                {!lido ? (
                                  <button
                                    type="button"
                                    onClick={() => marcarLido(alerta.ID)}
                                    disabled={saving}
                                    className="h-9 px-3 rounded-xl text-sm font-semibold disabled:opacity-60"
                                    style={{ backgroundColor: '#137432', color: '#ffffff' }}
                                  >
                                    Marcar como lido
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div> : null}
                    </div>
                  );
                })}

                <div className="flex items-center justify-between px-5 py-4 text-[10px] font-extrabold uppercase tracking-[0.16em]" style={{ color: '#9aa19a' }}>
                  <span>Exibindo {alertasAgrupadosPorCliente.length} de {clientesResumo.length} clientes com alertas</span>
                  <span className="flex items-center gap-3"><ChevronDown size={14} className="rotate-90" /><ChevronDown size={14} className="-rotate-90" /></span>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}

      <Modal
        isOpen={Boolean(produtoModalAberto)}
        onClose={() => setProdutoModalAberto(null)}
        title={produtoModalAberto ? `${produtoModalAberto.produto} · ${produtoModalAberto.quantidade} aviso(s)` : 'Avisos do grupo'}
        size="lg"
      >
        {produtoModalAberto ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4" style={{ backgroundColor: '#f6f8f4', border: '1px solid #e3e8de' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: '#2f3a2f' }}>Faturamento potencial do grupo</p>
                <p className="text-xs mt-1" style={{ color: '#6f786d' }}>{produtoModalAberto.clientes.length} cliente(s) impactado(s)</p>
              </div>
              <div className="px-3 py-2 rounded-2xl text-sm font-bold" style={{ backgroundColor: '#eef6ef', color: '#2d6f43' }}>
                {formatCurrency(produtoModalAberto.total)}
              </div>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {produtoModalAberto.alertas.map((alerta) => {
                const prioridade = priorityStyle(alerta.PRIORIDADE);
                const valorAlerta = getAlertValue(alerta);
                const lido = isRead(alerta.LIDO);

                return (
                  <div key={`modal-alerta-${alerta.ID}`} className="rounded-2xl p-4" style={{ backgroundColor: '#ffffff', border: `1px solid ${prioridade.border}`, opacity: lido ? 0.65 : 1 }}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold" style={{ color: '#1b1c1a' }}>{alerta.TITULO}</h3>
                          <span className="px-2 py-1 rounded-full text-[11px] font-bold" style={{ backgroundColor: prioridade.bg, color: prioridade.color }}>
                            {prioridade.label}
                          </span>
                          <span className="px-2 py-1 rounded-full text-[11px] font-bold" style={{ backgroundColor: '#edf1ea', color: '#53604f' }}>
                            {tipoLabel[alerta.TIPO_ALERTA] || alerta.TIPO_ALERTA}
                          </span>
                        </div>
                        <p className="text-sm mt-2" style={{ color: '#5f6a5d' }}>{alerta.DESCRICAO}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-3 text-sm" style={{ color: '#6f786d' }}>
                          <button
                            type="button"
                            onClick={() => selecionarCliente(alerta.ID_CLIENTE, alerta.NOME_CLIENTE || `Cliente ${alerta.ID_CLIENTE}`)}
                            className="font-semibold underline-offset-2 hover:underline"
                            style={{ color: '#137432' }}
                          >
                            {alerta.NOME_CLIENTE || `Cliente ${alerta.ID_CLIENTE}`}
                          </button>
                          <span>{formatServerDateTimeBrasilia(alerta.DATA_GERACAO) || 'Data não informada'}</span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <div className="px-3 py-2 rounded-2xl text-sm font-bold" style={{ backgroundColor: '#eaf2ff', color: '#285cc4' }}>
                          {formatCurrency(valorAlerta)}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setProdutoModalAberto(null);
                              navigate(`/clientes/${alerta.ID_CLIENTE}`);
                            }}
                            className="h-9 px-3 rounded-xl text-sm font-semibold"
                            style={{ backgroundColor: '#e7f3ea', color: '#1f6f39' }}
                          >
                            Ver cliente
                          </button>
                          {!lido ? (
                            <button
                              type="button"
                              onClick={() => marcarLido(alerta.ID)}
                              disabled={saving}
                              className="h-9 px-3 rounded-xl text-sm font-semibold disabled:opacity-60"
                              style={{ backgroundColor: '#137432', color: '#ffffff' }}
                            >
                              Marcar como lido
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
