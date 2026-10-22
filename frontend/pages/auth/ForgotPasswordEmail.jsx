import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail } from 'lucide-react';
import { authApi } from '@/api/auth.api';
import { useForgotPassword } from '@/contexts/ForgotPasswordContext';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { applyFieldErrors } from '@/utils/authErrors';
import { emailSchema } from '@/utils/validators';
import { ROUTES } from '@/constants/routes';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const emailStepSchema = z.object({ email: emailSchema });

// Screen 1 of the flow (route: /forgot-password). Every account authenticates identically now,
// so this always resolves to a single OTP send — no account-type disambiguation.
const ForgotPasswordEmail = () => {
  const navigate = useNavigate();
  const { startOtpFlow } = useForgotPassword();
  const { error: showError } = useNotification();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm({ resolver: zodResolver(emailStepSchema), defaultValues: { email: '' } });

  const onSubmit = async ({ email }) => {
    setIsLoading(true);
    try {
      await authApi.forgotPassword(email);
      startOtpFlow(email);
      navigate(ROUTES.FORGOT_PASSWORD_OTP);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404) {
        form.setError('email', { message: extractApiError(err) });
      } else if (status === 429) {
        // A legitimate "you already have one in flight" case, not a hard failure — the user
        // just waits and resubmits, so stay here rather than advancing to the OTP screen.
        showError(extractApiError(err));
      } else if (status === 422) {
        const { hasFieldErrors, leftover } = applyFieldErrors(err, form, ['email']);
        if (leftover.length) showError(leftover.join(' '));
        else if (!hasFieldErrors) showError(extractApiError(err));
      } else {
        showError(extractApiError(err));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Forgot password?</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Enter your email and we'll send you a one-time code to reset your password.
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
                  <Input type="email" placeholder="Enter your email" autoComplete="email" autoFocus {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full mt-2" disabled={isLoading} size="lg">
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Sending…
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Send OTP
              </span>
            )}
          </Button>
        </form>
      </Form>

      <Link
        to={ROUTES.LOGIN}
        className="mt-6 flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Login
      </Link>
    </motion.div>
  );
};

export default ForgotPasswordEmail;
