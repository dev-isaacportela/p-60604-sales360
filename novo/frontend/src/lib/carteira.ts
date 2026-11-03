// Regras de tela da carteira de clientes (spec 002). Regra pura: sem React,
// sem SDK; é o que tests/carteira.test.mjs importa. As regras de negócio
// (curva, temperatura, busca, indicadores) rodam no servidor
// (novo/backend/lib/002-regras.mjs); aqui só o que a tela decide.

/** RF-018: as quatro abas, nessa ordem. */
export const ABAS = [
  { id: 'carteira', rotulo: 'MINHA CARTEIRA' },
  { id: 'disponiveis', rotulo: 'CLIENTES DISPONÍVEIS' },
  { id: 'historico', rotulo: 'HISTÓRICO DO CLIENTE' },
  { id: 'prospects', rotulo: 'PROSPECTS' },
] as const;

/**
 * RF-015: `/clientes/1234` abre a carteira buscando 1234;
 * `/clientes?clienteId=1234` abre o Histórico com 1234 selecionado.
 */
export function abaInicial(params: { clienteId?: string }, search: string) {
  const id = String(params.clienteId ?? '').replace(/\D/g, '');
  if (id) return { aba: 'carteira', busca: id, clienteId: '' };
  const doHistorico = new URLSearchParams(search).get('clienteId')?.replace(/\D/g, '') ?? '';
  if (doHistorico) return { aba: 'historico', busca: '', clienteId: doHistorico };
  return { aba: 'carteira', busca: '', clienteId: '' };
}

interface Fatores {
  recencia: number;
  frequencia: number;
  tendencia: number;
  visitas: number;
  // Os dados que geraram os pontos (RN-007), como o servidor devolve.
  diasSemComprar?: number | null;
  ciclo?: number | null;
  variacao?: number | null;
  diasSemVisita?: number | null;
}

