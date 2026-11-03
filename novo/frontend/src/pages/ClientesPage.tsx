// Clientes (spec 002): Minha Carteira, Clientes Disponíveis, Histórico do
// Cliente e Prospects, nessa ordem (RF-018). `/clientes/:clienteId` abre a
// carteira buscando o cliente; `?clienteId=` abre o histórico (RF-015).

import { useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { hojeBrasilia } from '@/lib/formato'
import { paraInput } from '@/lib/escopo'
import { ABAS, abaInicial } from '@/lib/carteira'
import { PageHeader, Panel, Stack, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/page'
import { FiltroEscopo, useEscopo } from '@/components/FiltroEscopo'
import { AbaCarteira } from './clientes/AbaCarteira'
import { AbaDisponiveis } from './clientes/AbaDisponiveis'
import { AbaHistorico } from './clientes/AbaHistorico'
import { AbaProspects } from './clientes/AbaProspects'

export default function ClientesPage() {
  const params = useParams()
  const local = useLocation()
  const inicio = useMemo(() => abaInicial(params, local.search), [params, local.search])
  const [aba, setAba] = useState(inicio.aba)
  const [historicoDe, setHistoricoDe] = useState(inicio.clienteId)
  const [totalCarteira, setTotalCarteira] = useState<number | null>(null)
  const [recargaCarteira, setRecargaCarteira] = useState(0)
  const filtro = useEscopo()
  const escopo = useMemo(() => paraInput(filtro.escopo, hojeBrasilia()), [filtro.escopo])

  function abrirHistorico(clienteId: number) {
    setHistoricoDe(String(clienteId))
    setAba('historico')
  }

  return (
    <Stack>
      <PageHeader module="Clientes" title="Clientes" description="Sua carteira, clientes para adicionar e o histórico de cada um." />
      {aba === 'carteira' || aba === 'historico' ? (
        <Panel><FiltroEscopo {...filtro} /></Panel>
      ) : null}
      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          {ABAS.map(a => (
            <TabsTrigger key={a.id} value={a.id}>
              {a.id === 'carteira' && totalCarteira !== null ? `${a.rotulo} (${totalCarteira})` : a.rotulo}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="carteira">
          <AbaCarteira key={recargaCarteira} escopo={escopo} buscaInicial={inicio.busca} aoTotal={setTotalCarteira} abrirHistorico={abrirHistorico} />
        </TabsContent>
        <TabsContent value="disponiveis">
          <AbaDisponiveis aoAdicionar={() => setRecargaCarteira(n => n + 1)} />
        </TabsContent>
        <TabsContent value="historico">
          <AbaHistorico key={historicoDe} escopo={escopo} clienteInicial={historicoDe} />
        </TabsContent>
        <TabsContent value="prospects">
          <AbaProspects />
        </TabsContent>
      </Tabs>
    </Stack>
  )
}

ClientesPage.rota = '/clientes'
