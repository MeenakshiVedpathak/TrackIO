import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import dayjs from 'dayjs';
import {
  AlignLeft, CalendarDays, Clock3, FolderKanban, ListTree, Loader2, Pencil, Plus, RotateCcw, Save, Send, XCircle,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/utils/cn';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import ProjectSelect from './ProjectSelect';
import TimeSegmentsInput, { BLANK_SEGMENT } from './TimeSegmentsInput';
import { useSaveWorkLogDay, useUpdateWorkLogEntry, useResubmitWorkLogEntry } from '@/hooks/useEmployeeWorkLog';
import { useEmployeeMappedProjects } from '@/hooks/useEmployeeProjects';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError, extractFieldErrors } from '@/services/apiClient';
import { formatDateTime } from '@/utils/formatters';
import { flattenHierarchyTree } from '@/utils/servicePOHierarchy';
import { validateSegments, sumSegmentHours } from '@/utils/employeeTimeEntry';
import { isBlankDescription, LOG_DESC_REQUIRED_MESSAGE } from '@/utils/employeeMonthlySummary';
import { useLogDescRequiredFor } from '@/hooks/useLogDescMandatory';
import { ROUTES } from '@/constants/routes';

export const DAILY_HOURS_CAP = 24;

// Shared bits of the modal's look: labels carry a small leading icon, the footer is a full-bleed
// muted bar under a divider.
const LABEL = 'flex items-center gap-1.5';
const LABEL_ICON = 'h-3.5 w-3.5 text-muted-foreground';
const FOOTER = 'mt-0 shrink-0 gap-2 border-t bg-muted/30 px-6 py-3 sm:space-x-0';

const initialsOf = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
// A standard workday, used only client-side to color the calendar heatmap and the daily
// progress bar (Completed / Partial / No Entry) — the backend has no such target field.
export const EXPECTED_DAILY_HOURS = 8;
// Client-side input sanity bound for Monthly mode's per-node hour field — mirrors the backend's
// own monthly cap (every calendar day in that month counted at the 24h daily cap), not a flat
// number, since the cap itself is now month-length-dependent (Feb vs a 31-day month, etc.).
// `month` is 1-12; `new Date(year, month, 0)` is the standard JS trick for "the last day of
// `month`" since Date's own month argument is 0-indexed one lower than this function's.
export const getMonthlyHourCap = (month, year) => new Date(year, month, 0).getDate() * 24;

// Client-side messages match the backend's Joi wording exactly, so an error looks the same
// whether it's caught here or comes back from the server. The cross-entry daily-total cap
// (this entry + everything else already logged that day > 24h) is deliberately NOT checked
// here — that's a server-owned rule (400, with an exact "current total would be N hours"
// message) surfaced as a toast via extractApiError instead of approximated client-side.
// Hours-wise entries (and new/create mode, which is always hours-wise) require a real Hours
// value; Time-based entries compute Hours from segments instead, so that field is left optional
// here and validated separately via validateSegments (see isTimeBased below).
const hoursTaskSchema = z.object({
  service_po_id: z.string().min(1, 'Service PO is required'),
  hierarchy_node_id: z.string().optional(),
  hours: z.coerce
    .number({ invalid_type_error: 'Hours is required.' })
    .gt(0, 'Hours must be greater than 0.')
    .max(DAILY_HOURS_CAP, 'Hours cannot exceed 24 per day'),
  description: z.string().min(1, 'Description is required').max(500),
  timesheet_date: z.string().min(1, 'Date is required'),
});
const timeBasedTaskSchema = hoursTaskSchema.extend({ hours: z.coerce.number().optional() });

const buildDefaults = (task, date) => ({
  service_po_id: task ? String(task.service_po_id) : '',
  hierarchy_node_id: task?.hierarchy_node_id != null ? String(task.hierarchy_node_id) : '',
  hours: task?.hours ?? '',
  description: task?.description ?? '',
  timesheet_date: task ? dayjs(task.timesheet_date ?? task.work_date).format('YYYY-MM-DD') : dayjs(date).format('YYYY-MM-DD'),
});

// GET's timeEntries (camelCase) carries "HH:mm:ss"; TimeSegmentsInput/TimeRangePicker work in
// "HH:mm". A non-empty timeEntries/time_entries array is what makes an entry Time-based — see
// the Work Log Rejection Workflow API contract (no separate "type" field exists on the backend).
const buildSegmentsFromTask = (task) => {
  const entries = task?.timeEntries ?? task?.time_entries ?? [];
  if (!entries.length) return [{ ...BLANK_SEGMENT }];
  return entries.map((e) => ({
    start_time: e.start_time ? e.start_time.slice(0, 5) : '',
    end_time: e.end_time ? e.end_time.slice(0, 5) : '',
  }));
};

