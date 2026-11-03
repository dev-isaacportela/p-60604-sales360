import { configureSdkMitra } from 'mitra-interactions-sdk';

const STORE_KEY = 'mitra-session';
const PROJECT_ID = Number(import.meta.env.VITE_MITRA_PROJECT_ID);
const AUTH_URL = import.meta.env.VITE_MITRA_AUTH_URL;

interface MitraSession {
  baseURL: string;
  token: string;
  integrationURL?: string;
}

// ── Store ──

function loadSession(): MitraSession | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.baseURL && parsed?.token) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function saveSession(session: MitraSession): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(STORE_KEY);
}

// O SDK avisa o tracker da plataforma sobre token e backURL ao configurar.
// Versoes do tracker que nao expoem setBackUrl fazem o configureSdkMitra lancar
// TypeError, derrubando o app inteiro em tela branca antes do primeiro render.
function ensureTrackerCompat(): void {
  const tracker = (window as unknown as { __cbTracker?: Record<string, unknown> }).__cbTracker;
  if (!tracker) return;
  if (typeof tracker.setBackUrl !== 'function') tracker.setBackUrl = () => {};
  if (typeof tracker.setToken !== 'function') tracker.setToken = () => {};
}

function configureSdk(session: MitraSession): void {
  ensureTrackerCompat();
  configureSdkMitra({
    ...session,
    projectId: PROJECT_ID,
    authUrl: AUTH_URL,
    onTokenRefresh: (newSession: MitraSession) => saveSession(newSession),
  });
}

// ── Init ──

// Tenta configurar o SDK automaticamente.
// Retorna boolean para compatibilidade com App.tsx.
export function initMitra(): boolean {
  // Tokens vêm no fragment (#) para não vazar em logs/referrer
  const hash = window.location.hash?.slice(1) || '';
  const hashParams = new URLSearchParams(hash);
  const token = hashParams.get('tokenMitra');
  const backURL = hashParams.get('backURLMitra');

  function cleanHash() {
    window.history.replaceState({}, '', window.location.pathname + window.location.search);
  }

  // Erro retornado pelo auth — limpa URL (erro já foi exibido no sdk-auth)
  if (token === 'error') {
    cleanHash();
    return false;
  }

  // Login via redirect com sucesso
  if (token && backURL) {
    const session: MitraSession = {
      baseURL: backURL,
      token: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
      ...(hashParams.get('integrationURLMitra') ? { integrationURL: hashParams.get('integrationURLMitra')! } : {}),
    };
    saveSession(session);
    configureSdk(session);
    cleanHash();
    return true;
  }

  // Sessão anterior no localStorage
  const session = loadSession();
  if (session) {
    configureSdk(session);
    return true;
  }

  return false;
}
