import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { authApi } from '@/api/auth.api';
import { useForgotPassword } from '@/contexts/ForgotPasswordContext';
import { useNotification } from '@/hooks/useNotification';
import { useCountdownTo } from '@/hooks/useCountdownTo';
import { extractApiError } from '@/services/apiClient';
import { applyFieldErrors } from '@/utils/authErrors';
import { otpSchema } from '@/utils/validators';
import { formatCountdown } from '@/utils/formatters';
import { ROUTES } from '@/constants/routes';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const otpStepSchema = z.object({ otp: otpSchema });

// Screen 2 (route: /forgot-password/verify-otp). Requires email from the shared store —
// refresh, back button, or a direct visit here without it is a normal "start over", not an
// error state.
const ForgotPasswordOtp = () => {
  const navigate = useNavigate();
  const { email, otpExpiresAt, resendAvailableAt, setOtp, restartTimers } = useForgotPassword();
  const { success, error: showError } = useNotification();
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isLockedOut, setIsLockedOut] = useState(false);

  const validity = useCountdownTo(otpExpiresAt);
  const cooldown = useCountdownTo(resendAvailableAt);

  const form = useForm({ resolver: zodResolver(otpStepSchema), defaultValues: { otp: '' } });

  useEffect(() => {
    if (!email) {
      navigate(ROUTES.FORGOT_PASSWORD, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Missing state (direct visit, refresh, or stale back-navigation) — the effect above is
  // already redirecting; render a visible placeholder instead of nothing while that happens,
  // rather than a blank panel with no explanation.
  if (!email) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
        <p className="text-sm text-muted-foreground">Redirecting…</p>
      </div>
    );
  }

  const onSubmit = async ({ otp }) => {
    setIsVerifying(true);
    try {
      await authApi.verifyOtp(email, otp);
      setOtp(otp);
      navigate(ROUTES.FORGOT_PASSWORD_RESET);
    } catch (err) {
      const status = err?.response?.status;
      const message = extractApiError(err);
      if (status === 400 && /maximum attempts/i.test(message)) {
        // Further attempts are pointless — the OTP is dead. Resend is the only way forward.
        setIsLockedOut(true);
      } else if (status === 400) {
        // "Invalid or expired OTP." — inline, retryable; keep whatever they typed.
        form.setError('otp', { message });
      } else if (status === 422) {
        const { hasFieldErrors, leftover } = applyFieldErrors(err, form, ['otp']);
        if (leftover.length) showError(leftover.join(' '));
        else if (!hasFieldErrors) showError(message);
      } else {
        showError(message);
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    try {
      await authApi.resendOtp(email);
      success('A new OTP has been sent.');
      form.reset({ otp: '' });
      setIsLockedOut(false);
      restartTimers();
    } catch (err) {
      const status = err?.response?.status;
      const message = extractApiError(err);
      if (status === 429) {
        showError(message); // no new OTP was actually issued — don't reset the timers
      } else if (status === 404) {
        // Unusual mid-flow (the account existed a moment ago) — hard failure.
        showError(message);
        navigate(ROUTES.FORGOT_PASSWORD, { replace: true });
      } else {
        showError(message);
      }
    } finally {
      setIsResending(false);
    }
  };

  const resendLabel = isResending ? 'Resending…' : cooldown.isExpired ? 'Resend OTP' : `Resend in ${cooldown.secondsLeft}s`;
  const resendDisabled = !cooldown.isExpired || isResending;

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Enter verification code</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We've sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>.
        </p>
      </div>

      {isLockedOut && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Maximum attempts exceeded. Please request a new OTP.
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="otp"
            render={({ field }) => (
              <FormItem>
                <FormLabel>6-digit code</FormLabel>
                <FormControl>
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="••••••"
                    autoComplete="one-time-code"
                    autoFocus
                    disabled={validity.isExpired || isLockedOut}
                    className="text-center text-lg tracking-[0.5em]"
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </FormControl>
                {validity.isExpired ? (
                  <p className="text-xs font-medium text-destructive">
                    This code has expired. Please request a new one.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Code expires in{' '}
                    <span className="font-medium text-foreground tabular-nums">
                      {formatCountdown(validity.secondsLeft)}
                    </span>
                  </p>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={isVerifying || validity.isExpired || isLockedOut} size="lg">
            {isVerifying ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Verifying…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Verify OTP
              </span>
            )}
          </Button>
        </form>
      </Form>

      <div className="mt-4 flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => navigate(ROUTES.FORGOT_PASSWORD)}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>

        {isLockedOut ? (
          <Button type="button" size="sm" onClick={handleResend} disabled={resendDisabled}>
            {resendLabel}
          </Button>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={resendDisabled}
            className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
          >
            {resendLabel}
          </button>
        )}
      </div>
    </motion.div>
  );
};

export default ForgotPasswordOtp;
