// Diálogos da carteira (spec 002): temperatura, ficha, curva manual, remoção,
// relato avulso e novo prospect. Cada um abre por cima da lista e devolve o
// resultado para a aba recarregar.

import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { acao, linha, linhasAfetadas } from '@/lib/mitra-api'
import { agoraBrasilia, hojeBrasilia } from '@/lib/formato'
import {
  CAMPOS_FICHA, CURVAS, MSG_PROSPECT_FALHA, MSG_PROSPECT_OK, MSG_RELATO_FALHA, TIPOS_CONTATO, fatoresTemperatura, perguntaRemover,
  recomendacao, rotuloTemperatura, validarProspect, validarRelato,
} from '@/lib/carteira'
import {
  Alert, Button, Dash, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  Field, FormRow, InfoGrid, InfoTile, Input, LabelledField, SelectMenu, Stack, Textarea,
} from '@/components/page'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

function Moldura({ titulo, descricao, aberto, fechar, children, rodape }: {
  titulo: string
  descricao?: ReactNode
  aberto: boolean
  fechar: () => void
  children: ReactNode
  rodape?: ReactNode
}) {
  return (
    <Dialog open={aberto} onOpenChange={a => { if (!a) fechar() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descricao ? <DialogDescription>{descricao}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody>{children}</DialogBody>
        {rodape ? <DialogFooter>{rodape}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  )
}

/* RF-005 / RN-007 / RN-009 */
export function DetalheTemperatura({ cliente, fechar }: { cliente: Linha | null; fechar: () => void }) {
  const t = cliente?.TEMPERATURA
  return (
    <Moldura titulo="Temperatura do relacionamento" descricao={cliente?.NOME} aberto={!!cliente} fechar={fechar}>
      {t ? (
        <Stack>
          <InfoGrid>
            {fatoresTemperatura(t).map(f => (
              <InfoTile key={f.rotulo} label={f.rotulo}>{f.pontos}/{f.max}</InfoTile>
            ))}
          </InfoGrid>
          <Alert tone="info">Total {rotuloTemperatura(t)}. {recomendacao(t)}</Alert>
        </Stack>
      ) : null}
    </Moldura>
  )
}

/* RN-014: só leitura, para quem vê o cliente na carteira exibida. */
export function FichaCliente({ clienteId, escopo, fechar }: { clienteId: number | null; escopo: Record<string, string>; fechar: () => void }) {
  const [ficha, setFicha] = useState<Linha | null | 'erro'>(null)
  useEffect(() => {
    if (!clienteId) return
    setFicha(null)
    linha('clienteFicha', { ...escopo, clienteId: String(clienteId) })
      .then(l => setFicha(l ?? 'erro'))
      .catch(falha => {
        console.error('s360ClienteFicha', falha)
        setFicha('erro')
      })
  }, [clienteId, escopo])

  return (
    <Moldura titulo="Ficha do cliente" descricao="Dados do cadastro do ERP, só leitura." aberto={!!clienteId} fechar={fechar}>
      {ficha === 'erro' ? (
        <Alert tone="error">Não foi possível abrir a ficha deste cliente.</Alert>
      ) : ficha ? (
        <InfoGrid>
          {CAMPOS_FICHA.map(c => (
            <InfoTile key={c.campo} label={c.rotulo}>{ficha[c.campo] || <Dash />}</InfoTile>
          ))}
        </InfoGrid>
      ) : null}
    </Moldura>
  )
}

/* RN-005: curva manual nos vínculos do próprio usuário. */
export function CurvaManual({ cliente, fechar, salvo }: { cliente: Linha | null; fechar: () => void; salvo: (texto: string) => void }) {
  const [curva, setCurva] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    setCurva(cliente?.CURVA_MANUAL ?? '')
    setErro(null)
  }, [cliente])

  async function salvar() {
    if (!cliente) return
    setSalvando(true)
    setErro(null)
    try {
      const n = linhasAfetadas(await acao('carteiraCurvaFixar', { clienteId: String(cliente.ID), curva }))
      if (n < 1) setErro('Nada foi alterado: a curva só pode ser fixada na sua própria carteira.')
      else salvo(curva ? `Curva ${curva} fixada para ${cliente.NOME}.` : `${cliente.NOME} voltou à curva automática.`)
    } catch (falha) {
      console.error('s360CarteiraCurvaFixar', falha)
      setErro('Não foi possível salvar a curva. Tente de novo.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Moldura
      titulo="Curva do cliente"
      descricao={cliente?.NOME}
      aberto={!!cliente}
      fechar={fechar}
      rodape={<><Button onClick={fechar}>Cancelar</Button><Button variant="primary" onClick={salvar} disabled={salvando}>Salvar</Button></>}
    >
      <Stack>
        <Field label="Curva" hint="Automática segue o ranking de compras e visitas.">
          <SelectMenu
            label="Curva"
            value={curva}
            options={[{ value: '', label: 'Automática' }, ...CURVAS.map(c => ({ value: c, label: `Curva ${c}` }))]}
            onChange={setCurva}
          />
        </Field>
        {erro ? <Alert tone="error">{erro}</Alert> : null}
      </Stack>
    </Moldura>
  )
}

/* RN-015 */
export function ConfirmarRemocao({ cliente, fechar, confirmar, removendo }: {
  cliente: Linha | null
  fechar: () => void
  confirmar: () => void
  removendo: boolean
}) {
  return (
    <Moldura
      titulo="Remover da carteira"
      aberto={!!cliente}
      fechar={fechar}
      rodape={<><Button onClick={fechar}>Cancelar</Button><Button variant="danger" onClick={confirmar} disabled={removendo}>Remover</Button></>}
    >
      {cliente ? perguntaRemover(cliente.NOME) : null}
    </Moldura>
  )
}

/* RN-016 */
export function RegistrarRelato({ cliente, fechar, salvo }: { cliente: Linha | null; fechar: () => void; salvo: (texto: string) => void }) {
  const hoje = hojeBrasilia()
  const vazio = { data: hoje, hora: '', tipo: TIPOS_CONTATO[0], relato: '' }
  const [r, setR] = useState(vazio)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setR(vazio); setErro(null) }, [cliente])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!cliente) return
    const recusa = validarRelato(r, hoje)
    setErro(recusa)
    if (recusa) return
    setSalvando(true)
    try {
      const n = linhasAfetadas(await acao('relatoRegistrar', { clienteId: String(cliente.ID), ...r, hoje, agora: agoraBrasilia() }))
      if (n < 1) setErro(MSG_RELATO_FALHA)
      else salvo(`Relato de ${r.tipo} registrado para ${cliente.NOME}.`)
    } catch (falha) {
      console.error('s360RelatoRegistrar', falha)
      setErro(MSG_RELATO_FALHA)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Moldura titulo="Registrar contato" descricao={cliente?.NOME} aberto={!!cliente} fechar={fechar}>
      <form onSubmit={salvar}>
        <Stack>
          <FormRow>
            <LabelledField label="Data" obrigatorio>
              <Input type="date" max={hoje} value={r.data} onChange={e => setR({ ...r, data: e.target.value })} />
            </LabelledField>
            <LabelledField label="Hora">
              <Input type="time" value={r.hora} onChange={e => setR({ ...r, hora: e.target.value })} />
            </LabelledField>
            <Field label="Tipo de contato" obrigatorio>
              <SelectMenu label="Tipo de contato" value={r.tipo} options={TIPOS_CONTATO.map(t => ({ value: t, label: t }))} onChange={tipo => setR({ ...r, tipo })} />
            </Field>
          </FormRow>
          <LabelledField label="Relato" obrigatorio hint={`${r.relato.length}/4.000`}>
            <Textarea rows={5} value={r.relato} onChange={e => setR({ ...r, relato: e.target.value })} />
          </LabelledField>
          {erro ? <Alert tone="error">{erro}</Alert> : null}
          <DialogFooter>
            <Button onClick={fechar}>Cancelar</Button>
            <Button variant="primary" type="submit" disabled={salvando}>Salvar relato</Button>
          </DialogFooter>
        </Stack>
      </form>
    </Moldura>
  )
}

