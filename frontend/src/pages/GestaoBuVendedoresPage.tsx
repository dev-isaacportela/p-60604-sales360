import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link2, Plus, Trash2, Edit3, X } from 'lucide-react';
import { callSF, callSFMutation, callSFSingle, SF } from '../hooks/useMitra';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';

interface BuRow {
  ID: number;
  CODIGO: string;
  NOME: string;
  ATIVO: number | boolean;
  TOTAL_VENDEDORES: number;
}

interface VendedorRow {
  VENDEDOR_ID: number;
  VENDEDOR_NOME: string;
  EMAIL: string;
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
  ATUALIZADO_EM: string;
}

interface FilialRow {
  CODFILIAL: string;
  NOME_FILIAL: string;
}

interface SecaoRow {
  ID: number;
  NOME_SECAO: string;
}

interface VendedorRcaRow {
  USER_ID: number;
  USUARIO: string;
  EMAIL: string;
  COD_RCA: number | null;
}

interface RcaDepartamentoRow {
  ID: number;
  COD_RCA: number;
  COD_DEPARTAMENTO: string;
  DEPARTAMENTO_NOME: string | null;
  COD_FILIAL: string;
  FILIAL_NOME: string | null;
  ATIVO: number | boolean;
}

interface VinculoDepartamentoRow {
  ID: number;
  COD_RCA: number;
  COD_DEPARTAMENTO: string;
  DEPARTAMENTO_NOME: string | null;
  COD_FILIAL: string;
  FILIAL_NOME: string | null;
  VENDEDOR_ID: number;
  VENDEDOR_NOME: string;
  EMAIL: string;
}

interface BuForm {
  nome: string;
  ativo: boolean;
}

type BuModalMode = 'CRIAR' | 'EDITAR';

const PAGE_SIZE = 10;

const BU_FORM_DEFAULT: BuForm = {
  nome: '',
  ativo: true,
};

function toActiveFlag(value: number | boolean | null | undefined): boolean {
  if (typeof value === 'boolean') return value;
  return Number(value || 0) === 1;
}

