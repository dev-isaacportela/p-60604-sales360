import { useEffect, useState } from 'react';
import { Eye, EyeOff, Megaphone, Pencil, Plus, ShieldAlert, Trash2, Users } from 'lucide-react';
import { callSF, callSFMutation, callSFSingle, formatServerDateTimeBrasilia, SF } from '../hooks/useMitra';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import RichTextEditor, { richTextToPlainText } from '../components/ui/RichTextEditor';
import { ConteudoNota, JanelaNotas, tipoNota, TIPOS_NOTA, type NotaDeVersao } from '../components/ReleaseNotesPopup';
import { htmlDaNota, limparHtmlNota } from '../lib/notaVersaoHtml';

interface NotaGestao extends NotaDeVersao {
  PUBLICADO: boolean | number;
  CRIADO_EM?: string;
  ATUALIZADO_EM?: string;
  AUTOR?: string;
  LEITURAS?: number;
}

interface Formulario {
  id: number;
  versao: string;
  tipo: string;
  titulo: string;
  conteudo: string;
}

const VAZIO: Formulario = { id: 0, versao: '', tipo: 'NOVIDADE', titulo: '', conteudo: '' };

const campo = 'w-full rounded-xl border px-3 py-2.5 text-[15px] outline-none';
const campoStyle = { backgroundColor: 'var(--color-surface-lowest)', borderColor: 'var(--color-surface-highest)', color: 'var(--color-text)' };

function publicada(nota: NotaGestao) {
  return nota.PUBLICADO === true || Number(nota.PUBLICADO) === 1;
}

