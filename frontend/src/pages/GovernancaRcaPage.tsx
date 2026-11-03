import { useEffect, useMemo, useState } from 'react';
import { Link2, ShieldCheck, UserCog2, X } from 'lucide-react';
import { callSF, callSFMutation, callSFSingle, SF } from '../hooks/useMitra';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';
import Select from '../components/ui/Select';

interface VinculoRow {
  USER_ID: number;
  USUARIO: string;
  EMAIL: string;
  COD_RCA: number | null;
  RCA_NOME: string | null;
  COD_SUPERVISOR: number | null;
  SUPERVISOR_NOME: string | null;
}

interface RcaRow {
  COD_RCA: number;
  RCA_NOME: string;
  SUPERVISOR_NOME: string;
  COD_SUPERVISOR: number | null;
}

interface AuditoriaRow {
  ID: number;
  USUARIO: string;
  COD_RCA_ANTERIOR: number | null;
  RCA_ANTERIOR_NOME: string | null;
  COD_RCA_NOVO: number | null;
  RCA_NOVO_NOME: string | null;
  COD_SUPERVISOR_ANTERIOR: number | null;
  SUPERVISOR_ANTERIOR_NOME: string | null;
  COD_SUPERVISOR_NOVO: number | null;
  SUPERVISOR_NOVO_NOME: string | null;
  ALTERADO_POR_USUARIO: string;
  ALTERADO_EM: string;
  OBSERVACAO: string | null;
}

interface EditState {
  userId: number;
  usuario: string;
  codRcaAnterior: string;
  codSupervisorAnterior: string;
  codRcaNovo: string;
  codSupervisorNovo: string;
}

