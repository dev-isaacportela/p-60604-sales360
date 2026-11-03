import { useState, type ReactNode } from 'react';
import { BarChart3, CalendarDays, CheckCircle2, CheckSquare, ChevronDown, Compass, LineChart, Search, Target, Users } from 'lucide-react';

interface HelpScreen {
  title: string;
  route: string;
  audience: 'Vendedores' | 'Ambos';
  icon: ReactNode;
  summary: string;
  objective: string;
  whenToUse: string[];
  steps: string[];
  bestPractices: string[];
  expectedResult: string;
}

const dailyRoutine = [
  'Abra o Dashboard no início do dia para conferir indicadores, alertas e compromissos.',
  'Revise a carteira em Clientes para priorizar quem precisa de contato, visita ou recuperação.',
  'Consulte Alertas e Prospecção para transformar oportunidades em ação prática.',
  'Registre visitas e compromissos na Agenda, mantendo objetivo e resultado atualizados.',
  'Controle pendências em Atividades para não perder retornos, cotações ou follow-ups.',
  'Use Analytics no fim do dia ou da semana para entender evolução, gaps e próximos focos.',
];

const quickRules = [
  'Toda visita importante deve ficar registrada na Agenda, mesmo quando o contato acontecer por telefone ou mensagem.',
  'Toda oportunidade identificada deve virar uma próxima ação: tarefa, visita, simulação de mix ou contato com o cliente.',
  'Clientes em risco, inativos ou com queda de compra devem ser tratados antes de prospecções frias.',
  'Filtros de período e carteira precisam ser conferidos antes de qualquer análise de resultado.',
  'Ao concluir uma tarefa ou atendimento, atualize o status para manter os indicadores confiáveis.',
];

