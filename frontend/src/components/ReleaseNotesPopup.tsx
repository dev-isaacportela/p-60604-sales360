import { useEffect, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { callSF, callSFMutation, formatServerDateTimeBrasilia, SF } from '../hooks/useMitra';
import { htmlDaNota } from '../lib/notaVersaoHtml';

export interface NotaDeVersao {
  ID: number;
  VERSAO?: string | null;
  TIPO?: string;
  TITULO: string;
  CONTEUDO: string;
  DATA_PUBLICACAO?: string | null;
}

export const TIPOS_NOTA: Record<string, { rotulo: string; bg: string; fg: string }> = {
  NOVIDADE: { rotulo: 'Novidade', bg: 'var(--color-primary-bg)', fg: 'var(--color-primary)' },
  MELHORIA: { rotulo: 'Melhoria', bg: 'var(--kpi-bg-blue)', fg: 'var(--color-text)' },
  CORRECAO: { rotulo: 'Correção', bg: 'var(--kpi-bg-amber)', fg: 'var(--color-pendente)' },
};

export function tipoNota(tipo?: string) {
  return TIPOS_NOTA[String(tipo || '').toUpperCase()] || TIPOS_NOTA.NOVIDADE;
}

export function ConteudoNota({ texto }: { texto: string }) {
  return <div className="nota-versao-conteudo" dangerouslySetInnerHTML={{ __html: htmlDaNota(texto) }} />;
}

export function ListaNotas({ notas }: { notas: NotaDeVersao[] }) {
  return (
    <div className="space-y-5">
      {notas.map((nota) => {
        const tipo = tipoNota(nota.TIPO);
        return (
          <article key={nota.ID} className="rounded-2xl border px-5 py-5 sm:px-6" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-lowest)' }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: tipo.bg, color: tipo.fg }}>{tipo.rotulo}</span>
              {nota.VERSAO ? <span className="rounded-full border px-3 py-0.5 text-xs font-bold" style={{ borderColor: 'var(--color-surface-highest)', color: 'var(--color-text-secondary)' }}>{nota.VERSAO}</span> : null}
              {nota.DATA_PUBLICACAO ? <span className="ml-auto text-xs" style={{ color: 'var(--color-text-secondary)' }}>{formatServerDateTimeBrasilia(nota.DATA_PUBLICACAO)}</span> : null}
            </div>
            <h3 className="mt-3 font-display text-xl font-extrabold leading-snug sm:text-2xl" style={{ color: 'var(--color-text)' }}>{nota.TITULO}</h3>
            <div className="mt-3"><ConteudoNota texto={nota.CONTEUDO} /></div>
          </article>
        );
      })}
    </div>
  );
}

interface JanelaNotasProps {
  notas: NotaDeVersao[];
  onFechar: () => void;
  rotuloBotao?: string;
}

/** O popup "O que há de novo" — usado no login do usuário e na pré-visualização do cadastro. */
export function JanelaNotas({ notas, onFechar, rotuloBotao = 'Entendi' }: JanelaNotasProps) {
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar();
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  return (
    <div className="animate-fadeIn fixed inset-0 z-[60] flex items-end justify-center p-3 sm:items-center sm:p-4" style={{ backgroundColor: 'var(--shell-overlay)' }} onClick={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="notas-versao-titulo" className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] shadow-xl" style={{ backgroundColor: 'var(--color-surface-lowest)' }}>
        <div className="flex items-start gap-3 border-b px-6 py-5" style={{ borderColor: 'var(--color-border)' }}>
          <span className="rounded-2xl p-2.5" style={{ backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)' }}><Sparkles size={22} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="notas-versao-titulo" className="font-display text-2xl font-extrabold" style={{ color: 'var(--color-text)' }}>O que há de novo</h2>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {notas.length === 1 ? 'Uma atualização chegou ao sistema.' : `${notas.length} atualizações chegaram ao sistema.`}
            </p>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="rounded-lg p-1" style={{ color: 'var(--color-text-secondary)' }}><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6" style={{ backgroundColor: 'var(--color-surface-low)' }}>
          <ListaNotas notas={notas} />
        </div>
        <div className="flex justify-end border-t px-6 py-4" style={{ borderColor: 'var(--color-border)' }}>
          <button onClick={onFechar} className="rounded-xl px-5 py-2.5 text-sm font-bold" style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>{rotuloBotao}</button>
        </div>
      </div>
    </div>
  );
}

/** Mostra uma vez, ao entrar no sistema, as notas publicadas que o usuário ainda não viu. */
export default function ReleaseNotesPopup() {
  const [notas, setNotas] = useState<NotaDeVersao[]>([]);
  const carregou = useRef(false);

  useEffect(() => {
    if (carregou.current) return;
    carregou.current = true;
    callSF(SF.releaseNotesPendentes).then((rows) => setNotas(rows as NotaDeVersao[]));
  }, []);

  if (notas.length === 0) return null;

  function fechar() {
    const ids = notas.map((n) => n.ID).join(',');
    setNotas([]);
    void callSFMutation(SF.releaseNotesMarcarLidas, { ids });
  }

  return <JanelaNotas notas={notas} onFechar={fechar} />;
}
