import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Users } from 'lucide-react';
import { callSF, callSFSingle, SF } from '../hooks/useMitra';

export type CoordinatorScopeMode = 'ME' | 'TEAM' | 'SELLER' | 'GLOBAL';

export interface CoordinatorScopeParams {
  scopeMode: CoordinatorScopeMode;
  scopeUserId: string;
  scopeCodRca: string;
  scopeCodSupervisor: string;
  scopeCodFilial: string;
  scopeCodepto: string;
  scopeIdSecao: string;
}

interface VendedorScopeOption {
  USER_ID: number;
  COD_RCA: number;
  RCA: string;
  CODFILIAL?: string | number;
  CODEPTO?: string | number;
  DEPARTAMENTO?: string;
  COD_SUPERVISOR?: string | number;
  COORDENADOR?: string;
  ID_SECAO?: string | number;
  SECAO?: string;
  IS_OWN_SCOPE?: number | boolean;
  IS_COORDENADOR?: number | boolean;
}

interface ScopeSelectOption {
  value: string;
  label: string;
}

interface UseCoordinatorScopeResult {
  canUseScope: boolean;
  isCoordinatorScope: boolean;
  isDirectorScope: boolean;
  isSellerScope: boolean;
  loadingScope: boolean;
  vendedoresScope: VendedorScopeOption[];
  vendedoresFiltradosScope: VendedorScopeOption[];
  scopeMode: CoordinatorScopeMode;
  coordenadorSelecionado: string;
  vendedorSelecionado: string;
  filialSelecionada: string;
  departamentoSelecionado: string;
  secaoSelecionada: string;
  setScopeMode: (mode: CoordinatorScopeMode) => void;
  setCoordenadorSelecionado: (value: string) => void;
  setVendedorSelecionado: (value: string) => void;
  setFilialSelecionada: (value: string) => void;
  setDepartamentoSelecionado: (value: string) => void;
  setSecaoSelecionada: (value: string) => void;
  scopeParams: CoordinatorScopeParams;
  selectedLabel: string;
  coordenadorOptions: ScopeSelectOption[];
  filialOptions: ScopeSelectOption[];
  departamentoOptions: ScopeSelectOption[];
  secaoOptions: ScopeSelectOption[];
}

function storageKey(screenKey: string) {
  return `coordinator-scope:${screenKey}`;
}

function normalizeCodRca(value: string | number | undefined) {
  const raw = String(value || '').trim();
  return raw.replace(/^0+(?=\d)/, '');
}

function vendedorLabel(vendedor: Pick<VendedorScopeOption, 'COD_RCA' | 'RCA'>) {
  return String(vendedor.RCA || '').trim() || `Vendedor ${vendedor.COD_RCA}`;
}

