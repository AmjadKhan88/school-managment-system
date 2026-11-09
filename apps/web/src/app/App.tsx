import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { RouterProvider } from 'react-router-dom';
import { silentRefresh } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { router } from './router';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } });

export default function App() {
  // Restore the session from the httpOnly refresh cookie on first load.
  useEffect(() => {
    silentRefresh().catch(() => undefined).finally(() => useAuth.getState().setReady());
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="top-right" toastOptions={{ style: { fontSize: 14 } }} />
    </QueryClientProvider>
  );
}
