import { createContext, useContext, type ReactNode, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGetMe, AuthUser, useLogin, useLogout, getGetMeQueryKey } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { clearToken } from '@/lib/auth-token';

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  logout: () => void;
  refetchUser: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: user, isLoading, refetch, isError } = useGetMe({
    query: {
      retry: false,
      queryKey: getGetMeQueryKey(),
    }
  });

  const logoutMutation = useLogout();

  const handleLogout = () => {
    const finish = () => {
      // Token bersifat stateless — kalau tidak dihapus dari localStorage,
      // user tetap "login" walaupun session server sudah dimusnahkan.
      clearToken();
      queryClient.clear();
      setLocation('/login');
    };

    // Bersihkan sesi lokal apa pun hasil request logout-nya (misal server
    // tidak terjangkau). User harus selalu bisa keluar.
    logoutMutation.mutate(undefined, { onSuccess: finish, onError: finish });
  };

  useEffect(() => {
    if (isLoading || !isError) return;

    // /auth/me menolak -> token/session sudah tidak valid. Buang token basi,
    // kalau tidak setAuthTokenGetter akan terus mengirim header yang mati.
    clearToken();

    if (location !== '/login') {
      setLocation('/login');
    }
  }, [isLoading, isError, location, setLocation]);

  return (
    <AuthContext.Provider value={{ 
      user: user || null, 
      isLoading, 
      logout: handleLogout,
      refetchUser: refetch 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
