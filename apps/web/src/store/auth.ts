import { create } from 'zustand';
import type { AuthUser } from '@/types/auth';

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  sessionId: string | null;   // academic session chosen in the top bar
  ready: boolean;             // initial silent refresh finished
  setAuth: (accessToken: string, user: AuthUser) => void;
  clear: () => void;
  setSession: (id: string) => void;
  setReady: () => void;
  can: (module: string, action?: string) => boolean;
}

export const useAuth = create<AuthState>((set, get) => ({
  accessToken: null, user: null, sessionId: null, ready: false,
  setAuth: (accessToken, user) => set((s) => ({ accessToken, user, sessionId: s.sessionId ?? user.activeSession?.id ?? null })),
  clear: () => set({ accessToken: null, user: null, sessionId: null }),
  setSession: (sessionId) => set({ sessionId }),
  setReady: () => set({ ready: true }),
  can: (module, action = 'VIEW') => !!get().user?.permissions.includes(`${module}:${action}`),
}));
