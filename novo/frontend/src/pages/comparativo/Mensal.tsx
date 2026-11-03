// Comparativo mensal (spec 007, RF-012, RN-017): M−2, M−1 e M por cliente,
// lidos da mesma s360SemanalMatriz da 006 (D-709). `Baixar PDF` abre a
// impressão do navegador numa janela com layout próprio (D-708).

import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { acao } from '@/lib/mitra-api'
import { moeda } from '@/lib/formato'
import { MESES, corBw, fmtBw, type Matriz } from '@/lib/semanal'
import { RECORTES, mensal, mesesMensal, type Recorte } from '@/lib/comparativo'
import { Alert, Button, EmptyState, Field, Panel, PanelHeader, RowTitle, SelectMenu, Stack, Status, Table, Td, Th, Toolbar, Tr } from '@/components/page'
import { useBloco } from '@/components/use-bloco'
import { FaixaIndicadores } from '../clientes/layout'
import { ValorCard } from '../analytics/graficos'

const VISAO: Record<string, string> = { ME: 'Meu painel', TEAM: 'Time inteiro', ALL: 'Todos os coordenadores', COORD: 'Coordenador', SELLER: 'Vendedor' }
const nomeMes = (ano: number, mes: number) => `${MESES[(mes + 11) % 12]}/${ano}`
const anterior = (ano: number, mes: number, n: number) => { const d = new Date(Date.UTC(ano, mes - 1 - n, 1)); return [d.getUTCFullYear(), d.getUTCMonth() + 1] as const }

