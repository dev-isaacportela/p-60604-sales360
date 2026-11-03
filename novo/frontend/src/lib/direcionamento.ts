// Regras de tela do Direcionamento Estratégico Semanal (spec 008, RN-025…029).
// Regra pura: sem React, sem SDK (o exceljs só é carregado no clique de
// exportar). É o que tests/direcionamento.test.mjs importa.

import { fmtData } from './formato.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

const DIA_MS = 86400000;
const paraData = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
const paraIso = (d: Date) => d.toISOString().slice(0, 10);
export const somarDias = (iso: string, dias: number) => paraIso(new Date(paraData(iso).getTime() + dias * DIA_MS));

/* ─────────────── semana (RNT-006: segunda a sexta) ─────────────── */

/** Segunda-feira da semana de `hoje` (sábado e domingo ficam com a semana que acabou). */
export function segundaDe(hoje: string): string {
  const dia = paraData(hoje).getUTCDay();
  return somarDias(hoje, dia === 0 ? -6 : 1 - dia);
}

export const navegarSemana = (segunda: string, passo: 1 | -1) => somarDias(segunda, 7 * passo);

export function rotuloSemana(segunda: string): string {
  return `${fmtData(segunda).slice(0, 5)} a ${fmtData(somarDias(segunda, 4))}`;
}

/* ─────────────── Controle de Agenda (RN-026) ─────────────── */

export interface ResumoExecutivo {
  id: number;
  nome: string;
  agendadas: number;
  concluidas: number;
  naoConcluidas: number;
  semRelato: number;
  vencidas: number;
  reagendadas: number;
  canceladas: number;
  execucao: number | null;
  compromissos: Linha[];
}

export function corExecucao(execucao: number | null): 'live' | 'attention' | 'alert' | 'off' {
  if (execucao == null) return 'off';
  return execucao >= 0.8 ? 'live' : execucao >= 0.5 ? 'attention' : 'alert';
}

export const pctExecucao = (x: number | null) => (x == null ? '—' : `${Math.round(x * 1000) / 10}%`.replace('.', ','));

