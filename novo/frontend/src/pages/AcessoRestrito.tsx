import { tituloDaRota } from '@/lib/menu'
import { mensagemBloqueio } from '@/lib/gestao'
import { EmptyState, PageHeader, Panel } from '@/components/page'
import { useSessao } from '@/components/sessao-contexto'

/** Mensagem padrão de tela restrita (RN-015 da 001, RN-001/RN-002 da 010). Nenhuma SF da tela é chamada. */
export function AcessoRestrito({ caminho }: { caminho: string }) {
  const { sessao } = useSessao()
  return (
    <>
      <PageHeader module="Sales 360" title={tituloDaRota(caminho)} />
      <Panel>
        <EmptyState title="Acesso restrito" hint={mensagemBloqueio(caminho, sessao).join(' ')} />
      </Panel>
    </>
  )
}
