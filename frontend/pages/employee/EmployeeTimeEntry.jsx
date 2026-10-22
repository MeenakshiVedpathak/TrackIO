import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import dayjs from 'dayjs';
import { useQueryClient } from '@tanstack/react-query';
import {
  Save, CalendarDays, AlertCircle, BarChart3, Loader2, Trash2,
} from 'lucide-react';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import { DatePicker } from '@/components/ui/date-picker';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import ProjectSelect from '@/components/employee/ProjectSelect';
import TimeSegmentsInput, { BLANK_SEGMENT, AddTimeBlockButton } from '@/components/employee/TimeSegmentsInput';
import { employeeWorkLogApi } from '@/api/employeeWorkLog.api';
import { useEmployeeMappedProjects } from '@/hooks/useEmployeeProjects';
import { useEmployeeEntries, useSaveWorkLogDay, useDeleteWorkLogEntry } from '@/hooks/useEmployeeWorkLog';
import { useNotification } from '@/hooks/useNotification';
import { ROUTES } from '@/constants/routes';
import { extractApiError, extractFieldErrors } from '@/services/apiClient';
import { buildOtherDayEntries, validateSegments, sumSegmentHours } from '@/utils/employeeTimeEntry';
import { formatHoursMinutes } from '@/utils/formatters';
import { DAILY_HOURS_CAP } from '@/components/employee/WorkLogEntryModal';

const taskSchema = z.object({
  service_po_id: z.string().min(1, 'Service PO is required'),
  // Module = a top-level hierarchy node, Task = one of its children. Both optional (a project may
  // have no hierarchy at all); whichever is deepest becomes the single hierarchy_node_id the
  // backend takes. Per-block descriptions live on the segments, not here.
  module_node_id: z.string().optional(),
  task_node_id: z.string().optional(),
  timesheet_date: z.string().min(1, 'Date is required'),
});

// Earliest time of day a block may start or end on this screen — the workday opens at 6 AM, so
// the pickers grey out everything before it instead of letting a time be chosen and then rejected.
// Only bounds what can be PICKED here; already-saved entries outside the window still display.
const WORKDAY_START_TIME = '06:00';

const blankDefaults = (date) => ({
  service_po_id: '',
  module_node_id: '',
  task_node_id: '',
  timesheet_date: date,
});

// Cap-aware color for the running Total Hours readout — matches the semantics of
// [[feedback_negative_available_hours]]-style "warn before the server has to" badges used
// elsewhere in the app: green while comfortably under, amber approaching the 12h cap, red once
// over (the server always has the final say — this is just earlier, friendlier feedback).
const totalHoursTone = (hours) => {
  if (hours > DAILY_HOURS_CAP) return { badge: 'destructive', bar: 'bg-destructive', text: 'text-destructive' };
  if (hours >= DAILY_HOURS_CAP * 0.75) return { badge: 'warning', bar: 'bg-warning', text: 'text-warning' };
  return { badge: 'success', bar: 'bg-success', text: 'text-success' };
};

// "09:30:00" / "09:30" -> "09:30 AM", for the read-only Entries panel. The API hands back
// "HH:mm:ss"; anything unparseable is echoed through rather than rendered as NaN.
const formatClock = (value) => {
  if (!value) return '';
  const [h, m] = String(value).split(':');
  const hour = Number(h);
  if (Number.isNaN(hour)) return String(value);
  const suffix = hour < 12 ? 'AM' : 'PM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(hour12).padStart(2, '0')}:${m ?? '00'} ${suffix}`;
};

// Numbered section header — the form reads as three ordered questions rather than a flat stack of
// fields. `aside` is pinned right (used by step 2 for its running total).
const RequiredMark = () => <span className="ml-0.5 text-destructive">*</span>;

const StepHeading = ({ step, title, after, aside }) => (
  <div className="flex flex-wrap items-center gap-2.5">
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
      {step}
    </span>
    <h2 className="text-base font-semibold">{title}</h2>
    {after}
    {aside && <div className="ml-auto shrink-0">{aside}</div>}
  </div>
);

