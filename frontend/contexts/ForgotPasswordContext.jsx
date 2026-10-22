import { createContext, useContext, useEffect, useState } from 'react';

const ForgotPasswordContext = createContext(null);

const OTP_VALIDITY_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

// In-memory only (plain useState) — never localStorage/sessionStorage, this is a short-lived,
// sensitive flow. Wraps the Forgot Password route subtree (Email/OTP/Reset screens); a hard
// refresh or navigating away from all three unmounts this provider and drops everything,
// which is intentional — the Email screen is the correct "start over" landing for that case.
export const ForgotPasswordProvider = ({ children }) => {
  const [email, setEmail] = useState(null);
  const [otp, setOtp] = useState(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState(null);
  const [resendAvailableAt, setResendAvailableAt] = useState(null);

  const clear = () => {
    setEmail(null);
    setOtp(null);
    setOtpExpiresAt(null);
    setResendAvailableAt(null);
  };

  // Covers "unmounting the flow's route tree entirely" — successful reset navigates to
  // Login, manual "Back to Login" does too, both unmount this provider along with it.
  useEffect(() => () => clear(), []);

  // Email screen success -> starts both timers as absolute timestamps (not a relative
  // countdown) so remaining time stays correct regardless of re-renders.
  const startOtpFlow = (resolvedEmail) => {
    setEmail(resolvedEmail);
    const now = Date.now();
    setOtpExpiresAt(now + OTP_VALIDITY_MS);
    setResendAvailableAt(now + RESEND_COOLDOWN_MS);
  };

  // Resend success — same two timestamps, fresh.
  const restartTimers = () => {
    const now = Date.now();
    setOtpExpiresAt(now + OTP_VALIDITY_MS);
    setResendAvailableAt(now + RESEND_COOLDOWN_MS);
  };

  const value = {
    email, otp, otpExpiresAt, resendAvailableAt,
    setOtp, startOtpFlow, restartTimers, clear,
  };

  return <ForgotPasswordContext.Provider value={value}>{children}</ForgotPasswordContext.Provider>;
};

export const useForgotPassword = () => {
  const ctx = useContext(ForgotPasswordContext);
  if (!ctx) throw new Error('useForgotPassword must be used within a ForgotPasswordProvider');
  return ctx;
};
