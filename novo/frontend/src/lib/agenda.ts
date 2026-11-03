// Regra de tela da Agenda (spec 003, etapa 1). Sem React, sem SDK: é o que
// tests/agenda.test.mjs importa. As mensagens são as mesmas que o servidor
// aplica; o servidor continua sendo quem recusa (RF-006).

export type Origem = 'VISITA' | 'PROSPECCAO' | 'INTERNA';
export type Tipo = 'VISITA' | 'PROSPECCAO' | 'INTERNA' | 'DESLOCAMENTO';
export type Modo = 'DIA' | 'SEMANA' | 'MES';
export type Status = 'AGENDADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

/* ─────────────── tipos (RN-001) ─────────────── */

export const NOVA_AGENDA: { tipo: Tipo; rotulo: string }[] = [
  { tipo: 'VISITA', rotulo: 'Visita com cliente' },
  { tipo: 'PROSPECCAO', rotulo: 'Visita de prospecção' },
  { tipo: 'INTERNA', rotulo: 'Agenda interna' },
  { tipo: 'DESLOCAMENTO', rotulo: 'Deslocamento' },
];

export const TIPOS: Record<Tipo, string[]> = {
  VISITA: ['Aumento de mix', 'Gerar demanda', 'Padronização de produto', 'Positivação', 'Financeiro', 'Renegociação', 'Manutenção'],
  PROSPECCAO: ['Prospecção', 'Apresentação comercial', 'Diagnóstico inicial', 'Follow-up de prospecção'],
  INTERNA: ['Reunião interna', 'Outros'],
  DESLOCAMENTO: ['Deslocamento'],
};

export const LIMITE_TEXTO = 20000;
// D-305: o tipo da prospecção vai no início do objetivo, que cabe em 200.
const LIMITE_OBJETIVO = 200;
const SEP_OBJETIVO = ' — ';

export interface Formulario {
  tipo: Tipo;
  tipoCompromisso: string;
  data: string;
  inicio: string;
  fim: string;
  clienteId: string;
  clienteNome: string;
  prospectId: string;
  titulo: string;
  origem: string;
  destino: string;
  texto: string;
  pessoas: { id: number; nome: string }[];
}

export function formularioInicial(tipo: Tipo, hoje: string): Formulario {
  return {
    tipo, tipoCompromisso: TIPOS[tipo][0], data: hoje, inicio: '08:00', fim: '09:00',
    clienteId: '', clienteNome: '', prospectId: '', titulo: '', origem: '', destino: '', texto: '', pessoas: [],
  };
}

export const origemDe = (tipo: Tipo): Origem => (tipo === 'DESLOCAMENTO' ? 'INTERNA' : tipo);

/* ─────────────── datas ─────────────── */

const DIA_MS = 86400000;
const paraData = (iso: string) => new Date(`${iso}T12:00:00Z`);
const paraIso = (d: Date) => d.toISOString().slice(0, 10);
export const somarDias = (iso: string, dias: number) => paraIso(new Date(paraData(iso).getTime() + dias * DIA_MS));
// 0 = segunda ... 6 = domingo
const diaSemana = (iso: string) => (paraData(iso).getUTCDay() + 6) % 7;

export function semanaDe(iso: string) {
  const segunda = somarDias(iso, -diaSemana(iso));
  return { segunda, sexta: somarDias(segunda, 4), domingo: somarDias(segunda, 6) };
}

/** Semanas (seg–dom) que cobrem o mês da data, para a grade do Mês. */
export function mesEmSemanas(iso: string): string[][] {
  const primeiro = `${iso.slice(0, 7)}-01`;
  const ultimo = somarDias(`${proximoMes(primeiro)}`, -1);
  const semanas: string[][] = [];
  for (let seg = semanaDe(primeiro).segunda; seg <= ultimo; seg = somarDias(seg, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, i) => somarDias(seg, i)));
  }
  return semanas;
}

function proximoMes(primeiro: string) {
  const [a, m] = primeiro.split('-').map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
}

/** Período carregado por visão (RF-001): o dia, a semana seg–dom ou as semanas do mês. */
export function periodo(modo: Modo, iso: string) {
  if (modo === 'DIA') return { de: iso, ate: iso };
  if (modo === 'SEMANA') {
    const s = semanaDe(iso);
    return { de: s.segunda, ate: s.domingo };
  }
  const semanas = mesEmSemanas(iso);
  return { de: semanas[0][0], ate: semanas[semanas.length - 1][6] };
}

