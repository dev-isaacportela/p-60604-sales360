import { SF, callSFMutation, callSFMutationComErro } from '../hooks/useMitra';

/**
 * Sincronização de um item da agenda com o Google, instantânea.
 *
 * Por que existe este orquestrador em vez de uma chamada só: acesso business **não escreve
 * no banco de dentro de SF JavaScript**. A SF que fala com o Google (212) é JavaScript, então
 * ela virou função pura — devolve o que precisa ser gravado, em `gravacoes`, e a gravação é
 * feita aqui por SFs SQL, que o vendedor executa normalmente.
 *
 * Se a SF 212 falhar, o item entra na fila e o worker em cron (que roda como Administrator)
 * refaz a sincronização e persiste sozinho em até 5 minutos. A fila é rede de segurança,
 * não o caminho normal.
 */

type Entidade = 'VISITA' | 'TAREFA' | 'PROSPECCAO' | 'INTERNA';

interface Gravacao {
  tipo?: string;
  userId?: number;
  entidade?: string;
  entidadeId?: number;
  googleEventId?: string;
  statusSync?: string;
  acao?: string;
  status?: string;
  mensagem?: string;
  erro?: string;
}

export async function sincronizarGoogleAgenda(entidade: Entidade, entidadeId: number): Promise<boolean> {
  const id = Number(entidadeId);
  if (!id) return true;

  const res = await callSFMutationComErro(SF.googleAgendaSincronizarItem, { entidade, entidadeId: id });

  if (!res.ok) {
    // Rede de segurança: nada foi para o Google, então refazer pelo worker não duplica evento.
    await callSFMutation(SF.googleAgendaEnfileirarSync, { entidade, entidadeId: id });
    console.warn(`Google Agenda: ${entidade} ${id} falhou e entrou na fila de retentativa.`, res.error);
    return false;
  }

  const gravacoes: Gravacao[] = Array.isArray(res.dados?.gravacoes) ? res.dados.gravacoes : [];

  // O vínculo vem primeiro: é o que impede a próxima edição de criar um evento duplicado.
  for (const g of gravacoes.filter((item) => item.tipo === 'vinculo')) {
    await callSFMutation(SF.googleAgendaGravarVinculo, {
      userId: Number(g.userId) || 0,
      entidade: String(g.entidade || ''),
      entidadeId: Number(g.entidadeId) || 0,
      googleEventId: String(g.googleEventId || ''),
      statusSync: String(g.statusSync || ''),
      erro: String(g.erro || ''),
    });
  }

  for (const g of gravacoes.filter((item) => item.tipo === 'log')) {
    await callSFMutation(SF.googleAgendaLogSync, {
      userId: Number(g.userId) || 0,
      entidade: String(g.entidade || ''),
      entidadeId: Number(g.entidadeId) || 0,
      acao: String(g.acao || ''),
      status: String(g.status || ''),
      mensagem: String(g.mensagem || ''),
    });
  }

  // "Última sincronização" e "último erro" são os campos que a tela de Configurações mostra
  // para o próprio usuário — a SF resolve :VAR_USER no servidor, então uma chamada basta.
  const erroConfig = gravacoes
    .filter((item) => item.tipo === 'config')
    .map((item) => String(item.erro || ''))
    .find((texto) => texto !== '') || '';
  await callSFMutation(SF.googleAgendaMarcarSync, { erro: erroConfig });

  return erroConfig === '';
}
