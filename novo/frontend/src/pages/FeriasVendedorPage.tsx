// Férias de Vendedores (spec 010: RF-030, RN-020, C-021, C-022, C-026).
// Cadastro único de férias (RNT-010). Coordenador vê a equipe; diretoria e
// TI, todos. Se a lista falha, o formulário continua usável (C-026).

import { useState } from 'react'
import type { FormEvent } from 'react'
import { linhas } from '@/lib/mitra-api'
import { fmtData, hojeBrasilia } from '@/lib/formato'
import { confirmacao } from '@/lib/gestao'
import { validarFerias } from '@/lib/ferias'
import { BlocoFalhou, Confirmacao } from '@/components/Confirmacao'
import type { PedidoConfirmacao } from '@/components/Confirmacao'
import { gravar, useBloco } from '@/components/use-bloco'
import {
  Actions, Alert, Button, EmptyState, Field, FormRow, Input, LabelledField, PageHeader, Panel, PanelBody, PanelHeader, RowTitle,
  SelectMenu, Stack, Status, Table, Td, Th, Tr,
} from '@/components/page'

export default function FeriasVendedorPage() {
  const hoje = hojeBrasilia()
  const pessoas = useBloco(() => linhas('feriasPessoas'), [])
  const ferias = useBloco(() => linhas('feriasListar', { hoje }), [])
  const [titular, setTitular] = useState('')
  const [substituto, setSubstituto] = useState('')
  const [inicio, setInicio] = useState('')
  const [fim, setFim] = useState('')
  const [aviso, setAviso] = useState<{ tom: 'success' | 'error'; texto: string } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null)

  const opcoes = (pessoas.dados ?? []).map(p => ({ value: String(p.USER_ID), label: p.NOME, hint: `RCA ${p.COD_RCA}` }))

  async function cadastrar(e: FormEvent) {
    e.preventDefault()
    setAviso(null)
    const nova = { titularId: Number(titular), substitutoId: Number(substituto), inicio, fim }
    const erro = validarFerias(nova, (ferias.dados ?? []) as Parameters<typeof validarFerias>[1], (pessoas.dados ?? []) as Parameters<typeof validarFerias>[2])
    if (erro) return setAviso({ tom: 'error', texto: erro })
    setSalvando(true)
    try {
      if ((await gravar('feriasCadastrar', nova)) < 1) {
        return setAviso({ tom: 'error', texto: 'Nada foi alterado: confira o vendedor, o substituto e o período (sobreposição ou substituição no mesmo período).' })
      }
      setAviso({ tom: 'success', texto: `Férias cadastradas de ${fmtData(inicio)} a ${fmtData(fim)}.` })
      setTitular('')
      setSubstituto('')
      setInicio('')
      setFim('')
      ferias.recarregar()
    } catch (falha) {
      console.error('cadastrar férias', falha)
      setAviso({ tom: 'error', texto: 'Não foi possível cadastrar as férias agora.' })
    } finally {
      setSalvando(false)
    }
  }

  function encerrar(f: Record<string, unknown>) {
    setPedido({
      ...confirmacao('encerrarFerias', `${f.TITULAR} (${fmtData(String(f.DT_INICIO))} a ${fmtData(String(f.DT_FIM))})`),
      executar: async () => {
        const n = await gravar('feriasEncerrar', { id: Number(f.ID), hoje }).catch(() => 0)
        const texto = f.ESTADO === 'FUTURA' ? `Férias de ${f.TITULAR} canceladas.` : `Férias de ${f.TITULAR} encerradas em ${fmtData(hoje)}.`
        setAviso(n ? { tom: 'success', texto } : { tom: 'error', texto: 'Nada foi alterado: as férias não foram encerradas.' })
        ferias.recarregar()
      },
    })
  }

  return (
    <>
      <PageHeader module="Coordenação" title="Férias de Vendedores" description="Durante as férias, o substituto vê carteira, agenda e vendas do titular. Atividades e propostas não passam." />
      <Stack>
        <Panel>
          <PanelHeader title="Cadastrar férias" />
          <PanelBody>
            <form onSubmit={cadastrar} noValidate>
              <Stack>
                {pessoas.erro && <Alert tone="error">Não foi possível carregar a lista de vendedores agora. Tente atualizar a tela.</Alert>}
                <FormRow>
                  <Field label="Vendedor" obrigatorio>
                    <SelectMenu label="Vendedor" value={titular} options={opcoes} onChange={setTitular} />
                  </Field>
                  <Field label="Substituto" obrigatorio>
                    <SelectMenu label="Substituto" value={substituto} options={opcoes.filter(o => o.value !== titular)} onChange={setSubstituto} />
                  </Field>
                </FormRow>
                <FormRow>
                  <LabelledField label="Início" obrigatorio>
                    <Input type="date" value={inicio} onChange={e => setInicio(e.target.value)} />
                  </LabelledField>
                  <LabelledField label="Fim" obrigatorio>
                    <Input type="date" value={fim} min={inicio || undefined} onChange={e => setFim(e.target.value)} />
                  </LabelledField>
                </FormRow>
                {aviso && <Alert tone={aviso.tom}>{aviso.texto}</Alert>}
                <Actions>
                  <Button type="submit" variant="primary" disabled={salvando}>
                    {salvando ? 'Cadastrando…' : 'Cadastrar férias'}
                  </Button>
                </Actions>
              </Stack>
            </form>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Férias ativas e futuras" />
          {ferias.erro ? (
            <BlocoFalhou />
          ) : ferias.dados && ferias.dados.length === 0 ? (
            <EmptyState title="Nenhuma férias ativa ou futura" />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Vendedor</Th>
                  <Th>Substituto</Th>
                  <Th>Período</Th>
                  <Th>Estado</Th>
                  <Th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {(ferias.dados ?? []).map(f => (
                  <Tr key={f.ID}>
                    <Td>
                      <RowTitle>{f.TITULAR}</RowTitle>
                    </Td>
                    <Td>{f.SUBSTITUTO}</Td>
                    <Td>
                      {fmtData(f.DT_INICIO)} a {fmtData(f.DT_FIM)}
                    </Td>
                    <Td>
                      <Status tone={f.ESTADO === 'ATIVA' ? 'attention' : 'live'}>{f.ESTADO === 'ATIVA' ? 'Ativa' : 'Futura'}</Status>
                    </Td>
                    <Td numeric>
                      <Button size="sm" variant="ghost" onClick={() => encerrar(f)}>
                        Encerrar
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

FeriasVendedorPage.rota = '/ferias-vendedor'
