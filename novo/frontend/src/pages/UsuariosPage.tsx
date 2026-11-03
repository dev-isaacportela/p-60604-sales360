// Usuários (spec 010: RF-022..RF-025, RF-027, RF-031, RF-032, RN-001, RN-012..RN-016, RN-021, RN-022).
// Papéis de Usuários, Governança RCA, Escopo Usuários e Executivas de Venda
// fundidas (2026-11-03): uma lista de usuários; `Editar` abre o painel do usuário
// só com as partes que o papel de quem abre edita (diretoria: papéis e acesso;
// gestão: RCA, escopo e acesso; coordenador ativo: acesso da equipe; TI: tudo).
// O servidor confere de novo em cada SF.
// RCA: auditoria primeiro, gravação depois, com o mesmo `agora` (D-010-1).
// Escopo: reativar as combinações inativas e incluir as que nunca existiram (RN-013).
// Papéis: inclui marcados → remove desmarcados → acerta o legado (D-010-2).

import { useState } from 'react'
import type { FormEvent } from 'react'
import { linha, linhas } from '@/lib/mitra-api'
import { agoraBrasilia, fmtDataHora } from '@/lib/formato'
import { confirmacao, resumoEscopos, validarMotivo, validarSupervisor } from '@/lib/gestao'
import { EDITAVEIS, lerPapeis, marcacoes, mensagemPapeis, partesUsuarios } from '@/lib/papeis'
import { rotuloPapeis } from '@/lib/sessao'
import { BlocoFalhou, Confirmacao, Marcador } from '@/components/Confirmacao'
import type { PedidoConfirmacao } from '@/components/Confirmacao'
import { gravar, useBloco } from '@/components/use-bloco'
import { useSessao } from '@/components/sessao-contexto'
import {
  Actions, Alert, Button, Code, Dash, EmptyState, Field, FormRow, InfoGrid, InfoTile, Input, LabelledField, PageHeader, Pagination,
  Panel, PanelBody, PanelHeader, RowMeta, RowTitle, SearchInput, SelectMenu, Stack, Status, Table, Td, Textarea, Th, Toolbar, Tr,
} from '@/components/page'

const POR_PAGINA = 20
const ou = (v: unknown, texto: string) => (v == null || v === '' ? texto : String(v))
type Aviso = { tom: 'success' | 'error'; texto: string } | null
type Linha = Record<string, string>
type Usuario = Record<string, unknown>
const ROTULO: Record<string, string> = { DIRETORIA: 'Diretoria', COORDENADOR: 'Coordenador', VENDEDOR: 'Vendedor', GESTOR: 'Gestor', ADMIN: 'Admin (TI)' }
const FILTROS = [{ value: '', label: 'Todos os papéis' }, ...Object.entries(ROTULO).map(([value, label]) => ({ value, label }))]
const FILTROS_ACESSO = [
  { value: 'TODAS', label: 'Todos' },
  { value: 'COM_ACESSO', label: 'Com acesso' },
  { value: 'DESATIVADAS', label: 'Desativados' },
]
const vazio = () => Promise.resolve([] as Record<string, unknown>[])

