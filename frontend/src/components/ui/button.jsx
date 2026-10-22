import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/utils/cn';

// Every size below uses `clamp(min, Nvw, max)` instead of a fixed h-*/px-*/text-* so buttons
// across the whole app shrink smoothly as the viewport narrows (max reached only near a
// full-width desktop, min floor around a half-width laptop window) instead of holding full size
// until they no longer fit and force their row to wrap — see Dashboard.jsx's header row, which
// this scale was first tuned against, for the same min/max reasoning applied here app-wide.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-[clamp(0.3rem,0.5vw,0.5rem)] whitespace-nowrap rounded-lg text-[clamp(0.75rem,0.85vw,0.875rem)] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-[clamp(0.875rem,1vw,1rem)] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        success: 'bg-success text-white hover:bg-success/90 shadow-sm',
      },
      size: {
        default: 'h-[clamp(1.875rem,2vw,2.25rem)] px-[clamp(0.75rem,1vw,1rem)] py-[clamp(0.375rem,0.5vw,0.5rem)]',
        sm: 'h-[clamp(1.75rem,1.8vw,2rem)] rounded-md px-[clamp(0.5rem,0.7vw,0.75rem)] text-[clamp(0.6875rem,0.75vw,0.75rem)]',
        // Toolbar row action (Search/Filters/Export/Add/etc. on a Master or Report page header) —
        // shares the h-9/rounded-lg/text-sm of the Input it always sits next to, so the whole
        // row lands on one shared baseline instead of every page hand-tuning a `size="sm"` button
        // back up to h-9 with a lingering rounded-md/text-xs mismatch.
        toolbar: 'h-[clamp(1.875rem,2vw,2.25rem)] rounded-lg px-[clamp(0.5rem,0.7vw,0.75rem)] gap-[clamp(0.25rem,0.4vw,0.375rem)] text-[clamp(0.75rem,0.85vw,0.875rem)]',
        lg: 'h-[clamp(2rem,2.2vw,2.5rem)] rounded-lg px-[clamp(1rem,1.3vw,1.5rem)]',
        xl: 'h-[clamp(2.25rem,2.4vw,2.75rem)] rounded-lg px-[clamp(1.25rem,1.7vw,2rem)] text-[clamp(0.8125rem,0.9vw,1rem)]',
        icon: 'h-[clamp(1.875rem,2vw,2.25rem)] w-[clamp(1.875rem,2vw,2.25rem)]',
        'icon-sm': 'h-[clamp(1.5rem,1.6vw,1.75rem)] w-[clamp(1.5rem,1.6vw,1.75rem)]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const Button = forwardRef(({ className, variant, size, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(buttonVariants({ variant, size }), className)}
    {...props}
  />
));
Button.displayName = 'Button';

export { Button, buttonVariants };
