// Gestão Coordenadores (spec 010: RF-026, RN-015, C-016).
// Um `Salvar` grava cadastro e BUs em sequência (D-010-1): cadastro → inclui
// BUs → remove as que saíram (com confirmação, RN-025) → relê para a mensagem.

import { useState } from 'react'
import type { FormEvent } from 'react'
import { Pencil, X } from 'lucide-react'
import { linhas } from '@/lib/mitra-api'
import { confirmacao, validarSupervisor } from '@/lib/gestao'
import { BlocoFalhou, Confirmacao, Marcador } from '@/components/Confirmacao'
import type { PedidoConfirmacao } from '@/components/Confirmacao'
import { gravar, useBloco } from '@/components/use-bloco'
import {
  Actions, Alert, Button, Code, Dash, Field, FormRow, IconButton, Input, LabelledField, PageHeader, Panel, PanelBody,
  PanelHeader, RowMeta, RowTitle, SelectMenu, Stack, Status, Table, Td, Th, Tr,
} from '@/components/page'

type Linha = Record<string, string>
interface Formulario {
  existente: boolean
  codSupervisor: string
  nome: string
  email: string
  userId: string
  ativo: boolean
  bus: string[]
}
const vazio = (): Formulario => ({ existente: false, codSupervisor: '', nome: '', email: '', userId: '', ativo: true, bus: [] })
const lerBus = (v: unknown) => String(v ?? '').split(',').filter(Boolean)