export function navegar(modo: Modo, iso: string, passo: 1 | -1): string {
  if (modo === 'DIA') return somarDias(iso, passo);
  if (modo === 'SEMANA') return somarDias(iso, 7 * passo);
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + passo, 1, 12));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0, 12)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return paraIso(alvo);
}

const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const rotuloDia = (iso: string) => `${DIAS[diaSemana(iso)]} ${ddmm(iso)}`;
export const DIAS_SEMANA = DIAS;

export function rotuloPeriodo(modo: Modo, iso: string): string {
  if (modo === 'DIA') return `${rotuloDia(iso)}/${iso.slice(0, 4)}`;
  if (modo === 'SEMANA') {
    const s = semanaDe(iso);
    return `${ddmm(s.segunda)} a ${ddmm(s.domingo)}/${s.domingo.slice(0, 4)}`;
  }
  return `${MESES[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;
}

/* ─────────────── validação (RN-002/003/008) ─────────────── */

export const MSG = {
  campos: 'Preencha data, horário e tipo.',
  cliente: 'Selecione o cliente da visita.',
  prospect: 'Selecione o prospect da visita.',
  titulo: 'Informe o título da agenda interna.',
  trajeto: 'Informe a origem e o destino do deslocamento.',
  horario: 'O horário de fim deve ser maior que o horário de início.',
  retro: 'É permitido lançar visitas retroativas em até 5 dias.',
  texto: 'O texto passou do limite de 20.000 caracteres.',
  motivoData: 'Ao alterar a data da visita, informe o motivo no relato.',
  motivoCancelar: 'Informe o motivo do cancelamento da visita.',
  relatoVisita: 'Para finalizar a visita, preencha o relato.',
  relatoDesloc: 'Para concluir o deslocamento, preencha o relato.',
  deslocAntes: 'O deslocamento só pode ser concluído a partir do dia agendado.',
  carteira: 'Não foi possível criar a visita. Verifique se o cliente pertence à sua carteira.',
} as const;

const vazio = (x: string) => !String(x ?? '').trim();
const limiteObjetivo = (tipoCompromisso: string) => LIMITE_OBJETIVO - [...tipoCompromisso].length - SEP_OBJETIVO.length;

function validarCampos(f: Formulario): string | null {
  if (vazio(f.data) || vazio(f.inicio) || vazio(f.fim) || vazio(f.tipoCompromisso)) return MSG.campos;
  if (f.tipo === 'VISITA' && vazio(f.clienteId)) return MSG.cliente;
  if (f.tipo === 'PROSPECCAO' && vazio(f.prospectId)) return MSG.prospect;
  if (f.tipo === 'INTERNA' && vazio(f.titulo)) return MSG.titulo;
  if (f.tipo === 'INTERNA' && f.titulo.trim().length > 200) return 'O título passou do limite de 200 caracteres.';
  if (f.tipo === 'DESLOCAMENTO' && (vazio(f.origem) || vazio(f.destino))) return MSG.trajeto;
  if (f.tipo === 'DESLOCAMENTO' && (f.origem.trim().length > 200 || f.destino.trim().length > 200)) return 'A origem e o destino têm até 200 caracteres cada.';
  if (f.fim <= f.inicio) return MSG.horario;
  if (f.tipo === 'PROSPECCAO' && f.texto.trim().length > limiteObjetivo(f.tipoCompromisso)) {
    return `O objetivo passou do limite de ${limiteObjetivo(f.tipoCompromisso)} caracteres.`;
  }
  if (f.texto.length > LIMITE_TEXTO) return MSG.texto;
  return null;
}

/** Criar (RF-003): campos da RN-002 e retroativo da RN-003. */
export function validar(f: Formulario, hoje: string): string | null {
  return validarCampos(f) ?? (f.data < somarDias(hoje, -5) ? MSG.retro : null);
}

/** Editar / reagendar (RN-009): mudar a data de visita ou prospecção exige motivo. */
export function validarReagendar(item: Linha, f: Formulario, motivo: string, hoje: string): string | null {
  const erro = validarCampos(f);
  if (erro) return erro;
  if (f.data === item.DATA) return null;
  if (item.ORIGEM !== 'INTERNA' && vazio(motivo)) return MSG.motivoData;
  if (motivo.length > LIMITE_TEXTO) return MSG.texto;
  return f.data < somarDias(hoje, -5) ? MSG.retro : null;
}

export function validarCancelar(item: Linha, motivo: string): string | null {
  if (item.ORIGEM !== 'INTERNA' && vazio(motivo)) return MSG.motivoCancelar;
  return motivo.length > LIMITE_TEXTO ? MSG.texto : null;
}

export function validarCheckout(relato: string): string | null {
  if (vazio(relato)) return MSG.relatoVisita;
  return relato.length > LIMITE_TEXTO ? MSG.texto : null;
}

export const ehDeslocamento = (item: Linha) => item.ORIGEM === 'INTERNA' && item.TIPO === 'Deslocamento';

/** Concluir interno ou deslocamento (RN-011). */
export function validarConclusao(item: Linha, relato: string, hoje: string): string | null {
  if (relato.length > LIMITE_TEXTO) return MSG.texto;
  if (!ehDeslocamento(item)) return null;
  if (item.DATA > hoje) return MSG.deslocAntes;
  return vazio(relato) ? MSG.relatoDesloc : null;
}

/** Item da lista em formulário (reagendar). */
export function formularioDe(item: Linha): Formulario {
  const tipo: Tipo = item.ORIGEM === 'INTERNA' ? (ehDeslocamento(item) ? 'DESLOCAMENTO' : 'INTERNA') : item.ORIGEM;
  return {
    tipo, tipoCompromisso: item.TIPO || TIPOS[tipo][0], data: item.DATA, inicio: item.HORA_INICIO ?? '', fim: item.HORA_FIM ?? '',
    clienteId: String(item.CLIENTE_ID ?? ''), clienteNome: item.TITULO ?? '', prospectId: String(item.PROSPECT_ID ?? ''),
    titulo: item.ORIGEM === 'INTERNA' ? item.TITULO ?? '' : '', origem: item.ORIGEM_DESLOC ?? '', destino: item.DESTINO_DESLOC ?? '',
    texto: textoSimples(item.PLANEJAMENTO), pessoas: participantes(item.PARTICIPANTES),
  };
}

/* ─────────────── conflito (RN-004) ─────────────── */

export function mensagemConflito(linha: Linha): string {
  const quem = Number(linha.EH_VOCE) === 1 ? 'você' : linha.NOME;
  const oQue = linha.ORIGEM_EXISTENTE === 'VISITA' ? 'uma visita agendada'
    : linha.ORIGEM_EXISTENTE === 'PROSPECCAO' ? 'uma visita de prospecção agendada' : 'um compromisso interno agendado';
  return `Já existe ${oQue} para ${quem} das ${linha.HORA_INICIO} às ${linha.HORA_FIM} neste dia. Escolha outro horário.`;
}

/* ─────────────── ações por status (RN-005) ─────────────── */

export type Acao = 'checkin' | 'checkout' | 'concluir' | 'reagendar' | 'cancelar' | 'editarRelato' | 'verPlanejamento' | 'verRelato';

/** Ação principal do item, com um toque (RNF-004); null = nenhuma. */
export function acaoPrincipal(item: Linha): { acao: Acao; rotulo: string } | null {
  if (Number(item.PODE_OPERAR) !== 1) return null;
  if (item.STATUS === 'AGENDADA') {
    if (item.ORIGEM !== 'INTERNA') return { acao: 'checkin', rotulo: 'Iniciar (Check-in)' };
    return { acao: 'concluir', rotulo: ehDeslocamento(item) ? 'Concluir deslocamento' : 'Concluir' };
  }
  if (item.STATUS === 'EM_ANDAMENTO') return { acao: 'checkout', rotulo: 'Encerrar visita' };
  return null;
}

/** Todas as ações oferecidas ao item (RN-005, RN-012). */
export function acoes(item: Linha): { acao: Acao; rotulo: string }[] {
  const lista: { acao: Acao; rotulo: string }[] = [];
  const principal = acaoPrincipal(item);
  if (principal) lista.push(principal);
  if (Number(item.PODE_OPERAR) === 1) {
    if (item.STATUS === 'AGENDADA') lista.push({ acao: 'reagendar', rotulo: 'Editar / Reagendar' }, { acao: 'cancelar', rotulo: 'Cancelar' });
    if (item.STATUS === 'CONCLUIDA') lista.push({ acao: 'editarRelato', rotulo: 'Editar Relato' });
  }
  const ver = item.ORIGEM === 'PROSPECCAO' ? 'Ver objetivo' : item.ORIGEM === 'INTERNA' ? 'Ver detalhes' : 'Ver Planejamento';
  lista.push({ acao: 'verPlanejamento', rotulo: ver }, { acao: 'verRelato', rotulo: 'Ver Relato' });
  return lista;
}

export const somenteVisualizacao = (item: Linha) => Number(item.PODE_OPERAR) !== 1;

/** Visão Dia: antes de qual item (pela hora de início) entra a linha de "agora"; -1 = depois de todos. */
export const posicaoAgora = (itens: Linha[], hhmm: string) => itens.findIndex(i => String(i.HORA_INICIO ?? '') > hhmm);

/* ─────────────── status e legenda (RF-002) ─────────────── */

export const LEGENDA: { status: Status; rotulo: string; cor: string }[] = [
  { status: 'AGENDADA', rotulo: 'Agendada', cor: 'bg-data-4' },
  { status: 'EM_ANDAMENTO', rotulo: 'Em andamento', cor: 'bg-data-1' },
  { status: 'CONCLUIDA', rotulo: 'Concluída', cor: 'bg-data-6' },
  { status: 'CANCELADA', rotulo: 'Cancelada', cor: 'bg-data-8' },
];
export const corStatus = (status: string) => LEGENDA.find(l => l.status === status)?.cor ?? 'bg-ink-muted';
export const rotuloStatus = (status: string) => LEGENDA.find(l => l.status === status)?.rotulo ?? status;

export const rotuloOrigem = (item: Linha) =>
  item.ORIGEM === 'VISITA' ? 'Visita' : item.ORIGEM === 'PROSPECCAO' ? 'Prospecção' : ehDeslocamento(item) ? 'Deslocamento' : item.TIPO || 'Interno';

/* ─────────────── textos ─────────────── */

/** Relato antigo em HTML vira texto com quebras de linha (D-304); texto puro passa igual. */
export function textoSimples(texto: unknown): string {
  const bruto = String(texto ?? '');
  if (!/<[a-z!/][^>]*>/i.test(bruto)) return bruto;
  return bruto
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Relato do interno: o trecho de "Conclusão em" acrescentado à descrição (D-305). */
export function relatoInterno(descricao: unknown): string {
  const texto = textoSimples(descricao);
  const i = texto.lastIndexOf('Conclusão em ');
  return i === -1 ? '' : texto.slice(i);
}

/** `"2:Bruno|3:Carla"` → `[{id: 2, nome: 'Bruno'}, ...]`. */
export function participantes(texto: unknown): { id: number; nome: string }[] {
  return String(texto ?? '').split('|').filter(Boolean).map(p => {
    const i = p.indexOf(':');
    return { id: Number(p.slice(0, i)), nome: p.slice(i + 1) };
  });
}

export const pessoasJson = (pessoas: { id: number }[]) => JSON.stringify(pessoas.map(p => ({ id: p.id })));

/* ─────────────── atividades do check-out (C-006) ─────────────── */

export interface Atividade {
  titulo: string;
  descricao: string;
  prioridade: 'ALTA' | 'MEDIA' | 'BAIXA';
  dataLimite: string;
}

export const atividadeVazia = (): Atividade => ({ titulo: '', descricao: '', prioridade: 'MEDIA', dataLimite: '' });

/**
 * Grava uma a uma; sem título é ignorada; falha não desfaz a visita (RN-007).
 * `criar` devolve as linhas afetadas (0 ou erro = falhou).
 */
export async function salvarAtividades(lista: Atividade[], criar: (a: Atividade) => Promise<number>) {
  const pendentes: Atividade[] = [];
  let criadas = 0;
  for (const atividade of lista.filter(a => !vazio(a.titulo))) {
    let ok = false;
    try {
      ok = (await criar(atividade)) > 0;
    } catch {
      ok = false;
    }
    if (ok) criadas += 1;
    else pendentes.push(atividade);
  }
  const mensagem = pendentes.length
    ? `Visita encerrada, mas ${pendentes.length} atividade(s) não foram salvas. Revise e tente novamente.`
    : null;
  return { criadas, pendentes, mensagem };
}

export function validarAtividade(a: Atividade): string | null {
  if (a.titulo.trim().length > 300) return 'O título da atividade tem até 300 caracteres.';
  if (a.descricao.length > 500) return 'A descrição da atividade tem até 500 caracteres.';
  return null;
}

/* ─────────────── painel lateral (RF-014) ─────────────── */

export function meta(resumo: Linha | null) {
  const realizadas = Number(resumo?.REALIZADO ?? 0);
  const alvo = Number(resumo?.META ?? 0);
  return {
    realizadas, meta: alvo,
    restantes: Math.max(0, alvo - realizadas),
    percentual: alvo > 0 ? Math.round((realizadas / alvo) * 100) : 0,
  };
}
