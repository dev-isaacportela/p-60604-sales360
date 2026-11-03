// Gestão de Carteira (spec 010: RF-028, RF-029, RN-017..RN-019, C-018..C-020, RN-025).
// Só coordenador ativo (RN-001): a carteira da equipe nas BUs dele, um vínculo
// por linha (D-010-9). O servidor recorta, confere e conta; a tela monta as
// mensagens da spec. Carteira inteira: prévia → confirmação → um UPDATE (D-010-8, D-010-10).

import { useState } from 'react'
import { linha, linhas } from '@/lib/mitra-api'
import { agoraBrasilia, hojeBrasilia } from '@/lib/formato'
import { confirmacao } from '@/lib/gestao'
import { escoposDoVendedor, mensagemTransferencia, precisaEscolherEscopo, resumoTransferencia, rotuloEscopo } from '@/lib/gestao-carteira'
import type { LinhaEscopo } from '@/lib/gestao-carteira'
import { BlocoFalhou, Confirmacao } from '@/components/Confirmacao'
import type { PedidoConfirmacao } from '@/components/Confirmacao'
import { gravar, useBloco } from '@/components/use-bloco'
import {
  Actions, Alert, Button, Code, EmptyState, Field, FormRow, PageHeader, Pagination, Panel, PanelBody, PanelHeader, RowMeta, RowTitle,
  SearchInput, SelectMenu, Stack, Status, Table, Td, Th, Toolbar, Tr,
} from '@/components/page'

const POR_PAGINA = 50
type Aviso = { tom: 'success' | 'error'; texto: string } | null
type Vinculo = Record<string, unknown>
const vazio = () => Promise.resolve([] as Record<string, unknown>[])

