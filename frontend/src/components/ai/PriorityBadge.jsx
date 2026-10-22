import { Badge } from '@/components/ui/badge';

// Same critical|warning|info vocabulary the /api/v1/ai/query answer.priority field uses.
const PRIORITY_VARIANT = { critical: 'destructive', warning: 'warning', info: 'info' };

const PriorityBadge = ({ priority, className }) =>
  priority ? (
    <Badge variant={PRIORITY_VARIANT[priority] ?? 'muted'} className={`capitalize ${className ?? ''}`}>
      {priority}
    </Badge>
  ) : null;

export default PriorityBadge;
