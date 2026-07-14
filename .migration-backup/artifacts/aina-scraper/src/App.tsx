import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';

// Pages
import LoginPage from '@/pages/login';
import InputPage from '@/pages/input';
import ContributorDashboardPage from '@/pages/dashboard';
import DraftsPage from '@/pages/drafts/index';
import DraftDetailPage from '@/pages/drafts/[id]';
import AdminDashboardPage from '@/pages/admin/index';
import AdminHistoryPage from '@/pages/admin/history';
import AdminUsersPage from '@/pages/admin/users';
import AdminDuplicatesPage from '@/pages/admin/duplicates';
import KnowledgeBasePage from '@/pages/knowledge-base';
import AutomationPage from '@/pages/automation';
import SettingsPage from '@/pages/settings';
import ChangePasswordPage from '@/pages/change-password';
import NotFound from '@/pages/not-found';
import { AppLayout } from '@/components/layout/AppLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component, allowedRoles }: { component: any, allowedRoles?: string[] }) {
  const { user, isLoading } = useAuth();
  const [_, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation('/login');
    } else if (!isLoading && user && allowedRoles && !allowedRoles.includes(user.role)) {
      setLocation('/'); // Redirect to safe default
    }
  }, [user, isLoading, setLocation, allowedRoles]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return null; // Will redirect in useEffect
  }

  return <Component />;
}

function IndexRedirect() {
  const { user, isLoading } = useAuth();
  const [_, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && user) {
      if (user.role === 'admin') {
        setLocation('/admin');
      } else {
        // Kontributor mendarat di dashboard pribadinya, bukan langsung form input.
        // Di sana mereka langsung melihat status semua artikelnya.
        setLocation('/dashboard');
      }
    } else if (!isLoading && !user) {
      setLocation('/login');
    }
  }, [user, isLoading, setLocation]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/" component={IndexRedirect} />
      
      {/*
        BUG FIX KRITIS — PENYEBAB HALAMAN BLANK.

        Sebelumnya: <Route path="/:rest*">
        `:rest` adalah PARAMETER BERNAMA, dan parameter di wouter TIDAK BISA
        menangkap tanda "/". Jadi route ini hanya cocok untuk path satu segmen:

          /admin            -> cocok    (tampil)
          /knowledge-base   -> cocok    (tampil)
          /admin/history    -> TIDAK    -> Switch jatuh ke bawah -> layar putih
          /admin/users      -> TIDAK    -> layar putih
          /drafts/<id>      -> TIDAK    -> layar putih

        Itulah kenapa "lihat & edit draft" setelah scrape selalu blank.

        Perbaikannya: "/*" adalah wildcard sejati — menangkap seluruh sisa path
        termasuk tanda "/".
      */}
      <Route path="/*">
        <AppLayout>
          <Switch>
            <Route path="/dashboard">
              <ProtectedRoute component={ContributorDashboardPage} allowedRoles={['contributor', 'admin']} />
            </Route>
          <Route path="/input">
              <ProtectedRoute component={InputPage} allowedRoles={['contributor', 'admin']} />
            </Route>
            <Route path="/drafts">
              <ProtectedRoute component={DraftsPage} allowedRoles={['contributor']} />
            </Route>
            <Route path="/drafts/:id">
              <ProtectedRoute component={DraftDetailPage} allowedRoles={['contributor', 'admin']} />
            </Route>
            
            <Route path="/admin">
              <ProtectedRoute component={AdminDashboardPage} allowedRoles={['admin']} />
            </Route>
            <Route path="/admin/history">
              <ProtectedRoute component={AdminHistoryPage} allowedRoles={['admin']} />
            </Route>
            <Route path="/admin/users">
              <ProtectedRoute component={AdminUsersPage} allowedRoles={['admin']} />
            </Route>
            <Route path="/admin/duplicates">
              <ProtectedRoute component={AdminDuplicatesPage} allowedRoles={['admin']} />
            </Route>
            <Route path="/knowledge-base">
              <ProtectedRoute component={KnowledgeBasePage} />
            </Route>
            <Route path="/automation">
              <ProtectedRoute component={AutomationPage} allowedRoles={['admin']} />
            </Route>
            <Route path="/settings">
              <ProtectedRoute component={SettingsPage} />
            </Route>
            <Route path="/change-password">
              <ProtectedRoute component={ChangePasswordPage} />
            </Route>
            
            <Route component={NotFound} />
          </Switch>
        </AppLayout>
      </Route>
    </Switch>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthProvider>
            <AppRoutes />
            <Toaster theme="dark" />
          </AuthProvider>
        </WouterRouter>
      </TooltipProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;