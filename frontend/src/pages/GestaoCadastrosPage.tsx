import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, Trash2, X } from 'lucide-react';
import { callSF, callSFMutation, callSFSingle, formatCurrency, SF } from '../hooks/useMitra';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';

type Tab = 'METAS' | 'COMISSOES';
type ModalMode = 'CRIAR' | 'EDITAR';

interface Meta {
  ID: number;
  VENDEDOR_ID: number;
  VENDEDOR: string;
  MES: number;
  ANO: number;
  VALOR_META: number;
  VALOR_REALIZADO: number;
}

interface Comissao {
  ID: number;
  VENDEDOR_ID: number;
  VENDEDOR: string;
  MES: number;
  ANO: number;
  VALOR_VENDAS: number;
  PERC_COMISSAO: number;
  VALOR_COMISSAO: number;
}

interface VendedorOption {
  ID: number;
  NOME: string;
}

interface MetaForm {
  vendedorId: string;
  mes: string;
  ano: string;
  valorMeta: string;
  valorRealizado: string;
}

interface ComissaoForm {
  vendedorId: string;
  mes: string;
  ano: string;
  valorVendas: string;
  percComissao: string;
  valorComissao: string;
}

const PAGE_SIZE = 10;

const META_FORM_DEFAULT: MetaForm = {
  vendedorId: '',
  mes: String(new Date().getMonth() + 1),
  ano: String(new Date().getFullYear()),
  valorMeta: '0',
  valorRealizado: '0',
};

const COMISSAO_FORM_DEFAULT: ComissaoForm = {
  vendedorId: '',
  mes: String(new Date().getMonth() + 1),
  ano: String(new Date().getFullYear()),
  valorVendas: '0',
  percComissao: '0',
  valorComissao: '0',
};

function toNumber(value: string): string {
  const normalized = Number(value.replace(',', '.'));
  return Number.isFinite(normalized) ? String(normalized) : '0';
}

