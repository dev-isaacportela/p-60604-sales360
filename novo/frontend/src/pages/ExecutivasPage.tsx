// Executivas de Venda — acesso (spec 010: RF-031, RF-032, RN-021, RN-022,
// C-023, C-024). Desativar e reativar pedem confirmação; o servidor recusa a
// executiva desativada em toda ação e na entrada (spec 001, RN-016).

import { useState } from 'react'
import { linhas } from '@/lib/mitra-api'
import { agoraBrasilia, fmtDataHora } from '@/lib/formato'
import { confirmacao, validarMotivo } from '@/lib/gestao'
import { BlocoFalhou, Confirmacao } from '@/components/Confirmacao'
import type { PedidoConfirmacao } from '@/components/Confirmacao'
import { gravar, useBloco } from '@/components/use-bloco'
import { useSessao } from '@/components/sessao-contexto'
import {
  Alert, Button, Dash, EmptyState, Field, LabelledField, PageHeader, Pagination, Panel, PanelHeader, RowMeta, RowTitle,
  SearchInput, SelectMenu, Stack, Status, Table, Td, Textarea, Th, Toolbar, Tr,
} from '@/components/page'

const POR_PAGINA = 20
const FILTROS = [
  { value: 'TODAS', label: 'Todas' },
  { value: 'COM_ACESSO', label: 'Com acesso' },
  { value: 'DESATIVADAS', label: 'Desativadas' },
]

/** Campo do motivo dentro do diálogo: estado próprio; avisa quem abriu o diálogo a cada tecla. */
function CampoMotivo({ onMudar }: { onMudar: (texto: string) => void }) {
  const [texto, setTexto] = useState('')
  const erro = validarMotivo(texto)
  return (
    <LabelledField label="Motivo (opcional)" hint={erro ?? `${texto.trim().length}/500`} hintTone={erro ? 'error' : 'muted'}>
      <Textarea
        value={texto}
        onChange={e => {
          setTexto(e.target.value)
          onMudar(e.target.value)
        }}
      />
    </LabelledField>
  )
}

export default function ExecutivasPage() {
  const { sessao } = useSessao()
  const global = sessao.papeis.includes('DIRETORIA') || sessao.papeis.includes('ADMIN')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('TODAS')
  const [pagina, setPagina] = useState(1)
  const lista = useBloco(
    () => linhas('executivaListar', { busca: busca.trim(), filtro, limite: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA }),
    [busca, filtro, pagina],
  )
  const [aviso, setAviso] = useState<{ tom: 'success' | 'error'; texto: string } | null>(null)
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null)
  const total = Number(lista.dados?.[0]?.TOTAL ?? 0)

  function alternar(x: Record<string, unknown>) {
    const desativar = Number(x.BLOQUEADO) !== 1
    const motivo = { valor: '' }
    setPedido({
      ...confirmacao(desativar ? 'desativarAcesso' : 'reativarAcesso', String(x.NOME)),
      extra: desativar ? <CampoMotivo onMudar={texto => (motivo.valor = texto)} /> : undefined,
      executar: async () => {
        const erro = validarMotivo(motivo.valor)
        if (erro) return setAviso({ tom: 'error', texto: erro })
        const userId = Number(x.USER_ID)
        let n = 0
        try {
          await gravar('executivaAcessoGarantir', { userId })
          n = await gravar('executivaAcessoAlterar', { userId, bloqueado: desativar ? 1 : 0, motivo: desativar ? motivo.valor.trim() : '', agora: agoraBrasilia() })
        } catch (falha) {
          console.error('alterar acesso', falha)
        }
        setAviso(n
          ? { tom: 'success', texto: `${x.NOME}: acesso ${desativar ? 'desativado' : 'reativado'}.` }
          : { tom: 'error', texto: 'Nada foi alterado: você não tem permissão sobre esta executiva.' })
        lista.recarregar()
      },
    })
  }

  return (
    <>
      <PageHeader
        module="Gestão"
        title="Executivas de Venda"
        description={global ? 'Acesso das executivas de todas as equipes.' : 'Você vê as executivas do seu departamento.'}
      />
      <Stack>
        {aviso && <Alert tone={aviso.tom}>{aviso.texto}</Alert>}
        <Panel>
          <PanelHeader title="Executivas" hint="Desativadas primeiro." />
          <Toolbar>
            <SearchInput
              placeholder="Buscar por nome ou e-mail"
              aria-label="Buscar por nome ou e-mail"
              value={busca}
              onChange={e => {
                setBusca(e.target.value)
                setPagina(1)
              }}
            />
            <Field label="Situação">
              <SelectMenu
                label="Situação"
                value={filtro}
                options={FILTROS}
                onChange={v => {
                  setFiltro(v)
                  setPagina(1)
                }}
              />
            </Field>
          </Toolbar>
          {lista.erro ? (
            <BlocoFalhou />
          ) : lista.dados && lista.dados.length === 0 ? (
            <EmptyState title="Nenhuma executiva encontrada" />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Executiva</Th>
                    <Th>Situação</Th>
                    <Th>Alterado por</Th>
                    <Th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {(lista.dados ?? []).map(x => {
                    const desativada = Number(x.BLOQUEADO) === 1
                    return (
                      <Tr key={x.USER_ID}>
                        <Td>
                          <RowTitle>{x.NOME}</RowTitle>
                          <RowMeta>{x.EMAIL}</RowMeta>
                        </Td>
                        <Td>
                          <Status tone={desativada ? 'alert' : 'live'}>{desativada ? 'Desativada' : 'Com acesso'}</Status>
                          {desativada && x.MOTIVO && <RowMeta>{x.MOTIVO}</RowMeta>}
                        </Td>
                        <Td>
                          {x.ATUALIZADO_POR ? (
                            <>
                              {x.ATUALIZADO_POR}
                              <RowMeta>{fmtDataHora(String(x.ATUALIZADO_EM ?? '').replace(' ', 'T'))}</RowMeta>
                            </>
                          ) : (
                            <Dash />
                          )}
                        </Td>
                        <Td numeric>
                          <Button size="sm" variant={desativada ? 'secondary' : 'ghost'} onClick={() => alternar(x)}>
                            {desativada ? 'Reativar acesso' : 'Desativar acesso'}
                          </Button>
                        </Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </Table>
              <Pagination
                page={pagina}
                lastPage={Math.max(1, Math.ceil(total / POR_PAGINA))}
                total={total}
                unit="executivas"
                onPrevious={() => setPagina(p => p - 1)}
                onNext={() => setPagina(p => p + 1)}
              />
            </>
          )}
        </Panel>
      </Stack>
      <Confirmacao pedido={pedido} onFechar={() => setPedido(null)} />
    </>
  )
}

ExecutivasPage.rota = '/gestao-acesso-executivas'
