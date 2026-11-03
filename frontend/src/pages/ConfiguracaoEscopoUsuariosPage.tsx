import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, Plus, Trash2 } from 'lucide-react';
import { callSF, callSFMutation, callSFSingle, SF } from '../hooks/useMitra';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';

interface BuRow {
  ID: number;
  CODIGO: string;
  NOME: string;
}

interface VendedorRow {
  VENDEDOR_ID: number;
  VENDEDOR_NOME: string;
  EMAIL: string;
}

interface FilialRow {
  CODFILIAL: string;
  NOME_FILIAL: string;
}

interface SecaoRow {
  ID: number;
  NOME_SECAO: string;
}

interface VinculoRow {
  ID: number;
  BU_CODIGO: string;
  BU_NOME: string;
  VENDEDOR_ID: number;
  VENDEDOR_NOME: string;
  EMAIL: string;
  CODFILIAL?: string;
  ID_SECAO?: number;
  NOME_SECAO?: string;
  ATIVO: number | boolean;
}

export default function ConfiguracaoEscopoUsuariosPage() {
  const { toasts, addToast, removeToast } = useToast();

  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingVinculos, setLoadingVinculos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canAccess, setCanAccess] = useState(false);
  const [cargoAtual, setCargoAtual] = useState('');

  const [bus, setBus] = useState<BuRow[]>([]);
  const [vendedores, setVendedores] = useState<VendedorRow[]>([]);
  const [filiais, setFiliais] = useState<FilialRow[]>([]);
  const [secoesDisponiveis, setSecoesDisponiveis] = useState<SecaoRow[]>([]);
  const [vinculos, setVinculos] = useState<VinculoRow[]>([]);
  const [totalVinculos, setTotalVinculos] = useState(0);

  const [busca, setBusca] = useState('');
  const [form, setForm] = useState({
    vendedorId: '',
    buCodigo: '',
    codFilial: '',
    idsSecao: [] as string[],
  });

  const vendedorOptions = useMemo(() => [
    { value: '', label: 'Selecione o usuário' },
    ...vendedores.map((item) => ({
      value: String(item.VENDEDOR_ID),
      label: `${item.VENDEDOR_NOME || `Usuário ${item.VENDEDOR_ID}`} (${item.EMAIL || 'sem e-mail'})`,
    })),
  ], [vendedores]);

  const buOptions = useMemo(() => [
    { value: '', label: 'Selecione a BU' },
    ...bus.map((item) => ({
      value: String(item.CODIGO),
      label: `${item.CODIGO} - ${item.NOME || `BU ${item.CODIGO}`}`,
    })),
  ], [bus]);

  const filialOptions = useMemo(() => [
    { value: '', label: 'Selecione a filial' },
    ...filiais.map((item) => ({
      value: String(item.CODFILIAL),
      label: `${item.CODFILIAL} - ${item.NOME_FILIAL || `Filial ${item.CODFILIAL}`}`,
    })),
  ], [filiais]);

  const secoesSelecionadasLabel = useMemo(() => {
    if (form.idsSecao.length === 0) return 'Nenhuma seção selecionada';
    if (form.idsSecao.length === 1) return '1 seção selecionada';
    return `${form.idsSecao.length} seções selecionadas`;
  }, [form.idsSecao.length]);

  const loadSecoesPorBu = useCallback(async (buCodigo: string, busRows?: BuRow[]) => {
    const sourceBus = busRows || bus;
    const buSelecionada = sourceBus.find((item) => String(item.CODIGO) === String(buCodigo));
    if (!buSelecionada) {
      setSecoesDisponiveis([]);
      return;
    }
    const rows = await callSF(SF.listarSecoesDisponiveis, { idBu: String(buSelecionada.ID) });
    setSecoesDisponiveis(rows as SecaoRow[]);
  }, [bus]);

  const loadVinculos = useCallback(async (termoBusca: string) => {
    setLoadingVinculos(true);
    const [listRows, countRow] = await Promise.all([
      callSF(SF.adminListarVinculosBuVendedor, {
        busca: termoBusca,
        limit: '500',
        offset: '0',
      }),
      callSFSingle(SF.adminContarVinculosBuVendedor, { busca: termoBusca }),
    ]);

    setVinculos(listRows as VinculoRow[]);
    setTotalVinculos(Number(countRow?.TOTAL || 0));
    setLoadingVinculos(false);
  }, []);

  useEffect(() => {
    async function bootstrap() {
      setLoadingPage(true);
      const permissao = await callSFSingle(SF.painelGestaoPermissao);
      const podeAcessar = Number(permissao?.PODE_ACESSAR || 0) === 1;
      setCanAccess(podeAcessar);
      setCargoAtual(String(permissao?.CARGO_ATUAL || ''));

      if (podeAcessar) {
        const [busRows, vendedoresRows, filiaisRows] = await Promise.all([
          callSF(SF.adminListarBus, { busca: '', limit: '500', offset: '0' }),
          callSF(SF.adminListarVendedoresBu, { busca: '', limit: '500', offset: '0' }),
          callSF(SF.listarFiliais),
        ]);

        setBus(busRows as BuRow[]);
        setVendedores(vendedoresRows as VendedorRow[]);
        setFiliais(filiaisRows as FilialRow[]);
        await loadVinculos('');
      }

      setLoadingPage(false);
    }

    bootstrap();
  }, [loadVinculos]);

  useEffect(() => {
    if (!canAccess || loadingPage) return;
    loadVinculos(busca.trim());
  }, [busca, canAccess, loadingPage, loadVinculos]);

  useEffect(() => {
    if (!canAccess || loadingPage) return;
    if (!form.buCodigo) {
      setSecoesDisponiveis([]);
      setForm((prev) => ({ ...prev, idsSecao: [] }));
      return;
    }
    loadSecoesPorBu(form.buCodigo);
  }, [canAccess, form.buCodigo, loadSecoesPorBu, loadingPage]);

  function toggleSecao(idSecao: string) {
    setForm((prev) => ({
      ...prev,
      idsSecao: prev.idsSecao.includes(idSecao)
        ? prev.idsSecao.filter((id) => id !== idSecao)
        : [...prev.idsSecao, idSecao],
    }));
  }

  async function adicionarEscopo() {
    if (!form.vendedorId) {
      addToast('error', 'Selecione o usuário.');
      return;
    }
    if (!form.buCodigo) {
      addToast('error', 'Selecione a BU.');
      return;
    }
    if (!form.codFilial) {
      addToast('error', 'Selecione a filial.');
      return;
    }
    if (form.idsSecao.length === 0) {
      addToast('error', 'Selecione pelo menos uma seção.');
      return;
    }

    setSaving(true);
    try {
      const resultados = await Promise.all(form.idsSecao.map((idSecao) => callSFMutation(SF.adminVincularBuVendedor, {
        buCodigo: form.buCodigo,
        vendedorId: form.vendedorId,
        codFilial: form.codFilial,
        idSecao,
      })));
      const salvos = resultados.filter(Boolean).length;

      if (salvos === 0) {
        addToast('error', 'Não foi possível salvar os vínculos de escopo.');
        return;
      }

      if (salvos < form.idsSecao.length) {
        addToast('error', `Foram salvos ${salvos} de ${form.idsSecao.length} vínculos. Verifique se já existiam vínculos duplicados.`);
      } else {
        addToast('success', salvos === 1 ? 'Escopo vinculado com sucesso.' : `${salvos} escopos vinculados com sucesso.`);
      }
      setForm((prev) => ({ ...prev, idsSecao: [] }));
      await loadVinculos(busca.trim());
    } finally {
      setSaving(false);
    }
  }

  async function removerEscopo(row: VinculoRow) {
    const ok = await callSFMutation(SF.adminDesvincularBuVendedor, { vinculoId: String(row.ID) });
    if (!ok) {
      addToast('error', 'Não foi possível remover o vínculo de escopo.');
      return;
    }

    addToast('success', 'Vínculo removido com sucesso.');
    await loadVinculos(busca.trim());
  }

  if (loadingPage) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '3px solid #d5dbd3', borderTopColor: '#137432' }} />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="animate-fadeIn rounded-3xl p-8" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <h1 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>Configuração de Escopo</h1>
        <p className="mt-3 text-lg" style={{ color: '#636d63' }}>Esta tela é exclusiva para perfis de gestão.</p>
        <p className="mt-2 text-sm" style={{ color: '#7b857b' }}>Perfil atual: <strong>{cargoAtual || 'NÃO DEFINIDO'}</strong>.</p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="mb-5">
        <h1 className="font-display text-5xl font-extrabold" style={{ color: '#1b1c1a' }}>Configuração de Escopo por Usuário</h1>
        <p className="text-2xl mt-1" style={{ color: '#515b51' }}>
          Vincule múltiplos códigos de seção por usuário (BU + filial + seção).
        </p>
      </div>

      <section className="rounded-2xl p-4 mb-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <Select
            label="Usuário"
            value={form.vendedorId}
            options={vendedorOptions}
            onChange={(value) => setForm((prev) => ({ ...prev, vendedorId: value }))}
          />
          <Select
            label="BU"
            value={form.buCodigo}
            options={buOptions}
            onChange={(value) => setForm((prev) => ({ ...prev, buCodigo: value, idsSecao: [] }))}
          />
          <Select
            label="Filial"
            value={form.codFilial}
            options={filialOptions}
            onChange={(value) => setForm((prev) => ({ ...prev, codFilial: value }))}
          />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Seções</span>
              <span className="text-xs" style={{ color: '#6f796d' }}>{secoesSelecionadasLabel}</span>
            </div>
            <div className="rounded-lg border p-2 min-h-[42px] max-h-44 overflow-y-auto" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
              {!form.buCodigo ? (
                <p className="px-1 py-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Selecione uma BU primeiro.</p>
              ) : secoesDisponiveis.length === 0 ? (
                <p className="px-1 py-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>Nenhuma seção disponível.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {secoesDisponiveis.map((secao) => {
                    const idSecao = String(secao.ID);
                    const selected = form.idsSecao.includes(idSecao);
                    return (
                      <button
                        key={idSecao}
                        type="button"
                        onClick={() => toggleSecao(idSecao)}
                        className="rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200 text-left"
                        style={{
                          backgroundColor: selected ? 'var(--color-primary-bg)' : '#f8faf7',
                          border: `1px solid ${selected ? 'var(--color-primary)' : '#e3e8de'}`,
                          color: selected ? 'var(--color-primary)' : '#1b1c1a',
                        }}
                      >
                        {secao.ID} - {secao.NOME_SECAO || `Seção ${secao.ID}`}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            className="btn-pill-primary px-5 py-2 text-sm font-semibold inline-flex items-center gap-2"
            onClick={adicionarEscopo}
            disabled={saving}
          >
            <Plus size={14} /> {saving ? 'Salvando...' : form.idsSecao.length > 1 ? 'Adicionar escopos' : 'Adicionar escopo'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="font-display text-3xl font-extrabold inline-flex items-center gap-2" style={{ color: '#1b1c1a' }}>
            <Link2 size={20} /> Escopos vinculados ({totalVinculos})
          </h2>
          <div className="w-full md:w-[320px]">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por usuário, e-mail, BU, filial ou seção"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #e5eadf', backgroundColor: '#ffffff' }}>
          <table className="w-full min-w-[920px]">
            <thead>
              <tr className="text-left text-xs" style={{ color: '#788378', backgroundColor: '#edf0eb' }}>
                <th className="px-3 py-3">Usuário</th>
                <th className="px-3 py-3">E-mail</th>
                <th className="px-3 py-3">BU</th>
                <th className="px-3 py-3">Filial</th>
                <th className="px-3 py-3">Seção</th>
                <th className="px-3 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loadingVinculos ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm" style={{ color: '#687468' }}>
                    Carregando vínculos...
                  </td>
                </tr>
              ) : vinculos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm" style={{ color: '#687468' }}>
                    Nenhum vínculo encontrado.
                  </td>
                </tr>
              ) : (
                vinculos.map((row) => (
                  <tr key={row.ID} style={{ borderTop: '1px solid #edf0ea' }}>
                    <td className="px-3 py-3 text-sm" style={{ color: '#1b1c1a' }}>{row.VENDEDOR_NOME || `Usuário ${row.VENDEDOR_ID}`}</td>
                    <td className="px-3 py-3 text-sm" style={{ color: '#5b675a' }}>{row.EMAIL || '-'}</td>
                    <td className="px-3 py-3 text-sm" style={{ color: '#1b1c1a' }}>{row.BU_CODIGO} - {row.BU_NOME || 'BU'}</td>
                    <td className="px-3 py-3 text-sm" style={{ color: '#1b1c1a' }}>{row.CODFILIAL || '-'}</td>
                    <td className="px-3 py-3 text-sm" style={{ color: '#1b1c1a' }}>{row.ID_SECAO || '-'} {row.NOME_SECAO ? `- ${row.NOME_SECAO}` : ''}</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        className="w-8 h-8 rounded-full inline-flex items-center justify-center"
                        style={{ backgroundColor: '#f8eceb', color: '#ab3d3a' }}
                        onClick={() => removerEscopo(row)}
                        title="Remover vínculo"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
