import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

// The backend sends the whole batch in one request/response — there is no real per-email
// progress feed to subscribe to. To stop users from wondering whether anything is happening
// (the problem this modal exists to solve), we animate a counter up toward `total - 1` while
// the request is in flight, then snap straight to the real counts the response reports. The
// simulated count never reaches 100% on its own, so it can never claim a completion we haven't
// actually observed.
const AUTO_CLOSE_MS = 2200;

const BulkReminderProgressModal = ({ open, total, result, error, onClose }) => {
  const [tick, setTick] = useState(0);
  const intervalRef = useRef(null);
  const autoCloseRef = useRef(null);

  const isDone = !!result || !!error;

  useEffect(() => {
    if (!open) return undefined;
    if (isDone) return undefined;

    setTick(0);
    const capacity = Math.max(total - 1, 0);
    if (capacity === 0) return undefined;

    const stepMs = Math.min(400, Math.max(60, 3000 / total));
    intervalRef.current = setInterval(() => {
      setTick((t) => (t < capacity ? t + 1 : t));
    }, stepMs);
    return () => clearInterval(intervalRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, total, isDone]);

  useEffect(() => {
    if (!open || !result) return undefined;
    clearInterval(intervalRef.current);
    autoCloseRef.current = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => clearTimeout(autoCloseRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, result]);

  useEffect(() => {
    if (!open) {
      clearInterval(intervalRef.current);
      clearTimeout(autoCloseRef.current);
    }
  }, [open]);

  if (!open) return null;

  const sent = result?.sent?.length ?? 0;
  const skipped = result?.skipped?.length ?? 0;
  const failed = result?.failed?.length ?? 0;
  const current = isDone ? total : tick;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in-0 duration-150">
      <div className="w-full max-w-sm rounded-xl border bg-background p-6 shadow-dialog animate-in zoom-in-95 fade-in-0 duration-200">
        {!isDone && (
          <>
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-4 flex h-16 w-16 items-center justify-center">
                <span className="absolute inline-flex h-16 w-16 animate-ping rounded-full bg-primary/20" />
                <span className="absolute inline-flex h-11 w-11 animate-pulse rounded-full bg-primary/25" />
                <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                  <Bell className="h-5 w-5" />
                </span>
              </div>
              <h3 className="text-base font-semibold">Sending reminders&hellip;</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Please keep this open until it finishes.
              </p>
            </div>

            <div className="mt-5">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="font-medium tabular-nums text-foreground">{current} / {total} sent</span>
                <span className="tabular-nums text-muted-foreground">{pct}%</span>
              </div>
            </div>
          </>
        )}

        {isDone && error && (
          <div className="flex flex-col items-center text-center">
            <XCircle className="mb-3 h-12 w-12 text-destructive" />
            <h3 className="text-base font-semibold">Failed to send reminders</h3>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <Button className="mt-5 w-full" onClick={onClose}>Close</Button>
          </div>
        )}

        {isDone && !error && (
          <div className="flex flex-col items-center text-center">
            <CheckCircle2 className="mb-3 h-12 w-12 text-emerald-500 animate-in zoom-in-50 duration-300" />
            <h3 className="text-base font-semibold">Reminders sent</h3>
            <div className="mt-3 w-full space-y-1.5 rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Sent</span>
                <span className="font-semibold tabular-nums">{sent}</span>
              </div>
              {skipped > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Skipped</span>
                  <span className="font-semibold tabular-nums">{skipped}</span>
                </div>
              )}
              {failed > 0 && (
                <div className="flex items-center justify-between text-destructive">
                  <span>Failed</span>
                  <span className="font-semibold tabular-nums">{failed}</span>
                </div>
              )}
            </div>
            <Button className="mt-5 w-full" onClick={onClose}>Done</Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkReminderProgressModal;
