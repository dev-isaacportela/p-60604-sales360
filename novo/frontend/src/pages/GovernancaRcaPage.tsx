// RCA e Escopo (spec 010: RF-022..RF-025, RN-012..RN-014, C-012..C-015).
// Governança RCA e Escopo Usuários fundidas (2026-11-03): uma lista de
// usuários; `Editar` abre o painel do usuário com o vínculo RCA e os escopos.
// RCA: auditoria primeiro, gravação depois, com o mesmo `agora` (D-010-1); o
// servidor só grava o que a auditoria dele registrou. Escopo: reativar as
// combinações inativas e incluir as que nunca existiram (RN-013).

import { useState } from 'react'
import type { FormEvent } from 'react'
import { linhas } from '@/lib/mitra-api'
import { agoraBrasilia, fmtDataHora } from '@/lib/formato'
import { confirmacao, resumoEscopos, validarSupervisor } from '@/lib/gestao'
import { BlocoFalhou, Confirmacao, Marcador } from '@/components/Confirmacao'
import type { PedidoConfirmacao } from '@/components/Confirmacao'
import { gravar, useBloco } from '@/components/use-bloco'
import {
  Actions, Alert, Button, Code, Dash, EmptyState, Field, FormRow, Input, LabelledField, PageHeader, Pagination, Panel, PanelBody,
  PanelHeader, RowMeta, RowTitle, SearchInput, SelectMenu, Stack, Table, Td, Th, Toolbar, Tr,
} from '@/components/page'

const POR_PAGINA = 20
const ou = (v: unknown, texto: string) => (v == null || v === '' ? texto : String(v))
type Aviso = { tom: 'success' | 'error'; texto: string } | null
type Linha = Record<string, string>

