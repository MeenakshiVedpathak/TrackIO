import { Loader2 } from "lucide-react"
import { cn } from "@/utils/cn"

// Under prefers-reduced-motion the spin slows down rather than stopping — a frozen spinner reads
// as a hung UI, which is worse than a gentle rotation.
export function Spinner({ className }) {
  return (
    <Loader2
      aria-hidden="true"
      className={cn("h-4 w-4 animate-spin text-primary motion-reduce:[animation-duration:1.5s]", className)}
    />
  )
}

// Fades in after a short delay so a near-instant load (cached chunk, warm query) finishes before
// the loader is ever visible, instead of flashing a spinner for a single frame.
export const DELAYED_REVEAL = "animate-in fade-in fill-mode-both duration-300 delay-200"

// Centered spinner + label — for a panel, table body, or route's content area that has nothing to
// show yet. Sized by its parent (`className` sets height/padding).
export function LoadingBlock({ label = "Loading…", className }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex w-full flex-col items-center justify-center gap-2 py-6 text-sm text-muted-foreground",
        DELAYED_REVEAL,
        className
      )}
    >
      <Spinner className="h-6 w-6" />
      <span>{label}</span>
    </div>
  )
}
