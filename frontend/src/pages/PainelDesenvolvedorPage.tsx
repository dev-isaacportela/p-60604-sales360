import { useEffect, useMemo, useState } from 'react';
import { Bug, Clock, ShieldAlert, UserRound, Wrench } from 'lucide-react';
import { callSF, callSFSingle, formatServerDateTimeBrasilia, SF } from '../hooks/useMitra';
import SistemaFotosCard from '../components/SistemaFotosCard';

interface BugReport {
  ID: number;
  PROTOCOLO: string;
  USER_ID?: number;
  USER_EMAIL?: string;
  USER_NOME?: string;
  USER_STATUS?: string;
  TITULO: string;
  CATEGORIA?: string;
  PRIORIDADE?: string;
  TELA_AFETADA?: string;
  DESCRICAO?: string;
  PASSOS_REPRODUCAO?: string;
  RESULTADO_ESPERADO?: string;
  RESULTADO_OBTIDO?: string;
  IMPACTO?: string;
  ANEXO_URL?: string;
  ANEXO_NOME?: string;
  EMAIL_STATUS?: string;
  EMAIL_ERRO?: string;
  CONTEXTO_JSON?: string;
  STATUS?: string;
  CRIADO_EM?: string;
}

function parseContext(value?: string): Record<string, any> {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function prioridadeColor(value?: string) {
  if (value === 'CRITICA') return { bg: '#fee2e2', fg: '#991b1b' };
  if (value === 'ALTA') return { bg: '#ffedd5', fg: '#9a3412' };
  if (value === 'MEDIA') return { bg: '#fef9c3', fg: '#854d0e' };
  return { bg: '#e6f7df', fg: '#137432' };
}

export default function PainelDesenvolvedorPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [bugs, setBugs] = useState<BugReport[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const permissao = await callSFSingle(SF.suportePainelPermissao);
        const canAccess = Number(permissao?.PODE_ACESSAR || 0) === 1;
        setAllowed(canAccess);
        if (canAccess) {
          const rows = await callSF(SF.suporteListarBugs);
          setBugs(rows as BugReport[]);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const stats = useMemo(() => {
    const criticos = bugs.filter((item) => item.PRIORIDADE === 'CRITICA').length;
    const abertos = bugs.filter((item) => (item.STATUS || 'ABERTO') === 'ABERTO').length;
    const usuarios = new Set(bugs.map((item) => item.USER_EMAIL).filter(Boolean)).size;
    return { total: bugs.length, criticos, abertos, usuarios };
  }, [bugs]);

  if (loading) {
    return <div className="rounded-[28px] border p-6" style={{ backgroundColor: '#ffffff', borderColor: '#dde2d8' }}>Carregando painel de desenvolvedor...</div>;
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-2xl rounded-[28px] border p-8 text-center" style={{ backgroundColor: '#ffffff', borderColor: '#dde2d8' }}>
        <ShieldAlert className="mx-auto" size={42} style={{ color: '#b42318' }} />
        <h1 className="mt-4 font-display text-3xl font-extrabold" style={{ color: '#2f372d' }}>Acesso restrito</h1>
        <p className="mt-2" style={{ color: '#647062' }}>Este painel é exclusivo para a equipe técnica autorizada.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-[28px] border p-6 shadow-sm" style={{ backgroundColor: '#fafbf8', borderColor: '#dde2d8' }}>
        <p className="text-sm font-bold uppercase tracking-[0.16em]" style={{ color: '#8c9489' }}>Painel de desenvolvedor</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold" style={{ color: '#137432' }}>Bugs reportados</h1>
        <p className="mt-2 max-w-3xl" style={{ color: '#5f685c' }}>Acompanhe os chamados enviados pelo formulário de suporte, com dados do solicitante e contexto técnico capturado.</p>
      </section>

      <SistemaFotosCard />

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Total', value: stats.total, icon: <Bug size={20} />, color: '#137432' },
          { label: 'Abertos', value: stats.abertos, icon: <Wrench size={20} />, color: '#2563eb' },
          { label: 'Críticos', value: stats.criticos, icon: <ShieldAlert size={20} />, color: '#b42318' },
          { label: 'Usuários', value: stats.usuarios, icon: <UserRound size={20} />, color: '#7c3aed' },
        ].map((item) => (
          <div key={item.label} className="rounded-[24px] border p-5 shadow-sm" style={{ backgroundColor: '#ffffff', borderColor: '#dde2d8' }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold" style={{ color: '#647062' }}>{item.label}</span>
              <span className="rounded-full p-2" style={{ backgroundColor: '#f1f2ef', color: item.color }}>{item.icon}</span>
            </div>
            <div className="mt-3 text-3xl font-extrabold" style={{ color: '#2f372d' }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {bugs.length === 0 ? (
          <div className="rounded-[28px] border p-8 text-center" style={{ backgroundColor: '#ffffff', borderColor: '#dde2d8', color: '#647062' }}>Nenhum bug reportado até agora.</div>
        ) : bugs.map((bug) => {
          const context = parseContext(bug.CONTEXTO_JSON);
          const cor = prioridadeColor(bug.PRIORIDADE);
          return (
            <article key={bug.ID} className="rounded-[28px] border p-5 shadow-sm" style={{ backgroundColor: '#ffffff', borderColor: '#dde2d8' }}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: '#eef1eb', color: '#4e574c' }}>{bug.PROTOCOLO}</span>
                    <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: cor.bg, color: cor.fg }}>{bug.PRIORIDADE || 'BAIXA'}</span>
                    <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: '#e8eef7', color: '#1d4ed8' }}>{bug.STATUS || 'ABERTO'}</span>
                    <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: bug.EMAIL_STATUS === 'ERRO' ? '#fee2e2' : '#e6f7df', color: bug.EMAIL_STATUS === 'ERRO' ? '#991b1b' : '#137432' }}>E-mail: {bug.EMAIL_STATUS || 'PENDENTE'}</span>
                  </div>
                  <h2 className="mt-3 text-2xl font-extrabold" style={{ color: '#2f372d' }}>{bug.TITULO}</h2>
                  <p className="mt-1 text-sm" style={{ color: '#647062' }}>{bug.CATEGORIA || 'Sem categoria'} · {bug.TELA_AFETADA || context.rota || 'Tela não informada'}</p>
                </div>
                <div className="flex items-center gap-2 text-sm" style={{ color: '#647062' }}>
                  <Clock size={16} />
                  {formatServerDateTimeBrasilia(bug.CRIADO_EM)}
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="rounded-2xl p-4" style={{ backgroundColor: '#f4f5f3' }}>
                  <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: '#8c9489' }}>Solicitante</p>
                  <p className="mt-2 font-bold" style={{ color: '#2f372d' }}>{bug.USER_NOME || 'Não informado'}</p>
                  <p className="break-all text-sm" style={{ color: '#647062' }}>{bug.USER_EMAIL || 'Sem e-mail'}</p>
                  <p className="mt-2 text-sm" style={{ color: '#647062' }}>ID: {bug.USER_ID || '-'}</p>
                  <p className="text-sm" style={{ color: '#647062' }}>Status: {bug.USER_STATUS || '-'}</p>
                </aside>

                <div className="grid gap-4">
                  <section><h3 className="font-bold" style={{ color: '#2f372d' }}>Descrição</h3><p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: '#4e574c' }}>{bug.DESCRICAO || '-'}</p></section>
                  <section><h3 className="font-bold" style={{ color: '#2f372d' }}>Passos para reproduzir</h3><p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: '#4e574c' }}>{bug.PASSOS_REPRODUCAO || '-'}</p></section>
                  <div className="grid gap-4 md:grid-cols-2">
                    <section><h3 className="font-bold" style={{ color: '#2f372d' }}>Esperado</h3><p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: '#4e574c' }}>{bug.RESULTADO_ESPERADO || '-'}</p></section>
                    <section><h3 className="font-bold" style={{ color: '#2f372d' }}>Obtido</h3><p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: '#4e574c' }}>{bug.RESULTADO_OBTIDO || '-'}</p></section>
                  </div>
                  {bug.ANEXO_URL ? (
                    <section>
                      <h3 className="font-bold" style={{ color: '#2f372d' }}>Anexo</h3>
                      <a className="mt-1 inline-flex text-sm font-bold underline" href={bug.ANEXO_URL} target="_blank" rel="noopener noreferrer" style={{ color: '#137432' }}>{bug.ANEXO_NOME || 'Abrir print'}</a>
                    </section>
                  ) : null}
                  {bug.EMAIL_ERRO ? (
                    <section className="rounded-2xl p-3" style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}>
                      <h3 className="font-bold">Erro no e-mail</h3>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{bug.EMAIL_ERRO}</p>
                    </section>
                  ) : null}
                  <section><h3 className="font-bold" style={{ color: '#2f372d' }}>Contexto técnico</h3><p className="mt-1 break-all text-sm" style={{ color: '#647062' }}>{context.url || '-'} · {context.userAgent || '-'}</p></section>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
