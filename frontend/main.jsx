import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { QueryClientProvider } from '@tanstack/react-query';
import { MsalProvider } from '@azure/msal-react';
import { Toaster } from 'react-hot-toast';
import store from '@/store';
import { queryClient } from '@/lib/queryClient';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { TooltipProvider } from '@/components/ui/tooltip';
import { registerLogoutCallback, registerRefreshDataCallback } from '@/services/apiClient';
import { logout, setRoles, setAccessibleForms } from '@/store/slices/authSlice';
import { msalInstance } from '@/config/msalConfig';
import App from './App';
import '@/styles/index.css';

// Wire up the logout callback after store is created
registerLogoutCallback(() => {
  store.dispatch(logout());
  queryClient.clear();
  window.location.href = '/login';
});

// Silent token refresh may carry updated roles/forms (e.g. an admin changed this
// user's role mappings since they logged in) — keep the store in sync.
registerRefreshDataCallback(({ roles, forms }) => {
  if (roles) store.dispatch(setRoles(roles));
  if (forms) store.dispatch(setAccessibleForms(forms));
});

// MSAL requires the instance to finish initializing before MsalProvider (or any MSAL API) is used.
msalInstance.initialize().then(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <Provider store={store}>
          <QueryClientProvider client={queryClient}>
            <ThemeProvider>
              <TooltipProvider delayDuration={300}>
              <App />
              </TooltipProvider>
              <Toaster
                position="top-right"
                gutter={8}
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: 'hsl(var(--card))',
                    color: 'hsl(var(--card-foreground))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '0.625rem',
                    fontSize: '0.875rem',
                    padding: '10px 14px',
                    boxShadow: '0 4px 24px 0 rgba(0,0,0,0.10)',
                  },
                  success: {
                    iconTheme: { primary: 'hsl(var(--success))', secondary: '#fff' },
                  },
                  error: {
                    iconTheme: { primary: 'hsl(var(--destructive))', secondary: '#fff' },
                  },
                }}
              />
            </ThemeProvider>
          </QueryClientProvider>
        </Provider>
      </MsalProvider>
    </StrictMode>
  );
});
