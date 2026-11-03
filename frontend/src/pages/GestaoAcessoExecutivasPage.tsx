import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Search, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import Modal from '../components/ui/Modal';
import { callSFSingle, callSFWithMeta, callSFMutationComErro, formatServerDateTimeBrasilia, SF } from '../hooks/useMitra';

interface Permissao {
  PODE_ACESSAR: number;
  NIVEL: string;
}

interface ExecutivaRow {
  USER_ID: number;
  NOME: string;
  EMAIL: string;
  BLOQUEADO: number;
  MOTIVO: string | null;
  ATUALIZADO_EM: string | null;
  ATUALIZADO_POR_NOME: string | null;
  TOTAL: number;
}

type StatusFiltro = 'TODOS' | 'ATIVO' | 'BLOQUEADO';

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: StatusFiltro; label: string }[] = [
  { value: 'TODOS', label: 'Todas' },
  { value: 'ATIVO', label: 'Com acesso' },
  { value: 'BLOQUEADO', label: 'Desativadas' },
];

// Remove caracteres que quebrariam o template SQL da SF
function sanitizarTexto(valor: string) {
  return valor.replace(/['"\\{}`]/g, '').trim().slice(0, 500);
}

export default function GestaoAcessoExecutivasPage() {
  const [loadingPermissao, setLoadingPermissao] = useState(true);
  const [permissao, setPermissao] = useState<Permissao | null>(null);
  const [rows, setRows] = useState<ExecutivaRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [buscaInput, setBuscaInput] = useState('');
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<StatusFiltro>('TODOS');
  const [page, setPage] = useState(0);
  const [alvo, setAlvo] = useState<ExecutivaRow | null>(null);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  const podeAcessar = Number(permissao?.PODE_ACESSAR || 0) === 1;

  useEffect(() => {
    let active = true;
    callSFSingle(SF.gestaoAcessoExecutivasPermissao).then((res) => {
      if (!active) return;
      setPermissao(res);
      setLoadingPermissao(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { setBusca(sanitizarTexto(buscaInput)); setPage(0); }, 350);
    return () => window.clearTimeout(timer);
  }, [buscaInput]);

  async function carregar() {
    setLoading(true);
    setErro('');
    const { rows: data, error } = await callSFWithMeta(SF.gestaoAcessoExecutivasListar, {
      busca,
      status,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });
    if (error) setErro('Não foi possível carregar as executivas.');
    setRows(data as ExecutivaRow[]);
    setTotal(data.length > 0 ? Number(data[0].TOTAL) || 0 : 0);
    setLoading(false);
  }

  useEffect(() => {
    if (!podeAcessar) return;
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeAcessar, busca, status, page]);

  function abrirAlteracao(row: ExecutivaRow) {
    setAlvo(row);
    setMotivo('');
    setStatusMsg('');
  }

  async function confirmarAlteracao() {
    if (!alvo) return;
    const bloquear = Number(alvo.BLOQUEADO) === 1 ? 0 : 1;
    setSalvando(true);
    const res = await callSFMutationComErro(SF.gestaoAcessoExecutivasAlterar, {
      userId: alvo.USER_ID,
      bloquear,
      motivo: bloquear === 1 ? sanitizarTexto(motivo) : '',
    });
    setSalvando(false);
    if (!res.ok) {
      setErro('Não foi possível alterar o acesso. Verifique se você tem permissão sobre esta executiva.');
      setAlvo(null);
      return;
    }
    setStatusMsg(bloquear === 1 ? `Acesso de ${alvo.NOME} desativado.` : `Acesso de ${alvo.NOME} reativado.`);
    setAlvo(null);
    carregar();
  }

  if (loadingPermissao) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '3px solid #d5dbd3', borderTopColor: '#137432' }} />
      </div>
    );
  }

  if (!podeAcessar) {
    return (
      <div className="rounded-3xl p-8 text-center" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e6de' }}>
        <ShieldCheck size={32} className="mx-auto mb-3" style={{ color: '#8c9489' }} />
        <p className="text-lg font-bold" style={{ color: '#1f2a1d' }}>Acesso restrito</p>
        <p className="text-sm mt-1" style={{ color: '#6b7369' }}>Esta tela é exclusiva para diretoria, coordenadores e desenvolvedores.</p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const desativando = alvo ? Number(alvo.BLOQUEADO) !== 1 : false;

  return (
    <div className="space-y-5 animate-fadeIn">
      <div>
        <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1f2a1d' }}>Executivas de Venda</h2>
        <p className="text-sm mt-1" style={{ color: '#6b7369' }}>
          Desative ou reative o acesso das executivas ao sistema.
          {permissao?.NIVEL === 'COORDENADOR' ? ' Você vê as executivas do seu departamento.' : ''}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 h-11 rounded-2xl px-4 flex-1" style={{ backgroundColor: '#ffffff', border: '1px solid #d7dfd3' }}>
          <Search size={16} style={{ color: '#8a9287' }} />
          <input value={buscaInput} onChange={(e) => setBuscaInput(e.target.value)} placeholder="Buscar por nome ou e-mail" className="w-full bg-transparent outline-none text-sm" style={{ color: '#2f3a2d' }} />
        </div>
        <div className="flex gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setStatus(opt.value); setPage(0); }}
              className="h-11 px-4 rounded-2xl text-sm font-semibold transition-all"
              style={{
                backgroundColor: status === opt.value ? '#dfeadf' : '#eef2eb',
                color: status === opt.value ? '#137432' : '#425242',
                border: '1px solid #d7dfd3',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {erro ? <div className="rounded-2xl px-4 py-3 text-sm" style={{ backgroundColor: '#fdecea', color: '#b42318' }}>{erro}</div> : null}
      {statusMsg ? <div className="rounded-2xl px-4 py-3 text-sm" style={{ backgroundColor: '#e7f4e8', color: '#137432' }}>{statusMsg}</div> : null}

      <div className="rounded-3xl overflow-hidden" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e6de' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: '#f4f6f2', color: '#6b7369' }}>
                <th className="text-left px-5 py-3 font-semibold">Executiva</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
                <th className="text-left px-5 py-3 font-semibold">Última alteração</th>
                <th className="text-right px-5 py-3 font-semibold">Ação</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="px-5 py-10 text-center" style={{ color: '#8c9489' }}><Loader2 size={20} className="inline animate-spin" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="px-5 py-10 text-center" style={{ color: '#8c9489' }}>Nenhuma executiva encontrada.</td></tr>
              ) : rows.map((row) => {
                const bloqueada = Number(row.BLOQUEADO) === 1;
                return (
                  <tr key={row.USER_ID} style={{ borderTop: '1px solid #eef1eb' }}>
                    <td className="px-5 py-3">
                      <div className="font-semibold" style={{ color: '#1f2a1d' }}>{row.NOME}</div>
                      <div className="text-xs" style={{ color: '#8c9489' }}>{row.EMAIL}</div>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold" style={{ backgroundColor: bloqueada ? '#fdecea' : '#e7f4e8', color: bloqueada ? '#b42318' : '#137432' }}>
                        {bloqueada ? 'Desativada' : 'Com acesso'}
                      </span>
                      {bloqueada && row.MOTIVO ? <div className="text-xs mt-1" style={{ color: '#6b7369' }}>{row.MOTIVO}</div> : null}
                    </td>
                    <td className="px-5 py-3 text-xs" style={{ color: '#6b7369' }}>
                      {row.ATUALIZADO_EM ? `${formatServerDateTimeBrasilia(row.ATUALIZADO_EM)}${row.ATUALIZADO_POR_NOME ? ` · ${row.ATUALIZADO_POR_NOME}` : ''}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => abrirAlteracao(row)}
                        className="inline-flex items-center gap-2 h-9 px-3 rounded-xl text-xs font-semibold transition-all"
                        style={bloqueada
                          ? { backgroundColor: '#137432', color: '#ffffff' }
                          : { backgroundColor: '#fdecea', color: '#b42318' }}
                      >
                        {bloqueada ? <UserCheck size={14} /> : <UserX size={14} />}
                        {bloqueada ? 'Reativar' : 'Desativar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-5 py-3 text-xs" style={{ borderTop: '1px solid #eef1eb', color: '#6b7369' }}>
          <span>{total} executiva(s)</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="p-1.5 rounded-lg disabled:opacity-40" style={{ backgroundColor: '#eef2eb' }}><ChevronLeft size={14} /></button>
            <span>Página {page + 1} de {totalPages}</span>
            <button type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="p-1.5 rounded-lg disabled:opacity-40" style={{ backgroundColor: '#eef2eb' }}><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      <Modal isOpen={!!alvo} onClose={() => !salvando && setAlvo(null)} title={desativando ? 'Desativar executiva' : 'Reativar executiva'} size="sm">
        <div className="space-y-4">
          <p className="text-sm" style={{ color: '#4e574c' }}>
            {desativando
              ? <>O acesso de <b>{alvo?.NOME}</b> ao sistema será bloqueado. Ela será desconectada e não conseguirá mais entrar até ser reativada. O histórico e a carteira são mantidos.</>
              : <>O acesso de <b>{alvo?.NOME}</b> ao sistema será liberado novamente.</>}
          </p>
          {desativando ? (
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo (opcional)"
              rows={3}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{ border: '1px solid #d7dfd3', color: '#2f3a2d' }}
            />
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" disabled={salvando} onClick={() => setAlvo(null)} className="h-10 px-4 rounded-xl text-sm font-semibold" style={{ backgroundColor: '#eef2eb', color: '#425242' }}>Cancelar</button>
            <button
              type="button"
              disabled={salvando}
              onClick={confirmarAlteracao}
              className="h-10 px-4 rounded-xl text-sm font-semibold inline-flex items-center gap-2"
              style={{ backgroundColor: desativando ? '#b42318' : '#137432', color: '#ffffff' }}
            >
              {salvando ? <Loader2 size={14} className="animate-spin" /> : null}
              {desativando ? 'Desativar acesso' : 'Reativar acesso'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
