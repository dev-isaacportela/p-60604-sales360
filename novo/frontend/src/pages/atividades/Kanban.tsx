// Visão Kanban (RN-007): A FAZER, EM ANDAMENTO e CONCLUÍDA. Sem arrastar: o
// status muda pelo seletor do cartão (fora de escopo da spec). Cartão compacto
// e calmo: título, cliente e responsável, e no pé prioridade e prazo. A cor só
// sinaliza (prioridade, prazo vencido ou de hoje); o status é a própria coluna.

import { fmtData } from '@/lib/formato'
import { atrasada, colunasKanban, metaAtividade as meta, rotuloPrioridade } from '@/lib/atividades'
import { Board, BoardCard, BoardColumn, Pagination, Panel } from '@/components/page'
import { cn } from '@/lib/utils'
import { Lixeira, PONTO_PRIORIDADE, SeletorStatus } from './comum'
import type { AcoesAtividade, Linha } from './comum'

const ddmm = (iso: string) => fmtData(iso).slice(0, 5)

// Sinalização: ponto colorido na prioridade; prazo em vermelho se venceu, em âmbar se vence hoje.
function Pe({ a, hoje }: { a: Linha; hoje: string }) {
  const vencida = atrasada(a, hoje)
  const venceHoje = a.STATUS !== 'CONCLUIDA' && a.DATA_LIMITE === hoje
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-[12px]">
      <span className={cn('inline-flex items-center gap-1.5', a.PRIORIDADE === 'ALTA' ? 'font-semibold text-ink' : 'text-ink-secondary')}>
        <span aria-hidden className={cn('size-2 rounded-full', PONTO_PRIORIDADE[a.PRIORIDADE] ?? 'bg-ink-muted')} />
        {rotuloPrioridade(a.PRIORIDADE)}
      </span>
      <span aria-hidden className="text-ink-muted">·</span>
      <span className={cn('whitespace-nowrap', vencida ? 'font-semibold text-destructive' : venceHoje ? 'font-semibold text-attention' : 'text-ink-secondary')}>
        {!a.DATA_LIMITE ? 'sem prazo' : vencida ? `venceu ${ddmm(a.DATA_LIMITE)}` : venceHoje ? 'vence hoje' : `prazo ${ddmm(a.DATA_LIMITE)}`}
      </span>
    </span>
  )
}

export function Kanban({ abertas, concluidas, pagina, mudarPagina, acoes }: {
  abertas: Linha[]
  concluidas: { linhas: Linha[]; total: number } | null
  pagina: number
  mudarPagina: (p: number) => void
  acoes: AcoesAtividade
}) {
  const total = concluidas?.total ?? 0
  const colunas = colunasKanban(abertas, concluidas?.linhas ?? [])
  return (
    <Panel>
      <Board>
        {colunas.map(c => (
          <BoardColumn key={c.status} title={c.titulo} count={c.status === 'CONCLUIDA' ? total : c.itens.length}>
            {c.itens.map(a => (
              <BoardCard key={a.ID}>
                <button type="button" className="text-left font-semibold text-ink hover:underline" onClick={() => acoes.abrir(a)}>{a.TITULO}</button>
                {meta(a, acoes.mostrarResponsavel) ? <span className="text-[12px] text-ink-secondary">{meta(a, acoes.mostrarResponsavel)}</span> : null}
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <Pe a={a} hoje={acoes.hoje} />
                  {a.SOMENTE_LEITURA ? null : <span className="flex items-center gap-1"><SeletorStatus a={a} acoes={acoes} /><Lixeira a={a} acoes={acoes} /></span>}
                </span>
              </BoardCard>
            ))}
          </BoardColumn>
        ))}
      </Board>
      {total > 20 ? (
        <Pagination page={pagina} lastPage={Math.ceil(total / 20)} total={total} unit="concluídas" onPrevious={() => mudarPagina(pagina - 1)} onNext={() => mudarPagina(pagina + 1)} />
      ) : null}
    </Panel>
  )
}
