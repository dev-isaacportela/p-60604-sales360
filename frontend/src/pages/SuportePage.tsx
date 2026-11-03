import { useEffect, useMemo, useRef, useState } from 'react';
import { uploadFilePublicMitra } from 'mitra-interactions-sdk';
import { AlertTriangle, CheckCircle2, Info, Paperclip, Send, ShieldCheck, X } from 'lucide-react';
import Select from '../components/ui/Select';
import Input from '../components/ui/Input';
import { ToastContainer } from '../components/ui/Toast';
import { useToast } from '../hooks/useToast';
import { callSFSingle, callSFWithMeta, SF } from '../hooks/useMitra';

const PROJECT_ID = Number(import.meta.env.VITE_MITRA_PROJECT_ID);

interface UsuarioLogado {
  ID?: number;
  EMAIL?: string;
  DESCR?: string;
  NOME_INTERNO?: string;
  STATUS_FUNCIONARIO?: string;
  ID_SUBSTITUTO?: number | null;
}

interface SuporteForm {
  titulo: string;
  categoria: string;
  prioridade: string;
  telaAfetada: string;
  descricao: string;
  passosReproducao: string;
  resultadoEsperado: string;
  resultadoObtido: string;
  impacto: string;
}

const DEFAULT_FORM: SuporteForm = {
  titulo: '',
  categoria: 'BUG_FUNCIONAL',
  prioridade: 'MEDIA',
  telaAfetada: '',
  descricao: '',
  passosReproducao: '',
  resultadoEsperado: '',
  resultadoObtido: '',
  impacto: '',
};

const CATEGORIAS = [
  { value: 'BUG_FUNCIONAL', label: 'Bug funcional' },
  { value: 'ERRO_DADOS', label: 'Dados incorretos' },
  { value: 'PERFORMANCE', label: 'Lentidão ou travamento' },
  { value: 'ACESSO', label: 'Acesso ou permissão' },
  { value: 'VISUAL', label: 'Problema visual' },
  { value: 'OUTRO', label: 'Outro' },
];

const PRIORIDADES = [
  { value: 'BAIXA', label: 'Baixa' },
  { value: 'MEDIA', label: 'Média' },
  { value: 'ALTA', label: 'Alta' },
  { value: 'CRITICA', label: 'Crítica' },
];

function TextArea({ label, value, onChange, placeholder, rows = 4 }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold" style={{ color: '#4e574c' }}>
      {label}
      <textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-2xl border px-4 py-3 text-sm outline-none transition-all focus:ring-2"
        style={{ borderColor: '#dde2d8', color: '#2f372d', backgroundColor: '#ffffff', ['--tw-ring-color' as string]: '#a1f791' }}
      />
    </label>
  );
}

function getContextoNavegador(usuario: UsuarioLogado | null) {
  const nav = window.navigator;
  return {
    usuarioFrontend: usuario,
    url: window.location.href,
    rota: window.location.pathname + window.location.search,
    origem: window.location.origin,
    tituloPagina: document.title,
    userAgent: nav.userAgent,
    idioma: nav.language,
    idiomas: nav.languages,
    plataforma: nav.platform,
    cookieHabilitado: nav.cookieEnabled,
    online: nav.onLine,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    horarioLocal: new Date().toString(),
    larguraTela: window.screen.width,
    alturaTela: window.screen.height,
    larguraViewport: window.innerWidth,
    alturaViewport: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  };
}

