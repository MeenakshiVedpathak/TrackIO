import { Badge } from '@/components/ui/badge';
import { getStatusColor } from '@/utils/formatters';
import { capitalize } from '@/utils/formatters';

const STATUS_VARIANT_MAP = {
  success: 'success',
  destructive: 'destructive',
  secondary: 'secondary',
  warning: 'warning',
  info: 'info',
};

const StatusBadge = ({ status, label, className }) => {
  const color = getStatusColor(status);
  const variant = STATUS_VARIANT_MAP[color] ?? 'secondary';

  return (
    <Badge variant={variant} className={className}>
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {label ?? capitalize(status ?? '')}
    </Badge>
  );
};

export default StatusBadge;
