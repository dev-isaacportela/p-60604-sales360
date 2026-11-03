// Regras de tela da spec 008: Alertas, Prospecção e Prospects.
// Regra pura: sem React, sem SDK. É o que tests/alertas.test.mjs importa.

import { lerValor } from './mix.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

/* ─────────────── Alertas ─────────────── */

export const TIPOS = [
  { value: 'PRODUTO_PERDIDO', label: 'Produto Perdido' },
  { value: 'SAZONALIDADE', label: 'Sazonalidade' },
  { value: 'REPOSICAO', label: 'Reposição' },
  { value: 'VOLUME_CRESCENTE', label: 'Volume Crescente' },
  { value: 'NAO_EXPLORADO', label: 'Não Explorado' },
  { value: 'PEDIDO_INCOMPLETO', label: 'Pedido Incompleto' },
];
/** Tipo fora da lista (ex.: SEM_COMPRA) vira texto legível: "Sem compra". */
export const rotuloTipo = (tipo: string) =>
  TIPOS.find(t => t.value === tipo)?.label ?? String(tipo ?? '').replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());

export const SITUACOES = [
  { value: 'NAO_LIDOS', label: 'Não lidos' },
  { value: 'LIDOS', label: 'Lidos' },
  { value: 'TODOS', label: 'Todos' },
];

export const PRIORIDADES: Record<string, { rotulo: string; tom: 'alert' | 'attention' | 'off' }> = {
  ALTA: { rotulo: 'Alta', tom: 'alert' },
  MEDIA: { rotulo: 'Média', tom: 'attention' },
  BAIXA: { rotulo: 'Baixa', tom: 'off' },
};

/** RF-007: só estes tipos têm o gráfico histórico; Volume Crescente também tem sugestões. */
export const COM_HISTORICO = new Set(['SAZONALIDADE', 'REPOSICAO', 'VOLUME_CRESCENTE']);

export interface FiltrosAlertas {
  busca: string;
  ramo: string;
  tipo: string;
  valorMin: string;
  situacao: string;
  clienteId: string;
  produto: string;
  pagina: number;
}

export const FILTROS_ALERTAS: FiltrosAlertas = { busca: '', ramo: '', tipo: '', valorMin: '', situacao: 'NAO_LIDOS', clienteId: '', produto: '', pagina: 1 };
const CAMPOS = ['busca', 'ramo', 'tipo', 'valorMin', 'situacao', 'clienteId', 'produto'] as const;

/** RN-010: os filtros ficam no endereço da página. */
export function filtrosDaUrl(search: string): FiltrosAlertas {
  const p = new URLSearchParams(search);
  const f = { ...FILTROS_ALERTAS };
  for (const c of CAMPOS) if (p.get(c)) f[c] = String(p.get(c));
  if (!SITUACOES.some(s => s.value === f.situacao)) f.situacao = 'NAO_LIDOS';
  f.pagina = Math.max(1, Number(p.get('pagina')) || 1);
  return f;
}

export function urlDosFiltros(f: FiltrosAlertas, aba = ''): string {
  const p = new URLSearchParams();
  if (aba) p.set('aba', aba);
  for (const c of CAMPOS) if (f[c] && f[c] !== FILTROS_ALERTAS[c]) p.set(c, f[c]);
  if (f.pagina > 1) p.set('pagina', String(f.pagina));
  const texto = p.toString();
  return texto ? `?${texto}` : '';
}

/** Trocar qualquer filtro volta à página 1. */
export function mudarFiltro(f: FiltrosAlertas, campo: keyof FiltrosAlertas, valor: string): FiltrosAlertas {
  return { ...f, [campo]: valor, pagina: 1 };
}

/** Entrada da SF: busca com os dígitos à parte (CNPJ/código) e valor mínimo com ponto (RNT-011). */
export function paraEntrada(f: FiltrosAlertas): Record<string, string> {
  const valor = lerValor(f.valorMin);
  return {
    busca: f.busca.trim(),
    buscaDigitos: f.busca.replace(/\D/g, '').slice(0, 14),
    ramo: f.ramo,
    tipo: f.tipo,
    valorMin: f.valorMin.trim() && Number.isFinite(valor) ? String(valor) : '',
    situacao: f.situacao,
    clienteId: f.clienteId.replace(/\D/g, ''),
    produto: f.produto,
    pagina: String(f.pagina),
  };
}

