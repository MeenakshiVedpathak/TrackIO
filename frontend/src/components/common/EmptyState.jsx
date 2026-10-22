import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/button';
import { Inbox } from 'lucide-react';

const EmptyState = ({
  icon: Icon = Inbox,
  title = 'No results found',
  description,
  action,
  className,
}) => (
  <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
      <Icon className="h-7 w-7 text-muted-foreground" />
    </div>
    <h3 className="mb-1 text-sm font-semibold">{title}</h3>
    {description && <p className="mb-6 max-w-xs text-sm text-muted-foreground">{description}</p>}
    {action && (
      <Button
        size="sm"
        onClick={action.onClick}
        variant={action.variant ?? 'default'}
        disabled={action.disabled}
        title={action.title}
      >
        {action.icon && <action.icon className="mr-1.5 h-4 w-4" />}
        {action.label}
      </Button>
    )}
  </div>
);

export default EmptyState;
