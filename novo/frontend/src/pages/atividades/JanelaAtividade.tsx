// Nova Atividade / Editar Atividade (RF-004, RF-005, RF-008): abas Dados e
// Log. O status não muda aqui (RN-003). Atividade de outro abre em "Somente
// visualização": campos travados, sem Salvar (RN-001/002, C-009).

import { useEffect, useState } from 'react'
import { acao, linhas } from '@/lib/mitra-api'
import {
  FORM_VAZIO, MSG, PRIORIDADES, formDe, mensagemRecusa, mudou, paraInputForm, rotuloStatus, textoLog, validarAtividade,
} from '@/lib/atividades'
import type { FormAtividade } from '@/lib/atividades'
import {
  Alert, Badge, Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, Field, FormRow, Input, LabelledField, RowMeta, SelectMenu, Stack, Tabs, TabsContent, TabsList, TabsTrigger,
  Textarea, TextLink,
} from '@/components/page'
import { gravar } from '@/components/use-bloco'
import type { Linha } from './comum'

/** Cliente da carteira própria, escolhido explicitamente na lista (RN-008). */
function CampoCliente({ form, mudar, hoje, travado }: {
  form: FormAtividade
  mudar: (f: Partial<FormAtividade>) => void
  hoje: string
  travado: boolean
}) {
  const [resposta, setResposta] = useState<{ texto: string; linhas: Linha[]; total: number } | null>(null)
  const texto = form.clienteTexto
  const buscando = !travado && texto.trim() !== '' && texto !== form.clienteNome
  // Só vale a resposta do texto que está no campo (busca espera 400 ms parada).
  const opcoes = resposta?.texto === texto ? resposta : null

  useEffect(() => {
    if (!buscando) return
    let vivo = true
    const t = setTimeout(() => {
      acao('atividadeClientes', { busca: texto, hoje })
        .then(r => { if (vivo) setResposta({ texto, linhas: r.ok === false ? [] : r.linhas ?? [], total: r.ok === false ? 0 : Number(r.total) || 0 }) })
        .catch(falha => console.error('s360AtividadeClientes', falha))
    }, 400)
    return () => { vivo = false; clearTimeout(t) }
  }, [buscando, texto, hoje])

  return (
    <Stack className="gap-1">
      <LabelledField label="Cliente" hint={travado ? undefined : 'Opcional. Digite e escolha na lista; apague para tirar o cliente.'}>
        <Input value={texto} disabled={travado} placeholder="Nome, CNPJ ou código" onChange={e => mudar({ clienteTexto: e.target.value })} />
      </LabelledField>
      {buscando && opcoes ? (
        <div className="max-h-48 overflow-y-auto rounded-xl border border-rule-table">
          {opcoes.linhas.length ? opcoes.linhas.map(c => {
            const rotulo = `${c.NOME} · ${c.ID}`
            return (
              <button
                key={c.ID}
                type="button"
                className="block w-full border-b border-rule-row px-3 py-1.5 text-left text-[13px] last:border-b-0 hover:bg-accent"
                onClick={() => mudar({ clienteId: String(c.ID), clienteNome: rotulo, clienteTexto: rotulo })}
              >
                {rotulo}
                <RowMeta>{[c.CIDADE, c.UF].filter(Boolean).join(' / ')}</RowMeta>
              </button>
            )
          }) : <p className="px-3 py-2 text-[12px] text-ink-secondary">Nenhum cliente da sua carteira encontrado.</p>}
          {opcoes.total > opcoes.linhas.length ? <p className="px-3 py-2 text-[12px] text-ink-secondary">{MSG.refine}</p> : null}
        </div>
      ) : null}
    </Stack>
  )
}

function AbaLog({ atividade, escopo }: { atividade: Linha; escopo: Record<string, string> }) {
  const [log, setLog] = useState<Linha[] | null | 'erro'>(null)
  useEffect(() => {
    linhas('atividadeLog', { ...escopo, id: String(atividade.ID) })
      .then(setLog)
      .catch(falha => { console.error('s360AtividadeLog', falha); setLog('erro') })
  }, [atividade.ID, escopo])
  if (log === 'erro') return <Alert tone="error">Não foi possível carregar o log.</Alert>
  if (log === null) return <EmptyState title="Carregando…" />
  if (!log.length) return <EmptyState title="Nenhuma alteração registrada" />
  return (
    <ul className="flex flex-col">
      {log.map(l => <li key={l.ID} className="border-b border-rule-row py-2 text-[13px] last:border-b-0">{textoLog(l)}</li>)}
    </ul>
  )
}

