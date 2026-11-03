import { type MouseEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarDays, Clock3, Lightbulb, Package, ShoppingCart, Target, TrendingUp } from 'lucide-react';
import { callSFMutation, callSFSingle, SF } from '../hooks/useMitra';

interface DicaProData {
  tipo: string;
  titulo: string;
  descricao: string;
  icone: string;
  actionRoute: string;
  idVendedor: string;
  codFilial: string;
  idSecao: string;
}

interface DicaProCardProps {
  className?: string;
}

function normalizeDica(row: any): DicaProData | null {
  if (!row) return null;
  return {
    tipo: String(row.tipo || row.TIPO_DICA || 'PADRAO_CONTATO'),
    titulo: String(row.titulo || row.TITULO || 'Dica Pro'),
    descricao: String(row.descricao || row.DESCRICAO || 'Revise sua carteira e priorize os clientes com maior chance de conversão.'),
    icone: String(row.icone || row.ICONE || 'lightbulb'),
    actionRoute: String(row.actionRoute || row.ACTION_ROUTE || '/clientes'),
    idVendedor: String(row.ID_VENDEDOR || ''),
    codFilial: String(row.CODFILIAL || ''),
    idSecao: String(row.ID_SECAO || ''),
  };
}

function getIconConfig(icon: string) {
  const key = String(icon || '').toLowerCase();
  if (key === 'clock') return { Icon: Clock3, bg: '#e6f4ea', color: '#137432' };
  if (key === 'alert') return { Icon: AlertTriangle, bg: '#fde8e8', color: '#b42318' };
  if (key === 'trending') return { Icon: TrendingUp, bg: '#eef3ff', color: '#285cc4' };
  if (key === 'target') return { Icon: Target, bg: '#fff4dc', color: '#a26a00' };
  if (key === 'calendar') return { Icon: CalendarDays, bg: '#f2eaff', color: '#7d3eb4' };
  if (key === 'package') return { Icon: Package, bg: '#eaf2e8', color: '#2d6f43' };
  return { Icon: Lightbulb, bg: '#e9f3e6', color: '#2d8c39' };
}

export default function DicaProCard({ className = '' }: DicaProCardProps) {
  const navigate = useNavigate();
  const [dica, setDica] = useState<DicaProData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const carregarDica = useCallback(async () => {
    setLoading(true);
    const row = await callSFSingle(SF.dicaProObter, {});
    setDica(normalizeDica(row));
    setLoading(false);
  }, []);

  useEffect(() => {
    carregarDica();
  }, [carregarDica]);

  async function marcarVisualizada() {
    if (!dica || refreshing) return;
    setRefreshing(true);
    await callSFMutation(SF.dicaProMarcarVisualizada, {
      tipoDica: dica.tipo,
      idVendedor: dica.idVendedor,
      codFilial: dica.codFilial,
      idSecao: dica.idSecao,
    });
    const row = await callSFSingle(SF.dicaProObter, {});
    setDica(normalizeDica(row));
    setRefreshing(false);
  }

  function abrirAcao(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!dica?.actionRoute) return;
    navigate(dica.actionRoute);
  }

  const iconConfig = getIconConfig(dica?.icone || 'lightbulb');
  const Icon = iconConfig.Icon;

  if (loading) {
    return (
      <div className={`rounded-3xl p-6 relative animate-pulse ${className}`} style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <div className="w-10 h-10 rounded-full mb-4" style={{ backgroundColor: '#e3e8de' }} />
        <div className="h-8 w-32 rounded-xl" style={{ backgroundColor: '#e3e8de' }} />
        <div className="h-4 w-full rounded-lg mt-4" style={{ backgroundColor: '#e3e8de' }} />
        <div className="h-4 w-4/5 rounded-lg mt-2" style={{ backgroundColor: '#e3e8de' }} />
        <div className="absolute right-4 top-4 w-12 h-12 rounded-full" style={{ backgroundColor: '#d9e1d5' }} />
      </div>
    );
  }

  return (
    <section
      role="button"
      tabIndex={0}
      onClick={marcarVisualizada}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          marcarVisualizada();
        }
      }}
      className={`rounded-3xl p-6 relative transition-all duration-200 ${className}`}
      style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de', opacity: refreshing ? 0.72 : 1, cursor: 'pointer' }}
      title="Clique para marcar como visualizada e carregar outra dica"
    >
      <div className="w-10 h-10 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: iconConfig.bg }}>
        <Icon size={20} style={{ color: iconConfig.color }} />
      </div>
      <h4 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>{dica?.titulo || 'Dica Pro'}</h4>
      <p className="text-base mt-2 pr-12" style={{ color: '#59635b' }}>
        {dica?.descricao || 'Revise sua carteira e priorize os clientes com maior chance de conversão.'}
      </p>
      <button
        type="button"
        onClick={abrirAcao}
        className="absolute right-4 top-4 w-12 h-12 rounded-full flex items-center justify-center"
        style={{ backgroundColor: '#17743b', color: '#fff' }}
        title="Abrir área relacionada"
      >
        <ShoppingCart size={18} />
      </button>
    </section>
  );
}
