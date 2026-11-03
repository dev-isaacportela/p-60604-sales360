// Alertas (spec 008): abas Alertas e Prospecção (`?aba=prospeccao`). O filtro
// de escopo do topo vale para as duas (RNT-003); cada aba carrega só quando
// aberta (RNF-003).

import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { hojeBrasilia } from '@/lib/formato'
import { paraInput } from '@/lib/escopo'
import { Actions, PageHeader, Stack, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/page'
import { FiltroEscopo, useEscopo } from '@/components/FiltroEscopo'
import { AbaAlertas } from './alertas/AbaAlertas'
import { AbaProspeccao } from './alertas/AbaProspeccao'

export default function AlertasPage() {
  const local = useLocation()
  const navegar = useNavigate()
  const aba = new URLSearchParams(local.search).get('aba') === 'prospeccao' ? 'prospeccao' : 'alertas'
  const filtro = useEscopo()
  const escopo = useMemo(() => paraInput(filtro.escopo, hojeBrasilia()), [filtro.escopo])

  return (
    <Stack>
      <PageHeader
        module="Alertas"
        title="Alertas"
        description="O que vender ou recuperar em cada cliente da carteira nesta semana."
        actions={<Actions><FiltroEscopo {...filtro} /></Actions>}
      />
      <Tabs value={aba} onValueChange={v => navegar({ search: v === 'prospeccao' ? '?aba=prospeccao' : '' }, { replace: true })}>
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="alertas" className="flex-none">Alertas</TabsTrigger>
          <TabsTrigger value="prospeccao" className="flex-none">Prospecção</TabsTrigger>
        </TabsList>
        <TabsContent value="alertas">{aba === 'alertas' ? <AbaAlertas escopo={escopo} /> : null}</TabsContent>
        <TabsContent value="prospeccao">{aba === 'prospeccao' ? <AbaProspeccao escopo={escopo} /> : null}</TabsContent>
      </Tabs>
    </Stack>
  )
}

AlertasPage.rota = '/alertas'
