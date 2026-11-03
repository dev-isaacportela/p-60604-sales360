// Fragmentos SQL de autorizacao, reusados por toda SF do sistema novo.
//
// Quem chama e sempre `:VAR_USER` (RNT-012), nunca um id vindo no input.
// Cada fragmento e uma condicao booleana para colar num WHERE com `AND`.

// RN-016 da 001: usuario bloqueado nao le nem grava nada.
export const SEM_BLOQUEIO = `NOT EXISTS (
    SELECT 1 FROM USUARIO_BLOQUEIO BLQ
    WHERE BLQ.USER_ID = :VAR_USER AND BLQ.BLOQUEADO = 1)`;

// Papeis acumulam (RNT-001): uniao da tabela nova com o papel legado (D-003).
export const temPapel = (...papeis) => {
  const lista = papeis.map((p) => `'${p}'`).join(', ');
  return `(EXISTS (SELECT 1 FROM USUARIO_PAPEL UPA WHERE UPA.USER_ID = :VAR_USER AND UPA.PAPEL IN (${lista}))
    OR EXISTS (SELECT 1 FROM USUARIO_CARGO UCA WHERE UCA.USER_ID = :VAR_USER AND UCA.CARGO IN (${lista})))`;
};

// RN-006 da 001: coordenador vale pelo cadastro ativo, nao pelo papel.
export const COORDENADOR_ATIVO = `EXISTS (
    SELECT 1 FROM COORDENADORES CRD
    WHERE CRD.USER_ID = :VAR_USER AND CRD.ATIVO = 1)`;
