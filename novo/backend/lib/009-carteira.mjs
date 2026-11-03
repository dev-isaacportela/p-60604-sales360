// Carteira de quem chama, para o Mix Builder (RNT-007a / RNT-010).
//
// Clientes do :VAR_USER em EQUIPE_CLIENTE mais os dos titulares de quem ele e
// substituto com ferias ATIVAS em '{{hoje}}' (fonte unica FERIAS_VENDEDOR,
// titular e substituto por VENDEDOR_RCA.COD_RCA, como a SF de ferias da 001).
// A SF que usa precisa receber `hoje`.
//
// ponytail: fragmento proprio da 009 enquanto a spec 002 nao publica
// lib/002-carteira.mjs; quando existir, trocar por ele (mesma regra, uma fonte).

export const clienteNaCarteira = (coluna) => `${coluna} IN (
    SELECT ECP.ID_CLIENTE FROM EQUIPE_CLIENTE ECP WHERE ECP.ID_VENDEDOR = :VAR_USER
    UNION
    SELECT ECT.ID_CLIENTE
    FROM EQUIPE_CLIENTE ECT
    JOIN VENDEDOR_RCA VRT ON VRT.USER_ID = ECT.ID_VENDEDOR
    JOIN FERIAS_VENDEDOR FVC ON FVC.COD_RCA = VRT.COD_RCA
      AND FVC.ATIVO = 1 AND FVC.DT_INICIO <= '{{hoje}}' AND FVC.DT_FIM >= '{{hoje}}'
    JOIN VENDEDOR_RCA VRS ON VRS.COD_RCA = FVC.COD_RCA_SUBSTITUTO
    WHERE VRS.USER_ID = :VAR_USER)`;
