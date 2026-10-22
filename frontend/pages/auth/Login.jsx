import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { useMsal } from '@azure/msal-react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { authApi } from '@/api/auth.api';
import { employeesApi } from '@/api/employees.api';
import { rolesApi } from '@/api/roles.api';
import { store } from '@/store';
import { useAuth } from '@/hooks/useAuth';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { applyFieldErrors } from '@/utils/authErrors';
import { emailSchema } from '@/utils/validators';
import { ROUTES } from '@/constants/routes';
import { computeHomeRoute, FORM_NAMES } from '@/constants/rbacForms';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { MicrosoftSignInButton } from '@/components/auth/MicrosoftSignInButton';

// Backend codes with copy that replaces the raw backend message — every other code from
// POST /auth/microsoft (ACCOUNT_INACTIVE, ROLE_INACTIVE, INVALID_MICROSOFT_TOKEN,
// MICROSOFT_EMAIL_CLAIM_MISSING) is shown verbatim via extractApiError instead.
const MICROSOFT_ERROR_COPY = {
  EMAIL_NOT_REGISTERED: "This Microsoft account isn't linked to a Trackio employee. Contact your administrator to get access.",
  MICROSOFT_SSO_NOT_CONFIGURED: "Microsoft sign-in isn't available right now. Please use your email and password.",
};
const MICROSOFT_POPUP_CANCELLED = 'Sign-in was cancelled. Please try again — or check that pop-ups are allowed for this site.';

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { instance: msalInstance } = useMsal();
  const { setCredentials, setAccessibleForms, setBusinessUnits } = useAuth();
  const { error: showError } = useNotification();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isMsLoading, setIsMsLoading] = useState(false);
  // Both sign-in paths must disable while either is mid-submit — a user can't fire a password
  // attempt and a Microsoft popup at the same time.
  const isBusy = isLoading || isMsLoading;
  // Role-Based Login: set only when /auth/login returns `requiresRoleSelection: true` — no
  // tokens exist yet at that point, so `loginTicket` lives here in component state only (never
  // localStorage) until the user picks a role and /auth/select-role exchanges it for real tokens.
  const [roleSelection, setRoleSelection] = useState(null); // { loginTicket, roles } | null
  const [isSelectingRole, setIsSelectingRole] = useState(false);

  // null (not ROUTES.DASHBOARD) when there's no explicit deep-link target — Dashboard is no
  // longer guaranteed to be reachable by everyone, so falling back to it unconditionally here
  // would bounce an account without it mapped straight into Not Authorized right after login.
  const from = location.state?.from?.pathname ?? null;

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const completeLogin = (data) => {
    const { employee, accessToken, refreshToken, roles, forms } = data;
    // Employee-only means Employee is the account's SOLE role — a multi-role account (e.g.
    // Employee + Manager) must land wherever `forms` sends it below, not always the Employee
    // dashboard, so this checks the full `roles[]` array rather than a singular role.
    const isEmployeeOnly = (roles ?? []).length > 0 && (roles ?? []).every((r) => r.name === 'Employee');

    setCredentials({ employee, accessToken, refreshToken, roles });

    // Role-Based Login: businessUnits no longer rides along on the login/select-role response —
    // fetch it separately now that we have `employee.id`. Backgrounded (not awaited) same as the
    // forms fetch below: it only feeds the BU switcher, nothing here needs to block on it.
    if (employee?.id != null) {
      employeesApi.getBusinessUnits(employee.id)
        .then((res) => {
          // Guard against a stale response landing after a subsequent logout/login on the same
          // tab (e.g. a slow request from a prior session resolving late) — only apply it if
          // this is still the active session's employee, else it silently overwrites the new
          // session's businessUnits with the previous one's.
          if (store.getState().auth.employee?.id === employee.id) {
            setBusinessUnits(res?.data?.businessUnits);
          }
        })
        .catch(() => {});
    }

    // Paint immediately from whatever the login response embedded, if anything — avoids a
    // blank sidebar flash while the call below is in flight.
    if (forms) setAccessibleForms(forms);

    // POST /roles/forms is the authoritative source of truth for what each user can see —
    // always call it after login (not just when the login response happens to omit `forms`),
    // and let its result win. Fired in the background so it doesn't delay navigation when we
    // already have enough to decide (`forms` embedded, or an explicit deep-link `from`) — only
    // awaited below when neither of those tells us where to land.
    const roleIds = (roles ?? []).map((r) => r.id);
    const formsPromise = roleIds.length
      ? rolesApi.getAccessibleForms(roleIds)
        .then((fetched) => { setAccessibleForms(fetched); return fetched; })
        .catch(() => forms ?? {})
        // Non-fatal on failure: MainLayout's useSyncAccessibleForms fallback will retry
        // if the store ends up with no accessible-forms cached at all.
      : Promise.resolve(forms ?? {});

    // A Platform Admin always lands on its own fixed home (MainLayout also enforces this on
    // every navigation, but this avoids an unnecessary bounce right after login). An Employee
    // lands on Employee Dashboard only when that form is actually mapped to it — an account
    // mapped to other Employee forms (e.g. "My Work Log") but not "Employee Dashboard" itself
    // would otherwise get bounced straight to Not Authorized right after login, even though its
    // sidebar shows its real mapped forms fine (see ProtectedRoute's formName gate on
    // ROUTES.EMPLOYEE_DASHBOARD). Everyone else: honor an explicit deep-link target if there is
    // one; otherwise pick a real landing page from whichever forms answer is available —
    // Dashboard is no longer guaranteed to be one of them (see ProtectedRoute's
    // `allowIfNoFormsMapped`).
    const employeeHomeOpts = { homeFormName: FORM_NAMES.EMPLOYEE_DASHBOARD, homeRoute: ROUTES.EMPLOYEE_DASHBOARD };
    if (isEmployeeOnly) {
      if (forms) {
        navigate(computeHomeRoute(forms, employeeHomeOpts), { replace: true });
      } else {
        formsPromise.then((resolvedForms) => navigate(computeHomeRoute(resolvedForms, employeeHomeOpts), { replace: true }));
      }
    } else if ((roles ?? []).some((r) => r.name === 'Platform Admin')) {
      navigate(ROUTES.ADMINS, { replace: true });
    } else if (from) {
      navigate(from, { replace: true });
    } else if (forms) {
      navigate(computeHomeRoute(forms), { replace: true });
    } else {
      formsPromise.then((resolvedForms) => navigate(computeHomeRoute(resolvedForms), { replace: true }));
    }
  };

  const onSubmit = async (values) => {
    setIsLoading(true);
    try {
      const res = await authApi.login(values.email, values.password);
      if (res.data?.requiresRoleSelection) {
        // No tokens issued yet — hold the ticket + role list in memory and show the picker
        // instead of proceeding as a completed login.
        setRoleSelection({ loginTicket: res.data.loginTicket, roles: res.data.roles ?? [] });
      } else {
        completeLogin(res.data);
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404) {
        // "Email ID is not registered." — a real, expected case now, not a generic
        // "invalid credentials" — shown inline under the field it's actually about.
        form.setError('email', { message: extractApiError(err) });
      } else if (status === 422) {
        const { hasFieldErrors, leftover } = applyFieldErrors(err, form, ['email', 'password']);
        if (leftover.length) showError(leftover.join(' '));
        else if (!hasFieldErrors) showError(extractApiError(err));
      } else {
        // 401 (wrong password) / 403 (inactive) / network / 5xx — server's literal message.
        showError(extractApiError(err));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectRole = async (roleId) => {
    setIsSelectingRole(true);
    try {
      const res = await authApi.selectRole(roleSelection.loginTicket, roleId);
      completeLogin(res.data);
    } catch (err) {
      const status = err?.response?.status;
      showError(extractApiError(err));
      // INVALID_LOGIN_TICKET (expired/malformed), ACCOUNT_INACTIVE (deactivated between login and
      // role pick), and ROLE_NOT_AVAILABLE (rare race — role no longer valid) all mean this ticket
      // can't complete a login — only a fresh login can recover, so send the user back to the form.
      // A 422 (malformed body) shouldn't happen since the ticket/roleId are passed through
      // untouched — leave the picker up for a retry in that case.
      if (status === 401 || status === 403) {
        setRoleSelection(null);
      }
    } finally {
      setIsSelectingRole(false);
    }
  };

  const handleMicrosoftSignIn = async () => {
    setIsMsLoading(true);
    try {
      const result = await msalInstance.loginPopup({ scopes: ['openid', 'profile', 'email'] });
      // Only the raw ID token is sent — the backend re-derives the employee from the verified
      // token itself, never from claims read out of the MSAL result on this side.
      const res = await authApi.microsoftLogin(result.idToken);
      if (res.data?.requiresRoleSelection) {
        setRoleSelection({ loginTicket: res.data.loginTicket, roles: res.data.roles ?? [] });
      } else {
        completeLogin(res.data);
      }
    } catch (err) {
      if (err?.response) {
        // Reached the backend — map its code to copy, or show its message verbatim.
        const code = err.response.data?.code;
        showError(MICROSOFT_ERROR_COPY[code] ?? extractApiError(err));
      } else {
        // Never reached the backend — the MSAL popup was closed, blocked, or timed out.
        showError(MICROSOFT_POPUP_CANCELLED);
      }
    } finally {
      setIsMsLoading(false);
    }
  };

  if (roleSelection) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight">Choose a role</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Your account has more than one role. Pick which one to sign in as — you'll only have
            that role's access for this session.
          </p>
        </div>

        <div className="space-y-2">
          {roleSelection.roles.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={isSelectingRole}
              onClick={() => handleSelectRole(r.id)}
              className="w-full rounded-md border border-border/60 bg-muted/20 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-60"
            >
              {r.name}
            </button>
          ))}
        </div>

        <Button
          type="button"
          variant="ghost"
          className="mt-4 w-full"
          disabled={isSelectingRole}
          onClick={() => setRoleSelection(null)}
        >
          Back to sign in
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Sign in to your Trackio account
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    autoComplete="email"
                    autoFocus
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className="pr-10"
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end">
            <Link to={ROUTES.FORGOT_PASSWORD} className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" className="w-full mt-2" disabled={isBusy} size="lg">
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Signing in…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <LogIn className="h-4 w-4" />
                Sign in
              </span>
            )}
          </Button>
        </form>
      </Form>

      <div className="my-6 flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs text-muted-foreground">or</span>
        <Separator className="flex-1" />
      </div>

      <MicrosoftSignInButton onClick={handleMicrosoftSignIn} disabled={isBusy} loading={isMsLoading} />

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Contact your administrator if you don't have access.
      </p>
    </motion.div>
  );
};

export default Login;
