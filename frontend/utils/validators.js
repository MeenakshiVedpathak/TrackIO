import { z } from 'zod';

// Shared Zod field schemas — reused across Login, Forgot Password, Employee forms, etc. so
// email/password rules stay defined in exactly one place.
export const emailSchema = z.string().min(1, 'Email is required').email('Enter a valid email address');

export const otpSchema = z
  .string()
  .min(1, 'Enter the 6-digit code')
  .length(6, 'Enter the 6-digit code')
  .regex(/^\d{6}$/, 'OTP must contain only digits');

// Baseline client-side check — used where the backend's exact policy isn't confirmed
// (Admin-side employee password fields). The backend's actual policy is authoritative there
// and surfaces via extractFieldErrors/extractApiError on a 422 the client didn't already catch.
export const passwordSchema = z.string().min(8, 'Password must be at least 8 characters');

// Full policy for Reset Password (confirmed by the backend: min 8, upper, lower, digit,
// special) — one source of truth shared by the Zod resolver and the live checklist UI, so the
// rule definitions can't drift apart from each other.
export const PASSWORD_POLICY_RULES = [
  { key: 'minLength', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { key: 'uppercase', label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { key: 'lowercase', label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
  { key: 'digit', label: 'One number', test: (v) => /\d/.test(v) },
  { key: 'special', label: 'One special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export const passwordPolicySchema = z
  .string()
  .min(1, 'Password is required')
  .refine((v) => PASSWORD_POLICY_RULES.every((rule) => rule.test(v)), {
    message: 'Password does not meet the required policy',
  });
