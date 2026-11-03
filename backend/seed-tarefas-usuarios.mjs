import 'dotenv/config';
import {
  configureSdkMitra,
  runDmlMitra,
} from 'mitra-sdk';

configureSdkMitra({
  baseURL: process.env.MITRA_BASE_URL,
  token: process.env.MITRA_TOKEN,
  integrationURL: process.env.MITRA_BASE_URL_INTEGRATIONS,
});

const projectId = Number(process.env.MITRA_PROJECT_ID);

const hoje = new Date();
const now = new Date().toISOString().slice(0, 19);
const formatDate = (d) => d.toISOString().slice(0, 10);

const seeds = [
  { titulo: 'Enviar proposta para NutriFit', descricao: 'Preparar e enviar proposta de Whey Protein e Creatina', status: 'PENDENTE', prioridade: 'ALTA', prazo: formatDate(new Date(hoje.getTime() + 2 * 86400000)) },
  { titulo: 'Atualizar cadastro Bom Preco', descricao: 'Atualizar dados de contato do Supermercado Bom Preco', status: 'PENDENTE', prioridade: 'MEDIA', prazo: formatDate(new Date(hoje.getTime() + 5 * 86400000)) },
  { titulo: 'Reuniao com Saude Total', descricao: 'Agendar reuniao para apresentar linha de vitaminas', status: 'EM_ANDAMENTO', prioridade: 'ALTA', prazo: formatDate(new Date(hoje.getTime() + 1 * 86400000)) },
  { titulo: 'Coletar feedback GymPower', descricao: 'Ligar para coletar feedback dos ultimos pedidos', status: 'PENDENTE', prioridade: 'BAIXA', prazo: formatDate(new Date(hoje.getTime() + 7 * 86400000)) },
  { titulo: 'Preparar relatorio mensal', descricao: 'Consolidar dados de vendas do mes para apresentar ao supervisor', status: 'PENDENTE', prioridade: 'MEDIA', prazo: formatDate(new Date(hoje.getTime() + 3 * 86400000)) },
  { titulo: 'Follow-up com Emporio Natural', descricao: 'Acompanhar entrega e satisfacao do ultimo pedido', status: 'CONCLUIDA', prioridade: 'MEDIA', prazo: formatDate(new Date(hoje.getTime() - 2 * 86400000)) },
  { titulo: 'Cadastrar novo cliente Wellness', descricao: 'Finalizar cadastro e primeira visita', status: 'CONCLUIDA', prioridade: 'ALTA', prazo: formatDate(new Date(hoje.getTime() - 5 * 86400000)) },
  { titulo: 'Treinamento de produtos novos', descricao: 'Participar do treinamento sobre a nova linha de proteinas', status: 'EM_ANDAMENTO', prioridade: 'MEDIA', prazo: formatDate(new Date(hoje.getTime() + 4 * 86400000)) },
];

async function main() {
  for (const seed of seeds) {
    const titulo = seed.titulo.replace(/'/g, "''");
    const descricao = seed.descricao.replace(/'/g, "''");
    await runDmlMitra({
      projectId,
      sql: `
INSERT INTO TAREFAS (
  VENDEDOR_ID,
  TITULO,
  DESCRICAO,
  STATUS,
  PRIORIDADE,
  DATA_LIMITE,
  CRIADO_EM
)
SELECT U.ID,
       '${titulo}',
       '${descricao}',
       '${seed.status}',
       '${seed.prioridade}',
       '${seed.prazo}',
       '${now}'
FROM INT_USER U
WHERE NOT EXISTS (
  SELECT 1
  FROM TAREFAS T
  WHERE T.VENDEDOR_ID = U.ID
    AND T.TITULO = '${titulo}'
);
      `,
    });
  }

  console.log('Tarefas sample replicadas para todos os usuarios.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