export function useCoordinatorScope(screenKey: string): UseCoordinatorScopeResult {
  const [loadingScope, setLoadingScope] = useState(true);
  const [canUseScope, setCanUseScope] = useState(false);
  const [isCoordinatorScope, setIsCoordinatorScope] = useState(false);
  const [isDirectorScope, setIsDirectorScope] = useState(false);
  const [vendedoresScope, setVendedoresScope] = useState<VendedorScopeOption[]>([]);
  const [escoposScope, setEscoposScope] = useState<VendedorScopeOption[]>([]);
  const [scopeMode, setScopeModeState] = useState<CoordinatorScopeMode>('ME');
  const [coordenadorSelecionado, setCoordenadorSelecionadoState] = useState('');
  const [vendedorSelecionado, setVendedorSelecionadoState] = useState('');
  const [filialSelecionada, setFilialSelecionadaState] = useState('');
  const [departamentoSelecionado, setDepartamentoSelecionadoState] = useState('');
  const [secaoSelecionada, setSecaoSelecionadaState] = useState('');

  useEffect(() => {
    let active = true;

    async function carregar() {
      setLoadingScope(true);
      const [permissaoResp, diretoriaResp, vendedoresResp] = await Promise.allSettled([
        callSFSingle(SF.painelCoordenadorPermissao),
        callSFSingle(SF.gestaoMetasDiretoriaPermissao),
        callSF(SF.gestaoCarteiraCoordenadorVendedores),
      ]);

      if (!active) return;
      const permissao = permissaoResp.status === 'fulfilled' ? permissaoResp.value : null;
      const diretoriaPermissao = diretoriaResp.status === 'fulfilled' ? diretoriaResp.value : null;
      const cargoAtual = String(permissao?.CARGO_ATUAL || '').toUpperCase();
      const temCadastroCoordenador = Boolean(permissao?.COD_SUPERVISOR);
      const podeVerDiretoria = Number(diretoriaPermissao?.PODE_ACESSAR || 0) === 1;
      const permitido = Number(permissao?.PODE_ACESSAR || 0) === 1
        && (temCadastroCoordenador || cargoAtual.includes('COORDENADOR') || cargoAtual.includes('CORDENADOR'));
      const vendedores = vendedoresResp.status === 'fulfilled' ? (vendedoresResp.value as VendedorScopeOption[]) : [];
      const escoposProprios = vendedores.filter((vendedor) => Number(vendedor.IS_OWN_SCOPE || 0) === 1);
      const sellerComEscopoMultiplo = !permitido && escoposProprios.length > 1;
      const escoposDisponiveis = podeVerDiretoria || permitido ? vendedores : escoposProprios;
      const vendedoresUnicos = Array.from(
        escoposDisponiveis.reduce((map, vendedor) => {
          const key = normalizeCodRca(vendedor.COD_RCA);
          if (key && !map.has(key)) map.set(key, { ...vendedor, COD_RCA: Number(key) });
          return map;
        }, new Map<string, VendedorScopeOption>()).values(),
      );

      setCanUseScope(podeVerDiretoria || permitido || sellerComEscopoMultiplo);
      setIsCoordinatorScope(permitido);
      setIsDirectorScope(podeVerDiretoria);
      setVendedoresScope(vendedoresUnicos);
      setEscoposScope(escoposDisponiveis);
      setScopeModeState(podeVerDiretoria ? 'GLOBAL' : permitido ? 'TEAM' : 'ME');
      setCoordenadorSelecionadoState('');
      setVendedorSelecionadoState('');
      setFilialSelecionadaState('');
      setDepartamentoSelecionadoState('');
      setSecaoSelecionadaState('');
      setLoadingScope(false);
    }

    carregar();
    return () => { active = false; };
  }, [screenKey]);

  const vendedorAtual = useMemo(() => {
    return vendedoresScope.find((item) => String(item.COD_RCA) === vendedorSelecionado) || null;
  }, [vendedorSelecionado, vendedoresScope]);

  const coordenadorOptions = useMemo<ScopeSelectOption[]>(() => {
    const map = new Map<string, ScopeSelectOption>();
    escoposScope.forEach((item) => {
      const value = String(item.COD_SUPERVISOR || '').trim();
      if (!value || map.has(value)) return;
      map.set(value, { value, label: String(item.COORDENADOR || '').trim() || `Coordenador ${value}` });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [escoposScope]);

  const escoposFiltrados = useMemo(() => {
    const byCoordinator = coordenadorSelecionado
      ? escoposScope.filter((item) => String(item.COD_SUPERVISOR || '').trim() === coordenadorSelecionado)
      : escoposScope;
    if (scopeMode !== 'SELLER' || !vendedorAtual) return byCoordinator;
    const codRca = normalizeCodRca(vendedorAtual.COD_RCA);
    return byCoordinator.filter((item) => normalizeCodRca(item.COD_RCA) === codRca);
  }, [coordenadorSelecionado, escoposScope, scopeMode, vendedorAtual]);

  const isSellerScope = canUseScope && !isCoordinatorScope && !isDirectorScope;

  const filialOptions = useMemo<ScopeSelectOption[]>(() => {
    const map = new Map<string, ScopeSelectOption>();
    escoposFiltrados.forEach((item) => {
      const value = String(item.CODFILIAL || '').trim();
      if (!value || map.has(value)) return;
      map.set(value, { value, label: `Filial ${value}` });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [escoposFiltrados]);

  const departamentoOptions = useMemo<ScopeSelectOption[]>(() => {
    const map = new Map<string, ScopeSelectOption>();
    escoposFiltrados
      .filter((item) => !filialSelecionada || String(item.CODFILIAL || '').trim() === filialSelecionada)
      .forEach((item) => {
        const value = String(item.CODEPTO || '').trim();
        if (!value || map.has(value)) return;
        map.set(value, { value, label: `Depto ${value}${item.DEPARTAMENTO ? ` · ${item.DEPARTAMENTO}` : ''}` });
      });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [escoposFiltrados, filialSelecionada]);

  const secaoOptions = useMemo<ScopeSelectOption[]>(() => {
    const map = new Map<string, ScopeSelectOption>();
    escoposFiltrados
      .filter((item) => !filialSelecionada || String(item.CODFILIAL || '').trim() === filialSelecionada)
      .filter((item) => !departamentoSelecionado || String(item.CODEPTO || '').trim() === departamentoSelecionado)
      .forEach((item) => {
        const value = String(item.ID_SECAO || '').trim();
        if (!value || map.has(value)) return;
        map.set(value, { value, label: `${value} · ${item.SECAO || 'Seção'}` });
      });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [departamentoSelecionado, escoposFiltrados, filialSelecionada]);

  const vendedoresFiltradosScope = useMemo(() => {
    const filtrados = escoposFiltrados
      .filter((item) => !filialSelecionada || String(item.CODFILIAL || '').trim() === filialSelecionada)
      .filter((item) => !departamentoSelecionado || String(item.CODEPTO || '').trim() === departamentoSelecionado)
      .filter((item) => !secaoSelecionada || String(item.ID_SECAO || '').trim() === secaoSelecionada);

    return Array.from(
      filtrados.reduce((map, vendedor) => {
        const key = normalizeCodRca(vendedor.COD_RCA);
        if (key && !map.has(key)) map.set(key, { ...vendedor, COD_RCA: Number(key) });
        return map;
      }, new Map<string, VendedorScopeOption>()).values(),
    );
  }, [departamentoSelecionado, escoposFiltrados, filialSelecionada, secaoSelecionada]);

  const scopeParams = useMemo<CoordinatorScopeParams>(() => {
    const dimensionParams = {
      scopeCodSupervisor: coordenadorSelecionado,
      scopeCodFilial: filialSelecionada,
      scopeCodepto: departamentoSelecionado,
      scopeIdSecao: secaoSelecionada,
    };
    if (!canUseScope) return { scopeMode: 'ME', scopeUserId: '', scopeCodRca: '', ...dimensionParams };
    if (scopeMode === 'SELLER' && vendedorAtual) {
      return {
        scopeMode: 'SELLER',
        scopeUserId: String(vendedorAtual.USER_ID || ''),
        scopeCodRca: String(vendedorAtual.COD_RCA || ''),
        ...dimensionParams,
      };
    }
    return { scopeMode, scopeUserId: '', scopeCodRca: '', ...dimensionParams };
  }, [canUseScope, coordenadorSelecionado, departamentoSelecionado, filialSelecionada, scopeMode, secaoSelecionada, vendedorAtual]);

  useEffect(() => {
    if (!canUseScope) return;
    window.localStorage.setItem(storageKey(screenKey), JSON.stringify(scopeParams));
  }, [canUseScope, scopeParams, screenKey]);

  const selectedLabel = useMemo(() => {
    if (!canUseScope) return 'Meu painel';
    if (isSellerScope) return 'Meu escopo';
    if (scopeMode === 'GLOBAL') {
      const coordenador = coordenadorOptions.find((option) => option.value === coordenadorSelecionado)?.label;
      return coordenador ? `Coordenador: ${coordenador}` : 'Todos os coordenadores';
    }
    if (scopeMode === 'ME') return 'Meu painel';
    if (scopeMode === 'TEAM') return 'Time inteiro';
    return vendedorAtual ? vendedorLabel(vendedorAtual) : 'Vendedor específico';
  }, [canUseScope, coordenadorOptions, coordenadorSelecionado, isSellerScope, scopeMode, vendedorAtual]);

  function setScopeMode(mode: CoordinatorScopeMode) {
    setScopeModeState(mode);
    if (mode !== 'SELLER') setVendedorSelecionadoState('');
  }

  function setCoordenadorSelecionado(value: string) {
    setCoordenadorSelecionadoState(value);
    setVendedorSelecionadoState('');
    setFilialSelecionadaState('');
    setDepartamentoSelecionadoState('');
    setSecaoSelecionadaState('');
    if (isDirectorScope) setScopeModeState('GLOBAL');
  }

  function setVendedorSelecionado(value: string) {
    setVendedorSelecionadoState(value);
    setScopeModeState(value ? 'SELLER' : 'TEAM');
    setFilialSelecionadaState('');
    setDepartamentoSelecionadoState('');
    setSecaoSelecionadaState('');
  }

  function setFilialSelecionada(value: string) {
    setFilialSelecionadaState(value);
    setDepartamentoSelecionadoState('');
    setSecaoSelecionadaState('');
  }

  function setDepartamentoSelecionado(value: string) {
    setDepartamentoSelecionadoState(value);
    setSecaoSelecionadaState('');
  }

  return {
    canUseScope,
    isCoordinatorScope,
    isDirectorScope,
    isSellerScope,
    loadingScope,
    vendedoresScope,
    vendedoresFiltradosScope,
    scopeMode,
    coordenadorSelecionado,
    vendedorSelecionado,
    filialSelecionada,
    departamentoSelecionado,
    secaoSelecionada,
    setScopeMode,
    setCoordenadorSelecionado,
    setVendedorSelecionado,
    setFilialSelecionada,
    setDepartamentoSelecionado,
    setSecaoSelecionada: setSecaoSelecionadaState,
    scopeParams,
    selectedLabel,
    coordenadorOptions,
    filialOptions,
    departamentoOptions,
    secaoOptions,
  };
}

function ScopeDropdown({
  label,
  placeholder,
  value,
  options,
  open,
  setOpen,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  options: ScopeSelectOption[];
  open: boolean;
  setOpen: (open: boolean) => void;
  onChange: (value: string) => void;
}) {
  const selected = options.find((option) => option.value === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={options.length === 0}
        className="h-10 min-w-[150px] pl-4 pr-9 rounded-2xl text-sm font-bold text-left outline-none disabled:opacity-60"
        style={{ backgroundColor: value ? '#137432' : '#eef2eb', color: value ? '#ffffff' : '#425242', border: '1px solid #d7dfd3' }}
        title={label}
      >
        {selected?.label || placeholder}
      </button>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" size={15} style={{ color: value ? '#ffffff' : '#425242' }} />
      {open ? (
        <div className="absolute right-0 z-40 mt-2 max-h-[280px] w-[300px] overflow-auto rounded-2xl p-2 animate-scaleIn" style={{ backgroundColor: '#ffffff', border: '1px solid #dde5d8', boxShadow: '0 14px 30px rgba(23,40,30,0.14)' }}>
          <button
            type="button"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
            className="w-full rounded-xl px-3 py-2 text-left text-sm"
            style={{ backgroundColor: value === '' ? '#dfeadf' : 'transparent', color: value === '' ? '#1f6f39' : '#4e5a4e', fontWeight: value === '' ? 700 : 500 }}
          >
            Todos
          </button>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className="w-full rounded-xl px-3 py-2 text-left text-sm"
              style={{ backgroundColor: value === option.value ? '#dfeadf' : 'transparent', color: value === option.value ? '#1f6f39' : '#4e5a4e', fontWeight: value === option.value ? 700 : 500 }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CoordinatorScopeFilter({ scope }: { scope: UseCoordinatorScopeResult }) {
  const [coordenadorOpen, setCoordenadorOpen] = useState(false);
  const [sellerOpen, setSellerOpen] = useState(false);
  const [filialOpen, setFilialOpen] = useState(false);
  const [departamentoOpen, setDepartamentoOpen] = useState(false);
  const [secaoOpen, setSecaoOpen] = useState(false);

  if (!scope.canUseScope) return null;

  const vendedorOptions = scope.vendedoresScope.map((vendedor) => ({
    value: String(vendedor.COD_RCA),
    label: vendedorLabel(vendedor),
  }));

  return (
    <div className="rounded-3xl p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" style={{ backgroundColor: '#f8faf6', border: '1px solid #dfe6da' }}>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#dfeadf', color: '#137432' }}>
          <Users size={18} />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: '#7d8879' }}>{scope.isSellerScope ? 'Escopo do vendedor' : scope.isDirectorScope ? 'Escopo da diretoria' : 'Escopo do coordenador'}</p>
          <p className="text-sm font-semibold" style={{ color: '#2f3a2d' }}>{scope.selectedLabel}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {scope.isCoordinatorScope || scope.isDirectorScope ? (
          <>
            {scope.isDirectorScope ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    scope.setCoordenadorSelecionado('');
                    scope.setScopeMode('GLOBAL');
                  }}
                  className="h-10 px-4 rounded-2xl text-sm font-bold transition-all"
                  style={{ backgroundColor: scope.scopeMode === 'GLOBAL' && !scope.coordenadorSelecionado ? '#137432' : '#eef2eb', color: scope.scopeMode === 'GLOBAL' && !scope.coordenadorSelecionado ? '#ffffff' : '#425242' }}
                >
                  Todos os coordenadores
                </button>
                <ScopeDropdown
                  label="Coordenador"
                  placeholder="Filtrar coordenador"
                  value={scope.coordenadorSelecionado}
                  options={scope.coordenadorOptions}
                  open={coordenadorOpen}
                  setOpen={setCoordenadorOpen}
                  onChange={scope.setCoordenadorSelecionado}
                />
              </>
            ) : null}
            <button
              type="button"
              onClick={() => scope.setScopeMode('ME')}
              className="h-10 px-4 rounded-2xl text-sm font-bold transition-all"
              style={{ backgroundColor: scope.scopeMode === 'ME' ? '#137432' : '#eef2eb', color: scope.scopeMode === 'ME' ? '#ffffff' : '#425242' }}
            >
              Meu painel
            </button>
            {scope.isCoordinatorScope ? (
              <button
                type="button"
                onClick={() => scope.setScopeMode('TEAM')}
                className="h-10 px-4 rounded-2xl text-sm font-bold transition-all"
                style={{ backgroundColor: scope.scopeMode === 'TEAM' ? '#137432' : '#eef2eb', color: scope.scopeMode === 'TEAM' ? '#ffffff' : '#425242' }}
              >
                Time inteiro
              </button>
            ) : null}
            <div className="relative">
              <button
                type="button"
                onClick={() => setSellerOpen((current) => !current)}
                disabled={scope.loadingScope || vendedorOptions.length === 0}
                className="h-10 pl-4 pr-9 rounded-2xl text-sm font-bold outline-none disabled:opacity-60"
                style={{ backgroundColor: scope.scopeMode === 'SELLER' ? '#137432' : '#eef2eb', color: scope.scopeMode === 'SELLER' ? '#ffffff' : '#425242', border: '1px solid #d7dfd3' }}
              >
                {scope.scopeMode === 'SELLER' ? scope.selectedLabel : 'Vendedor específico'}
              </button>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" size={15} style={{ color: scope.scopeMode === 'SELLER' ? '#ffffff' : '#425242' }} />
              {sellerOpen ? (
                <div className="absolute right-0 z-40 mt-2 max-h-[280px] w-[300px] overflow-auto rounded-2xl p-2 animate-scaleIn" style={{ backgroundColor: '#ffffff', border: '1px solid #dde5d8', boxShadow: '0 14px 30px rgba(23,40,30,0.14)' }}>
                  {vendedorOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        scope.setVendedorSelecionado(option.value);
                        setSellerOpen(false);
                      }}
                      className="w-full rounded-xl px-3 py-2 text-left text-sm"
                      style={{
                        backgroundColor: scope.vendedorSelecionado === option.value ? '#dfeadf' : 'transparent',
                        color: scope.vendedorSelecionado === option.value ? '#1f6f39' : '#4e5a4e',
                        fontWeight: scope.vendedorSelecionado === option.value ? 700 : 500,
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
        <ScopeDropdown
          label="Filial"
          placeholder="Todas as filiais"
          value={scope.filialSelecionada}
          options={scope.filialOptions}
          open={filialOpen}
          setOpen={setFilialOpen}
          onChange={scope.setFilialSelecionada}
        />
        <ScopeDropdown
          label="Departamento"
          placeholder="Todos os departamentos"
          value={scope.departamentoSelecionado}
          options={scope.departamentoOptions}
          open={departamentoOpen}
          setOpen={setDepartamentoOpen}
          onChange={scope.setDepartamentoSelecionado}
        />
        <ScopeDropdown
          label="Seção"
          placeholder="Todas as seções"
          value={scope.secaoSelecionada}
          options={scope.secaoOptions}
          open={secaoOpen}
          setOpen={setSecaoOpen}
          onChange={scope.setSecaoSelecionada}
        />
      </div>
    </div>
  );
}
