import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuth } from '@/store/auth';

export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api/v1', withCredentials: true });

api.interceptors.request.use((cfg) => {
  const { accessToken, sessionId } = useAuth.getState();
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  if (sessionId) cfg.headers['X-Academic-Session'] = sessionId;
  return cfg;
});

// One shared refresh call so parallel 401s don't race.
let refreshing: Promise<void> | null = null;
export const silentRefresh = () => {
  refreshing ??= api.post('/auth/refresh', null, { headers: { 'X-Skip-Refresh': '1' } })
    .then((r) => useAuth.getState().setAuth(r.data.data.accessToken, r.data.data.user))
    .finally(() => { refreshing = null; });
  return refreshing;
};

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
  const skip = original?.headers?.['X-Skip-Refresh'] || original?.url?.includes('/auth/login');
  if (error.response?.status === 401 && original && !original._retried && !skip) {
    original._retried = true;
    try { await silentRefresh(); return api(original); }
    catch { useAuth.getState().clear(); }
  }
  return Promise.reject(error);
});

export const apiMessage = (e: unknown, fallback = 'Something went wrong') =>
  (e as AxiosError<{ message?: string }>)?.response?.data?.message ?? fallback;