const sellerScreens: HelpScreen[] = [
  {
    title: 'Dashboard',
    route: '/',
    audience: 'Ambos',
    icon: <Compass size={22} />,
    summary: 'Visão inicial da rotina comercial, com saudação, indicadores do dia, agenda próxima e atalhos para prioridades.',
    objective: 'Dar ao vendedor uma leitura rápida do dia: desempenho, agenda, pendências e pontos que exigem atenção imediata.',
    whenToUse: [
      'No começo do expediente, antes de abrir clientes ou agenda.',
      'Durante o dia, para revisar próximos compromissos e pendências.',
      'Ao voltar de uma visita, para decidir a próxima ação comercial.',
    ],
    steps: [
      'Confira a saudação e o resumo principal para entender o ritmo do período.',
      'Revise os cartões de indicadores e observe se a situação está acima, dentro ou abaixo do esperado.',
      'Verifique compromissos próximos e atividades pendentes.',
      'Acesse Clientes, Agenda ou Alertas a partir dos atalhos quando identificar algo que precise de ação.',
    ],
    bestPractices: [
      'Não use o Dashboard apenas como consulta: transforme cada alerta visual em uma decisão de trabalho.',
      'Se houver divergência entre sensação de campo e indicador, abra Analytics para investigar o detalhe.',
      'Revise a tela pelo menos duas vezes ao dia: início do expediente e após o horário de maior atendimento.',
    ],
    expectedResult: 'Ao sair do Dashboard, o vendedor deve saber quais clientes priorizar, quais compromissos cumprir e quais indicadores acompanhar no dia.',
  },
  {
    title: 'Agenda',
    route: '/agenda',
    audience: 'Vendedores',
    icon: <CalendarDays size={22} />,
    summary: 'Organiza visitas, tarefas comerciais e compromissos com clientes.',
    objective: 'Registrar o planejamento e a execução dos contatos comerciais, criando histórico confiável de relacionamento com a carteira.',
    whenToUse: [
      'Antes da semana começar, para planejar visitas e compromissos.',
      'No dia da visita, para consultar horários, cliente e objetivo.',
      'Depois do atendimento, para registrar resultado, observações e próximos passos.',
    ],
    steps: [
      'Escolha o dia ou período que deseja consultar.',
      'Abra ou crie o compromisso relacionado ao cliente ou à agenda interna.',
      'Informe objetivo da visita, tipo de contato e dados relevantes para o acompanhamento.',
      'Após a execução, atualize o resultado e registre o que ficou combinado com o cliente.',
      'Quando houver pendência de retorno, crie uma atividade para acompanhar o próximo passo.',
    ],
    bestPractices: [
      'Evite registrar visitas genéricas: descreva o objetivo comercial com clareza.',
      'Não deixe visitas concluídas sem resultado preenchido, pois isso enfraquece o histórico do cliente.',
      'Use a agenda como memória da carteira, não apenas como calendário.',
    ],
    expectedResult: 'A carteira fica com histórico de contato atualizado e o vendedor reduz perda de follow-up após visitas.',
  },
  {
    title: 'Clientes',
    route: '/clientes',
    audience: 'Vendedores',
    icon: <Users size={22} />,
    summary: 'Carteira de clientes com dados de compra, status, temperatura e oportunidades de atuação.',
    objective: 'Concentrar as informações da carteira para priorizar atendimento, recuperação, crescimento e prospecção dentro da base.',
    whenToUse: [
      'Sempre que precisar decidir qual cliente visitar ou contatar primeiro.',
      'Antes de uma reunião, ligação ou negociação.',
      'Ao receber alerta de queda, inatividade ou oportunidade de venda.',
    ],
    steps: [
      'Use a busca para encontrar um cliente por nome, código ou ramo.',
      'Analise status, temperatura, histórico e informações comerciais disponíveis.',
      'Identifique sinais de risco, queda de compra, ausência de compra ou oportunidade de mix.',
      'Abra os detalhes do cliente para consultar dados complementares antes do contato.',
      'Defina a próxima ação: visita, tarefa, proposta, simulação de mix ou acompanhamento futuro.',
    ],
    bestPractices: [
      'Priorize clientes com risco ou queda antes de focar em clientes já estáveis.',
      'Antes de falar com o cliente, revise histórico e oportunidade para evitar abordagem genérica.',
      'Use as informações da carteira para conduzir uma venda consultiva, não apenas tirar pedido.',
    ],
    expectedResult: 'O vendedor atua com prioridade clara, melhora recuperação de clientes e aumenta qualidade da abordagem comercial.',
  },
  {
    title: 'Atividades',
    route: '/tarefas',
    audience: 'Vendedores',
    icon: <CheckSquare size={22} />,
    summary: 'Lista de tarefas comerciais, pendências e ações acompanhadas por status.',
    objective: 'Controlar pendências comerciais que não podem depender de memória: retornos, cotações, cobranças de resposta, propostas e follow-ups.',
    whenToUse: [
      'Depois de uma visita que gerou próxima ação.',
      'Quando o cliente pediu retorno, cotação, condição ou confirmação.',
      'No início e no fim do dia, para revisar pendências abertas.',
    ],
    steps: [
      'Crie uma tarefa com título claro, prazo e prioridade.',
      'Relacione a tarefa ao cliente ou assunto sempre que possível.',
      'Use filtros para acompanhar pendentes, atrasadas e concluídas.',
      'Atualize o status assim que executar a ação combinada.',
      'Quando a tarefa gerar nova pendência, crie outro acompanhamento com novo prazo.',
    ],
    bestPractices: [
      'Tarefa sem prazo tende a virar esquecimento: sempre defina uma data de execução.',
      'Use títulos objetivos, como “Retornar cotação do Cliente X”, em vez de “Ver cliente”.',
      'Finalize o que foi concluído para manter os contadores e prioridades confiáveis.',
    ],
    expectedResult: 'Nenhum retorno importante fica perdido, e o vendedor ganha previsibilidade sobre o que precisa executar.',
  },
  {
    title: 'Mix Builder',
    route: '/simulacao',
    audience: 'Vendedores',
    icon: <Target size={22} />,
    summary: 'Simulação de mix comercial para montar propostas e combinações de produtos.',
    objective: 'Apoiar a construção de propostas mais completas, aumentando mix, valor por pedido e aderência ao perfil do cliente.',
    whenToUse: [
      'Antes de negociar com cliente estratégico ou com potencial de expansão.',
      'Quando Analytics ou Alertas indicarem oportunidade de vender categorias adicionais.',
      'Durante planejamento de visita, para preparar sugestão de compra mais consultiva.',
    ],
    steps: [
      'Selecione ou monte o conjunto de produtos que deseja simular.',
      'Informe quantidades ou cenários esperados para avaliar potencial da proposta.',
      'Compare alternativas de mix e identifique a composição mais adequada ao cliente.',
      'Use o resultado como roteiro de conversa durante a negociação.',
      'Depois da visita, registre a ação na Agenda ou em Atividades se houver follow-up.',
    ],
    bestPractices: [
      'Não use o mix apenas para aumentar quantidade: conecte a sugestão à necessidade real do cliente.',
      'Combine produtos de giro com itens estratégicos para criar proposta equilibrada.',
      'Salve ou registre o raciocínio da proposta para continuar a negociação depois.',
    ],
    expectedResult: 'O vendedor chega mais preparado na negociação e aumenta a chance de vender um pedido mais completo.',
  },
  {
    title: 'Analytics',
    route: '/analytics',
    audience: 'Ambos',
    icon: <BarChart3 size={22} />,
    summary: 'Análise comercial detalhada de faturamento, metas, produtos, clientes, devoluções e evolução histórica.',
    objective: 'Explicar o resultado comercial do vendedor por diferentes ângulos: período, meta, produtos, clientes, devoluções, carteira e evolução.',
    whenToUse: [
      'No fechamento do dia ou da semana, para entender desempenho e desvios.',
      'Antes de reunião de acompanhamento com coordenação.',
      'Quando houver queda de faturamento, devolução relevante ou dificuldade de bater meta.',
    ],
    steps: [
      'Confira se o período selecionado está correto antes de interpretar qualquer número.',
      'Revise o overview para entender realizado, meta, projeção e principais indicadores.',
      'Analise evolução histórica para diferenciar queda pontual de tendência.',
      'Consulte rankings de produtos e clientes para encontrar concentração, perda ou oportunidade.',
      'Use análises de carteira para identificar clientes sem compra, em risco ou novos.',
      'Transforme conclusões em ações: visita, tarefa, mix, recuperação ou prospecção.',
    ],
    bestPractices: [
      'Nunca tome decisão olhando um único gráfico; confirme o diagnóstico em clientes, produtos e evolução.',
      'Ao encontrar queda, procure causa: menos clientes comprando, menor ticket, devolução, mix fraco ou sazonalidade.',
      'Use Analytics como ferramenta de decisão semanal, não apenas como relatório de fechamento.',
    ],
    expectedResult: 'O vendedor entende o porquê do resultado e sai com ações concretas para melhorar performance.',
  },
  {
    title: 'Alertas e Prospecção',
    route: '/alertas',
    audience: 'Ambos',
    icon: <LineChart size={22} />,
    summary: 'Central de alertas inteligentes, oportunidades de prospecção e sinais de risco na carteira.',
    objective: 'Direcionar a atenção do vendedor para clientes e oportunidades que exigem ação antes que o problema cresça ou a oportunidade esfrie.',
    whenToUse: [
      'Todos os dias, após revisar o Dashboard.',
      'Antes de montar roteiro de visitas da semana.',
      'Quando precisar buscar oportunidades de prospecção ou recuperação da carteira.',
    ],
    steps: [
      'Abra os alertas não lidos e identifique o motivo do aviso.',
      'Classifique mentalmente a ação necessária: contato, visita, tarefa, análise ou proposta.',
      'Use a aba de prospecção para localizar oportunidades com maior potencial de conversão.',
      'Depois de agir, registre o atendimento na Agenda ou crie uma tarefa de continuidade.',
      'Acompanhe os alertas tratados para evitar repetição de contato ou perda de contexto.',
    ],
    bestPractices: [
      'Não ignore alerta recorrente: se aparece com frequência, investigue a causa em Clientes ou Analytics.',
      'Priorize alertas que combinam risco alto com cliente relevante para a carteira.',
      'Transforme cada alerta importante em registro prático, não apenas em leitura.',
    ],
    expectedResult: 'O vendedor atua antes de perder vendas, recupera clientes em risco e encontra oportunidades com mais velocidade.',
  },
];

