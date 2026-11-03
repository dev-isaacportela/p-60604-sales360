// Visão Lista (RN-007): "Atividades abertas" e o bloco CONCLUÍDA recolhido,
// 20 por página. Tabela no desktop, cartões compactos no celular.

import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  Actions, EmptyState, Pagination, Panel, PanelHeader, RowMeta, Table, Td, TextLink, Th, Tr,
} from '@/components/page'
import { Cartao, ListaCartoes, SoCelular, SoDesktop } from '../clientes/layout'
import { metaAtividade as meta } from '@/lib/atividades'
import { Lixeira, Prazo, Prioridade, SeletorStatus } from './comum'
import type { AcoesAtividade, Linha } from './comum'

function Linhas({ itens, acoes }: { itens: Linha[]; acoes: AcoesAtividade }) {
  return (
    <>
      <SoDesktop>
        <Table>
          <thead>
            <tr>
              <Th>Atividade</Th>
              <Th>Prioridade</Th>
              <Th>Prazo</Th>
              <Th>Status</Th>
              <Th><span className="sr-only">Ações</span></Th>
            </tr>
          </thead>
          <tbody>
            {itens.map(a => (
              <Tr key={a.ID}>
                <Td>
                  <TextLink onClick={() => acoes.abrir(a)}>{a.TITULO}</TextLink>
                  {meta(a, acoes.mostrarResponsavel) ? <RowMeta>{meta(a, acoes.mostrarResponsavel)}</RowMeta> : null}
                </Td>
                <Td><Prioridade a={a} /></Td>
                <Td><Prazo a={a} hoje={acoes.hoje} /></Td>
                <Td><SeletorStatus a={a} acoes={acoes} /></Td>
                <Td className="w-10"><Lixeira a={a} acoes={acoes} /></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </SoDesktop>
      <SoCelular>
        <ListaCartoes>
          {itens.map(a => (
            <Cartao
              key={a.ID}
              titulo={<TextLink onClick={() => acoes.abrir(a)}>{a.TITULO}</TextLink>}
              meta={<><Prioridade a={a} /><Prazo a={a} hoje={acoes.hoje} />{meta(a, acoes.mostrarResponsavel)}</>}
              acoes={<Actions><SeletorStatus a={a} acoes={acoes} /><Lixeira a={a} acoes={acoes} /></Actions>}
            />
          ))}
        </ListaCartoes>
      </SoCelular>
    </>
  )
}

export function Lista({ abertas, concluidas, aberto, alternar, pagina, mudarPagina, acoes }: {
  abertas: Linha[]
  concluidas: { linhas: Linha[]; total: number } | null
  aberto: boolean
  alternar: () => void
  pagina: number
  mudarPagina: (p: number) => void
  acoes: AcoesAtividade
}) {
  const total = concluidas?.total ?? 0
  const ultima = Math.max(1, Math.ceil(total / 20))
  return (
    <>
      <Panel>
        <PanelHeader title="Atividades abertas" hint={`${abertas.length} a fazer ou em andamento`} />
        {abertas.length ? <Linhas itens={abertas} acoes={acoes} /> : <EmptyState title="Nenhuma atividade aberta" hint="Crie uma atividade ou mude os filtros." />}
      </Panel>
      <Panel>
        <PanelHeader title="CONCLUÍDA">
          <TextLink onClick={alternar} aria-expanded={aberto}>
            {aberto ? <ChevronDown aria-hidden className="size-4" /> : <ChevronRight aria-hidden className="size-4" />}
            {aberto ? 'Recolher' : 'Mostrar concluídas'}
          </TextLink>
        </PanelHeader>
        {aberto ? (
          concluidas === null ? <EmptyState title="Carregando…" /> : concluidas.linhas.length ? (
            <>
              <Linhas itens={concluidas.linhas} acoes={acoes} />
              {total > 20 ? (
                <Pagination page={pagina} lastPage={ultima} total={total} unit="concluídas" onPrevious={() => mudarPagina(pagina - 1)} onNext={() => mudarPagina(pagina + 1)} />
              ) : null}
            </>
          ) : <EmptyState title="Nenhuma atividade concluída" />
        ) : null}
      </Panel>
    </>
  )
}
