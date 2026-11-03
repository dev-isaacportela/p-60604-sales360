// Gestão de Carteira (RN-017 a RN-019). Regra pura: tests/gestao-carteira.test.mjs.
// O servidor decide e conta (s360GestaoCarteira*); aqui só as mensagens da spec
// e a escolha de escopo do C-020.

export type MotivoTransferencia = 'FORA_DA_EQUIPE' | 'JA_TEM' | 'SEM_ESCOPO' | 'OK';

/** C-018 / RN-018: por que a transferência não mudou nada. */
export function mensagemTransferencia(motivo: MotivoTransferencia | string, destino: string, escopo: string): string {
  if (motivo === 'JA_TEM') return `Nada foi alterado: ${destino} já tem este cliente nesta filial e seção.`;
  if (motivo === 'SEM_ESCOPO') return `Nada foi alterado: ${destino} não atua em ${escopo}.`;
  if (motivo === 'FORA_DA_EQUIPE') return 'Nada foi alterado: o cliente ou o vendedor não está mais na sua equipe.';
  return 'Nada foi alterado. Atualize a tela e tente de novo.';
}

/** C-019: "37 clientes transferidos. 3 já estavam com Bruno." */
export function resumoTransferencia(transferidos: number, jaTinha: number, destino: string): string {
  const ja = jaTinha === 1 ? `1 já estava com ${destino}.` : `${jaTinha} já estavam com ${destino}.`;
  if (transferidos === 0) return jaTinha ? `Nada foi alterado: ${ja}` : 'Nada foi alterado.';
  const feitos = transferidos === 1 ? '1 cliente transferido.' : `${transferidos} clientes transferidos.`;
  return jaTinha ? `${feitos} ${ja}` : feitos;
}

export interface LinhaEscopo {
  VENDEDOR_ID: number | string;
  CODFILIAL: string;
  FILIAL?: string | null;
  CODEPTO: string;
  BU?: string | null;
  ID_SECAO: number | string | null;
  SECAO?: string | null;
}

export interface EscopoVendedor {
  codFilial: string;
  codepto: string;
  idSecao: string;
  rotulo: string;
}

/** "Filial 1 · Ortopedia · Órteses" (sem seção: só filial e departamento). */
export function rotuloEscopo(l: Pick<LinhaEscopo, 'CODFILIAL' | 'FILIAL' | 'CODEPTO' | 'BU' | 'SECAO'>): string {
  return [l.FILIAL || `Filial ${l.CODFILIAL}`, l.BU || l.CODEPTO, l.SECAO].filter(Boolean).join(' · ');
}

/** C-020: escopos de um vendedor da equipe, a partir de s360GestaoCarteiraVendedores. */
export function escoposDoVendedor(linhas: LinhaEscopo[], vendedorId: number | string): EscopoVendedor[] {
  return linhas
    .filter(l => String(l.VENDEDOR_ID) === String(vendedorId))
    .map(l => ({ codFilial: String(l.CODFILIAL), codepto: String(l.CODEPTO), idSecao: l.ID_SECAO == null ? '' : String(l.ID_SECAO), rotulo: rotuloEscopo(l) }));
}

/** C-020: com mais de um escopo o coordenador escolhe; com um, ele já vem escolhido. */
export function precisaEscolherEscopo(escopos: EscopoVendedor[]): boolean {
  return escopos.length > 1;
}
