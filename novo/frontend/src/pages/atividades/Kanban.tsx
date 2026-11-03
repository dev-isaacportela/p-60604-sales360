// Visão Kanban (RN-007): A FAZER, EM ANDAMENTO e CONCLUÍDA. Sem arrastar: o
// status muda pelo seletor do cartão (fora de escopo da spec). Cartão compacto.

import { colunasKanban, metaAtividade as meta } from '@/lib/atividades'
import { Actions, Board, BoardCard, BoardColumn, Pagination, Panel, RowMeta, TextLink } from '@/components/page'
import { Lixeira, Prazo, Prioridade, SeletorStatus } from './comum'
import type { AcoesAtividade, Linha } from './comum'

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
                <TextLink className="text-left" onClick={() => acoes.abrir(a)}>{a.TITULO}</TextLink>
                <RowMeta>
                  <span className="flex flex-wrap items-center gap-x-2">
                    <Prioridade a={a} /><Prazo a={a} hoje={acoes.hoje} />{meta(a, acoes.mostrarResponsavel)}
                  </span>
                </RowMeta>
                <Actions><SeletorStatus a={a} acoes={acoes} /><Lixeira a={a} acoes={acoes} /></Actions>
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
