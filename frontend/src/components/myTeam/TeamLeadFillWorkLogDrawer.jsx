import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { Save, Trash2, X } from 'lucide-react';
import { useEmployeeMonthlyWorkLog, useSaveEmployeeMonthlyWorkLog, useDeleteEmployeeMonthlyWorkLog } from '@/hooks/useMyTeam';
import { useEmployeeMappedProjects } from '@/hooks/useEmployeeProjects';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { QUERY_KEYS } from '@/constants/queryKeys';
import { getMonthlyHourCap } from '@/components/employee/WorkLogEntryModal';
import { AutoResizeTextarea, DESCRIPTION_MAX_LENGTH } from '@/components/employee/WorkLogEntryTable';
import { formatHoursMinutes } from '@/utils/formatters';
import { cn } from '@/utils/cn';
import EmptyState from '@/components/common/EmptyState';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { Skeleton } from '@/components/ui/skeleton';

// A hierarchy node nested under a Service PO (Parent/Child) is returned for display only — the
// Team Lead may only ever log against the Service PO container itself here (a future capability
// covers per-node logging). Matches every other endpoint in this app's convention for marking a
// non-top-level row, so whichever of these fields the backend actually sends is covered.
const isTopLevelServicePO = (po) =>
  (po.depth ?? 0) === 0 && !(po.ancestorKeys?.length) && po.hierarchy_node_id == null && po.parent_id == null;

// Field names aren't confirmed yet (this endpoint is net-new) — accepts every plausible variant
// so a naming mismatch degrades gracefully instead of silently blanking the row.
const normalizePO = (po) => ({
  id: String(po.service_po_id ?? po.id),
  label: po.service_po_name ?? po.label ?? po.name ?? po.service_po_code ?? `Service PO #${po.service_po_id ?? po.id}`,
  existingHours: Number(po.hours ?? po.existing_hours ?? po.total_hours ?? 0),
  existingDescription: po.description ?? po.existing_description ?? '',
});

