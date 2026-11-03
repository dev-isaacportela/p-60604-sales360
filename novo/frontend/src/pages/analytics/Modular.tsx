// Comparativo modular (spec 007, RF-011, RN-016): até 4 blocos, cada um com
// categoria, métrica, período e itens; uma s360AnalyticsComparativo por bloco.
// Os filtros de Ramos, Clientes e escopo do Analytics valem para todos.

import { useEffect, useMemo, useState } from 'react'
import { Download, Plus, X } from 'lucide-react'
import { linhas } from '@/lib/mitra-api'
import { moeda } from '@/lib/formato'
import { CATEGORIAS, MAX_BLOCOS, METRICAS, blocosPadrao, itensVisiveis, planilhaModular, sugestoes, type Bloco, type Categoria, type ItemBloco, type Metrica } from '@/lib/comparativo'
import { validarIntervalo } from '@/lib/analytics'
import { Alert, Button, Field, IconButton, Input, Panel, PanelBody, PanelHeader, SelectMenu, Stack } from '@/components/page'
import { useBloco } from '@/components/use-bloco'
import { baixarPlanilha } from '@/components/baixar-planilha'
import { BarrasH } from './graficos'
import { EstadoBloco, MultiEscolha } from './comum'

const fmtMetrica = (m: Metrica) => (m === 'FATURAMENTO' ? moeda : (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }))

export function Modular({ params, hoje }: { params: Record<string, string>; hoje: string }) {
  const [blocos, setBlocos] = useState<Bloco[]>(() => blocosPadrao(hoje))
  const [dados, setDados] = useState<Record<number, ItemBloco[]>>({})
  const [aviso, setAviso] = useState<string | null>(null)

  const mudar = (id: number, novo: Partial<Bloco>) => setBlocos(bs => bs.map(b => (b.id === id ? { ...b, ...novo } : b)))
  function adicionar() {
    if (blocos.length >= MAX_BLOCOS) return
    const ultimo = blocos[blocos.length - 1]
    setBlocos(bs => [...bs, { ...ultimo, id: Math.max(...bs.map(b => b.id)) + 1, itens: [] }])
  }

  async function exportar() {
    setAviso(null)
    const lista = blocos.map(b => dados[b.id])
    if (lista.some(d => !d)) { setAviso('Espere todos os blocos carregarem para exportar.'); return }
    try {
      const filtros = [params.ramos && `Ramos ${params.ramos}`, params.clientes && `Clientes ${params.clientes}`, params.produtos && `Produtos ${params.produtos}`].filter(Boolean).join(' · ') || 'Todos'
      await baixarPlanilha(planilhaModular(hoje, blocos.map((b, i) => ({ ...b, id: i + 1 })), lista as ItemBloco[][], filtros))
    } catch (falha) {
      console.error('exportar comparativo', falha)
      setAviso('Não foi possível gerar a planilha. Tente de novo.')
    }
  }

  return (
    <Stack>
      {aviso ? <Alert tone="warn">{aviso}</Alert> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-ink-secondary">Até {MAX_BLOCOS} blocos. O gráfico mostra os 6 maiores, ou os itens escolhidos.</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={adicionar} disabled={blocos.length >= MAX_BLOCOS}><Plus aria-hidden />Adicionar bloco</Button>
          <Button size="sm" onClick={exportar}><Download aria-hidden />Exportar Excel</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {blocos.map((b, i) => (
          <BlocoModular
            key={b.id}
            numero={i + 1}
            bloco={b}
            params={params}
            mudar={novo => mudar(b.id, novo)}
            remover={blocos.length > 1 ? () => setBlocos(bs => bs.filter(x => x.id !== b.id)) : undefined}
            carregado={d => setDados(atual => ({ ...atual, [b.id]: d }))}
          />
        ))}
      </div>
    </Stack>
  )
}

function BlocoModular({ numero, bloco, params, mudar, remover, carregado }: {
  numero: number; bloco: Bloco; params: Record<string, string>
  mudar: (b: Partial<Bloco>) => void; remover?: () => void; carregado: (d: ItemBloco[]) => void
}) {
  const [busca, setBusca] = useState('')
  const erroPeriodo = validarIntervalo(bloco.de, bloco.ate)
  const input = useMemo(
    () => ({ ...params, de: bloco.de, ate: bloco.ate, categoria: bloco.categoria, metrica: bloco.metrica }),
    [params, bloco.de, bloco.ate, bloco.categoria, bloco.metrica],
  )
  const carga = useBloco(() => (erroPeriodo ? Promise.resolve([]) : linhas('analyticsComparativo', input)), [input])
  const itens = useMemo(() => (carga.dados ?? []).map(r => ({ CHAVE: String(r.CHAVE), NOME: String(r.NOME ?? r.CHAVE), VALOR: Number(r.VALOR || 0) })), [carga.dados])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (carga.dados) carregado(itens) }, [itens])

  const escolhidos = bloco.itens.map(k => ({ value: k, label: itens.find(i => i.CHAVE === k)?.NOME ?? k }))
  const visiveis = itensVisiveis(bloco, itens)

  return (
    <Panel>
      <PanelHeader title={`Bloco ${numero}`}>
        {remover ? <IconButton label={`Remover bloco ${numero}`} onClick={remover}><X aria-hidden /></IconButton> : null}
      </PanelHeader>
      <div className="grid grid-cols-2 gap-3 border-b border-rule-row px-4 py-3">
        <Field label="Categoria">
          <SelectMenu label="Categoria" value={bloco.categoria} options={CATEGORIAS} onChange={v => mudar({ categoria: v as Categoria, metrica: 'FATURAMENTO', itens: [] })} />
        </Field>
        <Field label="Métrica">
          <SelectMenu label="Métrica" value={bloco.metrica} options={METRICAS(bloco.categoria)} onChange={v => mudar({ metrica: v as Metrica })} />
        </Field>
        <Field label="De"><Input type="date" aria-label="Data inicial do bloco" value={bloco.de} onChange={e => mudar({ de: e.target.value })} className="h-9" /></Field>
        <Field label="Até"><Input type="date" aria-label="Data final do bloco" value={bloco.ate} onChange={e => mudar({ ate: e.target.value })} className="h-9" /></Field>
        <div className="col-span-2">
          <Field label="Itens">
            <MultiEscolha
              label="Itens"
              opcoes={sugestoes(itens, busca, bloco.itens).map(i => ({ value: i.CHAVE, label: i.NOME }))}
              valor={escolhidos}
              mudar={v => mudar({ itens: v.map(x => x.value) })}
              buscar={setBusca}
              vazio="Os 6 maiores"
            />
          </Field>
        </div>
      </div>
      <PanelBody>
        {erroPeriodo ? <Alert tone="error">{erroPeriodo}</Alert> : (
          <EstadoBloco erro={carga.erro} carregando={!carga.dados && !carga.erro} nome="o bloco">
            <BarrasH itens={visiveis.map(i => ({ chave: i.CHAVE, rotulo: i.NOME, valor: i.VALOR }))} formato={fmtMetrica(bloco.metrica)} />
          </EstadoBloco>
        )}
      </PanelBody>
    </Panel>
  )
}
