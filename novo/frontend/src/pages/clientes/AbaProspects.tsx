// Aba Prospects (RF-015…017 da spec 008): lista com etapa, contatos e
// visitas; mudar etapa, adicionar contato e converter só para o responsável
// ou o substituto com férias ativas (PODE_EDITAR, P-1). Coordenação e
// diretoria só veem.

import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { ArrowRightLeft, Eye, UserCheck, UserPlus } from 'lucide-react'
import { linhas } from '@/lib/mitra-api'
import { fmtData, moeda } from '@/lib/formato'
import {
  ETAPAS, MSG_CODIGO_INEXISTENTE, MSG_CONVERTIDO, etapasPermitidas, rotuloEtapa, tomEtapa, validarContato, validarConversao,
} from '@/lib/alertas'
import {
  Alert, Button, Code, Dash, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, EmptyState, Field,
  FormRow, Input, LabelledField, Pagination, Panel, PanelBody, RowMeta, RowTitle, SearchInput, SelectMenu, Stack, Status, Table,
  Td, Th, Toolbar, Tr,
} from '@/components/page'
import { gravar, useBloco } from '@/components/use-bloco'
import { BlocoFalhou, Marcador } from '@/components/Confirmacao'
import { Cartao, Cresce, ListaCartoes, MenuAcoes, SoCelular, SoDesktop } from './layout'
import type { AcaoMenu } from './layout'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>
type Janela = 'detalhe' | 'etapa' | 'contato' | 'converter'

const POR_PAGINA = 20
const TODAS = [{ value: '', label: 'Todas' }, ...ETAPAS]

