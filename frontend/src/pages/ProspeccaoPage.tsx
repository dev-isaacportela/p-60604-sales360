import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';
import { callSF, callSFWithMeta, SF } from '../hooks/useMitra';

type FiltroTendencia = 'Todos' | 'Alta' | 'Media' | 'Baixa' | 'Cliente inativo';

interface LinhaProspeccao {
  ID_CLIENTE: number;
  NOME_CLIENTE: string;
  CURVA: string;
  SEGMENTO: string;
  ULTIMA_COMPRA: string;
  DIAS_SEM_COMPRAR: number;
  CICLO_MEDIO_DIAS: number;
  TENDENCIA: 'Alta' | 'Media' | 'Baixa' | 'Cliente inativo' | string;
  TOTAL_PEDIDOS_HISTORICO: number;
  SCORE_TOTAL: number;
  TEMPERATURA: 'Quente' | 'Morno' | 'Frio' | string;
}

function getSemanaMesAtual() {
  return Math.min(5, Math.ceil(new Date().getDate() / 7));
}

function getMesAtualLabel() {
  return new Date().toLocaleDateString('pt-BR', { month: 'long' });
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-';
  const [ano, mes, dia] = dateStr.split('-');
  if (!ano || !mes || !dia) return dateStr;
  return `${dia}/${mes}/${ano}`;
}