export default function GovernancaRcaPage() {
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)
  const vinculos = useBloco(
    () => linhas('rcaVinculoListar', { busca: busca.trim(), limite: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA }),
    [busca, pagina],
  )
  const rcas = useBloco(() => linhas('rcaTotvsListar'), [])
  const auditoria = useBloco(() => linhas('rcaAuditoriaListar'), [])
  const estrutura = useBloco(() => linhas('estruturaListar'), [])
  const [editando, setEditando] = useState<Record<string, unknown> | null>(null)
  const [rca, setRca] = useState('')
  const [supervisor, setSupervisor] = useState('')
  const [observacao, setObservacao] = useState('')
  const [aviso, setAviso] = useState<Aviso>(null)
  const [salvando, setSalvando] = useState(false)
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null)
  const total = Number(vinculos.dados?.[0]?.TOTAL ?? 0)

  const recarregar = () => {
    vinculos.recarregar()
    rcas.recarregar()
    auditoria.recarregar()
  }

  function abrir(v: Record<string, unknown>) {
    setEditando(v)
    setRca(v.COD_RCA == null ? '' : String(v.COD_RCA))
    setSupervisor(v.COD_SUPERVISOR == null ? '' : String(v.COD_SUPERVISOR))
    setObservacao('')
    setAviso(null)
  }

  function escolherRca(valor: string) {
    setRca(valor)
    const sugerido = rcas.dados?.find(r => String(r.COD_RCA) === valor)?.COD_SUPERVISOR
    setSupervisor(sugerido == null ? '' : String(sugerido))
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!editando) return
    setAviso(null)
    const dono = rcas.dados?.find(r => String(r.COD_RCA) === rca)
    if (!rca) return setAviso({ tom: 'error', texto: 'Escolha o RCA.' })
    if (dono?.USUARIO_ID && Number(dono.USUARIO_ID) !== Number(editando.USER_ID)) {
      return setAviso({ tom: 'error', texto: `O RCA ${rca} já está vinculado a ${dono.USUARIO}. Remova o vínculo dela antes.` })
    }
    const erroSupervisor = supervisor.trim() ? validarSupervisor(supervisor) : null
    if (erroSupervisor) return setAviso({ tom: 'error', texto: erroSupervisor })
    setSalvando(true)
    try {
      const input = {
        userId: Number(editando.USER_ID), codRca: Number(rca), codSupervisor: Number(supervisor || 0),
        observacao: observacao.trim().slice(0, 300), agora: agoraBrasilia(),
      }
      if ((await gravar('rcaAuditar', input)) < 1) {
        return setAviso({ tom: 'error', texto: 'Nada foi alterado: o vínculo já é este, ou o RCA ou o supervisor não existe no ERP.' })
      }
      if ((await gravar('rcaVincular', input)) < 1) {
        return setAviso({ tom: 'error', texto: 'Nada foi alterado: o vínculo não foi gravado. Tente salvar de novo.' })
      }
      setAviso({ tom: 'success', texto: 'Vínculo RCA salvo com sucesso.' })
      setEditando({ ...editando, COD_RCA: input.codRca, COD_SUPERVISOR: input.codSupervisor || null })
      setObservacao('')
      recarregar()
    } catch (falha) {
      console.error('salvar vínculo RCA', falha)
      setAviso({ tom: 'error', texto: 'Não foi possível salvar o vínculo agora.' })
    } finally {
      setSalvando(false)
    }
  }

  function remover(v: Record<string, unknown>) {
    setPedido({
      ...confirmacao('removerRca', String(v.NOME)),
      executar: async () => {
        const input = { userId: Number(v.USER_ID), codRca: 0, codSupervisor: 0, observacao: '', agora: agoraBrasilia() }
        const ok = (await gravar('rcaAuditar', input).catch(() => 0)) > 0 && (await gravar('rcaRemover', input).catch(() => 0)) > 0
        setAviso(ok ? { tom: 'success', texto: `${v.NOME} ficou sem vínculo RCA.` } : { tom: 'error', texto: 'Nada foi alterado: o vínculo não foi removido.' })
        if (ok) {
          setEditando({ ...v, COD_RCA: null, COD_SUPERVISOR: null })
          setRca('')
          setSupervisor('')
        }
        recarregar()
      },
    })
  }

  const opcoesRca = (rcas.dados ?? []).map(r => ({
    value: String(r.COD_RCA),
    label: `${r.COD_RCA} · ${r.RCA_NOME ?? ''}`,
    hint: r.USUARIO ? `Vinculado a ${r.USUARIO}` : undefined,
  }))

  return (
    <>
      <PageHeader
        module="Gestão"
        title="RCA e Escopo"
        description="Código de vendedor do ERP e escopo (BU + filial + seção) de cada usuário. Toda mudança de RCA fica na auditoria."
      />
      <Stack>
        {aviso && !editando && <Alert tone={aviso.tom}>{aviso.texto}</Alert>}
        {editando && (
          <Panel>
            <PanelHeader title={`Editar · ${editando.NOME}`} hint={String(editando.EMAIL ?? '')} />
            <PanelBody>
              <Stack>
                <form onSubmit={salvar} noValidate>
                  <Stack>
                    <FormRow>
                      <Field label="RCA" obrigatorio>
                        <SelectMenu label="RCA" value={rca} options={opcoesRca} onChange={escolherRca} disabled={rcas.erro} />
                      </Field>
                      <LabelledField label="Supervisor" hint="Sugerido pelo ERP; pode ser alterado">
                        <Input inputMode="numeric" value={supervisor} onChange={e => setSupervisor(e.target.value)} />
                      </LabelledField>
                      <LabelledField label="Observação">
                        <Input value={observacao} maxLength={300} onChange={e => setObservacao(e.target.value)} />
                      </LabelledField>
                    </FormRow>
                    {aviso && <Alert tone={aviso.tom}>{aviso.texto}</Alert>}
                    <Actions>
                      <Button type="submit" variant="primary" disabled={salvando}>
                        {salvando ? 'Salvando…' : 'Salvar vínculo'}
                      </Button>
                      <Button disabled={editando.COD_RCA == null} onClick={() => remover(editando)}>
                        Remover vínculo
                      </Button>
                    </Actions>
                  </Stack>
                </form>
                {estrutura.erro ? (
                  <BlocoFalhou />
                ) : (
                  <EscoposDoUsuario key={Number(editando.USER_ID)} usuario={editando} estrutura={(estrutura.dados ?? []) as Linha[]} pedirConfirmacao={setPedido} />
                )}
                <Actions>
                  <Button onClick={() => setEditando(null)}>Fechar</Button>
                </Actions>
              </Stack>
            </PanelBody>
          </Panel>
        )}

        <Panel>
          <PanelHeader title="Usuários" />
          <Toolbar>
            <SearchInput
              placeholder="Buscar por nome, e-mail ou RCA"
              aria-label="Buscar por nome, e-mail ou RCA"
              value={busca}
              onChange={e => {
                setBusca(e.target.value)
                setPagina(1)
              }}
            />
          </Toolbar>
          {vinculos.erro ? (
            <BlocoFalhou />
          ) : vinculos.dados && vinculos.dados.length === 0 ? (
            <EmptyState title="Nenhum usuário encontrado" />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Usuário</Th>
                    <Th>RCA</Th>
                    <Th>Supervisor</Th>
                    <Th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {(vinculos.dados ?? []).map(v => (
                    <Tr key={v.USER_ID}>
                      <Td>
                        <RowTitle>{v.NOME}</RowTitle>
                        <RowMeta>{v.EMAIL}</RowMeta>
                      </Td>
                      <Td>{ou(v.COD_RCA, 'Sem vínculo')}</Td>
                      <Td>{ou(v.COD_SUPERVISOR, 'Sem supervisor')}</Td>
                      <Td numeric>
                        <Button size="sm" variant="ghost" onClick={() => abrir(v)}>
                          Editar
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
              <Pagination
                page={pagina}
                lastPage={Math.max(1, Math.ceil(total / POR_PAGINA))}
                total={total}
                unit="usuários"
                onPrevious={() => setPagina(p => p - 1)}
                onNext={() => setPagina(p => p + 1)}
              />
            </>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Auditoria de RCA" hint="As 80 últimas alterações." />
          {auditoria.erro ? (
            <BlocoFalhou />
          ) : auditoria.dados && auditoria.dados.length === 0 ? (
            <EmptyState title="Nenhuma alteração registrada" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Quando</Th>
                  <Th>Usuário</Th>
                  <Th>RCA</Th>
                  <Th>Supervisor</Th>
                  <Th>Quem alterou</Th>
                  <Th>Observação</Th>
                </tr>
              </thead>
              <tbody>
                {(auditoria.dados ?? []).map(a => (
                  <Tr key={a.ID}>
                    <Td>{fmtDataHora(String(a.ALTERADO_EM ?? '').replace(' ', 'T'))}</Td>
                    <Td>{a.USUARIO}</Td>
                    <Td>
                      {ou(a.COD_RCA_ANTERIOR, '—')} → {ou(a.COD_RCA_NOVO, '—')}
                    </Td>
                    <Td>
                      {ou(a.COD_SUPERVISOR_ANTERIOR, '—')} → {ou(a.COD_SUPERVISOR_NOVO, '—')}
                    </Td>
                    <Td>{a.ALTERADO_POR}</Td>
                    <Td>{a.OBSERVACAO ? <Code>{a.OBSERVACAO}</Code> : <Dash />}</Td>
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

/** Escopos ativos do usuário em edição + vincular novos (RF-022). */
function EscoposDoUsuario({ usuario, estrutura, pedirConfirmacao }: {
  usuario: Record<string, unknown>
  estrutura: Linha[]
  pedirConfirmacao: (p: PedidoConfirmacao) => void
}) {
  const userId = Number(usuario.USER_ID)
  // A busca é por nome/e-mail; o filtro por id descarta homônimos.
  const lista = useBloco(
    () => linhas('escopoListar', { busca: String(usuario.EMAIL ?? ''), limite: 200, offset: 0 })
      .then(r => r.filter(l => Number(l.VENDEDOR_ID) === userId)),
    [userId],
  )
  const [bu, setBu] = useState('')
  const [filial, setFilial] = useState('')
  const [secoes, setSecoes] = useState<string[]>([])
  const [todas, setTodas] = useState(true)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [salvando, setSalvando] = useState(false)

  const ativas = (tipo: string) => estrutura.filter(e => e.TIPO === tipo && Number(e.ATIVO) === 1)
  const opcoes = (tipo: string) => ativas(tipo).map(e => ({ value: e.CODIGO, label: e.NOME, hint: `Código ${e.CODIGO}` }))
  const secoesDaBu = ativas('SECAO').filter(s => s.PAI === bu)

  async function vincular(e: FormEvent) {
    e.preventDefault()
    setAviso(null)
    if (!bu || !filial || (!todas && secoes.length === 0)) {
      setAviso({ tom: 'error', texto: 'Escolha BU, filial e as seções (ou "Todas as seções").' })
      return
    }
    setSalvando(true)
    try {
      const input = { vendedorId: userId, buCodigo: bu, codfilial: filial, secoes: todas ? '' : secoes.join(','), agora: agoraBrasilia() }
      const reativados = await gravar('escopoReativar', input)
      const incluidos = await gravar('escopoIncluir', input)
      setAviso({ tom: reativados + incluidos > 0 ? 'success' : 'error', texto: resumoEscopos(todas ? 1 : secoes.length, reativados + incluidos) })
      setSecoes([])
      lista.recarregar()
    } catch (falha) {
      console.error('vincular escopo', falha)
      setAviso({ tom: 'error', texto: 'Não foi possível vincular o escopo agora.' })
    } finally {
      setSalvando(false)
    }
  }

  function desvincular(l: Record<string, unknown>) {
    const alvo = `${l.BU ?? l.BU_CODIGO} · ${l.FILIAL ?? l.CODFILIAL} · ${l.SECAO ?? 'Todas as seções'} de ${l.VENDEDOR}`
    pedirConfirmacao({
      ...confirmacao('desvincularEscopo', alvo),
      executar: async () => {
        const n = await gravar('escopoDesvincular', { id: Number(l.ID), agora: agoraBrasilia() }).catch(() => 0)
        setAviso(n ? { tom: 'success', texto: 'Escopo desvinculado.' } : { tom: 'error', texto: 'Nada foi alterado: o escopo não foi desvinculado.' })
        lista.recarregar()
      },
    })
  }

  return (
    <Stack>
      <PanelHeader title="Escopos" hint="Departamento + filial + seção em que a pessoa atua. Só BU ativa aceita escopo novo." />
      {lista.erro ? (
        <BlocoFalhou />
      ) : lista.dados && lista.dados.length === 0 ? (
        <EmptyState title="Nenhum escopo ativo" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>BU</Th>
              <Th>Filial</Th>
              <Th>Seção</Th>
              <Th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {(lista.dados ?? []).map(l => (
              <Tr key={l.ID}>
                <Td>
                  {l.BU ?? l.BU_CODIGO} <Code>{l.BU_CODIGO}</Code>
                </Td>
                <Td>{l.FILIAL ?? l.CODFILIAL}</Td>
                <Td>{l.SECAO ?? 'Todas as seções'}</Td>
                <Td numeric>
                  <Button size="sm" variant="ghost" onClick={() => desvincular(l)}>
                    Desvincular
                  </Button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <form onSubmit={vincular} noValidate>
        <Stack>
          <FormRow>
            <Field label="BU" obrigatorio>
              <SelectMenu
                label="BU"
                value={bu}
                options={opcoes('BU')}
                onChange={v => {
                  setBu(v)
                  setSecoes([])
                }}
              />
            </Field>
            <Field label="Filial" obrigatorio>
              <SelectMenu label="Filial" value={filial} options={opcoes('FILIAL')} onChange={setFilial} />
            </Field>
          </FormRow>
          <Field label="Seções">
            <Actions>
              <Marcador rotulo="Todas as seções" marcado={todas} onMudar={setTodas} />
              {secoesDaBu.map(s => (
                <Marcador
                  key={s.CODIGO}
                  rotulo={s.NOME}
                  marcado={secoes.includes(s.CODIGO)}
                  desabilitado={todas}
                  onMudar={m => setSecoes(atual => (m ? [...atual, s.CODIGO] : atual.filter(x => x !== s.CODIGO)))}
                />
              ))}
            </Actions>
          </Field>
          {aviso && <Alert tone={aviso.tom}>{aviso.texto}</Alert>}
          <Actions>
            <Button type="submit" variant="primary" disabled={salvando}>
              {salvando ? 'Vinculando…' : 'Vincular escopo'}
            </Button>
          </Actions>
        </Stack>
      </form>
    </Stack>
  )
}

GovernancaRcaPage.rota = '/governanca-rca'
