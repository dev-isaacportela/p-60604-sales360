/**
 * Divisao de Carteira de Clientes DF 08.26
 *
 * Fonte: uploads/Divisao_Carteira_de_Clientes_DF_08.26_1__1788547698365.xlsx
 * (uma aba por vendedora, com o ID de usuario no nome da aba).
 *
 * Acoes:
 *   - Vendedora 28 (Fernanda) : carteira passa a bater EXATAMENTE com a aba "Fernanda COD 28"
 *   - Vendedora 44 (Amanda)   : carteira passa a ser exatamente a aba "Amanda COD 44"
 *   - Vendedora 45 (Thatiana) : carteira passa a ser exatamente a aba "Thatiana COD 45",
 *                               MENOS o cliente 9211, que aparecia nas duas abas e o
 *                               usuario definiu que fica apenas com a vendedora 44
 *   - Vendedora 19 (Layla)    : carteira ZERADA
 *
 * Observacoes tecnicas:
 *   - CODCLI da planilha == CLIENTES.ID == CLIENTES.WINTHOR_CODCLI (validado: 97/97 existem)
 *   - Escopo (CODFILIAL/ID_SECAO) das novas linhas = '5'/101, que e o escopo ja usado
 *     em 100% das linhas atuais da vendedora 28 e esta ativo em BU_VENDEDOR para 28/44/45.
 *   - Vinculos ja existentes e que permanecem na carteira NAO sao recriados (preserva
 *     CURVA_CLASSIFICACAO e CRIADO_EM originais).
 *   - Antes de qualquer DELETE o script grava um backup JSON das linhas afetadas.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { configureSdkMitra, runQueryMitra, runDmlMitra } from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);
const CODFILIAL = '5';
const ID_SECAO = 101;

// CODCLI extraidos das abas da planilha
const CARTEIRAS = {
  28: [105984, 105628, 84, 15, 103174, 101343, 102349, 105421, 107332, 102302, 108174, 231,
       102075, 101602, 16, 100552, 105707, 108309, 100528, 101785, 102606, 169, 107955,
       104991, 108213, 107900, 100128, 100127, 104440, 104425, 9758, 426, 3246, 108461,
       106424, 550],
  44: [71, 9211, 108, 680, 3019, 474, 139, 52, 101562, 101175, 104682, 107968, 103997, 21,
       430, 175, 1528, 420, 105470, 166, 100578, 2863, 671, 105506, 102229, 629, 2548, 128,
       259, 100273, 232, 105328],
  // 9211 saiu desta lista por decisao do usuario: fica apenas com a vendedora 44
  45: [100808, 1180, 105671, 108382, 105501, 531, 108689, 108688, 42, 9, 212, 39,
       101404, 100946, 12720, 661, 100, 472, 473, 190, 235, 9321, 102, 105343, 761, 104811,
       116, 2541, 11],
};
const ZERAR = [19];
const AFETADOS = [...Object.keys(CARTEIRAS).map(Number), ...ZERAR];

const query = async (sql) => (await runQueryMitra({ projectId, sql }))?.result?.rows || [];
const dml = async (sql) => runDmlMitra({ projectId, sql });

async function main() {
  // 1) Backup do estado atual das carteiras afetadas
  const antes = await query(`
    SELECT ID, ID_CLIENTE, ID_VENDEDOR, CODFILIAL, ID_SECAO, CURVA_CLASSIFICACAO, CRIADO_EM
    FROM EQUIPE_CLIENTE
    WHERE ID_VENDEDOR IN (${AFETADOS.join(', ')})
    ORDER BY ID_VENDEDOR, ID_CLIENTE
  `);
  // Backup por execucao: o script e idempotente e pode ser reexecutado, entao cada
  // rodada grava seu proprio snapshot em vez de sobrescrever o anterior.
  const carimbo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
  const backupNome = `equipe-cliente-df-0826-antes-${carimbo}.json`;
  writeFileSync(new URL(`./backups/${backupNome}`, import.meta.url), JSON.stringify(antes, null, 2));
  console.log(`Backup de ${antes.length} vinculos gravado em backups/${backupNome}`);

  // 2) Valida que todos os CODCLI existem em CLIENTES
  const todos = [...new Set(Object.values(CARTEIRAS).flat())];
  const existentes = new Set((await query(
    `SELECT ID FROM CLIENTES WHERE ID IN (${todos.join(', ')})`
  )).map((r) => r.ID));
  const inexistentes = todos.filter((id) => !existentes.has(id));
  if (inexistentes.length > 0) {
    throw new Error(`CODCLI nao encontrados em CLIENTES: ${inexistentes.join(', ')}`);
  }
  console.log(`Validacao: ${todos.length} clientes distintos, todos existentes.`);

  // 3) Aplica cada carteira (delete do que sobra + insert do que falta)
  for (const [vendedorId, lista] of Object.entries(CARTEIRAS)) {
    const ids = lista.join(', ');
    const del = await dml(`
      DELETE FROM EQUIPE_CLIENTE
      WHERE ID_VENDEDOR = ${vendedorId}
        AND ID_CLIENTE NOT IN (${ids})
    `);
    const ins = await dml(`
      INSERT INTO EQUIPE_CLIENTE (ID_CLIENTE, ID_VENDEDOR, CODFILIAL, ID_SECAO, CRIADO_EM)
      SELECT C.ID, ${vendedorId}, '${CODFILIAL}', ${ID_SECAO}, SUBSTRING(CURRENT_TIMESTAMP, 1, 19)
      FROM CLIENTES C
      WHERE C.ID IN (${ids})
        AND NOT EXISTS (
          SELECT 1 FROM EQUIPE_CLIENTE EC
          WHERE EC.ID_CLIENTE = C.ID AND EC.ID_VENDEDOR = ${vendedorId}
        )
    `);
    console.log(`Vendedora ${vendedorId}: removidos ${del?.result?.affectedRows ?? '?'}, inseridos ${ins?.result?.affectedRows ?? '?'} (alvo: ${lista.length})`);
  }

  // 4) Zera as carteiras indicadas
  for (const vendedorId of ZERAR) {
    const del = await dml(`DELETE FROM EQUIPE_CLIENTE WHERE ID_VENDEDOR = ${vendedorId}`);
    console.log(`Vendedora ${vendedorId}: carteira zerada (${del?.result?.affectedRows ?? '?'} vinculos removidos)`);
  }

  // 5) Conferencia final
  const depois = await query(`
    SELECT ID_VENDEDOR, COUNT(*) AS QTD, COUNT(DISTINCT ID_CLIENTE) AS CLIENTES
    FROM EQUIPE_CLIENTE
    WHERE ID_VENDEDOR IN (${AFETADOS.join(', ')})
    GROUP BY ID_VENDEDOR
    ORDER BY ID_VENDEDOR
  `);
  console.log('\nEstado final:');
  console.log(JSON.stringify(depois));

  for (const [vendedorId, lista] of Object.entries(CARTEIRAS)) {
    const atual = (await query(
      `SELECT DISTINCT ID_CLIENTE FROM EQUIPE_CLIENTE WHERE ID_VENDEDOR = ${vendedorId}`
    )).map((r) => r.ID_CLIENTE).sort((a, b) => a - b);
    const alvo = [...new Set(lista)].sort((a, b) => a - b);
    const ok = JSON.stringify(atual) === JSON.stringify(alvo);
    console.log(`Vendedora ${vendedorId}: ${ok ? 'OK — bate exatamente com a planilha' : 'DIVERGENTE'} (${atual.length}/${alvo.length})`);
    if (!ok) {
      console.log('  sobrando:', atual.filter((c) => !alvo.includes(c)).join(', ') || '-');
      console.log('  faltando:', alvo.filter((c) => !atual.includes(c)).join(', ') || '-');
    }
  }
  for (const vendedorId of ZERAR) {
    const n = (await query(`SELECT COUNT(*) AS N FROM EQUIPE_CLIENTE WHERE ID_VENDEDOR = ${vendedorId}`))[0]?.N;
    console.log(`Vendedora ${vendedorId}: ${n === 0 ? 'OK — carteira zerada' : `DIVERGENTE (${n} restantes)`}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
