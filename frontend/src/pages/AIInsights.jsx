import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Sparkles, ArrowLeft, RefreshCw, AlertCircle, AlertTriangle, Calendar,
  Info, CheckCircle2, Users, Building2, Play, Filter, ChevronDown, FileText, Lightbulb, Hourglass,
  ArrowUpDown, List, LayoutGrid, ExternalLink, ArrowRight, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { HierarchicalBuSelector, dedupeBusinessUnitIds } from '@/components/common/HierarchicalBuSelector';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import FilterPanel from '@/components/common/FilterPanel';
import SearchInput from '@/components/common/SearchInput';
import { useAIInsights, useRunAllAIInsights } from '@/hooks/useAIInsights';
import { useCompanies } from '@/hooks/useCompanies';
import { useAuth } from '@/hooks/useAuth';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { ROLE_NAMES } from '@/constants/roleHierarchy';
import { ROUTES, buildPath } from '@/constants/routes';
import { formatDateTime } from '@/utils/formatters';
import { cn } from '@/utils/cn';

/* Fluid clamp() text sizes — same scale the rest of the app uses, so this page shrinks with the viewport. */
const TXT = 'text-[clamp(0.6875rem,0.8vw,0.8125rem)]';
const TXT_XS = 'text-[clamp(0.5625rem,0.68vw,0.6875rem)]';
const CTRL_H = 'h-[clamp(1.625rem,1.75vw,2rem)]';
/* Toolbar row (tabs, search, sort, view toggle): one step smaller so the whole row fits on a single line at 125% zoom. */
const TOOL_TXT = 'text-[clamp(0.625rem,0.72vw,0.8125rem)]';
/* Fluid icon / icon-button sizes and chip padding, so nothing on this page stays at a fixed px size. */
const ICON_MD = 'h-[clamp(0.875rem,1.1vw,1rem)] w-[clamp(0.875rem,1.1vw,1rem)]';
const ICON_SM = 'h-[clamp(0.75rem,0.95vw,0.875rem)] w-[clamp(0.75rem,0.95vw,0.875rem)]';
const ICON_LG = 'h-[clamp(1.125rem,1.7vw,1.5rem)] w-[clamp(1.125rem,1.7vw,1.5rem)]';
const ICON_BTN = 'h-[clamp(1.5rem,1.8vw,1.75rem)] w-[clamp(1.5rem,1.8vw,1.75rem)]';

// Monthly reports (job_key bu_* / tenant_*) are labelled by the `title` the API sends — no job_key
// list is hard-coded here. Only the event-driven staffing suggestion is special-cased.
const STAFFING_KEY = 'new_po_staffing_suggestion';
// Run analysis is hidden for now; flip to true to bring the button back.
const SHOW_RUN_ANALYSIS = false;

/* Severity → look. Priority is DERIVED from severity (the backend sends no priority field):
   critical = High, warning = Medium, info = Low. */
const SEVERITY = {
  critical: { label: 'Critical', priority: 'High',   bars: 3, bar: 'border-l-red-500',     icon: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400',             badge: 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900',             barFill: 'bg-red-500',     dot: 'bg-red-500' },
  warning:  { label: 'Warning',  priority: 'Medium', bars: 2, bar: 'border-l-amber-500',   icon: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',     badge: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900', barFill: 'bg-amber-500',   dot: 'bg-amber-500' },
  info:     { label: 'Info',     priority: 'Low',    bars: 1, bar: 'border-l-sky-500',     icon: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400',             badge: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900',             barFill: 'bg-sky-500',     dot: 'bg-sky-500' },
  success:  { label: 'Positive', priority: 'Low',    bars: 1, bar: 'border-l-emerald-500', icon: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900', barFill: 'bg-emerald-500', dot: 'bg-emerald-500' },
};
/* pending_sync reports carry no severity look — a muted, neutral card instead. */
const PENDING_LOOK = {
  label: 'Waiting for sync', bar: 'border-l-muted-foreground/30', icon: 'bg-muted text-muted-foreground',
  badge: 'bg-muted text-muted-foreground ring-border', dot: 'bg-muted-foreground/40',
};
const SEVERITY_RANK = { critical: 0, warning: 1, info: 2, success: 3 };
const PRIORITY_SEVERITIES = ['critical', 'warning']; // expanded by default

const SUMMARY_TILES = [
  { key: 'critical', label: 'Critical',    hint: 'High priority issues', icon: AlertCircle,   wrap: 'bg-red-50/70 border-red-100 dark:bg-red-950/20 dark:border-red-900/40',             iconBg: 'bg-red-500',     count: 'text-red-600 dark:text-red-400',         ring: 'ring-red-400' },
  { key: 'warning',  label: 'Warnings',    hint: 'Needs attention',      icon: AlertTriangle, wrap: 'bg-amber-50/70 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/40',     iconBg: 'bg-amber-500',   count: 'text-amber-600 dark:text-amber-400',     ring: 'ring-amber-400' },
  { key: 'info',     label: 'Information', hint: 'FYI and updates',      icon: Info,          wrap: 'bg-sky-50/70 border-sky-100 dark:bg-sky-950/20 dark:border-sky-900/40',             iconBg: 'bg-sky-500',     count: 'text-sky-600 dark:text-sky-400',         ring: 'ring-sky-400' },
  { key: 'success',  label: 'Positive',    hint: 'Good status',          icon: CheckCircle2,  wrap: 'bg-emerald-50/70 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/40', iconBg: 'bg-emerald-500', count: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-400' },
];

const SORTS = [
  { value: 'priority', label: 'Priority', heading: 'Priority insights' },
  { value: 'newest',   label: 'Newest',   heading: 'Latest insights' },
  { value: 'oldest',   label: 'Oldest',   heading: 'Oldest insights' },
];

const ts = (i) => new Date(i.generated_at).getTime() || 0;

// "YYYY-MM" (local time) of an ISO timestamp — fallback month for old/event insights with no period_month.
const monthKey = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
// The month a report is ABOUT (period_month 'YYYY-MM-01'), never when it was generated.
const periodKey = (i) => (i.period_month ? String(i.period_month).slice(0, 7) : monthKey(i.generated_at));
const monthLabel = (key) => (key
  ? new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  : 'Other');

const isPendingSync = (i) => i.report_state === 'pending_sync';
const isCompanyWide = (i) => i.scope_type === 'tenant';
const rankOf = (i) => (isPendingSync(i) ? 9 : (SEVERITY_RANK[i.severity] ?? 8));
const COMPARATORS = {
  priority: (a, b) => rankOf(a) - rankOf(b) || ts(b) - ts(a),
  newest: (a, b) => ts(b) - ts(a),
  oldest: (a, b) => ts(a) - ts(b),
};

const COMPANY_OVERVIEW = 'Company overview';
const ALL_BUS_LABEL = 'All Business Units';
// Section inside a month: tenant reports → "Company overview"; BU reports → bu_name / sub_bu_name.
const sectionOf = (i) => {
  if (i.scope_type === 'tenant') return { key: 'tenant', label: COMPANY_OVERVIEW, order: 0 };
  const label = i.bu_name ? (i.sub_bu_name ? `${i.bu_name} / ${i.sub_bu_name}` : i.bu_name) : (i.company_name ?? 'Other');
  return { key: `bu:${label}`, label, order: 1 };
};

// months newest-first; inside a month Company overview first, then BUs A→Z. Items keep the incoming (sorted) order.
const groupByMonth = (list) => {
  const months = new Map();
  list.forEach((i) => {
    const mk = periodKey(i) ?? 'other';
    if (!months.has(mk)) months.set(mk, new Map());
    const sec = sectionOf(i);
    const secs = months.get(mk);
    if (!secs.has(sec.key)) secs.set(sec.key, { ...sec, items: [] });
    secs.get(sec.key).items.push(i);
  });
  return [...months.entries()]
    .sort(([a], [b]) => (a === 'other') - (b === 'other') || b.localeCompare(a))
    .map(([mk, secs]) => ({
      key: mk,
      label: monthLabel(mk === 'other' ? null : mk),
      count: [...secs.values()].reduce((n, x) => n + x.items.length, 0),
      sections: [...secs.values()].sort((x, y) => x.order - y.order || x.label.localeCompare(y.label)),
    }));
};

/* pulsing "live" dot — signals freshly generated / unread content */
const LiveDot = ({ className }) => (
  <span className={cn('relative flex h-1.5 w-1.5 shrink-0', className)}>
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
  </span>
);

/* 3-bar priority glyph, filled according to the derived priority */
const PriorityBars = ({ severity }) => {
  const s = SEVERITY[severity] ?? SEVERITY.info;
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground', TXT_XS)} title={`${s.priority} priority (derived from severity)`}>
      <span className="inline-flex items-end gap-[2px]" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className={cn('w-[3px] rounded-sm', n <= s.bars ? s.barFill : 'bg-muted-foreground/25')} style={{ height: 4 + n * 3 }} />
        ))}
      </span>
      {s.priority} priority
    </span>
  );
};

