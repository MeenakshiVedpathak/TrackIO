import { Navigate, Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import AuthHeroWaves from '@/components/auth/AuthHeroWaves';

const AuthLayout = () => {
  const { isAuthenticated, homeRoute } = useAuth();

  if (isAuthenticated) {
    return <Navigate to={homeRoute} replace />;
  }

  return (
    // `min-h-dvh` (100dvh), not `min-h-screen` (100vh): on a real mobile browser, 100vh measures
    // the viewport as if the address bar / bottom toolbar were hidden — taller than what's
    // actually visible on load. That extra phantom height is what made the footer's `mt-auto`
    // below push it past the real visible fold and force a scroll that didn't exist before the
    // mt-auto change — 100dvh tracks the viewport that's actually on screen right now, chrome
    // included, so mt-auto's "bottom" lands at the real bottom instead of past it. Desktop is
    // unaffected: no mobile browser chrome there, so 100vh and 100dvh already computed the same.
    <div className="min-h-dvh flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-[52%] bg-sidebar relative flex-col p-12 overflow-hidden">
        {/* Decorative gradient orbs */}
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />

        <motion.div
          className="relative z-10 flex items-center gap-3"
          initial={{ opacity: 0, y: -14, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          <motion.img
            src="/logo-dark.png"
            alt="Trackio"
            className="h-[clamp(3.5rem,7vw,5rem)] object-contain"
            animate={{
              scale: [1, 1.05, 1],
              filter: [
                'drop-shadow(0 0 6px rgba(139,92,246,0.5))',
                'drop-shadow(0 0 22px rgba(37,99,235,0.75))',
                'drop-shadow(0 0 6px rgba(139,92,246,0.5))',
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>

        {/* Center copy */}
        <div className="relative z-10 space-y-6 mt-10">
          <h1 className="text-[clamp(1.75rem,3.2vw,2.25rem)] font-bold text-white leading-tight">
            Manage resources,<br />
            track costs,<br />
            <span className="text-primary-foreground/70 text-[clamp(1.375rem,2.4vw,1.875rem)]">deliver results.</span>
          </h1>
          <p className="text-white/60 text-[clamp(0.8125rem,1.1vw,1rem)] max-w-xs leading-relaxed">
            A unified platform for workforce planning, service PO tracking, and financial reporting across your organization.
          </p>
          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 pt-2">
            {['Timesheet Import', 'Service PO Tracking', 'Cost Analytics', 'Role-Based Access'].map((f) => (
              <span
                key={f}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[clamp(0.6875rem,0.85vw,0.75rem)] text-white/70"
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <p className="relative z-10 mt-auto text-[clamp(0.6875rem,0.85vw,0.75rem)] text-white/30">
          © {new Date().getFullYear()} GTT Data Solutions Ltd. All Rights Reserved.
        </p>
      </div>

      {/* Right panel — form. Desktop (`lg:`) resolves to exactly what it was before this mobile
          redesign: `flex flex-1 flex-col items-center justify-center bg-background px-6 py-12`,
          with a single plain `w-full max-w-sm` wrapper around the Outlet — every mobile-only
          piece below is either `lg:hidden` or has an `lg:` override that strips its mobile
          styling back to nothing, so desktop's rendered output doesn't change. Below `lg`, this
          is a full hero → floating card → footer stack (see the reference mock), not the old
          fade-then-form: the card's own rounded top corners now draw the boundary between the
          dark branding area and the light form area, so nothing here needs to fade to
          transparent by itself. No padding on this outer flex container on mobile — the hero,
          card, and footer each carry their own, so the hero/footer can run full-bleed
          edge-to-edge behind the card. */}
      <div className="relative flex flex-1 flex-col bg-background lg:items-center lg:justify-center lg:px-6 lg:py-12">
        {/* Mobile hero: dark navy (a subtle two-tone gradient for depth, not a fade-to-transparent
            — the card below draws the actual boundary), the existing logo asset (unmodified,
            static — no continuous pulse/glow loop, matching a clean non-flashy visual language),
            a short "Workforce Intelligence" label, and a one-line tagline.
            Padding here is deliberately tight (`pt-8 pb-8`, `mt-1.5`/`mt-2` between lines) — this
            whole hero → card → footer stack has to fit a real phone viewport height (minus
            browser chrome) without scrolling, not just look right in a tall screenshot, so every
            block in it is sized for that budget rather than for its own comfort in isolation.
            `pb-8` still gives the floating card's `-mt-8` (below) room to pull up without
            covering the tagline. `overflow-hidden` here is scoped to just this box (for the wave
            art), not the whole panel, so it can never clip the form beneath it on a short
            viewport. */}
        <div
          className="relative overflow-hidden px-6 pt-5 pb-5 lg:hidden"
          style={{ background: 'linear-gradient(160deg, hsl(224 46% 8%) 0%, hsl(228 42% 15%) 100%)' }}
        >
          <AuthHeroWaves tone="dark" className="absolute inset-x-0 bottom-0 h-40 w-full" />
          <motion.div
            className="relative z-10 flex flex-col items-center text-center"
            initial={{ opacity: 0, y: -14, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          >
            <img src="/logo-dark.png" alt="Trackio" className="h-[clamp(2.5rem,6vw,3rem)] object-contain" />
            <p className="mt-1.5 text-[clamp(0.625rem,1.8vw,0.6875rem)] font-semibold uppercase tracking-[0.2em] text-white/50">
              Workforce Intelligence
            </p>
            <p className="mt-2 text-[clamp(0.75rem,2vw,0.875rem)] text-white/70">
              Plan. Track. <span className="font-semibold text-primary">Deliver.</span>
            </p>
          </motion.div>
        </div>

        {/* Card — the one real Outlet, shared with desktop; only its wrapper's classes differ per
            breakpoint (a single Outlet render, never two, so route components like Login never
            mount twice). Mobile: full-bleed width, rounded top corners, pulled up over the hero
            above via `-mt-3` so those corners visibly cut across the dark background — the
            "floating card" look — without covering the tagline text above (measured: at `-mt-8`
            the card's top edge landed 12px INTO the tagline, clipping it; `-mt-3` clears it with
            an ~8px margin instead). Padding trimmed to `pt-4 pb-3` for the same no-scroll budget
            as the hero above. `lg:` neutralizes all of that back to the original plain
            `w-full max-w-sm` wrapper with no margin/radius/shadow/padding/background of its own. */}
        <div className="relative z-10 -mt-3 w-full rounded-t-[28px] bg-background px-5 pt-4 pb-3 shadow-[0_-12px_28px_-8px_rgba(15,23,42,0.12)] lg:mt-0 lg:max-w-sm lg:rounded-none lg:bg-transparent lg:px-0 lg:pt-0 lg:pb-0 lg:shadow-none">
          <Outlet />
        </div>

        {/* Mobile footer: light wave art + the same copyright line desktop already shows in its
            own left panel — without this, that line simply disappears for mobile users since the
            left panel is `hidden` below `lg`. Padding trimmed the same way; this line is the
            least important content on the page, so it gets the least room.
            `mt-auto` pins it to the bottom of this flex column instead of sitting right under the
            card with dead white space below it — on any viewport taller than the hero+card
            content, this footer now absorbs that leftover space by sliding down to the actual
            bottom of the screen rather than leaving a gap beneath it. */}
        <div className="relative mt-auto overflow-hidden bg-background px-6 pt-1 pb-2 text-center lg:hidden">
          <AuthHeroWaves tone="light" className="absolute inset-x-0 bottom-0 h-24 w-full" />
          <p className="relative z-10 text-[clamp(0.6875rem,1.8vw,0.75rem)] text-muted-foreground">
            © {new Date().getFullYear()} GTT Data Solutions Ltd. All Rights Reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;