export function JanelaAtividade({ atividade, aberta, escopo, hoje, fechar, salvo }: {
  /** null = Nova Atividade. */
  atividade: Linha | null
  aberta: boolean
  escopo: Record<string, string>
  hoje: string
  fechar: () => void
  salvo: (mensagem: string) => void
}) {
  const original = atividade ? formDe(atividade) : FORM_VAZIO
  const [form, setForm] = useState<FormAtividade>(original)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const travado = !!atividade?.SOMENTE_LEITURA
  const mudar = (f: Partial<FormAtividade>) => setForm(atual => ({ ...atual, ...f }))

  async function salvar() {
    const problema = validarAtividade(form)
    if (problema) { setErro(problema); return }
    if (atividade && !mudou(original, form)) { fechar(); return }
    setSalvando(true)
    setErro(null)
    try {
      const entrada = { ...paraInputForm(form), hoje, ...(atividade ? { id: String(atividade.ID) } : {}) }
      const n = await gravar(atividade ? 'atividadeAtualizar' : 'atividadeCriar', entrada)
      if (n > 0) salvo(atividade ? MSG.atualizada : MSG.criada)
      else setErro(mensagemRecusa(false, 'salvar'))
    } catch (falha) {
      console.error('s360Atividade (salvar)', falha)
      setErro(mensagemRecusa(false, 'salvar'))
    } finally {
      setSalvando(false)
    }
  }

  const dados = (
    <Stack>
      {travado ? (
        <Alert tone="info">Somente visualização · Responsável: {atividade?.RESPONSAVEL}</Alert>
      ) : null}
      <LabelledField label="Título" obrigatorio>
        <Input value={form.titulo} maxLength={300} disabled={travado} onChange={e => mudar({ titulo: e.target.value })} />
      </LabelledField>
      <LabelledField label="Descrição">
        <Textarea value={form.descricao} maxLength={4000} rows={3} disabled={travado} onChange={e => mudar({ descricao: e.target.value })} />
      </LabelledField>
      <CampoCliente form={form} mudar={mudar} hoje={hoje} travado={travado} />
      <FormRow>
        <Field label="Prioridade">
          <SelectMenu label="Prioridade" value={form.prioridade} options={PRIORIDADES} disabled={travado} onChange={v => mudar({ prioridade: v })} />
        </Field>
        <LabelledField label="Prazo" obrigatorio>
          <Input type="date" value={form.prazo} disabled={travado} onChange={e => mudar({ prazo: e.target.value })} />
        </LabelledField>
        {atividade ? (
          <Field label="Status"><Badge tone="neutral">{rotuloStatus(atividade.STATUS)}</Badge></Field>
        ) : null}
      </FormRow>
      {erro ? <Alert tone="error">{erro}</Alert> : null}
    </Stack>
  )

  return (
    <Dialog open={aberta} onOpenChange={a => !a && !salvando && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{travado ? 'Atividade' : atividade ? 'Editar Atividade' : 'Nova Atividade'}</DialogTitle>
          <DialogDescription>
            {travado ? 'Atividade de outra pessoa: só o responsável altera.' : atividade ? 'O status muda pelo seletor na lista ou no Kanban.' : 'A atividade é sua e entra em A Fazer.'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {atividade ? (
            <Tabs defaultValue="dados">
              <TabsList>
                <TabsTrigger value="dados">Dados</TabsTrigger>
                <TabsTrigger value="log">Log</TabsTrigger>
              </TabsList>
              <TabsContent value="dados">{dados}</TabsContent>
              <TabsContent value="log"><AbaLog atividade={atividade} escopo={escopo} /></TabsContent>
            </Tabs>
          ) : dados}
        </DialogBody>
        <DialogFooter>
          {travado ? (
            <TextLink onClick={fechar}>Fechar</TextLink>
          ) : (
            <>
              <Button variant="ghost" onClick={fechar} disabled={salvando}>Cancelar</Button>
              <Button variant="primary" onClick={salvar} disabled={salvando}>
                {salvando ? 'Salvando…' : atividade ? 'Salvar alterações' : 'Salvar'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