export default function ReleaseNotesPage() {
  const [carregando, setCarregando] = useState(true);
  const [permitido, setPermitido] = useState(false);
  const [notas, setNotas] = useState<NotaGestao[]>([]);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [previa, setPrevia] = useState<NotaDeVersao[] | null>(null);
  const [excluir, setExcluir] = useState<NotaGestao | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const { toasts, addToast, removeToast } = useToast();

  async function carregarNotas() {
    const rows = await callSF(SF.releaseNotesGestaoListar);
    setNotas(rows as NotaGestao[]);
  }

  useEffect(() => {
    async function load() {
      setCarregando(true);
      try {
        const permissao = await callSFSingle(SF.suportePainelPermissao);
        const pode = Number(permissao?.PODE_ACESSAR || 0) === 1;
        setPermitido(pode);
        if (pode) await carregarNotas();
      } finally {
        setCarregando(false);
      }
    }
    load();
  }, []);

  async function salvar(publicar: boolean, nota: Formulario = form) {
    const conteudo = limparHtmlNota(htmlDaNota(nota.conteudo));
    if (!nota.titulo.trim() || !richTextToPlainText(conteudo)) {
      addToast('error', 'Preencha o título e o conteúdo da nota.');
      return;
    }
    setSalvando(true);
    const ok = await callSFMutation(SF.releaseNotesSalvar, {
      id: nota.id,
      versao: nota.versao.trim(),
      tipo: nota.tipo,
      titulo: nota.titulo.trim(),
      conteudo,
      publicar: publicar ? 1 : 0,
    });
    setSalvando(false);
    if (!ok) {
      addToast('error', 'Não foi possível salvar a nota. Tente novamente.');
      return;
    }
    addToast('success', publicar ? 'Nota publicada: aparece no próximo acesso de cada usuário.' : 'Rascunho salvo.');
    if (nota === form) setForm(VAZIO);
    await carregarNotas();
  }

  function editar(nota: NotaGestao) {
    setForm({ id: nota.ID, versao: nota.VERSAO || '', tipo: nota.TIPO || 'NOVIDADE', titulo: nota.TITULO, conteudo: htmlDaNota(nota.CONTEUDO) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function alternarPublicacao(nota: NotaGestao) {
    void salvar(!publicada(nota), { id: nota.ID, versao: nota.VERSAO || '', tipo: nota.TIPO || 'NOVIDADE', titulo: nota.TITULO, conteudo: nota.CONTEUDO });
  }

  async function confirmarExclusao() {
    if (!excluir) return;
    setExcluindo(true);
    const ok = await callSFMutation(SF.releaseNotesExcluir, { id: excluir.ID });
    setExcluindo(false);
    setExcluir(null);
    if (!ok) {
      addToast('error', 'Não foi possível excluir a nota.');
      return;
    }
    if (form.id === excluir.ID) setForm(VAZIO);
    addToast('success', 'Nota excluída.');
    await carregarNotas();
  }

  if (carregando) {
    return <div className="rounded-[28px] border p-6" style={{ backgroundColor: 'var(--color-surface-lowest)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>Carregando notas de versão...</div>;
  }

  if (!permitido) {
    return (
      <div className="mx-auto max-w-2xl rounded-[28px] border p-8 text-center" style={{ backgroundColor: 'var(--color-surface-lowest)', borderColor: 'var(--color-border)' }}>
        <ShieldAlert className="mx-auto" size={42} style={{ color: 'var(--color-despesa)' }} />
        <h1 className="mt-4 font-display text-3xl font-extrabold" style={{ color: 'var(--color-text)' }}>Acesso restrito</h1>
        <p className="mt-2" style={{ color: 'var(--color-text-secondary)' }}>O cadastro de notas de versão é exclusivo da equipe técnica.</p>
      </div>
    );
  }

  const publicadas = notas.filter(publicada).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <section className="rounded-[28px] border p-6 shadow-sm" style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
        <p className="text-sm font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--color-text-secondary)' }}>Painel de desenvolvedor</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold" style={{ color: 'var(--brand)' }}>Notas de versão</h1>
        <p className="mt-2 max-w-3xl" style={{ color: 'var(--color-text-secondary)' }}>
          Cadastre as atualizações do sistema. Ao publicar, a nota aparece num popup para cada usuário no próximo acesso, uma vez só.
          {' '}{publicadas} publicada{publicadas === 1 ? '' : 's'} · {notas.length - publicadas} rascunho{notas.length - publicadas === 1 ? '' : 's'}.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <section className="h-fit rounded-[28px] border p-5 shadow-sm" style={{ backgroundColor: 'var(--color-surface-lowest)', borderColor: 'var(--color-border)' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold" style={{ color: 'var(--color-text)' }}>{form.id ? 'Editar nota' : 'Nova nota'}</h2>
            {form.id ? (
              <button onClick={() => setForm(VAZIO)} className="inline-flex items-center gap-1 text-sm font-bold" style={{ color: 'var(--color-primary)' }}><Plus size={16} /> Nova</button>
            ) : null}
          </div>

          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-bold" style={{ color: 'var(--color-text-secondary)' }}>Versão</span>
                <input className={`${campo} mt-1`} style={campoStyle} placeholder="ex.: v0.8.0" maxLength={30} value={form.versao} onChange={(e) => setForm({ ...form, versao: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-sm font-bold" style={{ color: 'var(--color-text-secondary)' }}>Tipo</span>
                <select className={`${campo} mt-1`} style={campoStyle} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                  {Object.entries(TIPOS_NOTA).map(([valor, t]) => <option key={valor} value={valor}>{t.rotulo}</option>)}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-bold" style={{ color: 'var(--color-text-secondary)' }}>Título</span>
              <input className={`${campo} mt-1`} style={campoStyle} placeholder="ex.: Relato avulso no histórico do cliente" maxLength={200} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            </label>
            <div>
              <span className="text-sm font-bold" style={{ color: 'var(--color-text-secondary)' }}>O que mudou</span>
              <RichTextEditor
                key={form.id}
                className="mt-1"
                comSubtitulo
                minHeight={260}
                placeholder="Use Título para as seções (Novidades, Melhorias), Subtítulo para cada item e listas para os detalhes. Colar do Word ou Google Docs mantém a formatação."
                value={form.conteudo}
                onChange={(conteudo) => setForm((atual) => ({ ...atual, conteudo }))}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button disabled={salvando} onClick={() => salvar(true)} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>
                <Megaphone size={16} /> {salvando ? 'Salvando...' : 'Publicar'}
              </button>
              <button disabled={salvando} onClick={() => salvar(false)} className="rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-50" style={{ borderColor: 'var(--color-surface-highest)', color: 'var(--color-text)' }}>
                Salvar rascunho
              </button>
              <button
                disabled={!form.titulo.trim() || !richTextToPlainText(form.conteudo)}
                onClick={() => setPrevia([{ ID: form.id || -1, VERSAO: form.versao, TIPO: form.tipo, TITULO: form.titulo, CONTEUDO: limparHtmlNota(htmlDaNota(form.conteudo)) }])}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ color: 'var(--color-primary)' }}
              >
                <Eye size={16} /> Pré-visualizar
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          {notas.length === 0 ? (
            <div className="rounded-[28px] border p-8 text-center" style={{ backgroundColor: 'var(--color-surface-lowest)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
              Nenhuma nota cadastrada ainda. Escreva a primeira ao lado.
            </div>
          ) : notas.map((nota) => {
            const tipo = tipoNota(nota.TIPO);
            const noAr = publicada(nota);
            return (
              <article key={nota.ID} className="rounded-[28px] border p-5 shadow-sm" style={{ backgroundColor: 'var(--color-surface-lowest)', borderColor: form.id === nota.ID ? 'var(--color-primary)' : 'var(--color-border)' }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full px-3 py-1 text-xs font-bold" style={noAr ? { backgroundColor: 'var(--color-primary-bg)', color: 'var(--color-primary)' } : { backgroundColor: 'var(--color-surface-container)', color: 'var(--color-text-secondary)' }}>
                    {noAr ? 'Publicada' : 'Rascunho'}
                  </span>
                  <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: tipo.bg, color: tipo.fg }}>{tipo.rotulo}</span>
                  {nota.VERSAO ? <span className="text-sm font-bold" style={{ color: 'var(--color-text-secondary)' }}>{nota.VERSAO}</span> : null}
                  <div className="ml-auto flex items-center gap-1">
                    <button title="Pré-visualizar" onClick={() => setPrevia([nota])} className="rounded-lg p-2" style={{ color: 'var(--color-text-secondary)' }}><Eye size={18} /></button>
                    <button title="Editar" onClick={() => editar(nota)} className="rounded-lg p-2" style={{ color: 'var(--color-text-secondary)' }}><Pencil size={18} /></button>
                    <button title={noAr ? 'Despublicar' : 'Publicar'} disabled={salvando} onClick={() => alternarPublicacao(nota)} className="rounded-lg p-2 disabled:opacity-50" style={{ color: noAr ? 'var(--color-text-secondary)' : 'var(--color-primary)' }}>
                      {noAr ? <EyeOff size={18} /> : <Megaphone size={18} />}
                    </button>
                    <button title="Excluir" onClick={() => setExcluir(nota)} className="rounded-lg p-2" style={{ color: 'var(--color-despesa)' }}><Trash2 size={18} /></button>
                  </div>
                </div>
                <h3 className="mt-3 text-xl font-extrabold" style={{ color: 'var(--color-text)' }}>{nota.TITULO}</h3>
                <div className="mt-2"><ConteudoNota texto={nota.CONTEUDO} /></div>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  <span>{noAr ? `Publicada em ${formatServerDateTimeBrasilia(nota.DATA_PUBLICACAO || '')}` : `Criada em ${formatServerDateTimeBrasilia(nota.CRIADO_EM || '')}`}</span>
                  {nota.AUTOR ? <span>por {nota.AUTOR}</span> : null}
                  {noAr ? <span className="inline-flex items-center gap-1"><Users size={14} /> {Number(nota.LEITURAS || 0)} {Number(nota.LEITURAS || 0) === 1 ? 'pessoa viu' : 'pessoas viram'}</span> : null}
                </div>
              </article>
            );
          })}
        </section>
      </div>

      {previa ? <JanelaNotas notas={previa} onFechar={() => setPrevia(null)} rotuloBotao="Fechar pré-visualização" /> : null}

      <ConfirmDialog
        isOpen={!!excluir}
        onClose={() => setExcluir(null)}
        onConfirm={confirmarExclusao}
        title="Excluir nota"
        message={`A nota "${excluir?.TITULO || ''}" será apagada e deixa de aparecer para quem ainda não a viu.`}
        loading={excluindo}
      />
    </div>
  );
}
