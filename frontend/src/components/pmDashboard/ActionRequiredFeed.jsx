import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarOff, ClipboardCheck, AlertTriangle, BatteryCharging, Armchair, Inbox,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/common/EmptyState';
import ListPagination from './ListPagination';
import { formatDate, formatHours, formatPercentage } from '@/utils/formatters';
import { cn } from '@/utils/cn';

const ICON_STYLES = {
  destructive: 'bg-red-50 text-red-500 dark:bg-red-950/40 dark:text-red-400',
  warning: 'bg-amber-50 text-amber-500 dark:bg-amber-950/40 dark:text-amber-400',
};

const DEFAULT_PAGE_SIZE = 5;

// One row shape shared by every category below — icon + title/subtitle + a right-aligned badge,
// optionally a link (external route) or a click (in-page scroll to the section that has the full
// table for this row's category). Same rounded-xl/hover-lift language PmKpiCard's segments use, so
// the feed reads as part of the same redesigned dashboard rather than an older, plainer list.
const FeedRow = ({ icon: Icon, tone, title, subtitle, badge, badgeVariant, to, onClick }) => {
  const content = (
    <div className="group flex items-center gap-3.5 rounded-xl border border-border bg-card px-4 py-3 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', ICON_STYLES[tone])}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        <p className="truncate text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      {badge && <Badge variant={badgeVariant} className="shrink-0">{badge}</Badge>}
    </div>
  );

  if (to) return <Link to={to} className="block">{content}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className="block w-full text-left">{content}</button>;
  return content;
};

// Section 5 — Action Required: every row from GET /pm-dashboard/action-required's five lists,
// concatenated into one feed in the spec's priority order (missing work logs + pending approvals
// first, then at-risk projects, then capacity issues) rather than five separate tabbed/accordioned
// sub-sections — this is "what needs my attention today", meant to be scanned as one list, above
// the fold. Paginated client-side (limit/page below) since the whole feed is already in memory
// from one response — no extra request needed to page through it, same reasoning DataTable's own
// callers rely on. Shares its pagination + "Rows per page" footer with ProjectHealthList via
// ListPagination, so both plain-list sections match the real tables' pager exactly.
const ActionRequiredFeed = ({ data, isPending, workLogComplianceRoute, timesheetApprovalRoute, onScrollToProjects, onScrollToTeam }) => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);

  const rows = useMemo(() => {
    const missingWorkLogs = data?.missing_work_logs ?? [];
    const pendingApprovals = data?.pending_approvals ?? [];
    const atRiskProjects = data?.at_risk_projects ?? [];
    const overallocated = data?.overallocated_employees ?? [];
    const bench = data?.bench_employees ?? [];

    return [
      ...missingWorkLogs.map((r) => ({
        key: `mwl-${r.employee_id}`,
        icon: CalendarOff,
        tone: 'destructive',
        title: `${r.employee_name} (${r.employee_code})`,
        subtitle: `${r.business_unit ?? '—'} · Logged ${formatHours(r.logged_hours)} of ${formatHours(r.required_hours)} required`,
        badge: `Short ${formatHours(r.shortfall_hours)}`,
        badgeVariant: 'destructive',
        to: workLogComplianceRoute,
      })),
      ...pendingApprovals.map((r) => ({
        key: `pa-${r.work_log_id}`,
        icon: ClipboardCheck,
        tone: 'warning',
        title: `${r.full_name} (${r.employee_code})`,
        subtitle: `${r.service_po_name} · ${formatDate(r.work_date)} · ${r.log_type}`,
        badge: `${formatHours(r.hours)} pending`,
        badgeVariant: 'warning',
        to: timesheetApprovalRoute,
      })),
      ...atRiskProjects.map((r) => ({
        key: `arp-${r.project_id}`,
        icon: AlertTriangle,
        tone: 'destructive',
        title: r.project_name,
        subtitle: `${r.client_name ?? '—'} · Deadline ${formatDate(r.nearest_end_date)}`,
        badge: r.overdue_po_count > 0 ? `${r.overdue_po_count} overdue PO${r.overdue_po_count > 1 ? 's' : ''}` : formatPercentage(r.variance_pct),
        badgeVariant: 'destructive',
        onClick: onScrollToProjects,
      })),
      ...overallocated.map((r) => ({
        key: `oa-${r.employee_id}`,
        icon: BatteryCharging,
        tone: 'destructive',
        title: `${r.full_name} (${r.employee_code})`,
        subtitle: 'Overallocated this period',
        badge: `${formatPercentage(r.capacity_used_pct)} used`,
        badgeVariant: 'destructive',
        onClick: onScrollToTeam,
      })),
      ...bench.map((r) => ({
        key: `bn-${r.employee_id}`,
        icon: Armchair,
        tone: 'warning',
        title: `${r.full_name} (${r.employee_code})`,
        subtitle: 'On bench this period',
        badge: `${formatPercentage(r.capacity_used_pct)} used`,
        badgeVariant: 'warning',
        onClick: onScrollToTeam,
      })),
    ];
  }, [data, workLogComplianceRoute, timesheetApprovalRoute, onScrollToProjects, onScrollToTeam]);

  const totalPages = Math.max(1, Math.ceil(rows.length / limit));
  // Clamped inline rather than via an effect — if a filter change shrinks the feed (or a bigger
  // page size does the same to the page count) while sitting on a later page, this falls back to
  // the last valid page on the very next render instead of showing a blank page.
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * limit, safePage * limit);

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Nothing needs your attention"
        description="No missing work logs, pending approvals, at-risk projects, or capacity issues this period."
      />
    );
  }

  return (
    <div>
      {/* Second safety net beyond pagination itself — a page's rows wrapping onto extra lines on
          a narrow screen scrolls within this box instead of pushing the section taller. */}
      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {pageRows.map((row) => <FeedRow key={row.key} {...row} />)}
      </div>

      <ListPagination
        page={safePage}
        limit={limit}
        total={rows.length}
        onPageChange={(p) => setPage(Math.max(1, Math.min(totalPages, p)))}
        onPageSizeChange={(l) => { setLimit(l); setPage(1); }}
      />
    </div>
  );
};

export default ActionRequiredFeed;
