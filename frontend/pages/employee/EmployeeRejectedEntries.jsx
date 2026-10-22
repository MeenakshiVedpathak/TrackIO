import { useState } from 'react';
import { Pencil, RotateCcw, Trash2, ChevronLeft, ChevronRight, XCircle, X } from 'lucide-react';
import { useEmployeeEntries, useDeleteWorkLogEntry, useResubmitWorkLogEntry } from '@/hooks/useEmployeeWorkLog';
import { useEmployeeMappedProjects } from '@/hooks/useEmployeeProjects';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { formatDate, formatDateTime, formatHoursMinutes } from '@/utils/formatters';
import { sortServicePOsHierarchically } from '@/utils/servicePOHierarchy';
import EmptyState from '@/components/common/EmptyState';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import WorkLogEntryModal from '@/components/employee/WorkLogEntryModal';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableSelect } from '@/components/ui/searchable-select';

const LIMIT = 10;

const emptyFilters = { poId: '', startDate: '', endDate: '' };

// Work Log Rejection Workflow (2026-08-23), Employee side. Lists only status=rejected entries
// via the flat GET /employee-timesheets/entries?status=rejected list — distinct from the
// aggregated /daily and /monthly trees the Work Log/Time Entry/Monthly Summary screens use,
// since those expose no per-entry id for Edit/Resubmit/Delete to target.
const EmployeeRejectedEntries = () => {
  const { success, error: showError } = useNotification();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(emptyFilters);
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
  const hasActiveFilters = !!(filters.poId || filters.startDate || filters.endDate);

  const updateFilter = (patch) => {
    setPage(1);
    setFilters((prev) => ({ ...prev, ...patch }));
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
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Rejected Entries</h1>
        <p className="text-sm text-muted-foreground">
          Entries your Manager sent back — edit and resubmit, or delete them.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
        <div className="min-w-[200px] flex-1">
          <SearchableSelect
            options={[{ label: 'All Projects', value: '' }, ...projectOptions]}
            value={filters.poId}
            onValueChange={(v) => updateFilter({ poId: v })}
            placeholder="All Projects"
            searchPlaceholder="Search projects…"
          />
        </div>
        <DatePicker
          value={filters.startDate}
          onChange={(d) => updateFilter({ startDate: d })}
          placeholder="From date"
          ariaLabel="From date"
          clearable
          className="w-auto min-w-[9.5rem]"
        />
        <DatePicker
          value={filters.endDate}
          onChange={(d) => updateFilter({ endDate: d })}
          placeholder="To date"
          ariaLabel="To date"
          clearable
          className="w-auto min-w-[9.5rem]"
        />
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => updateFilter(emptyFilters)}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

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
          description={hasActiveFilters ? 'No rejected entries match these filters.' : "Everything you've logged is pending or already approved."}
        />
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{projectName(entry.service_po_id)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(entry.timesheet_date ?? entry.work_date)} · {formatHoursMinutes(entry.hours)}
                  </p>
                </div>
              </div>

              {entry.description && <p className="text-sm text-muted-foreground">{entry.description}</p>}

              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <p className="font-medium">
                  Rejected{entry.rejected_by_name ? ` by ${entry.rejected_by_name}` : ''}
                  {entry.rejected_at ? ` on ${formatDateTime(entry.rejected_at)}` : ''}
                </p>
                {entry.rejection_remark && <p className="mt-1">{entry.rejection_remark}</p>}
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setDeleteTarget(entry)} className="text-destructive hover:text-destructive">
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Delete
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditTask(entry)}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleResubmit(entry)}
                  disabled={resubmitMutation.isPending && resubmitMutation.variables === entry.id}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  {resubmitMutation.isPending && resubmitMutation.variables === entry.id ? 'Resubmitting…' : 'Resubmit'}
                </Button>
              </div>
            </div>
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
