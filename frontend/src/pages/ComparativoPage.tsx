import { useState } from 'react';
import { CoordinatorScopeFilter, useCoordinatorScope } from '../components/CoordinatorScopeFilter';
import ComparativoMensal from '../components/ComparativoMensal';
import AcompanhamentoSemanalVendedorPage from './AcompanhamentoSemanalVendedorPage';

type Visao = 'semanal' | 'mensal';

const VISOES: { value: Visao; label: string }[] = [
  { value: 'semanal', label: 'Semanal' },
  { value: 'mensal', label: 'Mensal' },
];

export default function ComparativoPage() {
  const coordinatorScope = useCoordinatorScope('comparativo');
  const [visao, setVisao] = useState<Visao>('semanal');

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-extrabold" style={{ color: 'var(--color-text)' }}>Comparativo</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            {visao === 'semanal'
              ? 'A semana selecionada contra a mesma semana do mês anterior.'
              : 'Cliente a cliente: os dois meses anteriores, o mês atual e a variação.'}
          </p>
        </div>
        <div className="inline-flex rounded-2xl p-1" style={{ backgroundColor: 'var(--color-surface-container)' }}>
          {VISOES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setVisao(item.value)}
              className="px-5 h-10 rounded-xl text-sm font-bold"
              style={visao === item.value
                ? { backgroundColor: 'var(--color-primary)', color: 'var(--color-on-primary)' }
                : { color: 'var(--color-text-secondary)' }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <CoordinatorScopeFilter scope={coordinatorScope} />
      {visao === 'semanal' ? (
        <AcompanhamentoSemanalVendedorPage
          scopeParams={coordinatorScope.scopeParams}
          scopeLabel={coordinatorScope.selectedLabel}
        />
      ) : (
        <ComparativoMensal scopeParams={coordinatorScope.scopeParams} scopeLabel={coordinatorScope.selectedLabel} />
      )}
    </div>
  );
}
