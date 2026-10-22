import { forwardRef } from 'react';
import { cn } from '@/utils/cn';

const Card = forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('rounded-xl border bg-card text-card-foreground shadow-card', className)}
    {...props}
  />
));
Card.displayName = 'Card';

// Fluid clamp() sizing (see ui/button.jsx's own comment) instead of a fixed p-5/text-base/text-sm,
// so every Card app-wide shrinks smoothly with the viewport like the rest of the app now does.
const CardHeader = forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col space-y-1.5 p-[clamp(0.875rem,1.4vw,1.25rem)]', className)} {...props} />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = forwardRef(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn('text-[clamp(0.875rem,1vw,1rem)] font-semibold leading-none tracking-tight', className)} {...props} />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-[clamp(0.75rem,0.85vw,0.875rem)] text-muted-foreground', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-[clamp(0.875rem,1.4vw,1.25rem)] pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center p-[clamp(0.875rem,1.4vw,1.25rem)] pt-0', className)} {...props} />
));
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
