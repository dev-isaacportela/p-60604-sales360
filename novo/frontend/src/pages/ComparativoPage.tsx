// Comparativo (spec 007, RF-012): visões Semanal (spec 006) e Mensal, com o
// filtro de escopo comum no cabeçalho.

import { useMemo, useState } from 'react'
import { hojeBrasilia } from '@/lib/formato'
import { paraInput } from '@/lib/escopo'
import { Actions, PageHeader, Stack, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/page'
import { FiltroEscopo, useEscopo } from '@/components/FiltroEscopo'
import { Semanal } from './comparativo/Semanal'
import { Mensal } from './comparativo/Mensal'

export default function ComparativoPage() {
  const [visao, setVisao] = useState('semanal')
  const hoje = hojeBrasilia()
  const filtro = useEscopo()
  const escopo = useMemo(() => paraInput(filtro.escopo, hoje), [filtro.escopo, hoje])

  return (
    <Stack>
      <PageHeader
        module="Análise"
        title="Comparativo"
        description="Vendas da carteira semana a semana e mês a mês."
        actions={<Actions><FiltroEscopo {...filtro} /></Actions>}
      />
      <Tabs value={visao} onValueChange={setVisao}>
        <TabsList>
          <TabsTrigger value="semanal">Semanal</TabsTrigger>
          <TabsTrigger value="mensal">Mensal</TabsTrigger>
        </TabsList>
        <TabsContent value="semanal"><Semanal escopo={escopo} hoje={hoje} /></TabsContent>
        <TabsContent value="mensal">{visao === 'mensal' ? <Mensal escopo={escopo} hoje={hoje} /> : null}</TabsContent>
      </Tabs>
    </Stack>
  )
}

ComparativoPage.rota = '/comparativo'
