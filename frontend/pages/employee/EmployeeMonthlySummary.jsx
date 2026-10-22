import { useState, useMemo } from 'react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { useQueryClient } from '@tanstack/react-query';
import { Save, Download, Trash2 } from 'lucide-react';
import {
  useEmployeeMonthlySummary, useSaveWorkLogDay, useEmployeeMonthlyWorkLog, useSaveWorkLogMonth, useDeleteWorkLogMonth,
} from '@/hooks/useEmployeeWorkLog';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import {
  buildMonthlySummaryRows, buildDayEntries, validateDayEntries,
} from '@/utils/employeeMonthlySummary';
import MonthNavigator from '@/components/employee/MonthNavigator';
import SummaryTable from '@/components/employee/SummaryTable';
import WorkLogEntryTable from '@/components/employee/WorkLogEntryTable';
import { DAILY_HOURS_CAP, MONTHLY_HOURS_CAP } from '@/components/employee/WorkLogEntryModal';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ConfirmDialog from '@/components/common/ConfirmDialog';

// Month View has no real per-day date, so every row is bucketed under this one pseudo-day key —
// same trick My Work Log's Monthly tab uses — letting it reuse the exact same row-building
// (buildMonthlySummaryRows/buildDayEntries) and rendering (WorkLogEntryTable) Day View uses.
const MONTH_DAY_KEY = 1;
const pseudoMonthDate = (year, month) => `${year}-${String(month).padStart(2, '0')}-01`;

// Mirrors SummaryTable's own cell/total computation so the export matches exactly what's on
// screen, including any unsaved edits — not a separate re-fetch of server values.
const exportSummaryToExcel = (rows, edits, month, year) => {
  const daysInMonth = dayjs(`${year}-${String(month).padStart(2, '0')}-01`).daysInMonth();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const cellValue = (row, day) => {
    const edited = edits?.[row.rowKey]?.[day];
    return edited !== undefined ? Number(edited || 0) : Number(row.hoursByDay?.[day] ?? 0);
  };

  const header = ['Service / Project', ...days.map((d) => String(d)), 'Total'];
  const dataRows = rows.map((row) => {
    const values = days.map((day) => cellValue(row, day));
    const total = values.reduce((sum, v) => sum + v, 0);
    return [`${'  '.repeat(row.depth ?? 0)}${row.label}`, ...values, total];
  });
  const totalsRow = ['Total', ...days.map((day) => rows.reduce((sum, row) => sum + cellValue(row, day), 0)), rows.reduce((sum, row) => sum + days.reduce((s, day) => s + cellValue(row, day), 0), 0)];

  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows, totalsRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Monthly Summary');
  XLSX.writeFile(wb, `Monthly_Summary_${dayjs(`${year}-${String(month).padStart(2, '0')}-01`).format('MMMM_YYYY')}.xlsx`);
};

// Month View's export — rows are keyed on the single MONTH_DAY_KEY pseudo-day, so this mirrors
// exportSummaryToExcel but with one hours column instead of one per calendar day.
const exportMonthlyWorkLogToExcel = (rows, edits, month, year) => {
  const cellValue = (row) => {
    const edited = edits?.[row.rowKey]?.[MONTH_DAY_KEY];
    return edited !== undefined ? Number(edited || 0) : Number(row.hoursByDay?.[MONTH_DAY_KEY] ?? 0);
  };

  const header = ['Service / Project', 'Total Hours'];
  const dataRows = rows.map((row) => [`${'  '.repeat(row.depth ?? 0)}${row.label}`, cellValue(row)]);
  const totalsRow = ['Total', rows.reduce((sum, row) => sum + cellValue(row), 0)];

  const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows, totalsRow]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Monthly Summary');
  XLSX.writeFile(wb, `Monthly_Summary_${dayjs(`${year}-${String(month).padStart(2, '0')}-01`).format('MMMM_YYYY')}.xlsx`);
};