function fmtDateTime(value: string) {
  if (!value) return '-';
  const [date, time] = value.split(' ');
  if (!date || !time) return value;
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y} ${time}`;
}

export default function GovernancaRcaPage() {
  const { toasts, addToast, removeToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [canAccess, setCanAccess] = useState(false);
  const [cargoAtual, setCargoAtual] = useState('');

  const [vinculos, setVinculos] = useState<VinculoRow[]>([]);
  const [rcas, setRcas] = useState<RcaRow[]>([]);
  const [auditoria, setAuditoria] = useState<AuditoriaRow[]>([]);
  const [query, setQuery] = useState('');

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);

  const rcaOptions = useMemo(() => {
    return [
      { value: '', label: 'Sem vínculo' },
      ...rcas.map((item) => ({
        value: String(item.COD_RCA),
        label: `${item.COD_RCA} - ${item.RCA_NOME}`,
      })),
    ];
  }, [rcas]);

  const supervisorOptions = useMemo(() => {
    return [
      { value: '', label: 'Sem supervisor' },
      ...rcas.map((item) => ({
        value: String(item.COD_RCA),
        label: `${item.COD_RCA} - ${item.RCA_NOME}`,
      })),
    ];
  }, [rcas]);

  const filteredVinculos = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vinculos;
    return vinculos.filter((row) => {
      return (
        String(row.USER_ID).includes(q)
        || String(row.USUARIO || '').toLowerCase().includes(q)
        || String(row.EMAIL || '').toLowerCase().includes(q)
        || String(row.COD_RCA || '').includes(q)
        || String(row.RCA_NOME || '').toLowerCase().includes(q)
      );
    });
  }, [query, vinculos]);

  async function loadAll() {
    const [perm, vRows, rRows, aRows] = await Promise.allSettled([
      callSFSingle(SF.painelGestaoPermissao),
      callSF(SF.listarVinculosVendedorRca),
      callSF(SF.listarRcasTotvs),
      callSF(SF.listarAuditoriaVinculoRca, { limit: '80', offset: '0' }),
    ]);

    if (perm.status === 'fulfilled' && perm.value) {
      setCanAccess(Number(perm.value.PODE_ACESSAR || 0) === 1);
      setCargoAtual(String(perm.value.CARGO_ATUAL || ''));
    }

    if (vRows.status === 'fulfilled') setVinculos(vRows.value as VinculoRow[]);
    if (rRows.status === 'fulfilled') setRcas(rRows.value as RcaRow[]);
    if (aRows.status === 'fulfilled') setAuditoria(aRows.value as AuditoriaRow[]);
  }

  useEffect(() => {
    async function bootstrap() {
      setLoading(true);
      await loadAll();
      setLoading(false);
    }
    bootstrap();
  }, []);

  function openEditModal(row: VinculoRow) {
    setEdit({
      userId: row.USER_ID,
      usuario: row.USUARIO,
      codRcaAnterior: row.COD_RCA ? String(row.COD_RCA) : '',
      codSupervisorAnterior: row.COD_SUPERVISOR ? String(row.COD_SUPERVISOR) : '',
      codRcaNovo: row.COD_RCA ? String(row.COD_RCA) : '',
      codSupervisorNovo: row.COD_SUPERVISOR ? String(row.COD_SUPERVISOR) : '',
    });
    setEditOpen(true);
  }

  function closeEditModal() {
    if (saving) return;
    setEditOpen(false);
    setEdit(null);
  }

  async function saveEdit() {
    if (!edit) return;

    if (!edit.codRcaNovo) {
      addToast('error', 'Selecione um RCA para vincular o usuário.');
      return;
    }

    setSaving(true);
    try {
      const okVinculo = await callSFMutation(SF.vincularVendedorRca, {
        userId: String(edit.userId),
        codRca: edit.codRcaNovo,
        codSupervisor: edit.codSupervisorNovo,
      });

      if (!okVinculo) {
        throw new Error('Falha ao salvar vínculo');
      }

      await callSFMutation(SF.registrarAuditoriaVinculoRca, {
        userId: String(edit.userId),
        codRcaAnterior: edit.codRcaAnterior,
        codRcaNovo: edit.codRcaNovo,
        codSupervisorAnterior: edit.codSupervisorAnterior,
        codSupervisorNovo: edit.codSupervisorNovo,
        observacao: 'Ajuste manual na governança RCA',
      });

      addToast('success', 'Vínculo RCA salvo com sucesso.');
      closeEditModal();
      await loadAll();
    } catch (error) {
      console.error(error);
      addToast('error', 'Não foi possível salvar o vínculo. Verifique se o RCA já está vinculado a outro usuário.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '3px solid #d5dbd3', borderTopColor: '#137432' }} />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="animate-fadeIn rounded-3xl p-8" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <h1 className="font-display text-4xl font-extrabold" style={{ color: '#1b1c1a' }}>Governança de Vínculos RCA</h1>
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

      <div className="mb-5">
        <h1 className="font-display text-5xl font-extrabold" style={{ color: '#1b1c1a' }}>Governança de Vínculos RCA</h1>
        <p className="text-2xl mt-1" style={{ color: '#515b51' }}>
          Controle de associação entre usuário, RCA e RCA do supervisor com trilha de auditoria.
        </p>
      </div>

      <div className="rounded-2xl p-4 mb-5" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Vínculos atuais</h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por usuário, e-mail, código RCA..."
            className="h-10 px-3 rounded-xl text-sm min-w-[290px]"
            style={{ border: '1px solid #d7dfd3', backgroundColor: '#ffffff', color: '#314031' }}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="text-left text-xs" style={{ color: '#788378' }}>
                <th className="px-3 py-3">Usuário</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">RCA</th>
                <th className="px-3 py-3">Supervisor (RCA)</th>
                <th className="px-3 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredVinculos.map((row) => (
                <tr key={row.USER_ID} style={{ borderTop: '1px solid #e6ebe1' }}>
                  <td className="px-3 py-3 text-sm font-semibold" style={{ color: '#2a312a' }}>{row.USUARIO}</td>
                  <td className="px-3 py-3 text-sm" style={{ color: '#5a665a' }}>{row.EMAIL}</td>
                  <td className="px-3 py-3 text-sm" style={{ color: '#334233' }}>
                    {row.COD_RCA ? `${row.COD_RCA} - ${row.RCA_NOME || ''}` : 'Sem vínculo'}
                  </td>
                  <td className="px-3 py-3 text-sm" style={{ color: '#334233' }}>
                    {row.COD_SUPERVISOR ? `${row.COD_SUPERVISOR} - ${row.SUPERVISOR_NOME || ''}` : 'Sem supervisor'}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      onClick={() => openEditModal(row)}
                      className="h-9 px-3 rounded-lg text-xs font-semibold flex items-center gap-2"
                      style={{ backgroundColor: '#eaf1eb', color: '#1f6f39' }}
                    >
                      <UserCog2 size={14} /> Editar vínculo
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ backgroundColor: '#f8faf7', border: '1px solid #e3e8de' }}>
        <h2 className="font-display text-3xl font-extrabold mb-3" style={{ color: '#1b1c1a' }}>Auditoria de alterações</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]">
            <thead>
              <tr className="text-left text-xs" style={{ color: '#788378' }}>
                <th className="px-3 py-3">Quando</th>
                <th className="px-3 py-3">Usuário</th>
                <th className="px-3 py-3">RCA anterior</th>
                <th className="px-3 py-3">RCA novo</th>
                <th className="px-3 py-3">Supervisor anterior</th>
                <th className="px-3 py-3">Supervisor novo</th>
                <th className="px-3 py-3">Alterado por</th>
                <th className="px-3 py-3">Observação</th>
              </tr>
            </thead>
            <tbody>
              {auditoria.map((item) => (
                <tr key={item.ID} style={{ borderTop: '1px solid #e6ebe1' }}>
                  <td className="px-3 py-3 text-sm" style={{ color: '#4a564a' }}>{fmtDateTime(item.ALTERADO_EM)}</td>
                  <td className="px-3 py-3 text-sm font-semibold" style={{ color: '#2a312a' }}>{item.USUARIO}</td>
                  <td className="px-3 py-3 text-sm" style={{ color: '#5a665a' }}>{item.COD_RCA_ANTERIOR ? `${item.COD_RCA_ANTERIOR} - ${item.RCA_ANTERIOR_NOME || ''}` : '-'}</td>
                  <td className="px-3 py-3 text-sm" style={{ color: '#1f6f39' }}>{item.COD_RCA_NOVO ? `${item.COD_RCA_NOVO} - ${item.RCA_NOVO_NOME || ''}` : '-'}</td>
                  <td className="px-3 py-3 text-sm" style={{ color: '#5a665a' }}>{item.COD_SUPERVISOR_ANTERIOR ? `${item.COD_SUPERVISOR_ANTERIOR} - ${item.SUPERVISOR_ANTERIOR_NOME || ''}` : '-'}</td>
                  <td className="px-3 py-3 text-sm" style={{ color: '#1f6f39' }}>{item.COD_SUPERVISOR_NOVO ? `${item.COD_SUPERVISOR_NOVO} - ${item.SUPERVISOR_NOVO_NOME || ''}` : '-'}</td>
                  <td className="px-3 py-3 text-sm" style={{ color: '#4a564a' }}>{item.ALTERADO_POR_USUARIO || '-'}</td>
                  <td className="px-3 py-3 text-sm" style={{ color: '#4a564a' }}>{item.OBSERVACAO || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editOpen && edit ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(22,30,23,0.35)' }}>
          <div className="w-full max-w-[640px] rounded-2xl p-5 animate-scaleIn" style={{ backgroundColor: '#ffffff', border: '1px solid #e3e8de' }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Editar vínculo RCA</h3>
                <p className="text-sm mt-1" style={{ color: '#6a756a' }}>{edit.usuario}</p>
              </div>
              <button
                onClick={closeEditModal}
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{ backgroundColor: '#edf2ee', color: '#607060' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="RCA"
                options={rcaOptions}
                value={edit.codRcaNovo}
                onChange={(value) => {
                  const found = rcas.find((r) => String(r.COD_RCA) === value);
                  setEdit((prev) => (prev ? {
                    ...prev,
                    codRcaNovo: value,
                    codSupervisorNovo: found?.COD_SUPERVISOR ? String(found.COD_SUPERVISOR) : prev.codSupervisorNovo,
                  } : prev));
                }}
              />

              <Select
                label="RCA do Supervisor"
                options={supervisorOptions}
                value={edit.codSupervisorNovo}
                onChange={(value) => setEdit((prev) => (prev ? { ...prev, codSupervisorNovo: value } : prev))}
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={closeEditModal}
                className="h-10 px-4 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: '#edf2ee', color: '#4b5c4b' }}
              >
                Cancelar
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="h-10 px-4 rounded-lg text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-70"
                style={{ backgroundColor: '#137432' }}
              >
                <ShieldCheck size={15} /> {saving ? 'Salvando...' : 'Salvar vínculo'}
              </button>
            </div>

            <p className="text-xs mt-3" style={{ color: '#6f796f' }}>
              <Link2 size={12} className="inline-block mr-1" />
              Regra ativa: cada `COD_RCA` pode estar vinculado a apenas um usuário.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
