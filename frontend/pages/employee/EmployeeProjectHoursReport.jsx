import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import {
  useEmployeeProjectHoursFilterTree,
  useEmployeeProjectHoursReport,
} from '@/hooks/useEmployeeProjectHoursReport';
import { extractApiError } from '@/services/apiClient';
import { formatHours } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { SearchableSelect } from '@/components/ui/searchable-select';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';

const REPORT_TYPES = [
  { label: 'Daily', value: 'daily' },
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

const TreeRow = ({ node, depth, expandedKeys, onToggle }) => {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedKeys.has(node.key);

  return (
    <div className="border-t first:border-t-0">
      <button
        type="button"
        onClick={() => hasChildren && onToggle(node.key)}
        disabled={!hasChildren}
        className={cn(
          'w-full grid gap-2 items-center px-4 py-2 text-left hover:bg-muted/30 transition-colors disabled:cursor-default disabled:hover:bg-transparent',
          GRID_COLS,
          depth === 0 && 'font-semibold'
        )}
      >
        <span
          className="flex items-center gap-1.5 truncate"
          style={{ paddingLeft: depth * INDENT_PER_DEPTH_PX }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          {depth > 0 && <span className="text-muted-foreground">└</span>}
          <span className={cn('truncate', depth > 0 && 'text-sm')}>{node.name}</span>
        </span>
        <span className={cn('text-right tabular-nums', depth === 0 ? 'font-semibold' : 'text-sm')}>
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
              transition={{ duration: 0.15 }}
              className="overflow-hidden bg-muted/10"
            >
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

const EmployeeProjectHoursReport = () => {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [reportType, setReportType] = useState('daily');
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const prevMonth = dayjs().subtract(1, 'month');
  const [monthYear, setMonthYear] = useState({ month: prevMonth.month() + 1, year: prevMonth.year() });
  const [range, setRange] = useState(null);
  const [filterValue, setFilterValue] = useState('all');
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());

  const { data: filterTree = [] } = useEmployeeProjectHoursFilterTree();
  const filterOptions = useMemo(() => buildFilterOptions(filterTree), [filterTree]);

  const hasSelection = reportType !== 'range' || !!range;

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

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Project Hours Report"
        description="Hours you've logged against your mapped Projects/Service POs, broken down by hierarchy."
        actions={
          <FilterToggleButton
            isOpen={filtersOpen}
            onToggle={() => setFiltersOpen((prev) => !prev)}
            activeCount={activeFilterCount}
          />
        }
      />

      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[260px]" onClear={clearFilters} showClear={activeFilterCount > 0}>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Report Type</Label>
          <div className="flex items-center rounded-md border overflow-hidden h-9 text-sm bg-white">
            {REPORT_TYPES.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setReportType(value)}
                className={cn(
                  'flex-1 px-3 h-full font-medium text-center whitespace-nowrap transition-colors border-r last:border-r-0',
                  reportType === value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {reportType === 'daily' && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Date</Label>
            <DatePicker
              value={date}
              max={dayjs().format('YYYY-MM-DD')}
              onChange={setDate}
              className="w-full bg-white text-sm"
            />
          </div>
        )}

        {reportType === 'monthly' && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Month</Label>
            <MonthYearPicker value={monthYear} onChange={setMonthYear} className="h-9 w-full text-sm bg-white" />
          </div>
        )}

        {reportType === 'range' && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Date Range</Label>
            <DateRangePicker value={range} onChange={setRange} placeholder="Select a date range" className="h-9 w-full text-sm bg-white" clearable />
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
            className="h-9 w-full text-sm bg-white"
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

      {showLoading && (
        <div className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
      )}

      {hasSelection && !showLoading && !errorMessage && (
        projects.length === 0 ? (
          <EmptyState title="No mapped Projects/Service POs for this period." />
        ) : (
          <>
            <div className="rounded-lg border overflow-hidden">
              <div className={cn('grid gap-2 bg-muted/50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground', GRID_COLS)}>
                <span>Project / Service PO / Hierarchy</span>
                <span className="text-right">Hours</span>
              </div>
              {projects.map((project) => (
                <TreeRow key={project.key} node={project} depth={0} expandedKeys={expandedKeys} onToggle={toggleKey} />
              ))}
            </div>

            <div className="flex justify-end rounded-lg border bg-muted/40 px-4 py-3">
              <span className="text-sm font-semibold tabular-nums">
                Grand Total: {formatHours(data?.grand_total_hours)}
              </span>
            </div>
          </>
        )
      )}
    </div>
  );
};

export default EmployeeProjectHoursReport;