export default function SuportePage() {
  const { toasts, addToast, removeToast } = useToast();
  const [form, setForm] = useState<SuporteForm>(DEFAULT_FORM);
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null);
  const [sending, setSending] = useState(false);
  const [protocolo, setProtocolo] = useState('');
  const [anexoFile, setAnexoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    callSFSingle(SF.dadosUsuarioLogado).then(setUsuario).catch(() => setUsuario(null));
  }, []);

  const contexto = useMemo(() => getContextoNavegador(usuario), [usuario]);

  function updateField<K extends keyof SuporteForm>(field: K, value: SuporteForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.titulo.trim() || !form.descricao.trim()) {
      addToast('error', 'Informe o título e a descrição do problema.');
      return;
    }

    setSending(true);
    setProtocolo('');
    try {
      let anexoUrl = '';
      let anexoNome = '';
      if (anexoFile) {
        const upload = await uploadFilePublicMitra({ projectId: PROJECT_ID, file: anexoFile });
        anexoUrl = String((upload as any)?.result?.publicUrl || (upload as any)?.publicUrl || '');
        anexoNome = anexoFile.name;
        if (!anexoUrl) throw new Error('Não foi possível anexar o print. Tente novamente.');
      }

      const { rows, error } = await callSFWithMeta(SF.suporteEnviarBug, {
        ...form,
        usuario,
        anexoUrl,
        anexoNome,
        contexto: getContextoNavegador(usuario),
      });
      if (error) throw new Error(error);
      if (!rows.length) throw new Error('O chamado não retornou confirmação do servidor.');
      const protocoloCriado = String(rows?.[0]?.PROTOCOLO || '');
      const emailStatus = String(rows?.[0]?.EMAIL_STATUS || '');
      setProtocolo(protocoloCriado);
      setForm(DEFAULT_FORM);
      setAnexoFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      addToast('success', protocoloCriado ? `Protocolo ${protocoloCriado} criado. ${emailStatus === 'ERRO' ? 'O e-mail falhou, mas o chamado já aparece no painel.' : 'E-mail enviado ao TI.'}` : 'Chamado registrado.');
    } catch (error) {
      addToast('error', error instanceof Error ? error.message : 'Não foi possível enviar o chamado.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <section className="rounded-[28px] border p-6 shadow-sm" style={{ backgroundColor: '#fafbf8', borderColor: '#dde2d8' }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em]" style={{ color: '#8c9489' }}>Suporte técnico</p>
            <h1 className="mt-2 font-display text-4xl font-extrabold" style={{ color: '#137432' }}>Reportar bug</h1>
            <p className="mt-2 max-w-3xl text-base" style={{ color: '#5f685c' }}>Descreva o problema com detalhes. O sistema captura automaticamente os dados do usuário e do navegador para acelerar o diagnóstico.</p>
          </div>
          {protocolo ? (
            <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ backgroundColor: '#e6f7df', color: '#137432' }}>
              <CheckCircle2 size={20} />
              <span className="font-bold">{protocolo}</span>
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form onSubmit={handleSubmit} className="rounded-[28px] border p-6 shadow-sm" style={{ backgroundColor: '#ffffff', borderColor: '#dde2d8' }}>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Título do bug" value={form.titulo} onChange={(event) => updateField('titulo', event.target.value)} placeholder="Ex: Tela de clientes não carrega" />
            <Input label="Tela afetada" value={form.telaAfetada} onChange={(event) => updateField('telaAfetada', event.target.value)} placeholder="Ex: /clientes ou Dashboard" />
            <Select label="Categoria" value={form.categoria} options={CATEGORIAS} onChange={(value) => updateField('categoria', value)} />
            <Select label="Prioridade" value={form.prioridade} options={PRIORIDADES} onChange={(value) => updateField('prioridade', value)} />
          </div>

          <div className="mt-5 grid gap-5">
            <TextArea label="Descrição do problema" value={form.descricao} onChange={(value) => updateField('descricao', value)} placeholder="O que aconteceu? Inclua mensagens de erro, filtros usados e horários aproximados." rows={5} />
            <TextArea label="Passos para reproduzir" value={form.passosReproducao} onChange={(value) => updateField('passosReproducao', value)} placeholder="1. Acessei... 2. Cliquei... 3. O erro ocorreu..." />
            <div className="grid gap-5 md:grid-cols-2">
              <TextArea label="Resultado esperado" value={form.resultadoEsperado} onChange={(value) => updateField('resultadoEsperado', value)} />
              <TextArea label="Resultado obtido" value={form.resultadoObtido} onChange={(value) => updateField('resultadoObtido', value)} />
            </div>
            <TextArea label="Impacto no trabalho" value={form.impacto} onChange={(value) => updateField('impacto', value)} placeholder="Informe se bloqueia vendas, atendimento, análise ou rotina específica." rows={3} />
            <div className="rounded-2xl border p-4" style={{ borderColor: '#dde2d8', backgroundColor: '#fafbf8' }}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold" style={{ color: '#4e574c' }}>Anexo de print</p>
                  <p className="mt-1 text-xs" style={{ color: '#6b7369' }}>Opcional. Envie uma imagem do erro para ajudar o diagnóstico.</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(event) => setAnexoFile(event.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold"
                  style={{ backgroundColor: '#eef1eb', color: '#137432' }}
                >
                  <Paperclip size={17} />
                  Selecionar print
                </button>
              </div>
              {anexoFile ? (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm" style={{ backgroundColor: '#ffffff', color: '#4e574c' }}>
                  <span className="truncate">{anexoFile.name}</span>
                  <button type="button" onClick={() => { setAnexoFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="rounded-full p-1" style={{ color: '#b42318' }}>
                    <X size={16} />
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2 text-sm" style={{ color: '#6b7369' }}>
              <ShieldCheck className="mt-0.5 shrink-0" size={18} />
              <span>Não coletamos senha, token ou credenciais. Apenas contexto técnico da sessão e do navegador.</span>
            </div>
            <button
              type="submit"
              disabled={sending}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: '#137432', color: '#ffffff' }}
            >
              <Send size={18} />
              {sending ? 'Enviando...' : 'Enviar bug'}
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <div className="rounded-[28px] border p-5 shadow-sm" style={{ backgroundColor: '#ffffff', borderColor: '#dde2d8' }}>
            <div className="flex items-center gap-2 font-bold" style={{ color: '#137432' }}>
              <Info size={19} />
              Contexto capturado
            </div>
            <dl className="mt-4 space-y-3 text-sm" style={{ color: '#4e574c' }}>
              <div><dt className="font-bold">Usuário</dt><dd>{usuario?.NOME_INTERNO || usuario?.EMAIL || usuario?.DESCR || 'Carregando...'}</dd></div>
              <div><dt className="font-bold">E-mail</dt><dd>{usuario?.EMAIL || usuario?.DESCR || 'Não informado'}</dd></div>
              <div><dt className="font-bold">Rota atual</dt><dd className="break-all">{contexto.rota}</dd></div>
              <div><dt className="font-bold">Navegador</dt><dd className="break-all">{window.navigator.userAgent}</dd></div>
              <div><dt className="font-bold">Tela</dt><dd>{window.innerWidth} x {window.innerHeight}</dd></div>
            </dl>
          </div>

          <div className="rounded-[28px] border p-5" style={{ backgroundColor: '#fff8e7', borderColor: '#f0d99b', color: '#6a4a00' }}>
            <div className="flex items-center gap-2 font-bold"><AlertTriangle size={19} /> Prioridade crítica</div>
            <p className="mt-2 text-sm">Use prioridade crítica apenas quando o problema impedir operação, atendimento, vendas ou acesso ao sistema.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
