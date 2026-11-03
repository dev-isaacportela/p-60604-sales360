// Aba Prospects (RF-018): a lista, as etapas, os contatos e a conversão são
// da spec 008. Aqui só o lugar reservado, para a ordem das abas valer já.

import { EmptyState, Panel } from '@/components/page'

export function AbaProspects() {
  return (
    <Panel>
      <EmptyState
        title="Prospects em construção"
        hint="A lista de prospects, com etapa, contatos e conversão em cliente, chega com a spec 008. Os prospects criados pela carteira já ficam gravados."
      />
    </Panel>
  )
}
