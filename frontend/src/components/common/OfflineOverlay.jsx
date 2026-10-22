import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { WifiOff, CheckCircle2, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import useNetworkStatus from '@/hooks/useNetworkStatus';

/* ─── Pulsing ring behind the icon ─────────────────────────────────── */
const Ring = ({ delay, reduced }) =>
  reduced ? null : (
    <motion.span
      className="absolute inset-0 rounded-full border-2 border-primary/20"
      animate={{ scale: [1, 1.8], opacity: [0.5, 0] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut', delay }}
    />
  );

/* ─── "Connection restored" top banner ─────────────────────────────── */
const RestoredBanner = ({ reduced }) => (
  <motion.div
    role="status"
    aria-live="polite"
    className="fixed top-4 left-1/2 z-[10000] -translate-x-1/2 pointer-events-none"
    initial={reduced ? false : { opacity: 0, y: -20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={reduced ? undefined : { opacity: 0, y: -20 }}
    transition={{ duration: 0.3, ease: 'easeOut' }}
  >
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-2.5 shadow-elevated">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-[hsl(var(--success))]" />
      <span className="text-sm font-medium text-card-foreground">Connection restored</span>
    </div>
  </motion.div>
);

/* ─── Full-screen offline overlay ──────────────────────────────────── */
const OfflineScreen = ({ reduced, onRetry }) => (
  <motion.div
    role="alert"
    aria-live="assertive"
    aria-label="No internet connection"
    className="fixed inset-0 z-[9999] flex items-center justify-center bg-background"
    initial={reduced ? false : { opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={reduced ? undefined : { opacity: 0 }}
    transition={{ duration: 0.2 }}
  >
    <motion.div
      className="flex flex-col items-center gap-6 px-6 text-center max-w-sm"
      initial={reduced ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.1, ease: 'easeOut' }}
    >
      {/* Icon + rings */}
      <div className="relative flex h-28 w-28 items-center justify-center">
        <Ring delay={0}    reduced={reduced} />
        <Ring delay={0.75} reduced={reduced} />

        <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-primary/8 shadow-card">
          {reduced ? (
            <WifiOff className="h-9 w-9 text-primary" />
          ) : (
            <motion.div
              animate={{ rotate: [0, -10, 10, -6, 6, 0] }}
              transition={{ duration: 0.55, delay: 0.45, ease: 'easeInOut' }}
            >
              <WifiOff className="h-9 w-9 text-primary" />
            </motion.div>
          )}
        </div>
      </div>

      {/* Heading + body */}
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          You're Disconnected
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          No internet connection found. Check your Wi-Fi or mobile data
          and we'll reconnect automatically.
        </p>
      </div>

      {/* Retry button */}
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-soft transition-colors hover:bg-muted active:scale-95"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </button>

      {/* Live blinking status dot */}
      <div className="flex items-center gap-2">
        {reduced ? (
          <span className="h-2 w-2 rounded-full bg-destructive" />
        ) : (
          <motion.span
            className="h-2 w-2 rounded-full bg-destructive"
            animate={{ opacity: [1, 0.25, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
        <span className="text-xs font-medium text-muted-foreground">Offline</span>
      </div>
    </motion.div>
  </motion.div>
);

/* ─── Root — mounted once in main.jsx inside ThemeProvider ─────────── */
const OfflineOverlay = () => {
  const { isOnline } = useNetworkStatus();
  const [showRestored, setShowRestored] = useState(false);
  const wasOfflineRef = useRef(false);
  const reduced = useReducedMotion();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
    } else if (wasOfflineRef.current) {
      wasOfflineRef.current = false;
      // Refetch all failed/stale queries the moment we're back online.
      queryClient.invalidateQueries();
      setShowRestored(true);
      const t = setTimeout(() => setShowRestored(false), 2500);
      return () => clearTimeout(t);
    }
  }, [isOnline, queryClient]);

  const handleRetry = () => {
    // Browser already fires the 'online' event when connection returns;
    // this button is for UX confidence — manually attempt a reconnect check.
    if (navigator.onLine) {
      queryClient.invalidateQueries();
    }
  };

  return (
    <>
      <AnimatePresence>
        {!isOnline && (
          <OfflineScreen key="offline" reduced={!!reduced} onRetry={handleRetry} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRestored && <RestoredBanner key="restored" reduced={!!reduced} />}
      </AnimatePresence>
    </>
  );
};

export default OfflineOverlay;