function normalizeTrend(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function tendenciaStyle(tendencia: string) {
  const key = normalizeTrend(tendencia);
  if (key === 'ALTA') return { bg: '#e6f4ea', color: '#1f7d3f' };
  if (key === 'MEDIA') return { bg: '#fff4dc', color: '#a26a00' };
  if (key === 'CLIENTE INATIVO' || key === 'INATIVO') return { bg: '#fde8e8', color: '#b42318' };
  return { bg: '#eceee9', color: '#6a7368' };
}

function temperaturaStyle(temperatura: string) {
  const key = String(temperatura || '').toUpperCase();
  if (key === 'QUENTE') return { backgroundColor: '#e6f4ea', color: '#1f7d3f' };
  if (key === 'MORNO') return { backgroundColor: '#fff4dc', color: '#a26a00' };
  return { backgroundColor: '#eceee9', color: '#6a7368' };
}

function isTrendMatch(value: string, filter: FiltroTendencia) {
  if (filter === 'Todos') return true;
  const trend = normalizeTrend(value);
  if (filter === 'Cliente inativo') return trend === 'CLIENTE INATIVO' || trend === 'INATIVO';
  return trend === normalizeTrend(filter);
}

export default function ProspeccaoPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [linhas, setLinhas] = useState<LinhaProspeccao[]>([]);
  const [filtroTendencia, setFiltroTendencia] = useState<FiltroTendencia>('Todos');
  const [syncFeedback, setSyncFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  function parseLinhas(rows: any[]): LinhaProspeccao[] {
    return rows.map((row: any) => ({
      ID_CLIENTE: Number(row.ID_CLIENTE || 0),
      NOME_CLIENTE: row.NOME_CLIENTE || 'Cliente sem nome',
      CURVA: row.CURVA || 'C',
      SEGMENTO: row.SEGMENTO || 'Sem segmento',
      ULTIMA_COMPRA: row.ULTIMA_COMPRA || '',
      DIAS_SEM_COMPRAR: Number(row.DIAS_SEM_COMPRAR || 0),
      CICLO_MEDIO_DIAS: Number(row.CICLO_MEDIO_DIAS || 0),
      TENDENCIA: row.TENDENCIA || 'Baixa',
      TOTAL_PEDIDOS_HISTORICO: Number(row.TOTAL_PEDIDOS_HISTORICO || 0),
      SCORE_TOTAL: 0,
      TEMPERATURA: 'Frio',
    } as LinhaProspeccao));
  }

  function aplicarTemperatura(baseRows: LinhaProspeccao[], temperaturaRows: any[]): LinhaProspeccao[] {
    const temperaturaMap = new Map<number, { score: number; temperatura: string }>();
    (temperaturaRows || []).forEach((row: any) => {
      const idCliente = Number(row.ID_CLIENTE || 0);
      if (!Number.isFinite(idCliente) || idCliente <= 0) return;
      temperaturaMap.set(idCliente, {
        score: Number(row.SCORE_TOTAL || 0),
        temperatura: String(row.TEMPERATURA || 'Frio'),
      });
    });

    return baseRows.map((item) => {
      const info = temperaturaMap.get(item.ID_CLIENTE);
      if (!info) return item;
      return {
        ...item,
        SCORE_TOTAL: info.score,
        TEMPERATURA: info.temperatura,
      };
    });
  }

  async function carregar() {
    setLoading(true);
    try {
      const [rows, temperaturaRows] = await Promise.all([
        callSF(SF.prospeccaoSemanalCarteira, {}),
        callSF(SF.temperaturaClientesCarteira, {}),
      ]);
      const parsed = parseLinhas(rows);
      setLinhas(aplicarTemperatura(parsed, temperaturaRows));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function carregarInicial() {
      setLoading(true);
      try {
        const [rows, temperaturaRows] = await Promise.all([
          callSF(SF.prospeccaoSemanalCarteira, {}),
          callSF(SF.temperaturaClientesCarteira, {}),
        ]);
        if (!mounted) return;

        const parsed = parseLinhas(rows);
        setLinhas(aplicarTemperatura(parsed, temperaturaRows));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    carregarInicial();
    return () => {
      mounted = false;
    };
  }, []);

  const linhasFiltradas = useMemo(() => {
    return linhas.filter((item) => isTrendMatch(item.TENDENCIA, filtroTendencia));
  }, [filtroTendencia, linhas]);

  const totalAlta = useMemo(() => {
    return linhas.filter((item) => normalizeTrend(item.TENDENCIA) === 'ALTA').length;
  }, [linhas]);

  const filtros: FiltroTendencia[] = ['Todos', 'Alta', 'Media', 'Baixa', 'Cliente inativo'];

  async function handleAtualizar() {
    if (syncing) return;

    setSyncing(true);
    setLoading(true);
    try {
      const syncRes = await callSFWithMeta(SF.acompanhamentoSemanalSincronizarManual, {});
      const syncRow = syncRes.rows[0] || null;
      const syncStatus = String(syncRow?.STATUS || '').toUpperCase();
      const syncMensagem = String(syncRow?.MENSAGEM || '');

      if (syncStatus === 'SUCCESS') {
        setSyncFeedback({ ok: true, text: 'Sincronização concluída com sucesso.' });
      } else if (syncStatus === 'FAILED') {
        setSyncFeedback({ ok: false, text: syncMensagem || 'Falha ao sincronizar os dados.' });
      } else if (syncRes.error) {
        setSyncFeedback({ ok: false, text: syncRes.error });
      } else {
        setSyncFeedback({ ok: true, text: 'Atualização executada.' });
      }

      await carregar();
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }

  return (
    <div className="animate-fadeIn">
      <div className="rounded-2xl p-5 mb-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="rounded-xl p-2" style={{ backgroundColor: '#e6f4ea', color: '#1f7d3f' }}>
              <TrendingUp size={22} />
            </div>
            <div>
              <h1 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>Prospecção desta semana</h1>
              <p className="text-lg mt-1" style={{ color: '#556056' }}>
                Semana {getSemanaMesAtual()} de {getMesAtualLabel()} — {totalAlta} clientes com alta tendência de recompra
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAtualizar}
            disabled={syncing}
            className="h-10 px-4 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
            style={{ backgroundColor: '#137432', color: '#ffffff' }}
          >
            {syncing ? 'Sincronizando...' : 'Atualizar'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {filtros.map((filtro) => {
            const ativo = filtroTendencia === filtro;
            return (
              <button
                key={filtro}
                type="button"
                onClick={() => setFiltroTendencia(filtro)}
                className="h-9 px-4 rounded-xl text-sm font-semibold transition-all"
                style={{
                  backgroundColor: ativo ? '#dfeadf' : '#ffffff',
                  color: ativo ? '#1f6f39' : '#4e5a4e',
                  border: ativo ? '1px solid #c6d9c7' : '1px solid #d9e1d5',
                }}
              >
                {filtro}
              </button>
            );
          })}
        </div>

        {syncFeedback ? (
          <p className="text-xs mt-3" style={{ color: syncFeedback.ok ? '#1f7d3f' : '#b42318' }}>
            {syncFeedback.text}
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        {loading ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px]">
              <thead>
                <tr className="text-left text-xs" style={{ color: '#788378' }}>
                  <th className="px-3 py-3">Tendência</th>
                  <th className="px-3 py-3">Cliente</th>
                  <th className="px-3 py-3">Curva</th>
                  <th className="px-3 py-3">Segmento</th>
                  <th className="px-3 py-3">Última compra</th>
                  <th className="px-3 py-3">Dias sem comprar</th>
                  <th className="px-3 py-3">Ciclo médio</th>
                  <th className="px-3 py-3">Temperatura</th>
                  <th className="px-3 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={`skeleton-${idx}`} style={{ borderTop: '1px solid #e6ebe1' }}>
                    {Array.from({ length: 9 }).map((__, colIdx) => (
                      <td key={`skeleton-${idx}-${colIdx}`} className="px-3 py-3">
                        <div className="h-5 rounded-lg animate-pulse" style={{ backgroundColor: '#e8ede6', width: colIdx === 1 ? '95%' : '75%' }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : linhasFiltradas.length === 0 ? (
          <div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#ffffff', color: '#6e786d' }}>
            Nenhum cliente da sua carteira com histórico de compras encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px]">
              <thead>
                <tr className="text-left text-xs" style={{ color: '#788378' }}>
                  <th className="px-3 py-3">Tendência</th>
                  <th className="px-3 py-3">Cliente</th>
                  <th className="px-3 py-3">Curva</th>
                  <th className="px-3 py-3">Segmento</th>
                  <th className="px-3 py-3">Última compra</th>
                  <th className="px-3 py-3">Dias sem comprar</th>
                  <th className="px-3 py-3">Ciclo médio</th>
                  <th className="px-3 py-3">Temperatura</th>
                  <th className="px-3 py-3">Ações</th>
                </tr>
              </thead>

              <tbody>
                {linhasFiltradas.map((linha) => {
                  const badgeStyle = tendenciaStyle(linha.TENDENCIA);
                  const atrasado = linha.CICLO_MEDIO_DIAS > 0 && linha.DIAS_SEM_COMPRAR > linha.CICLO_MEDIO_DIAS;

                  return (
                    <tr key={`prospeccao-${linha.ID_CLIENTE}`} style={{ borderTop: '1px solid #e6ebe1' }}>
                      <td className="px-3 py-3 align-middle">
                        <span
                          className="inline-flex rounded-full px-3 py-1 text-xs font-bold"
                          style={{ backgroundColor: badgeStyle.bg, color: badgeStyle.color }}
                        >
                          {linha.TENDENCIA}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm font-semibold" style={{ color: '#2f3a2f' }}>{linha.NOME_CLIENTE}</td>
                      <td className="px-3 py-3 text-sm" style={{ color: '#4b564b' }}>{linha.CURVA}</td>
                      <td className="px-3 py-3 text-sm" style={{ color: '#4b564b' }}>{linha.SEGMENTO}</td>
                      <td className="px-3 py-3 text-sm" style={{ color: '#4b564b' }}>{formatDate(linha.ULTIMA_COMPRA)}</td>
                      <td className="px-3 py-3 text-sm font-semibold" style={{ color: atrasado ? '#b42318' : '#4b564b' }}>
                        {linha.DIAS_SEM_COMPRAR}
                      </td>
                      <td className="px-3 py-3 text-sm" style={{ color: '#4b564b' }}>{linha.CICLO_MEDIO_DIAS} dias</td>
                      <td className="px-3 py-3 align-middle">
                        <span
                          className="inline-flex rounded-full px-3 py-1 text-xs font-bold"
                          style={temperaturaStyle(linha.TEMPERATURA)}
                        >
                          {linha.TEMPERATURA || 'Frio'} ({Math.round(Number(linha.SCORE_TOTAL || 0))})
                        </span>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <button
                          type="button"
                          onClick={() => navigate(`/agenda?clienteId=${linha.ID_CLIENTE}`)}
                          className="h-9 px-3 rounded-xl text-sm font-semibold transition-all"
                          style={{ backgroundColor: '#137432', color: '#ffffff' }}
                        >
                          Agendar visita
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