// Create/edit modal for a single Work Log entry. Save & New only applies to create mode —
// there's no "new" flow while editing an existing entry.
//
// Rendered by the Work Log Rejection Workflow (EmployeeRejectedEntries.jsx) to edit a rejected
// entry before resubmitting. A rejected entry's original type (Month-wise / Hours-wise /
// Time-based) is preserved through reject -> resubmit, and the backend has no explicit "type"
// field for it — it's derived here exactly as the API contract specifies:
//   - log_type === 'monthly'          -> Month-wise: not editable here, defer to the Monthly
//                                        tab on My Work Log (EmployeeTimesheet.jsx).
//   - timeEntries/time_entries non-empty -> Time-based: edit via Start/End Time segments,
//                                        Hours becomes a read-only, client-computed display.
//   - otherwise (log_type === 'daily')   -> Hours-wise: the original editable Hours input.
// Editing a rejected entry leaves it 'rejected' (PUT .../:id never changes status); this modal
// resubmits it (PUT .../:id/resubmit) right after a successful edit so the employee doesn't have
// to take a second action to get it back to 'pending'.
//
// NOTE: create mode below sends only this one row to the whole-day-replace POST — correct
// only when the date has no other entries yet. If this modal is reintroduced for a date that
// may already have other rows, create must fetch that day's existing entries first and include
// them alongside this one, or they'll be deleted (see employeeWorkLog.api.js).
const WorkLogEntryModal = ({ open, onOpenChange, date, task }) => {
  const { success, error: showError } = useNotification();
  const qc = useQueryClient();
  const saveDayMutation = useSaveWorkLogDay();
  const updateMutation = useUpdateWorkLogEntry();
  const resubmitMutation = useResubmitWorkLogEntry();
  const isDescRequiredFor = useLogDescRequiredFor();
  const isEdit = !!task;
  const isMonthly = isEdit && task?.log_type === 'monthly';
  const rawTimeEntries = task?.timeEntries ?? task?.time_entries ?? [];
  const isTimeBased = isEdit && Array.isArray(rawTimeEntries) && rawTimeEntries.length > 0;
  const isSaving = saveDayMutation.isPending || updateMutation.isPending || resubmitMutation.isPending;

  const today = dayjs().format('YYYY-MM-DD');
  const { data: projects = [] } = useEmployeeMappedProjects();

  const [segments, setSegments] = useState(() => buildSegmentsFromTask(task));
  const [segmentsError, setSegmentsError] = useState(null);

  const form = useForm({
    resolver: zodResolver(isTimeBased ? timeBasedTaskSchema : hoursTaskSchema),
    defaultValues: buildDefaults(task, date),
  });

  useEffect(() => {
    if (!open) return;
    form.reset(buildDefaults(task, date));
    setSegments(buildSegmentsFromTask(task));
    setSegmentsError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task]);

  const selectedServicePOId = form.watch('service_po_id');
  const selectedProject = projects.find((p) => String(p.id) === String(selectedServicePOId));
  const hierarchyOptions = flattenHierarchyTree(selectedProject?.hierarchy ?? []);

  const filledSegments = segments.filter((s) => s.start_time || s.end_time);
  const totalHours = sumSegmentHours(filledSegments);

  const handleSegmentsChange = (next) => {
    setSegments(next);
    if (segmentsError) setSegmentsError(null);
  };

  const submit = async (values, { keepOpen }) => {
    // Entity rule: a whitespace-only description passes the schema's min(1) but not this rule.
    if (isDescRequiredFor(values.service_po_id) && isBlankDescription(values.description)) {
      form.setError('description', { message: LOG_DESC_REQUIRED_MESSAGE });
      return;
    }
    if (isTimeBased) {
      const segErr = validateSegments(filledSegments);
      if (segErr) {
        setSegmentsError(segErr);
        return;
      }
    }
    try {
      if (isEdit) {
        const payload = {
          service_po_id: values.service_po_id,
          hierarchy_node_id: values.hierarchy_node_id || null,
          sub_project_id: null, // no sub-project selector in this UI
          description: values.description,
          timesheet_date: values.timesheet_date,
          // Time-based: send time_entries, never hours — the backend recalculates hours as the
          // sum of these segments and would otherwise ignore a stale hours value. Hours-wise:
          // send hours, and omit time_entries entirely (an explicit [] would wipe the entry's
          // breakdown, but there isn't one here anyway).
          ...(isTimeBased ? { time_entries: filledSegments } : { hours: values.hours }),
        };
        const updateResult = await updateMutation.mutateAsync({ id: task.id, payload });
        // Re-check status off the update RESPONSE, not the stale `task` prop captured when the
        // modal opened — per this repo's own contract (see useResubmitWorkLogEntry's comment),
        // a plain edit is documented to leave status at 'rejected' untouched, but that's been
        // observed live NOT holding: the backend can flip it to 'pending' as a side effect of the
        // update itself. Calling resubmit anyway in that case is guaranteed to 409 ("current
        // status: pending") — if the entry already isn't 'rejected' post-update, treat it as
        // already effectively resubmitted instead of firing a call known to fail.
        const freshStatus = updateResult?.data?.status ?? updateResult?.status ?? task.status;

        if (freshStatus === 'rejected') {
          try {
            await resubmitMutation.mutateAsync(task.id);
            success('Entry updated and resubmitted for approval.');
          } catch (resubmitErr) {
            const message = extractApiError(resubmitErr);
            // The backend has been seen leaking a raw, internal serialization error ("Converting
            // circular structure to JSON...") into this message on at least one occasion — never
            // show that verbatim to the user.
            const isRawServerError = /circular structure|constructor '/i.test(message);
            showError(
              `Entry updated, but couldn't resubmit automatically: ${
                isRawServerError ? 'Please try resubmitting this entry again from the Rejected Entries list.' : message
              }`
            );
          }
        } else {
          success('Entry updated and resubmitted for approval.');
        }
      } else {
        await saveDayMutation.mutateAsync({
          timesheet_date: values.timesheet_date,
          entries: [{
            service_po_id: values.service_po_id,
            hierarchy_node_id: values.hierarchy_node_id || null,
            hours: values.hours,
            description: values.description,
          }],
        });
        success('Entry saved.');
      }
      if (keepOpen) {
        form.reset(buildDefaults(null, date));
      } else {
        onOpenChange(false);
      }
    } catch (err) {
      if (err?.response?.status === 409) {
        // The entry synced to the official Timesheet after this modal opened (or between the
        // update and the auto-resubmit above) — the server's own message already names it.
        // Refetch so the list this modal was opened from stops offering the same dead action.
        showError(extractApiError(err));
        qc.invalidateQueries({ queryKey: ['employee-worklog'] });
        return;
      }
      const fieldErrors = extractFieldErrors(err);
      if (Object.keys(fieldErrors).length) {
        Object.entries(fieldErrors).forEach(([field, message]) => form.setError(field, { message }));
      } else {
        showError(extractApiError(err));
      }
    }
  };

  const isRejected = task?.status === 'rejected';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="mb-0 shrink-0 border-b px-6 pb-4 pt-5">
          <div className="flex items-start gap-3 pr-6">
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                isRejected
                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
                  : 'bg-primary/10 text-primary',
              )}
            >
              {isRejected ? <RotateCcw className="h-4 w-4" /> : isEdit ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </span>
            <div className="min-w-0 space-y-1 text-left">
              <DialogTitle>{isEdit ? 'Edit Work Log Entry' : 'Add Work Log Entry'}</DialogTitle>
              <DialogDescription className="text-xs">
                {isRejected
                  ? 'Fix what your approver flagged, then resubmit it for approval.'
                  : isEdit ? 'Update the hours or details of this entry.' : 'Log time against one of your projects.'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Only this middle band scrolls — the title above and the buttons below stay in place
            however short the viewport is. */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
        {isRejected && (
          <div className="rounded-lg border border-rose-200/80 bg-rose-50/60 p-3 dark:border-rose-900/60 dark:bg-rose-950/20">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-100 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
                {task.rejected_by_name ? initialsOf(task.rejected_by_name) : <XCircle className="h-3 w-3" />}
              </span>
              <p
                className="min-w-0 flex-1 truncate text-xs text-rose-900 dark:text-rose-200"
                title={`${task.rejected_by_name || 'Your approver'} sent this back`}
              >
                <span className="font-semibold">{task.rejected_by_name || 'Your approver'}</span>
                <span className="text-rose-700/80 dark:text-rose-300/80"> sent this back</span>
              </p>
              {task.rejected_at && (
                <span className="shrink-0 text-[11px] text-rose-700/70 dark:text-rose-300/70">{formatDateTime(task.rejected_at)}</span>
              )}
            </div>
            <p className="mt-2 border-l-2 border-rose-300 pl-2.5 text-sm text-rose-800 dark:border-rose-800 dark:text-rose-200">
              {task.rejection_remark || <span className="italic opacity-70">No remark given.</span>}
            </p>
          </div>
        )}

        {isMonthly ? (
            <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
              This is a Month-Wise entry. Edit and resubmit it from the Monthly tab on{' '}
              <Link
                to={ROUTES.EMPLOYEE_TIMESHEET}
                onClick={() => onOpenChange(false)}
                className="font-medium text-primary underline"
              >
                My Work Log
              </Link>
              .
            </div>
        ) : (
        <Form {...form}>
          <form className="space-y-4">
            <FormField
              control={form.control}
              name="timesheet_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={LABEL}><CalendarDays className={LABEL_ICON} />Date</FormLabel>
                  <FormControl>
                    <DatePicker
                      value={field.value || ''}
                      onChange={field.onChange}
                      max={today}
                      disabled={isSaving}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="service_po_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={LABEL}><FolderKanban className={LABEL_ICON} />Project</FormLabel>
                  <FormControl>
                    <ProjectSelect
                      value={field.value}
                      onChange={(v) => {
                        if (v !== field.value) form.setValue('hierarchy_node_id', '');
                        field.onChange(v);
                      }}
                      disabled={isSaving}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {hierarchyOptions.length > 0 && (
              <FormField
                control={form.control}
                name="hierarchy_node_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LABEL}>
                      <ListTree className={LABEL_ICON} />Module / Task
                      <span className="font-normal text-muted-foreground">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <SearchableSelect
                        options={[
                          { label: 'None — log against the Service PO itself', value: '' },
                          ...hierarchyOptions.map((n) => ({
                            value: String(n.id),
                            searchValue: [n.parentName, n.name].filter(Boolean).join(' '),
                            label: (
                              <span className="flex items-baseline gap-1.5" style={{ paddingLeft: `${n.depth * 16}px` }}>
                                {n.depth > 0 && <span className="text-muted-foreground">{'└'}</span>}
                                <span>{n.name}</span>
                              </span>
                            ),
                          })),
                        ]}
                        value={field.value || ''}
                        onValueChange={(v) => field.onChange(v)}
                        disabled={isSaving}
                        placeholder="None — log against the Service PO itself"
                        searchPlaceholder="Search hierarchy…"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {isTimeBased ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Time Segments</span>
                  <span className="text-xs font-medium text-muted-foreground">
                    {totalHours} {totalHours === 1 ? 'hr' : 'hrs'} (calculated)
                  </span>
                </div>
                <TimeSegmentsInput segments={segments} onChange={handleSegmentsChange} disabled={isSaving} />
                {segmentsError && <p className="text-xs font-medium text-destructive">{segmentsError}</p>}
              </div>
            ) : (
              <FormField
                control={form.control}
                name="hours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LABEL}><Clock3 className={LABEL_ICON} />Hours</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          max={DAILY_HOURS_CAP}
                          placeholder="e.g. 4.5"
                          disabled={isSaving}
                          className="pr-12 tabular-nums"
                          // Same fix as WorkLogEntryTable's HourStepper — a focused number input
                          // otherwise treats page-scroll wheel events as +/- clicks.
                          onWheel={(e) => e.currentTarget.blur()}
                          {...field}
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">hrs</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={LABEL}><AlignLeft className={LABEL_ICON} />Description<span className="text-destructive" aria-hidden="true">*</span></FormLabel>
                  <FormControl>
                    <Textarea placeholder="What did you work on?" disabled={isSaving} maxLength={500} className="min-h-[88px] resize-none" {...field} />
                  </FormControl>
                  <div className="flex items-start justify-between gap-2">
                    <FormMessage />
                    <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{(field.value ?? '').length} / 500</span>
                  </div>
                </FormItem>
              )}
            />
          </form>
        </Form>
        )}
        </div>

        {isMonthly ? (
          <DialogFooter className={FOOTER}>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        ) : (
        <DialogFooter className={FOOTER}>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          {!isEdit && (
            <Button
              variant="secondary"
              size="sm"
              onClick={form.handleSubmit((v) => submit(v, { keepOpen: true }))}
              disabled={isSaving}
            >
              Save & New
            </Button>
          )}
          <Button
            size="sm"
            onClick={form.handleSubmit((v) => submit(v, { keepOpen: false }))}
            disabled={isSaving}
          >
            {isSaving
              ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              : isRejected ? <Send className="mr-1.5 h-3.5 w-3.5" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            {isSaving
              ? (resubmitMutation.isPending ? 'Resubmitting…' : 'Saving…')
              : (isRejected ? 'Save & Resubmit' : 'Save & Close')}
          </Button>
        </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default WorkLogEntryModal;
