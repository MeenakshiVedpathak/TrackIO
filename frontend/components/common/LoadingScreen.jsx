import { cn } from '@/utils/cn';

const LoadingScreen = ({ className }) => (
  <div className={cn('flex h-screen w-full items-center justify-center bg-background', className)}>
    <div className="flex flex-col items-center gap-4">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      <p className="text-sm text-muted-foreground animate-pulse">Loading…</p>
    </div>
  </div>
);

export default LoadingScreen;