export default function GestaoCoordenadoresPage() {
  const coordenadores = useBloco(() => linhas('coordenadorListar'), [])
  const estrutura = useBloco(() => linhas('estruturaListar'), [])
  const [form, setForm] = useState<Formulario>(vazio)
  const [filial, setFilial] = useState('')
  const [bu, setBu] = useState('')
  const [aviso, setAviso] = useState<{ tom: 'success' | 'error'; texto: string } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null)

  const de = (tipo: string) => ((estrutura.dados ?? []) as Linha[]).filter(e => e.TIPO === tipo)
  const nomeDe = (tipo: string, codigo: string) => de(tipo).find(e => e.CODIGO === codigo)?.NOME ?? codigo
  const rotuloBu = (par: string) => {
    const [f, d] = par.split(':')
    return `${nomeDe('FILIAL', f)} · ${nomeDe('BU', d)}`
  }
  const lista = (coordenadores.dados ?? []) as Linha[]

  function validar(): string | null {
    const erro = validarSupervisor(form.codSupervisor)
    if (erro) return erro
    if (!form.nome.trim()) return 'Informe o nome do coordenador.'
    if (form.ativo && !form.userId) return 'Escolha o usuário para deixar o coordenador ativo.'
    if (!form.existente && lista.some(c => String(c.COD_SUPERVISOR) === form.codSupervisor.trim())) {
      return `Já existe coordenador com o código ${form.codSupervisor.trim()}.`
    }
    const outro = lista.find(c => form.ativo && String(c.USER_ID) === form.userId && Number(c.ATIVO) === 1 && String(c.COD_SUPERVISOR) !== form.codSupervisor.trim())
    if (outro) return `Este usuário já tem um cadastro de coordenador ativo (${outro.COD_SUPERVISOR}).`
    return null
  }

  async function gravarTudo(removidas: string[]) {
    setSalvando(true)
    try {
      const codSupervisor = form.codSupervisor.trim()
      const cadastro = { codSupervisor, nome: form.nome.trim(), email: form.email.trim(), userId: Number(form.userId || 0), ativo: form.ativo ? 1 : 0 }
      const n = await gravar(form.existente ? 'coordenadorAtualizar' : 'coordenadorCriar', cadastro)
      // Atualizar sem mudança devolve 0 no MySQL: no existente, 0 só é recusa se a validação falhou, e ela já passou.
      if (!form.existente && n < 1) {
        setAviso({ tom: 'error', texto: 'Nada foi alterado: o coordenador não foi salvo.' })
        return
      }
      const bus = form.bus.join(',')
      await gravar('coordenadorBuIncluir', { codSupervisor, bus })
      if (removidas.length) await gravar('coordenadorBuRemover', { codSupervisor, bus })
      const relidas = await linhas('coordenadorListar')
      const salvo = relidas.find(c => String(c.COD_SUPERVISOR) === codSupervisor)
      const qtd = lerBus(salvo?.BUS).length
      setAviso({ tom: 'success', texto: `Coordenador salvo com ${qtd} BU${qtd === 1 ? '' : 's'}.` })
      setForm(vazio())
      coordenadores.recarregar()
    } catch (falha) {
      console.error('salvar coordenador', falha)
      setAviso({ tom: 'error', texto: 'Não foi possível salvar agora. Salvar de novo completa o que faltou.' })
    } finally {
      setSalvando(false)
    }
  }

  function salvar(e: FormEvent) {
    e.preventDefault()
    setAviso(null)
    const erro = validar()
    if (erro) return setAviso({ tom: 'error', texto: erro })
    const antes = lerBus(lista.find(c => String(c.COD_SUPERVISOR) === form.codSupervisor.trim())?.BUS)
    const removidas = form.existente ? antes.filter(b => !form.bus.includes(b)) : []
    if (!removidas.length) return void gravarTudo([])
    setPedido({ ...confirmacao('removerBuCoordenador', removidas.map(rotuloBu).join(', ')), executar: () => gravarTudo(removidas) })
  }

  function alternar(c: Linha) {
    const ativo = Number(c.ATIVO) === 1
    setPedido({
      ...confirmacao(ativo ? 'inativarCoordenador' : 'ativarCoordenador', c.NOME),
      executar: async () => {
        const n = await gravar('coordenadorStatusDefinir', { codSupervisor: String(c.COD_SUPERVISOR), ativo: ativo ? 0 : 1 }).catch(() => 0)
        setAviso(n
          ? { tom: 'success', texto: `${c.NOME} ${ativo ? 'inativado' : 'ativado'}.` }
          : { tom: 'error', texto: 'Nada foi alterado: para ativar, o coordenador precisa de usuário sem outro cadastro ativo.' })
        coordenadores.recarregar()
      },
    })
  }

  const adicionarBu = () => {
    const par = `${filial}:${bu}`
    if (filial && bu && !form.bus.includes(par)) setForm(f => ({ ...f, bus: [...f.bus, par] }))
  }
  const opcoes = (tipo: string) => de(tipo).filter(e => Number(e.ATIVO) === 1).map(e => ({ value: e.CODIGO, label: e.NOME, hint: tipo === 'USUARIO' ? e.PAI : undefined }))

  return (
    <>
      <PageHeader module="Diretoria" title="Gestão Coordenadores" description="Cadastro do coordenador e das BUs (filial + departamento) que formam a equipe dele." />
      <Stack>
        <Panel>
          <PanelHeader title={form.existente ? `Editar ${form.nome}` : 'Novo coordenador'} />
          {estrutura.erro ? (
            <BlocoFalhou />
          ) : (
            <PanelBody>
              <form onSubmit={salvar} noValidate>
                <Stack>
                  <FormRow>
                    <LabelledField label="Código de supervisor" obrigatorio>
                      <Input inputMode="numeric" value={form.codSupervisor} disabled={form.existente} onChange={e => setForm(f => ({ ...f, codSupervisor: e.target.value }))} />
                    </LabelledField>
                    <LabelledField label="Nome" obrigatorio>
                      <Input value={form.nome} maxLength={100} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
                    </LabelledField>
                    <LabelledField label="E-mail">
                      <Input type="email" value={form.email} maxLength={150} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                    </LabelledField>
                  </FormRow>
                  <FormRow>
                    <Field label="Usuário" hint="Obrigatório para o coordenador ficar ativo">
                      <SelectMenu label="Usuário" value={form.userId} options={opcoes('USUARIO')} onChange={v => setForm(f => ({ ...f, userId: v }))} />
                    </Field>
                    <Field label="Status">
                      <Marcador rotulo="Ativo" marcado={form.ativo} onMudar={m => setForm(f => ({ ...f, ativo: m }))} />
                    </Field>
                  </FormRow>
                  <FormRow>
                    <Field label="Filial">
                      <SelectMenu label="Filial" value={filial} options={opcoes('FILIAL')} onChange={setFilial} />
                    </Field>
                    <Field label="Departamento (BU)">
                      <SelectMenu label="Departamento (BU)" value={bu} options={opcoes('BU')} onChange={setBu} />
                    </Field>
                    <Field label="BU do coordenador">
                      <Button onClick={adicionarBu} disabled={!filial || !bu}>
                        Adicionar BU
                      </Button>
                    </Field>
                  </FormRow>
                  <Field label="BUs">
                    {form.bus.length ? (
                      <Actions>
                        {form.bus.map(par => (
                          <span key={par}>
                            {rotuloBu(par)}
                            <IconButton label={`Tirar ${rotuloBu(par)}`} tone="danger" onClick={() => setForm(f => ({ ...f, bus: f.bus.filter(b => b !== par) }))}>
                              <X />
                            </IconButton>
                          </span>
                        ))}
                      </Actions>
                    ) : (
                      <Dash />
                    )}
                  </Field>
                  {aviso && <Alert tone={aviso.tom}>{aviso.texto}</Alert>}
                  <Actions>
                    <Button type="submit" variant="primary" disabled={salvando}>
                      {salvando ? 'Salvando…' : 'Salvar'}
                    </Button>
                    {form.existente && <Button onClick={() => setForm(vazio())}>Cancelar edição</Button>}
                  </Actions>
                </Stack>
              </form>
            </PanelBody>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Coordenadores" />
          {coordenadores.erro ? (
            <BlocoFalhou />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Coordenador</Th>
                  <Th>Usuário</Th>
                  <Th>BUs</Th>
                  <Th>Status</Th>
                  <Th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {lista.map(c => (
                  <Tr key={c.COD_SUPERVISOR}>
                    <Td>
                      <RowTitle>{c.NOME}</RowTitle>
                      <RowMeta>
                        <Code prefix="Supervisor">{c.COD_SUPERVISOR}</Code>
                      </RowMeta>
                    </Td>
                    <Td>{c.USUARIO ?? <Dash />}</Td>
                    <Td>{lerBus(c.BUS).map(rotuloBu).join(', ') || <Dash />}</Td>
                    <Td>
                      <Status tone={Number(c.ATIVO) === 1 ? 'live' : 'off'}>{Number(c.ATIVO) === 1 ? 'Ativo' : 'Inativo'}</Status>
                    </Td>
                    <Td numeric>
                      <IconButton
                        label="Editar"
                        onClick={() =>
                          setForm({
                            existente: true, codSupervisor: String(c.COD_SUPERVISOR), nome: c.NOME, email: c.EMAIL ?? '',
                            userId: c.USER_ID == null ? '' : String(c.USER_ID), ativo: Number(c.ATIVO) === 1, bus: lerBus(c.BUS),
                          })
                        }
                      >
                        <Pencil />
                      </IconButton>
                      <Button size="sm" variant="ghost" onClick={() => alternar(c)}>
                        {Number(c.ATIVO) === 1 ? 'Inativar coordenador' : 'Ativar coordenador'}
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      </Stack>
      <Confirmacao pedido={pedido} onFechar={() => setPedido(null)} />
    </>
  )
}

GestaoCoordenadoresPage.rota = '/gestao-coordenadores'