export default function UsuariosPage() {
  const { sessao } = useSessao()
  const pode = partesUsuarios(sessao.papeis, sessao.coordenadorAtivo)
  const [busca, setBusca] = useState('')
  const [papel, setPapel] = useState('')
  const [filtro, setFiltro] = useState('TODAS')
  const [pagina, setPagina] = useState(1)
  const lista = useBloco(
    () => linhas('papelListar', { busca: busca.trim(), papel, filtro, limite: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA }),
    [busca, papel, filtro, pagina],
  )
  const resumo = useBloco(() => (pode.papeis ? linha('papelResumo') : Promise.resolve(null)), [pode.papeis])
  const rcas = useBloco(() => (pode.rcaEscopo ? linhas('rcaTotvsListar') : vazio()), [pode.rcaEscopo])
  const auditoria = useBloco(() => (pode.rcaEscopo ? linhas('rcaAuditoriaListar') : vazio()), [pode.rcaEscopo])
  const estrutura = useBloco(() => (pode.rcaEscopo ? linhas('estruturaListar') : vazio()), [pode.rcaEscopo])
  const [editando, setEditando] = useState<Usuario | null>(null)
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null)
  const total = Number(lista.dados?.[0]?.TOTAL ?? 0)

  // Depois de gravar: atualiza o painel aberto e recarrega o que depende disso.
  const gravou = (mudou: Usuario) => {
    setEditando(e => (e ? { ...e, ...mudou } : e))
    lista.recarregar()
    resumo.recarregar()
    rcas.recarregar()
    auditoria.recarregar()
  }

  const r = resumo.dados
  return (
    <>
      <PageHeader
        module="Gestão"
        title="Usuários"
        description={[
          pode.papeis && 'Papéis acumulam; Gestor e Admin só são atribuídos pela TI.',
          pode.rcaEscopo && 'Código de vendedor do ERP e escopo (BU + filial + seção) de cada usuário; toda mudança de RCA fica na auditoria.',
          pode.soEquipe && 'Você vê as executivas do seu departamento.',
        ].filter(Boolean).join(' ')}
      />
      <Stack>
        {pode.papeis &&
          (resumo.erro ? (
            <Panel>
              <BlocoFalhou />
            </Panel>
          ) : (
            <InfoGrid>
              <InfoTile label="Diretoria">{r ? Number(r.DIRETORIA) : '…'}</InfoTile>
              <InfoTile label="Coordenadores">{r ? Number(r.COORDENADORES) : '…'}</InfoTile>
              <InfoTile label="Vendedores">{r ? Number(r.VENDEDORES) : '…'}</InfoTile>
              <InfoTile label="Outros (Gestor, Admin)">{r ? Number(r.OUTROS) : '…'}</InfoTile>
            </InfoGrid>
          ))}

        {editando && (
          <Panel>
            <PanelHeader title={`Editar · ${editando.NOME}`} hint={String(editando.EMAIL ?? '')} />
            <PanelBody>
              <Stack key={Number(editando.USER_ID)}>
                {pode.papeis && <PapeisDoUsuario usuario={editando} aoGravar={gravou} />}
                {pode.acesso && <AcessoDoUsuario usuario={editando} aoGravar={gravou} pedirConfirmacao={setPedido} />}
                {pode.rcaEscopo && (
                  <>
                    <VinculoRca usuario={editando} rcas={rcas} aoGravar={gravou} pedirConfirmacao={setPedido} />
                    {estrutura.erro ? (
                      <BlocoFalhou />
                    ) : (
                      <EscoposDoUsuario usuario={editando} estrutura={(estrutura.dados ?? []) as Linha[]} pedirConfirmacao={setPedido} />
                    )}
                  </>
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
              placeholder="Nome, e-mail, ID ou RCA"
              aria-label="Buscar por nome, e-mail, ID ou RCA"
              value={busca}
              onChange={e => {
                setBusca(e.target.value)
                setPagina(1)
              }}
            />
            <Field label="Papel">
              <SelectMenu
                label="Papel"
                value={papel}
                options={FILTROS}
                onChange={v => {
                  setPapel(v)
                  setPagina(1)
                }}
              />
            </Field>
            <Field label="Acesso">
              <SelectMenu
                label="Acesso"
                value={filtro}
                options={FILTROS_ACESSO}
                onChange={v => {
                  setFiltro(v)
                  setPagina(1)
                }}
              />
            </Field>
          </Toolbar>
          {lista.erro ? (
            <BlocoFalhou />
          ) : lista.dados && lista.dados.length === 0 ? (
            <EmptyState title="Nenhum usuário encontrado" />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Usuário</Th>
                    <Th>Papéis</Th>
                    <Th>RCA</Th>
                    <Th>Supervisor</Th>
                    <Th>Acesso</Th>
                    <Th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {(lista.dados ?? []).map(u => (
                    <Tr key={u.USER_ID}>
                      <Td>
                        <RowTitle>{u.NOME}</RowTitle>
                        <RowMeta>
                          {u.EMAIL} · <Code prefix="ID">{u.USER_ID}</Code>
                        </RowMeta>
                      </Td>
                      <Td>{rotuloPapeis(lerPapeis(u.PAPEIS))}</Td>
                      <Td>{ou(u.COD_RCA, 'Sem vínculo')}</Td>
                      <Td>{ou(u.COD_SUPERVISOR, 'Sem supervisor')}</Td>
                      <Td>
                        <Status tone={Number(u.BLOQUEADO) === 1 ? 'alert' : 'live'}>{Number(u.BLOQUEADO) === 1 ? 'Desativado' : 'Com acesso'}</Status>
                      </Td>
                      <Td numeric>
                        <Button size="sm" variant="ghost" onClick={() => setEditando(u)}>
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

        {pode.rcaEscopo && (
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
        )}
      </Stack>
      <Confirmacao pedido={pedido} onFechar={() => setPedido(null)} />
    </>
  )
}

/** Papéis do usuário (RF-027, RN-016): marca e desmarca os editáveis; GESTOR e ADMIN só aparecem. */
function PapeisDoUsuario({ usuario, aoGravar }: { usuario: Usuario; aoGravar: (mudou: Usuario) => void }) {
  const userId = Number(usuario.USER_ID)
  const [marcados, setMarcados] = useState(() => lerPapeis(usuario.PAPEIS))
  const [aviso, setAviso] = useState<Aviso>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    setAviso(null)
    try {
      const input = { userId, ...marcacoes(marcados), agora: agoraBrasilia() }
      await gravar('papelIncluir', input)
      await gravar('papelRemover', input)
      await gravar('papelLegadoSincronizar', input)
      const relido = (await linhas('papelListar', { busca: String(userId), papel: '', limite: 50, offset: 0 })).find(r => Number(r.USER_ID) === userId)
      const papeis = lerPapeis(relido?.PAPEIS)
      setMarcados(papeis)
      setAviso({ tom: 'success', texto: mensagemPapeis(String(usuario.NOME), papeis) })
      aoGravar({ PAPEIS: papeis.join(',') })
    } catch (falha) {
      console.error('salvar papéis', falha)
      setAviso({ tom: 'error', texto: 'Não foi possível salvar os papéis agora. Salvar de novo completa o que faltou.' })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Stack>
      <PanelHeader title="Papéis" hint="Gestor e Admin só são atribuídos pela TI." />
      <Actions>
        {[...EDITAVEIS, 'GESTOR', 'ADMIN'].map(p => (
          <Marcador
            key={p}
            rotulo={ROTULO[p]}
            marcado={marcados.includes(p)}
            desabilitado={!(EDITAVEIS as readonly string[]).includes(p) || salvando}
            onMudar={m => setMarcados(atual => (m ? [...atual, p] : atual.filter(x => x !== p)))}
          />
        ))}
      </Actions>
      {aviso && <Alert tone={aviso.tom}>{aviso.texto}</Alert>}
      <Actions>
        <Button variant="primary" disabled={salvando} onClick={salvar}>
          {salvando ? 'Salvando…' : 'Salvar papéis'}
        </Button>
      </Actions>
    </Stack>
  )
}

/** Campo do motivo dentro do diálogo: estado próprio; avisa quem abriu o diálogo a cada tecla. */
function CampoMotivo({ onMudar }: { onMudar: (texto: string) => void }) {
  const [texto, setTexto] = useState('')
  const erro = validarMotivo(texto)
  return (
    <LabelledField label="Motivo (opcional)" hint={erro ?? `${texto.trim().length}/500`} hintTone={erro ? 'error' : 'muted'}>
      <Textarea
        value={texto}
        onChange={e => {
          setTexto(e.target.value)
          onMudar(e.target.value)
        }}
      />
    </LabelledField>
  )
}

/**
 * Acesso da executiva (RF-032, RN-021, RN-022): só quem a RN-021 deixa quem abre
 * alterar tem botão; o servidor recusa o resto.
 */
function AcessoDoUsuario({ usuario, aoGravar, pedirConfirmacao }: {
  usuario: Usuario
  aoGravar: (mudou: Usuario) => void
  pedirConfirmacao: (p: PedidoConfirmacao) => void
}) {
  const userId = Number(usuario.USER_ID)
  const exec = useBloco(
    () => linhas('executivaListar', { busca: String(usuario.EMAIL ?? ''), filtro: 'TODAS', limite: 50, offset: 0 })
      .then(r => r.find(x => Number(x.USER_ID) === userId) ?? false),
    [userId],
  )
  const [aviso, setAviso] = useState<Aviso>(null)
  const x = exec.dados || null
  const desativada = Number(x?.BLOQUEADO) === 1

  function alternar() {
    const desativar = !desativada
    const motivo = { valor: '' }
    pedirConfirmacao({
      ...confirmacao(desativar ? 'desativarAcesso' : 'reativarAcesso', String(usuario.NOME)),
      extra: desativar ? <CampoMotivo onMudar={texto => (motivo.valor = texto)} /> : undefined,
      executar: async () => {
        const erro = validarMotivo(motivo.valor)
        if (erro) return setAviso({ tom: 'error', texto: erro })
        let n = 0
        try {
          await gravar('executivaAcessoGarantir', { userId })
          n = await gravar('executivaAcessoAlterar', { userId, bloqueado: desativar ? 1 : 0, motivo: desativar ? motivo.valor.trim() : '', agora: agoraBrasilia() })
        } catch (falha) {
          console.error('alterar acesso', falha)
        }
        setAviso(n
          ? { tom: 'success', texto: `${usuario.NOME}: acesso ${desativar ? 'desativado' : 'reativado'}.` }
          : { tom: 'error', texto: 'Nada foi alterado: você não tem permissão sobre esta executiva.' })
        exec.recarregar()
        if (n) aoGravar({ BLOQUEADO: desativar ? 1 : 0 })
      },
    })
  }

  return (
    <Stack>
      <PanelHeader title="Acesso" hint="Executiva desativada é desconectada na próxima ação e não consegue entrar. Carteira e histórico continuam." />
      {exec.erro ? (
        <BlocoFalhou />
      ) : exec.dados === false ? (
        <RowMeta>O acesso de diretoria, de coordenador ativo e o seu não se alteram por aqui (RN-021).</RowMeta>
      ) : x ? (
        <Actions>
          <Status tone={desativada ? 'alert' : 'live'}>{desativada ? 'Desativado' : 'Com acesso'}</Status>
          {desativada && x.MOTIVO ? <RowMeta>{String(x.MOTIVO)}</RowMeta> : null}
          {x.ATUALIZADO_POR ? <RowMeta>{`${x.ATUALIZADO_POR} · ${fmtDataHora(String(x.ATUALIZADO_EM ?? '').replace(' ', 'T'))}`}</RowMeta> : <Dash />}
          <Button variant={desativada ? 'secondary' : 'ghost'} onClick={alternar}>
            {desativada ? 'Reativar acesso' : 'Desativar acesso'}
          </Button>
        </Actions>
      ) : null}
      {aviso && <Alert tone={aviso.tom}>{aviso.texto}</Alert>}
    </Stack>
  )
}

/** Vínculo RCA do usuário (RF-023, RF-024, RN-014). */
function VinculoRca({ usuario, rcas, aoGravar, pedirConfirmacao }: {
  usuario: Usuario
  rcas: { dados: Record<string, unknown>[] | null; erro: boolean }
  aoGravar: (mudou: Usuario) => void
  pedirConfirmacao: (p: PedidoConfirmacao) => void
}) {
  const userId = Number(usuario.USER_ID)
  const [rca, setRca] = useState(usuario.COD_RCA == null ? '' : String(usuario.COD_RCA))
  const [supervisor, setSupervisor] = useState(usuario.COD_SUPERVISOR == null ? '' : String(usuario.COD_SUPERVISOR))
  const [observacao, setObservacao] = useState('')
  const [aviso, setAviso] = useState<Aviso>(null)
  const [salvando, setSalvando] = useState(false)

  function escolherRca(valor: string) {
    setRca(valor)
    const sugerido = rcas.dados?.find(r => String(r.COD_RCA) === valor)?.COD_SUPERVISOR
    setSupervisor(sugerido == null ? '' : String(sugerido))
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setAviso(null)
    const dono = rcas.dados?.find(r => String(r.COD_RCA) === rca)
    if (!rca) return setAviso({ tom: 'error', texto: 'Escolha o RCA.' })
    if (dono?.USUARIO_ID && Number(dono.USUARIO_ID) !== userId) {
      return setAviso({ tom: 'error', texto: `O RCA ${rca} já está vinculado a ${dono.USUARIO}. Remova o vínculo dela antes.` })
    }
    const erroSupervisor = supervisor.trim() ? validarSupervisor(supervisor) : null
    if (erroSupervisor) return setAviso({ tom: 'error', texto: erroSupervisor })
    setSalvando(true)
    try {
      const input = { userId, codRca: Number(rca), codSupervisor: Number(supervisor || 0), observacao: observacao.trim().slice(0, 300), agora: agoraBrasilia() }
      if ((await gravar('rcaAuditar', input)) < 1) {
        return setAviso({ tom: 'error', texto: 'Nada foi alterado: o vínculo já é este, ou o RCA ou o supervisor não existe no ERP.' })
      }
      if ((await gravar('rcaVincular', input)) < 1) {
        return setAviso({ tom: 'error', texto: 'Nada foi alterado: o vínculo não foi gravado. Tente salvar de novo.' })
      }
      setAviso({ tom: 'success', texto: 'Vínculo RCA salvo com sucesso.' })
      setObservacao('')
      aoGravar({ COD_RCA: input.codRca, COD_SUPERVISOR: input.codSupervisor || null })
    } catch (falha) {
      console.error('salvar vínculo RCA', falha)
      setAviso({ tom: 'error', texto: 'Não foi possível salvar o vínculo agora.' })
    } finally {
      setSalvando(false)
    }
  }

  function remover() {
    pedirConfirmacao({
      ...confirmacao('removerRca', String(usuario.NOME)),
      executar: async () => {
        const input = { userId, codRca: 0, codSupervisor: 0, observacao: '', agora: agoraBrasilia() }
        const ok = (await gravar('rcaAuditar', input).catch(() => 0)) > 0 && (await gravar('rcaRemover', input).catch(() => 0)) > 0
        setAviso(ok ? { tom: 'success', texto: `${usuario.NOME} ficou sem vínculo RCA.` } : { tom: 'error', texto: 'Nada foi alterado: o vínculo não foi removido.' })
        if (ok) {
          setRca('')
          setSupervisor('')
          aoGravar({ COD_RCA: null, COD_SUPERVISOR: null })
        }
      },
    })
  }

  const opcoesRca = (rcas.dados ?? []).map(r => ({
    value: String(r.COD_RCA),
    label: `${r.COD_RCA} · ${r.RCA_NOME ?? ''}`,
    hint: r.USUARIO ? `Vinculado a ${r.USUARIO}` : undefined,
  }))

  return (
    <form onSubmit={salvar} noValidate>
      <Stack>
        <PanelHeader title="Vínculo RCA" />
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
          <Button disabled={usuario.COD_RCA == null} onClick={remover}>
            Remover vínculo
          </Button>
        </Actions>
      </Stack>
    </form>
  )
}

/** Escopos ativos do usuário em edição + vincular novos (RF-022). */
function EscoposDoUsuario({ usuario, estrutura, pedirConfirmacao }: {
  usuario: Usuario
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
      <PanelHeader title="Escopos" hint="Departamento + filial + seção em que a pessoa atua. Só BU ativa no ERP aceita escopo novo." />
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

UsuariosPage.rota = '/governanca-rca'
