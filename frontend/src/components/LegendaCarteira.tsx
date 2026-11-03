import { useState } from 'react';
import { BarChart3, Bell, Info, Thermometer, TrendingDown, X } from 'lucide-react';

const temperaturaRows = [
  { fator: 'Recência', peso: '30 pts', regra: 'Última compra há menos de 30 dias = 30 pts; menos de 60 dias = 20 pts; menos de 90 dias = 10 pts; mais antigo = 0 pts', bg: '#eaf7ed' },
  { fator: 'Frequência', peso: '25 pts', regra: 'Compra dentro de 1,1x do ciclo médio = 25 pts; até 1,3x = 15 pts; até 1,6x = 5 pts; acima = 0 pts', bg: '#fff8e8' },
  { fator: 'Tendência', peso: '25 pts', regra: 'Volume cresceu mais de 10% nos últimos 2 meses = 25 pts; estável = 15 pts; queda leve = 5 pts; queda forte = 0 pts', bg: '#eef3ff' },
  { fator: 'Visitas', peso: '20 pts', regra: 'Visita há menos de 30 dias = 20 pts; menos de 60 dias = 12 pts; menos de 90 dias = 5 pts; sem visita = 0 pts', bg: '#f1f4ef' },
];

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="border-b pb-5" style={{ borderColor: '#e3e9de' }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#e7f3ea', color: '#137432' }}>
          {icon}
        </div>
        <h3 className="text-lg font-bold" style={{ color: '#1b1c1a' }}>{title}</h3>
      </div>
      {children}
    </section>
  );
}

export default function LegendaCarteira() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed z-30 right-6 top-24 h-10 px-4 rounded-full text-sm font-semibold inline-flex items-center gap-2 shadow-md"
        style={{ backgroundColor: '#ffffff', color: '#137432', border: '1px solid #dfe6da' }}
      >
        <Info size={16} />
        Legenda
      </button>

      {open ? (
        <div className="fixed inset-0 z-[80]" aria-modal="true" role="dialog">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            style={{ backgroundColor: 'rgba(27, 28, 26, 0.28)' }}
            onClick={() => setOpen(false)}
            aria-label="Fechar legenda"
          />
          <aside
            className="absolute right-0 top-0 h-full w-full max-w-[420px] shadow-2xl transition-transform duration-300 overflow-y-auto"
            style={{ backgroundColor: '#ffffff', color: '#1b1c1a' }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4" style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e3e9de' }}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: '#7b8379' }}>Carteira do vendedor</p>
                <h2 className="text-2xl font-extrabold" style={{ color: '#1b1c1a' }}>Legenda dos indicadores</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-9 h-9 rounded-xl inline-flex items-center justify-center"
                style={{ backgroundColor: '#edf1ea', color: '#5f6a5d' }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <Section icon={<Thermometer size={18} />} title="Temperatura do Cliente">
                <p className="text-sm mb-3" style={{ color: '#5f6a5d' }}>
                  Indica engajamento e potencial de compra. O score total soma quatro fatores e vai de 0 a 100 pontos.
                </p>
                <div className="overflow-hidden rounded-2xl" style={{ border: '1px solid #e3e9de' }}>
                  <div className="grid grid-cols-12 text-xs font-bold px-3 py-2" style={{ backgroundColor: '#f1f5ef', color: '#53604f' }}>
                    <div className="col-span-3">Fator</div>
                    <div className="col-span-2">Peso</div>
                    <div className="col-span-7">Como funciona</div>
                  </div>
                  {temperaturaRows.map((row) => (
                    <div key={row.fator} className="grid grid-cols-12 gap-2 px-3 py-3 text-xs" style={{ backgroundColor: row.bg, borderTop: '1px solid #e3e9de' }}>
                      <div className="col-span-3 font-bold" style={{ color: '#1b1c1a' }}>{row.fator}</div>
                      <div className="col-span-2 font-semibold" style={{ color: '#137432' }}>{row.peso}</div>
                      <div className="col-span-7" style={{ color: '#52604f' }}>{row.regra}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <p><strong style={{ color: '#1f7d3f' }}>Quente:</strong> 70 pts ou mais. Cliente ativo, alta probabilidade de compra.</p>
                  <p><strong style={{ color: '#a26a00' }}>Morno:</strong> 40 a 69 pts. Cliente em risco, requer atenção.</p>
                  <p><strong style={{ color: '#285cc4' }}>Frio:</strong> menos de 40 pts. Cliente inativo ou distante.</p>
                </div>
              </Section>

              <Section icon={<TrendingDown size={18} />} title="Alerta de Queda de Volume">
                <div className="space-y-2 text-sm" style={{ color: '#52604f' }}>
                  <p>Disparado quando o cliente reduz o volume de compras além do limite configurado.</p>
                  <p>Compara o período atual com o período anterior, por semana ou mês.</p>
                  <p><strong>Fórmula:</strong> queda (%) = (valor anterior - valor atual) / valor anterior x 100.</p>
                  <p>Só gera alerta se o período anterior teve compras e a queda atingiu o limite definido.</p>
                  <p>Limite padrão: <strong>30%</strong>, ajustável nas configurações de alerta.</p>
                </div>
              </Section>

              <Section icon={<Bell size={18} />} title="Alertas Inteligentes">
                <p className="text-sm mb-3" style={{ color: '#52604f' }}>O sino no card do cliente indica pelo menos um alerta ativo não lido.</p>
                <div className="space-y-2 text-sm" style={{ color: '#52604f' }}>
                  <p><strong>Produto Perdido:</strong> parou de comprar um produto que comprava regularmente.</p>
                  <p><strong>Sazonalidade:</strong> época do ano em que costuma comprar, mas ainda não fez pedido.</p>
                  <p><strong>Reposição Prevista:</strong> data estimada de próxima compra se aproximando.</p>
                  <p><strong>Volume Crescente:</strong> cliente em expansão, bom momento para ampliar mix.</p>
                  <p><strong>Produto Não Explorado:</strong> produto popular no segmento que este cliente nunca comprou.</p>
                  <p><strong>Pedido Incompleto:</strong> último pedido abaixo da média histórica.</p>
                </div>
              </Section>

              <Section icon={<BarChart3 size={18} />} title="Mix de Produtos">
                <p className="text-sm" style={{ color: '#52604f' }}>
                  Indica a diversidade de categorias compradas. Quanto mais categorias ativas, menor o risco de perda total do cliente.
                </p>
              </Section>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
