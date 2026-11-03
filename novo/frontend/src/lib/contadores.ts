// Contadores do menu (RN-007, RN-008).
// Regra pura + o evento que as telas disparam após uma ação que muda um contador.

export const INTERVALO_RECARGA_MS = 5 * 60 * 1000;
export const EVENTO_CONTADORES = 's360:contadores';

/** Já passaram 5 minutos desde a última carga? (tempos em ms) */
export function precisaRecarregar(ultima: number, agora: number): boolean {
  return agora - ultima >= INTERVALO_RECARGA_MS;
}

/** Contador zero não aparece no menu (RN-008). */
export function rotuloContador(valor: unknown): string | null {
  const n = Number(valor) || 0;
  if (n <= 0) return null;
  return n > 99 ? '99+' : String(n);
}

/** Chame depois de concluir uma atividade, ler um alerta etc.: o menu relê na hora (C-009). */
export function avisarContadores(): void {
  window.dispatchEvent(new Event(EVENTO_CONTADORES));
}