export function Mensal({ escopo, hoje }: { escopo: Record<string, string>; hoje: string }) {
  const meses = mesesMensal(hoje)
  const [escolhido, setEscolhido] = useState(`${meses[0].ano}-${meses[0].mes}`)
  const [recorte, setRecorte] = useState<Recorte>('TODOS')
  const [ano, mes] = escolhido.split('-').map(Number)
  const input = useMemo(() => ({ ...escopo, ano: String(ano), mes: String(mes) }), [escopo, ano, mes])
  const matriz = useBloco(() => acao('semanalMatriz', input) as Promise<Matriz>, [input])
  const m = matriz.dados?.ok ? matriz.dados : null
  const r = useMemo(() => (m ? mensal(m.linhas, recorte) : null), [m, recorte])
  const titulos = [anterior(ano, mes, 2), anterior(ano, mes, 1), [ano, mes] as const].map(([a, x]) => nomeMes(a, x))
  const rotuloRecorte = RECORTES.find(x => x.value === recorte)?.label ?? ''

  function imprimir() {
    if (!r) return
    const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
    const escopoTexto = [VISAO[escopo.modo] ?? escopo.modo, escopo.filial && `Filial ${escopo.filial}`, escopo.depto && `Depto ${escopo.depto}`, escopo.secao && `Seção ${escopo.secao}`].filter(Boolean).join(' · ')
    const linhasHtml = r.linhas.map(l => `<tr><td>${esc(l.CLIENTE)}${l.selo ? ` <b>${l.selo}</b>` : ''}</td><td>${moeda(l.MES_2)}</td><td>${moeda(l.MES_1)}</td><td>${moeda(l.MES)}</td><td>${moeda(l.variacao)}</td><td>${l.pct === null ? '' : fmtBw(l.pct)}</td></tr>`).join('')
    const janela = window.open('', '_blank')
    if (!janela) return
    janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Comparativo mensal ${esc(titulos[2])}</title>
<style>body{font:12px system-ui,sans-serif;margin:24px;color:#111}h1{font-size:16px;margin:0}p{margin:2px 0 12px;color:#444}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:4px 6px;text-align:right}th:first-child,td:first-child{text-align:left}
th{font-size:10px;text-transform:uppercase;color:#555}b{font-size:9px;color:#a00}</style></head><body>
<h1>Comparativo mensal — ${esc(titulos[2])}</h1><p>Escopo: ${esc(escopoTexto)} · Recorte: ${esc(rotuloRecorte)} · ${r.linhas.length} cliente(s)</p>
<p>${esc(titulos[0])}: ${moeda(r.totais.MES_2)} · ${esc(titulos[1])}: ${moeda(r.totais.MES_1)} · ${esc(titulos[2])}: ${moeda(r.totais.MES)} · Variação: ${moeda(r.variacao)}${r.pct === null ? '' : ` (${fmtBw(r.pct)})`}</p>
<table><thead><tr><th>Cliente</th><th>${esc(titulos[0])}</th><th>${esc(titulos[1])}</th><th>${esc(titulos[2])}</th><th>Variação</th><th>%</th></tr></thead><tbody>${linhasHtml}</tbody></table>
</body></html>`)
    janela.document.close()
    janela.focus()
    janela.print()
  }

  return (
    <Stack>
      {r ? (
        <FaixaIndicadores itens={[
          { rotulo: titulos[0], valor: <ValorCard>{moeda(r.totais.MES_2)}</ValorCard> },
          { rotulo: titulos[1], valor: <ValorCard>{moeda(r.totais.MES_1)}</ValorCard> },
          { rotulo: titulos[2], valor: <ValorCard>{moeda(r.totais.MES)}</ValorCard>, nota: hoje.slice(0, 7) === `${ano}-${String(mes).padStart(2, '0')}` ? 'Parcial até hoje' : undefined },
          { rotulo: 'Variação', valor: <ValorCard>{moeda(r.variacao)}</ValorCard>, nota: r.pct === null ? 'Sem base no mês anterior' : fmtBw(r.pct) },
          { rotulo: 'Clientes', valor: r.linhas.length },
        ]} />
      ) : null}
      <Panel>
        <PanelHeader title="Comparativo mensal" hint="Líquido por cliente da carteira no escopo; ordem pelo maior valor no mês anterior.">
          <Button size="sm" onClick={imprimir} disabled={!r?.linhas.length}><Printer aria-hidden />Baixar PDF</Button>
        </PanelHeader>
        <Toolbar>
          <Field label="Mês">
            <SelectMenu label="Mês" value={escolhido} onChange={setEscolhido} options={meses.map(x => ({ value: `${x.ano}-${x.mes}`, label: nomeMes(x.ano, x.mes) }))} />
          </Field>
          <Field label="Recorte">
            <SelectMenu label="Recorte" value={recorte} onChange={v => setRecorte(v as Recorte)} options={RECORTES} />
          </Field>
        </Toolbar>
        {matriz.erro || (matriz.dados && !matriz.dados.ok) ? (
          <div className="p-4"><Alert tone="error">Não foi possível carregar o comparativo mensal.</Alert></div>
        ) : !r ? (
          <p className="px-4 py-6 text-[13px] text-ink-secondary">Carregando…</p>
        ) : !r.linhas.length ? (
          <EmptyState title="Nenhum cliente neste recorte" />
        ) : (
          <Table>
            <thead>
              <tr><Th>Cliente</Th>{titulos.map(t => <Th key={t} numeric>{t}</Th>)}<Th numeric>Variação</Th><Th numeric>%</Th></tr>
            </thead>
            <tbody>
              {r.linhas.map(l => (
                <Tr key={l.CLIENTE_ID}>
                  <Td>
                    <RowTitle>{l.CLIENTE}</RowTitle>
                    {l.selo ? <span className="ml-2 text-[11px] font-semibold"><Status tone={l.selo === 'NOVO' ? 'live' : 'alert'}>{l.selo}</Status></span> : null}
                  </Td>
                  <Td numeric>{moeda(l.MES_2)}</Td>
                  <Td numeric>{moeda(l.MES_1)}</Td>
                  <Td numeric><RowTitle>{moeda(l.MES)}</RowTitle></Td>
                  <Td numeric className={corBw(l.variacao)}>{moeda(l.variacao)}</Td>
                  <Td numeric className={corBw(l.pct)}>{l.pct === null ? '' : fmtBw(l.pct)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </Stack>
  )
}