const dias = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;
const num1 = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const pct = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${num1(Math.abs(n))}%`;

/** O porquê de cada fator com os números do cliente, e o que leva ao próximo degrau (RN-007). */
function explicar(chave: (typeof FATORES)[number]['chave'], t: Fatores): { motivo: string; subir: string | null } {
  const dc = t.diasSemComprar ?? null;
  const dv = t.diasSemVisita ?? null;
  switch (chave) {
    case 'recencia':
      if (dc === null) return { motivo: 'Nenhuma compra registrada.', subir: 'Uma compra leva a 30 pontos.' };
      return {
        motivo: `Última compra há ${dias(dc)}.`,
        subir: dc < 30 ? null : 'Uma compra agora leva a 30 pontos (menos de 30 dias).',
      };
    case 'frequencia': {
      if (!t.ciclo || dc === null) return { motivo: 'Sem ciclo de compra: são precisos ao menos 2 dias com compra.', subir: null };
      const vezes = dc / t.ciclo;
      return {
        motivo: `${dias(dc)} sem comprar para um ciclo médio de ${num1(t.ciclo)} dias (${num1(vezes)}× o ciclo).`,
        subir: vezes <= 1.1 ? null : `Uma compra agora volta a 25 pontos (25 vale até ${Math.floor(t.ciclo * 1.1)} dias sem comprar).`,
      };
    }
    case 'tendencia': {
      const v = t.variacao ?? null;
      if (v === null) {
        return t.tendencia > 0
          ? { motivo: 'Comprou nos últimos 60 dias e nada nos 60 anteriores.', subir: null }
          : { motivo: 'Sem compras nos últimos 120 dias.', subir: 'Voltar a comprar leva a 25 pontos.' };
      }
      const motivo = `Compras dos últimos 60 dias: ${pct(v)} contra os 60 anteriores.`;
      if (v > 10) return { motivo, subir: null };
      if (v >= -10) return { motivo, subir: 'Crescer mais de 10% leva a 25 pontos.' };
      if (v >= -30) return { motivo, subir: 'Voltar a no máximo −10% leva a 15 pontos; crescer mais de 10%, a 25.' };
      return { motivo, subir: 'Voltar a no máximo −30% leva a 5 pontos; a no máximo −10%, a 15.' };
    }
    default:
      if (dv === null) return { motivo: 'Nenhuma visita concluída sua para este cliente.', subir: 'Uma visita concluída leva a 20 pontos.' };
      return {
        motivo: `Última visita concluída há ${dias(dv)}.`,
        subir: dv < 30 ? null : 'Uma visita concluída agora leva a 20 pontos (menos de 30 dias).',
      };
  }
}

const FATORES = [
  { chave: 'recencia', max: 30, rotulo: 'Recência', texto: 'Priorize um contato esta semana para reativar o cliente.' },
  { chave: 'frequencia', max: 25, rotulo: 'Frequência', texto: 'Ciclo de compra ultrapassado — cliente pode estar comprando de concorrente.' },
  { chave: 'tendencia', max: 25, rotulo: 'Tendência', texto: 'Volume em queda — investigue o motivo na próxima visita.' },
  { chave: 'visitas', max: 20, rotulo: 'Visitas', texto: 'Agende uma visita presencial para fortalecer o relacionamento.' },
] as const;

/** Fatores do detalhe da temperatura, na ordem de exibição. */
export function fatoresTemperatura(t: Fatores) {
  return FATORES.map(f => ({ rotulo: f.rotulo, pontos: Number(t[f.chave]) || 0, max: f.max, ...explicar(f.chave, t) }));
}

function fatorMaisFraco(t: Fatores) {
  let melhor: (typeof FATORES)[number] = FATORES[0];
  for (const f of FATORES) {
    if ((Number(t[f.chave]) || 0) / f.max < (Number(t[melhor.chave]) || 0) / melhor.max) melhor = f;
  }
  return melhor;
}

/** RN-009: pelo fator com menor proporção de pontos; empate segue a ordem Recência, Frequência, Tendência, Visitas. */
export function recomendacao(t: Fatores): string {
  return fatorMaisFraco(t).texto;
}

/** A recomendação da RN-009 com o fato do cliente que a motivou; nota 100 não tem o que corrigir. */
export function recomendacaoDetalhada(t: Fatores & { total: number }): { fator: string | null; texto: string; porque: string | null } {
  if (t.total >= 100) return { fator: null, texto: 'Relacionamento no máximo: mantenha a rotina de compras e visitas.', porque: null };
  const f = fatorMaisFraco(t);
  return { fator: f.rotulo, texto: f.texto, porque: explicar(f.chave, t).motivo };
}

/** RN-011: dias sem visita em vermelho acima de 30; última compra acima de 25. */
export function alertaDias(tipo: 'visita' | 'compra', dias: number | null | undefined): boolean {
  if (dias === null || dias === undefined) return false;
  return dias > (tipo === 'visita' ? 30 : 25);
}

const STATUS: Record<string, { rotulo: string; tom: 'live' | 'attention' | 'off' }> = {
  ATIVO: { rotulo: 'Ativo', tom: 'live' },
  EM_RISCO: { rotulo: 'Em risco', tom: 'attention' },
  RISCO: { rotulo: 'Em risco', tom: 'attention' },
  INATIVO: { rotulo: 'Inativo', tom: 'off' },
};

/** RN-011: a coluna Status é o status do cadastro, o mesmo do filtro e do card. */
export function rotuloStatus(status: string | null | undefined): string {
  const s = String(status ?? '').toUpperCase();
  return STATUS[s]?.rotulo ?? (s ? s.charAt(0) + s.slice(1).toLowerCase() : '—');
}

export function tomStatus(status: string | null | undefined): 'live' | 'attention' | 'off' {
  return STATUS[String(status ?? '').toUpperCase()]?.tom ?? 'off';
}

export const OPCOES_STATUS = [
  { value: '', label: 'Todos os status' },
  { value: 'ATIVO', label: 'Ativo' },
  { value: 'EM_RISCO', label: 'Em risco' },
  { value: 'INATIVO', label: 'Inativo' },
];

/** "Quente (92)". */
export function rotuloTemperatura(t: { classe: string; total: number }): string {
  return `${t.classe} (${t.total})`;
}

export function tomTemperatura(classe: string): 'live' | 'attention' | 'alert' {
  return classe === 'Quente' ? 'live' : classe === 'Morno' ? 'attention' : 'alert';
}

/** RN-013 */
export const ORDENS = [
  { value: 'RANK_AD', label: 'Ranking A→D' },
  { value: 'RANK_DA', label: 'Ranking D→A' },
  { value: 'NOME_AZ', label: 'Nome A–Z' },
  { value: 'NOME_ZA', label: 'Nome Z–A' },
  { value: 'STATUS', label: 'Status' },
  { value: 'DIAS_VISITA', label: 'Dias sem visita' },
];

export const FILTROS_PADRAO = { busca: '', ramo: '', status: '', ordem: 'RANK_AD', pendentes: 0, pagina: 1 };

type Filtros = typeof FILTROS_PADRAO;

/** RN-013: trocar filtro, busca ou ordenação volta à página 1. */
export function aoMudarFiltro<K extends keyof Filtros>(filtros: Filtros, campo: K, valor: Filtros[K]): Filtros {
  return { ...filtros, [campo]: valor, pagina: 1 };
}

export function ultimaPagina(total: number, porPagina: number): number {
  return Math.max(1, Math.ceil((Number(total) || 0) / porPagina));
}

export const CURVAS = ['A', 'B', 'C', 'D'] as const;

/* ── Disponíveis (RN-019) ── */

export const MSG_ADICIONADO = 'Cliente adicionado à sua carteira com sucesso.';
export const MSG_SEM_ESCOPO = 'Seu usuário não possui vínculo ativo de filial/seção para adicionar clientes.';

export function mensagemMotivo(motivo: string | null | undefined): string {
  switch (motivo) {
    case 'JA_NA_CARTEIRA': return 'Cliente já está na sua carteira para este escopo.';
    case 'JA_TEM_RESPONSAVEL': return 'Este cliente já possui responsável no mesmo escopo da sua carteira.';
    case 'SEM_ESCOPO': return MSG_SEM_ESCOPO;
    default: return 'Cliente não encontrado para vinculação.';
  }
}

/* ── Remoção (RN-015) ── */

export const MSG_REMOVIDO = 'Cliente removido da sua carteira com sucesso.';
export const perguntaRemover = (nome: string) => `Deseja remover ${nome} da sua carteira?`;

/* ── Relato avulso (RN-016) ── */

export const TIPOS_CONTATO = ['Ligação', 'WhatsApp', 'E-mail', 'Reunião on-line', 'Outro'];
export const MSG_RELATO_FALHA = 'Não foi possível salvar o relato. Tente de novo.';

/** As mesmas recusas do servidor, para avisar antes de gravar. */
export function validarRelato(r: { data: string; hora: string; tipo: string; relato: string }, hoje: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.data)) return 'Informe a data do contato.';
  if (r.data > hoje) return 'A data do contato não pode ser futura.';
  if (r.hora && !/^\d{2}:\d{2}$/.test(r.hora)) return 'Hora inválida.';
  if (!TIPOS_CONTATO.includes(r.tipo)) return 'Escolha o tipo de contato.';
  if (!r.relato.trim()) return 'Escreva o relato do contato.';
  if (r.relato.length > 4000) return 'O relato pode ter até 4.000 caracteres.';
  return null;
}

/* ── Prospect pela carteira (RN-021) ── */

export const MSG_PROSPECT_OK = 'Cliente prospecto criado. Ele já pode ser usado em visitas de prospecção na agenda.';
export const MSG_PROSPECT_FALHA = 'Não foi possível criar o cliente prospecto. Tente de novo.';

export function validarProspect(p: { razaoSocial: string; uf: string; probabilidade: string; observacoes: string }): string | null {
  const razao = p.razaoSocial.trim();
  if (!razao) return 'Informe a razão social ou nome do cliente prospecto.';
  if (razao.length > 300) return 'A razão social pode ter até 300 caracteres.';
  if (p.uf.trim() && !/^[A-Za-z]{2}$/.test(p.uf.trim())) return 'UF deve ter 2 letras.';
  if (p.probabilidade.trim()) {
    const n = Number(p.probabilidade);
    if (!Number.isInteger(n) || n < 0 || n > 100) return 'Probabilidade deve ser um número de 0 a 100.';
  }
  if (p.observacoes.length > 8000) return 'As observações podem ter até 8.000 caracteres.';
  return null;
}

/* ── Ficha do cliente (RN-014) ── */

/** Os nove campos do cadastro do ERP. Nenhum é editável. */
export const CAMPOS_FICHA = [
  { campo: 'RAZAO_SOCIAL', rotulo: 'Razão Social' },
  { campo: 'NOME_FANTASIA', rotulo: 'Nome Fantasia' },
  { campo: 'CNPJ', rotulo: 'CNPJ' },
  { campo: 'SEGMENTO', rotulo: 'Segmento' },
  { campo: 'CIDADE', rotulo: 'Cidade' },
  { campo: 'UF', rotulo: 'UF' },
  { campo: 'TELEFONE', rotulo: 'Telefone' },
  { campo: 'EMAIL', rotulo: 'E-mail' },
  { campo: 'ENDERECO', rotulo: 'Endereço' },
] as const;

/* ── Histórico (RN-017) ── */

export const TIPOS_HISTORICO = [
  { value: '', label: 'Todos os tipos' },
  { value: 'VISITA', label: 'Visita' },
  { value: 'ATIVIDADE', label: 'Atividade' },
  { value: 'RELATO', label: 'Relato avulso' },
  { value: 'MIX', label: 'Mix de produtos' },
  { value: 'PEDIDO', label: 'Pedido faturado' },
];

export function rotuloTipoHistorico(tipo: string): string {
  return TIPOS_HISTORICO.find(t => t.value === tipo)?.label ?? tipo;
}

/** Linha do tempo agrupada por mês, na ordem que chegou: `Outubro de 2026`. */
export function porMes<T extends { DATA?: unknown }>(linhas: T[]): { mes: string; itens: T[] }[] {
  const grupos: { chave: string; mes: string; itens: T[] }[] = [];
  for (const l of linhas) {
    const chave = String(l.DATA ?? '').slice(0, 7);
    if (grupos.at(-1)?.chave !== chave) {
      const nome = MESES[Number(chave.slice(5, 7)) - 1] ?? '';
      grupos.push({ chave, mes: nome ? `${nome[0].toUpperCase()}${nome.slice(1)} de ${chave.slice(0, 4)}` : 'Sem data', itens: [] });
    }
    grupos.at(-1)!.itens.push(l);
  }
  return grupos.map(({ mes, itens }) => ({ mes, itens }));
}

const ddmmaaaa = (iso: string) => iso.split('-').reverse().join('/');

/** Rótulo do botão de período do histórico. */
export function rotuloPeriodoHistorico(de: string, ate: string): string {
  if (de && ate) return `${ddmmaaaa(de)} a ${ddmmaaaa(ate)}`;
  if (de) return `Desde ${ddmmaaaa(de)}`;
  if (ate) return `Até ${ddmmaaaa(ate)}`;
  return 'Todo o período';
}

/** `0` → `hoje`, `1` → `há 1 dia`, `13` → `há 13 dias`; sem valor, vazio. */
export function haDias(dias: number | null | undefined): string {
  if (dias === null || dias === undefined || !Number.isFinite(Number(dias))) return '';
  const n = Number(dias);
  return n <= 0 ? 'hoje' : n === 1 ? 'há 1 dia' : `há ${n} dias`;
}

/* ── Legenda (RF-016) ── */

export const LEGENDA = [
  {
    titulo: 'Temperatura',
    texto: 'Nota de 0 a 100 do relacionamento: Recência da última compra (30), Frequência contra o ciclo de compra (25), Tendência das compras dos últimos 60 dias contra os 60 anteriores (25) e Visitas concluídas (20). Quente a partir de 70, Morno de 40 a 69, Frio abaixo de 40.',
  },
  {
    titulo: 'Alerta de Queda',
    texto: 'Selo Queda: compras do dia 1 até hoje caíram 30% ou mais contra o mesmo intervalo do mês anterior.',
  },
  {
    titulo: 'Alertas Inteligentes',
    texto: 'Sino vermelho: o cliente tem ao menos um alerta inteligente ainda não lido por você.',
  },
  {
    titulo: 'Mix de Produtos',
    texto: 'Abre o Mix Builder para montar uma proposta para o cliente. Só o mix enviado ao histórico aparece no Histórico do Cliente.',
  },
];

/* ── Indicadores ── */

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** RN-010: a receita do mês vai do dia 1 até hoje — "de 1º a 3 de novembro"; no dia 1, "de 1º de novembro". */
export function periodoDoMes(hoje: string): string {
  const [, m, d] = String(hoje).split('-').map(Number);
  if (!m || !d) return 'do mês';
  return d === 1 ? `de 1º de ${MESES[m - 1]}` : `de 1º a ${d} de ${MESES[m - 1]}`;
}
