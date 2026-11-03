// Titulares de Clientes (RF-014, RN-020): uma linha por cliente × filial ×
// departamento (Enfermagem: por seção). Salvar = as duas escritas
// (atualizar + inserir) e a soma das linhas afetadas decide a mensagem.

import { useEffect, useState } from 'react'
import { acao, linha, linhas, linhasAfetadas } from '@/lib/mitra-api'
import { agoraBrasilia, hojeBrasilia, moeda } from '@/lib/formato'
import { ultimaPagina } from '@/lib/carteira'
import {
  EXPLICACAO_REGRA, FILTROS_PADRAO, SITUACOES, candidatos, mensagemTitular, rotuloSituacao, tomSituacao, trocarFiltro,
} from '@/lib/titulares'
import {
  Actions, Alert, Button, Code, Dash, EmptyState, Field, InfoGrid, InfoTile, PageHeader, Pagination, Panel, PanelBody,
  PanelHeader, RowMeta, RowTitle, SearchInput, SelectMenu, Stack, Status, Table, Td, Th, Toolbar, Tr,
} from '@/components/page'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

const POR_PAGINA = 30
const TODAS = { value: '', label: 'Todas' }
const chaveLinha = (l: Linha) => `${l.ID_CLIENTE}|${l.CODFILIAL}|${l.CODEPTO}|${l.ID_SECAO ?? ''}`

function dozeMesesAntes(hoje: string) {
  const [a, m, d] = hoje.split('-')
  return `${Number(a) - 1}-${m}-${d}`
}

