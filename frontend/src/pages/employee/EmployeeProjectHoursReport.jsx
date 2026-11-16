import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AnimatePresence, motion } from 'framer-motion';
import * as XLSX from 'xlsx';
import { AlertCircle, ChevronRight, Clock, Download, FileText, FolderKanban } from 'lucide-react';
import {
  useEmployeeProjectHoursFilterTree,
  useEmployeeProjectHoursReport,
} from '@/hooks/useEmployeeProjectHoursReport';
import { extractApiError } from '@/services/apiClient';
import { formatHours } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { WeekPicker } from '@/components/ui/week-picker';
import { SearchableSelect } from '@/components/ui/searchable-select';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import ReportTypeToggle from '@/components/common/ReportTypeToggle';
import { useExportConfirm } from '@/components/common/ExportConfirm';
import { Button } from '@/components/ui/button';

// 'weekly' shares the same `range` state as 'range' below — WeekPicker just snaps selection to a
// Mon-Sat business week instead of two free clicks, emitting the identical {startDate, endDate} shape, so
// periodParams/hasSelection need no separate weekly case.
const REPORT_TYPES = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Range', value: 'range' },
];

const GRID_COLS = 'grid-cols-[minmax(0,1fr)_110px]';
const INDENT_PER_DEPTH_PX = 20;

// Only project_id/service_po_id are filterable per the API — Parent/Child nodes never appear in
// this dropdown, just in the rendered result tree below.
const buildFilterOptions = (tree) => {
  const options = [{ label: 'All Projects & Service POs', value: 'all', searchValue: 'all' }];
  tree.forEach((project) => {
    options.push({
      label: <span className="font-medium">{project.project_name}</span>,
      searchValue: project.project_name,
      value: `project:${project.project_id}`,
    });
    (project.service_pos ?? []).forEach((po) => {
      options.push({
        label: (
          <span className="flex items-baseline gap-1.5" style={{ paddingLeft: INDENT_PER_DEPTH_PX }}>
            <span className="text-muted-foreground">└</span>
            <span>{po.service_po_name}</span>
          </span>
        ),
        searchValue: `${project.project_name} ${po.service_po_name}`,
        value: `servicePO:${po.service_po_id}`,
      });
    });
  });
  return options;
};

// Normalizes the three differently-shaped API levels (project/service-po/hierarchy-node) into one
// uniform { key, name, hours, children } shape so a single recursive row renderer covers every depth.
const normalizeHierarchyNode = (node) => ({
  key: `node-${node.hierarchy_id}`,
  name: node.name,
  hours: node.hours,
  children: (node.children ?? []).map(normalizeHierarchyNode),
});

const normalizeProjects = (projects = []) =>
  projects.map((project) => ({
    key: `project-${project.project_id}`,
    name: project.project_name,
    hours: project.total_hours,
    children: (project.service_pos ?? []).map((po) => ({
      key: `po-${po.service_po_id}`,
      name: po.service_po_name,
      hours: po.hours,
      children: (po.children ?? []).map(normalizeHierarchyNode),
    })),
  }));

// Built client-side from the same response the page renders (the API has no Excel format): one
// row per Project, Service PO and hierarchy node, so the sheet mirrors the on-screen tree.
const exportProjectHoursToExcel = (apiProjects = [], grandTotal, fileLabel) => {
  const header = ['Level', 'Project', 'Service PO', 'Hierarchy', 'Hours'];
  const out = [];
  const walk = (nodes, project, po, path, depth) => {
    nodes.forEach((node) => {
      const nextPath = [...path, node.name];
      out.push([depth === 0 ? 'Parent' : 'Child', project, po, nextPath.join(' > '), Number(node.hours) || 0]);
      walk(node.children ?? [], project, po, nextPath, depth + 1);
    });
  };
  apiProjects.forEach((project) => {
    out.push(['Project', project.project_name, '', '', Number(project.total_hours) || 0]);
    (project.service_pos ?? []).forEach((po) => {
      out.push(['Service PO', project.project_name, po.service_po_name, '', Number(po.hours) || 0]);
      walk(po.children ?? [], project.project_name, po.service_po_name, [], 0);
    });
  });
  out.push([], ['Grand Total', '', '', '', Number(grandTotal) || 0]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...out]);
  ws['!cols'] = [{ wch: 12 }, { wch: 32 }, { wch: 32 }, { wch: 40 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Project Hours');
  XLSX.writeFile(wb, `Project_Hours_${fileLabel}.xlsx`);
};

// depth 0 = Project, depth 1 = Service PO, deeper = Parent/Child hierarchy nodes.
const RowIcon = ({ depth }) => {
  if (depth === 0) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <FolderKanban className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  if (depth === 1) {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-sky-600">
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    );
  }
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden="true" />;
};

