// BUs e Vendedores (spec 010: RF-021, RN-012, C-011). Escopo não é gravado
// aqui (RF-022): só em RCA e Escopo.

import { useState } from 'react'
import type { FormEvent } from 'react'
import { Pencil } from 'lucide-react'
import { linhas } from '@/lib/mitra-api'
import { agoraBrasilia } from '@/lib/formato'
import { confirmacao, validarCodigoBu } from '@/lib/gestao'
import { BlocoFalhou, Confirmacao } from '@/components/Confirmacao'
import type { PedidoConfirmacao } from '@/components/Confirmacao'
import { gravar, useBloco } from '@/components/use-bloco'
import {
  Actions, Alert, Button, Code, FormRow, IconButton, Input, LabelledField, PageHeader, Panel, PanelBody, PanelHeader, RowTitle,
  Stack, Status, Table, Td, Th, Tr,
} from '@/components/page'

export default function BusVendedoresPage() {
  const bus = useBloco(() => linhas('buListar'), [])
  const [codigo, setCodigo] = useState('')
  const [nome, setNome] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tom: 'success' | 'error'; texto: string } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null)

  const limpar = () => {
    setCodigo('')
    setNome('')
    setEditando(null)
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setAviso(null)
    const c = codigo.trim()
    const erro = editando ? null : validarCodigoBu(c, (bus.dados ?? []).map(b => String(b.CODIGO)))
    if (erro || !nome.trim()) {
      setAviso({ tom: 'error', texto: erro ?? 'Informe o nome da BU.' })
      return
    }
    setSalvando(true)
    try {
      const n = await gravar(editando ? 'buAtualizar' : 'buCriar', { codigo: editando ?? c, nome: nome.trim(), agora: agoraBrasilia() })
      if (n < 1) {
        setAviso({ tom: 'error', texto: editando ? 'Nada foi alterado: a BU não foi renomeada.' : `Nada foi alterado: a BU ${c} não foi criada.` })
        return
      }
      setAviso({ tom: 'success', texto: editando ? `BU ${editando} renomeada.` : `BU ${c} criada.` })
      limpar()
      bus.recarregar()
    } catch (falha) {
      console.error('salvar BU', falha)
      setAviso({ tom: 'error', texto: 'Não foi possível salvar a BU agora.' })
    } finally {
      setSalvando(false)
    }
  }

  function alternar(b: Record<string, unknown>) {
    const ativa = Number(b.ATIVO) === 1
    setPedido({
      ...confirmacao(ativa ? 'inativarBu' : 'ativarBu', `${b.CODIGO} · ${b.NOME}`),
      executar: async () => {
        const n = await gravar('buStatusDefinir', { codigo: String(b.CODIGO), ativo: ativa ? 0 : 1, agora: agoraBrasilia() }).catch(() => 0)
        setAviso(n ? { tom: 'success', texto: `BU ${b.CODIGO} ${ativa ? 'inativada' : 'ativada'}.` } : { tom: 'error', texto: 'Nada foi alterado: o status da BU não mudou.' })
        bus.recarregar()
      },
    })
  }

  return (
    <>
      <PageHeader module="Gestão" title="BUs e Vendedores" description="Unidades de negócio = departamentos do ERP. Escopos de vendedores ficam em RCA e Escopo." />
      <Stack>
        <Panel>
          <PanelHeader title={editando ? `Renomear BU ${editando}` : '+ Nova BU'} />
          <PanelBody>
            <form onSubmit={salvar} noValidate>
              <Stack>
                <FormRow>
                  <LabelledField label="Código do departamento no ERP" hint="Numérico, ex.: 1, 2, 3" obrigatorio>
                    <Input inputMode="numeric" value={editando ?? codigo} disabled={!!editando} onChange={e => setCodigo(e.target.value)} />
                  </LabelledField>
                  <LabelledField label="Nome" obrigatorio>
                    <Input value={nome} maxLength={150} onChange={e => setNome(e.target.value)} />
                  </LabelledField>
                </FormRow>
                {aviso && <Alert tone={aviso.tom}>{aviso.texto}</Alert>}
                <Actions>
                  <Button type="submit" variant="primary" disabled={salvando}>
                    {salvando ? 'Salvando…' : editando ? 'Salvar nome' : 'Criar BU'}
                  </Button>
                  {editando && <Button onClick={limpar}>Cancelar</Button>}
                </Actions>
              </Stack>
            </form>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="BUs" />
          {bus.erro ? (
            <BlocoFalhou />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Código</Th>
                  <Th>Nome</Th>
                  <Th>Status</Th>
                  <Th numeric>Vendedores</Th>
                  <Th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {(bus.dados ?? []).map(b => (
                  <Tr key={String(b.CODIGO)}>
                    <Td>
                      <Code>{b.CODIGO}</Code>
                    </Td>
                    <Td>
                      <RowTitle>{b.NOME}</RowTitle>
                    </Td>
                    <Td>
                      <Status tone={Number(b.ATIVO) === 1 ? 'live' : 'off'}>{Number(b.ATIVO) === 1 ? 'Ativa' : 'Inativa'}</Status>
                    </Td>
                    <Td numeric>{Number(b.VENDEDORES)}</Td>
                    <Td numeric>
                      <IconButton
                        label="Renomear"
                        onClick={() => {
                          setEditando(String(b.CODIGO))
                          setNome(String(b.NOME))
                        }}
                      >
                        <Pencil />
                      </IconButton>
                      <Button size="sm" variant="ghost" onClick={() => alternar(b)}>
                        {Number(b.ATIVO) === 1 ? 'Inativar' : 'Ativar'}
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
      </Stack>
      <Confirmacao pedido={pedido} onFechar={() => setPedido(null)} />
    </>
  )
}

BusVendedoresPage.rota = '/gestao-bus-vendedores'
