import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';

export function useLogout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return async () => {
    try { await api.post('/auth/logout'); } catch { /* cookie cleared server-side when reachable */ }
    useAuth.getState().clear();
    qc.clear();
    navigate('/login', { replace: true });
  };
}