const TreeRow = ({ node, depth, expandedKeys, onToggle }) => {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedKeys.has(node.key);
  const isTop = depth === 0;

  return (
    <div className={cn(isTop && 'border-t first:border-t-0')}>
      <button
        type="button"
        onClick={() => hasChildren && onToggle(node.key)}
        disabled={!hasChildren}
        aria-expanded={hasChildren ? isExpanded : undefined}
        className={cn(
          'grid w-full items-center gap-2 px-4 text-left transition-colors',
          'hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent',
          isTop ? 'py-3' : 'py-2',
          GRID_COLS
        )}
      >
        <span className="flex min-w-0 items-center gap-2" style={{ paddingLeft: depth * INDENT_PER_DEPTH_PX }}>
          <ChevronRight
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
              isExpanded && 'rotate-90',
              !hasChildren && 'invisible'
            )}
            aria-hidden="true"
          />
          <RowIcon depth={depth} />
          <span
            className={cn(
              'min-w-0 truncate text-sm',
              isTop ? 'font-semibold text-foreground' : depth === 1 ? 'font-medium text-foreground' : 'text-foreground/90'
            )}
          >
            {node.name}
          </span>
        </span>
        <span className={cn('text-right tabular-nums', isTop ? 'text-sm font-semibold' : 'text-sm text-muted-foreground')}>
          {formatHours(node.hours)}
        </span>
      </button>

      {hasChildren && (
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="relative overflow-hidden bg-muted/20"
            >
              <span
                aria-hidden="true"
                className="absolute bottom-2 top-0 w-px bg-border"
                style={{ left: 16 + depth * INDENT_PER_DEPTH_PX + 7 }}
              />
              {node.children.map((child) => (
                <TreeRow key={child.key} node={child} depth={depth + 1} expandedKeys={expandedKeys} onToggle={onToggle} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
};

const TreeSkeleton = () => (
  <div className="overflow-hidden rounded-xl border bg-card shadow-sm" aria-busy="true" aria-label="Loading report">
    <Skeleton className="h-9 w-full rounded-none" />
    {Array.from({ length: 4 }, (_, i) => (
      <div key={i} className="flex items-center gap-3 border-t px-4 py-3">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-3.5 w-48 flex-1" />
        <Skeleton className="h-4 w-12" />
      </div>
    ))}
  </div>
);

const EmployeeProjectHoursReport = () => {
  const confirmExport = useExportConfirm();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [reportType, setReportType] = useState('monthly');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [monthYear, setMonthYear] = useState({ month: dayjs().month() + 1, year: dayjs().year() });
  const [range, setRange] = useState(null);
  const [filterValue, setFilterValue] = useState('all');
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());

  const { data: filterTree = [] } = useEmployeeProjectHoursFilterTree();
  const filterOptions = useMemo(() => buildFilterOptions(filterTree), [filterTree]);

  const hasSelection = (reportType !== 'range' && reportType !== 'weekly') || !!range;

  const periodParams =
    reportType === 'daily'
      ? { date }
      : reportType === 'monthly'
        ? { month: monthYear?.month, year: monthYear?.year }
        : { startDate: range?.startDate, endDate: range?.endDate };

  const [filterKind, filterId] = filterValue.split(':');
  const filterParams =
    filterKind === 'project'
      ? { project_id: filterId }
      : filterKind === 'servicePO'
        ? { service_po_id: filterId }
        : {};

  const params = { ...periodParams, ...filterParams };

  const { data, isLoading, isError, error } = useEmployeeProjectHoursReport(params, hasSelection);

  const projects = useMemo(() => normalizeProjects(data?.projects), [data]);
  const errorMessage = isError ? extractApiError(error) : null;
  const showLoading = hasSelection && isLoading;

  const toggleKey = (key) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const activeFilterCount = filterValue !== 'all' ? 1 : 0;

  const clearFilters = () => {
    setFilterValue('all');
  };

  const canExport = hasSelection && !isLoading && !errorMessage && projects.length > 0;
  const fileLabel =
    reportType === 'daily'
      ? date
      : reportType === 'monthly'
        ? `${monthYear?.year}-${String(monthYear?.month).padStart(2, '0')}`
        : `${range?.startDate}_to_${range?.endDate}`;
  const handleExport = () => exportProjectHoursToExcel(data?.projects, data?.grand_total_hours, fileLabel);

  return (
    // `h-full min-h-0` (see MainLayout.jsx's own comment) — this page now opts INTO owning its own
    // internal scroll region (the hierarchy tree box below), the same pattern DataTable-based
    // report pages use, instead of relying on the page-level scrollbar. Filters/header/Grand Total
    // stay fixed in place; only the tree's own row list scrolls.
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Project Hours Report"
        description="Hours you've logged against your mapped Projects/Service POs, broken down by hierarchy."
        actions={
          <div className="flex items-center gap-2">
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((prev) => !prev)}
              activeCount={activeFilterCount}
            />
            <span title={!canExport && !isLoading ? 'No hours to export for the selected period' : undefined}>
              <Button variant="outline" size="toolbar" disabled={!canExport} onClick={() => confirmExport(handleExport)}>
                <Download className="h-4 w-4" />
                Export Excel
              </Button>
            </span>
          </div>
        }
      />

      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[260px]" onClear={clearFilters} showClear={activeFilterCount > 0}>
        <ReportTypeToggle options={REPORT_TYPES} value={reportType} onChange={setReportType} />

        {reportType === 'daily' && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Date</Label>
            <DatePicker
              value={date}
              max={dayjs().format('YYYY-MM-DD')}
              onChange={setDate}
              className="w-full bg-white"
            />
          </div>
        )}

        {reportType === 'monthly' && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Month</Label>
            <MonthYearPicker value={monthYear} onChange={setMonthYear} className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white" />
          </div>
        )}

        {reportType === 'weekly' && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Week</Label>
            <WeekPicker value={range} onChange={setRange} placeholder="Select a week" className="w-full" />
          </div>
        )}

        {reportType === 'range' && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Date Range</Label>
            <DateRangePicker value={range} onChange={setRange} placeholder="Select a date range" className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white" clearable />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Project / Service PO</Label>
          <SearchableSelect
            options={filterOptions}
            value={filterValue}
            onValueChange={(v) => v && setFilterValue(v)}
            placeholder="All Projects & Service POs"
            searchPlaceholder="Search project or Service PO..."
            className="h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white"
          />
        </div>
      </FilterPanel>

      {hasSelection && errorMessage && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {!hasSelection && (
        <EmptyState title="Select a date range to view your project hours report." />
      )}

      {showLoading && <TreeSkeleton />}

      {hasSelection && !showLoading && !errorMessage && (
        projects.length === 0 ? (
          <EmptyState title="No mapped Projects/Service POs for this period." />
        ) : (
          <>
            {/* `flex-1 min-h-0` makes this box take exactly the remaining space below the filters
                (and above Grand Total), and its OWN `overflow-y-auto` is what scrolls — not the
                page. The "Project / Service PO / Hierarchy" header row stays outside that scroll
                region (a `shrink-0` sibling) so it never scrolls out of view. */}
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-sm"
            >
              <div className={cn('grid shrink-0 gap-2 border-b bg-muted/30 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground', GRID_COLS)}>
                <span className="pl-6">Project / Service PO / Hierarchy</span>
                <span className="text-right">Hours</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {projects.map((project) => (
                  <TreeRow
                    key={project.key}
                    node={project}
                    depth={0}
                    expandedKeys={expandedKeys}
                    onToggle={toggleKey}
                  />
                ))}
              </div>
            </motion.div>

            <div className="flex shrink-0 items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
              <span className="inline-flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="flex flex-col">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Grand Total</span>
                  <span className="text-xs text-muted-foreground">
                    {projects.length} project{projects.length === 1 ? '' : 's'}
                  </span>
                </span>
              </span>
              <span className="text-xl font-bold tabular-nums text-foreground">{formatHours(data?.grand_total_hours)}</span>
            </div>
          </>
        )
      )}
    </div>
  );
};

export default EmployeeProjectHoursReport;
