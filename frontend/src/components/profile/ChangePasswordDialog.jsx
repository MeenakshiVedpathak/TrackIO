import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Eye, EyeOff, KeyRound } from 'lucide-react';
import { authApi } from '@/api/auth.api';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { passwordPolicySchema, PASSWORD_POLICY_RULES } from '@/utils/validators';
import { cn } from '@/utils/cn';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// No "current password" field — PUT /auth/change-password identifies which account (User or
// Employee) to update purely from the caller's existing Bearer token, and doesn't accept or
// require one. confirmPassword is compared client-side only for typo protection; the backend
// doesn't need or accept it.
const changePasswordSchema = z
  .object({
    newPassword: passwordPolicySchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

const emptyValues = { newPassword: '', confirmPassword: '' };

const PasswordField = ({ control, name, label, show, onToggleShow, disabled, autoComplete }) => (
  <FormField
    control={control}
    name={name}
    render={({ field }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <FormControl>
          <div className="relative">
            <Input
              type={show ? 'text' : 'password'}
              autoComplete={autoComplete}
              className="pr-10"
              disabled={disabled}
              {...field}
            />
            <button
              type="button"
              onClick={onToggleShow}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
);

// Triggered from UserMenu's "Change Password" item — works identically for a User or an
// Employee session; the backend resolves that from whichever Bearer token is attached, so
// this component never needs to know or care which one it is.
const ChangePasswordDialog = ({ open, onOpenChange }) => {
  const { success, error: showError } = useNotification();
  const [isLoading, setIsLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const form = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: emptyValues,
  });

  const newPasswordValue = useWatch({ control: form.control, name: 'newPassword' }) || '';
  const confirmPasswordValue = useWatch({ control: form.control, name: 'confirmPassword' }) || '';

  // Drives the submit button's disabled state directly (not RHF's formState.isValid, which
  // would need onChange-mode validation and make error messages appear too eagerly) — submit
  // stays disabled until every policy rule is met and the two fields match.
  const allRulesMet = PASSWORD_POLICY_RULES.every((rule) => rule.test(newPasswordValue));
  const passwordsMatch = newPasswordValue.length > 0 && newPasswordValue === confirmPasswordValue;
  const canSubmit = allRulesMet && passwordsMatch;

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen) {
      form.reset(emptyValues);
      setShowNew(false);
      setShowConfirm(false);
    }
    onOpenChange(nextOpen);
  };

  const onSubmit = async (values) => {
    setIsLoading(true);
    try {
      const res = await authApi.changePassword(values.newPassword);
      success(res?.message ?? 'Password changed successfully.');
      handleOpenChange(false);
    } catch (err) {
      const status = err?.response?.status;
      const message = extractApiError(err);
      if (status === 422) {
        // Password policy violation (client/server drift) or "Invalid user type." — either
        // way it's about the new password, so surface it right there.
        form.setError('newPassword', { message });
      } else if (status === 404) {
        // "User not found."/"Employee not found." — shouldn't normally happen for a logged-in
        // session; not something editing a field fixes, so a toast rather than inline.
        showError(message);
      } else if (status === 401) {
        // Session expired mid-request — apiClient's response interceptor already tries a
        // silent refresh and redirects to /login on failure; nothing extra to do here.
      } else {
        // Network failure / 5xx.
        showError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-5 w-5 text-primary" />
          </div>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>Choose a new password for your account.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form id="change-password-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <PasswordField
              control={form.control}
              name="newPassword"
              label="New Password"
              show={showNew}
              onToggleShow={() => setShowNew((v) => !v)}
              disabled={isLoading}
              autoComplete="new-password"
            />

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border bg-muted/30 p-3">
              {PASSWORD_POLICY_RULES.map((rule) => {
                const met = !!newPasswordValue && rule.test(newPasswordValue);
                return (
                  <div key={rule.key} className="flex items-center gap-1.5 text-xs">
                    <span
                      className={cn(
                        'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors',
                        met ? 'border-success bg-success text-white' : 'border-muted-foreground/40'
                      )}
                    >
                      {met && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                    </span>
                    <span className={cn('transition-colors', met ? 'text-foreground' : 'text-muted-foreground')}>
                      {rule.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <PasswordField
              control={form.control}
              name="confirmPassword"
              label="Confirm New Password"
              show={showConfirm}
              onToggleShow={() => setShowConfirm((v) => !v)}
              disabled={isLoading}
              autoComplete="new-password"
            />
          </form>
        </Form>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" form="change-password-form" disabled={isLoading || !canSubmit}>
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Changing…
              </span>
            ) : (
              'Change Password'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ChangePasswordDialog;
