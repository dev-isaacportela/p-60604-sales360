// `/clientes/:clienteId` (RF-015): a mesma tela de Clientes, com a carteira
// buscando o cliente. Rota própria porque App.tsx casa uma tela por `.rota`.

import ClientesPage from './ClientesPage'

export default function ClienteBuscaPage() {
  return <ClientesPage />
}

ClienteBuscaPage.rota = '/clientes/:clienteId'
