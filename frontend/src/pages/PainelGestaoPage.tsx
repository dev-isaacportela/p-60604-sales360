import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, CircleDollarSign, ClipboardList, RefreshCcw, Target, UsersRound } from 'lucide-react';
import { callSF, callSFSingle, callSFWithMeta, SF, formatCurrency } from '../hooks/useMitra';

interface ResumoGestao {
  REALIZADO_MES: number;
  META_MES: number;
  ATINGIMENTO_PERC: number;
  GAP_META: number;
  CLIENTES_ATIVOS: number;
  ATIVIDADES_PENDENTES: number;
}

interface ItemOperacional {
  TIPO: string;
  REGISTRO_ID: number;
  VENDEDOR_ID: number;
  RESPONSAVEL: string;
  ITEM: string;
  STATUS: string;
  DATA_REFERENCIA: string;
  PRIORIDADE: string;
  ACAO_RECOMENDADA: string;
}

interface VendedorFiltro {
  id: string;
  label: string;
}

function badgeStatus(status: string) {
  const key = (status || '').toUpperCase();
  if (key === 'CONCLUIDA') return { bg: '#e6f4ea', color: '#1f7d3f' };
  if (key === 'EM_ANDAMENTO') return { bg: '#eef3ff', color: '#2e5cc4' };
  if (key === 'PENDENTE' || key === 'AGENDADA') return { bg: '#fff4dc', color: '#a26a00' };
  return { bg: '#ecefee', color: '#5c665f' };
}

function badgePrioridade(prioridade: string) {
  const key = (prioridade || '').toUpperCase();
  if (key === 'ALTA') return { bg: '#fde8e8', color: '#b42318' };
  if (key === 'MEDIA') return { bg: '#fff4dc', color: '#a26a00' };
  if (key === 'BAIXA') return { bg: '#ecf8f2', color: '#157347' };
  return { bg: '#ecefee', color: '#5c665f' };
}

