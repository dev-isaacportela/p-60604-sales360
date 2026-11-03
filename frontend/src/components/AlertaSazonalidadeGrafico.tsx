import { useCallback, useMemo, useState } from 'react';
import { callSFWithMeta, SF } from '../hooks/useMitra';

interface AlertaSazonalidadeGraficoProps {
  idAlerta: number;
  idCliente: number;
  codigoProduto: string;
  idVendedor: number;
  codFilial: number;
  idSecao?: string | null;
  tipoAlerta: string;
}

interface HistoricoMes {
  mesAno: string;
  volume: number;
  qtdPedidos: number;
}

const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function normalizeRow(row: any): HistoricoMes {
  const mesAno = String(row.mesAno || row.MESANO || row.MES_ANO || '');
  return {
    mesAno,
    volume: Number(row['volumeR$'] ?? row.VOLUME_RS ?? row.VOLUME ?? 0),
    qtdPedidos: Number(row.qtdPedidos ?? row.QTD_PEDIDOS ?? 0),
  };
}

function monthLabel(mesAno: string) {
  const [, monthRaw] = mesAno.split('-');
  const month = Number(monthRaw || 0);
  if (!month || month < 1 || month > 12) return mesAno;
  return meses[month - 1];
}

function tooltipLabel(item: HistoricoMes) {
  const [yearRaw, monthRaw] = item.mesAno.split('-');
  const month = Number(monthRaw || 0);
  const label = month >= 1 && month <= 12 ? `${meses[month - 1]}/${String(yearRaw).slice(-2)}` : item.mesAno;
  const valor = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(item.volume);
  return `${label}: ${valor} (${item.qtdPedidos} pedido${item.qtdPedidos === 1 ? '' : 's'})`;
}

function compactCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function getButtonLabel(tipoAlerta: string, expanded: boolean) {
  if (tipoAlerta === 'VOLUME_CRESCENTE') return expanded ? 'Ocultar gráfico' : 'Ver gráfico';
  return expanded ? 'Ocultar padrão histórico' : 'Ver padrão histórico';
}

function getChartTitle(tipoAlerta: string, positiveCount: number, confirmed: boolean) {
  if (tipoAlerta === 'VOLUME_CRESCENTE') {
    return positiveCount === 0
      ? 'Evolução mensal — Sem faturamento no período'
      : 'Evolução mensal — crescimento do cliente';
  }

  if (positiveCount === 0) return 'Histórico anual — Sem histórico neste período';
  return confirmed ? 'Histórico anual — padrão de sazonalidade confirmado' : `Histórico anual — apenas ${positiveCount} ocorrências`;
}

