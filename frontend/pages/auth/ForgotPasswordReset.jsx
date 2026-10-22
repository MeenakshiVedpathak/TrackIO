import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Circle, Eye, EyeOff, KeyRound } from 'lucide-react';
import { authApi } from '@/api/auth.api';
import { useForgotPassword } from '@/contexts/ForgotPasswordContext';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { applyFieldErrors } from '@/utils/authErrors';
import { passwordPolicySchema, PASSWORD_POLICY_RULES } from '@/utils/validators';
import { cn } from '@/utils/cn';
import { ROUTES } from '@/constants/routes';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const resetStepSchema = z
  .object({
    password: passwordPolicySchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// Screen 3 (route: /forgot-password/reset-password). Resubmits the SAME otp already verified
// on the previous screen — the user does not re-enter it. Requires email + otp from the shared
// store; missing either is a normal "start over", not an error state.
const ForgotPasswordReset = () => {
  const navigate = useNavigate();
  const { email, otp, clear } = useForgotPassword();
  const { success, error: showError } = useNotification();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  // "OTP is not verified or has expired" is a full-page dead end, not a form error — the user
  // can't fix it by editing the password, only by starting the flow over.
  const [hardError, setHardError] = useState(null);

  const form = useForm({
    resolver: zodResolver(resetStepSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const passwordValue = useWatch({ control: form.control, name: 'password' }) || '';
  const confirmValue = useWatch({ control: form.control, name: 'confirmPassword' }) || '';

  useEffect(() => {
    if (!email || !otp) {
      navigate(ROUTES.FORGOT_PASSWORD, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Missing state (direct visit, refresh, or stale back-navigation) — the effect above is
  // already redirecting; render a visible placeholder instead of nothing while that happens,
  // rather than a blank panel with no explanation.
  if (!email || !otp) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        <p className="text-sm text-muted-foreground">Redirecting…</p>
      </div>
    );
  }

  const onSubmit = async (values) => {
    setIsLoading(true);
    try {
      const res = await authApi.resetPassword(email, otp, values.password, values.confirmPassword);
      success(res?.message ?? 'Password reset successfully. You can now log in with your new password.');
      clear();
      navigate(ROUTES.LOGIN, { replace: true });
    } catch (err) {
      const status = err?.response?.status;
      const message = extractApiError(err);
      if (status === 400) {
        setHardError(message);
      } else if (status === 422) {
        const { hasFieldErrors, leftover } = applyFieldErrors(err, form, ['password', 'confirmPassword']);
        if (leftover.length) showError(leftover.join(' '));
        else if (!hasFieldErrors) showError(message);
      } else {
        showError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartOver = () => {
    clear();
    navigate(ROUTES.FORGOT_PASSWORD, { replace: true });
  };

  if (hardError) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="py-4 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="text-lg font-bold tracking-tight">Verification expired</h2>
        <p className="mt-2 text-sm text-muted-foreground">{hardError}</p>
        <Button className="mt-6 w-full" onClick={handleStartOver}>
          Start Over
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Create new password</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">Choose a new password for your account.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter new password"
                      autoComplete="new-password"
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

          <ul className="space-y-1 rounded-lg border bg-muted/30 p-3">
            {PASSWORD_POLICY_RULES.map((rule) => {
              const met = !!passwordValue && rule.test(passwordValue);
              return (
                <li
                  key={rule.key}
                  className={cn('flex items-center gap-2 text-xs', met ? 'text-success' : 'text-muted-foreground')}
                >
                  {met ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                  {rule.label}
                </li>
              );
            })}
          </ul>

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="Re-enter new password"
                      autoComplete="new-password"
                      className="pr-10"
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </FormControl>
                {confirmValue && confirmValue !== passwordValue && (
                  <p className="text-xs font-medium text-destructive">Passwords do not match</p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full mt-2" disabled={isLoading} size="lg">
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Resetting…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" />
                Reset Password
              </span>
            )}
          </Button>
        </form>
      </Form>
    </motion.div>
  );
};

export default ForgotPasswordReset;