// Beside My Work Log — a day-by-day view of the same pending+synced work log entries,
// grouped by Service/Project instead of by date. Reuses the monthly-summary endpoint My
// Work Log's dashboard card already calls; `buildMonthlySummaryRows` flattens its per-day
// Service PO + hierarchy breakdown into one row per node.
//
// Only a leaf node is editable — either a Service PO with no breakdown, or a hierarchy
// Parent/Child node with no further breakdown of its own. A cell maps 1:1 to a work log entry
// for that employee/PO(/hierarchy node)/date; any row with children underneath it is a rollup
// display only. A shared description covers the whole batch (the entries API requires one)
// rather than asking for 100+ per-cell descriptions. Nothing is sent to the server until Save
// is pressed.
//
// Neither /daily nor /monthly-summary exposes individual entry ids anymore (both return an
// aggregated tree), which is moot for saving now anyway: POST /entries is a whole-day replace,
// not a per-row create/update. One call per edited date, each carrying every row that should
// survive that date (edited cells overlaid on the already-loaded hours) — any row left out of
// the array is deleted server-side, so a save must never send just the touched cells.
//
// Month View edits against the separate whole-month Monthly Work Log (/employee-timesheets/
// monthly) — same interaction model as Day View, just one save that replaces every Daily Work
// Log entry for the month at once, gated by the backend's `eligible` flag. That's a materially
// bigger blast radius than one day's save, so it goes through a confirm dialog first.
const MonthlySummaryPage = () => {
  const today = dayjs().startOf('day');
  const [month, setMonth] = useState(today.month() + 1);
  const [year, setYear] = useState(today.year());
  // 'day' (default) keeps today's calendar/day rendering untouched; 'month' swaps in the
  // whole-month editable view. Toggling only changes viewMode on the same month/year.
  const [viewMode, setViewMode] = useState('day');
  // { [rowKey]: { [day]: hoursString } } — unsaved cell overrides, cleared on save/month change.
  // rowKey is `po:<servicePOId>` or `h:<hierarchyId>` (see buildMonthlySummaryRows) since a
  // hierarchy node and a Service PO don't share an id space.
  const [edits, setEdits] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Month View's own edits, keyed the same way but bucketed under MONTH_DAY_KEY instead of a
  // calendar day.
  const [monthlyEdits, setMonthlyEdits] = useState({});
  const [monthlyDescriptions, setMonthlyDescriptions] = useState({});
  const [isMonthlySaving, setIsMonthlySaving] = useState(false);
  const [isMonthlyDeleting, setIsMonthlyDeleting] = useState(false);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const { success, error: showError } = useNotification();
  const qc = useQueryClient();

  const {
    data: summary, isLoading, isError,
  } = useEmployeeMonthlySummary(month, year);

  const {
    data: monthlyData, isLoading: isMonthlyLoading, isError: isMonthlyError,
  } = useEmployeeMonthlyWorkLog(month, year, viewMode === 'month');

  const saveDayMutation = useSaveWorkLogDay();
  const saveMonthMutation = useSaveWorkLogMonth();
  const deleteMonthMutation = useDeleteWorkLogMonth();

  const rows = useMemo(() => buildMonthlySummaryRows(summary), [summary]);
  const editedCount = Object.values(edits).reduce((n, byDay) => n + Object.keys(byDay).length, 0);

  const monthlyRows = useMemo(
    () => buildMonthlySummaryRows([{ date: pseudoMonthDate(year, month), service_pos: monthlyData?.service_pos ?? [] }]),
    [monthlyData, year, month]
  );
  const monthlyEditedCount = useMemo(() => {
    const keys = new Set();
    Object.entries(monthlyEdits).forEach(([rowKey, byDay]) => { if (byDay?.[MONTH_DAY_KEY] !== undefined) keys.add(rowKey); });
    Object.entries(monthlyDescriptions).forEach(([rowKey, byDay]) => { if (byDay?.[MONTH_DAY_KEY] !== undefined) keys.add(rowKey); });
    return keys.size;
  }, [monthlyEdits, monthlyDescriptions]);
  // `eligible` comes straight from the backend response — never computed here.
  const isMonthlyIneligible = !isMonthlyLoading && monthlyData != null && monthlyData.eligible === false;
  const hasExistingMonthlyEntries = monthlyRows.some((r) => Number(r.hoursByDay?.[MONTH_DAY_KEY] ?? 0) > 0);

  const handleMonthChange = (m, y) => {
    setMonth(m);
    setYear(y);
    setEdits({});
    setMonthlyEdits({});
    setMonthlyDescriptions({});
  };

  const handleCellChange = (rowKey, day, value) => {
    if (!rowKey) return;
    setEdits((prev) => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [day]: value },
    }));
  };

  const handleDiscard = () => setEdits({});

  const handleSave = async () => {
    // Edits can span multiple days in the grid, but a whole-day save is per-date — one POST per
    // edited date, each carrying every row (edited + carried-over) that should survive that date.
    const editedDays = new Set();
    Object.values(edits).forEach((byDay) => Object.keys(byDay).forEach((day) => editedDays.add(Number(day))));

    const overCap = Object.values(edits)
      .flatMap((byDay) => Object.values(byDay).map((rawHours) => Number(rawHours || 0)))
      .find((hours) => hours < 0 || hours > DAILY_HOURS_CAP);
    if (overCap !== undefined) {
      showError(`Hours must be between 0 and ${DAILY_HOURS_CAP}.`);
      return;
    }

    const dayPayloads = [...editedDays].map((day) => {
      const date = dayjs(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`).format('YYYY-MM-DD');
      return { date, entries: buildDayEntries(rows, day, edits) };
    });

    for (const { date, entries } of dayPayloads) {
      const validationError = validateDayEntries(entries, date, DAILY_HOURS_CAP);
      if (validationError) {
        showError(validationError);
        return;
      }
    }

    setIsSaving(true);
    try {
      for (const { date, entries } of dayPayloads) {
        await saveDayMutation.mutateAsync({ timesheet_date: date, entries });
      }
      success('Monthly summary saved.');
      setEdits({});
      qc.invalidateQueries({ queryKey: ['employee-worklog'] });
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleMonthlyCellChange = (rowKey, cellDay, value) => {
    if (!rowKey) return;
    setMonthlyEdits((prev) => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [cellDay]: value },
    }));
  };

  const handleMonthlyDescriptionChange = (rowKey, cellDay, value) => {
    if (!rowKey) return;
    setMonthlyDescriptions((prev) => ({
      ...prev,
      [rowKey]: { ...prev[rowKey], [cellDay]: value },
    }));
  };

  const handleMonthlyDiscard = () => {
    setMonthlyEdits({});
    setMonthlyDescriptions({});
  };

  const handleMonthlySaveConfirmed = async () => {
    const entries = buildDayEntries(monthlyRows, MONTH_DAY_KEY, monthlyEdits, monthlyDescriptions);
    setIsMonthlySaving(true);
    try {
      await saveMonthMutation.mutateAsync({ month, year, entries });
      success('Monthly work log saved.');
      setMonthlyEdits({});
      setMonthlyDescriptions({});
      setConfirmSaveOpen(false);
      qc.invalidateQueries({ queryKey: ['employee-worklog'] });
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setIsMonthlySaving(false);
    }
  };

  const handleDeleteMonthConfirmed = async () => {
    setIsMonthlyDeleting(true);
    try {
      await deleteMonthMutation.mutateAsync({ month, year });
      success('Monthly work log deleted.');
      setMonthlyEdits({});
      setMonthlyDescriptions({});
      setConfirmDeleteOpen(false);
      qc.invalidateQueries({ queryKey: ['employee-worklog'] });
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setIsMonthlyDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Monthly Summary</h1>
          <p className="text-sm text-muted-foreground">
            {viewMode === 'day'
              ? 'Hours logged per Service/Project for each day of the month.'
              : 'Log your total hours per Service/Project for the whole month.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={viewMode} onValueChange={setViewMode}>
            <TabsList>
              <TabsTrigger value="day">Day View</TabsTrigger>
              <TabsTrigger value="month">Month View</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
            onClick={() => (viewMode === 'day'
              ? exportSummaryToExcel(rows, edits, month, year)
              : exportMonthlyWorkLogToExcel(monthlyRows, monthlyEdits, month, year))}
            disabled={viewMode === 'day' ? (isLoading || rows.length === 0) : (isMonthlyLoading || monthlyRows.length === 0)}
          >
            <Download className="mr-1.5 h-4 w-4" />
            Export Excel
          </Button>
        </div>
      </div>

      {viewMode === 'day' && isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Unable to load your monthly summary. Please try again.
        </div>
      )}
      {viewMode === 'month' && isMonthlyError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Unable to load monthly work log. Please try again.
        </div>
      )}

      <MonthNavigator month={month} year={year} onChange={handleMonthChange} />

      {viewMode === 'day' ? (
        <SummaryTable
          month={month}
          year={year}
          rows={rows}
          isLoading={isLoading}
          edits={edits}
          onCellChange={handleCellChange}
        />
      ) : (
        <div className="space-y-3">
          {isMonthlyIneligible && (
            <Alert variant="warning">
              <AlertDescription>
                {monthlyData?.message || 'This month is not open for editing.'}
              </AlertDescription>
            </Alert>
          )}
          <WorkLogEntryTable
            rows={monthlyRows}
            day={MONTH_DAY_KEY}
            isLoading={isMonthlyLoading}
            isPastOrToday={!isMonthlyIneligible}
            edits={monthlyEdits}
            onCellChange={handleMonthlyCellChange}
            hoursCap={MONTHLY_HOURS_CAP}
            emptyMessage="No Service POs mapped."
            descriptions={monthlyDescriptions}
            onDescriptionChange={handleMonthlyDescriptionChange}
          />
        </div>
      )}

      {/* Save sits last — after the table, only relevant once something's actually changed. */}
      {viewMode === 'day' && (
        <div className="flex items-center justify-end gap-3 rounded-xl border bg-card px-4 py-3">
          <span className="mr-auto text-xs text-muted-foreground">
            {editedCount > 0 ? `${editedCount} unsaved change${editedCount === 1 ? '' : 's'}` : 'No changes to save'}
          </span>
          <Button variant="outline" size="sm" onClick={handleDiscard} disabled={editedCount === 0 || isSaving}>
            Discard
          </Button>
          <Button size="sm" onClick={handleSave} disabled={editedCount === 0 || isSaving}>
            <Save className="mr-1.5 h-4 w-4" />
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}

      {viewMode === 'month' && monthlyRows.length > 0 && (
        <div className="flex items-center justify-end gap-3 rounded-xl border bg-card px-4 py-3">
          <span className="mr-auto text-xs text-muted-foreground">
            {monthlyEditedCount > 0 ? `${monthlyEditedCount} unsaved change${monthlyEditedCount === 1 ? '' : 's'}` : 'No changes to save'}
          </span>
          {hasExistingMonthlyEntries && !isMonthlyIneligible && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={isMonthlyDeleting || isMonthlySaving}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleMonthlyDiscard} disabled={monthlyEditedCount === 0 || isMonthlySaving}>
            Discard
          </Button>
          <Button
            size="sm"
            onClick={() => setConfirmSaveOpen(true)}
            disabled={monthlyEditedCount === 0 || isMonthlySaving || isMonthlyIneligible}
          >
            <Save className="mr-1.5 h-4 w-4" />
            {isMonthlySaving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmSaveOpen}
        onOpenChange={setConfirmSaveOpen}
        title="Replace Daily Work Logs?"
        description="Saving a Monthly Work Log will replace all existing Daily Work Logs for the selected month. Do you want to continue?"
        confirmLabel="Continue"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={handleMonthlySaveConfirmed}
        isLoading={isMonthlySaving}
      />

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete Monthly Work Log?"
        description={`This will delete the Monthly Work Log for ${dayjs(pseudoMonthDate(year, month)).format('MMMM YYYY')}.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={handleDeleteMonthConfirmed}
        isLoading={isMonthlyDeleting}
      />
    </div>
  );
};

export default MonthlySummaryPage;
