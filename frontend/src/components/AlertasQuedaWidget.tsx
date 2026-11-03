import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Settings2, X } from 'lucide-react';
import { callSF, callSFMutation, callSFSingle, formatCurrency, SF } from '../hooks/useMitra';

interface AlertaQuedaRow {
  ID_CLIENTE: number;
  NOME_CLIENTE: string;
  CURVA: string;
  VALOR_ATUAL: number;
  VALOR_ANTERIOR: number;
  PERCENTUAL_QUEDA: number;
  ULTIMA_COMPRA: string;
}

interface AlertaConfigRow {
  PERCENTUAL_ALERTA: number;
  PERIODO_COMPARACAO: 'semana' | 'mes' | string;
  ATIVO: boolean | number | string;
}

interface AlertasQuedaWidgetProps {
  className?: string;
}

function isAtivo(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return String(value || '').toLowerCase() !== 'false' && String(value || '') !== '0';
}

export default function AlertasQuedaWidget({ className = '' }: AlertasQuedaWidgetProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openConfig, setOpenConfig] = useState(false);
  const [alertas, setAlertas] = useState<AlertaQuedaRow[]>([]);
  const [percentual, setPercentual] = useState(30);
  const [periodo, setPeriodo] = useState<'semana' | 'mes'>('mes');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [configRow, alertasRows] = await Promise.all([
        callSFSingle(SF.alertaObterConfig, {}),
        callSF(SF.alertasQuedaVolume, {}),
      ]);

      const cfg = (configRow || {}) as AlertaConfigRow;
      if (cfg.PERCENTUAL_ALERTA) setPercentual(Number(cfg.PERCENTUAL_ALERTA));
      if (String(cfg.PERIODO_COMPARACAO).toLowerCase() === 'semana') {
        setPeriodo('semana');
      } else {
        setPeriodo('mes');
      }

      if (isAtivo(cfg.ATIVO)) {
        setAlertas((alertasRows || []) as AlertaQuedaRow[]);
      } else {
        setAlertas([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const countLabel = useMemo(() => {
    if (loading) return '...';
    return String(alertas.length).padStart(2, '0');
  }, [alertas.length, loading]);

  async function salvarConfig() {
    if (saving) return;
    setSaving(true);
    try {
      const ok = await callSFMutation(SF.alertaConfigurar, {
        PERCENTUAL_ALERTA: String(percentual),
        PERIODO_COMPARACAO: periodo,
        ATIVO: '1',
      });

      if (!ok) return;

      setOpenConfig(false);
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className={`rounded-[30px] p-6 ${className}`} style={{ backgroundColor: '#f9faf8' }}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: '#fde8e8', color: '#b42318' }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className="text-xs font-semibold" style={{ color: '#7b8379' }}>Alerta de queda de volume</p>
              <p className="text-lg font-bold" style={{ color: '#1b1c1a' }}>Clientes com queda acima do limite</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: '#fde8e8', color: '#b42318' }}>
              {countLabel} alertas
            </span>
            <button
              type="button"
              onClick={() => setOpenConfig(true)}
              className="w-9 h-9 rounded-xl inline-flex items-center justify-center"
              style={{ backgroundColor: '#eef2eb', color: '#5f6a5d' }}
              title="Configurar alerta"
            >
              <Settings2 size={16} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl p-4 text-sm" style={{ backgroundColor: '#ffffff', color: '#6f786d' }}>
            Carregando alertas de queda...
          </div>
        ) : alertas.length === 0 ? (
          <div className="rounded-2xl p-4 text-sm" style={{ backgroundColor: '#ffffff', color: '#6f786d' }}>
            Nenhum cliente da sua carteira está com queda acima de {percentual}% no período {periodo === 'semana' ? 'semanal' : 'mensal'}.
          </div>
        ) : (
          <div className="space-y-2">
            {alertas.slice(0, 6).map((item) => (
              <div key={`queda-${item.ID_CLIENTE}`} className="rounded-2xl p-3" style={{ backgroundColor: '#ffffff' }}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#1b1c1a' }}>{item.NOME_CLIENTE}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#6f786d' }}>
                      Curva {item.CURVA} • Última compra: {item.ULTIMA_COMPRA || '—'}
                    </p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: '#fde8e8', color: '#b42318' }}>
                    -{Number(item.PERCENTUAL_QUEDA || 0).toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs mt-2" style={{ color: '#5f6a5d' }}>
                  Atual: {formatCurrency(Number(item.VALOR_ATUAL || 0))} • Anterior: {formatCurrency(Number(item.VALOR_ANTERIOR || 0))}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {openConfig ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.32)' }}>
          <div className="w-full max-w-md rounded-2xl p-5" style={{ backgroundColor: '#ffffff', border: '1px solid #e3e9de' }}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-xl font-bold" style={{ color: '#1b1c1a' }}>Configurar alerta</h3>
                <p className="text-sm mt-1" style={{ color: '#697368' }}>Defina o percentual mínimo de queda e o período de comparação.</p>
              </div>
              <button type="button" onClick={() => setOpenConfig(false)} style={{ color: '#6a7368' }}>
                <X size={18} />
              </button>
            </div>

            <div className="mb-4">
              <label className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                Percentual de alerta: {percentual}%
              </label>
              <input
                type="range"
                min={5}
                max={95}
                step={1}
                value={percentual}
                onChange={(event) => setPercentual(Number(event.target.value))}
                className="w-full mt-2"
              />
            </div>

            <div>
              <p className="text-sm font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>Período de comparação</p>
              <div className="inline-flex items-center rounded-lg p-1" style={{ backgroundColor: '#edf1ea', border: '1px solid #dbe4d6' }}>
                <button
                  type="button"
                  onClick={() => setPeriodo('semana')}
                  className="h-8 px-3 rounded-md text-sm font-semibold"
                  style={{ backgroundColor: periodo === 'semana' ? '#17743b' : 'transparent', color: periodo === 'semana' ? '#ffffff' : '#5f6a5d' }}
                >
                  Semana
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodo('mes')}
                  className="h-8 px-3 rounded-md text-sm font-semibold"
                  style={{ backgroundColor: periodo === 'mes' ? '#17743b' : 'transparent', color: periodo === 'mes' ? '#ffffff' : '#5f6a5d' }}
                >
                  Mês
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setOpenConfig(false)}
                className="h-10 px-4 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: '#f1f5ef', color: '#465246' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarConfig}
                disabled={saving}
                className="h-10 px-4 rounded-xl text-sm font-semibold disabled:opacity-60"
                style={{ backgroundColor: '#137432', color: '#ffffff' }}
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
