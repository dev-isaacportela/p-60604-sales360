import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { callSFSingle, SF } from '../hooks/useMitra';
import AgendaPage from './AgendaPage';

interface PermissaoCoordenador {
  PODE_ACESSAR?: number;
  NOME?: string;
  EMAIL?: string;
  COD_SUPERVISOR?: number;
}

export default function AgendaCoordenadorPage() {
  const [permissao, setPermissao] = useState<PermissaoCoordenador | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function carregarPermissao() {
      try {
        const row = await callSFSingle(SF.painelCoordenadorPermissao);
        if (active) setPermissao(row as PermissaoCoordenador | null);
      } finally {
        if (active) setLoading(false);
      }
    }

    carregarPermissao();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div className="p-6" style={{ color: '#647062' }}>Carregando agenda dos vendedores...</div>;
  }

  if (Number(permissao?.PODE_ACESSAR || 0) !== 1) {
    return (
      <div className="animate-fadeIn rounded-3xl p-8" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: '#eaf3e6', color: '#137432' }}>
          <CalendarDays size={24} />
        </div>
        <h1 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>Agenda dos Vendedores</h1>
        <p className="mt-3 text-base" style={{ color: '#636d63' }}>
          Esta tela está disponível apenas para coordenadores com vínculo ativo.
        </p>
      </div>
    );
  }

  return <AgendaPage coordinatorReadOnly />;
}
