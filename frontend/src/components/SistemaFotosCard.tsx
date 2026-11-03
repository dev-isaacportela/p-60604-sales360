import { useEffect, useState } from 'react';
import { Image as ImageIcon, KeyRound, PlugZap, RefreshCw } from 'lucide-react';
import { callSFMutation, callSFSingle, formatServerDateTimeBrasilia, SF } from '../hooks/useMitra';

interface StatusFotos {
  TEM_CHAVE: number;
  ULTIMA_ATUALIZACAO?: string | null;
  ULTIMO_ERRO?: string | null;
  CONSULTADOS: number;
  COM_FOTO: number;
}

/**
 * Painel Dev: a conexão com o sistema de fotos (Busca 360) usada pelas fotos do Mix Builder.
 * A chave é só de escrita — depois de gravada, nunca volta para a tela.
 */
export default function SistemaFotosCard() {
  const [status, setStatus] = useState<StatusFotos | null>(null);
  const [chave, setChave] = useState('');
  const [mensagem, setMensagem] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<'gravar' | 'testar' | 'atualizar' | null>(null);

  async function carregarStatus() {
    setStatus((await callSFSingle(SF.mixFotosConfigStatus)) as StatusFotos | null);
  }

  useEffect(() => {
    void carregarStatus();
  }, []);

  async function gravar() {
    const valor = chave.trim();
    if (valor.length < 10) {
      setMensagem({ ok: false, texto: 'Informe a chave completa do sistema de fotos.' });
      return;
    }
    setOcupado('gravar');
    try {
      const ok = await callSFMutation(SF.mixFotosChaveGravar, { chave: valor });
      setChave('');
      setMensagem(ok ? { ok: true, texto: 'Chave gravada. Use "Testar conexão" para conferir.' } : { ok: false, texto: 'Não foi possível gravar a chave.' });
      await carregarStatus();
    } finally {
      setOcupado(null);
    }
  }

  async function testar() {
    setOcupado('testar');
    try {
      const r = await callSFSingle(SF.mixFotosTestar);
      setMensagem({ ok: Boolean(r?.OK), texto: String(r?.MENSAGEM || 'O sistema de fotos não respondeu') });
    } finally {
      setOcupado(null);
    }
  }

  async function atualizar() {
    setOcupado('atualizar');
    try {
      const r = await callSFSingle(SF.mixFotosSincronizar);
      setMensagem(r?.OK
        ? { ok: true, texto: `Fotos atualizadas: ${Number(r.COM_FOTO || 0).toLocaleString('pt-BR')} de ${Number(r.TOTAL || 0).toLocaleString('pt-BR')} produtos têm foto.` }
        : { ok: false, texto: String(r?.MENSAGEM || 'Não foi possível atualizar as fotos agora.') });
      await carregarStatus();
    } finally {
      setOcupado(null);
    }
  }

  const temChave = Number(status?.TEM_CHAVE || 0) > 0;

  return (
    <section className="rounded-[28px] border p-6 shadow-sm" style={{ backgroundColor: '#ffffff', borderColor: '#dde2d8' }}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-full p-2" style={{ backgroundColor: '#f1f2ef', color: '#137432' }}><ImageIcon size={20} /></span>
          <div>
            <h2 className="font-display text-xl font-extrabold" style={{ color: '#2f372d' }}>Sistema de fotos</h2>
            <p className="mt-1 max-w-2xl text-sm" style={{ color: '#647062' }}>
              Fotos dos produtos no Mix Builder, lidas do Busca 360 pelo código do Winthor (o mesmo do Pricing Hub). Atualizam sozinhas uma vez por dia.
            </p>
            <p className="mt-2 text-xs font-semibold" style={{ color: '#647062' }}>
              {temChave ? 'Chave cadastrada' : 'Chave não cadastrada'}
              {status?.ULTIMA_ATUALIZACAO ? ` · última atualização ${formatServerDateTimeBrasilia(status.ULTIMA_ATUALIZACAO)}` : ''}
              {status ? ` · ${Number(status.COM_FOTO || 0).toLocaleString('pt-BR')} de ${Number(status.CONSULTADOS || 0).toLocaleString('pt-BR')} produtos com foto` : ''}
            </p>
            {status?.ULTIMO_ERRO ? <p className="mt-1 text-xs font-semibold" style={{ color: '#b42318' }}>Última tentativa: {status.ULTIMO_ERRO}</p> : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={testar}
            disabled={!temChave || Boolean(ocupado)}
            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ borderColor: '#dde2d8', color: '#2f372d' }}
          >
            <PlugZap size={16} /> {ocupado === 'testar' ? 'Testando...' : 'Testar conexão'}
          </button>
          <button
            type="button"
            onClick={atualizar}
            disabled={!temChave || Boolean(ocupado)}
            className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ borderColor: '#dde2d8', color: '#2f372d' }}
          >
            <RefreshCw size={16} className={ocupado === 'atualizar' ? 'animate-spin' : ''} /> {ocupado === 'atualizar' ? 'Atualizando...' : 'Atualizar fotos agora'}
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label className="flex flex-1 items-center gap-2 rounded-2xl border px-3" style={{ borderColor: '#dde2d8' }}>
          <KeyRound size={16} style={{ color: '#8c9489' }} />
          <input
            type="password"
            autoComplete="off"
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            placeholder={temChave ? 'Trocar a chave do sistema de fotos' : 'Chave do sistema de fotos'}
            className="w-full bg-transparent py-2.5 text-sm outline-none"
            style={{ color: '#2f372d' }}
          />
        </label>
        <button
          type="button"
          onClick={gravar}
          disabled={!chave.trim() || Boolean(ocupado)}
          className="rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: '#137432' }}
        >
          {ocupado === 'gravar' ? 'Gravando...' : 'Gravar chave'}
        </button>
      </div>

      {mensagem ? (
        <p className="mt-3 text-sm font-semibold" style={{ color: mensagem.ok ? '#137432' : '#b42318' }}>{mensagem.texto}</p>
      ) : null}
    </section>
  );
}