export default function GestaoCarteiraPage() {
  const hoje = hojeBrasilia()
  const [vendedor, setVendedor] = useState('')
  const [ramo, setRamo] = useState('')
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)
  const vendedores = useBloco(() => linhas('gestaoCarteiraVendedores', { hoje }), [])
  const ramos = useBloco(() => linhas('clientesRamos'), [])
  const carteira = useBloco(
    () => linhas('gestaoCarteiraListar', { vendedorId: vendedor || 0, ramo, busca: busca.trim(), limite: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA, hoje }),
    [vendedor, ramo, busca, pagina],
  )
  const [transferindo, setTransferindo] = useState<Vinculo | null>(null)
  const [painel, setPainel] = useState<'toda' | 'adicionar' | null>(null)
  const [aviso, setAviso] = useState<Aviso>(null)
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null)
  const total = Number(carteira.dados?.[0]?.TOTAL ?? 0)

  const equipe = [...new Map((vendedores.dados ?? []).map(v => [String(v.VENDEDOR_ID), { value: String(v.VENDEDOR_ID), label: String(v.NOME), hint: v.COD_RCA ? `RCA ${v.COD_RCA}` : undefined }])).values()]
  const nome = (id: string) => equipe.find(v => v.value === id)?.label ?? 'o vendedor'
  const filtrar = (definir: () => void) => {
    definir()
    setPagina(1)
  }
  const gravou = (a: Aviso) => {
    setAviso(a)
    carteira.recarregar()
  }

  return (
    <>
      <PageHeader
        module="Coordenação"
        title="Gestão de Carteira"
        description="Carteira da sua equipe nas suas BUs. A transferência mantém filial e seção; o destino precisa atuar nelas. Para transferir a carteira inteira, filtre o vendedor."
        actions={
          <>
            <Button onClick={() => setPainel('adicionar')}>Adicionar à carteira</Button>
            <Button variant="primary" disabled={!vendedor} onClick={() => setPainel('toda')}>
              Transferir toda carteira
            </Button>
          </>
        }
      />
      <Stack>
        {aviso && <Alert tone={aviso.tom}>{aviso.texto}</Alert>}
        {vendedores.erro && <Alert tone="error">Não foi possível carregar a sua equipe agora. Tente atualizar a tela.</Alert>}

        {transferindo && (
          <TransferirCliente
            vinculo={transferindo}
            equipe={equipe.filter(v => v.value !== String(transferindo.VENDEDOR_ID))}
            nome={nome}
            hoje={hoje}
            aoFechar={() => setTransferindo(null)}
            aoGravar={a => {
              setTransferindo(null)
              gravou(a)
            }}
          />
        )}
        {painel === 'toda' && vendedor && (
          <TransferirToda
            origem={vendedor}
            equipe={equipe.filter(v => v.value !== vendedor)}
            nome={nome}
            hoje={hoje}
            pedirConfirmacao={setPedido}
            aoFechar={() => setPainel(null)}
            aoGravar={a => {
              setPainel(null)
              gravou(a)
            }}
          />
        )}
        {painel === 'adicionar' && (
          <AdicionarCliente
            equipe={equipe}
            escopos={(vendedores.dados ?? []) as unknown as LinhaEscopo[]}
            inicial={vendedor}
            hoje={hoje}
            aoFechar={() => setPainel(null)}
            aoGravar={gravou}
          />
        )}

        <Panel>
          <PanelHeader title="Carteira da equipe" />
          <Toolbar>
            <SearchInput
              placeholder="Código, nome ou CNPJ"
              aria-label="Buscar cliente por código, nome ou CNPJ"
              value={busca}
              onChange={e => filtrar(() => setBusca(e.target.value))}
            />
            <Field label="Vendedor">
              <SelectMenu label="Vendedor" value={vendedor} options={[{ value: '', label: 'Toda a equipe' }, ...equipe]} onChange={v => filtrar(() => setVendedor(v))} />
            </Field>
            <Field label="Ramo">
              <SelectMenu
                label="Ramo"
                value={ramo}
                options={[{ value: '', label: 'Todos os ramos' }, ...(ramos.dados ?? []).map(r => ({ value: String(r.RAMO), label: String(r.RAMO) }))]}
                onChange={v => filtrar(() => setRamo(v))}
              />
            </Field>
          </Toolbar>
          {carteira.erro ? (
            <BlocoFalhou />
          ) : carteira.dados && carteira.dados.length === 0 ? (
            <EmptyState title="Nenhum cliente encontrado" />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Cliente</Th>
                    <Th>Vendedor</Th>
                    <Th>Ramo</Th>
                    <Th>Cidade/UF</Th>
                    <Th>Status</Th>
                    <Th>Escopo</Th>
                    <Th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {(carteira.dados ?? []).map(c => (
                    <Tr key={`${c.VINCULO_ID}-${c.CODEPTO}`}>
                      <Td>
                        <RowTitle>{c.CLIENTE}</RowTitle>
                        <RowMeta>
                          <Code prefix="Cód.">{c.ID_CLIENTE}</Code>
                        </RowMeta>
                      </Td>
                      <Td>
                        {c.VENDEDOR}
                        {c.COD_RCA && <RowMeta>RCA {c.COD_RCA}</RowMeta>}
                      </Td>
                      <Td>{c.RAMO}</Td>
                      <Td>{[c.CIDADE, c.UF].filter(Boolean).join('/') || '—'}</Td>
                      <Td>
                        <Status tone={c.STATUS === 'ATIVO' ? 'live' : 'attention'}>{c.STATUS === 'ATIVO' ? 'Ativo' : (c.STATUS ?? 'Sem status')}</Status>
                      </Td>
                      <Td>{rotuloEscopo(c as unknown as LinhaEscopo)}</Td>
                      <Td numeric>
                        <Button size="sm" variant="ghost" onClick={() => setTransferindo(c)}>
                          Transferir
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
              <Pagination
                page={pagina}
                lastPage={Math.max(1, Math.ceil(total / POR_PAGINA))}
                total={total}
                unit={total === 1 ? 'vínculo' : 'vínculos'}
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

GestaoCarteiraPage.rota = '/gestao-carteira'

type Opcao = { value: string; label: string; hint?: string }

function TransferirCliente({ vinculo, equipe, nome, hoje, aoFechar, aoGravar }: {
  vinculo: Vinculo; equipe: Opcao[]; nome: (id: string) => string; hoje: string; aoFechar: () => void; aoGravar: (a: Aviso) => void
}) {
  const [destino, setDestino] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function transferir() {
    if (!destino) return setErro('Escolha o vendedor de destino.')
    setSalvando(true)
    setErro('')
    const input = { vinculoId: Number(vinculo.VINCULO_ID), codepto: String(vinculo.CODEPTO), destinoId: Number(destino), hoje }
    try {
      if (await gravar('gestaoCarteiraTransferir', input)) {
        return aoGravar({ tom: 'success', texto: `${vinculo.CLIENTE} transferido para ${nome(destino)}.` })
      }
      const m = await linha('gestaoCarteiraMotivo', input)
      setErro(mensagemTransferencia(String(m?.MOTIVO ?? ''), nome(destino), String(m?.ESCOPO ?? '')))
    } catch (falha) {
      console.error('transferir cliente', falha)
      setErro('Não foi possível transferir agora.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Panel>
      <PanelHeader title={`Transferir cliente · ${vinculo.CLIENTE}`} hint={`De ${vinculo.VENDEDOR} · ${rotuloEscopo(vinculo as unknown as LinhaEscopo)}`} />
      <PanelBody>
        <Stack>
          <FormRow>
            <Field label="Para" obrigatorio>
              <SelectMenu label="Vendedor de destino" value={destino} options={equipe} onChange={setDestino} />
            </Field>
          </FormRow>
          {erro && <Alert tone="error">{erro}</Alert>}
          <Actions>
            <Button onClick={aoFechar}>Cancelar</Button>
            <Button variant="primary" disabled={salvando} onClick={transferir}>
              {salvando ? 'Transferindo…' : 'Transferir'}
            </Button>
          </Actions>
        </Stack>
      </PanelBody>
    </Panel>
  )
}

function TransferirToda({ origem, equipe, nome, hoje, pedirConfirmacao, aoFechar, aoGravar }: {
  origem: string; equipe: Opcao[]; nome: (id: string) => string; hoje: string
  pedirConfirmacao: (p: PedidoConfirmacao) => void; aoFechar: () => void; aoGravar: (a: Aviso) => void
}) {
  const [destino, setDestino] = useState('')
  const [erro, setErro] = useState('')
  const [buscando, setBuscando] = useState(false)
  const input = { origemId: Number(origem), destinoId: Number(destino), hoje }

  async function previa() {
    if (!destino) return setErro('Escolha o vendedor de destino.')
    setBuscando(true)
    setErro('')
    try {
      const p = await linha('gestaoCarteiraPrevia', input)
      const [total, jaTem, semEscopo] = [Number(p?.TOTAL ?? 0), Number(p?.JA_TEM ?? 0), Number(p?.SEM_ESCOPO ?? 0)]
      if (semEscopo) return setErro(mensagemTransferencia('SEM_ESCOPO', nome(destino), String(p?.ESCOPO_FALTANDO ?? '')))
      if (!total) return setErro(`Nada foi alterado: ${nome(origem)} não tem clientes nas suas BUs.`)
      pedirConfirmacao({
        ...confirmacao('transferirCarteira', `de ${nome(origem)} para ${nome(destino)} (${total} ${total === 1 ? 'cliente' : 'clientes'}; ${jaTem} já ${jaTem === 1 ? 'está' : 'estão'} com ${nome(destino)})`),
        executar: async () => {
          const n = await gravar('gestaoCarteiraTransferirToda', input).catch(() => 0)
          if (n) return aoGravar({ tom: 'success', texto: resumoTransferencia(n, jaTem, nome(destino)) })
          // Mudou entre a prévia e o UPDATE: diz o que vale agora.
          const agora = await linha('gestaoCarteiraPrevia', input).catch(() => null)
          aoGravar({
            tom: 'error',
            texto: Number(agora?.SEM_ESCOPO)
              ? mensagemTransferencia('SEM_ESCOPO', nome(destino), String(agora?.ESCOPO_FALTANDO ?? ''))
              : resumoTransferencia(0, Number(agora?.JA_TEM ?? 0), nome(destino)),
          })
        },
      })
    } catch (falha) {
      console.error('prévia da transferência', falha)
      setErro('Não foi possível conferir a carteira agora.')
    } finally {
      setBuscando(false)
    }
  }

  return (
    <Panel>
      <PanelHeader title={`Transferir toda carteira · ${nome(origem)}`} hint="Os clientes que o destino já tem ficam com a origem." />
      <PanelBody>
        <Stack>
          <FormRow>
            <Field label="Para" obrigatorio>
              <SelectMenu label="Vendedor de destino" value={destino} options={equipe} onChange={setDestino} />
            </Field>
          </FormRow>
          {erro && <Alert tone="error">{erro}</Alert>}
          <Actions>
            <Button onClick={aoFechar}>Cancelar</Button>
            <Button variant="primary" disabled={buscando} onClick={previa}>
              {buscando ? 'Conferindo…' : 'Transferir carteira'}
            </Button>
          </Actions>
        </Stack>
      </PanelBody>
    </Panel>
  )
}

function AdicionarCliente({ equipe, escopos, inicial, hoje, aoFechar, aoGravar }: {
  equipe: Opcao[]; escopos: LinhaEscopo[]; inicial: string; hoje: string; aoFechar: () => void; aoGravar: (a: Aviso) => void
}) {
  const [vendedor, setVendedor] = useState(inicial)
  const [escolhido, setEscolhido] = useState('')
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState('')
  const doVendedor = escoposDoVendedor(escopos, vendedor)
  const escolher = precisaEscolherEscopo(doVendedor)
  const escopo = escolher ? doVendedor.find(e => chave(e) === escolhido) : doVendedor[0]
  const disponiveis = useBloco(
    () => (vendedor && escopo && busca.trim() ? linhas('gestaoCarteiraDisponiveis', { vendedorId: Number(vendedor), ...semRotulo(escopo), busca: busca.trim(), hoje }) : vazio()),
    [vendedor, escopo && chave(escopo), busca],
  )

  async function adicionar(c: Record<string, unknown>) {
    if (!escopo) return
    setErro('')
    const n = await gravar('gestaoCarteiraAdicionar', { clienteId: Number(c.ID), vendedorId: Number(vendedor), ...semRotulo(escopo), agora: agoraBrasilia(), hoje }).catch(() => -1)
    if (n > 0) {
      aoGravar({ tom: 'success', texto: `${c.CLIENTE} adicionado à carteira de ${equipe.find(v => v.value === vendedor)?.label} em ${escopo.rotulo}.` })
      disponiveis.recarregar()
    } else {
      setErro(n < 0 ? 'Não foi possível adicionar agora.' : 'Nada foi alterado: o cliente já tem responsável neste escopo ou não está disponível.')
    }
  }

  return (
    <Panel>
      <PanelHeader title="Adicionar à carteira" hint="Só clientes disponíveis, sem Pessoa Física; até 8 resultados." />
      <PanelBody>
        <Stack>
          <FormRow>
            <Field label="Vendedor" obrigatorio>
              <SelectMenu
                label="Vendedor"
                value={vendedor}
                options={equipe}
                onChange={v => {
                  setVendedor(v)
                  setEscolhido('')
                }}
              />
            </Field>
            {escolher && (
              <Field label="Escopo" obrigatorio>
                <SelectMenu label="Escopo" value={escolhido} options={doVendedor.map(e => ({ value: chave(e), label: e.rotulo }))} onChange={setEscolhido} />
              </Field>
            )}
          </FormRow>
          {vendedor && !escolher && escopo && <p className="text-[13px] text-ink-secondary">Escopo: {escopo.rotulo}</p>}
          {vendedor && escopo && (
            <SearchInput placeholder="Código, nome ou CNPJ" aria-label="Buscar cliente disponível" value={busca} onChange={e => setBusca(e.target.value)} />
          )}
          {erro && <Alert tone="error">{erro}</Alert>}
          {disponiveis.erro ? (
            <BlocoFalhou />
          ) : busca.trim() && escopo && disponiveis.dados?.length === 0 ? (
            <EmptyState title="Nenhum cliente disponível com essa busca" />
          ) : (
            (disponiveis.dados ?? []).length > 0 && (
              <Table>
                <tbody>
                  {(disponiveis.dados ?? []).map(c => (
                    <Tr key={c.ID}>
                      <Td>
                        <RowTitle>{c.CLIENTE}</RowTitle>
                        <RowMeta>
                          <Code prefix="Cód.">{c.ID}</Code> · {[c.CIDADE, c.UF].filter(Boolean).join('/')}
                        </RowMeta>
                      </Td>
                      <Td numeric>
                        <Button size="sm" variant="ghost" onClick={() => adicionar(c)}>
                          Adicionar
                        </Button>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )
          )}
          <Actions>
            <Button onClick={aoFechar}>Fechar</Button>
          </Actions>
        </Stack>
      </PanelBody>
    </Panel>
  )
}

const chave = (e: { codFilial: string; codepto: string; idSecao: string }) => `${e.codFilial}|${e.codepto}|${e.idSecao}`
const semRotulo = ({ codFilial, codepto, idSecao }: { codFilial: string; codepto: string; idSecao: string }) => ({ codFilial, codepto, idSecao })
