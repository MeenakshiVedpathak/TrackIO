import { useState } from 'react';
import dayjs from 'dayjs';
import { useQueryClient } from '@tanstack/react-query';
import {
  Pencil, RotateCcw, Trash2, ChevronLeft, ChevronRight, XCircle, FolderKanban, CalendarDays, Clock3,
  MessageSquareWarning,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';
import { useEmployeeEntries, useDeleteWorkLogEntry, useResubmitWorkLogEntry } from '@/hooks/useEmployeeWorkLog';
import { useEmployeeMappedProjects } from '@/hooks/useEmployeeProjects';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { formatDate, formatDateTime, formatHoursMinutes } from '@/utils/formatters';
import { sortServicePOsHierarchically } from '@/utils/servicePOHierarchy';
import EmptyState from '@/components/common/EmptyState';
import PageHeader from '@/components/common/PageHeader';
import FilterPanel from '@/components/common/FilterPanel';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import ReportTypeToggle from '@/components/common/ReportTypeToggle';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import WorkLogEntryModal from '@/components/employee/WorkLogEntryModal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { WeekPicker } from '@/components/ui/week-picker';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { isCalendarWeek } from '@/utils/weekUtils';

const LIMIT = 10;

const initialsOf = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';

// One rejected line: project + date/hours chips, the approver's remark as a quoted note, and the
// Delete / Edit / Resubmit actions in a footer. Rose accent strip marks it as needing action.
const RejectedEntryCard = ({
  entry, index, projectName, onDelete, onEdit, onResubmit, isResubmitting,
}) => {
  const approver = entry.rejected_by_name;
  return (
    <motion.article
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index, 6) * 0.03, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-rose-500" />

      <div className="space-y-3 p-4 pl-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400">
            <FolderKanban className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
            <h3 className="min-w-0 truncate pt-0.5 text-sm font-semibold" title={projectName}>{projectName}</h3>
            {/* Rejected badge + date + hours pinned to the top-right corner (wraps under the title on narrow screens). */}
            <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-900">
                <XCircle className="h-3 w-3" aria-hidden="true" />
                Rejected
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5">
                <CalendarDays className="h-3 w-3" aria-hidden="true" />
                {formatDate(entry.timesheet_date ?? entry.work_date)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-medium tabular-nums text-foreground">
                <Clock3 className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                {formatHoursMinutes(entry.hours)}
              </span>
            </div>
          </div>
        </div>

        {entry.description && (
          <p className="text-sm text-muted-foreground">{entry.description}</p>
        )}

        {/* Approver's remark */}
        <div className="rounded-lg border border-rose-200/80 bg-rose-50/60 p-3 dark:border-rose-900/60 dark:bg-rose-950/20">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
              {approver ? initialsOf(approver) : <MessageSquareWarning className="h-3 w-3" aria-hidden="true" />}
            </span>
            <p className="min-w-0 flex-1 text-xs text-rose-900 dark:text-rose-200">
              <span className="font-semibold">{approver || 'Your approver'}</span>
              <span className="text-rose-700/80 dark:text-rose-300/80"> sent this back</span>
            </p>
            {entry.rejected_at && (
              <span className="shrink-0 text-[11px] text-rose-700/70 dark:text-rose-300/70">
                {formatDateTime(entry.rejected_at)}
              </span>
            )}
          </div>
          <p className="mt-2 border-l-2 border-rose-300 pl-2.5 text-sm text-rose-800 dark:border-rose-800 dark:text-rose-200">
            {entry.rejection_remark || <span className="italic opacity-70">No remark given.</span>}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/30 px-4 py-2.5 pl-5">
        <Button variant="ghost" size="sm" onClick={onDelete} className="mr-auto text-destructive hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" />
          Edit
        </Button>
        <Button size="sm" onClick={onResubmit} disabled={isResubmitting}>
          <RotateCcw className={cn('mr-1.5 h-3.5 w-3.5', isResubmitting && 'animate-spin')} />
          {isResubmitting ? 'Resubmitting…' : 'Resubmit'}
        </Button>
      </div>
    </motion.article>
  );
};

const emptyFilters = { poId: '', startDate: '', endDate: '' };

const PERIOD_MODES = [
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Date Range', value: 'range' },
];

// Monthly is sent as the month's first/last day through the same startDate/endDate the API takes.
const monthToRange = ({ month, year }) => {
  const start = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
  return { startDate: start.format('YYYY-MM-DD'), endDate: start.endOf('month').format('YYYY-MM-DD') };
};

// The month a From/To pair covers exactly (1st to last day), or null when it's any other range.
const rangeToMonth = (startDate, endDate) => {
  if (!startDate || !endDate) return null;
  const start = dayjs(startDate);
  const isWholeMonth = start.date() === 1 && endDate === start.endOf('month').format('YYYY-MM-DD');
  return isWholeMonth ? { month: start.month() + 1, year: start.year() } : null;
};

// Work Log Rejection Workflow (2026-08-23), Employee side. Lists only status=rejected entries
// via the flat GET /employee-timesheets/entries?status=rejected list — distinct from the
// aggregated /daily and /monthly trees the Work Log/Time Entry/Monthly Summary screens use,
// since those expose no per-entry id for Edit/Resubmit/Delete to target.
const EmployeeRejectedEntries = () => {
  const { success, error: showError } = useNotification();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  // Opens on Monthly / current month; "Clear filters" returns here rather than to "everything".
  const [defaultFilters] = useState(() => ({
    ...emptyFilters,
    ...monthToRange({ month: dayjs().month() + 1, year: dayjs().year() }),
  }));
  const [filters, setFilters] = useState(defaultFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [periodMode, setPeriodMode] = useState('monthly');
  const [editTask, setEditTask] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data, isLoading, isError } = useEmployeeEntries({
    status: 'rejected',
    page,
    limit: LIMIT,
    poId: filters.poId || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
  });
  const { data: projects = [] } = useEmployeeMappedProjects();
  const deleteMutation = useDeleteWorkLogEntry();
  const resubmitMutation = useResubmitWorkLogEntry();

  const entries = data?.data ?? [];
  const meta = data?.meta;
  const projectName = (servicePoId) => projects.find((p) => String(p.id) === String(servicePoId))?.name ?? `Service PO #${servicePoId}`;
  const projectOptions = sortServicePOsHierarchically(projects).map((p) => ({
    value: String(p.id),
    label: p.name,
    searchValue: p.name,
  }));
  const periodChanged =
    periodMode !== 'monthly' || filters.startDate !== defaultFilters.startDate || filters.endDate !== defaultFilters.endDate;
  const activeFilterCount = (filters.poId ? 1 : 0) + (periodChanged ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  const resetFilters = () => {
    setPeriodMode('monthly');
    updateFilter(defaultFilters);
  };

  const updateFilter = (patch) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  // A free range carried into Weekly/Monthly would show an empty picker while still filtering, so
  // it's dropped unless it already is an exact week / month. Switching to Range keeps it as-is.
  const handlePeriodModeChange = (mode) => {
    setPeriodMode(mode);
    const fits =
      mode === 'weekly' ? isCalendarWeek(filters.startDate, filters.endDate)
        : mode === 'monthly' ? !!rangeToMonth(filters.startDate, filters.endDate)
          : true;
    if (!fits && (filters.startDate || filters.endDate)) {
      updateFilter({ startDate: '', endDate: '' });
    }
  };

  const handleResubmit = (entry) => {
    resubmitMutation.mutate(entry.id, {
      onSuccess: () => success('Entry resubmitted for approval.'),
      onError: (err) => {
        if (err?.response?.status === 409) {
          showError('This entry was already updated.');
        } else {
          // A 400/403 here means server-side re-validation (project mapping, hour caps, etc.)
          // failed — the fix wasn't enough, so surface the real message and let them edit again.
          showError(extractApiError(err));
        }
      },
    });
  };

  const handleDeleteConfirmed = async () => {
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      success('Entry deleted.');
      setDeleteTarget(null);
    } catch (err) {
      showError(extractApiError(err));
      // Synced to the official Timesheet since this list last loaded — refetch so it drops off
      // (or otherwise stops offering an action that will keep 409-ing) instead of sitting stale.
      if (err?.response?.status === 409) qc.invalidateQueries({ queryKey: ['employee-worklog'] });
    }
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="Rejected Entries"
        description="Entries your Team Lead sent back — edit and resubmit, or delete them."
        actions={(
          <FilterToggleButton
            isOpen={filtersOpen}
            onToggle={() => setFiltersOpen((open) => !open)}
            activeCount={activeFilterCount}
          />
        )}
      />

      <FilterPanel
        isOpen={filtersOpen}
        onClear={resetFilters}
        showClear={hasActiveFilters}
        onClose={() => setFiltersOpen(false)}
      >
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Project</Label>
          <SearchableSelect
            options={[{ label: 'All Projects', value: '' }, ...projectOptions]}
            value={filters.poId}
            onValueChange={(v) => updateFilter({ poId: v })}
            placeholder="All Projects"
            searchPlaceholder="Search projects…"
            className="bg-white"
          />
        </div>

        <ReportTypeToggle
          label="Period"
          options={PERIOD_MODES}
          value={periodMode}
          onChange={handlePeriodModeChange}
        />

        {/* Every mode sets the same startDate/endDate the API already takes — Weekly snaps them
            to a Mon-Sat week, Monthly to the 1st and last day of the month. */}
        {periodMode === 'monthly' ? (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Month</Label>
            <MonthYearPicker
              value={rangeToMonth(filters.startDate, filters.endDate)}
              onChange={(m) => updateFilter(m ? monthToRange(m) : { startDate: '', endDate: '' })}
              placeholder="Select a month"
              className="h-[clamp(1.875rem,2vw,2.25rem)] w-full bg-white text-[clamp(0.75rem,0.85vw,0.875rem)]"
            />
          </div>
        ) : periodMode === 'weekly' ? (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Week</Label>
            <WeekPicker
              value={isCalendarWeek(filters.startDate, filters.endDate)
                ? { startDate: filters.startDate, endDate: filters.endDate }
                : null}
              onChange={(range) => updateFilter({ startDate: range?.startDate ?? '', endDate: range?.endDate ?? '' })}
              placeholder="Select a week"
              className="w-full"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Date Range</Label>
            <DateRangePicker
              value={filters.startDate || filters.endDate ? { startDate: filters.startDate || null, endDate: filters.endDate || null } : null}
              onChange={(range) => updateFilter({ startDate: range?.startDate ?? '', endDate: range?.endDate ?? '' })}
              placeholder="Select a date range"
              className="h-[clamp(1.875rem,2vw,2.25rem)] w-full bg-white text-[clamp(0.75rem,0.85vw,0.875rem)]"
              clearable
            />
          </div>
        )}
      </FilterPanel>

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Unable to load rejected entries. Please try again.
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={XCircle}
          title="No rejected entries."
          description={hasActiveFilters
            ? 'No rejected entries match these filters.'
            : 'Nothing was sent back this month. Change the period in Filters to see older months.'}
        />
      ) : (
        <div className="space-y-3">
          {entries.map((entry, index) => (
            <RejectedEntryCard
              key={entry.id}
              entry={entry}
              index={index}
              projectName={projectName(entry.service_po_id)}
              onDelete={() => setDeleteTarget(entry)}
              onEdit={() => setEditTask(entry)}
              onResubmit={() => handleResubmit(entry)}
              isResubmitting={resubmitMutation.isPending && resubmitMutation.variables === entry.id}
            />
          ))}

          {meta && (meta.hasNext || meta.hasPrev) && (
            <div className="flex items-center justify-end gap-2 pt-1">
              <span className="mr-auto text-xs text-muted-foreground">Page {meta.page} of {meta.totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={!meta.hasPrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={!meta.hasNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      <WorkLogEntryModal
        open={!!editTask}
        onOpenChange={(open) => !open && setEditTask(null)}
        date={editTask?.timesheet_date ?? editTask?.work_date}
        task={editTask}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this entry?"
        description="This rejected entry will be permanently deleted."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={handleDeleteConfirmed}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
};

export default EmployeeRejectedEntries;