/** Uma linha por executivo, a partir dos compromissos da SF; mais pendências primeiro. */
export function resumoAgenda(linhas: Linha[]): ResumoExecutivo[] {
  const mapa = new Map<number, ResumoExecutivo>();
  for (const l of linhas) {
    const id = Number(l.EXECUTIVO_ID);
    const r = mapa.get(id) ?? { id, nome: String(l.EXECUTIVO ?? ''), agendadas: 0, concluidas: 0, naoConcluidas: 0, semRelato: 0, vencidas: 0, reagendadas: 0, canceladas: 0, execucao: null, compromissos: [] };
    r.compromissos.push(l);
    if (!Number(l.CANCELADA)) r.agendadas += 1;
    r.concluidas += Number(l.CONCLUIDA) || 0;
    r.naoConcluidas += Number(l.NAO_CONCLUIDA) || 0;
    r.semRelato += Number(l.SEM_RELATO) || 0;
    r.vencidas += Number(l.VENCIDA) || 0;
    r.reagendadas += Number(l.REAGENDADA) || 0;
    r.canceladas += Number(l.CANCELADA) || 0;
    mapa.set(id, r);
  }
  const lista = [...mapa.values()].map(r => ({ ...r, execucao: r.agendadas ? r.concluidas / r.agendadas : null }));
  return lista.sort((a, b) => b.naoConcluidas + b.semRelato - (a.naoConcluidas + a.semRelato) || b.reagendadas + b.canceladas - (a.reagendadas + a.canceladas)
    || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Por padrão só quem tem ocorrência: pendente, reagendada ou cancelada. */
export const comOcorrencia = (r: ResumoExecutivo) => r.naoConcluidas > 0 || r.reagendadas > 0 || r.canceladas > 0;

export const VAZIO_AGENDA = 'Nenhum compromisso agendado nesta semana no escopo selecionado.';
export const VAZIO_TODOS_CONCLUIRAM = 'Todos os executivos concluíram os compromissos da semana.';
export const AVISO_EXEMPLO = 'DADOS DE EXEMPLO — não representam a equipe real.';

/** RF-020: compromissos fictícios da semana `segunda`; nunca vêm do servidor. */
export function dadosExemplo(segunda: string): Linha[] {
  const c = (exec: number, nome: string, dia: number, cliente: string, status: string, extra: Linha = {}) => ({
    ORIGEM: 'VISITA', ID: exec * 100 + dia, EXECUTIVO_ID: exec, EXECUTIVO: nome, DATA: somarDias(segunda, dia), HORA: '09:00', CLIENTE: cliente, STATUS: status,
    CONCLUIDA: status === 'CONCLUIDA' ? 1 : 0, NAO_CONCLUIDA: ['AGENDADA', 'EM_ANDAMENTO'].includes(status) ? 1 : 0, CANCELADA: status === 'CANCELADA' ? 1 : 0,
    SEM_RELATO: 0, VENCIDA: 0, REAGENDADA: 0,
    SITUACAO: { CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada', AGENDADA: 'Agendada', EM_ANDAMENTO: 'Em andamento (sem checkout)' }[status], ...extra,
  });
  return [
    c(1, 'Executivo Exemplo A', 0, 'Clínica Exemplo', 'CONCLUIDA'),
    c(1, 'Executivo Exemplo A', 1, 'Hospital Exemplo', 'AGENDADA', { SEM_RELATO: 1, VENCIDA: 1, SITUACAO: 'Vencida sem relato' }),
    c(1, 'Executivo Exemplo A', 2, 'Farmácia Exemplo', 'CONCLUIDA', { REAGENDADA: 1 }),
    c(2, 'Executivo Exemplo B', 0, 'Lar Exemplo', 'CONCLUIDA'),
    c(2, 'Executivo Exemplo B', 3, 'Distribuidora Exemplo', 'CANCELADA'),
    c(2, 'Executivo Exemplo B', 4, 'Centro Exemplo', 'EM_ANDAMENTO'),
  ];
}

/* ─────────────── Carteira sem Visitação (RN-028) ─────────────── */

export const FAIXAS = [
  { value: '', label: 'Todas' },
  { value: 'NUNCA', label: 'Nunca visitados' },
  { value: '31_60', label: '31 a 60 dias' },
  { value: '61_90', label: '61 a 90 dias' },
  { value: '90', label: 'Mais de 90 dias' },
];
export const rotuloFaixa = (f: string) => FAIXAS.find(x => x.value === f && f)?.label ?? f;
export const tomFaixa = (f: string): 'alert' | 'attention' | 'off' => (f === 'NUNCA' || f === '90' ? 'alert' : f === '61_90' ? 'attention' : 'off');

export function totaisFaixa(linhas: Linha[]): Record<string, number> {
  const l = linhas[0] ?? {};
  return { NUNCA: Number(l.N_NUNCA) || 0, '31_60': Number(l.N_31_60) || 0, '61_90': Number(l.N_61_90) || 0, '90': Number(l.N_90) || 0 };
}

/** A SF manda uma linha só de totais quando a página vem vazia. */
export const comCliente = (linhas: Linha[]) => linhas.filter(l => l.ID_CLIENTE != null);

/* ─────────────── exportação (RN-029) ─────────────── */

export interface Coluna {
  titulo: string;
  campo: string;
  /** 'data' = data do Excel; 'moeda' e 'numero' = número; 'pct' = fração com formato 0%. */
  formato?: 'texto' | 'data' | 'numero' | 'moeda' | 'pct';
}

export interface Aba {
  nome: string;
  colunas: Coluna[];
  linhas: Linha[];
}

export interface Planilha {
  arquivo: string;
  abas: Aba[];
  aviso?: string;
}

export const FORMATOS: Record<string, string> = { data: 'dd/mm/yyyy', moeda: '"R$" #,##0.00', numero: '0', pct: '0%' };

export function planilhaAgenda(resumo: ResumoExecutivo[], hoje: string, exemplo = false): Planilha {
  const soma = (c: keyof ResumoExecutivo) => resumo.reduce((t, r) => t + (Number(r[c]) || 0), 0);
  const agendadas = soma('agendadas');
  const linha = (r: Pick<ResumoExecutivo, 'nome' | 'agendadas' | 'concluidas' | 'naoConcluidas' | 'semRelato' | 'reagendadas' | 'canceladas' | 'execucao'>) => ({
    EXECUTIVO: r.nome, AGENDADAS: r.agendadas, CONCLUIDAS: r.concluidas, NAO_CONCLUIDAS: r.naoConcluidas, SEM_RELATO: r.semRelato,
    REAGENDADAS: r.reagendadas, CANCELADAS: r.canceladas, EXECUCAO: r.execucao,
  });
  return {
    arquivo: `controle-agenda-${hoje}.xlsx`,
    aviso: exemplo ? AVISO_EXEMPLO : undefined,
    abas: [
      {
        nome: 'Resumo por executivo',
        colunas: [
          { titulo: 'Executivo', campo: 'EXECUTIVO' }, { titulo: 'Agendadas', campo: 'AGENDADAS', formato: 'numero' },
          { titulo: 'Concluídas', campo: 'CONCLUIDAS', formato: 'numero' }, { titulo: 'Não concluídas', campo: 'NAO_CONCLUIDAS', formato: 'numero' },
          { titulo: 'Sem relato', campo: 'SEM_RELATO', formato: 'numero' }, { titulo: 'Reagendadas', campo: 'REAGENDADAS', formato: 'numero' },
          { titulo: 'Canceladas', campo: 'CANCELADAS', formato: 'numero' }, { titulo: 'Execução', campo: 'EXECUCAO', formato: 'pct' },
        ],
        linhas: [
          ...resumo.map(linha),
          linha({ nome: 'Total', agendadas, concluidas: soma('concluidas'), naoConcluidas: soma('naoConcluidas'), semRelato: soma('semRelato'),
            reagendadas: soma('reagendadas'), canceladas: soma('canceladas'), execucao: agendadas ? soma('concluidas') / agendadas : null }),
        ],
      },
      {
        nome: 'Compromissos',
        colunas: [
          { titulo: 'Executivo', campo: 'EXECUTIVO' }, { titulo: 'Data', campo: 'DATA', formato: 'data' }, { titulo: 'Hora', campo: 'HORA' },
          { titulo: 'Tipo', campo: 'TIPO' }, { titulo: 'Cliente', campo: 'CLIENTE' }, { titulo: 'Situação', campo: 'SITUACAO' },
        ],
        linhas: resumo.flatMap(r => r.compromissos.map(c => ({ ...c, TIPO: c.ORIGEM === 'PROSPECCAO' ? 'Prospecção' : 'Visita' }))),
      },
    ],
  };
}

export function planilhaCriticos(executivos: Linha[], hoje: string): Planilha {
  return {
    arquivo: `clientes-criticos-sem-compra-${hoje}.xlsx`,
    abas: [{
      nome: 'Clientes críticos',
      colunas: [
        { titulo: 'Executivo', campo: 'EXECUTIVO' }, { titulo: 'Cliente', campo: 'NOME' }, { titulo: 'Curva', campo: 'CURVA' },
        { titulo: 'Última compra', campo: 'ULTIMA', formato: 'data' }, { titulo: 'Ciclo (dias)', campo: 'CICLO', formato: 'numero' },
        { titulo: 'Compra prevista', campo: 'PREVISTA', formato: 'data' }, { titulo: 'Situação', campo: 'SITUACAO' },
        { titulo: 'Ticket médio', campo: 'TICKET', formato: 'moeda' },
      ],
      linhas: executivos.flatMap(e => (e.clientes as Linha[]).map(c => ({ ...c, EXECUTIVO: e.EXECUTIVO }))),
    }],
  };
}

export function planilhaSemVisita(linhas: Linha[], hoje: string): Planilha {
  return {
    arquivo: `carteira-sem-visitacao-${hoje}.xlsx`,
    abas: [{
      nome: 'Carteira sem visitação',
      colunas: [
        { titulo: 'Executivo', campo: 'EXECUTIVO' }, { titulo: 'Cliente', campo: 'CLIENTE' }, { titulo: 'Cidade', campo: 'CIDADE' },
        { titulo: 'Faixa', campo: 'FAIXA_ROTULO' }, { titulo: 'Última visita', campo: 'ULTIMA', formato: 'data' },
        { titulo: 'Dias', campo: 'DIAS', formato: 'numero' }, { titulo: 'Próxima visita', campo: 'PROXIMA', formato: 'data' },
      ],
      linhas: comCliente(linhas).map(l => ({ ...l, FAIXA_ROTULO: rotuloFaixa(l.FAIXA) })),
    }],
  };
}

/** Valor da célula: data como Date (meio-dia UTC, sem virar o dia), número como número. */
export function valorCelula(valor: unknown, formato: Coluna['formato']): unknown {
  if (valor == null || valor === '') return null;
  if (formato === 'data') return /^\d{4}-\d{2}-\d{2}/.test(String(valor)) ? paraData(String(valor)) : null;
  if (formato === 'numero' || formato === 'moeda' || formato === 'pct') return Number(valor);
  return String(valor);
}

/** Monta o .xlsx com o exceljs (carregado só aqui) e baixa no navegador. */
export async function exportar(planilha: Planilha): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const livro = new ExcelJS.Workbook();
  for (const aba of planilha.abas) {
    const folha = livro.addWorksheet(aba.nome.slice(0, 31));
    if (planilha.aviso) folha.addRow([planilha.aviso]).font = { bold: true };
    folha.addRow(aba.colunas.map(c => c.titulo)).font = { bold: true };
    for (const l of aba.linhas) {
      const linha = folha.addRow(aba.colunas.map(c => valorCelula(l[c.campo], c.formato)));
      aba.colunas.forEach((c, i) => {
        if (c.formato && FORMATOS[c.formato]) linha.getCell(i + 1).numFmt = FORMATOS[c.formato];
      });
    }
    aba.colunas.forEach((c, i) => { folha.getColumn(i + 1).width = Math.max(12, c.titulo.length + 4); });
  }
  const buffer = await livro.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = planilha.arquivo;
  link.click();
  URL.revokeObjectURL(url);
}