export default function GestaoTitularesPage() {
  const [filtros, setFiltros] = useState(FILTROS_PADRAO)
  const [textoBusca, setTextoBusca] = useState('')
  const [opcoes, setOpcoes] = useState<Linha[]>([])
  const [totais, setTotais] = useState<Linha | null>(null)
  const [lista, setLista] = useState<Linha[] | null | 'erro'>(null)
  const [escolhas, setEscolhas] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    linhas('titularesFiltros').then(setOpcoes).catch(falha => console.error('s360TitularesFiltros', falha))
  }, [])

  useEffect(() => {
    if (textoBusca === filtros.busca) return
    const t = setTimeout(() => setFiltros(f => trocarFiltro(f, 'busca', textoBusca)), 400)
    return () => clearTimeout(t)
  }, [textoBusca, filtros.busca])

  useEffect(() => {
    let vivo = true
    const { filial, depto, busca } = filtros
    setLista(null)
    linha('titularesTotais', { filial, depto, busca })
      .then(t => { if (vivo) setTotais(t) })
      .catch(falha => console.error('s360TitularesTotais', falha))
    linhas('titularesListar', { ...filtros, desde: dozeMesesAntes(hojeBrasilia()), pagina: String(filtros.pagina) })
      .then(ls => {
        if (!vivo) return
        setLista(ls)
        setEscolhas(Object.fromEntries(ls.map(l => [chaveLinha(l), l.TITULAR_ID == null ? '' : String(l.TITULAR_ID)])))
      })
      .catch(falha => {
        console.error('s360TitularesListar', falha)
        if (vivo) setLista('erro')
      })
    return () => { vivo = false }
  }, [filtros, recarga])

  async function salvar(l: Linha) {
    const chave = chaveLinha(l)
    const vendedorId = escolhas[chave]
    if (!vendedorId) return
    const nome = candidatos(l.CANDIDATOS).find(c => c.id === vendedorId)?.nome ?? ''
    const input = {
      clienteId: String(l.ID_CLIENTE), codFilial: String(l.CODFILIAL), codepto: String(l.CODEPTO),
      idSecao: l.ID_SECAO == null ? '' : String(l.ID_SECAO), vendedorId, agora: agoraBrasilia(),
    }
    setSalvando(chave)
    setAviso(null)
    try {
      const atualizadas = linhasAfetadas(await acao('titularDefinirAtualizar', input))
      const inseridas = linhasAfetadas(await acao('titularDefinirInserir', input))
      setAviso(mensagemTitular(l, nome, atualizadas + inseridas))
      setRecarga(n => n + 1)
    } catch (falha) {
      console.error('s360TitularDefinir', falha)
      setAviso(mensagemTitular(l, nome, 0))
    } finally {
      setSalvando(null)
    }
  }

  const filiais = [...new Map(opcoes.map(o => [String(o.CODFILIAL), { value: String(o.CODFILIAL), label: String(o.FILIAL) }])).values()]
  const deptos = [...new Map(opcoes
    .filter(o => !filtros.filial || String(o.CODFILIAL) === filtros.filial)
    .map(o => [String(o.CODEPTO), { value: String(o.CODEPTO), label: String(o.DEPTO) }])).values()]
  const linhasLista = Array.isArray(lista) ? lista : []
  const total = Number(linhasLista[0]?.TOTAL) || 0

  return (
    <Stack>
      <PageHeader module="Gestão" title="Titulares de Clientes" description={EXPLICACAO_REGRA} />
      <InfoGrid>
        <InfoTile label="Pendentes">{totais ? `${totais.PENDENTES} em ${totais.CLIENTES_PENDENTES} clientes` : <Dash />}</InfoTile>
        <InfoTile label="Com titular">{totais ? totais.COM_TITULAR : <Dash />}</InfoTile>
      </InfoGrid>
      {aviso ? <Alert tone={aviso.ok ? 'success' : 'error'}>{aviso.texto}</Alert> : null}
      <Panel>
        <PanelHeader title="Clientes" hint="Pendentes primeiro, depois a maior venda líquida dos últimos 12 meses." />
        <Toolbar>
          <Field label="Situação">
            <SelectMenu label="Situação" value={filtros.situacao} options={SITUACOES} onChange={v => setFiltros(f => trocarFiltro(f, 'situacao', v))} />
          </Field>
          <Field label="Filial">
            <SelectMenu label="Filial" value={filtros.filial} options={[TODAS, ...filiais]} onChange={v => setFiltros(f => trocarFiltro(f, 'filial', v))} />
          </Field>
          <Field label="Departamento">
            <SelectMenu label="Departamento" value={filtros.depto} options={[{ value: '', label: 'Todos' }, ...deptos]} onChange={v => setFiltros(f => trocarFiltro(f, 'depto', v))} />
          </Field>
          <Field label="Buscar">
            <SearchInput placeholder="Cliente ou código" value={textoBusca} onChange={e => setTextoBusca(e.target.value)} />
          </Field>
        </Toolbar>
        {lista === 'erro' ? (
          <PanelBody><Alert tone="error">Não foi possível carregar os titulares. Tente de novo.</Alert></PanelBody>
        ) : lista && !lista.length ? (
          <EmptyState title="Nenhum cliente nesta situação" hint="Mude a situação, a filial ou a busca." />
        ) : lista ? (
          <Table>
            <thead>
              <tr><Th>Cliente</Th><Th>Filial / departamento</Th><Th>Seção</Th><Th numeric>Venda 12 meses</Th><Th>Situação</Th><Th>Titular</Th></tr>
            </thead>
            <tbody>
              {linhasLista.map(l => {
                const chave = chaveLinha(l)
                const opcoesTitular = candidatos(l.CANDIDATOS).map(c => ({ value: c.id, label: c.nome }))
                const mudou = (escolhas[chave] ?? '') !== (l.TITULAR_ID == null ? '' : String(l.TITULAR_ID))
                return (
                  <Tr key={chave}>
                    <Td><RowTitle>{l.CLIENTE}</RowTitle><RowMeta><Code prefix="#">{l.ID_CLIENTE}</Code></RowMeta></Td>
                    <Td>{l.FILIAL}<RowMeta>{l.DEPTO}</RowMeta></Td>
                    <Td>{l.SECAO}</Td>
                    <Td numeric>{moeda(l.VENDA_12M)}</Td>
                    <Td><Status tone={tomSituacao(l.SITUACAO)}>{rotuloSituacao(l.SITUACAO)}</Status></Td>
                    <Td>
                      {opcoesTitular.length ? (
                        <Actions>
                          <SelectMenu
                            label={`Titular de ${l.CLIENTE}`}
                            value={escolhas[chave] ?? ''}
                            options={opcoesTitular}
                            placeholder={l.TITULAR || 'Escolha o titular'}
                            onChange={v => setEscolhas(e => ({ ...e, [chave]: v }))}
                          />
                          <Button size="sm" variant="primary" disabled={!mudou || salvando !== null} onClick={() => salvar(l)}>Salvar</Button>
                        </Actions>
                      ) : (
                        <RowMeta>{l.TITULAR || 'Sem candidato: nenhum vendedor tem o cliente e a seção no escopo.'}</RowMeta>
                      )}
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>
        ) : null}
        {total > 0 ? (
          <Pagination
            page={filtros.pagina}
            lastPage={ultimaPagina(total, POR_PAGINA)}
            total={total}
            unit="linhas"
            busy={lista === null}
            onPrevious={() => setFiltros(f => ({ ...f, pagina: f.pagina - 1 }))}
            onNext={() => setFiltros(f => ({ ...f, pagina: f.pagina + 1 }))}
          />
        ) : null}
      </Panel>
    </Stack>
  )
}

GestaoTitularesPage.rota = '/gestao-titulares'