/* Summary chip, same look as the Reports summary chips: tinted pill, coloured "Label value".
   Still a button — it toggles the severity filter. */
const KpiCard = ({ tile, count, active, loading, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    title={tile.hint}
    aria-label={`${tile.label}: ${count}. Click to ${active ? 'clear' : 'apply'} filter`}
    className={cn(
      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-[clamp(0.625rem,1vw,0.875rem)] py-[clamp(0.25rem,0.45vw,0.375rem)] transition-all duration-200 hover:-translate-y-px hover:shadow-sm motion-reduce:transition-none motion-reduce:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      tile.wrap,
      tile.count,
      TXT,
      active && `ring-2 ${tile.ring}`,
    )}
  >
    <span className="font-medium">{tile.label}</span>
    <span className="font-bold tabular-nums">
      {loading ? <span className="inline-block h-[1em] w-[1.25em] animate-pulse rounded bg-current/20 align-middle motion-reduce:animate-none" /> : count}
    </span>
  </button>
);

/* Key findings + Recommended actions — only what the backend sent, in the order it sent it. */
const InsightDetails = ({ id, findings, actions, viewHref }) => {
  const hasFindings = findings?.length > 0;
  const hasActions = actions?.length > 0;
  if (!hasFindings && !hasActions && !viewHref) return null;
  return (
    <div id={`insight-details-${id}`} className={cn('grid gap-[clamp(0.375rem,0.7vw,0.5rem)] pt-[clamp(0.375rem,0.7vw,0.5rem)]', hasFindings && hasActions ? 'md:grid-cols-2' : 'grid-cols-1')}>
      {hasFindings && (
        <section className="rounded-lg border bg-muted/30 p-[clamp(0.5rem,0.9vw,0.75rem)]" aria-label="Key findings">
          <h4 className={cn('mb-1.5 flex items-center gap-1.5 font-semibold text-foreground', TXT)}>
            <FileText className="h-[1.1em] w-[1.1em] text-primary" /> Key findings <span className="font-normal text-muted-foreground">({findings.length})</span>
          </h4>
          <ul className="space-y-1.5">
            {findings.map((text, i) => (
              <li key={i} className={cn('flex items-start gap-2 leading-snug text-foreground/80', TXT)}>
                <span className="mt-[0.45em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {(hasActions || viewHref) && (
        <section className="rounded-lg border bg-muted/30 p-[clamp(0.5rem,0.9vw,0.75rem)]" aria-label="Recommended actions">
          <h4 className={cn('mb-1.5 flex items-center gap-1.5 font-semibold text-foreground', TXT)}>
            <Lightbulb className="h-[1.1em] w-[1.1em] text-primary" /> Recommended actions
            {hasActions && <span className="font-normal text-muted-foreground">({actions.length})</span>}
          </h4>
          {hasActions && (
            <ul className="space-y-1.5">
              {actions.map((text, i) => (
                <li key={i} className={cn('flex items-start gap-2 leading-snug text-foreground/80', TXT)}>
                  <span className="mt-[0.1em] flex h-[1.3em] w-[1.3em] shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white" aria-hidden="true">
                    <Check className="h-[0.8em] w-[0.8em]" />
                  </span>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          )}
          {viewHref && (
            <Link
              to={viewHref}
              className={cn('mt-[clamp(0.375rem,0.8vw,0.625rem)] inline-flex items-center gap-[clamp(0.25rem,0.4vw,0.375rem)] rounded-lg bg-primary px-[clamp(0.5rem,0.9vw,0.75rem)] py-[clamp(0.25rem,0.5vw,0.375rem)] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', TXT)}
            >
              <ExternalLink className="h-[1.1em] w-[1.1em]" /> View recommendation <ArrowRight className="h-[1.1em] w-[1.1em]" />
            </Link>
          )}
        </section>
      )}
    </div>
  );
};

const pendingNames = (sync) => (sync?.pending ?? []).map((u) => u?.name).filter(Boolean);

/* Scope, audience, the month the report is ABOUT and (complete) the sync chip. */
const MetaChips = ({ insight }) => {
  const { scope_type, bu_name, sub_bu_name, company_name, audience_roles, report_state, sync_status } = insight;
  const buLabel = scope_type === 'tenant'
    ? ALL_BUS_LABEL
    : (bu_name ? (sub_bu_name ? `${bu_name} / ${sub_bu_name}` : bu_name) : company_name);
  const pk = periodKey(insight);
  return (
    <>
      {buLabel && (
        <span
          className={cn('inline-flex items-center gap-1 rounded-md bg-primary/10 px-[clamp(0.25rem,0.5vw,0.375rem)] py-[clamp(0.0625rem,0.2vw,0.125rem)] font-semibold text-primary', TXT_XS)}
          title={scope_type === 'tenant' ? 'Covers every Business Unit' : sub_bu_name ? `Business Unit / Sub-BU: ${buLabel}` : `Business Unit: ${buLabel}`}
        >
          <Building2 className="h-[1.1em] w-[1.1em]" /> {buLabel}
        </span>
      )}
      {(audience_roles ?? []).map((role) => (
        <span key={role} className={cn('rounded-md bg-muted px-[clamp(0.25rem,0.5vw,0.375rem)] py-[clamp(0.0625rem,0.2vw,0.125rem)] font-semibold text-muted-foreground', TXT_XS)}>{role}</span>
      ))}
      {pk && (
        <span className={cn('inline-flex items-center gap-1 text-muted-foreground', TXT_XS)} title={`Report for ${monthLabel(pk)} · updated ${formatDateTime(insight.generated_at)}`}>
          <Calendar className="h-[1.1em] w-[1.1em]" /> {monthLabel(pk)}
        </span>
      )}
      {report_state === 'complete' && sync_status?.total_count > 0 && (
        <span className={cn('inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0 font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900', TXT_XS)}>
          <CheckCircle2 className="h-[1em] w-[1em]" /> All {sync_status.total_count} synced
        </span>
      )}
    </>
  );
};

/* report_state = pending_sync: muted placeholder — no severity colour, no findings/actions sections, no AI badge. */
const PendingSyncCard = ({ insight }) => {
  const { id, title, summary, findings, sync_status } = insight;
  const names = pendingNames(sync_status);
  return (
    <article className="rounded-xl border border-dashed border-l-[3px] border-l-muted-foreground/30 bg-muted/30 shadow-sm">
      <div className="flex items-start gap-[clamp(0.5rem,0.9vw,0.75rem)] px-[clamp(0.625rem,1vw,0.875rem)] py-[clamp(0.5rem,0.9vw,0.75rem)]">
        <span className={cn('flex h-[clamp(1.875rem,2.3vw,2.375rem)] w-[clamp(1.875rem,2.3vw,2.375rem)] shrink-0 items-center justify-center rounded-lg text-[clamp(0.875rem,1.1vw,1.125rem)]', PENDING_LOOK.icon)}>
          <Hourglass className="h-[1em] w-[1em]" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="font-bold text-muted-foreground text-[clamp(0.75rem,0.92vw,0.9375rem)]">{title}</span>
            <span className={cn('inline-flex items-center rounded-full px-2 py-0 font-semibold ring-1 ring-inset', TXT_XS, PENDING_LOOK.badge)}>{PENDING_LOOK.label}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5"><MetaChips insight={insight} /></div>
          {summary && <p className={cn('leading-snug text-muted-foreground', TXT)}>{summary}</p>}
          {(findings ?? []).map((text, i) => (
            <p key={`${id}-f${i}`} className={cn('leading-snug text-muted-foreground', TXT)}>{text}</p>
          ))}
          {names.length > 0 && (
            <p className={cn('leading-snug text-muted-foreground', TXT)}>
              <span className="font-semibold text-foreground/70">Waiting for:</span> {names.join(', ')}
            </p>
          )}
        </div>
      </div>
    </article>
  );
};

/* report_state = partial: banner with the synced count; the units still pending expand underneath. */
const PartialBanner = ({ id, sync }) => {
  const [open, setOpen] = useState(false);
  const names = pendingNames(sync);
  const label = sync ? `Partial data — ${sync.synced_count} of ${sync.total_count} synced` : 'Partial data';
  return (
    <div className="rounded-t-xl border-b border-amber-200 bg-amber-50 px-[clamp(0.625rem,1vw,0.875rem)] py-[clamp(0.25rem,0.5vw,0.375rem)] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={names.length === 0}
        aria-expanded={names.length > 0 ? open : undefined}
        aria-controls={names.length > 0 ? `insight-pending-${id}` : undefined}
        className={cn('flex w-full items-center gap-1.5 text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default', TXT)}
      >
        <AlertTriangle className="h-[1.1em] w-[1.1em] shrink-0" /> <span className="flex-1">{label}</span>
        {names.length > 0 && <ChevronDown className={cn('h-[1.1em] w-[1.1em] shrink-0 transition-transform', open && 'rotate-180')} />}
      </button>
      {open && names.length > 0 && (
        <p id={`insight-pending-${id}`} className={cn('pt-1 font-normal', TXT)}>Waiting for: {names.join(', ')}</p>
      )}
    </div>
  );
};

const InsightItem = ({ insight, compact, expanded, onToggle, reduceMotion }) => {
  if (isPendingSync(insight)) return <PendingSyncCard insight={insight} />;
  const {
    id, job_key, title, severity, summary, findings: rawFindings, actions, is_read,
    scope_type, report_state, sync_status, reference_id,
  } = insight;
  const s = SEVERITY[severity] ?? SEVERITY.info;
  const isPartial = report_state === 'partial';
  const isStaffing = job_key === STAFFING_KEY;
  const CategoryIcon = isStaffing ? Users : (scope_type ? Calendar : Sparkles);
  // Only the staffing suggestion points at a record (its Service PO) — never invent a link for the others.
  const viewHref = isStaffing && reference_id ? buildPath(ROUTES.SERVICE_PO_DETAIL, { id: reference_id }) : null;
  // A partial report's first finding is the "Partial data …" sentence — it lives in the banner, not twice.
  const findings = isPartial ? (rawFindings ?? []).slice(1) : rawFindings;
  const findingsCount = findings?.length ?? 0;
  const actionsCount = actions?.length ?? 0;
  const hasDetails = findingsCount > 0 || actionsCount > 0 || !!viewHref;
  const pk = periodKey(insight);

  const chips = <MetaChips insight={insight} />;

  const titleBlock = (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
      {!is_read && <LiveDot />}
      <span className={cn('font-bold text-foreground text-[clamp(0.75rem,0.92vw,0.9375rem)]', compact && 'truncate')}>{title}</span>
      <span className={cn('inline-flex items-center rounded-full px-2 py-0 font-semibold ring-1 ring-inset', TXT_XS, s.badge)}>{s.label}</span>
      {isStaffing && (
        <span className={cn('inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0 font-semibold text-violet-700 ring-1 ring-inset ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900', TXT_XS)}>
          <Sparkles className="h-[1em] w-[1em]" /> AI recommendation
        </span>
      )}
    </span>
  );

  const toggle = (
    <button
      type="button"
      onClick={() => onToggle(id)}
      aria-expanded={expanded}
      aria-controls={hasDetails ? `insight-details-${id}` : undefined}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${title}`}
      className={cn('flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', ICON_BTN)}
    >
      <ChevronDown className={cn(ICON_MD, 'transition-transform', expanded && 'rotate-180', reduceMotion && 'transition-none')} />
    </button>
  );

  return (
    <article className={cn('rounded-xl border border-l-[3px] bg-card shadow-sm transition-shadow hover:shadow-md', s.bar)}>
      {isPartial && <PartialBanner id={id} sync={sync_status} />}
      {compact ? (
        <div className="flex items-center gap-[clamp(0.375rem,0.8vw,0.625rem)] px-[clamp(0.5rem,0.9vw,0.75rem)] py-[clamp(0.25rem,0.55vw,0.5rem)]">
          <span className={cn('h-2 w-2 shrink-0 rounded-full', s.dot)} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <div className="min-w-0 max-w-full">{titleBlock}</div>
              <p className={cn('hidden min-w-0 flex-1 truncate text-muted-foreground md:block', TXT)} title={summary}>{summary}</p>
            </div>
          </div>
          {pk && <span className={cn('hidden shrink-0 text-muted-foreground sm:inline', TXT_XS)}>{monthLabel(pk)}</span>}
          {toggle}
        </div>
      ) : (
        <div className="flex items-start gap-[clamp(0.5rem,0.9vw,0.75rem)] px-[clamp(0.625rem,1vw,0.875rem)] py-[clamp(0.5rem,0.9vw,0.75rem)]">
          <span className={cn('flex h-[clamp(1.875rem,2.3vw,2.375rem)] w-[clamp(1.875rem,2.3vw,2.375rem)] shrink-0 items-center justify-center rounded-lg text-[clamp(0.875rem,1.1vw,1.125rem)]', s.icon)}>
            <CategoryIcon className="h-[1em] w-[1em]" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">{titleBlock}</div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="hidden items-center gap-3 md:flex">
                  <PriorityBars severity={severity} />
                </span>
                {toggle}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {chips}
              {!expanded && hasDetails && (
                <span className={cn('text-muted-foreground', TXT_XS)}>
                  {findingsCount > 0 && `${findingsCount} finding${findingsCount === 1 ? '' : 's'}`}
                  {findingsCount > 0 && actionsCount > 0 && ' · '}
                  {actionsCount > 0 && `${actionsCount} action${actionsCount === 1 ? '' : 's'}`}
                </span>
              )}
            </div>
            <p className={cn('leading-snug text-foreground/80', TXT, !expanded && 'line-clamp-2')}>{summary}</p>
          </div>
        </div>
      )}

      <AnimatePresence initial={false}>
        {expanded && hasDetails && (
          <motion.div
            key="details"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className={cn('border-t px-[clamp(0.625rem,1vw,0.875rem)] pb-[clamp(0.5rem,0.9vw,0.75rem)]', compact && 'pt-0')}>
              {compact && (
                <div className="flex flex-wrap items-center gap-1.5 pt-2">
                  {chips}
                  <PriorityBars severity={severity} />
                </div>
              )}
              {compact && <p className={cn('pt-1.5 leading-snug text-foreground/80', TXT)}>{summary}</p>}
              <InsightDetails id={id} findings={findings} actions={actions} viewHref={viewHref} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
};

/* Collapsible section header (Company overview / one BU): count + severity tally, so a closed section
   still tells you whether it needs attention — the summary view for admins with many BUs. */
const SectionHeader = ({ sec, open, onToggle, panelId }) => {
  const tally = { critical: 0, warning: 0 };
  sec.items.forEach((i) => { if (tally[i.severity] !== undefined) tally[i.severity] += 1; });
  const partial = sec.items.filter((i) => i.report_state === 'partial').length;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={panelId}
      className="flex w-full items-center gap-2 rounded-lg border bg-muted/30 px-[clamp(0.5rem,0.9vw,0.75rem)] py-[clamp(0.3125rem,0.6vw,0.5rem)] text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronDown className={cn(ICON_MD, 'shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')} />
      <Building2 className={cn(ICON_SM, 'shrink-0 text-primary')} />
      <span className={cn('min-w-0 flex-1 truncate font-semibold text-foreground', TXT)}>{sec.label}</span>
      <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {tally.critical > 0 && (
          <span className={cn('rounded-full px-2 py-0 font-semibold ring-1 ring-inset', TXT_XS, SEVERITY.critical.badge)}>{tally.critical} Critical</span>
        )}
        {tally.warning > 0 && (
          <span className={cn('rounded-full px-2 py-0 font-semibold ring-1 ring-inset', TXT_XS, SEVERITY.warning.badge)}>{tally.warning} Warning</span>
        )}
        {partial > 0 && (
          <span className={cn('hidden rounded-full bg-amber-50 px-2 py-0 font-semibold text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900 sm:inline', TXT_XS)}>{partial} partial</span>
        )}
        <span className={cn('rounded-full bg-background px-2 py-0 font-medium text-muted-foreground ring-1 ring-inset ring-border', TXT_XS)}>
          {sec.items.length} report{sec.items.length === 1 ? '' : 's'}
        </span>
      </span>
    </button>
  );
};

const PENDING_VISIBLE = 4;
const WAITING_BATCH = 6; // Waiting tab loads this many cards at a time as the user scrolls

/* One card of the "Waiting for sync" tab: what is missing, how far along it is, and who still has to sync. */
const WaitingCard = ({ insight }) => {
  const [showAll, setShowAll] = useState(false);
  const names = pendingNames(insight.sync_status);
  const isCompany = insight.scope_type === 'tenant';
  const scope = isCompany
    ? ALL_BUS_LABEL
    : (insight.bu_name ? (insight.sub_bu_name ? `${insight.bu_name} / ${insight.sub_bu_name}` : insight.bu_name) : (insight.company_name ?? '—'));
  const sync = insight.sync_status;
  const total = sync?.total_count ?? 0;
  const done = sync?.synced_count ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const shown = showAll ? names : names.slice(0, PENDING_VISIBLE);
  const listId = `waiting-names-${insight.id}`;
  return (
    <li className="flex flex-col gap-[clamp(0.5rem,0.9vw,0.75rem)] rounded-xl border bg-card p-[clamp(0.625rem,1vw,0.875rem)] shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-[clamp(0.5rem,0.8vw,0.625rem)]">
        <span className="flex h-[clamp(1.875rem,2.3vw,2.375rem)] w-[clamp(1.875rem,2.3vw,2.375rem)] shrink-0 items-center justify-center rounded-xl bg-amber-50 text-[clamp(0.875rem,1.1vw,1.125rem)] text-amber-600 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900">
          <Hourglass className="h-[1em] w-[1em]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="font-bold leading-snug text-foreground text-[clamp(0.75rem,0.92vw,0.9375rem)]" title={insight.title}>{insight.title}</h4>
          <p className={cn('mt-0.5 flex items-center gap-1 text-muted-foreground', TXT_XS)}>
            <Building2 className="h-[1.1em] w-[1.1em] shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate" title={scope}>{scope}</span>
          </p>
        </div>
        <span className={cn('shrink-0 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900', TXT_XS)}>
          Waiting
        </span>
      </div>

      {total > 0 && (
        <div>
          <div className={cn('mb-1 flex items-center justify-between text-muted-foreground', TXT_XS)}>
            <span><span className="font-semibold text-foreground">{done}</span> of {total} synced</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={`${insight.title}: ${done} of ${total} synced`}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-amber-500 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="min-w-0">
        <p className={cn('mb-1 font-semibold text-foreground/70', TXT_XS)}>
          {names.length > 0 ? `Still to sync (${names.length})` : 'Waiting for data'}
        </p>
        {names.length > 0 && (
          <ul id={listId} className="flex flex-wrap gap-1">
            {shown.map((name) => (
              <li
                key={name}
                title={name}
                className={cn('inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted px-[clamp(0.3125rem,0.55vw,0.5rem)] py-[clamp(0.125rem,0.25vw,0.1875rem)] font-medium text-foreground/80', TXT_XS)}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                <span className="truncate">{name}</span>
              </li>
            ))}
            {names.length > PENDING_VISIBLE && (
              <li>
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  aria-expanded={showAll}
                  aria-controls={listId}
                  className={cn('inline-flex rounded-md px-[clamp(0.3125rem,0.55vw,0.5rem)] py-[clamp(0.125rem,0.25vw,0.1875rem)] font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', TXT_XS)}
                >
                  {showAll ? 'Show less' : `+${names.length - PENDING_VISIBLE} more`}
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </li>
  );
};

const AIInsights = () => {
  const [audience, setAudience] = useState('all');
  const [severityFilter, setSeverityFilter] = useState(null);
  const [jobFilter, setJobFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('all');
  const [buFilters, setBuFilters] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Tabs: 'company' = company-wide (tenant) reports, 'bu' = BU-wise reports, 'waiting' = pending_sync
  // placeholders. null = not chosen yet, so the first tab that actually has reports is shown.
  const [tabChoice, setTabChoice] = useState(null);
  // `${monthKey}|${sectionKey}` -> explicit open/closed. No entry = default (see sectionOpen).
  const [sectionOverrides, setSectionOverrides] = useState({});
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('priority');
  const [view, setView] = useState('list');
  // id -> explicit user choice. No entry = default (priority insights open, the rest collapsed).
  const [expandedOverrides, setExpandedOverrides] = useState({});
  const listRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const { hasRole, hierarchyRank, activeBuId, businessUnits, setActiveBu } = useAuth();
  // Company-wide (tenant) reports belong to the Admin only — Super/Platform Admin and everyone else never see them.
  const canSeeCompany = hasRole(ROLE_NAMES.ADMIN);
  const { success, error: showError, warning } = useNotification();

  // The BU / Sub-BU master, already scoped server-side to the caller — also tells us which BUs have
  // Sub-BUs (a manual run must target exactly one unit, so a parent BU with Sub-BUs can't be run).
  const { data: companiesData } = useCompanies({ status: 'active', limit: 200 }, { staleTime: 1000 * 60 * 10 });
  const companies = useMemo(() => companiesData?.data ?? [], [companiesData]);
  // {id, label, parentId} — the tree picker's own option shape. A Sub-BU whose Parent isn't in the
  // list (not visible to this login) is promoted to a root so it never disappears from the picker.
  const buTreeOptions = useMemo(() => {
    const ids = new Set(companies.map((c) => String(c.id)));
    return companies.map((c) => {
      const parentId = c.parent_business_unit_id ?? c.parent?.id ?? null;
      return {
        id: String(c.id),
        label: c.company_name,
        parentId: parentId != null && ids.has(String(parentId)) ? String(parentId) : null,
      };
    });
  }, [companies]);
  const buIdsWithSubBus = useMemo(() => {
    const set = new Set();
    companies.forEach((c) => {
      const parentId = c.parent_business_unit_id ?? c.parent?.id;
      if (parentId != null) set.add(String(parentId));
    });
    return set;
  }, [companies]);

  // No BU picked = the caller's whole reach (never forced to pick one just to VIEW insights).
  // A checked Parent plus one of its own Sub-BUs is deduped to the Sub-BU (the narrower pick wins).
  const dedupedBuIds = useMemo(() => dedupeBusinessUnitIds(buFilters, buTreeOptions), [buFilters, buTreeOptions]);
  // One BU -> the existing `company_id`; several -> `company_ids` (comma-separated).
  const companyId = dedupedBuIds.length === 1 ? Number(dedupedBuIds[0]) : null;
  const queryParams = useMemo(
    () => ({
      limit: 100,
      ...(dedupedBuIds.length === 1 && { company_id: Number(dedupedBuIds[0]) }),
      ...(dedupedBuIds.length > 1 && { company_ids: dedupedBuIds.join(',') }),
      ...(monthFilter !== 'all' && { month: monthFilter }),
    }),
    [dedupedBuIds, monthFilter],
  );
  const { data, isLoading, isFetching, isError, error, refetch } = useAIInsights(queryParams);

  const errorCode = error?.response?.data?.code;
  const errorMessage = isError ? extractApiError(error) : null;

  // BU_NOT_MAPPED: the selected BU is outside this user's reach — reset whichever selector sent it.
  useEffect(() => {
    // INVALID_COMPANY_IDS (400): the BU list we sent was malformed — drop it so the page recovers.
    if (errorCode === 'INVALID_COMPANY_IDS') {
      setBuFilters([]);
      return;
    }
    if (errorCode !== 'BU_NOT_MAPPED') return;
    if (buFilters.length > 0) {
      setBuFilters([]);
    } else if (activeBuId != null && businessUnits?.length && String(businessUnits[0].id) !== String(activeBuId)) {
      setActiveBu(businessUnits[0].id);
    }
    // Only react to a new error, not to every selector change it causes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errorCode]);

  /* ── Manual runs: BU Admin and above, exactly ONE BU / Sub-BU ── */
  // Backend allows manual runs for hierarchy rank 1-4 only; a role shown the button anyway gets a
  // 403 SENIOR_TIER_REQUIRED, surfaced as a normal error toast.
  const canRun = hierarchyRank != null
    ? hierarchyRank <= 4
    : hasRole(ROLE_NAMES.PLATFORM_ADMIN, ROLE_NAMES.ADMIN, ROLE_NAMES.ENTITY_ADMIN, ROLE_NAMES.BU_ADMIN);
  const hasMultipleBus = dedupedBuIds.length > 1;
  const runCompanyId = hasMultipleBus ? null : (companyId ?? activeBuId ?? null);
  const runBlockedReason = hasMultipleBus
    ? 'Run analysis works on one Business Unit / Sub-BU at a time. Select only one.'
    : runCompanyId == null
      ? 'Select a Business Unit / Sub-BU to run insights.'
      : buIdsWithSubBus.has(String(runCompanyId))
        ? 'This Business Unit has Sub-BUs. Select a specific Sub-BU to run insights.'
        : null;
  const runAllMutation = useRunAllAIInsights();
  const isRunning = runAllMutation.isPending;

  const handleRunAll = () => {
    if (isRunning) return;
    runAllMutation.mutate({ companyId: runCompanyId }, {
      onSuccess: (res) => {
        const results = res?.data?.results ?? [];
        const failed = results.filter((r) => r.status === 'failed');
        const ok = results.filter((r) => r.status === 'success').length;
        const skipped = results.filter((r) => r.status === 'skipped').length;
        const summary = `${ok} succeeded${skipped ? `, ${skipped} skipped` : ''}${failed.length ? `, ${failed.length} failed` : ''}.`;
        if (failed.length) warning(`Run all finished: ${summary}${failed[0]?.error ? ` (${failed[0].error})` : ''}`);
        else success(`Run all finished: ${summary}`);
      },
      onError: (e) => showError(extractApiError(e)),
    });
  };

  const handleSummaryClick = (key) => {
    setSeverityFilter((prev) => (prev === key ? null : key));
    requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }));
  };

  const rawInsights = useMemo(() => data?.data ?? [], [data?.data]);
  const totalOnServer = data?.meta?.total ?? rawInsights.length;

  // Insight (job) filter options come from the data itself: the API's `title` per job_key, so new
  // bu_* / tenant_* jobs show up without a hard-coded list.
  const jobOptions = useMemo(() => {
    const m = new Map();
    rawInsights.forEach((i) => { if (i.job_key && !m.has(i.job_key)) m.set(i.job_key, i.title || i.job_key); });
    return [...m.entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rawInsights]);

  // available audiences derived from the data itself, so the list never drifts from what the API actually sends
  const audienceOptions = useMemo(() => {
    const set = new Set();
    rawInsights.forEach((i) => (i.audience_roles ?? []).forEach((r) => set.add(r)));
    return [...set].sort();
  }, [rawInsights]);

  // Stage 1: audience + insight (job) + month + search — KPI tiles and category counts reflect all of them.
  const searchTerm = search.trim().toLowerCase();
  const baseInsights = useMemo(
    () => rawInsights.filter((i) => {
      // Selected BU(s): a row belongs to a picked BU directly, or via its Parent (Parent includes its
      // Sub-BUs). Applied here as well as server-side so the list is right even before the backend
      // honours `company_ids`.
      if (
        dedupedBuIds.length > 0
        && i.scope_type !== 'tenant' // company-wide reports have no BU (company_id null) — the server decides
        && !dedupedBuIds.includes(String(i.company_id))
        && !dedupedBuIds.includes(String(i.parent_business_unit_id))
      ) return false;
      if (!canSeeCompany && i.scope_type === 'tenant') return false;
      if (audience !== 'all' && !(i.audience_roles ?? []).includes(audience)) return false;
      if (jobFilter !== 'all' && i.job_key !== jobFilter) return false;
      if (monthFilter !== 'all' && periodKey(i) !== monthFilter) return false;
      if (!searchTerm) return true;
      const haystack = [
        i.title, i.summary, i.severity, SEVERITY[i.severity]?.label,
        i.bu_name, i.sub_bu_name, i.company_name, i.scope_type === 'tenant' ? `${COMPANY_OVERVIEW} ${ALL_BUS_LABEL}` : null,
        ...(i.findings ?? []), ...(i.actions ?? []), ...pendingNames(i.sync_status),
      ];
      return haystack.some((v) => typeof v === 'string' && v.toLowerCase().includes(searchTerm));
    }),
    [rawInsights, canSeeCompany, dedupedBuIds, audience, jobFilter, monthFilter, searchTerm],
  );

  // Stage 2: split by tab. pending_sync placeholders live only in the Waiting tab (they have no severity).
  const finishedInsights = useMemo(() => baseInsights.filter((i) => !isPendingSync(i)), [baseInsights]);
  const companyCount = useMemo(() => finishedInsights.filter(isCompanyWide).length, [finishedInsights]);
  const buCount = finishedInsights.length - companyCount;
  const tab = tabChoice ?? (canSeeCompany && (companyCount > 0 || buCount === 0) ? 'company' : 'bu');
  const tabBase = useMemo(
    () => (tab === 'company' ? finishedInsights.filter(isCompanyWide)
      : tab === 'bu' ? finishedInsights.filter((i) => !isCompanyWide(i))
        : finishedInsights),
    [finishedInsights, tab],
  );
  // Stage 3: severity, then sort.
  const insights = useMemo(
    () => tabBase
      .filter((i) => !severityFilter || i.severity === severityFilter)
      .sort(COMPARATORS[sortBy]),
    [tabBase, severityFilter, sortBy],
  );
  const monthGroups = useMemo(() => groupByMonth(insights), [insights]);
  // The severity filter doesn't apply to the Waiting tab (no severity there).
  const waitingInsights = useMemo(
    // newest month first, then most recently updated — same order the month groups render in, so a batch
    // boundary never splits a month out of sequence.
    () => baseInsights.filter(isPendingSync).sort((a, b) => (periodKey(b) ?? '').localeCompare(periodKey(a) ?? '') || ts(b) - ts(a)),
    [baseInsights],
  );
  // Infinite scroll for the Waiting tab: render WAITING_BATCH cards, then more as the sentinel scrolls into view.
  const [waitingVisible, setWaitingVisible] = useState(WAITING_BATCH);
  const waitingSentinelRef = useRef(null);
  const hasMoreWaiting = waitingVisible < waitingInsights.length;
  const loadMoreWaiting = () => setWaitingVisible((n) => n + WAITING_BATCH);
  // A different result set (filter / month / search change) starts again from the first batch.
  useEffect(() => { setWaitingVisible(WAITING_BATCH); }, [waitingInsights]);
  useEffect(() => {
    const node = waitingSentinelRef.current;
    if (!node || !hasMoreWaiting || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setWaitingVisible((n) => n + WAITING_BATCH);
    }, { rootMargin: '200px 0px' });
    io.observe(node);
    return () => io.disconnect();
  }, [tab, hasMoreWaiting, waitingVisible]);
  const waitingMonths = useMemo(
    () => groupByMonth(waitingInsights.slice(0, waitingVisible)).map((m) => ({ ...m, rows: m.sections.flatMap((x) => x.items) })),
    [waitingInsights, waitingVisible],
  );

  // Severity tiles follow the active tab (the Waiting tab shows the totals) — placeholders carry no severity.
  const counts = useMemo(() => {
    const c = { critical: 0, warning: 0, info: 0, success: 0 };
    tabBase.forEach((i) => { c[i.severity] = (c[i.severity] ?? 0) + 1; });
    return c;
  }, [tabBase]);

  const isExpanded = (ins) => expandedOverrides[ins.id] ?? PRIORITY_SEVERITIES.includes(ins.severity);
  const toggleExpanded = (id) => {
    const ins = insights.find((i) => i.id === id);
    setExpandedOverrides((prev) => ({ ...prev, [id]: !(prev[id] ?? (ins ? PRIORITY_SEVERITIES.includes(ins.severity) : false)) }));
  };

  // Default: only the newest month is open, and in it the Company overview plus the BUs when there are
  // few of them. With many BUs they start closed as a summary list the admin drills into. A search
  // opens everything so matches are never hidden inside a closed section.
  const sectionKeyOf = (month, sec) => `${month.key}|${sec.key}`;
  const sectionOpen = (month, mi, sec) => {
    if (searchTerm || severityFilter) return true; // a filter must never hide its own matches in a closed section
    const k = sectionKeyOf(month, sec);
    if (k in sectionOverrides) return sectionOverrides[k];
    return mi === 0 && (sec.order === 0 || month.sections.length <= 4);
  };
  const toggleSection = (month, mi, sec) =>
    setSectionOverrides((prev) => ({ ...prev, [sectionKeyOf(month, sec)]: !sectionOpen(month, mi, sec) }));
  const allExpanded = monthGroups.length > 0 && monthGroups.every((m, mi) => m.sections.every((sec) => sectionOpen(m, mi, sec)));
  const setAllExpanded = (open) =>
    setSectionOverrides(Object.fromEntries(monthGroups.flatMap((m) => m.sections.map((sec) => [sectionKeyOf(m, sec), open]))));

  const clearFilters = () => {
    setAudience('all');
    setJobFilter('all');
    setMonthFilter('all');
    setBuFilters([]);
  };

  const panelFilterCount = (audience !== 'all' ? 1 : 0) + (jobFilter !== 'all' ? 1 : 0) + (monthFilter !== 'all' ? 1 : 0) + (buFilters.length > 0 ? 1 : 0);
  const hasActiveFilters = panelFilterCount > 0 || !!severityFilter || !!searchTerm;
  const clearAllFilters = () => {
    clearFilters();
    setSeverityFilter(null);
    setSearch('');
  };

  const sortMeta = SORTS.find((s) => s.value === sortBy) ?? SORTS[0];

  return (
    <div className="space-y-[clamp(0.5rem,0.9vw,0.75rem)] pb-[clamp(1rem,2vw,1.5rem)]">
      {/* Header + Filters panel share one wrapper: FilterPanel's closed state zeroes the margin of
          whatever element follows it, so it must be the LAST child here — otherwise the KPI row
          would lose its gap and sit flush against the header. */}
      <div>
      {/* ── Header ── */}
      <header className={cn('rounded-2xl border bg-gradient-to-r from-primary/[0.05] via-card to-violet-500/[0.06] px-[clamp(0.75rem,1.4vw,1.25rem)] py-[clamp(0.625rem,1vw,1rem)]', filtersOpen && 'mb-2')}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 items-center gap-[clamp(0.625rem,1vw,1rem)]">
            <Link
              to={ROUTES.DASHBOARD}
              title="Back to Dashboard"
              aria-label="Back to Dashboard"
              className={cn('group flex shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-all duration-200 hover:border-primary/40 hover:bg-primary/5 hover:text-primary hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none', ICON_BTN, 'h-[clamp(1.75rem,2.2vw,2.25rem)] w-[clamp(1.75rem,2.2vw,2.25rem)]')}
            >
              <ArrowLeft className={cn(ICON_MD, 'transition-transform duration-200 group-hover:-translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0')} aria-hidden="true" />
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1
                  className="bg-clip-text font-extrabold leading-tight tracking-tight text-transparent text-[clamp(1.125rem,1.9vw,1.625rem)]"
                  style={{ backgroundImage: 'linear-gradient(120deg, #2563eb, #635bff 60%, #7c3aed)' }}
                >
                  AI Insights
                </h1>
                <span className={cn('inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/5 px-2 py-0.5 font-bold text-primary', TXT_XS)}>
                  <LiveDot /> AI Generated
                </span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="AI can make mistakes. Please double-check important information."
                      className="flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <AlertTriangle className={ICON_MD} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className={TXT}>
                    AI can make mistakes. Please double-check important information.
                  </TooltipContent>
                </Tooltip>
              </div>
              {/* <p className="text-muted-foreground text-[clamp(0.75rem,0.95vw,0.9375rem)]">
                Monthly utilization, bench and staffing reports, published once each month's timesheets are synced.
              </p> */}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="toolbar"
              onClick={() => setFiltersOpen((prev) => !prev)}
              aria-expanded={filtersOpen}
              className="rounded-lg border-primary/40 bg-background text-primary hover:bg-primary/5 hover:text-primary"
            >
              <Filter /> Filters
              {panelFilterCount > 0 && (
                <span className="flex h-[1.3em] w-[1.3em] items-center justify-center rounded-full bg-primary text-[0.75em] font-semibold text-primary-foreground">{panelFilterCount}</span>
              )}
            </Button>
            {SHOW_RUN_ANALYSIS && canRun && (
              <DropdownMenu>
                {/* A disabled button swallows hover, so the reason lives on this wrapper. */}
                <span title={runBlockedReason ?? 'Run AI insight jobs for the selected Business Unit'}>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" size="toolbar" disabled={!!runBlockedReason || isRunning} className="rounded-lg font-semibold">
                      {isRunning ? <RefreshCw className="animate-spin" /> : <Play />}
                      {isRunning ? 'Running…' : 'Run analysis'}
                    </Button>
                  </DropdownMenuTrigger>
                </span>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel className={cn('text-muted-foreground', TXT_XS)}>Runs for the selected Business Unit / Sub-BU</DropdownMenuLabel>
                  <DropdownMenuItem onClick={handleRunAll} className={cn('cursor-pointer gap-[clamp(0.375rem,0.6vw,0.5rem)] font-semibold', TXT)}>
                    <Sparkles className={ICON_MD} /> Run all jobs
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Refresh"
              aria-label="Refresh insights"
              className="rounded-lg bg-background"
            >
              <RefreshCw className={isFetching ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>
      </header>

      {/* ── Filters (Business Unit / Insight / Audience) ── */}
      <FilterPanel
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        gridClassName="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[clamp(0.5rem,0.8vw,0.75rem)] w-full"
        onClear={clearFilters}
        showClear={panelFilterCount > 0}
      >
        <div className="flex flex-col gap-1">
          <Label className={TXT_XS}>Business Unit</Label>
          <HierarchicalBuSelector
            showChips={false}
            options={buTreeOptions}
            value={buFilters}
            onValueChange={setBuFilters}
            placeholder="All Business Units"
            searchPlaceholder="Search business unit..."
            className={cn(CTRL_H, 'bg-background')}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className={TXT_XS}>Insight</Label>
          <Select value={jobFilter} onValueChange={setJobFilter}>
            <SelectTrigger className={cn(CTRL_H, 'w-full gap-1.5 bg-background')} aria-label="Insight type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Insights</SelectItem>
              {jobOptions.map((job) => (
                <SelectItem key={job.key} value={job.key}>{job.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className={TXT_XS}>Month</Label>
          <MonthYearPicker
            value={monthFilter === 'all' ? null : { year: Number(monthFilter.slice(0, 4)), month: Number(monthFilter.slice(5, 7)) }}
            onChange={(val) => setMonthFilter(val ? `${val.year}-${String(val.month).padStart(2, '0')}` : 'all')}
            placeholder="All Months"
            className="w-full"
          />
        </div>
        {audienceOptions.length > 0 && (
          <div className="flex flex-col gap-1">
            <Label className={TXT_XS}>Audience</Label>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger className={cn(CTRL_H, 'w-full gap-1.5 bg-background')} aria-label="Audience">
                <Users className="h-[1.1em] w-[1.1em] shrink-0 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Audiences</SelectItem>
                {audienceOptions.map((role) => (
                  <SelectItem key={role} value={role}>{role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </FilterPanel>
      </div>

      {/* ── Severity chips: hidden on the Waiting tab (waiting reports have no severity) ── */}
      {tab !== 'waiting' && (
        <section aria-label="Insight summary" className="flex flex-wrap items-center gap-[clamp(0.375rem,0.7vw,0.5rem)]">
        {SUMMARY_TILES.map((t) => (
          <KpiCard key={t.key} tile={t} count={counts[t.key]} active={severityFilter === t.key} loading={isLoading} onClick={() => handleSummaryClick(t.key)} />
        ))}
      </section>
      )}

      {/* ── Status tabs: generated reports vs. reports still waiting for units to sync ── */}
      <div role="tablist" aria-label="Report status" className="flex items-center gap-[clamp(0.25rem,0.6vw,0.5rem)] border-b">
        {[
          ...(canSeeCompany ? [{ value: 'company', label: 'Company overview', icon: Building2, count: companyCount }] : []),
          { value: 'bu', label: 'BU-wise insights', icon: Users, count: buCount },
          { value: 'waiting', label: 'Waiting for sync', icon: Hourglass, count: waitingInsights.length },
        ].map((t) => {
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              role="tab"
              id={`insights-tab-${t.value}`}
              aria-selected={active}
              aria-controls="insights-panel"
              onClick={() => setTabChoice(t.value)}
              className={cn(
                '-mb-px inline-flex items-center gap-[clamp(0.25rem,0.4vw,0.375rem)] whitespace-nowrap border-b-2 px-[clamp(0.5rem,1vw,0.875rem)] py-[clamp(0.375rem,0.7vw,0.5rem)] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                TXT,
                active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <t.icon className="h-[1.1em] w-[1.1em]" aria-hidden="true" /> {t.label}
              <span className={cn('inline-flex h-[1.5em] min-w-[1.5em] items-center justify-center rounded-full px-1.5 text-[0.85em] font-bold', active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Toolbar: search · sort · view ── */}
      <div className="flex flex-wrap items-center gap-x-[clamp(0.375rem,0.8vw,0.75rem)] gap-y-2 lg:flex-nowrap">
        {/* Heading + count + month sit on the same line as the search box */}
        {!isLoading && !isError && (tab === 'waiting' ? waitingInsights.length > 0 : insights.length > 0) && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="flex items-center gap-2 font-bold text-foreground text-[clamp(0.875rem,1.15vw,1.0625rem)]">
              {tab === 'waiting' ? 'Waiting for sync' : sortMeta.heading}
            </h2>
            <span className={cn('rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground', TXT_XS)}>
              {tab === 'waiting'
                ? `${waitingInsights.length} report${waitingInsights.length === 1 ? '' : 's'}`
                : `${insights.length} insight${insights.length === 1 ? '' : 's'}`}
            </span>
            {tab !== 'waiting' && monthGroups.length === 1 && (
              <span className={cn('inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 font-semibold text-foreground/80', TXT_XS)}>
                <Calendar className="h-[1.1em] w-[1.1em] text-primary" aria-hidden="true" /> {monthGroups[0].label}
              </span>
            )}
            {tab === 'bu' && (
              <button
                type="button"
                onClick={() => setAllExpanded(!allExpanded)}
                className={cn('font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', TXT_XS)}
              >
                {allExpanded ? 'Collapse all' : 'Expand all'}
              </button>
            )}
          </div>
        )}
        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-[clamp(0.25rem,0.6vw,0.5rem)] lg:flex-nowrap">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search insights…"
            className="w-full sm:w-[clamp(8rem,13vw,14rem)]"
            inputClassName={cn(CTRL_H, TOOL_TXT, 'bg-background')}
          />
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className={cn(CTRL_H, TOOL_TXT, 'w-[clamp(7.5rem,10vw,10rem)] gap-[clamp(0.25rem,0.4vw,0.375rem)] bg-background px-[clamp(0.5rem,0.7vw,0.75rem)]')} aria-label="Sort insights">
              <ArrowUpDown className="h-[1.1em] w-[1.1em] shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">Sort:</span> <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div role="group" aria-label="View mode" className={cn('inline-flex items-center rounded-lg border bg-background p-0.5', CTRL_H)}>
            {[
              { value: 'list', label: 'List', icon: List },
              { value: 'compact', label: 'Compact', icon: LayoutGrid },
            ].map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => setView(v.value)}
                aria-pressed={view === v.value}
                className={cn(
                  'inline-flex h-full items-center gap-[clamp(0.25rem,0.4vw,0.375rem)] rounded-md px-[clamp(0.375rem,0.7vw,0.625rem)] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  TOOL_TXT,
                  view === v.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <v.icon className="h-[1.1em] w-[1.1em]" /> {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Insights list ── */}
      <section ref={listRef} id="insights-panel" role="tabpanel" aria-labelledby={`insights-tab-${tab}`} className="scroll-mt-4">
        {isLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading insights">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border bg-card motion-reduce:animate-none" />
            ))}
          </div>
        ) : isError ? (
          <div role="alert" className="flex flex-col items-center gap-1.5 py-12 text-center">
            <AlertTriangle className={cn(ICON_LG, errorCode === 'NO_BUSINESS_UNIT' ? 'text-muted-foreground' : 'text-amber-500')} />
            <p className={cn('font-semibold text-foreground', TXT)}>
              {errorCode === 'NO_BUSINESS_UNIT' ? 'No Business Unit assigned' : errorCode === 'BU_NOT_MAPPED' ? 'Business Unit not available' : 'Could not load insights'}
            </p>
            <p className={cn('max-w-md text-muted-foreground', TXT)}>{errorMessage}</p>
            {errorCode !== 'NO_BUSINESS_UNIT' && errorCode !== 'BU_NOT_MAPPED' && (
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-1">Try again</Button>
            )}
          </div>
        ) : tab === 'waiting' && rawInsights.length > 0 ? (
          waitingInsights.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed py-12 text-center">
              <CheckCircle2 className={cn(ICON_LG, 'text-emerald-500')} />
              <p className={cn('font-semibold text-foreground', TXT)}>Nothing is waiting for sync</p>
              <p className={cn('max-w-md text-muted-foreground', TXT)}>Every report in this view has its data.</p>
            </div>
          ) : (
            <div className="space-y-[clamp(0.75rem,1.4vw,1.25rem)]">
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-[clamp(0.625rem,1vw,0.875rem)] py-[clamp(0.375rem,0.7vw,0.5rem)] dark:border-amber-900 dark:bg-amber-950/20">
                <Info className={cn(ICON_MD, 'mt-0.5 shrink-0 text-amber-600 dark:text-amber-400')} aria-hidden="true" />
                <p className={cn('leading-snug text-foreground/80', TXT)}>
                  <span className="font-semibold text-foreground">{waitingInsights.length} report{waitingInsights.length === 1 ? ' is' : 's are'} waiting.</span>{' '}
                  Each one is generated automatically once every unit has synced its timesheets for the month.
                </p>
              </div>
              {waitingMonths.map((month) => (
                <section key={month.key} aria-label={month.label} className="space-y-[clamp(0.25rem,0.5vw,0.375rem)]">
                  <h3 className="flex items-center gap-2 font-bold text-foreground text-[clamp(0.8125rem,1.05vw,1rem)]">
                    <Calendar className={cn(ICON_MD, 'text-primary')} /> {month.label}
                    <span className={cn('rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground', TXT_XS)}>{month.count}</span>
                  </h3>
                  <ul className="grid grid-cols-1 gap-[clamp(0.5rem,0.9vw,0.75rem)] md:grid-cols-2 xl:grid-cols-3">
                    {month.rows.map((ins) => <WaitingCard key={ins.id} insight={ins} />)}
                  </ul>
                </section>
              ))}
              {hasMoreWaiting && (
                <div ref={waitingSentinelRef} className="flex flex-col items-center gap-1.5 py-2">
                  <p className={cn('text-muted-foreground', TXT_XS)} aria-live="polite">
                    Showing {Math.min(waitingVisible, waitingInsights.length)} of {waitingInsights.length}
                  </p>
                  <Button variant="outline" size="sm" onClick={loadMoreWaiting}>Load more</Button>
                </div>
              )}
            </div>
          )
        ) : rawInsights.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed py-12 text-center">
            <Sparkles className={cn(ICON_LG, 'text-violet-500')} />
            <p className={cn('font-semibold text-foreground', TXT)}>
              {monthFilter !== 'all' ? `No reports for ${monthLabel(monthFilter)} yet` : 'No insights yet'}
            </p>
            <p className={cn('max-w-md text-muted-foreground', TXT)}>Reports appear here after the month's timesheets are synced.</p>
          </div>
        ) : insights.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-12 text-center">
            <p className={cn('italic text-muted-foreground', TXT)}>
              {tabBase.length > 0
                ? 'No insights match the current filters or search.'
                : tab === 'company'
                  ? 'No company overview reports yet.'
                  : 'No BU-wise reports yet.'}
            </p>
            {tabBase.length === 0 && waitingInsights.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setTabChoice('waiting')}>
                View {waitingInsights.length} waiting for sync
              </Button>
            )}
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearAllFilters}>Clear all filters</Button>
            )}
          </div>
        ) : (
          <div className="space-y-[clamp(0.75rem,1.4vw,1.25rem)]">
            {monthGroups.map((month, mi) => (
              <section key={month.key} aria-label={month.label} className="space-y-[clamp(0.375rem,0.7vw,0.5rem)]">
                {monthGroups.length > 1 && (
                  <h3 className="flex items-center gap-2 border-b pb-1 font-bold text-foreground text-[clamp(0.8125rem,1.05vw,1rem)]">
                    <Calendar className={cn(ICON_MD, 'text-primary')} /> {month.label}
                    <span className={cn('rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground', TXT_XS)}>{month.count}</span>
                  </h3>
                )}
                {month.sections.map((sec) => {
                  const flat = tab === 'company'; // a single "Company overview" section — no header needed
                  const open = flat || sectionOpen(month, mi, sec);
                  const panelId = `insight-section-${month.key}-${sec.key}`.replace(/[^a-zA-Z0-9_-]/g, '_');
                  return (
                  <div key={sec.key} className="space-y-[clamp(0.25rem,0.5vw,0.375rem)]">
                    {!flat && <SectionHeader sec={sec} open={open} onToggle={() => toggleSection(month, mi, sec)} panelId={panelId} />}
                    {open && (
                    <div id={panelId} className={cn('space-y-[clamp(0.375rem,0.7vw,0.5rem)]', view === 'compact' && 'space-y-[clamp(0.25rem,0.5vw,0.375rem)]')}>
                      {sec.items.map((ins) => (
                        <InsightItem
                          key={ins.id}
                          insight={ins}
                          compact={view === 'compact'}
                          expanded={isExpanded(ins)}
                          onToggle={toggleExpanded}
                          reduceMotion={reduceMotion}
                        />
                      ))}
                    </div>
                    )}
                  </div>
                  );
                })}
              </section>
            ))}
          </div>
        )}

        {!isLoading && !isError && totalOnServer > rawInsights.length && (
          <p className={cn('mt-3 text-center text-muted-foreground', TXT_XS)}>
            Showing the latest {rawInsights.length} of {totalOnServer} insights. Narrow by Business Unit or Insight to see the rest.
          </p>
        )}
      </section>
    </div>
  );
};

export default AIInsights;