export default function PainelGestaoPage() {
  const [loading, setLoading] = useState(true);
  const [loadingDados, setLoadingDados] = useState(false);
  const [podeAcessar, setPodeAcessar] = useState(false);
  const [cargoAtual, setCargoAtual] = useState('');
  const [resumo, setResumo] = useState<ResumoGestao | null>(null);
  const [itens, setItens] = useState<ItemOperacional[]>([]);
  const [vendedores, setVendedores] = useState<VendedorFiltro[]>([]);
  const [vendedorSelecionado, setVendedorSelecionado] = useState('');
  const [filtroOpen, setFiltroOpen] = useState(false);
  const [atualizandoAlertas, setAtualizandoAlertas] = useState(false);
  const [mensagemAlertas, setMensagemAlertas] = useState('');
  const [erroAlertas, setErroAlertas] = useState('');
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const vendedoresComTodos = useMemo(() => {
    return [{ id: '', label: 'Toda a equipe' }, ...vendedores];
  }, [vendedores]);

  const vendedorLabel = useMemo(() => {
    const found = vendedoresComTodos.find((item) => item.id === vendedorSelecionado);
    return found ? found.label : 'Toda a equipe';
  }, [vendedoresComTodos, vendedorSelecionado]);

  async function carregarDadosGestao(vendedorId: string) {
    setLoadingDados(true);
    const input = vendedorId ? { vendedorId } : { vendedorId: '' };

    const [resumoResp, operacionalResp] = await Promise.allSettled([
      callSFSingle(SF.painelGestaoResumo, input),
      callSF(SF.painelGestaoOperacional, input),
    ]);

    if (resumoResp.status === 'fulfilled' && resumoResp.value) {
      setResumo({
        REALIZADO_MES: Number(resumoResp.value.REALIZADO_MES || 0),
        META_MES: Number(resumoResp.value.META_MES || 0),
        ATINGIMENTO_PERC: Number(resumoResp.value.ATINGIMENTO_PERC || 0),
        GAP_META: Number(resumoResp.value.GAP_META || 0),
        CLIENTES_ATIVOS: Number(resumoResp.value.CLIENTES_ATIVOS || 0),
        ATIVIDADES_PENDENTES: Number(resumoResp.value.ATIVIDADES_PENDENTES || 0),
      });
    } else {
      setResumo(null);
    }

    if (operacionalResp.status === 'fulfilled') {
      setItens((operacionalResp.value || []) as ItemOperacional[]);
    } else {
      setItens([]);
    }

    setLoadingDados(false);
  }

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      setLoading(true);
      const [permissaoResp, vendedoresResp] = await Promise.allSettled([
        callSFSingle(SF.painelGestaoPermissao),
        callSF(SF.painelGestaoVendedores),
      ]);

      if (!active) return;

      const permissao = permissaoResp.status === 'fulfilled' ? permissaoResp.value : null;
      const acesso = Number(permissao?.PODE_ACESSAR || 0) === 1;
      setPodeAcessar(acesso);
      setCargoAtual(String(permissao?.CARGO_ATUAL || ''));

      if (vendedoresResp.status === 'fulfilled') {
        const options = vendedoresResp.value.map((row: any) => ({
          id: String(row.VENDEDOR_ID),
          label: row.VENDEDOR_NOME || row.EMAIL || `Usuário ${row.VENDEDOR_ID}`,
        }));
        setVendedores(options);
      }

      if (acesso) {
        await carregarDadosGestao('');
      }

      if (active) setLoading(false);
    }

    bootstrap();

    return () => {
      active = false;
    };
  }, []);

  async function atualizarAlertas() {
    if (atualizandoAlertas) return;
    setAtualizandoAlertas(true);
    setMensagemAlertas('');
    setErroAlertas('');
    try {
      const result = await callSFWithMeta(
        vendedorSelecionado ? SF.alertasInteligentesPopular : SF.alertasInteligentesProcessarFila,
        vendedorSelecionado ? { vendedorId: vendedorSelecionado } : { acao: 'iniciar', lote: '1' },
      );
      if (result.error) throw new Error(result.error);
      const resumo = result.rows.find((row) => String(row.STATUS || '') === 'OK') || null;
      const processados = vendedorSelecionado
        ? String(resumo?.VENDEDORES_PROCESSADOS || '').trim()
        : String(resumo?.PROCESSADOS_NESTA_EXECUCAO || '').trim();
      const pendentes = Number(resumo?.PENDENTES || 0);
      setMensagemAlertas(
        vendedorSelecionado
          ? (processados ? 'Alertas atualizados para o filtro atual.' : 'Atualização concluída. Nenhum vendedor novo precisou ser processado.')
          : `Ciclo diário de alertas iniciado. ${processados || 0} vendedor processado agora e ${pendentes} pendente(s) para concluir ainda hoje.`,
      );
      await carregarDadosGestao(vendedorSelecionado);
    } catch (err) {
      setErroAlertas(err instanceof Error ? err.message : 'Falha ao atualizar alertas.');
    } finally {
      setAtualizandoAlertas(false);
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setFiltroOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '3px solid #d5dbd3', borderTopColor: '#137432' }} />
      </div>
    );
  }

  if (!podeAcessar) {
    return (
      <div className="animate-fadeIn rounded-3xl p-8" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <h1 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>Painel de Gestão</h1>
        <p className="mt-3 text-lg" style={{ color: '#636d63' }}>
          Este painel está disponível apenas para perfis de gestão.
        </p>
        <p className="mt-2 text-sm" style={{ color: '#7b857b' }}>
          Perfil atual: <strong>{cargoAtual || 'NÃO DEFINIDO'}</strong>. Solicite ao administrador a atualização em `USUARIO_CARGO`.
        </p>
      </div>
    );
  }

  const atingimento = Number(resumo?.ATINGIMENTO_PERC || 0);
  const gap = Number(resumo?.GAP_META || 0);
  const gapLabel = gap <= 0 ? `Meta superada em ${formatCurrency(Math.abs(gap))}` : `Faltam ${formatCurrency(gap)}`;

  return (
    <div className="animate-fadeIn">
      <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-5xl font-extrabold" style={{ color: '#1b1c1a' }}>Painel de Gestão</h1>
          <p className="text-2xl mt-1" style={{ color: '#515b51' }}>
            Visão 360 da equipe com foco em receita, meta e execução operacional.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {cargoAtual === 'ADMIN' ? (
            <button
              type="button"
              onClick={atualizarAlertas}
              disabled={atualizandoAlertas}
              className="h-11 px-4 rounded-2xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: '#137432', color: '#ffffff' }}
            >
              <RefreshCcw size={16} className={atualizandoAlertas ? 'animate-spin' : ''} />
              {atualizandoAlertas ? 'Gerando alertas...' : 'Gerar novos alertas'}
            </button>
          ) : null}

          <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setFiltroOpen((prev) => !prev)}
            className="h-11 min-w-[240px] px-4 rounded-2xl text-sm font-semibold flex items-center justify-between gap-3"
            style={{ backgroundColor: '#eef2eb', color: '#425242', border: '1px solid #d7dfd3' }}
          >
            <span>Vendedor: {vendedorLabel}</span>
            <ChevronDown size={16} />
          </button>

          {filtroOpen ? (
            <div className="absolute right-0 mt-2 w-[260px] rounded-2xl p-2 z-20 animate-scaleIn" style={{ backgroundColor: '#ffffff', border: '1px solid #dde5d8', boxShadow: '0 12px 26px rgba(23,40,30,0.12)' }}>
              {vendedoresComTodos.map((item) => (
                <button
                  key={`${item.id || 'all'}-${item.label}`}
                  onClick={() => {
                    setVendedorSelecionado(item.id);
                    setFiltroOpen(false);
                    carregarDadosGestao(item.id);
                  }}
                  className="w-full text-left rounded-xl px-3 py-2 text-sm"
                  style={{
                    backgroundColor: vendedorSelecionado === item.id ? '#dfeadf' : 'transparent',
                    color: vendedorSelecionado === item.id ? '#1f6f39' : '#4e5a4e',
                    fontWeight: vendedorSelecionado === item.id ? 700 : 500,
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
          </div>
        </div>
      </div>

      {mensagemAlertas ? (
        <div className="mb-5 rounded-2xl px-4 py-3 text-sm font-semibold" style={{ backgroundColor: '#e8f5ec', color: '#137432', border: '1px solid #cfe0cb' }}>
          {mensagemAlertas}
        </div>
      ) : null}

      {erroAlertas ? (
        <div className="mb-5 rounded-2xl px-4 py-3 text-sm font-semibold" style={{ backgroundColor: '#fde8e8', color: '#b42318', border: '1px solid #f6caca' }}>
          {erroAlertas}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <div className="rounded-2xl p-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-full p-2" style={{ backgroundColor: '#e9f5ed', color: '#166b35' }}><CircleDollarSign size={17} /></div>
            <p className="text-sm" style={{ color: '#6c766a' }}>Receita no mês</p>
          </div>
          <p className="text-3xl font-bold" style={{ color: '#1b1c1a' }}>{formatCurrency(Number(resumo?.REALIZADO_MES || 0))}</p>
        </div>

        <div className="rounded-2xl p-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-full p-2" style={{ backgroundColor: '#edf1ff', color: '#2e5cc4' }}><Target size={17} /></div>
            <p className="text-sm" style={{ color: '#6c766a' }}>Meta do mês</p>
          </div>
          <p className="text-3xl font-bold" style={{ color: '#1b1c1a' }}>{formatCurrency(Number(resumo?.META_MES || 0))}</p>
        </div>

        <div className="rounded-2xl p-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-full p-2" style={{ backgroundColor: '#fff4dc', color: '#a26a00' }}><UsersRound size={17} /></div>
            <p className="text-sm" style={{ color: '#6c766a' }}>Atingimento</p>
          </div>
          <p className="text-3xl font-bold" style={{ color: '#1b1c1a' }}>{atingimento.toFixed(1)}%</p>
          <p className="text-xs mt-1" style={{ color: '#748073' }}>Clientes ativos: {Number(resumo?.CLIENTES_ATIVOS || 0)}</p>
        </div>

        <div className="rounded-2xl p-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-full p-2" style={{ backgroundColor: '#fdecef', color: '#b42318' }}><AlertTriangle size={17} /></div>
            <p className="text-sm" style={{ color: '#6c766a' }}>Gap da meta</p>
          </div>
          <p className="text-xl font-bold" style={{ color: gap <= 0 ? '#1f7d3f' : '#b42318' }}>{gapLabel}</p>
          <p className="text-xs mt-1" style={{ color: '#748073' }}>Atividades pendentes: {Number(resumo?.ATIVIDADES_PENDENTES || 0)}</p>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Fila Operacional da Equipe</h2>
          {loadingDados ? (
            <div className="w-5 h-5 rounded-full animate-spin" style={{ border: '2px solid #d5dbd3', borderTopColor: '#137432' }} />
          ) : null}
        </div>

        {itens.length === 0 ? (
          <div className="rounded-xl p-6 text-center" style={{ backgroundColor: '#ffffff', color: '#6e786d' }}>
            Nenhum item operacional pendente para o filtro selecionado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="text-left text-xs" style={{ color: '#788378' }}>
                  <th className="px-3 py-3">Tipo</th>
                  <th className="px-3 py-3">Responsável</th>
                  <th className="px-3 py-3">Item</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Data</th>
                  <th className="px-3 py-3">Prioridade</th>
                  <th className="px-3 py-3">Ação recomendada</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((row) => {
                  const statusStyle = badgeStatus(row.STATUS || '');
                  const prioridadeStyle = badgePrioridade(row.PRIORIDADE || '');

                  return (
                    <tr key={`${row.TIPO}-${row.REGISTRO_ID}`} style={{ borderTop: '1px solid #e6ebe1' }}>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: row.TIPO === 'VISITA' ? '#eef3ff' : '#e9f5ed', color: row.TIPO === 'VISITA' ? '#2e5cc4' : '#166b35' }}>
                          <ClipboardList size={13} /> {row.TIPO}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm font-semibold" style={{ color: '#2a312a' }}>{row.RESPONSAVEL}</td>
                      <td className="px-3 py-3 text-sm" style={{ color: '#434c43' }}>{row.ITEM}</td>
                      <td className="px-3 py-3">
                        <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}>
                          {row.STATUS}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm" style={{ color: '#5a665a' }}>{row.DATA_REFERENCIA || '-'}</td>
                      <td className="px-3 py-3">
                        <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: prioridadeStyle.bg, color: prioridadeStyle.color }}>
                          {row.PRIORIDADE || '-'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm" style={{ color: '#2f4f35' }}>{row.ACAO_RECOMENDADA}</td>
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