const PROSPECT_VAZIO = {
  razaoSocial: '', nomeFantasia: '', cnpj: '', segmento: '', porte: '', origem: '', cidade: '', uf: '',
  potencial: '', probabilidade: '', contato: '', cargo: '', telefone: '', email: '', observacoes: '',
}

/* RN-021 */
export function NovoProspect({ aberto, fechar, salvo }: { aberto: boolean; fechar: () => void; salvo: (texto: string) => void }) {
  const [p, setP] = useState(PROSPECT_VAZIO)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { if (aberto) { setP(PROSPECT_VAZIO); setErro(null) } }, [aberto])

  const campo = (chave: keyof typeof PROSPECT_VAZIO, rotulo: string, extra: { obrigatorio?: boolean; tipo?: string } = {}) => (
    <LabelledField label={rotulo} obrigatorio={extra.obrigatorio}>
      <Input type={extra.tipo ?? 'text'} value={p[chave]} onChange={e => setP({ ...p, [chave]: e.target.value })} />
    </LabelledField>
  )

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const recusa = validarProspect(p)
    setErro(recusa)
    if (recusa) return
    setSalvando(true)
    try {
      const agora = agoraBrasilia()
      const base = { ...p, uf: p.uf.trim().toUpperCase(), agora }
      const n = linhasAfetadas(await acao('prospectCriar', base))
      if (n < 1) throw new Error('s360ProspectCriar: 0 linhas')
      if (p.contato.trim()) {
        await acao('prospectContatoCriar', base).catch(falha => console.error('s360ProspectContatoCriar', falha))
      }
      salvo(MSG_PROSPECT_OK)
    } catch (falha) {
      console.error('s360ProspectCriar', falha)
      setErro(MSG_PROSPECT_FALHA)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Moldura titulo="Novo cliente prospecto" descricao="O prospect não entra na carteira; ele aparece na aba Prospects." aberto={aberto} fechar={fechar}>
      <form onSubmit={salvar}>
        <Stack>
          {campo('razaoSocial', 'Razão social', { obrigatorio: true })}
          <FormRow>
            {campo('nomeFantasia', 'Nome fantasia')}
            {campo('cnpj', 'CNPJ')}
            {campo('segmento', 'Segmento')}
          </FormRow>
          <FormRow>
            {campo('porte', 'Porte')}
            {campo('origem', 'Origem')}
            {campo('cidade', 'Cidade')}
          </FormRow>
          <FormRow>
            {campo('uf', 'UF')}
            {campo('potencial', 'Potencial mensal (R$)', { tipo: 'number' })}
            {campo('probabilidade', 'Probabilidade (%)', { tipo: 'number' })}
          </FormRow>
          <FormRow>
            {campo('contato', 'Contato')}
            {campo('cargo', 'Cargo')}
            {campo('telefone', 'Telefone')}
          </FormRow>
          {campo('email', 'E-mail', { tipo: 'email' })}
          <LabelledField label="Observações">
            <Textarea rows={3} value={p.observacoes} onChange={e => setP({ ...p, observacoes: e.target.value })} />
          </LabelledField>
          {erro ? <Alert tone="error">{erro}</Alert> : null}
          <DialogFooter>
            <Button onClick={fechar}>Cancelar</Button>
            <Button variant="primary" type="submit" disabled={salvando}>Criar prospecto</Button>
          </DialogFooter>
        </Stack>
      </form>
    </Moldura>
  )
}