// Per-Employee drawer for "Log Work for My Team" — Manual Entry mode. Opened from the Employee
// list in TeamLeadFillWorkLog.jsx; the parent mounts this with `key={employee.id}` so switching
// Employees always starts from a fresh instance instead of carrying over stale entries/errors.
// Distinct from Timesheet Approval (TeamLeadTimesheetApproval.jsx), which only approves/rejects
// entries the Employee submitted themself: everything saved here is created already-approved (see
// the banner below), so this is a different action entirely, not another way to reach the same
// review queue.
//
// Month/Year has its own picker inside the drawer, seeded from (but independent of) the page's
// shared filter — a Team Lead backfilling one Employee's earlier month shouldn't have to change
// the whole list's filter just to reach it. Everything below (Add Service PO, entries, Save/
// Delete) reads this local value, not the page-level one, and only ever renders once it's set —
// which, since the picker can't be cleared, means immediately, but keeps the dependency explicit
// rather than assumed.
const TeamLeadFillWorkLogDrawer = ({ employee, monthYear: initialMonthYear, open, onOpenChange }) => {
  const { success } = useNotification();
  const qc = useQueryClient();

  const [monthYear, setMonthYear] = useState(initialMonthYear);
  const [entries, setEntries] = useState([]);
  const [addPoId, setAddPoId] = useState('');
  const [formError, setFormError] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Re-seeds from the page's current filter every time the drawer opens (not just on first
  // mount) — reopening the same Employee later should reflect whatever month the list is
  // currently showing, not whatever was last picked in a previous open session.
  useEffect(() => {
    if (open) setMonthYear(initialMonthYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const monthLabel = monthYear
    ? dayjs(`${monthYear.year}-${String(monthYear.month).padStart(2, '0')}-01`).format('MMMM YYYY')
    : 'this month';

  const employeeId = employee?.id ?? null;

  const {
    data: workLog,
    isFetching: isLoadingWorkLog,
    isError: isWorkLogError,
    error: workLogError,
  } = useEmployeeMonthlyWorkLog(employeeId, monthYear, { enabled: open && !!employeeId && !!monthYear });

  // `workLog.service_pos` is the Employee's own full mapped list — a Team Lead mapped to only
  // some of an Employee's Service POs must still only be able to log hours against the ones THEY
  // are also mapped to (the overlap), not every Service PO the Employee happens to be on. The
  // backend has no such intersection endpoint, so it's resolved here against the actor's own
  // mapped projects (same "my mapped Service POs" source WorkLogEntryModal uses for an Employee's
  // own entries).
  //
  // That overlap only makes sense for an actor who IS individually staffed on at least one
  // Service PO (a real Team Lead with partial overlap) — an Admin/senior-tier account using this
  // same screen typically has NO personal Service PO mapping at all, so intersecting against an
  // empty set silently blocked the feature outright for them (confirmed live: "All mapped Service
  // POs added" with zero entries, for every Employee, regardless of that Employee's own
  // mappings). `hasOwnMappings` only engages the overlap once the actor genuinely has some of
  // their own to narrow against; an actor with none falls back to the Employee's full list, same
  // as before this overlap restriction existed.
  const { data: myProjects = [], isPending: isMyProjectsPending } = useEmployeeMappedProjects();
  const myProjectIds = useMemo(() => new Set(myProjects.map((p) => String(p.id))), [myProjects]);
  const hasOwnMappings = myProjectIds.size > 0;

  const availablePOs = useMemo(
    () => (workLog?.service_pos ?? [])
      .filter(isTopLevelServicePO)
      .map(normalizePO)
      .filter((po) => isMyProjectsPending || !hasOwnMappings || myProjectIds.has(po.id)),
    [workLog, myProjectIds, hasOwnMappings, isMyProjectsPending],
  );

  const hadExistingEntries = availablePOs.some((po) => po.existingHours > 0 || po.existingDescription);

  // Resets the editable rows to whatever's already on the server once this Employee/Month's data
  // loads — this is a replace-save, so editing an existing submission has to start from its real
  // current state, not an empty list. Also re-runs on `open`: the Sheet stays mounted between
  // close/reopen (same Employee), so without this an unsaved row added before closing with X would
  // otherwise linger in state even though nothing was ever saved.
  useEffect(() => {
    if (!open) return;
    if (!workLog) {
      setEntries([]);
      return;
    }
    setEntries(
      availablePOs
        .filter((po) => po.existingHours > 0 || po.existingDescription)
        .map((po) => ({
          service_po_id: po.id,
          label: po.label,
          hours: po.existingHours ? String(po.existingHours) : '',
          description: po.existingDescription,
        }))
    );
    setAddPoId('');
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workLog, open]);

  const addedIds = useMemo(() => new Set(entries.map((e) => e.service_po_id)), [entries]);
  const addOptions = availablePOs
    .filter((po) => !addedIds.has(po.id))
    .map((po) => ({ value: po.id, label: po.label }));

  const totalHours = entries.reduce((sum, e) => sum + Number(e.hours || 0), 0);
  const monthlyHourCap = getMonthlyHourCap(monthYear.month, monthYear.year);
  const overCap = totalHours > monthlyHourCap;

  const saveMutation = useSaveEmployeeMonthlyWorkLog();
  const deleteMutation = useDeleteEmployeeMonthlyWorkLog();

  // Picking a Service PO adds its row immediately — no separate "Add New" click needed. The
  // selection is reset right after so the picker is ready for the next pick and the just-added
  // PO (now excluded from `addOptions`) never lingers as a stale selected value.
  const handleSelectPO = (poId) => {
    if (!poId) return;
    const po = availablePOs.find((p) => p.id === poId);
    if (!po) return;
    setEntries((prev) => [...prev, { service_po_id: po.id, label: po.label, hours: '', description: '' }]);
    setAddPoId('');
  };

  const handleRemoveRow = (id) => setEntries((prev) => prev.filter((e) => e.service_po_id !== id));

  const handleEntryChange = (id, field, value) =>
    setEntries((prev) => prev.map((e) => (e.service_po_id === id ? { ...e, [field]: value } : e)));

  const handleSave = async () => {
    setFormError(null);
    if (entries.length === 0) {
      setFormError('Add at least one Service PO entry before saving.');
      return;
    }
    if (entries.some((e) => !(Number(e.hours) > 0))) {
      setFormError('Enter hours greater than 0 for every entry.');
      return;
    }
    if (overCap) {
      setFormError(`Total hours (${formatHoursMinutes(totalHours)}) exceed the ${monthlyHourCap}-hour monthly cap.`);
      return;
    }
    try {
      await saveMutation.mutateAsync({
        employeeId,
        month: monthYear.month,
        year: monthYear.year,
        entries: entries.map((e) => ({
          service_po_id: Number(e.service_po_id),
          sub_project_id: null,
          hours: Number(e.hours),
          description: e.description || '',
        })),
      });
      success(hadExistingEntries ? 'Work log updated for the Employee.' : 'Work log saved for the Employee.');
    } catch (err) {
      // 403 (not mapped / PO not assigned), 400 (cap/duplicate/hierarchy-node), 409 (a Service PO
      // in this submission already synced to the official Timesheet), and 422 (month not yet
      // eligible — the eligible check below should already prevent this, but handled defensively
      // too) all land here as one form-level message, not attached to a field.
      setFormError(extractApiError(err));
      // On a 409 specifically, the drawer's own read of this Employee/Month is now stale (it
      // predates whatever just synced) — refetch so it reflects the current state on next open
      // instead of letting the Team Lead retry the exact same now-guaranteed-to-fail submission.
      if (err?.response?.status === 409) {
        qc.invalidateQueries({ queryKey: QUERY_KEYS.MY_TEAM_EMPLOYEE_MONTHLY_WORKLOG(employeeId, monthYear.month, monthYear.year) });
      }
    }
  };

  const handleDeleteConfirmed = async () => {
    try {
      await deleteMutation.mutateAsync({ employeeId, month: monthYear.month, year: monthYear.year });
      success("This month's work log entries were deleted.");
      setEntries([]);
    } catch (err) {
      setFormError(extractApiError(err));
      if (err?.response?.status === 409) {
        qc.invalidateQueries({ queryKey: QUERY_KEYS.MY_TEAM_EMPLOYEE_MONTHLY_WORKLOG(employeeId, monthYear.month, monthYear.year) });
      }
    } finally {
      setDeleteConfirmOpen(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !saveMutation.isPending && !deleteMutation.isPending && onOpenChange(next)}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 overflow-hidden p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-5 py-4 text-left">
          <SheetTitle>{employee?.full_name ?? 'Employee'}</SheetTitle>
          <SheetDescription>
            {employee?.employee_code ?? ''}{employee?.designation ? ` · ${employee.designation}` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-5">
          {/* Month & Year lives in the same card as Add Service PO, but stays visible regardless
              of eligibility — it has to, since it's the only way to switch away from a month
              that turns out not to be eligible below. Service PO only joins it once eligible. */}
          <div className="flex w-full flex-row gap-3 rounded-xl border bg-muted/20 p-3">
            <div className="flex min-w-0 flex-[3] flex-col gap-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Month &amp; Year</Label>
              <MonthYearPicker
                value={monthYear}
                onChange={(v) => v && setMonthYear(v)}
                placeholder="Select month"
                className="h-11 w-full bg-white sm:h-[clamp(1.875rem,2vw,2.25rem)]"
                clearable={false}
              />
            </div>
            {workLog?.eligible && (
              <div className="flex min-w-0 flex-[7] flex-col gap-1.5">
                <Label className="text-xs font-semibold text-muted-foreground">Add Service PO</Label>
                <SearchableSelect
                  options={addOptions}
                  value={addPoId}
                  onValueChange={handleSelectPO}
                  placeholder={addOptions.length === 0 ? 'All mapped Service POs added' : 'Select Service PO'}
                  searchPlaceholder="Search Service PO…"
                  disabled={addOptions.length === 0}
                  className="h-11 w-full bg-white sm:h-[clamp(1.875rem,2vw,2.25rem)]"
                />
              </div>
            )}
          </div>

          {isLoadingWorkLog ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : isWorkLogError ? (
            <EmptyState title={extractApiError(workLogError)} />
          ) : !workLog?.eligible ? (
            <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
              {monthLabel} hasn&apos;t ended yet — work log hours can only be filled in once a month is complete.
            </div>
          ) : (
            <>
              {formError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {formError}
                </div>
              )}

              {entries.length === 0 ? (
                <EmptyState title="No entries yet — add a Service PO above." />
              ) : (
                <div className="space-y-3">
                  {entries.map((entry) => (
                    <div
                      key={entry.service_po_id}
                      className="space-y-3 rounded-xl border border-l-4 border-l-primary/70 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{entry.label}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(entry.service_po_id)}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Remove"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[7rem_1fr]">
                        <div className="flex flex-col gap-1">
                          <Label className="text-[11px] font-medium text-muted-foreground">Hours</Label>
                          <Input
                            type="number"
                            step="0.5"
                            min="0"
                            value={entry.hours}
                            onChange={(e) => handleEntryChange(entry.service_po_id, 'hours', e.target.value)}
                            className="h-10 w-full"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-[11px] font-medium text-muted-foreground">Description</Label>
                          <AutoResizeTextarea
                            value={entry.description}
                            onChange={(e) => handleEntryChange(entry.service_po_id, 'description', e.target.value.slice(0, DESCRIPTION_MAX_LENGTH))}
                            maxLength={DESCRIPTION_MAX_LENGTH}
                            placeholder="What did they work on?"
                            rows={1}
                            className="min-h-[2.5rem] w-full resize-none rounded-md px-2.5 py-2 text-sm shadow-sm"
                          />
                          <span className="self-end text-[10px] tabular-nums text-muted-foreground">
                            {(entry.description ?? '').length} / {DESCRIPTION_MAX_LENGTH}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {workLog?.eligible && (
          <div className="flex flex-col gap-3 border-t bg-muted/10 px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-muted-foreground">Total Hours</span>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
                  overCap ? 'bg-destructive/10 text-destructive' : 'bg-emerald-50 text-emerald-700'
                )}
              >
                {formatHoursMinutes(totalHours)} / {formatHoursMinutes(monthlyHourCap)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full transition-all', overCap ? 'bg-destructive' : 'bg-emerald-500')}
                style={{ width: `${Math.min(100, (totalHours / monthlyHourCap) * 100)}%` }}
              />
            </div>
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-destructive sm:w-auto"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={!hadExistingEntries || deleteMutation.isPending}
                title={hadExistingEntries ? undefined : 'Nothing to delete for this Employee/Month yet'}
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> Delete Month&apos;s Entries
              </Button>
              <Button
                type="button"
                size="sm"
                className="w-full sm:w-auto"
                onClick={handleSave}
                disabled={saveMutation.isPending || entries.length === 0 || overCap}
              >
                <Save className="mr-1.5 h-4 w-4" />
                {saveMutation.isPending ? 'Saving…' : (hadExistingEntries ? 'Update' : 'Save')}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete this month's work log?"
        description={`This deletes every work log entry for this Employee in ${monthLabel} — not just the entries created here. This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirmed}
        isLoading={deleteMutation.isPending}
      />
    </Sheet>
  );
};

export default TeamLeadFillWorkLogDrawer;
