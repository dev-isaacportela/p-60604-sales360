// Papéis de Usuários (spec 010: RF-027, RN-016, C-017; D-010-2).
// Marca e desmarca DIRETORIA, COORDENADOR e VENDEDOR; GESTOR e ADMIN aparecem
// desabilitados. Salvar = inclui marcados → remove desmarcados → acerta o
// papel legado → relê o usuário para a mensagem.

import { useState } from 'react'
import { linha, linhas } from '@/lib/mitra-api'
import { agoraBrasilia } from '@/lib/formato'
import { EDITAVEIS, lerPapeis, marcacoes, mensagemPapeis } from '@/lib/papeis'
import { BlocoFalhou, Marcador } from '@/components/Confirmacao'
import { gravar, useBloco } from '@/components/use-bloco'
import {
  Actions, Alert, Button, Code, EmptyState, Field, InfoGrid, InfoTile, PageHeader, Pagination, Panel, PanelHeader, RowMeta,
  RowTitle, SearchInput, SelectMenu, Stack, Table, Td, Th, Toolbar, Tr,
} from '@/components/page'

const POR_PAGINA = 20
const ROTULO: Record<string, string> = { DIRETORIA: 'Diretoria', COORDENADOR: 'Coordenador', VENDEDOR: 'Vendedor', GESTOR: 'Gestor', ADMIN: 'Admin (TI)' }
const FILTROS = [{ value: '', label: 'Todos os papéis' }, ...Object.entries(ROTULO).map(([value, label]) => ({ value, label }))]

export default function PapeisUsuariosPage() {
  const [busca, setBusca] = useState('')
  const [papel, setPapel] = useState('')
  const [pagina, setPagina] = useState(1)
  const resumo = useBloco(() => linha('papelResumo'), [])
  const lista = useBloco(
    () => linhas('papelListar', { busca: busca.trim(), papel, limite: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA }),
    [busca, papel, pagina],
  )
  // Marcações em edição por usuário; ausente = as que vieram do servidor.
  const [edicao, setEdicao] = useState<Record<number, string[]>>({})
  const [salvando, setSalvando] = useState<number | null>(null)
  const [aviso, setAviso] = useState<{ tom: 'success' | 'error'; texto: string } | null>(null)
  const total = Number(lista.dados?.[0]?.TOTAL ?? 0)

  async function salvar(u: Record<string, unknown>) {
    const userId = Number(u.USER_ID)
    setSalvando(userId)
    setAviso(null)
    try {
      const input = { userId, ...marcacoes(edicao[userId] ?? lerPapeis(u.PAPEIS)), agora: agoraBrasilia() }
      await gravar('papelIncluir', input)
      await gravar('papelRemover', input)
      await gravar('papelLegadoSincronizar', input)
      const relido = (await linhas('papelListar', { busca: String(userId), papel: '', limite: 50, offset: 0 })).find(r => Number(r.USER_ID) === userId)
      setAviso({ tom: 'success', texto: mensagemPapeis(String(u.NOME), lerPapeis(relido?.PAPEIS)) })
      setEdicao(e => Object.fromEntries(Object.entries(e).filter(([id]) => Number(id) !== userId)))
      lista.recarregar()
      resumo.recarregar()
    } catch (falha) {
      console.error('salvar papéis', falha)
      setAviso({ tom: 'error', texto: 'Não foi possível salvar os papéis agora. Salvar de novo completa o que faltou.' })
    } finally {
      setSalvando(null)
    }
  }

  const r = resumo.dados
  return (
    <>
      <PageHeader module="Diretoria" title="Papéis de Usuários" description="Papéis acumulam. Gestor e Admin só são atribuídos pela TI." />
      <Stack>
        {resumo.erro ? (
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
        )}
        {aviso && <Alert tone={aviso.tom}>{aviso.texto}</Alert>}
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
                    <Th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {(lista.dados ?? []).map(u => {
                    const userId = Number(u.USER_ID)
                    const doServidor = lerPapeis(u.PAPEIS)
                    const atuais = edicao[userId] ?? doServidor
                    const mudou = edicao[userId] !== undefined
                    return (
                      <Tr key={userId}>
                        <Td>
                          <RowTitle>{u.NOME}</RowTitle>
                          <RowMeta>
                            {u.EMAIL} · <Code prefix="ID">{userId}</Code>
                            {u.COD_RCA != null && <Code prefix=" · RCA">{u.COD_RCA}</Code>}
                          </RowMeta>
                        </Td>
                        <Td>
                          <Actions>
                            {[...EDITAVEIS, 'GESTOR', 'ADMIN'].map(p => (
                              <Marcador
                                key={p}
                                rotulo={ROTULO[p]}
                                marcado={atuais.includes(p)}
                                desabilitado={!(EDITAVEIS as readonly string[]).includes(p) || salvando === userId}
                                onMudar={m => setEdicao(e => ({ ...e, [userId]: m ? [...atuais, p] : atuais.filter(x => x !== p) }))}
                              />
                            ))}
                          </Actions>
                        </Td>
                        <Td numeric>
                          <Button size="sm" variant={mudou ? 'primary' : 'secondary'} disabled={!mudou || salvando === userId} onClick={() => salvar(u)}>
                            {salvando === userId ? 'Salvando…' : 'Salvar papéis'}
                          </Button>
                        </Td>
                      </Tr>
                    )
                  })}
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
      </Stack>
    </>
  )
}

PapeisUsuariosPage.rota = '/gestao-cargos-usuarios'
