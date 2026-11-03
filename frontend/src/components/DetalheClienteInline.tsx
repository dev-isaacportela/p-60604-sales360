import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { callSF, SF, formatCurrency } from '../hooks/useMitra';
import Select from './ui/Select';
import { buildOperationalWeeksForMonth } from '../lib/operational-week';

interface SemanaResumo {
  ANO: number;
  MES: number;
  SEMANA_NUMERO: number;
  DATA_INICIO_SEMANA: string;
  DATA_FIM_SEMANA: string;
  TOTAL_PEDIDOS: number;
  VALOR_TOTAL_SEMANA: number;
}

interface ProdutoSemana {
  CODPROD: number;
  DESCRICAO_PRODUTO: string;
  QTD_SEMANA_ATUAL: number;
  QTD_SEMANA_MES_ANTERIOR: number;
  DELTA_QTD_SEMANA: number;
  VALOR_UNITARIO: number;
  VALOR_TOTAL_PRODUTO_SEMANA: number;
  QTD_PICO_HISTORICO: number;
  TOTAL_SEMANAS_HISTORICO: number;
  HISTORICO_SEMANAL: string;
  STATUS_COMPARATIVO: string;
}

interface HistoricoSemanalPonto {
  label: string;
  qty: number;
}

interface ResumoPedidoSemana {
  NUMPEDIDO: string;
  VALOR_TOTAL_PEDIDO: number;
  DATA_PEDIDO: string;
}

interface SazonalidadeProduto {
  ANO: number;
  MES: number;
  NOME_MES: string;
  CODPROD: number;
  DESCRICAO: string;
  QT_TOTAL: number;
  VALOR_TOTAL: number;
}

interface DetalheClienteInlineProps {
  clienteId: number;
  clienteNome: string;
  clienteCodigo?: string;
  vendedorId?: number;
  mesFiltrado?: string;
  anoFiltrado?: string;
  scopeParams?: {
    scopeMode?: string;
    scopeUserId?: string;
    scopeCodRca?: string;
    scopeCodFilial?: string;
    scopeCodepto?: string;
    scopeIdSecao?: string;
  };
  openWeekKey: string | null;
  onChangeOpenWeekKey: (weekKey: string | null) => void;
}

function getWeekKey(semana: SemanaResumo): string {
  return `${semana.ANO}-${semana.MES}-${semana.SEMANA_NUMERO}`;
}