export interface GrupoCliente {
  id: number;
  nome: string;
  cnpj: string;
  potencial: number;
  n: number;
  alertas: Linha[];
  aberto: boolean;
}

/** RN-010: agrupa a página por cliente na ordem da SF; cliente com até 2 alertas aparece aberto. */
export function agruparPorCliente(linhas: Linha[]): GrupoCliente[] {
  const grupos: GrupoCliente[] = [];
  for (const l of linhas) {
    let g = grupos.find(x => x.id === Number(l.ID_CLIENTE));
    if (!g) {
      g = { id: Number(l.ID_CLIENTE), nome: l.CLIENTE, cnpj: l.CNPJ ?? '', potencial: Number(l.POTENCIAL_CLIENTE) || 0, n: Number(l.N_CLIENTE) || 0, alertas: [], aberto: false };
      grupos.push(g);
    }
    g.alertas.push(l);
  }
  for (const g of grupos) g.aberto = g.n <= 2;
  return grupos;
}

export const DICA_SO_DONO = 'Só o vendedor dono do alerta pode marcá-lo como lido.';

/** RNT-013 / RN-011: quantos mudaram; zero diz por quê. */
export function mensagemMarcar(n: number, { podeMarcar = true, todos = false } = {}): { tom: 'success' | 'error'; texto: string } {
  if (n > 0) return { tom: 'success', texto: n === 1 && !todos ? 'Alerta marcado como lido.' : `${n} ${n === 1 ? 'alerta marcado como lido' : 'alertas marcados como lidos'}.` };
  if (!podeMarcar) return { tom: 'error', texto: 'Nada foi alterado: o alerta pertence a outro vendedor.' };
  return { tom: 'error', texto: todos ? 'Nada foi alterado: não há alertas seus não lidos neste recorte.' : 'Nada foi alterado: o alerta já estava lido ou não está mais na sua carteira.' };
}

/** RF-006: os 3 produtos de maior potencial; `todos` = o ranking inteiro. */
export function oportunidades(painel: Linha[], todos = false): { produto: string; n: number; potencial: number }[] {
  const lista = painel.filter(l => l.TIPO_LINHA === 'PRODUTO')
    .map(l => ({ produto: String(l.PRODUTO), n: Number(l.N) || 0, potencial: Number(l.POTENCIAL) || 0 }))
    .sort((a, b) => b.potencial - a.potencial || b.n - a.n || a.produto.localeCompare(b.produto, 'pt-BR'));
  return todos ? lista : lista.slice(0, 3);
}

