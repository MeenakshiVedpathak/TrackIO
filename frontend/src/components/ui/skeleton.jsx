import { cn } from '@/utils/cn';

const Skeleton = ({ className, ...props }) => (
  <div
    className={cn('animate-pulse rounded-md bg-muted', className)}
    {...props}
  />
);

export { Skeleton };