export function AbaProspects() {
  const [etapa, setEtapa] = useState('')
  const [textoBusca, setTextoBusca] = useState('')
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)
  const [recarga, setRecarga] = useState(0)
  const [aberto, setAberto] = useState<{ janela: Janela; p: Linha } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => { setBusca(textoBusca); setPagina(1) }, 400)
    return () => clearTimeout(t)
  }, [textoBusca])

  const bloco = useBloco(() => linhas('prospectsListar', { etapa, busca, pagina: String(pagina) }), [etapa, busca, pagina, recarga])
  const lista = bloco.dados ?? []
  const total = Number(lista[0]?.TOTAL) || 0
  const temFiltro = !!(etapa || busca)

  const abrir = (janela: Janela, p: Linha) => { setAviso(null); setAberto({ janela, p }) }
  const salvo = (texto: string) => { setAberto(null); setAviso(texto); setRecarga(n => n + 1) }
  const acoesDe = (p: Linha): AcaoMenu[] => [
    { rotulo: 'Ver contatos e visitas', icone: <Eye aria-hidden />, onClick: () => abrir('detalhe', p) },
    ...(Number(p.PODE_EDITAR) === 1 && p.ETAPA !== 'CONVERTIDO'
      ? [
          { rotulo: 'Mudar etapa', icone: <ArrowRightLeft aria-hidden />, onClick: () => abrir('etapa', p) },
          { rotulo: 'Adicionar contato', icone: <UserPlus aria-hidden />, onClick: () => abrir('contato', p) },
          { rotulo: 'Converter em cliente', icone: <UserCheck aria-hidden />, onClick: () => abrir('converter', p) },
        ]
      : []),
  ]
  const passo = (p: Linha) => (p.PROXIMO_PASSO ? `${p.PROXIMO_PASSO}${p.DATA_PROXIMO_PASSO ? ` até ${fmtData(p.DATA_PROXIMO_PASSO)}` : ''}` : null)

  return (
    <Stack>
      {aviso ? <Alert tone="success">{aviso}</Alert> : null}
      <Panel>
        <Toolbar>
          <Cresce>
            <Field label="Buscar">
              <SearchInput placeholder="Razão social, fantasia, cidade ou CNPJ" value={textoBusca} onChange={e => setTextoBusca(e.target.value)} />
            </Field>
          </Cresce>
          <Field label="Etapa" className="w-44">
            <SelectMenu label="Etapa" value={etapa} options={TODAS} onChange={v => { setEtapa(v); setPagina(1) }} />
          </Field>
        </Toolbar>

        {bloco.erro ? (
          <PanelBody><BlocoFalhou /></PanelBody>
        ) : bloco.dados && !lista.length ? (
          <EmptyState
            title={temFiltro ? 'Nenhum prospect neste filtro' : 'Nenhum prospect ainda'}
            hint={temFiltro ? 'Mude a busca ou a etapa.' : 'Crie um pelo botão "Novo cliente prospecto" no topo da tela.'}
          />
        ) : (
          <>
            <SoDesktop>
              <Table>
                <thead>
                  <tr>
                    <Th>Prospect</Th>
                    <Th>Etapa</Th>
                    <Th>Contato</Th>
                    <Th className="hidden xl:table-cell">Próximo passo</Th>
                    <Th numeric className="hidden xl:table-cell">Potencial</Th>
                    <Th>Ações</Th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map(p => (
                    <Tr key={p.ID}>
                      <Td>
                        <RowTitle>{p.NOME}</RowTitle>
                        <RowMeta>
                          <span className="flex items-center gap-x-2 whitespace-nowrap">
                            {p.CIDADE ? <span>{p.CIDADE}{p.UF ? `/${p.UF}` : ''}</span> : null}
                            <span>{p.RESPONSAVEL}</span>
                            {p.COD_CLIENTE_TOTVS ? <Code prefix="#">{p.COD_CLIENTE_TOTVS}</Code> : null}
                          </span>
                        </RowMeta>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <Status tone={tomEtapa(p.ETAPA)}>{rotuloEtapa(p.ETAPA)}</Status>
                        <RowMeta>{Number(p.VISITAS) || 0} visitas{p.ULTIMA_VISITA ? ` · última ${fmtData(p.ULTIMA_VISITA)}` : ''}</RowMeta>
                      </Td>
                      <Td className="whitespace-nowrap">
                        {p.CONTATO ?? <Dash />}
                        {p.TELEFONE ? <RowMeta>{p.TELEFONE}</RowMeta> : null}
                      </Td>
                      <Td className="hidden max-w-64 xl:table-cell"><span className="block truncate">{passo(p) ?? <Dash />}</span></Td>
                      <Td numeric className="hidden xl:table-cell">{p.POTENCIAL != null ? moeda(p.POTENCIAL) : <Dash />}</Td>
                      <Td><MenuAcoes label={`Ações para ${p.NOME}`} acoes={acoesDe(p)} /></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </SoDesktop>
            <SoCelular>
              <ListaCartoes>
                {lista.map(p => (
                  <Cartao
                    key={p.ID}
                    titulo={p.NOME}
                    meta={<><Status tone={tomEtapa(p.ETAPA)}>{rotuloEtapa(p.ETAPA)}</Status>{p.CONTATO ? <span>{p.CONTATO}</span> : null}</>}
                    acoes={<MenuAcoes label={`Ações para ${p.NOME}`} acoes={acoesDe(p)} />}
                  />
                ))}
              </ListaCartoes>
            </SoCelular>
          </>
        )}
        {total > 0 ? (
          <Pagination
            page={pagina}
            lastPage={Math.max(1, Math.ceil(total / POR_PAGINA))}
            total={total}
            unit="prospects"
            onPrevious={() => setPagina(n => n - 1)}
            onNext={() => setPagina(n => n + 1)}
          />
        ) : null}
      </Panel>

      <Detalhe p={aberto?.janela === 'detalhe' ? aberto.p : null} fechar={() => setAberto(null)} />
      <MudarEtapa p={aberto?.janela === 'etapa' ? aberto.p : null} fechar={() => setAberto(null)} salvo={salvo} />
      <NovoContato p={aberto?.janela === 'contato' ? aberto.p : null} fechar={() => setAberto(null)} salvo={salvo} />
      <Converter p={aberto?.janela === 'converter' ? aberto.p : null} fechar={() => setAberto(null)} salvo={salvo} />
    </Stack>
  )
}

function Moldura({ titulo, p, fechar, children }: { titulo: string; p: Linha | null; fechar: () => void; children: ReactNode }) {
  return (
    <Dialog open={!!p} onOpenChange={a => { if (!a) fechar() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{titulo}{p ? ` — ${p.NOME}` : ''}</DialogTitle></DialogHeader>
        <DialogBody>{children}</DialogBody>
      </DialogContent>
    </Dialog>
  )
}

/** Envio com recusa do servidor (0 linhas) virando a mensagem dada. */
function useEnvio(salvo: (texto: string) => void) {
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  async function enviar(chave: Parameters<typeof gravar>[0], input: Record<string, unknown>, ok: string, recusa: string) {
    setSalvando(true)
    try {
      if ((await gravar(chave, input)) > 0) salvo(ok)
      else setErro(recusa)
    } catch (falha) {
      console.error(chave, falha)
      setErro('Não foi possível salvar. Tente de novo.')
    } finally {
      setSalvando(false)
    }
  }
  return { erro, setErro, salvando, enviar }
}

function Detalhe({ p, fechar }: { p: Linha | null; fechar: () => void }) {
  const bloco = useBloco(() => (p ? linhas('prospectDetalhe', { prospectId: String(p.ID) }) : Promise.resolve([])), [p?.ID])
  const contatos = (bloco.dados ?? []).filter(l => l.TIPO_LINHA === 'CONTATO')
  const visitas = (bloco.dados ?? []).filter(l => l.TIPO_LINHA === 'VISITA')
  return (
    <Moldura titulo="Prospect" p={p} fechar={fechar}>
      {bloco.erro ? <BlocoFalhou /> : (
        <Stack>
          <div>
            <RowTitle>Contatos</RowTitle>
            {contatos.length ? (
              <ul>
                {contatos.map(c => (
                  <li key={c.ID} className="border-b border-rule-row py-1.5 text-[13px] last:border-b-0">
                    {c.NOME}{Number(c.PRINCIPAL) === 1 ? <Code className="ml-2">principal</Code> : null}
                    <RowMeta>{[c.CARGO, c.TELEFONE, c.EMAIL].filter(Boolean).join(' · ') || '—'}</RowMeta>
                  </li>
                ))}
              </ul>
            ) : <RowMeta>Nenhum contato.</RowMeta>}
          </div>
          <div>
            <RowTitle>Visitas de prospecção</RowTitle>
            {visitas.length ? (
              <ul>
                {visitas.map(v => (
                  <li key={v.ID} className="border-b border-rule-row py-1.5 text-[13px] last:border-b-0">
                    {fmtData(v.DATA)} · {v.EXECUTIVO} · {v.STATUS}
                    <RowMeta>
                      {[v.RESUMO, v.OBJECOES && `Objeções: ${v.OBJECOES}`, v.PROXIMO_PASSO && `Próximo passo: ${v.PROXIMO_PASSO}${v.DATA_PROXIMO_PASSO ? ` até ${fmtData(v.DATA_PROXIMO_PASSO)}` : ''}`]
                        .filter(Boolean).join(' · ') || '—'}
                    </RowMeta>
                  </li>
                ))}
              </ul>
            ) : <RowMeta>Nenhuma visita.</RowMeta>}
          </div>
        </Stack>
      )}
    </Moldura>
  )
}

function MudarEtapa({ p, fechar, salvo }: { p: Linha | null; fechar: () => void; salvo: (texto: string) => void }) {
  const [etapa, setEtapa] = useState('')
  const envio = useEnvio(salvo)
  useEffect(() => { setEtapa(''); envio.setErro(null) }, [p?.ID]) // eslint-disable-line react-hooks/exhaustive-deps
  const opcoes = etapasPermitidas(p?.ETAPA ?? '')
  return (
    <Moldura titulo="Mudar etapa" p={p} fechar={fechar}>
      <Stack>
        <Field label="Nova etapa" hint={`Hoje: ${rotuloEtapa(p?.ETAPA ?? '')}. Convertido só pelo "Converter em cliente".`}>
          <SelectMenu label="Nova etapa" value={etapa} options={opcoes} onChange={setEtapa} />
        </Field>
        {envio.erro ? <Alert tone="error">{envio.erro}</Alert> : null}
        <DialogFooter>
          <Button onClick={fechar}>Cancelar</Button>
          <Button variant="primary" disabled={!etapa || envio.salvando}
            onClick={() => p && envio.enviar('prospectEtapaMudar', { prospectId: String(p.ID), etapa }, `Etapa mudada para ${rotuloEtapa(etapa)}.`, 'Nada foi alterado: a etapa não pode mais ser mudada.')}>
            Salvar
          </Button>
        </DialogFooter>
      </Stack>
    </Moldura>
  )
}

const CONTATO_VAZIO = { nome: '', cargo: '', telefone: '', email: '', principal: false }

function NovoContato({ p, fechar, salvo }: { p: Linha | null; fechar: () => void; salvo: (texto: string) => void }) {
  const [c, setC] = useState(CONTATO_VAZIO)
  const envio = useEnvio(salvo)
  useEffect(() => { setC(CONTATO_VAZIO); envio.setErro(null) }, [p?.ID]) // eslint-disable-line react-hooks/exhaustive-deps
  function salvar(e: FormEvent) {
    e.preventDefault()
    const recusa = validarContato(c)
    envio.setErro(recusa)
    if (recusa || !p) return
    envio.enviar('prospectContatoAdicionar', { prospectId: String(p.ID), ...c, principal: c.principal ? '1' : '0' }, 'Contato adicionado.', 'Nada foi alterado: confira os campos.')
  }
  const campo = (chave: 'nome' | 'cargo' | 'telefone' | 'email', rotulo: string, obrigatorio = false) => (
    <LabelledField label={rotulo} obrigatorio={obrigatorio}>
      <Input type={chave === 'email' ? 'email' : 'text'} value={c[chave]} onChange={e => setC({ ...c, [chave]: e.target.value })} />
    </LabelledField>
  )
  return (
    <Moldura titulo="Adicionar contato" p={p} fechar={fechar}>
      <form onSubmit={salvar}>
        <Stack>
          {campo('nome', 'Nome', true)}
          <FormRow>
            {campo('cargo', 'Cargo')}
            {campo('telefone', 'Telefone')}
            {campo('email', 'E-mail')}
          </FormRow>
          <Marcador rotulo="Contato principal" marcado={c.principal} onMudar={v => setC({ ...c, principal: v })} />
          {envio.erro ? <Alert tone="error">{envio.erro}</Alert> : null}
          <DialogFooter>
            <Button onClick={fechar}>Cancelar</Button>
            <Button variant="primary" type="submit" disabled={envio.salvando}>Adicionar</Button>
          </DialogFooter>
        </Stack>
      </form>
    </Moldura>
  )
}

function Converter({ p, fechar, salvo }: { p: Linha | null; fechar: () => void; salvo: (texto: string) => void }) {
  const [codigo, setCodigo] = useState('')
  const envio = useEnvio(salvo)
  useEffect(() => { setCodigo(''); envio.setErro(null) }, [p?.ID]) // eslint-disable-line react-hooks/exhaustive-deps
  function salvar(e: FormEvent) {
    e.preventDefault()
    const recusa = validarConversao(codigo)
    envio.setErro(recusa)
    if (recusa || !p) return
    envio.enviar('prospectConverter', { prospectId: String(p.ID), codigo: codigo.trim() }, MSG_CONVERTIDO, MSG_CODIGO_INEXISTENTE)
  }
  return (
    <Moldura titulo="Converter em cliente" p={p} fechar={fechar}>
      <form onSubmit={salvar}>
        <Stack>
          <LabelledField label="Código do cliente no ERP" obrigatorio hint="O cliente já precisa existir no ERP. A conversão não põe o cliente na carteira.">
            <Input inputMode="numeric" value={codigo} onChange={e => setCodigo(e.target.value)} />
          </LabelledField>
          {envio.erro ? <Alert tone="error">{envio.erro}</Alert> : null}
          <DialogFooter>
            <Button onClick={fechar}>Cancelar</Button>
            <Button variant="primary" type="submit" disabled={envio.salvando}>Converter</Button>
          </DialogFooter>
        </Stack>
      </form>
    </Moldura>
  )
}
