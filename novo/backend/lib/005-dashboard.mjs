// Fragmentos SQL do Dashboard (spec 005): a meta semanal de visitas
// configuravel por perfil (RF-004), que a Agenda (003) tambem le.
//
// Faturamento, meta do mes, ultima carga e alertas nao tem fragmento aqui: o
// Dashboard usa as SFs e os fragmentos da 006, 007 e 008 (D-509), para o
// numero ser o mesmo da tela de origem (C-004 da 000).

/* ─────────────── meta semanal de visitas (RN-005, RF-004) ─────────────── */

// Carga inicial: os valores de hoje do sistema antigo, valendo desde sempre
// (a segunda 03/01/2000).
export const META_INICIAL = [['VENDEDOR', 16, '2000-01-03'], ['COORDENADOR', 8, '2000-01-03']];

// Perfil da meta: coordenador = cadastro ativo (o mesmo criterio da 003).
export const ehCoordenador = (pessoa) => `EXISTS (SELECT 1 FROM COORDENADORES C_M5 WHERE C_M5.USER_ID = ${pessoa} AND C_M5.ATIVO = 1)`;

// Valor do perfil vigente na semana que comeca em `segunda` ('AAAA-MM-DD').
export const metaPerfil = (perfil, segunda) => `COALESCE((SELECT MS_P.VALOR FROM META_SEMANAL_VISITAS MS_P
    WHERE MS_P.PERFIL = ${perfil} AND MS_P.VIGENCIA_INICIO <= ${segunda}
    ORDER BY MS_P.VIGENCIA_INICIO DESC LIMIT 1), 0)`;

export const metaSemanal = (pessoa, segunda) =>
  metaPerfil(`CASE WHEN ${ehCoordenador(pessoa)} THEN 'COORDENADOR' ELSE 'VENDEDOR' END`, segunda);
