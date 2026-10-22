import { forwardRef } from 'react';
import { cn } from '@/utils/cn';

const Input = forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      // Fluid clamp() sizing (see button.jsx's own comment) so every Input app-wide shrinks
      // smoothly with the viewport instead of holding a fixed h-9/text-sm forever.
      'flex h-[clamp(1.875rem,2vw,2.25rem)] w-full rounded-lg border border-input bg-transparent px-[clamp(0.5rem,0.7vw,0.75rem)] py-1 text-[clamp(0.75rem,0.85vw,0.875rem)] shadow-sm',
      'transition-colors file:border-0 file:bg-transparent file:text-[clamp(0.75rem,0.85vw,0.875rem)] file:font-medium',
      'placeholder:text-muted-foreground',
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
      'disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