function AudienceBadge({ audience }: { audience: HelpScreen['audience'] }) {
  const palette = audience === 'Vendedores'
    ? { bg: '#e6f4ea', color: '#137432' }
    : { bg: '#eef1eb', color: '#4e574c' };

  return (
    <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: palette.bg, color: palette.color }}>
      {audience}
    </span>
  );
}

function HelpCard({ screen, defaultOpen = false }: { screen: HelpScreen; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <article className="overflow-hidden rounded-[28px] border shadow-sm transition-all" style={{ backgroundColor: '#ffffff', borderColor: open ? '#b8d6b2' : '#dde2d8' }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-start gap-4 p-5 text-left transition-all sm:p-6"
        style={{ backgroundColor: open ? '#fafbf8' : '#ffffff' }}
        aria-expanded={open}
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: '#e6f4ea', color: '#137432' }}>
          {screen.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-display text-2xl font-extrabold" style={{ color: '#1b1c1a' }}>{screen.title}</h3>
              <p className="mt-1 text-sm font-semibold" style={{ color: '#137432' }}>{screen.route}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <AudienceBadge audience={screen.audience} />
              <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: '#eef1eb', color: '#4e574c' }}>
                {open ? 'Recolher' : 'Expandir'}
                <ChevronDown size={15} className="transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
              </span>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6" style={{ color: '#5f685c' }}>{screen.summary}</p>
        </div>
      </button>

      {open ? (
        <div className="border-t px-5 pb-5 sm:px-6 sm:pb-6" style={{ borderColor: '#e2e6de' }}>
          <div className="mt-5 rounded-2xl border p-4" style={{ backgroundColor: '#fafbf8', borderColor: '#e2e6de' }}>
            <p className="text-sm font-bold" style={{ color: '#137432' }}>Objetivo da tela</p>
            <p className="mt-2 text-sm leading-6" style={{ color: '#3f473d' }}>{screen.objective}</p>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <ManualBlock title="Quando usar" items={screen.whenToUse} />
            <ManualBlock title="Boas práticas" items={screen.bestPractices} />
          </div>
          <ManualSteps items={screen.steps} />
          <div className="mt-5 rounded-2xl px-4 py-3" style={{ backgroundColor: '#e6f4ea', color: '#1f3a17' }}>
            <p className="text-sm font-bold">Resultado esperado</p>
            <p className="mt-1 text-sm leading-6">{screen.expectedResult}</p>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function ManualBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border p-4" style={{ borderColor: '#dde2d8', backgroundColor: '#ffffff' }}>
      <p className="text-sm font-bold" style={{ color: '#1b1c1a' }}>{title}</p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-6" style={{ color: '#3f473d' }}>
            <CheckCircle2 className="mt-1 shrink-0" size={15} style={{ color: '#137432' }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ManualSteps({ items }: { items: string[] }) {
  return (
    <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: '#dde2d8', backgroundColor: '#ffffff' }}>
      <p className="text-sm font-bold" style={{ color: '#1b1c1a' }}>Passo a passo recomendado</p>
      <div className="mt-4 space-y-3">
        {items.map((item, index) => (
          <div key={item} className="flex gap-3 text-sm leading-6" style={{ color: '#3f473d' }}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ backgroundColor: '#e6f4ea', color: '#137432' }}>{index + 1}</span>
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HelpSection({ title, subtitle, screens }: { title: string; subtitle: string; screens: HelpScreen[] }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>{title}</h2>
        <p className="mt-1 text-sm" style={{ color: '#6b7369' }}>{subtitle}</p>
      </div>
      <div className="space-y-4">
        {screens.map((screen, index) => <HelpCard key={screen.route} screen={screen} defaultOpen={index === 0} />)}
      </div>
    </section>
  );
}

export default function AjudaPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-[28px] border p-6 shadow-sm" style={{ backgroundColor: '#fafbf8', borderColor: '#dde2d8' }}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em]" style={{ color: '#8c9489' }}>Central de ajuda</p>
            <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl" style={{ color: '#137432' }}>Manual do vendedor</h1>
            <p className="mt-3 max-w-3xl text-base leading-7" style={{ color: '#5f685c' }}>
              Guia prático para executar a rotina comercial: consultar carteira, planejar visitas, acompanhar pendências, analisar resultados e transformar dados em ação.
            </p>
          </div>
          <div className="rounded-3xl px-5 py-4" style={{ backgroundColor: '#e6f4ea', color: '#1f3a17' }}>
            <div className="flex items-center gap-3 font-bold"><Search size={20} /> Dica rápida</div>
            <p className="mt-2 max-w-md text-sm leading-6">Comece pelo Dashboard, aprofunde em Clientes ou Analytics e registre ações em Agenda ou Atividades.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-[28px] border p-6 shadow-sm" style={{ backgroundColor: '#ffffff', borderColor: '#dde2d8' }}>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: '#e6f4ea', color: '#137432' }}>
              <Compass size={22} />
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.14em]" style={{ color: '#8c9489' }}>Fluxo diário recomendado</p>
              <h2 className="font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Como conduzir o dia</h2>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {dailyRoutine.map((item, index) => (
              <div key={item} className="flex gap-3 rounded-2xl border p-4" style={{ borderColor: '#e2e6de', backgroundColor: '#fafbf8' }}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold" style={{ backgroundColor: '#137432', color: '#ffffff' }}>{index + 1}</span>
                <p className="text-sm leading-6" style={{ color: '#3f473d' }}>{item}</p>
              </div>
            ))}
          </div>
        </div>

        <aside className="rounded-[28px] border p-6 shadow-sm" style={{ backgroundColor: '#fffdf6', borderColor: '#f0d99b' }}>
          <p className="text-sm font-bold uppercase tracking-[0.14em]" style={{ color: '#936300' }}>Regras de ouro</p>
          <h2 className="mt-2 font-display text-3xl font-extrabold" style={{ color: '#1b1c1a' }}>Antes de finalizar o dia</h2>
          <ul className="mt-5 space-y-3">
            {quickRules.map((item) => (
              <li key={item} className="flex gap-2 text-sm leading-6" style={{ color: '#4e3b10' }}>
                <CheckCircle2 className="mt-1 shrink-0" size={16} style={{ color: '#936300' }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[24px] border p-5" style={{ backgroundColor: '#ffffff', borderColor: '#dde2d8' }}>
          <p className="text-sm font-bold uppercase tracking-[0.14em]" style={{ color: '#8c9489' }}>Vendedores</p>
          <p className="mt-2 text-3xl font-extrabold" style={{ color: '#137432' }}>7 telas</p>
          <p className="mt-2 text-sm" style={{ color: '#5f685c' }}>Foco em carteira, visitas, tarefas, alertas e performance individual.</p>
        </div>
        <div className="rounded-[24px] border p-5" style={{ backgroundColor: '#ffffff', borderColor: '#dde2d8' }}>
          <p className="text-sm font-bold uppercase tracking-[0.14em]" style={{ color: '#8c9489' }}>Uso diário</p>
          <p className="mt-2 text-3xl font-extrabold" style={{ color: '#137432' }}>3 passos</p>
          <p className="mt-2 text-sm" style={{ color: '#5f685c' }}>Comece no Dashboard, aprofunde em Clientes e registre ações em Agenda ou Atividades.</p>
        </div>
        <div className="rounded-[24px] border p-5" style={{ backgroundColor: '#ffffff', borderColor: '#dde2d8' }}>
          <p className="text-sm font-bold uppercase tracking-[0.14em]" style={{ color: '#8c9489' }}>Prioridade</p>
          <p className="mt-2 text-3xl font-extrabold" style={{ color: '#137432' }}>Ação</p>
          <p className="mt-2 text-sm" style={{ color: '#5f685c' }}>Transforme alertas, análises e oportunidades em visitas, tarefas e acompanhamentos.</p>
        </div>
      </div>

      <HelpSection title="Manual por tela" subtitle="Consulte o objetivo, o momento certo de uso, o passo a passo e o resultado esperado de cada área da rotina do vendedor." screens={sellerScreens} />
    </div>
  );
}
