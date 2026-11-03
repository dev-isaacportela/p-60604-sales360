// "Ver padrão histórico" (RF-007, RN-014): 13 meses em barras CSS; em Volume
// Crescente, também as sugestões de produto (RN-005). Só carrega ao expandir.

import { linhas } from '@/lib/mitra-api'
import { moeda } from '@/lib/formato'
import { desdeHistorico, serieHistorica, sugestoes, tituloHistorico } from '@/lib/alertas'
import { useBloco } from '@/components/use-bloco'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

export function Historico({ alerta, escopo }: { alerta: Linha; escopo: Record<string, string> }) {
  const entrada = { ...escopo, alertaId: String(alerta.ID), desde: desdeHistorico(escopo.hoje) }
  const meses = useBloco(() => linhas('alertaHistorico', entrada), [alerta.ID, escopo])
  const volume = alerta.TIPO_ALERTA === 'VOLUME_CRESCENTE'
  const sugeridos = useBloco(() => (volume ? linhas('alertaSugestoes', entrada) : Promise.resolve([])), [alerta.ID, escopo])

  if (meses.erro) return <p className="mt-2 text-[12px] text-ink-secondary">Dados históricos indisponíveis.</p>
  if (!meses.dados) return <p className="mt-2 text-[12px] text-ink-secondary">Carregando histórico…</p>
  const serie = serieHistorica(escopo.hoje, meses.dados)
  const maior = Math.max(1, ...serie.map(s => s.valor))
  const lista = sugestoes(sugeridos.dados ?? [])

  return (
    <div className="mt-2 rounded-xl border border-rule-row p-3">
      <p className="text-[12px] font-semibold text-ink">
        {alerta.PRODUTO_REFERENCIA || alerta.CLIENTE} — {tituloHistorico(serie)}
      </p>
      <div className="mt-2 flex h-24 items-end gap-1" role="img" aria-label={`Compras por mês: ${serie.map(s => `${s.rotulo} ${moeda(s.valor)}`).join(', ')}`}>
        {serie.map(s => (
          <div key={s.mes} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${s.rotulo}: ${moeda(s.valor)} · ${s.pedidos} pedidos`}>
            <div className={s.valor > 0 ? 'rounded-t bg-primary' : 'h-px bg-rule-row'} style={s.valor > 0 ? { height: `${(s.valor / maior) * 100}%` } : undefined} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-[10px] text-ink-muted">
        {serie.map((s, i) => <span key={s.mes} className="min-w-0 flex-1 truncate text-center">{i % 2 === 0 ? s.rotulo : ''}</span>)}
      </div>
      {volume && lista.length ? (
        <p className="mt-2 text-[12px] text-ink-secondary">
          <span className="font-semibold text-ink">Sugestões para ampliar o pedido:</span> {lista.join(' · ')}
        </p>
      ) : null}
    </div>
  )
}
