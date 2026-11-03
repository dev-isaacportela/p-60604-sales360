// Clientes Disponíveis (RF-009, RN-019): sempre do próprio usuário, sem o
// filtro de escopo. Adicionar é uma escrita só; 0 linhas → pergunta o motivo.

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { acao, linha, linhasAfetadas } from '@/lib/mitra-api'
import { agoraBrasilia } from '@/lib/formato'
import { MSG_ADICIONADO, MSG_SEM_ESCOPO, mensagemMotivo, ultimaPagina } from '@/lib/carteira'
import {
  Alert, Button, Code, EmptyState, Field, Pagination, Panel, PanelBody, PanelHeader, RowMeta, RowTitle, SearchInput,
  Table, Td, Th, Toolbar, Tr,
} from '@/components/page'
import { recalcularTitulares } from './AbaCarteira'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

const POR_PAGINA = 10
const chaveLinha = (l: Linha) => `${l.ID}|${l.CODFILIAL}|${l.CODEPTO}|${l.ID_SECAO ?? ''}`

export function AbaDisponiveis({ aoAdicionar }: { aoAdicionar: () => void }) {
  const [textoBusca, setTextoBusca] = useState('')
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)
  const [dados, setDados] = useState<Linha | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [falhou, setFalhou] = useState(false)
  const [aviso, setAviso] = useState<{ tom: 'success' | 'error'; texto: string } | null>(null)
  const [adicionando, setAdicionando] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => { setBusca(textoBusca); setPagina(1) }, 400)
    return () => clearTimeout(t)
  }, [textoBusca])

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    acao('disponiveisListar', { busca, pagina: String(pagina) })
      .then(r => {
        if (!vivo) return
        if (r.ok === false) throw new Error(r.error)
        setDados(r)
        setFalhou(false)
      })
      .catch(falha => {
        console.error('s360DisponiveisListar', falha)
        if (vivo) setFalhou(true)
      })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [busca, pagina, recarga])

  async function adicionar(l: Linha) {
    const escopo = { clienteId: String(l.ID), codFilial: String(l.CODFILIAL), codepto: String(l.CODEPTO), idSecao: l.ID_SECAO == null ? '' : String(l.ID_SECAO) }
    setAdicionando(chaveLinha(l))
    setAviso(null)
    let n = 0
    try {
      n = linhasAfetadas(await acao('disponivelAdicionar', { ...escopo, agora: agoraBrasilia() }))
    } catch (falha) {
      // Corrida de duas adições: o banco aborta uma; o motivo explica qual.
      console.error('s360DisponivelAdicionar', falha)
    }
    try {
      if (n > 0) {
        await recalcularTitulares(l.ID)
        setAviso({ tom: 'success', texto: MSG_ADICIONADO })
        aoAdicionar()
      } else {
        const motivo = await linha('disponivelMotivo', escopo)
        setAviso({ tom: 'error', texto: mensagemMotivo(motivo?.MOTIVO) })
      }
    } catch (falha) {
      console.error('s360DisponivelMotivo', falha)
      setAviso({ tom: 'error', texto: mensagemMotivo(null) })
    } finally {
      setAdicionando(null)
      setRecarga(x => x + 1)
    }
  }

  const lista: Linha[] = dados?.linhas ?? []
  const total = Number(dados?.total) || 0

  return (
    <Panel>
      <PanelHeader title="Clientes disponíveis" hint="Pessoas jurídicas sem responsável em cada escopo seu. Esta lista usa sempre o seu escopo, não o do botão Escopo." />
      <Toolbar>
        <Field label="Buscar">
          <SearchInput placeholder="Nome, CNPJ, código ou cidade" value={textoBusca} onChange={e => setTextoBusca(e.target.value)} />
        </Field>
      </Toolbar>
      {aviso ? <PanelBody><Alert tone={aviso.tom}>{aviso.texto}</Alert></PanelBody> : null}
      {falhou ? (
        <PanelBody><Alert tone="error">Não foi possível carregar os clientes disponíveis. Tente de novo.</Alert></PanelBody>
      ) : dados?.semEscopo ? (
        <PanelBody><Alert tone="warn">{MSG_SEM_ESCOPO}</Alert></PanelBody>
      ) : !carregando && !lista.length ? (
        <EmptyState title="Nenhum cliente disponível" hint={busca ? 'Mude a busca.' : 'Todos os clientes dos seus escopos já têm responsável.'} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Cliente</Th>
              <Th>Cidade</Th>
              <Th>Ramo</Th>
              <Th>Escopo</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {lista.map(l => (
              <Tr key={chaveLinha(l)}>
                <Td>
                  <RowTitle>{l.NOME}</RowTitle>
                  <RowMeta><Code prefix="#">{l.ID}</Code>{l.CNPJ ? ` · ${l.CNPJ}` : ''}</RowMeta>
                </Td>
                <Td>{l.CIDADE ? `${l.CIDADE}${l.UF ? `/${l.UF}` : ''}` : ''}</Td>
                <Td>{l.RAMO}</Td>
                <Td>{l.ESCOPO}</Td>
                <Td>
                  <Button size="sm" onClick={() => adicionar(l)} disabled={adicionando !== null}>
                    <Plus aria-hidden />Adicionar
                  </Button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      {total > 0 ? (
        <Pagination
          page={pagina}
          lastPage={ultimaPagina(total, POR_PAGINA)}
          total={total}
          unit="clientes"
          busy={carregando}
          onPrevious={() => setPagina(p => p - 1)}
          onNext={() => setPagina(p => p + 1)}
        />
      ) : null}
    </Panel>
  )
}
