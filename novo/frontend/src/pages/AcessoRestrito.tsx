import { perfisPermitidos, tituloDaRota } from '@/lib/menu'
import { EmptyState, PageHeader, Panel } from '@/components/page'

/** Mensagem padrão de tela restrita (RN-015). Nenhuma SF da tela é chamada. */
export function AcessoRestrito({ caminho }: { caminho: string }) {
  return (
    <>
      <PageHeader module="Sales 360" title={tituloDaRota(caminho)} />
      <Panel>
        <EmptyState title="Acesso restrito" hint={`Esta tela está disponível apenas para ${perfisPermitidos(caminho)}.`} />
      </Panel>
    </>
  )
}
