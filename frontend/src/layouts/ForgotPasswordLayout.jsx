import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { ForgotPasswordProvider } from '@/contexts/ForgotPasswordContext';

// A step's own placeholder while its lazy chunk loads — deliberately lightweight (not the
// app-wide LoadingScreen, which is full-viewport and would look wrong inside AuthLayout's
// narrow form panel).
const StepFallback = () => (
  <div className="flex flex-col items-center gap-3 py-12 text-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
  </div>
);

// Wraps the three Forgot Password routes (Email/OTP/Reset) in one shared, in-memory-only
// state provider — mounted once when entering any of the three, unmounted (and cleared)
// when leaving all three, e.g. navigating to Login.
//
// The Suspense boundary here (rather than relying on the app-wide one in routes/index.jsx)
// matters: each step is its own React.lazy() chunk. Without a boundary BELOW the provider, the
// first-ever visit to a given step (its chunk not loaded yet) suspends past this provider up to
// the top-level Suspense, unmounting — and on commit, freshly remounting — the provider itself,
// wiping email/otp right as the next step tries to read them. Keeping the boundary here means a
// chunk load only swaps the Outlet's content, never the state around it.
const ForgotPasswordLayout = () => (
  <ForgotPasswordProvider>
    <Suspense fallback={<StepFallback />}>
      <Outlet />
    </Suspense>
  </ForgotPasswordProvider>
);

export default ForgotPasswordLayout;
