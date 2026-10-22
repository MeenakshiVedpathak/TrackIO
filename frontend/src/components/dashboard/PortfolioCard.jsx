import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

const PortfolioCard = ({ portfolio, isLoading }) => {
  if (isLoading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-36" /></CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  const { total_clients = 0, active_pos = 0, closed_pos = 0, total_pos = 0 } = portfolio ?? {};
  const closedPct = total_pos > 0 ? Math.round((closed_pos / total_pos) * 100) : 0;

  const rows = [
    { label: 'Total Clients', value: total_clients, badge: null },
    { label: 'Active Service POs', value: active_pos, badge: { label: 'Active', variant: 'success' } },
    { label: 'Closed Service POs', value: closed_pos, badge: { label: 'Closed', variant: 'secondary' } },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio Overview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between py-1.5 border-b last:border-0">
            <span className="text-sm text-muted-foreground">{row.label}</span>
            <div className="flex items-center gap-2">
              {row.badge && (
                <Badge variant={row.badge.variant} className="text-[10px]">{row.badge.label}</Badge>
              )}
              <span className="text-sm font-semibold tabular-nums">{row.value}</span>
            </div>
          </div>
        ))}

        {total_pos > 0 && (
          <div className="pt-1 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>PO closure rate</span>
              <span>{closedPct}%</span>
            </div>
            <Progress value={closedPct} className="h-1.5" />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PortfolioCard;