// Separate screen from "Work Log" (EmployeeTimesheet.jsx) — that form is pure hours, this one is
// pure start/end time segments; a line is never both (see backend spec). Pick Module/Task + date,
// add one or more segments, save. No hours field: it's always server-computed as their sum.
//
// Same POST/PUT endpoints as Work Log, and the same whole-day-replace hazard on POST — see
// utils/employeeTimeEntry.js for how this form reads the day back first and either targets a
// single existing row with PUT (when an id is available) or resends every other row untouched
// alongside this one via POST.
const EmployeeTimeEntry = () => {
  const navigate = useNavigate();
  const today = dayjs().format('YYYY-MM-DD');
  const { success, error: showError } = useNotification();
  const qc = useQueryClient();
  const { data: projects = [] } = useEmployeeMappedProjects();
  const saveDayMutation = useSaveWorkLogDay();
  const deleteEntryMutation = useDeleteWorkLogEntry();
  const [segments, setSegments] = useState([BLANK_SEGMENT]);
  // The Entries panel group awaiting delete confirmation, or null.
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const form = useForm({
    resolver: zodResolver(taskSchema),
    defaultValues: blankDefaults(today),
  });

  const selectedServicePOId = form.watch('service_po_id');
  const selectedModuleId = form.watch('module_node_id');
  const selectedTaskId = form.watch('task_node_id');
  const selectedDate = form.watch('timesheet_date');
  const selectedProject = projects.find((p) => String(p.id) === String(selectedServicePOId));

  // Two-level tree (parents = Modules, children = Tasks), so the Task list is simply the selected
  // Module's children. The deepest pick wins as the node the entry is filed against.
  const moduleNodes = selectedProject?.hierarchy ?? [];
  const selectedModule = moduleNodes.find((n) => String(n.id) === String(selectedModuleId));
  const taskNodes = selectedModule?.children ?? [];
  // A project with no hierarchy has nothing to pick, so the whole Module / Task step is dropped
  // (time is then logged against the Service PO itself). The Task select likewise only appears
  // once the chosen Module actually has children — a leaf Module has no tasks to offer.
  const hasHierarchy = moduleNodes.length > 0;
  const hasTasks = taskNodes.length > 0;
  // Time Blocks is step 2 normally, but becomes step 1 when there's no Module / Task step above it.
  const timeBlocksStep = hasHierarchy ? 2 : 1;
  // Deepest pick wins; '' means "the Service PO itself" (a null hierarchy_node_id server-side).
  const selectedHierarchyNodeId = selectedTaskId || selectedModuleId || '';
  // Everything below the Project field is inert until one is chosen: a time block only means
  // something in the context of the project it's logged against.
  const hasProject = !!selectedServicePOId;
  const blocksDisabled = isSaving || !hasProject;

  // The last block must be complete before another can be added: same rule submit() enforces
  // (both times), just applied up front so half-filled rows can't pile up. Description is
  // deliberately not part of this — it's optional, so an empty one must never block adding a block.
  const lastSegment = segments[segments.length - 1];
  const lastBlockComplete = !!lastSegment?.start_time && !!lastSegment?.end_time;

  // Read-only "Entries for <date>" panel. GET /daily only exposes rolled-up hours per node, so the
  // per-block times/descriptions come from the flat, individually-id'd entries list instead.
  const { data: savedEntriesData, isFetching: isFetchingSaved } = useEmployeeEntries({
    startDate: selectedDate,
    endDate: selectedDate,
    limit: 100,
  }, !!selectedDate);

  // The query keeps the previous date's result as placeholder data while refetching, so rows are
  // filtered by their own date rather than trusting the query key — otherwise switching date could
  // momentarily prefill the form from the day before.
  const savedRowsForDate = useMemo(
    () => (savedEntriesData?.data ?? []).filter(
      (row) => String(row.timesheet_date ?? row.work_date ?? '').slice(0, 10) === selectedDate
    ),
    [savedEntriesData, selectedDate]
  );

  const nodeNameById = useMemo(() => {
    const map = new Map();
    projects.forEach((project) => {
      (project.hierarchy ?? []).forEach((parent) => {
        map.set(String(parent.id), parent.node_name ?? parent.name ?? '');
        (parent.children ?? []).forEach((child) => {
          map.set(String(child.id), child.node_name ?? child.name ?? '');
        });
      });
    });
    return map;
  }, [projects]);

  // Grouped exactly as the panel reads: one heading per Module > Task, each listing the blocks
  // saved against it. Several rows can share a heading — one row per block is how a block keeps
  // its own description (the API stores description per entry, not per segment).
  const savedGroups = useMemo(() => {
    const rows = savedRowsForDate;
    const groups = new Map();

    rows.forEach((row) => {
      const project = projects.find((p) => String(p.id) === String(row.service_po_id));
      const parent = (project?.hierarchy ?? []).find(
        (n) => String(n.id) === String(row.hierarchy_node_id)
          || (n.children ?? []).some((c) => String(c.id) === String(row.hierarchy_node_id))
      );
      const nodeName = nodeNameById.get(String(row.hierarchy_node_id)) ?? '';
      const parentName = parent && String(parent.id) !== String(row.hierarchy_node_id)
        ? (parent.node_name ?? parent.name ?? '')
        : '';
      const label = [parentName, nodeName].filter(Boolean);

      // The form edits one (project, node) pair at a time, so group by that identity rather than by
      // the display label — two projects could share a label. `displayName` is the project name, the
      // heading shown when the project has no hierarchy and `label` is empty.
      const servicePoId = String(row.service_po_id ?? '');
      const nodeId = String(row.hierarchy_node_id ?? '');
      // Split the flat hierarchy_node_id back into the form's Module + Task selects: a node that is
      // itself a top-level parent is the Module (no Task); otherwise it's a Task under its parent.
      let moduleNodeId = '';
      let taskNodeId = '';
      if (nodeId && parent && String(parent.id) === nodeId) {
        moduleNodeId = nodeId;
      } else if (nodeId && parent) {
        moduleNodeId = String(parent.id);
        taskNodeId = nodeId;
      } else if (nodeId) {
        moduleNodeId = nodeId;
      }
      const key = `${servicePoId}|${nodeId}`;
      const displayName = project?.name ?? 'Project';

      if (!groups.has(key)) {
        // `rowIds` is what the panel's delete acts on: DELETE /employee-timesheets/entries/:id
        // takes a ROW id, and one heading can be backed by more than one row (the backend is free
        // to split a (project, node) pair across rows), so they're collected rather than assumed
        // to be a single id. Block ids can't be used — they identify segments, which have no
        // endpoint of their own (removing one block is an edit + save, not a delete).
        groups.set(key, { key, label, displayName, servicePoId, moduleNodeId, taskNodeId, hours: 0, blocks: [], rowIds: [] });
      }
      const group = groups.get(key);
      group.hours += Number(row.hours ?? 0);
      if (row.id != null) group.rowIds.push(row.id);

      const segments = row.timeEntries ?? row.time_entries ?? [];
      if (segments.length) {
        segments.forEach((seg, i) => {
          group.blocks.push({
            id: seg.id ?? `${row.id}-${i}`,
            range: `${formatClock(seg.start_time)} - ${formatClock(seg.end_time)}`,
            // Per-segment description — blocks under one row can each have their own, so the
            // row-level `description` (which mirrors only the first block) must not be used here.
            description: seg.description ?? row.description ?? '',
            hours: seg.duration_hours != null ? Number(seg.duration_hours) : sumSegmentHours([seg]),
          });
        });
      } else {
        group.blocks.push({
          id: `${row.id}-h`,
          range: 'Hours-wise entry',
          description: row.description ?? '',
          hours: Number(row.hours ?? 0),
        });
      }
    });

    return Array.from(groups.values());
  }, [savedRowsForDate, projects, nodeNameById]);

  const savedTotal = useMemo(
    () => Math.round(savedGroups.reduce((sum, g) => sum + g.hours, 0) * 100) / 100,
    [savedGroups]
  );

  const filledSegments = segments.filter((s) => s.start_time || s.end_time);
  const totalHours = sumSegmentHours(filledSegments);
  const tone = totalHoursTone(totalHours);

  // Selecting a Project + Module/Task + Date that already has blocks saved against it loads them
  // into the editor instead of showing an empty row. This isn't only a convenience: saving is a
  // whole-day replace that drops every existing line for this exact (project, node) pair and
  // rewrites it from these rows, so blocks that weren't loaded here would be deleted on save.
  const selectionKey = `${selectedServicePOId}|${selectedHierarchyNodeId}|${selectedDate}`;
  const prefilledKeyRef = useRef(null);

  useEffect(() => {
    if (!selectedServicePOId || !selectedDate) return;
    // Wait for this date's own rows to land, or the first pass would prefill from stale data and
    // the guard below would then block the correct one.
    if (isFetchingSaved) return;
    if (prefilledKeyRef.current === selectionKey) return;
    prefilledKeyRef.current = selectionKey;

    const matching = savedRowsForDate.filter(
      (row) => String(row.service_po_id) === String(selectedServicePOId)
        && String(row.hierarchy_node_id ?? '') === String(selectedHierarchyNodeId)
    );

    // Each saved segment carries its own description, so it loads with the block it belongs to.
    // Falling back to the row's description here would collapse every block to the first one's
    // text and then overwrite the rest on the next save. "HH:mm:ss" -> "HH:mm" for the pickers.
    const loaded = matching.flatMap((row) =>
      (row.timeEntries ?? row.time_entries ?? [])
        .filter((seg) => seg.start_time && seg.end_time)
        .map((seg) => ({
          start_time: String(seg.start_time).slice(0, 5),
          end_time: String(seg.end_time).slice(0, 5),
          description: seg.description ?? row.description ?? '',
        }))
    );

    setSegments(loaded.length ? loaded : [BLANK_SEGMENT]);
    setFormError(null);
  }, [selectionKey, isFetchingSaved, savedRowsForDate, selectedServicePOId, selectedHierarchyNodeId, selectedDate]);

  const handleSegmentsChange = (next) => {
    setSegments(next);
    if (formError) setFormError(null);
  };

  const submit = async (values) => {
    setFormError(null);
    const segmentError = validateSegments(filledSegments);
    if (segmentError) {
      setFormError(segmentError);
      return;
    }

    setIsSaving(true);
    try {
      // Always re-read the day fresh right before writing — this is the whole-day-replace hazard
      // the backend spec calls out: whichever form saves last must know about the other form's
      // rows, and a stale client-side cache could be missing something saved moments ago.
      const dailyData = await employeeWorkLogApi.getDaily(values.timesheet_date);
      const hierarchyNodeId = values.task_node_id || values.module_node_id || null;
      const otherEntries = buildOtherDayEntries(dailyData, values.timesheet_date, values.service_po_id, hierarchyNodeId);
      const otherHours = otherEntries.reduce((sum, e) => sum + Number(e.hours || 0), 0);

      if (otherHours + totalHours > DAILY_HOURS_CAP) {
        setFormError(`Total hours for ${values.timesheet_date} cannot exceed ${DAILY_HOURS_CAP}. This would total ${otherHours + totalHours} hours.`);
        return;
      }

      // One entry line per time block, each carrying that block's description. The backend merges
      // lines sharing a (service_po_id, hierarchy_node_id) into a single row while keeping every
      // segment's own description on its time entry — so a read back returns one row whose
      // timeEntries[].description differ, which is what the panel and prefill above rely on. One
      // submit therefore writes N lines, ruling out the single-row PUT this form used to prefer
      // and leaving the whole-day replace as the only path; every other line is resent alongside.
      await saveDayMutation.mutateAsync({
        timesheet_date: values.timesheet_date,
        entries: [
          ...otherEntries,
          ...filledSegments.map((seg) => ({
            service_po_id: values.service_po_id,
            hierarchy_node_id: hierarchyNodeId,
            // Optional — an untouched box saves as an empty description rather than blocking the
            // save, and `seg.description` is undefined on a freshly added block.
            description: String(seg.description ?? '').trim(),
            time_entries: [{ start_time: seg.start_time, end_time: seg.end_time }],
          })),
        ],
      });

      success('Time entry saved.');
      // Keep the current selection (Project / Module / Task / Date) and the blocks in the editor
      // so the user can log another entry against the same context without re-picking it — it
      // stays put until they hit "Clear All". The editor already mirrors what was just saved, so
      // we deliberately don't blank the segments: this form saves as a whole-day replace for the
      // (project, node) pair, and clearing them here would make the very next save delete what we
      // just wrote. The prefill guard already points at this selection, so nothing reloads.
      qc.invalidateQueries({ queryKey: ['employee-worklog'] });
    } catch (err) {
      const fieldErrors = extractFieldErrors(err);
      if (Object.keys(fieldErrors).length) {
        Object.entries(fieldErrors).forEach(([field, message]) => form.setError(field, { message }));
      } else {
        showError(extractApiError(err));
      }
    } finally {
      setIsSaving(false);
    }
  };

  // "Clear All" — the only thing that drops the current selection now that saving keeps it. Wipes
  // Project / Module / Task and the time blocks back to blank; the date is kept so logging several
  // entries for the same day doesn't mean re-picking it each time.
  const handleClearAll = () => {
    form.reset(blankDefaults(form.getValues('timesheet_date') || today));
    setSegments([BLANK_SEGMENT]);
    setFormError(null);
    // Re-selecting the same Project/Module/Task has to prefill again rather than being turned away
    // by the guard still holding that selection as its last-applied key.
    prefilledKeyRef.current = null;
  };

  // Clicking an entry in the "Entries for <date>" panel loads it into the form for editing: select
  // its Project + Module/Task and the prefill effect fills in its time blocks. The date is already
  // the panel's date, so it's left untouched.
  const handleEditGroup = (group) => {
    form.setValue('service_po_id', group.servicePoId);
    form.setValue('module_node_id', group.moduleNodeId);
    form.setValue('task_node_id', group.taskNodeId);
    setFormError(null);
  };

  // Deleting saved time is its own action, not a side effect of emptying the editor: clearing a
  // block only wipes the form, and the form then can't be saved empty (validateSegments requires
  // at least one), so without this there was no way off the screen for an entry that shouldn't
  // exist. Uses DELETE /employee-timesheets/entries/:id rather than a whole-day replace with the
  // row omitted — same end state, but it can't take neighbouring rows down with it if the
  // pre-read is stale.
  const handleConfirmDelete = async () => {
    const group = deleteTarget;
    if (!group) return;
    try {
      await Promise.all(group.rowIds.map((id) => deleteEntryMutation.mutateAsync(id)));
      // If the editor is still holding what was just deleted, the next save would re-create it
      // (this form writes as a whole-day replace for the pair). Drop the blocks and release the
      // prefill guard so the now-empty selection re-reads instead of standing on stale rows.
      if (group.key === `${selectedServicePOId}|${selectedHierarchyNodeId}`) {
        setSegments([BLANK_SEGMENT]);
        setFormError(null);
        prefilledKeyRef.current = null;
      }
      success('Time entry deleted.');
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="min-w-0 shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight">Time Entry</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Log your work in seconds. We&rsquo;ll calculate the rest.
        </p>
      </div>

      {/* Form + Entries panel stay side by side at every width — never stacked. Each column has
          its own sensible minimum width (660px form, 360px panel); once the two can't both fit
          the viewport, this row overflows and the wrapper scrolls horizontally instead of either
          column shrinking below its minimum or the panel dropping underneath the form. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex min-w-fit items-start gap-6">
          {/* No viewport-height cap here — TimeSegmentsInput's own row list already caps itself
              at a fixed 300px (see ROWS_MAX_HEIGHT) so many blocks can't grow the page unbounded.
              Pinning this card's height to `100dvh - <fixed offset>` on top of that used to work,
              but on a short viewport (1024x768/1280x720/1366x768 all have limited height) that
              budget can be smaller than the Module/Task fields + heading + even one row need,
              squeezing the row list into an unusably short scroll box. Sizing naturally and
              letting the page itself scroll vertically avoids that regardless of viewport height. */}
          <div className="min-w-[660px] flex-1 space-y-2.5">
          <Card className="overflow-hidden">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(submit)} className="flex min-h-0 flex-col">
                <CardContent className="flex min-h-0 flex-col gap-3 overflow-hidden p-6">
                  {formError && (
                    <Alert variant="destructive" className="shrink-0">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{formError}</AlertDescription>
                    </Alert>
                  )}

                  {/* Date + Project sit above the numbered steps — they scope the whole entry
                      rather than being a step of their own. */}
                  <div className="grid shrink-0 gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="timesheet_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date<RequiredMark /></FormLabel>
                          <FormControl>
                            <DatePicker
                              value={field.value}
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
                          <FormLabel>Project<RequiredMark /></FormLabel>
                          <FormControl>
                            <ProjectSelect
                              value={field.value}
                              onChange={(v) => {
                                if (v !== field.value) {
                                  form.setValue('module_node_id', '');
                                  form.setValue('task_node_id', '');
                                }
                                field.onChange(v);
                              }}
                              disabled={isSaving}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {hasHierarchy && (
                    <>
                    <Separator className="shrink-0" />

                    <section className="shrink-0 space-y-3">
                    <StepHeading step={1} title="Select Module / Task" />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="module_node_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <SearchableSelect
                                options={moduleNodes.map((n) => ({
                                  value: String(n.id),
                                  label: n.node_name ?? n.name ?? '',
                                }))}
                                value={field.value || ''}
                                onValueChange={(v) => {
                                  // Task list is scoped to the Module, so a Module change can't
                                  // leave a task from the previous one selected.
                                  if (v !== field.value) form.setValue('task_node_id', '');
                                  field.onChange(v);
                                }}
                                disabled={isSaving}
                                placeholder="Select module"
                                searchPlaceholder="Search module…"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {hasTasks && (
                        <FormField
                          control={form.control}
                          name="task_node_id"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <SearchableSelect
                                  options={taskNodes.map((n) => ({
                                    value: String(n.id),
                                    label: n.node_name ?? n.name ?? '',
                                  }))}
                                  value={field.value || ''}
                                  onValueChange={(v) => field.onChange(v)}
                                  disabled={isSaving}
                                  placeholder="Select task"
                                  searchPlaceholder="Search task…"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                    </section>
                    </>
                  )}

                  <Separator className="shrink-0" />

                  <section className="flex min-h-0 flex-col gap-3">
                    <StepHeading
                      step={timeBlocksStep}
                      title="Add Time Blocks"
                      after={
                        <AddTimeBlockButton
                          onClick={() => handleSegmentsChange([...segments, BLANK_SEGMENT])}
                          disabled={blocksDisabled || !lastBlockComplete}
                          title={
                            !hasProject
                              ? 'Select a project first'
                              : !lastBlockComplete
                                ? 'Fill in the start and end time of the current block first'
                                : undefined
                          }
                          className="px-3 py-1.5 text-xs"
                        />
                      }
                      aside={
                        <Badge variant={tone.badge} className="tabular-nums">
                          Total: {formatHoursMinutes(totalHours)}
                        </Badge>
                      }
                    />
                    {!hasProject && (
                      <p className="text-xs text-muted-foreground">
                        Select a project above to start logging time.
                      </p>
                    )}
                    <TimeSegmentsInput
                      segments={segments}
                      onChange={handleSegmentsChange}
                      disabled={blocksDisabled}
                      showDescription
                      showAddButton={false}
                      scrollRows
                      minTime={WORKDAY_START_TIME}
                    />
                  </section>
                </CardContent>

                <CardFooter className="shrink-0 justify-end gap-2 border-t bg-muted/20 px-6 py-3">
                  <Button type="button" variant="outline" onClick={handleClearAll} disabled={isSaving}>
                    Clear All
                  </Button>
                  <Button type="submit" disabled={blocksDisabled}>
                    <Save className="mr-1.5 h-4 w-4" />
                    {isSaving ? 'Saving…' : 'Save Time Entry'}
                  </Button>
                </CardFooter>
              </form>
            </Form>
          </Card>
        </div>

          <div className="w-[360px] shrink-0 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 truncate">Entries for {dayjs(selectedDate).format('DD MMM YYYY')}</span>
                {isFetchingSaved && (
                  <Loader2
                    className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
                    aria-label="Refreshing entries"
                  />
                )}
              </CardTitle>
            </CardHeader>
            {/* The query holds the previous result as placeholder data while refetching, so the
                list stays readable and just dims — no collapse-then-repopulate flicker after a save. */}
            <CardContent
              className={cn(
                'space-y-4 pt-0 transition-opacity duration-200',
                isFetchingSaved && 'opacity-50'
              )}
            >
              {savedGroups.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {isFetchingSaved ? 'Loading entries…' : 'Nothing logged for this date yet.'}
                </p>
              ) : (
                <>
                  {savedGroups.map((group) => (
                    <div key={group.key} className="space-y-2">
                      {/* Edit and delete sit side by side as siblings — the heading is itself a
                          button, and a button can't be nested inside another. */}
                      <div className="-mx-1 flex items-start gap-1">
                        <button
                          type="button"
                          onClick={() => handleEditGroup(group)}
                          title="Edit this entry"
                          className="group/entry flex min-w-0 flex-1 items-baseline justify-between gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/60"
                        >
                          <span className="min-w-0 truncate text-sm font-semibold transition-colors group-hover/entry:text-primary">
                            {group.label.length
                              ? group.label.map((part, i) => (
                                  <span key={part + i}>
                                    {i > 0 && <span className="mx-1 font-normal text-muted-foreground">&gt;</span>}
                                    {part}
                                  </span>
                                ))
                              : group.displayName}
                          </span>
                          <span className="shrink-0 text-sm font-semibold tabular-nums">
                            {formatHoursMinutes(group.hours)}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(group)}
                          disabled={deleteEntryMutation.isPending || isSaving}
                          title="Delete this entry"
                          aria-label={`Delete the entry for ${group.label.length ? group.label.join(' > ') : group.displayName}`}
                          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {group.blocks.map((block) => (
                        <div key={block.id} className="space-y-0.5 text-xs">
                          <p className="text-muted-foreground">{block.range}</p>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="min-w-0 flex-1 truncate text-muted-foreground">
                              {block.description || '—'}
                            </span>
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {formatHoursMinutes(block.hours)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}

                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold">Total</span>
                    <span className={cn('text-base font-semibold tabular-nums', totalHoursTone(savedTotal).text)}>
                      {formatHoursMinutes(savedTotal)}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Button
            type="button"
            variant="outline"
            className="w-full justify-center gap-2 text-primary"
            onClick={() => navigate(ROUTES.EMPLOYEE_MONTHLY_SUMMARY)}
          >
            <BarChart3 className="h-4 w-4" /> View Monthly Summary
          </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this time entry?"
        description={deleteTarget
          ? `${formatHoursMinutes(deleteTarget.hours)} logged against ${deleteTarget.label.length ? deleteTarget.label.join(' > ') : deleteTarget.displayName} on ${dayjs(selectedDate).format('DD MMM YYYY')} will be removed. This can't be undone.`
          : ''}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
        isLoading={deleteEntryMutation.isPending}
      />
    </div>
  );
};

export default EmployeeTimeEntry;
