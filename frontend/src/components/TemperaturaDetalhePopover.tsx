import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, CalendarCheck, Clock3, RefreshCw, TrendingUp, X } from 'lucide-react';
import { callSFSingle, formatCurrency, formatDate, SF } from '../hooks/useMitra';

interface TemperaturaDetalhePopoverProps {
  clienteId: number;
  idVendedor?: string;
  codFilial?: string;
  idSecao?: string;
  onClose: () => void;
}

interface FatorDetalhe {
  key: 'recencia' | 'frequencia' | 'tendencia' | 'visitas';
  nome: string;
  pontos: number;
  maxPontos: number;
  dado: string;
  descricao: string;
  Icon: typeof Clock3;
}

interface TemperaturaDetalhe {
  nomeCliente: string;
  ramoCliente: string;
  classificacao: string;
  pontuacaoTotal: number;
  fatores: FatorDetalhe[];
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDate(value: unknown): string {
  const text = String(value || '').slice(0, 10);
  return text ? formatDate(text) : 'sem registro';
}

function percentColor(percent: number) {
  if (percent >= 70) return '#137432';
  if (percent >= 40) return '#d49500';
  return '#c12626';
}

function classStyle(classificacao: string) {
  const key = String(classificacao || '').toUpperCase();
  if (key === 'QUENTE') return { bg: '#e6f4ea', color: '#1f7d3f', bar: '#137432' };
  if (key === 'MORNO') return { bg: '#fff4dc', color: '#a26a00', bar: '#d49500' };
  return { bg: '#eceee9', color: '#5f6a5d', bar: '#7a8379' };
}

function normalizeDetalhe(row: any): TemperaturaDetalhe | null {
  if (!row) return null;

  const recenciaDias = row.recenciaDiasDesdeUltimaCompra ?? row.RECENCIADIASDESDEULTIMACOMPRA;
  const frequenciaCiclo = row.frequenciaCicloMedioDias ?? row.FREQUENCIACICLOMEDIODIAS;
  const frequenciaFator = row.frequenciaFatorCiclo ?? row.FREQUENCIAFATORCICLO;
  const tendenciaVariacao = row.tendenciaVariacaoPercent ?? row.TENDENCIAVARIACAOPERCENT;
  const visitasDias = row.visitasDiasDesdeUltimaVisita ?? row.VISITASDIASDESDEULTIMAVISITA;

  return {
    nomeCliente: String(row.nomeCliente || row.NOME_CLIENTE || 'Cliente'),
    ramoCliente: String(row.ramoCliente || row.RAMO_CLIENTE || 'Sem ramo'),
    classificacao: String(row.classificacao || row.CLASSIFICACAO || 'Frio'),
    pontuacaoTotal: toNumber(row.pontuacaoTotal || row.PONTUACAOTOTAL),
    fatores: [
      {
        key: 'recencia',
        nome: 'Recência',
        pontos: toNumber(row.recenciaPontos || row.RECENCIAPONTOS),
        maxPontos: toNumber(row.recenciaMaxPontos || row.RECENCIAMAXPONTOS || 30),
        dado: `Última compra: ${normalizeDate(row.recenciaUltimaCompra || row.RECENCIAULTIMACOMPRA)} — ${recenciaDias ?? 'sem'} dias atrás`,
        descricao: String(row.recenciaDescricao || row.RECENCIADESCRICAO || ''),
        Icon: Clock3,
      },
      {
        key: 'frequencia',
        nome: 'Frequência',
        pontos: toNumber(row.frequenciaPontos || row.FREQUENCIAPONTOS),
        maxPontos: toNumber(row.frequenciaMaxPontos || row.FREQUENCIAMAXPONTOS || 25),
        dado: `Ciclo médio: ${frequenciaCiclo || 0} dias — atual: ${frequenciaFator ?? '—'}x`,
        descricao: String(row.frequenciaDescricao || row.FREQUENCIADESCRICAO || ''),
        Icon: RefreshCw,
      },
      {
        key: 'tendencia',
        nome: 'Tendência',
        pontos: toNumber(row.tendenciaPontos || row.TENDENCIAPONTOS),
        maxPontos: toNumber(row.tendenciaMaxPontos || row.TENDENCIAMAXPONTOS || 25),
        dado: `Volume ${toNumber(tendenciaVariacao).toFixed(1)}% vs período anterior`,
        descricao: `${String(row.tendenciaDescricao || row.TENDENCIADESCRICAO || '')} (${formatCurrency(toNumber(row.tendenciaVolumeUltimos2Meses || row.TENDENCIAVOLUMEULTIMOS2MESES))} vs ${formatCurrency(toNumber(row.tendenciaVolume2MesesAnteriores || row.TENDENCIAVOLUME2MESESANTERIORES))})`,
        Icon: TrendingUp,
      },
      {
        key: 'visitas',
        nome: 'Visitas',
        pontos: toNumber(row.visitasPontos || row.VISITASPONTOS),
        maxPontos: toNumber(row.visitasMaxPontos || row.VISITASMAXPONTOS || 20),
        dado: `Última visita: ${normalizeDate(row.visitasUltimaVisita || row.VISITASULTIMAVISITA)} — ${visitasDias ?? 'sem'} dias atrás`,
        descricao: String(row.visitasDescricao || row.VISITASDESCRICAO || ''),
        Icon: CalendarCheck,
      },
    ],
  };
}

function recomendacao(fatores: FatorDetalhe[]) {
  const weakest = [...fatores].sort((a, b) => (a.pontos / Math.max(a.maxPontos, 1)) - (b.pontos / Math.max(b.maxPontos, 1)))[0];
  if (!weakest || weakest.key === 'recencia') return 'Priorize um contato esta semana para reativar o cliente.';
  if (weakest.key === 'frequencia') return 'Ciclo de compra ultrapassado — cliente pode estar comprando de concorrente.';
  if (weakest.key === 'tendencia') return 'Volume em queda — investigue o motivo na próxima visita.';
  return 'Agende uma visita presencial para fortalecer o relacionamento.';
}

export default function TemperaturaDetalhePopover({ clienteId, idVendedor = '', codFilial = '', idSecao = '', onClose }: TemperaturaDetalhePopoverProps) {
  const navigate = useNavigate();
  const [detalhe, setDetalhe] = useState<TemperaturaDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    callSFSingle(SF.temperaturaClienteDetalhe, {
      idCliente: String(clienteId),
      idVendedor,
      codFilial,
      idSecao,
    })
      .then((row) => {
        if (!mounted) return;
        const normalized = normalizeDetalhe(row);
        if (!normalized) setError('Dados de pontuação indisponíveis no momento.');
        setDetalhe(normalized);
      })
      .catch(() => {
        if (mounted) setError('Dados de pontuação indisponíveis no momento.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [clienteId, codFilial, idSecao, idVendedor]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const style = classStyle(detalhe?.classificacao || 'Frio');
  const total = Math.max(0, Math.min(100, detalhe?.pontuacaoTotal || 0));

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 animate-fadeIn"
      style={{ backgroundColor: 'rgba(27, 28, 26, 0.42)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="w-[480px] max-w-[90vw] max-h-[80vh] overflow-y-auto rounded-3xl p-5 shadow-2xl animate-scaleIn"
        style={{ backgroundColor: '#ffffff', border: '1px solid #dfe6da' }}
      >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: '#7b8379' }}>Temperatura do cliente</p>
          <h3 className="text-xl font-extrabold mt-1 truncate" style={{ color: '#1b1c1a' }}>{loading ? 'Carregando...' : detalhe?.nomeCliente || 'Cliente'}</h3>
          {!loading && detalhe ? (
            <span className="mt-2 inline-flex px-2 py-1 rounded-full text-xs font-semibold" style={{ backgroundColor: '#eef6ef', color: '#2d6f43' }}>
              Ramo: {detalhe.ramoCliente || 'Sem ramo'}
            </span>
          ) : null}
        </div>
        <button type="button" onClick={onClose} className="w-8 h-8 rounded-xl inline-flex items-center justify-center" style={{ backgroundColor: '#edf1ea', color: '#5f6a5d' }}>
          <X size={16} />
        </button>
      </div>

      {loading ? (
        <div className="mt-5 space-y-3 animate-pulse">
          {[0, 1, 2].map((item) => <div key={item} className="h-12 rounded-2xl" style={{ backgroundColor: '#eef2ec' }} />)}
        </div>
      ) : error || !detalhe ? (
        <div className="mt-5 rounded-2xl p-4 text-sm" style={{ backgroundColor: '#fff4dc', color: '#8a5a00' }}>
          Dados de pontuação indisponíveis no momento.
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="px-4 py-2 rounded-full text-sm font-bold" style={{ backgroundColor: style.bg, color: style.color }}>
              {detalhe.classificacao}
            </span>
            <span className="text-sm font-bold" style={{ color: '#1b1c1a' }}>{total} / 100 pontos</span>
          </div>
          <div className="mt-3 h-3 rounded-full overflow-hidden" style={{ backgroundColor: '#e8eee4' }}>
            <div className="h-full rounded-full" style={{ width: `${total}%`, backgroundColor: style.bar }} />
          </div>

          <div className="mt-5 space-y-3">
            {detalhe.fatores.map((fator) => {
              const percent = Math.round((fator.pontos / Math.max(fator.maxPontos, 1)) * 100);
              const color = percentColor(percent);
              const Icon = fator.Icon;
              return (
                <div key={fator.key} className="rounded-2xl p-3" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#e7f3ea', color }}>
                      <Icon size={17} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold" style={{ color: '#1b1c1a' }}>{fator.nome}</p>
                        <p className="text-xs font-bold" style={{ color }}>{fator.pontos}/{fator.maxPontos}</p>
                      </div>
                      <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#e1e7dc' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(percent, 100)}%`, backgroundColor: color }} />
                      </div>
                      <p className="text-xs mt-2" style={{ color: '#5f6a5d' }}>{fator.dado}</p>
                      <p className="text-xs mt-1" style={{ color: '#7b8379' }}>{fator.descricao}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 rounded-2xl p-3" style={{ backgroundColor: '#eef6ef', color: '#2d6f43' }}>
            <div className="flex items-start gap-2">
              <Activity size={16} className="mt-0.5 shrink-0" />
              <p className="text-sm font-semibold">{recomendacao(detalhe.fatores)}</p>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/alertas?clienteId=${clienteId}`)}
              className="mt-3 h-9 px-4 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: '#17743b', color: '#ffffff' }}
            >
              Ver alertas deste cliente
            </button>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