export default function GestaoCadastrosPage() {
  const { toasts, addToast, removeToast } = useToast();

  const [tab, setTab] = useState<Tab>('METAS');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const [metas, setMetas] = useState<Meta[]>([]);
  const [comissoes, setComissoes] = useState<Comissao[]>([]);
  const [vendedores, setVendedores] = useState<VendedorOption[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('CRIAR');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [metaForm, setMetaForm] = useState<MetaForm>(META_FORM_DEFAULT);
  const [comissaoForm, setComissaoForm] = useState<ComissaoForm>(COMISSAO_FORM_DEFAULT);

  const vendedorOptions = useMemo(() => {
    return [
      { value: '', label: 'Selecione...' },
      ...vendedores.map((item) => ({ value: String(item.ID), label: item.NOME })),
    ];
  }, [vendedores]);

  const monthOptions = useMemo(() => {
    return Array.from({ length: 12 }).map((_, idx) => ({
      value: String(idx + 1),
      label: `${String(idx + 1).padStart(2, '0')}`,
    }));
  }, []);

  const loadVendedores = useCallback(async () => {
    const rows = await callSF(SF.painelGestaoVendedores);
    const mapped = (rows || []).map((row: any) => ({
      ID: Number(row.VENDEDOR_ID),
      NOME: String(row.VENDEDOR_NOME || row.EMAIL || `Usuário ${row.VENDEDOR_ID}`),
    }));
    const uniqueMap = new Map<number, VendedorOption>();
    mapped.forEach((item: VendedorOption) => uniqueMap.set(item.ID, item));
    setVendedores(Array.from(uniqueMap.values()));
  }, []);

  const loadCurrentTab = useCallback(async () => {
    setLoading(true);
    const input = {
      busca: query,
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    };

    if (tab === 'METAS') {
      const [listRows, countRow] = await Promise.all([
        callSF(SF.adminListarMetas, { ...input, ano: '', mes: '' }),
        callSFSingle(SF.adminContarMetas, { busca: query, ano: '', mes: '' }),
      ]);
      setMetas((listRows as Meta[]).map((row) => ({
        ...row,
        VALOR_META: Number(row.VALOR_META),
        VALOR_REALIZADO: Number(row.VALOR_REALIZADO),
      })));
      setTotal(Number(countRow?.TOTAL || 0));
    }

    if (tab === 'COMISSOES') {
      const [listRows, countRow] = await Promise.all([
        callSF(SF.adminListarComissoes, { ...input, ano: '', mes: '' }),
        callSFSingle(SF.adminContarComissoes, { busca: query, ano: '', mes: '' }),
      ]);
      setComissoes((listRows as Comissao[]).map((row) => ({
        ...row,
        VALOR_VENDAS: Number(row.VALOR_VENDAS),
        PERC_COMISSAO: Number(row.PERC_COMISSAO),
        VALOR_COMISSAO: Number(row.VALOR_COMISSAO),
      })));
      setTotal(Number(countRow?.TOTAL || 0));
    }

    setLoading(false);
  }, [page, query, tab]);

  useEffect(() => {
    loadVendedores();
  }, [loadVendedores]);

  useEffect(() => {
    loadCurrentTab();
  }, [loadCurrentTab]);

  function openCreate() {
    setModalMode('CRIAR');
    setEditingId(null);
    setMetaForm(META_FORM_DEFAULT);
    setComissaoForm(COMISSAO_FORM_DEFAULT);
    setModalOpen(true);
  }

  function openEditMeta(row: Meta) {
    setModalMode('EDITAR');
    setEditingId(row.ID);
    setMetaForm({
      vendedorId: String(row.VENDEDOR_ID),
      mes: String(row.MES),
      ano: String(row.ANO),
      valorMeta: String(row.VALOR_META),
      valorRealizado: String(row.VALOR_REALIZADO),
    });
    setModalOpen(true);
  }

  function openEditComissao(row: Comissao) {
    setModalMode('EDITAR');
    setEditingId(row.ID);
    setComissaoForm({
      vendedorId: String(row.VENDEDOR_ID),
      mes: String(row.MES),
      ano: String(row.ANO),
      valorVendas: String(row.VALOR_VENDAS),
      percComissao: String(row.PERC_COMISSAO),
      valorComissao: String(row.VALOR_COMISSAO),
    });
    setModalOpen(true);
  }

  async function onSave() {
    setSaving(true);
    try {
      if (tab === 'METAS') {
        const payload = {
          vendedorId: metaForm.vendedorId,
          mes: metaForm.mes,
          ano: metaForm.ano,
          valorMeta: toNumber(metaForm.valorMeta),
          valorRealizado: toNumber(metaForm.valorRealizado),
        };
        const ok = modalMode === 'CRIAR'
          ? await callSFMutation(SF.adminCriarMeta, payload)
          : await callSFMutation(SF.adminAtualizarMeta, { ...payload, metaId: String(editingId) });
        if (!ok) throw new Error('Erro ao salvar meta.');
      }

      if (tab === 'COMISSOES') {
        const payload = {
          vendedorId: comissaoForm.vendedorId,
          mes: comissaoForm.mes,
          ano: comissaoForm.ano,
          valorVendas: toNumber(comissaoForm.valorVendas),
          percComissao: toNumber(comissaoForm.percComissao),
          valorComissao: toNumber(comissaoForm.valorComissao),
        };
        const ok = modalMode === 'CRIAR'
          ? await callSFMutation(SF.adminCriarComissao, payload)
          : await callSFMutation(SF.adminAtualizarComissao, { ...payload, comissaoId: String(editingId) });
        if (!ok) throw new Error('Erro ao salvar comissão.');
      }

      addToast('success', `${tab === 'METAS' ? 'Meta' : 'Comissão'} salvo(a) com sucesso.`);
      setModalOpen(false);
      await loadCurrentTab();
    } catch (error) {
      console.error(error);
      addToast('error', 'Falha ao salvar registro.');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: number) {
    const ok = tab === 'METAS'
      ? await callSFMutation(SF.adminExcluirMeta, { metaId: String(id) })
      : await callSFMutation(SF.adminExcluirComissao, { comissaoId: String(id) });
    if (!ok) {
      addToast('error', 'Não foi possível excluir o registro.');
      return;
    }
    addToast('success', 'Registro excluído.');
    await loadCurrentTab();
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="animate-fadeIn">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="flex items-center justify-between mb-4 gap-3">
        <div>
          <h1 className="font-display text-4xl font-extrabold" style={{ color: '#165a3a' }}>Gestão de Cadastros</h1>
          <p className="text-sm mt-1" style={{ color: '#697468' }}>Administração de metas e comissões por perfil de gestão.</p>
        </div>
        <button className="btn-pill-primary px-5 py-2 text-sm font-semibold inline-flex items-center gap-2" onClick={openCreate}>
          <Plus size={14} /> Novo
        </button>
      </div>

      <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e4e9df' }}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center rounded-lg p-1" style={{ backgroundColor: '#edf0eb' }}>
            {(['METAS', 'COMISSOES'] as Tab[]).map((item) => (
              <button
                key={item}
                onClick={() => {
                  setTab(item);
                  setPage(0);
                }}
                className="px-3 py-1.5 text-sm rounded-md font-semibold"
                style={{
                  backgroundColor: tab === item ? '#ffffff' : 'transparent',
                  color: tab === item ? '#1c2b1f' : '#687369',
                }}
              >
                {item === 'METAS' ? 'Metas' : 'Comissões'}
              </button>
            ))}
          </div>

          <Input
            label="Busca"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Nome do vendedor"
          />
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
        {loading ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: '#6f7a6f' }}>Carregando dados...</div>
        ) : (
          <>
            {tab === 'METAS' && (
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="text-left text-xs" style={{ color: '#7b857c', backgroundColor: '#edf0eb' }}>
                    <th className="px-3 py-3">Vendedor</th><th className="px-3 py-3">Mês/Ano</th><th className="px-3 py-3">Meta</th><th className="px-3 py-3">Realizado</th><th className="px-3 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {metas.map((row) => (
                    <tr key={row.ID} style={{ borderTop: '1px solid #edf0ea' }}>
                      <td className="px-3 py-3 text-sm font-semibold">{row.VENDEDOR}</td>
                      <td className="px-3 py-3 text-sm">{String(row.MES).padStart(2, '0')}/{row.ANO}</td>
                      <td className="px-3 py-3 text-sm">{formatCurrency(Number(row.VALOR_META))}</td>
                      <td className="px-3 py-3 text-sm">{formatCurrency(Number(row.VALOR_REALIZADO))}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button className="w-8 h-8 rounded-lg inline-flex items-center justify-center" style={{ backgroundColor: '#edf1ec', color: '#3f5f47' }} onClick={() => openEditMeta(row)}><Edit3 size={14} /></button>
                          <button className="w-8 h-8 rounded-lg inline-flex items-center justify-center" style={{ backgroundColor: '#ffe8e8', color: '#b43333' }} onClick={() => onDelete(row.ID)}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === 'COMISSOES' && (
              <table className="w-full min-w-[980px]">
                <thead>
                  <tr className="text-left text-xs" style={{ color: '#7b857c', backgroundColor: '#edf0eb' }}>
                    <th className="px-3 py-3">Vendedor</th><th className="px-3 py-3">Mês/Ano</th><th className="px-3 py-3">Vendas</th><th className="px-3 py-3">%</th><th className="px-3 py-3">Comissão</th><th className="px-3 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {comissoes.map((row) => (
                    <tr key={row.ID} style={{ borderTop: '1px solid #edf0ea' }}>
                      <td className="px-3 py-3 text-sm font-semibold">{row.VENDEDOR}</td>
                      <td className="px-3 py-3 text-sm">{String(row.MES).padStart(2, '0')}/{row.ANO}</td>
                      <td className="px-3 py-3 text-sm">{formatCurrency(Number(row.VALOR_VENDAS))}</td>
                      <td className="px-3 py-3 text-sm">{Number(row.PERC_COMISSAO).toFixed(2)}%</td>
                      <td className="px-3 py-3 text-sm">{formatCurrency(Number(row.VALOR_COMISSAO))}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button className="w-8 h-8 rounded-lg inline-flex items-center justify-center" style={{ backgroundColor: '#edf1ec', color: '#3f5f47' }} onClick={() => openEditComissao(row)}><Edit3 size={14} /></button>
                          <button className="w-8 h-8 rounded-lg inline-flex items-center justify-center" style={{ backgroundColor: '#ffe8e8', color: '#b43333' }} onClick={() => onDelete(row.ID)}><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between mt-3">
        <p className="text-sm" style={{ color: '#6d786d' }}>
          Mostrando {total === 0 ? 0 : page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} de {total}
        </p>
        <div className="flex items-center gap-1">
          <button disabled={page === 0} onClick={() => setPage((prev) => prev - 1)} className="w-8 h-8 rounded-lg" style={{ backgroundColor: '#edf0eb', color: '#657165' }}>‹</button>
          <button disabled={page >= totalPages - 1} onClick={() => setPage((prev) => prev + 1)} className="w-8 h-8 rounded-lg" style={{ backgroundColor: '#edf0eb', color: '#657165' }}>›</button>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(20,25,20,0.35)' }}>
          <div className="w-full max-w-3xl rounded-2xl p-5" style={{ backgroundColor: '#ffffff', border: '1px solid #e4e9df' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>
                {modalMode === 'CRIAR' ? 'Novo' : 'Editar'} {tab === 'METAS' ? 'Meta' : 'Comissão'}
              </h2>
              <button className="w-8 h-8 rounded-full inline-flex items-center justify-center" style={{ backgroundColor: '#edf1ec', color: '#5f6b60' }} onClick={() => setModalOpen(false)}>
                <X size={14} />
              </button>
            </div>

            {tab === 'METAS' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Select label="Vendedor" options={vendedorOptions} value={metaForm.vendedorId} onChange={(value) => setMetaForm((prev) => ({ ...prev, vendedorId: value }))} />
                <Select label="Mês" options={monthOptions} value={metaForm.mes} onChange={(value) => setMetaForm((prev) => ({ ...prev, mes: value }))} />
                <Input label="Ano" value={metaForm.ano} onChange={(e) => setMetaForm((prev) => ({ ...prev, ano: e.target.value }))} />
                <Input label="Valor Meta" value={metaForm.valorMeta} onChange={(e) => setMetaForm((prev) => ({ ...prev, valorMeta: e.target.value }))} />
                <Input label="Valor Realizado" value={metaForm.valorRealizado} onChange={(e) => setMetaForm((prev) => ({ ...prev, valorRealizado: e.target.value }))} />
              </div>
            )}

            {tab === 'COMISSOES' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Select label="Vendedor" options={vendedorOptions} value={comissaoForm.vendedorId} onChange={(value) => setComissaoForm((prev) => ({ ...prev, vendedorId: value }))} />
                <Select label="Mês" options={monthOptions} value={comissaoForm.mes} onChange={(value) => setComissaoForm((prev) => ({ ...prev, mes: value }))} />
                <Input label="Ano" value={comissaoForm.ano} onChange={(e) => setComissaoForm((prev) => ({ ...prev, ano: e.target.value }))} />
                <Input label="Valor de Vendas" value={comissaoForm.valorVendas} onChange={(e) => setComissaoForm((prev) => ({ ...prev, valorVendas: e.target.value }))} />
                <Input label="% Comissão" value={comissaoForm.percComissao} onChange={(e) => setComissaoForm((prev) => ({ ...prev, percComissao: e.target.value }))} />
                <Input label="Valor Comissão" value={comissaoForm.valorComissao} onChange={(e) => setComissaoForm((prev) => ({ ...prev, valorComissao: e.target.value }))} />
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ backgroundColor: '#edf0eb', color: '#5d695e' }} onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn-pill-primary px-5 py-2 text-sm font-semibold disabled:opacity-70" onClick={onSave} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