function formatDateShort(dateIso?: string) {
  if (!dateIso) return '--';
  const iso = dateIso.includes('T') ? dateIso : `${dateIso}T00:00:00`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return dateIso;
  return new Intl.DateTimeFormat('pt-BR').format(date);
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function formatMonthShort(year: number, month: number) {
  const monthLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const safeMonth = Math.min(12, Math.max(1, month));
  return `${monthLabels[safeMonth - 1]}/${String(year).slice(-2)}`;
}

function formatQty(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function parseHistoricoSemanal(serialized: string): HistoricoSemanalPonto[] {
  if (!serialized) return [];
  return serialized
    .split('|')
    .map((entry) => {
      const separatorIndex = entry.lastIndexOf(':');
      if (separatorIndex === -1) return null;
      const label = entry.slice(0, separatorIndex);
      const qty = Number(entry.slice(separatorIndex + 1));
      if (!label) return null;
      return { label, qty: Number.isFinite(qty) ? qty : 0 };
    })
    .filter((entry): entry is HistoricoSemanalPonto => entry !== null);
}

function getComparativoStyle(status: string) {
  switch ((status || '').toUpperCase()) {
    case 'SEM_RECOMPRA':
      return {
        rowBg: 'rgba(180, 35, 24, 0.05)',
        rowOpacity: 0.72,
        badgeBg: '#fde8e8',
        badgeColor: '#b42318',
        label: 'Deixou de comprar',
      };
    case 'QUEDA':
      return {
        rowBg: 'rgba(180, 35, 24, 0.035)',
        rowOpacity: 0.84,
        badgeBg: '#fff1f1',
        badgeColor: '#b42318',
        label: 'Queda',
      };
    case 'NOVO':
      return {
        rowBg: 'rgba(23, 116, 59, 0.08)',
        rowOpacity: 1,
        badgeBg: '#ddf6e7',
        badgeColor: '#17743b',
        label: 'Novo na semana',
      };
    case 'ALTA':
      return {
        rowBg: 'rgba(23, 116, 59, 0.05)',
        rowOpacity: 1,
        badgeBg: '#e6f4ea',
        badgeColor: '#17743b',
        label: 'Comprou a mais',
      };
    default:
      return {
        rowBg: '#ffffff',
        rowOpacity: 1,
        badgeBg: '#eef2eb',
        badgeColor: '#5f6b5e',
        label: 'Estável',
      };
  }
}

function MiniSazonalidadeSemanal({ historico, pico, totalSemanas }: { historico: HistoricoSemanalPonto[]; pico: number; totalSemanas: number }) {
  const pontos = useMemo(() => [...historico].reverse(), [historico]);
  const maxQty = useMemo(() => Math.max(pico, ...pontos.map((item) => item.qty), 1), [pico, pontos]);

  if (pontos.length === 0) {
    return <span style={{ color: '#7a8579' }}>Sem histórico</span>;
  }

  return (
    <div className="min-w-[220px]">
      <div className="flex items-end gap-1 h-12">
        {pontos.map((ponto) => {
          const height = Math.max(10, Math.round((ponto.qty / maxQty) * 40));
          const isPeak = ponto.qty === pico && pico > 0;
          return (
            <div
              key={`${ponto.label}-${ponto.qty}`}
              className="flex-1 rounded-t-md"
              style={{
                height,
                backgroundColor: isPeak ? '#17743b' : '#b7d4bf',
                opacity: isPeak ? 1 : 0.88,
                minWidth: 10,
              }}
              title={`${ponto.label}: ${formatQty(ponto.qty)} un`}
            />
          );
        })}
      </div>
      <div className="mt-1 text-[11px] leading-4" style={{ color: '#5f6b5e' }}>
        Pico: <strong>{formatQty(pico)}</strong> un • {Math.max(totalSemanas, pontos.length)} semana(s)
      </div>
    </div>
  );
}

export default function DetalheClienteInline({
  clienteId,
  clienteNome,
  clienteCodigo,
  vendedorId,
  mesFiltrado,
  anoFiltrado,
  scopeParams,
  openWeekKey,
  onChangeOpenWeekKey,
}: DetalheClienteInlineProps) {
  const currentYear = new Date().getFullYear();
  const [ano, setAno] = useState(anoFiltrado || String(currentYear));
  const [semanas, setSemanas] = useState<SemanaResumo[]>([]);
  const [loadingSemanas, setLoadingSemanas] = useState(false);
  const [loadingDetalhes, setLoadingDetalhes] = useState(false);
  const [loadingSazonalidade, setLoadingSazonalidade] = useState(false);
  const [produtos, setProdutos] = useState<ProdutoSemana[]>([]);
  const [pedidos, setPedidos] = useState<ResumoPedidoSemana[]>([]);
  const [sazonalidade, setSazonalidade] = useState<SazonalidadeProduto[]>([]);
  const [activeTab, setActiveTab] = useState<'SEMANAL' | 'SAZONALIDADE'>('SEMANAL');

  const yearOptions = useMemo(() => {
    return Array.from({ length: 6 }, (_, idx) => {
      const year = currentYear - idx;
      return { value: String(year), label: String(year) };
    });
  }, [currentYear]);

  const semanaAberta = useMemo(() => {
    return semanas.find((semana) => getWeekKey(semana) === openWeekKey) || null;
  }, [openWeekKey, semanas]);

  useEffect(() => {
    if (anoFiltrado) setAno(anoFiltrado);
  }, [anoFiltrado]);

  const scopedInput = useMemo(() => ({
    vendedorId: vendedorId ? String(vendedorId) : '',
    scopeMode: scopeParams?.scopeMode || 'ME',
    scopeUserId: scopeParams?.scopeUserId || '',
    scopeCodRca: scopeParams?.scopeCodRca || '',
    scopeCodFilial: scopeParams?.scopeCodFilial || '',
    scopeCodepto: scopeParams?.scopeCodepto || '',
    scopeIdSecao: scopeParams?.scopeIdSecao || '',
  }), [scopeParams, vendedorId]);

  const colunasSazonalidade = useMemo(() => {
    const base = new Date();
    base.setDate(1);
    const cols: Array<{ key: string; label: string }> = [];
    for (let idx = 11; idx >= 0; idx -= 1) {
      const ref = new Date(base.getFullYear(), base.getMonth() - idx, 1);
      const ano = ref.getFullYear();
      const mes = ref.getMonth() + 1;
      cols.push({
        key: `${ano}-${pad2(mes)}`,
        label: formatMonthShort(ano, mes),
      });
    }
    return cols;
  }, []);

  const sazonalidadePivot = useMemo(() => {
    const mapByProduct = new Map<string, {
      codProd: number;
      descricao: string;
      maxQt: number;
      cells: Record<string, { qt: number; valor: number; label: string }>;
    }>();

    sazonalidade.forEach((item) => {
      const keyProduto = `${item.CODPROD}::${item.DESCRICAO}`;
      const monthKey = `${item.ANO}-${pad2(item.MES)}`;
      if (!colunasSazonalidade.some((col) => col.key === monthKey)) return;

      const current = mapByProduct.get(keyProduto) || {
        codProd: item.CODPROD,
        descricao: item.DESCRICAO,
        maxQt: 0,
        cells: {},
      };

      current.cells[monthKey] = {
        qt: Number(item.QT_TOTAL || 0),
        valor: Number(item.VALOR_TOTAL || 0),
        label: item.NOME_MES,
      };
      current.maxQt = Math.max(current.maxQt, Number(item.QT_TOTAL || 0));
      mapByProduct.set(keyProduto, current);
    });

    return Array.from(mapByProduct.values()).sort((a, b) => a.codProd - b.codProd);
  }, [colunasSazonalidade, sazonalidade]);

  const getHeatCellStyle = useCallback((qt: number, maxQt: number) => {
    if (qt <= 0 || maxQt <= 0) {
      return {
        backgroundColor: '#ffffff',
        color: '#7a8579',
      };
    }

    const ratio = Math.min(1, qt / maxQt);
    const alpha = (0.15 + ratio * 0.65).toFixed(3);
    return {
      backgroundColor: `rgba(19, 116, 50, ${alpha})`,
      color: ratio > 0.55 ? '#ffffff' : '#1f3b2b',
    };
  }, []);

  const carregarSemanas = useCallback(async () => {
    setLoadingSemanas(true);
    try {
      const rows = await callSF(SF.clienteDetalheVendasSemanais, {
        ID_CLIENTE: String(clienteId),
        ...scopedInput,
        ANO: ano,
        MES: mesFiltrado || '',
      });

      const parsed = rows.map((row: any) => ({
        ANO: Number(row.ANO || 0),
        MES: Number(row.MES || 0),
        SEMANA_NUMERO: Number(row.SEMANA_NUMERO || 0),
        DATA_INICIO_SEMANA: String(row.DATA_INICIO_SEMANA || ''),
        DATA_FIM_SEMANA: String(row.DATA_FIM_SEMANA || ''),
        TOTAL_PEDIDOS: Number(row.TOTAL_PEDIDOS || 0),
        VALOR_TOTAL_SEMANA: Number(row.VALOR_TOTAL_SEMANA || 0),
      } as SemanaResumo));

      let normalized = parsed;
      const filteredMonth = Number(mesFiltrado || 0);
      const filteredYear = Number(ano || 0);

      if (filteredMonth >= 1 && filteredMonth <= 12 && filteredYear > 0) {
        const sequence = buildOperationalWeeksForMonth(filteredYear, filteredMonth) as SemanaResumo[];
        const mapByWeek = new Map<number, SemanaResumo>();
        parsed.forEach((item) => {
          mapByWeek.set(item.SEMANA_NUMERO, item);
        });

        normalized = sequence.map((seq) => {
          const found = mapByWeek.get(seq.SEMANA_NUMERO);
          if (!found) return seq;
          return {
            ...seq,
            TOTAL_PEDIDOS: found.TOTAL_PEDIDOS,
            VALOR_TOTAL_SEMANA: found.VALOR_TOTAL_SEMANA,
            DATA_INICIO_SEMANA: found.DATA_INICIO_SEMANA || seq.DATA_INICIO_SEMANA,
            DATA_FIM_SEMANA: found.DATA_FIM_SEMANA || seq.DATA_FIM_SEMANA,
          };
        });
      }

      setSemanas(normalized);

      if (normalized.length === 0) {
        onChangeOpenWeekKey(null);
        setProdutos([]);
        setPedidos([]);
        return;
      }

      if (!openWeekKey || !normalized.some((semana) => getWeekKey(semana) === openWeekKey)) {
        onChangeOpenWeekKey(getWeekKey(normalized[0]));
      }
    } finally {
      setLoadingSemanas(false);
    }
  }, [ano, clienteId, mesFiltrado, onChangeOpenWeekKey, openWeekKey, scopedInput]);

  const carregarDetalhesSemana = useCallback(async (semana: SemanaResumo) => {
    setLoadingDetalhes(true);
    try {
      const [produtosRows, pedidosRows] = await Promise.all([
        callSF(SF.clienteDetalheItensSemana, {
          ID_CLIENTE: String(clienteId),
          ...scopedInput,
          ANO: String(semana.ANO),
          MES: String(semana.MES),
          SEMANA_NUMERO: String(semana.SEMANA_NUMERO),
        }),
        callSF(SF.clienteDetalheResumoPedidosSemana, {
          ID_CLIENTE: String(clienteId),
          ...scopedInput,
          ANO: String(semana.ANO),
          MES: String(semana.MES),
          SEMANA_NUMERO: String(semana.SEMANA_NUMERO),
        }),
      ]);

      setProdutos(produtosRows.map((row: any) => ({
        CODPROD: Number(row.CODPROD || 0),
        DESCRICAO_PRODUTO: String(row.DESCRICAO_PRODUTO || 'Sem descrição'),
        QTD_SEMANA_ATUAL: Number(row.QTD_SEMANA_ATUAL || 0),
        QTD_SEMANA_MES_ANTERIOR: Number(row.QTD_SEMANA_MES_ANTERIOR || 0),
        DELTA_QTD_SEMANA: Number(row.DELTA_QTD_SEMANA || 0),
        VALOR_UNITARIO: Number(row.VALOR_UNITARIO || 0),
        VALOR_TOTAL_PRODUTO_SEMANA: Number(row.VALOR_TOTAL_PRODUTO_SEMANA || 0),
        QTD_PICO_HISTORICO: Number(row.QTD_PICO_HISTORICO || 0),
        TOTAL_SEMANAS_HISTORICO: Number(row.TOTAL_SEMANAS_HISTORICO || 0),
        HISTORICO_SEMANAL: String(row.HISTORICO_SEMANAL || ''),
        STATUS_COMPARATIVO: String(row.STATUS_COMPARATIVO || 'ESTAVEL'),
      } as ProdutoSemana)));

      setPedidos(pedidosRows.map((row: any) => ({
        NUMPEDIDO: String(row.NUMPEDIDO || ''),
        VALOR_TOTAL_PEDIDO: Number(row.VALOR_TOTAL_PEDIDO || 0),
        DATA_PEDIDO: String(row.DATA_PEDIDO || ''),
      } as ResumoPedidoSemana)));
    } finally {
      setLoadingDetalhes(false);
    }
  }, [clienteId, scopedInput]);

  const carregarSazonalidade = useCallback(async () => {
    setLoadingSazonalidade(true);
    try {
      const rows = await callSF(SF.sazonalidadeClienteProdutos, {
        ID_CLIENTE: String(clienteId),
        ...scopedInput,
      });

      setSazonalidade(rows.map((row: any) => ({
        ANO: Number(row.ANO || 0),
        MES: Number(row.MES || 0),
        NOME_MES: String(row.NOME_MES || ''),
        CODPROD: Number(row.CODPROD || 0),
        DESCRICAO: String(row.DESCRICAO || 'Sem descrição'),
        QT_TOTAL: Number(row.QT_TOTAL || 0),
        VALOR_TOTAL: Number(row.VALOR_TOTAL || 0),
      } as SazonalidadeProduto)));
    } finally {
      setLoadingSazonalidade(false);
    }
  }, [clienteId, scopedInput]);

  useEffect(() => {
    setAno(anoFiltrado || String(currentYear));
    setActiveTab('SEMANAL');
  }, [anoFiltrado, currentYear, clienteId]);

  useEffect(() => {
    carregarSemanas();
  }, [carregarSemanas]);

  useEffect(() => {
    if (!semanaAberta) {
      setProdutos([]);
      setPedidos([]);
      return;
    }
    carregarDetalhesSemana(semanaAberta);
  }, [carregarDetalhesSemana, semanaAberta]);

  useEffect(() => {
    if (activeTab !== 'SAZONALIDADE') return;
    carregarSazonalidade();
  }, [activeTab, carregarSazonalidade]);

  const toggleSemana = useCallback((semana: SemanaResumo) => {
    const nextKey = getWeekKey(semana);
    if (openWeekKey === nextKey) {
      onChangeOpenWeekKey(null);
      return;
    }
    onChangeOpenWeekKey(nextKey);
  }, [onChangeOpenWeekKey, openWeekKey]);

  return (
    <div className="rounded-2xl p-4 animate-fadeIn" style={{ backgroundColor: '#ffffff', border: '1px solid #dfe6da' }}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: '#1b1c1a' }}>{clienteNome}</p>
          <p className="text-xs" style={{ color: '#6b766a' }}>Código: {clienteCodigo || clienteId}</p>
        </div>
        <div className="w-[140px]">
          <Select
            label="Ano"
            value={ano}
            onChange={setAno}
            options={yearOptions}
          />
        </div>
      </div>

      <div className="mb-3 inline-flex items-center rounded-lg p-1" style={{ backgroundColor: '#edf1ea', border: '1px solid #dbe4d6' }}>
        <button
          type="button"
          onClick={() => setActiveTab('SEMANAL')}
          className="h-8 px-3 rounded-md text-sm font-semibold"
          style={{ backgroundColor: activeTab === 'SEMANAL' ? '#17743b' : 'transparent', color: activeTab === 'SEMANAL' ? '#ffffff' : '#5f6a5d' }}
        >
          Semanal
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('SAZONALIDADE')}
          className="h-8 px-3 rounded-md text-sm font-semibold"
          style={{ backgroundColor: activeTab === 'SAZONALIDADE' ? '#17743b' : 'transparent', color: activeTab === 'SAZONALIDADE' ? '#ffffff' : '#5f6a5d' }}
        >
          Sazonalidade
        </button>
      </div>

      {activeTab === 'SEMANAL' ? (
        loadingSemanas ? (
          <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: '#f6f9f5', color: '#6a7568' }}>
            Carregando semanas...
          </div>
        ) : semanas.length === 0 ? (
          <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: '#f6f9f5', color: '#6a7568' }}>
            Nenhuma compra encontrada para este período
          </div>
        ) : (
          <div className="space-y-2">
            {semanas.map((semana) => {
              const isOpen = getWeekKey(semana) === openWeekKey;
              return (
                <div key={getWeekKey(semana)} className="rounded-xl" style={{ border: '1px solid #e4ebe0', backgroundColor: '#f8faf7' }}>
                  <button
                    type="button"
                    onClick={() => toggleSemana(semana)}
                    className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left"
                    style={{ color: '#2a312a' }}
                  >
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      <span className="text-sm font-semibold">
                        Semana {semana.SEMANA_NUMERO} - {formatDateShort(semana.DATA_INICIO_SEMANA)} a {formatDateShort(semana.DATA_FIM_SEMANA)}
                      </span>
                    </div>
                    <div className="text-xs" style={{ color: '#5f6b5e' }}>
                      {semana.TOTAL_PEDIDOS} pedido(s) • {formatCurrency(semana.VALOR_TOTAL_SEMANA)}
                    </div>
                  </button>

                  {isOpen ? (
                    <div className="px-3 pb-3">
                      {loadingDetalhes ? (
                        <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #e7eee3', color: '#6a7568' }}>
                          Carregando detalhes da semana...
                        </div>
                      ) : produtos.length === 0 ? (
                        <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: '#ffffff', border: '1px solid #e7eee3', color: '#6a7568' }}>
                          Nenhuma compra encontrada para este período
                        </div>
                      ) : (
                        <>
                          <div className="overflow-x-auto rounded-xl" style={{ backgroundColor: '#ffffff', border: '1px solid #e7eee3' }}>
                            <table className="w-full min-w-[1180px]">
                              <thead>
                                <tr className="text-left text-xs" style={{ color: '#7a8579', backgroundColor: '#f1f5ef' }}>
                                  <th className="px-2 py-2">CODPROD</th>
                                  <th className="px-2 py-2">Produto</th>
                                  <th className="px-2 py-2">Movimento</th>
                                  <th className="px-2 py-2">Qtd semana atual</th>
                                  <th className="px-2 py-2">Qtd mesma semana mês anterior</th>
                                  <th className="px-2 py-2">Delta</th>
                                  <th className="px-2 py-2">Sazonalidade semanal</th>
                                  <th className="px-2 py-2">Vlr Unit</th>
                                  <th className="px-2 py-2">Vlr Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {produtos.map((produto) => {
                                  const comparativo = getComparativoStyle(produto.STATUS_COMPARATIVO);
                                  const historico = parseHistoricoSemanal(produto.HISTORICO_SEMANAL);
                                  const deltaColor = produto.DELTA_QTD_SEMANA > 0 ? '#17743b' : produto.DELTA_QTD_SEMANA < 0 ? '#b42318' : '#5f6b5e';
                                  const deltaLabel = `${produto.DELTA_QTD_SEMANA > 0 ? '+' : ''}${formatQty(produto.DELTA_QTD_SEMANA)}`;

                                  return (
                                    <tr
                                      key={`${produto.CODPROD}-${produto.DESCRICAO_PRODUTO}`}
                                      style={{
                                        borderTop: '1px solid #eef2eb',
                                        backgroundColor: comparativo.rowBg,
                                        opacity: comparativo.rowOpacity,
                                      }}
                                    >
                                      <td className="px-2 py-2 text-sm" style={{ color: '#425042' }}>{produto.CODPROD}</td>
                                      <td className="px-2 py-2 text-sm font-medium" style={{ color: '#2a312a' }}>{produto.DESCRICAO_PRODUTO}</td>
                                      <td className="px-2 py-2 text-sm">
                                        <span className="inline-flex rounded-full px-2 py-1 text-[11px] font-semibold" style={{ backgroundColor: comparativo.badgeBg, color: comparativo.badgeColor }}>
                                          {comparativo.label}
                                        </span>
                                      </td>
                                      <td className="px-2 py-2 text-sm font-semibold" style={{ color: '#2a312a' }}>{formatQty(produto.QTD_SEMANA_ATUAL)}</td>
                                      <td className="px-2 py-2 text-sm" style={{ color: '#425042' }}>{formatQty(produto.QTD_SEMANA_MES_ANTERIOR)}</td>
                                      <td className="px-2 py-2 text-sm font-semibold" style={{ color: deltaColor }}>{deltaLabel}</td>
                                      <td className="px-2 py-2 text-sm" style={{ color: '#425042' }}>
                                        <MiniSazonalidadeSemanal
                                          historico={historico}
                                          pico={produto.QTD_PICO_HISTORICO}
                                          totalSemanas={produto.TOTAL_SEMANAS_HISTORICO}
                                        />
                                      </td>
                                      <td className="px-2 py-2 text-sm" style={{ color: '#425042' }}>{formatCurrency(produto.VALOR_UNITARIO)}</td>
                                      <td className="px-2 py-2 text-sm font-semibold" style={{ color: '#1f6f39' }}>{formatCurrency(produto.VALOR_TOTAL_PRODUTO_SEMANA)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          <div className="mt-2 text-xs" style={{ color: '#5f6b5e' }}>
                            Comparativo da semana selecionada contra a mesma semana do mês anterior. Linhas em vermelho mostram perda ou ausência de recompra; altas ficam destacadas em verde.
                          </div>
                          <div className="mt-2 text-xs" style={{ color: '#5f6b5e' }}>
                            <span className="font-semibold">Pedidos:</span>{' '}
                            {pedidos.length === 0 ? 'Nenhum pedido encontrado' : pedidos.map((pedido) => (
                              <span
                                key={`${pedido.NUMPEDIDO}-${pedido.DATA_PEDIDO}`}
                                className="inline-flex rounded-full px-2 py-1 mr-1 mb-1"
                                style={{ backgroundColor: '#e8f1e6', color: '#345c3c', border: '1px solid #d2e2ce' }}
                              >
                                {pedido.NUMPEDIDO} — {formatCurrency(pedido.VALOR_TOTAL_PEDIDO)}
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )
      ) : loadingSazonalidade ? (
        <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: '#f6f9f5', color: '#6a7568' }}>
          Carregando sazonalidade...
        </div>
      ) : sazonalidadePivot.length === 0 ? (
        <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: '#f6f9f5', color: '#6a7568' }}>
          Nenhuma compra sazonal encontrada para este cliente.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl" style={{ backgroundColor: '#ffffff', border: '1px solid #e7eee3' }}>
          <table className="w-full min-w-[1180px]">
            <thead>
              <tr className="text-left text-xs" style={{ color: '#7a8579', backgroundColor: '#f1f5ef' }}>
                <th className="px-2 py-2">Produto</th>
                {colunasSazonalidade.map((col) => (
                  <th key={`head-${col.key}`} className="px-2 py-2 text-center">{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sazonalidadePivot.map((row) => (
                <tr key={`sazonalidade-${row.codProd}`} style={{ borderTop: '1px solid #eef2eb' }}>
                  <td className="px-2 py-2 text-sm font-semibold sticky left-0 z-10 min-w-[260px]" style={{ color: '#2a312a', backgroundColor: '#ffffff' }}>
                    {row.codProd} - {row.descricao}
                  </td>
                  {colunasSazonalidade.map((col) => {
                    const cell = row.cells[col.key] || { qt: 0, valor: 0, label: col.label };
                    const cellStyle = getHeatCellStyle(cell.qt, row.maxQt);
                    const tooltip = `${col.label} — ${cell.qt.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} unidades — ${formatCurrency(cell.valor)}`;
                    return (
                      <td
                        key={`cell-${row.codProd}-${col.key}`}
                        className="px-2 py-2 text-center text-xs font-semibold"
                        style={cellStyle}
                        title={tooltip}
                      >
                        {cell.qt > 0 ? cell.qt.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 }) : '0'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
