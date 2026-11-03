// Filtro de escopo de visualização (RNT-003/004), no topo das telas que
// recortam pela carteira. A regra (padrão, cascata, quem vê) mora em
// lib/escopo.ts; aqui só o estado e os seletores.

import { useEffect, useMemo, useState } from 'react'
import { linhas } from '@/lib/mitra-api'
import { getSession } from '@/lib/mitra-auth'
import { escopoPadrao, lembrar, mostraFiltro, opcoesEscopo, recuperar, trocar, valorVisao, visoes } from '@/lib/escopo'
import { Field, MoreFilters, SelectMenu } from '@/components/page'
import { useSessao } from '@/components/sessao-contexto'

// Um pedaço do token: login novo = marca nova = volta ao padrão do perfil.
const marca = () => (getSession()?.token ?? '').slice(-16)

const TODOS = { value: '', label: 'Todos' }

type Escopo = ReturnType<typeof recuperar>
type LinhaEscopo = Record<string, unknown>

export function useEscopo() {
  const { sessao } = useSessao()
  const [escopo, setEscopo] = useState<Escopo>(() => recuperar(sessao, marca(), sessionStorage))
  const [opcoes, setOpcoes] = useState<LinhaEscopo[] | null>(null)

  useEffect(() => {
    linhas('escopoOpcoes')
      .then(setOpcoes)
      .catch(falha => {
        console.error('s360EscopoOpcoes', falha)
        setOpcoes([])
      })
  }, [])

  function mudar(campo: Parameters<typeof trocar>[1], valor: string) {
    const novo = trocar(escopo, campo, valor)
    setEscopo(novo)
    lembrar(novo, marca(), sessionStorage)
  }

  function limpar() {
    const padrao = escopoPadrao(sessao)
    setEscopo(padrao)
    lembrar(padrao, marca(), sessionStorage)
  }

  return { escopo, opcoes, mudar, limpar }
}

/** Botão-resumo do escopo ("Escopo: Meu painel" + quantos recortes) que abre os seletores. */
export function FiltroEscopo({ escopo, opcoes, mudar, limpar }: ReturnType<typeof useEscopo>) {
  const { sessao } = useSessao()
  const lista = useMemo(() => opcoes ?? [], [opcoes])
  const op = useMemo(() => opcoesEscopo(lista, escopo), [lista, escopo])
  if (!opcoes || !mostraFiltro(sessao, lista)) return null
  const listaVisoes = visoes(sessao, lista)
  const visao = listaVisoes.find(v => v.value === valorVisao(escopo))?.label ?? 'Meu painel'
  const recortes = [escopo.vendedor, escopo.filial, escopo.depto, escopo.secao].filter(Boolean).length

  return (
    <MoreFilters label={`Escopo: ${visao}`} count={recortes} onClear={limpar}>
      {listaVisoes.length > 1 ? (
        <Field label="Visão">
          <SelectMenu label="Visão" value={valorVisao(escopo)} options={listaVisoes} onChange={v => mudar('visao', v)} />
        </Field>
      ) : null}
      {escopo.visao !== 'ME' ? (
        <Field label="Vendedor">
          <SelectMenu label="Vendedor" value={escopo.vendedor} options={[TODOS, ...op.vendedores]} onChange={v => mudar('vendedor', v)} />
        </Field>
      ) : null}
      <Field label="Filial">
        <SelectMenu label="Filial" value={escopo.filial} options={[TODOS, ...op.filiais]} onChange={v => mudar('filial', v)} />
      </Field>
      <Field label="Departamento">
        <SelectMenu label="Departamento" value={escopo.depto} options={[TODOS, ...op.deptos]} onChange={v => mudar('depto', v)} />
      </Field>
      <Field label="Seção">
        <SelectMenu label="Seção" value={escopo.secao} options={[TODOS, ...op.secoes]} onChange={v => mudar('secao', v)} />
      </Field>
    </MoreFilters>
  )
}