export default function AlertaSazonalidadeGrafico({
  idAlerta,
  idCliente,
  codigoProduto,
  idVendedor,
  codFilial,
  idSecao,
  tipoAlerta,
}: AlertaSazonalidadeGraficoProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<HistoricoMes[]>([]);

  const carregar = useCallback(async () => {
    if (data.length > 0 || loading) return;
    setLoading(true);
    setError('');
    try {
      const result = await callSFWithMeta(SF.alertasInteligentesDetalheGrafico, {
        idAlerta: String(idAlerta),
        idCliente: String(idCliente),
        codigoProduto,
        idVendedor: String(idVendedor),
        codFilial: String(codFilial),
        idSecao: String(idSecao || ''),
      });
      if (result.error) throw new Error(result.error);
      setData(result.rows.map(normalizeRow));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dados históricos indisponíveis');
    } finally {
      setLoading(false);
    }
  }, [codFilial, codigoProduto, data.length, idAlerta, idCliente, idSecao, idVendedor, loading]);

  async function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next) await carregar();
  }

  const chart = useMemo(() => {
    const width = 720;
    const height = 72;
    const left = 8;
    const right = 8;
    const top = 20;
    const bottom = 12;
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;
    const maxValue = Math.max(...data.map((item) => item.volume), 1);
    const positiveItems = data.filter((item) => item.volume > 0);
    const avgPositive = positiveItems.length > 0
      ? positiveItems.reduce((sum, item) => sum + item.volume, 0) / positiveItems.length
      : 0;
    const avgY = top + innerHeight - ((avgPositive / maxValue) * innerHeight);
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentMesAno = `${now.getFullYear()}-${String(currentMonth).padStart(2, '0')}`;
    const sameMonthPositive = data.filter((item) => {
      const [, monthRaw] = item.mesAno.split('-');
      return Number(monthRaw) === currentMonth && item.volume > 0;
    }).length;
    const confirmed = sameMonthPositive >= 2 || positiveItems.length >= 3;
    const currentIndex = Math.max(0, data.findIndex((item) => item.mesAno === currentMesAno));
    const barGap = 4;
    const barWidth = Math.max(6, (innerWidth / Math.max(data.length, 1)) - barGap);

    return {
      width,
      height,
      left,
      top,
      bottom,
      innerWidth,
      innerHeight,
      maxValue,
      avgY,
      currentMonth,
      currentIndex,
      barGap,
      barWidth,
      positiveCount: positiveItems.length,
      sameMonthPositive,
      confirmed,
    };
  }, [data]);

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={toggle}
        className="h-9 px-3 rounded-xl text-sm font-semibold"
        style={{ backgroundColor: '#edf1ea', color: '#137432', border: '1px solid #dbe4d6' }}
      >
        {getButtonLabel(tipoAlerta, expanded)}
      </button>

      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: expanded ? 162 : 0, opacity: expanded ? 1 : 0 }}
      >
        <div className="mt-3 rounded-2xl p-3" style={{ backgroundColor: '#ffffff', border: '1px solid #e3e9de' }}>
          {loading ? (
            <div className="h-[92px] animate-pulse rounded-xl" style={{ backgroundColor: '#edf1ea' }} />
          ) : error ? (
            <div className="h-[92px] flex items-center text-sm" style={{ color: '#b42318' }}>
              Dados históricos indisponíveis
            </div>
          ) : data.length === 0 ? (
            <div className="h-[92px] flex items-center text-sm" style={{ color: '#697368' }}>
              Dados históricos indisponíveis
            </div>
          ) : (
            <>
              <div className="text-xs font-bold mb-2" style={{ color: chart.confirmed ? '#137432' : '#a26a00' }}>
                {getChartTitle(tipoAlerta, chart.positiveCount, chart.confirmed)}
              </div>
              <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="w-full h-[72px]" role="img" aria-label={tipoAlerta === 'VOLUME_CRESCENTE' ? 'Evolução mensal de faturamento do cliente' : 'Histórico anual de compras do produto'}>
                {chart.positiveCount > 0 ? (
                  <line
                    x1={chart.left}
                    x2={chart.left + chart.innerWidth}
                    y1={chart.avgY}
                    y2={chart.avgY}
                    stroke="#9aa39a"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                ) : null}

                {tipoAlerta === 'REPOSICAO_PREVISTA' && chart.currentIndex >= 0 ? (
                  <line
                    x1={chart.left + (chart.currentIndex * (chart.innerWidth / data.length)) + ((chart.innerWidth / data.length) / 2)}
                    x2={chart.left + (chart.currentIndex * (chart.innerWidth / data.length)) + ((chart.innerWidth / data.length) / 2)}
                    y1={chart.top - 1}
                    y2={chart.height - chart.bottom}
                    stroke="#d92d20"
                    strokeWidth="2"
                    strokeDasharray="3 3"
                  />
                ) : null}

                {data.map((item, index) => {
                  const slot = chart.innerWidth / data.length;
                  const x = chart.left + (index * slot) + (chart.barGap / 2);
                  const barHeight = item.volume > 0 ? Math.max(3, (item.volume / chart.maxValue) * chart.innerHeight) : 3;
                  const y = chart.top + chart.innerHeight - barHeight;
                  const [, monthRaw] = item.mesAno.split('-');
                  const sameMonth = Number(monthRaw) === chart.currentMonth;
                  const highlighted = sameMonth && (item.volume > 0 || index === chart.currentIndex);
                  const fill = highlighted ? '#137432' : item.volume > 0 ? '#9ed9ad' : '#dde4dc';
                  const stroke = highlighted ? '#f2c94c' : 'transparent';
                  return (
                    <g key={item.mesAno}>
                      <rect
                        x={x}
                        y={y}
                        width={chart.barWidth}
                        height={barHeight}
                        rx="2"
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={highlighted ? 2 : 0}
                      >
                        <title>{tooltipLabel(item)}</title>
                      </rect>
                      {item.volume > 0 ? (
                        <text
                          x={x + (chart.barWidth / 2)}
                          y={Math.max(9, y - 4)}
                          textAnchor="middle"
                          fontSize="9"
                          fontWeight="700"
                          fill="#137432"
                          stroke="#ffffff"
                          strokeWidth="3"
                          paintOrder="stroke"
                        >
                          {compactCurrency(item.volume)}
                        </text>
                      ) : null}
                      {index % 3 === 0 ? (
                        <text x={x + (chart.barWidth / 2)} y={chart.height - 1} textAnchor="middle" fontSize="8" fill="#7a8379">
                          {monthLabel(item.mesAno)}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </svg>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