export function ramos(painel: Linha[]): string[] {
  return painel.filter(l => l.TIPO_LINHA === 'RAMO').map(l => String(l.RAMO)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function mesesAntes(mes: string, n: number): string {
  const [y, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return d.toISOString().slice(0, 7);
}

/** Primeiro dia do mês de 12 meses atrás (`desde` do gráfico e das sugestões). */
export const desdeHistorico = (hoje: string) => `${mesesAntes(hoje.slice(0, 7), 12)}-01`;

/** RN-014: 12 meses anteriores + o atual, com zero onde não houve compra. */
export function serieHistorica(hoje: string, linhas: Linha[]): { mes: string; rotulo: string; valor: number; pedidos: number }[] {
  const atual = hoje.slice(0, 7);
  const por = new Map(linhas.map(l => [String(l.MES), l]));
  return Array.from({ length: 13 }, (_, i) => {
    const mes = mesesAntes(atual, 12 - i);
    const l = por.get(mes);
    return { mes, rotulo: `${MESES_CURTOS[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`, valor: Number(l?.VALOR) || 0, pedidos: Number(l?.PEDIDOS) || 0 };
  });
}

export function tituloHistorico(serie: { mes: string; valor: number; pedidos: number }[]): string {
  const comCompra = serie.filter(s => s.valor > 0 || s.pedidos > 0);
  if (!comCompra.length) return 'Sem histórico neste período';
  const mesAtual = serie[serie.length - 1].mes.slice(5, 7);
  const iguais = comCompra.filter(s => s.mes.slice(5, 7) === mesAtual).length;
  if (iguais >= 2 || comCompra.length >= 3) return 'padrão de sazonalidade confirmado';
  return comCompra.length === 1 ? 'apenas 1 ocorrência' : `apenas ${comCompra.length} ocorrências`;
}

/** RN-005: até 5, sem repetir, os de outros alertas do cliente primeiro (a SF já ordena). */
export function sugestoes(linhas: Linha[]): string[] {
  return [...new Set(linhas.map(l => String(l.PRODUTO)))].slice(0, 5);
}

/* ─────────────── Prospecção ─────────────── */

export const TENDENCIAS = [
  { value: '', label: 'Todos' },
  { value: 'ALTA', label: 'Alta' },
  { value: 'MEDIA', label: 'Media' },
  { value: 'BAIXA', label: 'Baixa' },
  { value: 'INATIVO', label: 'Cliente inativo' },
];
export const rotuloTendencia = (t: string) => TENDENCIAS.find(x => x.value === t && t)?.label ?? t;
export const tomTendencia = (t: string): 'live' | 'attention' | 'off' | 'alert' =>
  t === 'ALTA' ? 'live' : t === 'MEDIA' ? 'attention' : t === 'INATIVO' ? 'alert' : 'off';

export function subtituloProspeccao(r: { semana?: number; mes?: string; altas?: number } | null): string {
  if (!r?.semana) return '';
  return `Semana ${r.semana} de ${r.mes} — ${r.altas ?? 0} clientes com alta tendência de recompra`;
}

export const VAZIO_PROSPECCAO = 'Nenhum cliente da sua carteira com histórico de compras encontrado.';

/** RF-014: "Agendar visita" abre a Agenda com o cliente (D-806). */
export const linkAgendarVisita = (clienteId: number, nome: string) =>
  `/agenda?${new URLSearchParams({ clienteId: String(clienteId), cliente: nome }).toString()}`;

/* ─────────────── Prospects (aba de /clientes) ─────────────── */

export const ETAPAS = [
  { value: 'NOVO', label: 'Novo' },
  { value: 'VISITA_AGENDADA', label: 'Visita agendada' },
  { value: 'VISITADO', label: 'Visitado' },
  { value: 'NEGOCIACAO', label: 'Negociação' },
  { value: 'CONVERTIDO', label: 'Convertido' },
  { value: 'PERDIDO', label: 'Perdido' },
];
export const rotuloEtapa = (e: string) => ETAPAS.find(x => x.value === e)?.label ?? e;
export const tomEtapa = (e: string): 'live' | 'attention' | 'off' | 'alert' =>
  e === 'CONVERTIDO' || e === 'NEGOCIACAO' ? 'live' : e === 'PERDIDO' ? 'alert' : e === 'NOVO' ? 'off' : 'attention';

/** RN-022: manual vai a qualquer etapa menos Convertido (só por Converter); Convertido é final. */
export function etapasPermitidas(atual: string): { value: string; label: string }[] {
  if (atual === 'CONVERTIDO') return [];
  return ETAPAS.filter(e => e.value !== 'CONVERTIDO' && e.value !== atual);
}

export function validarContato(c: { nome: string; email: string }): string | null {
  if (!c.nome.trim()) return 'Informe o nome do contato.';
  if (c.nome.trim().length > 200) return 'O nome pode ter até 200 caracteres.';
  if (c.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email.trim())) return 'Informe um e-mail válido.';
  return null;
}

export function validarConversao(codigo: string): string | null {
  return /^\d{1,12}$/.test(codigo.trim()) ? null : 'Informe o código de cliente do ERP (só números).';
}

export const MSG_CONVERTIDO = 'Prospect convertido. A inclusão do cliente na carteira segue as regras da carteira.';
export const MSG_CODIGO_INEXISTENTE = 'Código de cliente não encontrado no ERP.';