export default function GestaoBuVendedoresPage() {
  const { toasts, addToast, removeToast } = useToast();

  const [loadingPage, setLoadingPage] = useState(true);
  const [canAccess, setCanAccess] = useState(false);
  const [cargoAtual, setCargoAtual] = useState('');

  const [loadingBus, setLoadingBus] = useState(false);
  const [loadingVinculos, setLoadingVinculos] = useState(false);
  const [savingBu, setSavingBu] = useState(false);
  const [savingVinculo, setSavingVinculo] = useState(false);

  const [buscaBu, setBuscaBu] = useState('');
  const [buscaVinculo, setBuscaVinculo] = useState('');
  const [busPage, setBusPage] = useState(0);
  const [vinculosPage, setVinculosPage] = useState(0);

  const [bus, setBus] = useState<BuRow[]>([]);
  const [totalBus, setTotalBus] = useState(0);

  const [vinculos, setVinculos] = useState<VinculoRow[]>([]);
  const [totalVinculos, setTotalVinculos] = useState(0);
  const [vendedoresRca, setVendedoresRca] = useState<VendedorRcaRow[]>([]);
  const vendedoresRcaRef = useRef<VendedorRcaRow[]>([]);
  const [vinculosDepartamento, setVinculosDepartamento] = useState<VinculoDepartamentoRow[]>([]);
  const [buscaVinculoDepartamento, setBuscaVinculoDepartamento] = useState('');

  const [busParaSelect, setBusParaSelect] = useState<BuRow[]>([]);
  const [vendedores, setVendedores] = useState<VendedorRow[]>([]);
  const [filiais, setFiliais] = useState<FilialRow[]>([]);
  const [secoesDisponiveis, setSecoesDisponiveis] = useState<SecaoRow[]>([]);

  const [buModalOpen, setBuModalOpen] = useState(false);
  const [buModalMode, setBuModalMode] = useState<BuModalMode>('CRIAR');
  const [editingBuId, setEditingBuId] = useState<number | null>(null);
  const [buForm, setBuForm] = useState<BuForm>(BU_FORM_DEFAULT);

  const [vinculoForm, setVinculoForm] = useState({
    buCodigo: '',
    vendedorId: '',
    codFilial: '',
    idSecao: '',
  });

  const [vinculoDepartamentoForm, setVinculoDepartamentoForm] = useState({
    buCodigo: '',
    vendedorId: '',
    codFilial: '',
    filialNome: '',
  });

  const buOptions = useMemo(() => {
    return [
      { value: '', label: 'Selecione a BU' },
      ...busParaSelect
        .filter((item) => toActiveFlag(item.ATIVO))
        .map((item) => ({
          value: String(item.CODIGO),
          label: `${item.CODIGO} - ${item.NOME}`,
        })),
    ];
  }, [busParaSelect]);

  const vendedorOptions = useMemo(() => {
    return [
      { value: '', label: 'Selecione o vendedor' },
      ...vendedores.map((item) => ({
        value: String(item.VENDEDOR_ID),
        label: `${item.VENDEDOR_NOME} (${item.VENDEDOR_ID})`,
      })),
    ];
  }, [vendedores]);

  const filialOptions = useMemo(() => {
    return [
      { value: '', label: 'Selecione a filial' },
      ...filiais.map((item) => ({
        value: String(item.CODFILIAL || ''),
        label: `${item.CODFILIAL} - ${item.NOME_FILIAL || `Filial ${item.CODFILIAL}`}`,
      })),
    ];
  }, [filiais]);

  const secaoOptions = useMemo(() => {
    return [
      { value: '', label: 'Selecione a seção' },
      ...secoesDisponiveis.map((item) => ({
        value: String(item.ID || ''),
        label: `${item.ID} - ${item.NOME_SECAO || `Seção ${item.ID}`}`,
      })),
    ];
  }, [secoesDisponiveis]);

  const vendedorRcaOptions = useMemo(() => {
    return [
      { value: '', label: 'Selecione o vendedor' },
      ...vendedoresRca
        .filter((item) => Number(item.COD_RCA || 0) > 0)
        .map((item) => ({
          value: String(item.USER_ID),
          label: `${item.USUARIO} (${item.USER_ID}) - RCA ${item.COD_RCA}`,
        })),
    ];
  }, [vendedoresRca]);

  const vinculosDepartamentoFiltrados = useMemo(() => {
    const termo = buscaVinculoDepartamento.trim().toLowerCase();
    if (!termo) return vinculosDepartamento;

    return vinculosDepartamento.filter((row) => (
      String(row.VENDEDOR_NOME || '').toLowerCase().includes(termo)
      || String(row.EMAIL || '').toLowerCase().includes(termo)
      || String(row.COD_RCA || '').includes(termo)
      || String(row.COD_DEPARTAMENTO || '').toLowerCase().includes(termo)
      || String(row.DEPARTAMENTO_NOME || '').toLowerCase().includes(termo)
      || String(row.COD_FILIAL || '').toLowerCase().includes(termo)
      || String(row.FILIAL_NOME || '').toLowerCase().includes(termo)
    ));
  }, [buscaVinculoDepartamento, vinculosDepartamento]);

  const busTotalPages = Math.max(1, Math.ceil(totalBus / PAGE_SIZE));
  const vinculosTotalPages = Math.max(1, Math.ceil(totalVinculos / PAGE_SIZE));

  const loadBuSelect = useCallback(async () => {
    const rows = await callSF(SF.adminListarBus, { busca: '', limit: '500', offset: '0' });
    setBusParaSelect(rows as BuRow[]);
  }, []);

  const loadBus = useCallback(async () => {
    setLoadingBus(true);
    const [listRows, countRow] = await Promise.all([
      callSF(SF.adminListarBus, {
        busca: buscaBu,
        limit: String(PAGE_SIZE),
        offset: String(busPage * PAGE_SIZE),
      }),
      callSFSingle(SF.adminContarBus, { busca: buscaBu }),
    ]);

    setBus(listRows as BuRow[]);
    setTotalBus(Number(countRow?.TOTAL || 0));
    setLoadingBus(false);
  }, [busPage, buscaBu]);

  const loadVinculos = useCallback(async () => {
    setLoadingVinculos(true);
    const [listRows, countRow] = await Promise.all([
      callSF(SF.adminListarVinculosBuVendedor, {
        busca: buscaVinculo,
        limit: String(PAGE_SIZE),
        offset: String(vinculosPage * PAGE_SIZE),
      }),
      callSFSingle(SF.adminContarVinculosBuVendedor, { busca: buscaVinculo }),
    ]);

    setVinculos(listRows as VinculoRow[]);
    setTotalVinculos(Number(countRow?.TOTAL || 0));
    setLoadingVinculos(false);
  }, [buscaVinculo, vinculosPage]);

  const loadVendedores = useCallback(async () => {
    const rows = await callSF(SF.adminListarVendedoresBu, {
      busca: '',
      limit: '500',
      offset: '0',
    });
    setVendedores(rows as VendedorRow[]);
  }, []);

  const loadFiliais = useCallback(async () => {
    const rows = await callSF(SF.listarFiliais);
    setFiliais(rows as FilialRow[]);
  }, []);

  const loadSecoesPorBu = useCallback(async (buCodigo: string) => {
    const buSelecionada = busParaSelect.find((item) => String(item.CODIGO) === String(buCodigo));
    if (!buSelecionada) {
      setSecoesDisponiveis([]);
      return;
    }

    const rows = await callSF(SF.listarSecoesDisponiveis, { idBu: String(buSelecionada.ID) });
    setSecoesDisponiveis(rows as SecaoRow[]);
  }, [busParaSelect]);

  const loadVendedoresRca = useCallback(async () => {
    const rows = await callSF(SF.listarVinculosVendedorRca);
    const parsed = rows as VendedorRcaRow[];
    setVendedoresRca(parsed);
    vendedoresRcaRef.current = parsed;
    return parsed;
  }, []);

  const loadVinculosDepartamento = useCallback(async (sourceRows?: VendedorRcaRow[]) => {
    const baseRows = (sourceRows || vendedoresRcaRef.current).filter((item) => Number(item.COD_RCA || 0) > 0);
    if (baseRows.length === 0) {
      setVinculosDepartamento([]);
      return;
    }

    const responses = await Promise.allSettled(
      baseRows.map((row) => callSF(SF.listarDepartamentosPorRca, {
        codRca: String(row.COD_RCA || ''),
        codDepartamento: '',
        codFilial: '',
        somenteAtivos: '1',
      })),
    );

    const merged: VinculoDepartamentoRow[] = [];

    responses.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;
      const vendedor = baseRows[index];
      const rows = result.value as RcaDepartamentoRow[];

      rows.forEach((row) => {
        merged.push({
          ID: Number(row.ID || 0),
          COD_RCA: Number(row.COD_RCA || vendedor.COD_RCA || 0),
          COD_DEPARTAMENTO: String(row.COD_DEPARTAMENTO || ''),
          DEPARTAMENTO_NOME: row.DEPARTAMENTO_NOME || null,
          COD_FILIAL: String(row.COD_FILIAL || ''),
          FILIAL_NOME: row.FILIAL_NOME || null,
          VENDEDOR_ID: Number(vendedor.USER_ID || 0),
          VENDEDOR_NOME: String(vendedor.USUARIO || '-'),
          EMAIL: String(vendedor.EMAIL || '-'),
        });
      });
    });

    merged.sort((a, b) => {
      const vendedorCmp = a.VENDEDOR_NOME.localeCompare(b.VENDEDOR_NOME, 'pt-BR');
      if (vendedorCmp !== 0) return vendedorCmp;
      const depCmp = a.COD_DEPARTAMENTO.localeCompare(b.COD_DEPARTAMENTO, 'pt-BR');
      if (depCmp !== 0) return depCmp;
      return a.COD_FILIAL.localeCompare(b.COD_FILIAL, 'pt-BR');
    });

    setVinculosDepartamento(merged);
  }, []);

  useEffect(() => {
    async function bootstrap() {
      setLoadingPage(true);

      const permissao = await callSFSingle(SF.painelGestaoPermissao);
      const podeAcessar = Number(permissao?.PODE_ACESSAR || 0) === 1;
      setCanAccess(podeAcessar);
      setCargoAtual(String(permissao?.CARGO_ATUAL || ''));

      if (podeAcessar) {
        const vendedoresRcaRows = await loadVendedoresRca();
        await Promise.all([
          loadBuSelect(),
          loadVendedores(),
          loadFiliais(),
          loadVinculosDepartamento(vendedoresRcaRows),
        ]);
      }

      setLoadingPage(false);
    }

    bootstrap();
  }, [loadBuSelect, loadFiliais, loadVendedores, loadVendedoresRca, loadVinculosDepartamento]);

  useEffect(() => {
    if (!canAccess || loadingPage) return;
    loadBus();
  }, [busPage, buscaBu, canAccess, loadingPage, loadBus]);

  useEffect(() => {
    if (!canAccess || loadingPage) return;
    loadVinculos();
  }, [vinculosPage, buscaVinculo, canAccess, loadingPage, loadVinculos]);

  useEffect(() => {
    if (!canAccess || loadingPage) return;
    if (!vinculoForm.buCodigo) {
      setSecoesDisponiveis([]);
      setVinculoForm((prev) => ({ ...prev, idSecao: '' }));
      return;
    }
    loadSecoesPorBu(vinculoForm.buCodigo);
  }, [canAccess, loadSecoesPorBu, loadingPage, vinculoForm.buCodigo]);

  function openCreateBu() {
    setBuModalMode('CRIAR');
    setEditingBuId(null);
    setBuForm(BU_FORM_DEFAULT);
    setBuModalOpen(true);
  }

  function openEditBu(row: BuRow) {
    setBuModalMode('EDITAR');
    setEditingBuId(Number(row.ID));
    setBuForm({
      nome: String(row.NOME || ''),
      ativo: toActiveFlag(row.ATIVO),
    });
    setBuModalOpen(true);
  }

  function closeBuModal() {
    if (savingBu) return;
    setBuModalOpen(false);
    setEditingBuId(null);
    setBuForm(BU_FORM_DEFAULT);
  }

  async function saveBu() {
    const nome = buForm.nome.trim();

    if (!nome) {
      addToast('error', 'Informe o nome da BU.');
      return;
    }

    setSavingBu(true);
    try {
      const payload = {
        nome,
        ativo: buForm.ativo ? '1' : '0',
      };

      const ok = buModalMode === 'CRIAR'
        ? await callSFMutation(SF.adminCriarBu, payload)
        : await callSFMutation(SF.adminAtualizarBu, { ...payload, buId: String(editingBuId) });

      if (!ok) {
        throw new Error('Falha ao salvar BU');
      }

      addToast('success', `BU ${buModalMode === 'CRIAR' ? 'criada' : 'atualizada'} com sucesso.`);
      closeBuModal();
      await Promise.all([loadBus(), loadBuSelect(), loadVinculos()]);
    } catch (error) {
      console.error(error);
      addToast('error', 'Não foi possível salvar a BU.');
    } finally {
      setSavingBu(false);
    }
  }

  async function toggleBuAtivo(row: BuRow) {
    const ok = await callSFMutation(SF.adminAtualizarBu, {
      buId: String(row.ID),
      nome: String(row.NOME),
      ativo: toActiveFlag(row.ATIVO) ? '0' : '1',
    });

    if (!ok) {
      addToast('error', 'Não foi possível alterar o status da BU.');
      return;
    }

    addToast('success', `BU ${toActiveFlag(row.ATIVO) ? 'inativada' : 'ativada'} com sucesso.`);
    await Promise.all([loadBus(), loadBuSelect()]);
  }

  async function vincularBuVendedor() {
    if (!vinculoForm.buCodigo) {
      addToast('error', 'Selecione a BU para vincular.');
      return;
    }
    if (!vinculoForm.vendedorId) {
      addToast('error', 'Selecione o vendedor para vincular.');
      return;
    }
    if (!vinculoForm.codFilial.trim()) {
      addToast('error', 'Selecione a filial para vincular o escopo.');
      return;
    }
    if (!vinculoForm.idSecao) {
      addToast('error', 'Selecione a seção para vincular o escopo.');
      return;
    }

    setSavingVinculo(true);
    try {
      const ok = await callSFMutation(SF.adminVincularBuVendedor, {
        buCodigo: vinculoForm.buCodigo,
        vendedorId: vinculoForm.vendedorId,
        codFilial: vinculoForm.codFilial,
        idSecao: vinculoForm.idSecao,
      });

      if (!ok) {
        throw new Error('Falha ao vincular BU ao vendedor');
      }

      addToast('success', 'Vínculo BU x vendedor salvo com sucesso.');
      setVinculoForm({ buCodigo: '', vendedorId: '', codFilial: '', idSecao: '' });
      setSecoesDisponiveis([]);
      await Promise.all([loadVinculos(), loadBus()]);
    } catch (error) {
      console.error(error);
      addToast('error', 'Não foi possível salvar o vínculo.');
    } finally {
      setSavingVinculo(false);
    }
  }

  async function vincularDepartamentoFilial() {
    const codFilial = vinculoDepartamentoForm.codFilial.trim();
    if (!vinculoDepartamentoForm.vendedorId) {
      addToast('error', 'Selecione o vendedor para vincular departamento e filial.');
      return;
    }
    if (!vinculoDepartamentoForm.buCodigo) {
      addToast('error', 'Selecione o departamento (BU) para vincular.');
      return;
    }
    if (!/^\d+$/.test(vinculoDepartamentoForm.buCodigo.trim())) {
      addToast('error', 'Use o código CODEPTO do TOTVS no departamento (ex.: 1, 2, 3).');
      return;
    }
    if (!codFilial) {
      addToast('error', 'Informe a filial TOTVS.');
      return;
    }

    const vendedor = vendedoresRca.find((item) => String(item.USER_ID) === vinculoDepartamentoForm.vendedorId);
    if (!vendedor || !vendedor.COD_RCA) {
      addToast('error', 'Este vendedor não possui RCA vinculado na governança.');
      return;
    }

    const departamento = busParaSelect.find((item) => String(item.CODIGO) === vinculoDepartamentoForm.buCodigo);

    setSavingVinculo(true);
    try {
      const ok = await callSFMutation(SF.vincularRcaDepartamento, {
        codRca: String(vendedor.COD_RCA),
        codDepartamento: vinculoDepartamentoForm.buCodigo,
        departamentoNome: String(departamento?.NOME || vinculoDepartamentoForm.buCodigo),
        codFilial,
        filialNome: vinculoDepartamentoForm.filialNome.trim(),
      });

      if (!ok) throw new Error('Falha ao vincular departamento e filial');

      const confirmRows = await callSF(SF.listarDepartamentosPorRca, {
        codRca: String(vendedor.COD_RCA),
        codDepartamento: vinculoDepartamentoForm.buCodigo,
        codFilial,
        somenteAtivos: '1',
      });

      if ((confirmRows as RcaDepartamentoRow[]).length === 0) {
        throw new Error('Vinculo nao persistido em RCA_DEPARTAMENTO');
      }

      addToast('success', 'Vendedor vinculado ao departamento e filial com sucesso.');
      setVinculoDepartamentoForm({
        buCodigo: '',
        vendedorId: '',
        codFilial: '',
        filialNome: '',
      });

      await loadVinculosDepartamento();
    } catch (error) {
      console.error(error);
      addToast('error', 'Não foi possível salvar o vínculo de departamento e filial.');
    } finally {
      setSavingVinculo(false);
    }
  }

  async function desvincularDepartamentoFilial(row: VinculoDepartamentoRow) {
    const ok = await callSFMutation(SF.desvincularRcaDepartamento, {
      codRca: String(row.COD_RCA),
      codDepartamento: String(row.COD_DEPARTAMENTO),
      codFilial: String(row.COD_FILIAL),
    });

    if (!ok) {
      addToast('error', 'Não foi possível desvincular este departamento/filial do vendedor.');
      return;
    }

    addToast('success', 'Vínculo de departamento/filial removido com sucesso.');
    await loadVinculosDepartamento();
  }

  async function desvincular(row: VinculoRow) {
    const ok = await callSFMutation(SF.adminDesvincularBuVendedor, { vinculoId: String(row.ID) });
    if (!ok) {
      addToast('error', 'Não foi possível desvincular este vendedor da BU.');
      return;
    }

    addToast('success', 'Vínculo removido com sucesso.');
    await Promise.all([loadVinculos(), loadBus()]);
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
        <h1 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>Gestão de BUs e Vendedores</h1>
        <p className="mt-3 text-lg" style={{ color: '#636d63' }}>
          Esta tela é exclusiva para perfis de gestão.
        </p>
        <p className="mt-2 text-sm" style={{ color: '#7b857b' }}>
          Perfil atual: <strong>{cargoAtual || 'NÃO DEFINIDO'}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-5xl font-extrabold" style={{ color: '#1b1c1a' }}>Gestão de BUs e Vendedores</h1>
          <p className="text-2xl mt-1" style={{ color: '#515b51' }}>
            Crie BUs, mantenha status ativo/inativo e vincule vendedores por unidade de negócio.
          </p>
        </div>
        <button className="btn-pill-primary px-5 py-2 text-sm font-semibold inline-flex items-center gap-2" onClick={openCreateBu}>
          <Plus size={14} /> Nova BU
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <section className="rounded-2xl p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>BUs cadastradas</h2>
            <div className="w-full md:w-[300px]">
              <Input
                value={buscaBu}
                onChange={(e) => {
                  setBuscaBu(e.target.value);
                  setBusPage(0);
                }}
                placeholder="Buscar por código ou nome"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #e5eadf', backgroundColor: '#ffffff' }}>
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="text-left text-xs" style={{ color: '#788378', backgroundColor: '#edf0eb' }}>
                  <th className="px-3 py-3">Código</th>
                  <th className="px-3 py-3">Nome</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Vendedores</th>
                  <th className="px-3 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loadingBus ? (
                  <tr>
                    <td className="px-3 py-6 text-sm" style={{ color: '#6a756a' }} colSpan={5}>Carregando BUs...</td>
                  </tr>
                ) : bus.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-sm" style={{ color: '#6a756a' }} colSpan={5}>Nenhuma BU encontrada.</td>
                  </tr>
                ) : (
                  bus.map((row) => (
                    <tr key={row.ID} style={{ borderTop: '1px solid #e6ebe1' }}>
                      <td className="px-3 py-3 text-sm font-semibold" style={{ color: '#2a312a' }}>{row.CODIGO}</td>
                      <td className="px-3 py-3 text-sm" style={{ color: '#4a564a' }}>{row.NOME}</td>
                      <td className="px-3 py-3 text-sm">
                        <span
                          className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{
                            backgroundColor: toActiveFlag(row.ATIVO) ? '#dff2e2' : '#ffe8e8',
                            color: toActiveFlag(row.ATIVO) ? '#1f6a30' : '#b43333',
                          }}
                        >
                          {toActiveFlag(row.ATIVO) ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm" style={{ color: '#4a564a' }}>{Number(row.TOTAL_VENDEDORES || 0)}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            className="w-8 h-8 rounded-lg inline-flex items-center justify-center"
                            style={{ backgroundColor: '#edf1ec', color: '#3f5f47' }}
                            onClick={() => openEditBu(row)}
                            title="Editar BU"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            className="h-8 px-3 rounded-lg text-xs font-semibold"
                            style={{
                              backgroundColor: toActiveFlag(row.ATIVO) ? '#ffe8e8' : '#dff2e2',
                              color: toActiveFlag(row.ATIVO) ? '#b43333' : '#1f6a30',
                            }}
                            onClick={() => toggleBuAtivo(row)}
                          >
                            {toActiveFlag(row.ATIVO) ? 'Inativar' : 'Ativar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm" style={{ color: '#5e695e' }}>
            <span>Página {busPage + 1} de {busTotalPages}</span>
            <div className="flex gap-2">
              <button
                className="h-8 px-3 rounded-lg"
                style={{ backgroundColor: '#edf2ee', color: '#4b5c4b' }}
                onClick={() => setBusPage((p) => Math.max(0, p - 1))}
                disabled={busPage === 0}
              >
                Anterior
              </button>
              <button
                className="h-8 px-3 rounded-lg"
                style={{ backgroundColor: '#edf2ee', color: '#4b5c4b' }}
                onClick={() => setBusPage((p) => (p + 1 < busTotalPages ? p + 1 : p))}
                disabled={busPage + 1 >= busTotalPages}
              >
                Próxima
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
          <h2 className="font-display text-3xl font-extrabold mb-3" style={{ color: '#1b1c1a' }}>Vincular BU ao vendedor</h2>
          <p className="text-xs mb-2" style={{ color: '#6f796f' }}>
            Esta seção é administrativa de BU geral e não grava na tabela <strong>RCA_DEPARTAMENTO</strong>.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <Select
              label="BU"
              value={vinculoForm.buCodigo}
              options={buOptions}
              onChange={(value) => setVinculoForm((prev) => ({ ...prev, buCodigo: value, idSecao: '' }))}
            />
            <Select
              label="Vendedor"
              value={vinculoForm.vendedorId}
              options={vendedorOptions}
              onChange={(value) => setVinculoForm((prev) => ({ ...prev, vendedorId: value }))}
            />
            <Select
              label="Filial"
              value={vinculoForm.codFilial}
              options={filialOptions}
              onChange={(value) => setVinculoForm((prev) => ({ ...prev, codFilial: value }))}
            />
            <Select
              label="Seção"
              value={vinculoForm.idSecao}
              options={secaoOptions}
              onChange={(value) => setVinculoForm((prev) => ({ ...prev, idSecao: value }))}
            />
          </div>

          <div className="mt-3 flex justify-end">
            <button
              className="h-10 px-4 rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: '#137432' }}
              onClick={vincularBuVendedor}
              disabled={savingVinculo}
            >
              {savingVinculo ? 'Salvando...' : 'Salvar vínculo'}
            </button>
          </div>

          <div className="mt-4 mb-3">
            <Input
              value={buscaVinculo}
              onChange={(e) => {
                setBuscaVinculo(e.target.value);
                setVinculosPage(0);
              }}
              placeholder="Buscar vínculo por BU, vendedor ou e-mail"
            />
          </div>

          <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #e5eadf', backgroundColor: '#ffffff' }}>
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="text-left text-xs" style={{ color: '#788378', backgroundColor: '#edf0eb' }}>
                  <th className="px-3 py-3">BU</th>
                  <th className="px-3 py-3">Filial</th>
                  <th className="px-3 py-3">Seção</th>
                  <th className="px-3 py-3">Vendedor</th>
                  <th className="px-3 py-3">E-mail</th>
                  <th className="px-3 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loadingVinculos ? (
                  <tr>
                    <td className="px-3 py-6 text-sm" style={{ color: '#6a756a' }} colSpan={6}>Carregando vínculos...</td>
                  </tr>
                ) : vinculos.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-sm" style={{ color: '#6a756a' }} colSpan={6}>Nenhum vínculo ativo encontrado.</td>
                  </tr>
                ) : (
                  vinculos.map((row) => (
                    <tr key={row.ID} style={{ borderTop: '1px solid #e6ebe1' }}>
                      <td className="px-3 py-3 text-sm" style={{ color: '#2a312a' }}>
                        <span className="font-semibold">{row.BU_CODIGO}</span>
                        <span style={{ color: '#6e786e' }}> - {row.BU_NOME || row.BU_CODIGO}</span>
                      </td>
                      <td className="px-3 py-3 text-sm" style={{ color: '#4a564a' }}>{row.CODFILIAL || '-'}</td>
                      <td className="px-3 py-3 text-sm" style={{ color: '#4a564a' }}>
                        {row.ID_SECAO ? `${row.ID_SECAO} - ${row.NOME_SECAO || `Seção ${row.ID_SECAO}`}` : '-'}
                      </td>
                      <td className="px-3 py-3 text-sm" style={{ color: '#4a564a' }}>{row.VENDEDOR_NOME} ({row.VENDEDOR_ID})</td>
                      <td className="px-3 py-3 text-sm" style={{ color: '#4a564a' }}>{row.EMAIL || '-'}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end">
                          <button
                            className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                            style={{ backgroundColor: '#ffe8e8', color: '#b43333' }}
                            onClick={() => desvincular(row)}
                          >
                            <Trash2 size={12} /> Desvincular
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm" style={{ color: '#5e695e' }}>
            <span>Página {vinculosPage + 1} de {vinculosTotalPages}</span>
            <div className="flex gap-2">
              <button
                className="h-8 px-3 rounded-lg"
                style={{ backgroundColor: '#edf2ee', color: '#4b5c4b' }}
                onClick={() => setVinculosPage((p) => Math.max(0, p - 1))}
                disabled={vinculosPage === 0}
              >
                Anterior
              </button>
              <button
                className="h-8 px-3 rounded-lg"
                style={{ backgroundColor: '#edf2ee', color: '#4b5c4b' }}
                onClick={() => setVinculosPage((p) => (p + 1 < vinculosTotalPages ? p + 1 : p))}
                disabled={vinculosPage + 1 >= vinculosTotalPages}
              >
                Próxima
              </button>
            </div>
          </div>

          <p className="text-xs mt-3" style={{ color: '#6f796f' }}>
            <Link2 size={12} className="inline-block mr-1" />
            O vínculo BU x vendedor é reutilizável nas regras de carteira e governança comercial.
          </p>
        </section>
      </div>

      <section className="rounded-2xl p-4 mt-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <h2 className="font-display text-3xl font-extrabold mb-1" style={{ color: '#1b1c1a' }}>
          Vincular vendedor ao departamento e filial
        </h2>
        <p className="text-sm mb-3" style={{ color: '#5f6a5f' }}>
          Use o código <strong>CODEPTO</strong> do TOTVS e informe a filial para salvar em <strong>RCA_DEPARTAMENTO</strong>.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <Select
            label="Vendedor"
            value={vinculoDepartamentoForm.vendedorId}
            options={vendedorRcaOptions}
            onChange={(value) => setVinculoDepartamentoForm((prev) => ({ ...prev, vendedorId: value }))}
          />
          <Select
            label="Departamento (BU)"
            value={vinculoDepartamentoForm.buCodigo}
            options={buOptions}
            onChange={(value) => setVinculoDepartamentoForm((prev) => ({ ...prev, buCodigo: value }))}
          />
          <Input
            label="Filial TOTVS"
            value={vinculoDepartamentoForm.codFilial}
            onChange={(e) => setVinculoDepartamentoForm((prev) => ({ ...prev, codFilial: e.target.value }))}
            placeholder="Ex.: 1"
          />
          <Input
            label="Nome da filial (opcional)"
            value={vinculoDepartamentoForm.filialNome}
            onChange={(e) => setVinculoDepartamentoForm((prev) => ({ ...prev, filialNome: e.target.value }))}
            placeholder="Ex.: Matriz"
          />
        </div>

        <div className="mt-3 flex justify-end">
          <button
            className="h-10 px-4 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: '#137432' }}
            onClick={vincularDepartamentoFilial}
            disabled={savingVinculo}
          >
            {savingVinculo ? 'Salvando...' : 'Salvar vínculo de departamento/filial'}
          </button>
        </div>

        <div className="mt-4 mb-3">
          <Input
            value={buscaVinculoDepartamento}
            onChange={(e) => setBuscaVinculoDepartamento(e.target.value)}
            placeholder="Buscar por vendedor, RCA, departamento, filial ou e-mail"
          />
        </div>

        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid #e5eadf', backgroundColor: '#ffffff' }}>
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="text-left text-xs" style={{ color: '#788378', backgroundColor: '#edf0eb' }}>
                <th className="px-3 py-3">Vendedor</th>
                <th className="px-3 py-3">RCA</th>
                <th className="px-3 py-3">Departamento</th>
                <th className="px-3 py-3">Filial</th>
                <th className="px-3 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {vinculosDepartamentoFiltrados.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-sm" style={{ color: '#6a756a' }} colSpan={5}>
                    Nenhum vínculo de departamento/filial encontrado.
                  </td>
                </tr>
              ) : (
                vinculosDepartamentoFiltrados.map((row) => (
                  <tr key={`${row.ID}-${row.VENDEDOR_ID}`} style={{ borderTop: '1px solid #e6ebe1' }}>
                    <td className="px-3 py-3 text-sm" style={{ color: '#2a312a' }}>
                      <span className="font-semibold">{row.VENDEDOR_NOME}</span>
                      <span style={{ color: '#6e786e' }}> ({row.VENDEDOR_ID})</span>
                    </td>
                    <td className="px-3 py-3 text-sm" style={{ color: '#4a564a' }}>{row.COD_RCA}</td>
                    <td className="px-3 py-3 text-sm" style={{ color: '#4a564a' }}>
                      <span className="font-semibold">{row.COD_DEPARTAMENTO}</span>
                      <span style={{ color: '#6e786e' }}> - {row.DEPARTAMENTO_NOME || row.COD_DEPARTAMENTO}</span>
                    </td>
                    <td className="px-3 py-3 text-sm" style={{ color: '#4a564a' }}>
                      <span className="font-semibold">{row.COD_FILIAL}</span>
                      <span style={{ color: '#6e786e' }}> - {row.FILIAL_NOME || '-'}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end">
                        <button
                          className="h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                          style={{ backgroundColor: '#ffe8e8', color: '#b43333' }}
                          onClick={() => desvincularDepartamentoFilial(row)}
                        >
                          <Trash2 size={12} /> Desvincular
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {buModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22,30,23,0.35)' }}>
          <div className="w-full max-w-[560px] rounded-2xl p-5 animate-scaleIn" style={{ backgroundColor: '#ffffff', border: '1px solid #e3e8de' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>
                  {buModalMode === 'CRIAR' ? 'Nova BU' : 'Editar BU'}
                </h3>
                <p className="text-sm mt-1" style={{ color: '#6a756a' }}>
                  Defina nome e status da unidade de negócio.
                </p>
              </div>
              <button
                onClick={closeBuModal}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ backgroundColor: '#edf2ee', color: '#607060' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <Input
                label="Nome"
                value={buForm.nome}
                onChange={(e) => setBuForm((prev) => ({ ...prev, nome: e.target.value }))}
                placeholder="Nome descritivo da BU"
                maxLength={150}
              />
            </div>

            {buModalMode === 'CRIAR' ? (
              <p className="mt-2 text-xs" style={{ color: '#6f796f' }}>
                O código da BU será gerado automaticamente ao salvar.
              </p>
            ) : null}

            <div className="mt-3 max-w-[180px]">
              <Select
                label="Status"
                value={buForm.ativo ? '1' : '0'}
                options={[
                  { value: '1', label: 'Ativa' },
                  { value: '0', label: 'Inativa' },
                ]}
                onChange={(value) => setBuForm((prev) => ({ ...prev, ativo: value === '1' }))}
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={closeBuModal}
                className="h-10 px-4 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: '#edf2ee', color: '#4b5c4b' }}
              >
                Cancelar
              </button>
              <button
                onClick={saveBu}
                disabled={savingBu}
                className="h-10 px-4 rounded-lg text-sm font-semibold text-white disabled:opacity-70"
                style={{ backgroundColor: '#137432' }}
              >
                {savingBu ? 'Salvando...' : 'Salvar BU'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
