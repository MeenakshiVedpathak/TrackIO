import { useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Users, Check, X, Plus, Search, Building2, CheckCircle2 } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import DataTable from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useSelectableEntities } from '@/hooks/useSelectableEntities';
import { useSelectableBusinessUnits } from '@/hooks/useSelectableBusinessUnits';
import { useResourceBudgetMappedEmployees, useResourceBudgetsByServicePo, useBulkSaveResourceBudgets } from '@/hooks/useResourceBudgets';
import { useCanWrite } from '@/hooks/usePermissions';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { formatMonthYear, getInitials } from '@/utils/formatters';
import { fromApiMonth, toApiMonth } from '@/utils/monthApi';

const MONTHLY_HOURS_CAP = 176;
const RESOURCE_COL_WIDTH = 220;
const TOTAL_COL_WIDTH = 110;

const matrixColumnHelper = createColumnHelper();

// Months must be added in strict sequence — the next entry is always the latest existing month +
// 1, never a gap or a jump. `null` (no months yet) means the very first month is still free to pick.
const computeNextPeriod = (sortedApiMonths) => {
  if (sortedApiMonths.length === 0) return null;
  const latest = fromApiMonth(sortedApiMonths[sortedApiMonths.length - 1]);
  const month = latest.month === 12 ? 1 : latest.month + 1;
  const year = latest.month === 12 ? latest.year + 1 : latest.year;
  return { month, year };
};

// Defined once at module scope (stable function identity) and fed live state through
// `table.options.meta` instead of closures baked into the column def — the column list itself
// only changes when months/employees change, not on every keystroke. If this cell were instead a
// fresh inline arrow function recreated on every keystroke, react-table would see a new `cell`
// function each render, React would treat it as a different component type, and the input would
// remount (and lose focus) after every character typed.
const AddMonthHeaderCell = ({ table }) => {
  const m = table.options.meta;
  if (!m.addingInline) {
    return (
      <Button size="sm" variant="outline" title="Add month" onClick={m.startAdding} className="h-6 w-6 p-0 rounded">
        <Plus className="h-3.5 w-3.5" />
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      {m.nextPeriod ? (
        <span className="text-xs font-semibold whitespace-nowrap">{formatMonthYear(m.nextPeriod.month, m.nextPeriod.year)}</span>
      ) : (
        <MonthYearPicker
          value={m.draftPeriod}
          onChange={m.setDraftPeriod}
          placeholder="Month"
          clearable={false}
          className="h-7 w-28 bg-white text-xs"
        />
      )}
      <Button
        size="sm"
        title="Save"
        disabled={!m.canSaveDraft}
        onClick={m.handleSaveDraft}
        className="h-6 w-6 p-0 bg-emerald-500 hover:bg-emerald-600 text-white rounded transition-colors"
      >
        <Check className="h-3 w-3" />
      </Button>
      <Button size="sm" variant="outline" title="Cancel" disabled={m.isSaving} onClick={m.cancelAdding} className="h-6 w-6 p-0 rounded">
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
};

const AddMonthInputCell = ({ row, table }) => {
  const m = table.options.meta;
  if (!m.addingInline) return null;
  const empId = row.original.empId;
  if (!m.mappedEmployeeIds.has(empId)) return <span className="text-xs text-muted-foreground">—</span>;
  const err = m.draftErrors[String(empId)];
  return (
    <Input
      type="number"
      min="0"
      max={MONTHLY_HOURS_CAP}
      step="0.5"
      value={m.draftHours[empId] ?? ''}
      onChange={(e) => m.handleDraftChange(empId, e.target.value)}
      disabled={m.isSaving}
      placeholder="0"
      title={err || undefined}
      className={`h-8 w-24 text-sm ${err ? 'border-destructive focus-visible:ring-destructive' : ''}`}
    />
  );
};

const ResourceBudgetPage = () => {
  const [servicePoId, setServicePoId] = useState('');
  const [addingInline, setAddingInline] = useState(false);
  const [draftPeriod, setDraftPeriod] = useState(null);
  const [draftHours, setDraftHours] = useState({}); // { [empId]: hoursString }
  const [draftErrors, setDraftErrors] = useState({}); // { [empId]: message }

  const canManage = useCanWrite();
  const { success, error: showError } = useNotification();

  // Entity → Business Unit → Service PO, in that order. Entity is a pure narrowing step (defaults
  // to "All Entities", same convention as components/common/EntityFilter) that just shrinks the BU
  // dropdown's own options — it never itself rides in a request. A login with a single Entity (or
  // none to choose from) never sees the step at all, same "nothing to narrow" rule as the BU step.
  const { entities, canFilter: showEntityStep } = useSelectableEntities();
  const [entityId, setEntityId] = useState('all');
  const entityOptions = [{ label: 'All Entities', value: 'all' }, ...entities.map((e) => ({ label: e.name, value: String(e.id) }))];

  // Business Unit → Service PO, in that order. A login with more than one selectable BU picks the
  // BU first and the PO list is then scoped to it; a login with a single BU (or none to choose
  // from) goes straight to the PO picker exactly as before — see hooks/useSelectableBusinessUnits.
  const { units: businessUnits, canFilter: showBuStep } = useSelectableBusinessUnits(entityId);
  const [buId, setBuId] = useState('');

  // With the BU step on there is no meaningful PO list until a BU is chosen, so don't fetch one.
  const buChosen = !showBuStep || !!buId;

  const { data: servicePos = [] } = useActiveServicePOs(buChosen, showBuStep ? buId : undefined);
  const selectedPo = servicePos.find((po) => String(po.id) === servicePoId);

  const buOptions = businessUnits.map((bu) => ({ label: bu.name, value: String(bu.id) }));

  // Mobile — see the dedicated `md:hidden` section near the bottom of the JSX. Reuses every piece
  // of state/logic above (`servicePoId`, `nextPeriod`, `draftPeriod`, `draftHours`, `draftErrors`,
  // `addingInline`, `mappedEmployees`, `bulkSaveMutation`) rather than duplicating it — only the
  // presentation differs from desktop's resource×month matrix, which doesn't translate to a phone
  // screen. Desktop is completely untouched.
  const [mobileSearch, setMobileSearch] = useState('');
  const [mobileShowSuccess, setMobileShowSuccess] = useState(false);
  // Mobile-only: which already-saved month (an api "YYYY-MM" string, e.g. the August the user
  // filled in) is being browsed read-only, or null while the flow is on its normal "add next
  // month" path. Desktop's matrix already shows every past month as a read-only column next to
  // the one editable "add month" column — mobile had no equivalent way to look back at what was
  // already saved, only the locked-to-`nextPeriod` box. This doesn't loosen the strict-sequence
  // edit rule at all: a month here is always shown via `matrixRows`/`hoursByEmpMonth` (below),
  // never through `draftHours`, so there's no path back into editing it.
  const [mobileViewMonth, setMobileViewMonth] = useState(null);

  // Switching Entity invalidates whatever BU/PO was already picked — a BU under the previous
  // Entity may not even be in the new, narrower BU list.
  const handleEntityChange = (v) => {
    if (!v) return;
    setEntityId(v);
    setBuId('');
    setServicePoId('');
    cancelAdding();
  };

  // Switching BU invalidates the current PO selection — that PO belongs to the previous BU and
  // would otherwise keep its resource matrix on screen under the new BU's heading.
  const handleBuChange = (v) => {
    if (!v) return;
    setBuId(v);
    setServicePoId('');
    cancelAdding();
  };

  const { data: mappedEmployees = [] } = useResourceBudgetMappedEmployees(servicePoId);
  const { data: poBudgets = [], isPending: isBudgetsLoading } = useResourceBudgetsByServicePo(servicePoId);
  const bulkSaveMutation = useBulkSaveResourceBudgets();

  const mappedEmployeeIds = useMemo(() => new Set(mappedEmployees.map((e) => String(e.id))), [mappedEmployees]);

  // Resource × Month matrix — every active month ever saved for this PO, pivoted so each
  // resource is one row and each month is its own column, with a running Total. Deactivated
  // entries are left out entirely (deactivating a month is meant to remove it from the picture,
  // not show as a zeroed-out column).
  const activeBudgets = useMemo(() => poBudgets.filter((b) => b.status === 'active'), [poBudgets]);

  const matrixMonths = useMemo(
    () => [...new Set(activeBudgets.map((b) => b.month))].sort(),
    [activeBudgets]
  );

  const nextPeriod = useMemo(() => computeNextPeriod(matrixMonths), [matrixMonths]);

  // Union of currently-mapped employees and anyone with a historical entry — an employee who
  // was later unmapped from this PO shouldn't make their past months vanish from the matrix.
  const matrixEmployees = useMemo(() => {
    const map = new Map(mappedEmployees.map((e) => [String(e.id), e]));
    activeBudgets.forEach((b) => {
      const key = String(b.emp_id);
      if (!map.has(key)) map.set(key, null);
    });
    return [...map.entries()]
      .map(([id, emp]) => ({ id, emp }))
      .sort((a, b) => (a.emp?.full_name ?? `Employee #${a.id}`).localeCompare(b.emp?.full_name ?? `Employee #${b.id}`));
  }, [mappedEmployees, activeBudgets]);

  const hoursByEmpMonth = useMemo(() => {
    const map = new Map();
    activeBudgets.forEach((b) => {
      const key = String(b.emp_id);
      if (!map.has(key)) map.set(key, new Map());
      map.get(key).set(b.month, b.hours);
    });
    return map;
  }, [activeBudgets]);

  const matrixRows = useMemo(
    () =>
      matrixEmployees.map(({ id, emp }) => {
        const monthly = hoursByEmpMonth.get(id) ?? new Map();
        const total = matrixMonths.reduce((sum, m) => sum + Number(monthly.get(m) ?? 0), 0);
        return { empId: id, employee: emp, monthly, total };
      }),
    [matrixEmployees, hoursByEmpMonth, matrixMonths]
  );

  const startAdding = () => {
    setDraftPeriod(nextPeriod);
    setDraftHours({});
    setDraftErrors({});
    setAddingInline(true);
  };

  const cancelAdding = () => {
    setAddingInline(false);
    setDraftHours({});
    setDraftErrors({});
    setMobileViewMonth(null);
  };

  const handleDraftChange = (empId, value) => {
    setDraftHours((prev) => ({ ...prev, [empId]: value }));
    setDraftErrors((prev) => {
      if (!(empId in prev)) return prev;
      const next = { ...prev };
      delete next[empId];
      return next;
    });
  };

  const canSaveDraft = !!draftPeriod && mappedEmployees.length > 0 && !bulkSaveMutation.isPending;

  const handleSaveDraft = () => {
    if (!canSaveDraft) return;
    const resources = mappedEmployees.map((emp) => ({ emp_id: emp.id, hours: Number(draftHours[emp.id] || 0) }));
    setDraftErrors({});
    bulkSaveMutation.mutate(
      { service_po_id: Number(servicePoId), month: toApiMonth(draftPeriod), resources },
      {
        onSuccess: () => {
          success(`Resource budget saved for ${formatMonthYear(draftPeriod.month, draftPeriod.year)}.`);
          setAddingInline(false);
          setDraftHours({});
          setDraftErrors({});
        },
        onError: (err) => {
          const errors = err?.response?.data?.errors;
          if (Array.isArray(errors) && errors.length) {
            setDraftErrors(Object.fromEntries(errors.map((e) => [String(e.emp_id), e.message])));
            showError('Some employees exceeded the 176-hour monthly cap. See the highlighted cells.');
          } else {
            showError(extractApiError(err));
          }
        },
      }
    );
  };

  // Mobile step 1 → 2: "Load Employees" is the mobile equivalent of desktop's "+" (startAdding),
  // just with the month picked up front instead of inline in a matrix column header. Same strict-
  // sequence rule as desktop: once a month already exists for this PO, the next one is fixed
  // (`nextPeriod`), not user-choosable; `draftPeriod` only stays editable for a PO's very first
  // month, when `nextPeriod` is null. Bound directly to the same `draftPeriod` state desktop's
  // draft column uses, so picking a month here and tapping "Load Employees" needs no translation.
  const mobilePeriod = draftPeriod ?? nextPeriod;
  const canLoadMobileEmployees = !!mobilePeriod && !!servicePoId;
  const handleMobileLoadEmployees = () => {
    // Browsing an already-saved month: just open the list screen read-only, no draft to seed.
    if (mobileViewMonth) {
      setAddingInline(true);
      return;
    }
    if (!canLoadMobileEmployees) return;
    setDraftPeriod(mobilePeriod);
    setDraftHours({});
    setDraftErrors({});
    setAddingInline(true);
  };

  // The read-only counterpart of `matrixRows` for the one month `mobileViewMonth` names — same
  // employee ordering, but only those who actually have an entry for that month (an employee
  // mapped to the PO today with no hours saved for a past month simply isn't part of that
  // month's picture).
  const mobileViewRows = useMemo(() => {
    if (!mobileViewMonth) return [];
    return matrixRows
      .filter((r) => r.monthly.get(mobileViewMonth) != null)
      .sort((a, b) => (a.employee?.full_name ?? `Employee #${a.empId}`).localeCompare(b.employee?.full_name ?? `Employee #${b.empId}`));
  }, [matrixRows, mobileViewMonth]);

  const mobileViewFiltered = useMemo(() => {
    const q = mobileSearch.trim().toLowerCase();
    if (!q) return mobileViewRows;
    return mobileViewRows.filter((r) =>
      (r.employee?.full_name ?? '').toLowerCase().includes(q) || (r.employee?.employee_code ?? '').toLowerCase().includes(q)
    );
  }, [mobileViewRows, mobileSearch]);

  const mobileViewTotalHours = mobileViewRows.reduce((sum, r) => sum + Number(r.monthly.get(mobileViewMonth) ?? 0), 0);

  // Mobile "Reset" clears the entered hours without leaving the employee list (unlike Cancel,
  // which desktop uses to back out of adding a month entirely) — matches a plain form-reset.
  const handleMobileReset = () => {
    setDraftHours({});
    setDraftErrors({});
  };

  // Same payload/mutation as `handleSaveDraft`, but deliberately doesn't reset `draftHours`/
  // `addingInline` on success — the mobile success dialog is shown over the SAME entered values
  // (see the mockup's 4th screen, where the saved hours are still visible behind the dialog)
  // rather than clearing the screen out from under it.
  const handleMobileSave = () => {
    if (!canSaveDraft) return;
    const resources = mappedEmployees.map((emp) => ({ emp_id: emp.id, hours: Number(draftHours[emp.id] || 0) }));
    setDraftErrors({});
    bulkSaveMutation.mutate(
      { service_po_id: Number(servicePoId), month: toApiMonth(draftPeriod), resources },
      {
        onSuccess: () => setMobileShowSuccess(true),
        onError: (err) => {
          const errors = err?.response?.data?.errors;
          if (Array.isArray(errors) && errors.length) {
            setDraftErrors(Object.fromEntries(errors.map((e) => [String(e.emp_id), e.message])));
            showError('Some employees exceeded the 176-hour monthly cap. See the highlighted cells.');
          } else {
            showError(extractApiError(err));
          }
        },
      }
    );
  };

  const mobileTotalHours = mappedEmployees.reduce((sum, emp) => sum + (Number(draftHours[emp.id]) || 0), 0);
  const mobileReady = Object.keys(draftErrors).length === 0 && mobileTotalHours > 0;
  const mobileFilteredEmployees = useMemo(() => {
    const q = mobileSearch.trim().toLowerCase();
    if (!q) return mappedEmployees;
    return mappedEmployees.filter((e) =>
      (e.full_name ?? '').toLowerCase().includes(q) || (e.employee_code ?? '').toLowerCase().includes(q)
    );
  }, [mappedEmployees, mobileSearch]);

  const matrixColumns = useMemo(() => {
    const cols = [
      // Resource + Total are frozen (sticky) so they stay visible while scrolling through months.
      matrixColumnHelper.accessor((row) => row.employee?.full_name, {
        id: 'resource',
        header: 'Resource',
        size: RESOURCE_COL_WIDTH,
        meta: { sticky: true, left: 0 },
        cell: (info) => {
          const row = info.row.original;
          const label = row.employee ? `${row.employee.full_name} (${row.employee.employee_code})` : `Employee #${row.empId}`;
          return (
            <div className="truncate text-sm font-medium" title={label}>
              {label}
            </div>
          );
        },
      }),
      matrixColumnHelper.accessor('total', {
        header: 'Total',
        size: TOTAL_COL_WIDTH,
        meta: { sticky: true, left: RESOURCE_COL_WIDTH },
        cell: (info) => (
          <span className={`tabular-nums text-sm font-semibold whitespace-nowrap ${info.getValue() > MONTHLY_HOURS_CAP ? 'text-destructive' : ''}`}>
            {info.getValue()}h
          </span>
        ),
      }),
    ];

    matrixMonths.forEach((month) => {
      const p = fromApiMonth(month);
      cols.push(
        matrixColumnHelper.accessor((row) => row.monthly.get(month) ?? null, {
          id: `month-${month}`,
          header: formatMonthYear(p?.month, p?.year),
          size: 110,
          cell: (info) => {
            const v = info.getValue();
            return <span className="tabular-nums text-sm whitespace-nowrap">{v != null ? `${v}h` : '—'}</span>;
          },
        })
      );
    });

    // The "add next month" affordance sits right next to the month columns — either a small "+"
    // trigger, or (once clicked) a live column with one hours input per mapped employee. Its
    // cell/header read fast-changing draft state via `table.options.meta` (set below) rather than
    // via closures, so this array doesn't need to — and must not — be rebuilt on every keystroke.
    if (canManage && matrixRows.length > 0) {
      cols.push(
        matrixColumnHelper.display({
          id: 'add-month',
          enableSorting: false,
          size: 190,
          header: AddMonthHeaderCell,
          cell: AddMonthInputCell,
        })
      );
    }

    return cols;
  }, [matrixMonths, canManage, matrixRows.length]);

  const servicePoOptions = servicePos.map((po) => ({
    value: String(po.id),
    label: `${po.service_po_name}${po.service_po_code ? ` (${po.service_po_code})` : ''}`,
    searchValue: `${po.service_po_name} ${po.service_po_code ?? ''} ${po.client?.client_name ?? ''}`,
  }));

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Resource Budget"
        actions={
          // Both selects share one width so the pair looks even, and stay on a single line
          // (flex-nowrap) instead of the BU select stacking above the PO one. justify-end pins
          // them to the header's right edge; if the header is too narrow, the parent PageHeader
          // wraps the whole pair below the title as a unit rather than splitting the two.
          // `hidden md:flex` — mobile has its own dedicated step-1 form for these same fields
          // (see the `md:hidden` section below) instead of squeezing three fixed-width selects
          // into the header toolbar.
          <div className="hidden flex-nowrap items-center justify-end gap-2 md:flex">
            {showEntityStep && (
              <SearchableSelect
                options={entityOptions}
                value={entityId}
                onValueChange={handleEntityChange}
                placeholder="All Entities"
                searchPlaceholder="Search entity…"
                showSearch={entityOptions.length > 6}
                className="w-56 bg-white"
              />
            )}
            {showBuStep && (
              <SearchableSelect
                options={buOptions}
                value={buId}
                onValueChange={handleBuChange}
                placeholder="Select a Business Unit"
                searchPlaceholder="Search business unit…"
                emptyMessage="No Business Units available."
                showSearch={buOptions.length > 6}
                className="w-64 bg-white"
              />
            )}
            <SearchableSelect
              options={servicePoOptions}
              value={servicePoId}
              onValueChange={(v) => {
                if (!v) return;
                setServicePoId(v);
                cancelAdding();
              }}
              disabled={!buChosen}
              placeholder="Select a Service PO"
              searchPlaceholder="Search Service PO…"
              emptyMessage="No Service POs available."
              className="w-64 bg-white"
            />
          </div>
        }
      />

      {/* Desktop — completely unchanged. `md:contents` (rather than e.g. `md:flex`) so this
          wrapper doesn't itself become a flex box that DataTable would need to fill: its
          EmptyState/DataTable child becomes a direct child of the page's own flex column at
          `md:` and up, exactly as before this wrapper was added. */}
      <div className="hidden md:contents">
        {!servicePoId ? (
          <EmptyState
            icon={Users}
            title={buChosen ? 'Select a Service PO' : 'Select a Business Unit'}
            description={
              buChosen
                ? 'Choose a Service PO above to see every month resource hours have been added for it.'
                : 'Choose a Business Unit above, then pick one of its Service POs.'
            }
          />
        ) : (
          <DataTable
            columns={matrixColumns}
            data={matrixRows}
            isLoading={isBudgetsLoading}
            toolbar={null}
            meta={{
              addingInline,
              draftPeriod,
              setDraftPeriod,
              draftHours,
              draftErrors,
              handleDraftChange,
              mappedEmployeeIds,
              nextPeriod,
              canSaveDraft,
              handleSaveDraft,
              startAdding,
              cancelAdding,
              isSaving: bulkSaveMutation.isPending,
            }}
            emptyState={
              <EmptyState
                title="No resource budgets yet"
                description="No months have been added for this Service PO yet."
              />
            }
          />
        )}
      </div>

      {/* Mobile — a linear "pick PO + month → enter hours → save" flow instead of desktop's
          resource×month matrix, which has no reasonable phone-width equivalent. Reuses every
          piece of state and every mutation above; only the presentation is new. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:hidden">
        {!addingInline ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Entity</Label>
              <SearchableSelect
                options={entityOptions}
                value={entityId}
                onValueChange={handleEntityChange}
                placeholder="All Entities"
                searchPlaceholder="Search entity…"
                showSearch={entityOptions.length > 6}
                className="h-11 w-full bg-white"
              />
            </div>
            {showBuStep && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Business Unit</Label>
                <SearchableSelect
                  options={buOptions}
                  value={buId}
                  onValueChange={handleBuChange}
                  placeholder="Select a Business Unit"
                  searchPlaceholder="Search business unit…"
                  emptyMessage="No Business Units available."
                  showSearch={buOptions.length > 6}
                  className="h-11 w-full bg-white"
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Project / Service PO</Label>
              <SearchableSelect
                options={servicePoOptions}
                value={servicePoId}
                onValueChange={(v) => {
                  if (!v) return;
                  setServicePoId(v);
                  cancelAdding();
                }}
                disabled={!buChosen}
                placeholder="Select a Service PO"
                searchPlaceholder="Search Service PO…"
                emptyMessage="No Service POs available."
                className="h-11 w-full bg-white"
              />
            </div>
            {servicePoId && (
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Month</Label>
                {/* The strict-sequence edit rule is unchanged — only `nextPeriod` can ever be
                    saved to. But once there's at least one saved month, this now also lets a
                    past month be picked to browse read-only (see mobileViewMonth), instead of
                    only ever showing the locked-to-`nextPeriod` box with no way back to what
                    was already filled in. */}
                {matrixMonths.length > 0 ? (
                  <SearchableSelect
                    options={[
                      { label: `${formatMonthYear(nextPeriod.month, nextPeriod.year)} — Add new`, value: 'next' },
                      ...[...matrixMonths].reverse().map((m) => {
                        const p = fromApiMonth(m);
                        return { label: `${formatMonthYear(p?.month, p?.year)} — Filled (view only)`, value: m };
                      }),
                    ]}
                    value={mobileViewMonth ?? 'next'}
                    onValueChange={(v) => setMobileViewMonth(v === 'next' ? null : v)}
                    placeholder="Select month"
                    className="h-11 w-full bg-white"
                  />
                ) : (
                  <MonthYearPicker
                    value={mobilePeriod}
                    onChange={setDraftPeriod}
                    placeholder="Select month"
                    clearable={false}
                    className="h-11 w-full bg-white"
                  />
                )}
              </div>
            )}

            {servicePoId ? (
              <Button
                size="lg"
                className="mt-2 w-full gap-1.5"
                disabled={mobileViewMonth ? false : !canLoadMobileEmployees}
                onClick={handleMobileLoadEmployees}
              >
                {mobileViewMonth ? 'View Month' : 'Load Employees'}
              </Button>
            ) : (
              <EmptyState
                icon={Users}
                title={buChosen ? 'Select a Service PO' : 'Select a Business Unit'}
                description={
                  buChosen
                    ? 'Choose a Service PO above to see every month resource hours have been added for it.'
                    : 'Choose a Business Unit above, then pick one of its Service POs.'
                }
              />
            )}

            {servicePoId && (mobileViewMonth || mobilePeriod) && (
              <div className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {mobileViewMonth ? (
                  <>Viewing hours already saved for {formatMonthYear(fromApiMonth(mobileViewMonth)?.month, fromApiMonth(mobileViewMonth)?.year)} — read-only.</>
                ) : (
                  <>Hours entered here will be saved for {formatMonthYear(mobilePeriod.month, mobilePeriod.year)} for all mapped employees of this PO.</>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              {selectedPo?.client?.client_name && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" /> {selectedPo.client.client_name}
                </p>
              )}
              <button type="button" onClick={cancelAdding} className="text-xs font-medium text-primary">
                Change
              </button>
            </div>

            {mobileViewMonth && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                Viewing {formatMonthYear(fromApiMonth(mobileViewMonth)?.month, fromApiMonth(mobileViewMonth)?.year)} — already saved, read-only.
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/20 p-3">
              <div className="flex flex-col">
                <span className="text-[11px] text-muted-foreground">Total Employees</span>
                <span className="text-lg font-semibold tabular-nums">
                  {mobileViewMonth ? mobileViewRows.length : mappedEmployees.length}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] text-muted-foreground">Total Hours</span>
                <span className="text-lg font-semibold tabular-nums">
                  {mobileViewMonth ? mobileViewTotalHours : mobileTotalHours}h
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[11px] text-muted-foreground">Status</span>
                {mobileViewMonth ? (
                  <span className="mt-1 text-xs font-medium text-muted-foreground">Read-only</span>
                ) : mobileReady ? (
                  <CheckCircle2 className="mt-1 h-6 w-6 text-emerald-500" />
                ) : (
                  <span className="text-lg font-semibold tabular-nums text-muted-foreground">0h</span>
                )}
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={mobileSearch}
                onChange={(e) => setMobileSearch(e.target.value)}
                placeholder="Search employee..."
                className="h-11 pl-9 bg-white"
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {mobileViewMonth ? (
                mobileViewFiltered.length === 0 ? (
                  <EmptyState title="No entries" description="No hours were saved for this month." />
                ) : (
                  mobileViewFiltered.map((row) => (
                    <div key={row.empId} className="flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback>{getInitials(row.employee?.full_name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {row.employee?.full_name ?? `Employee #${row.empId}`}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{row.employee?.employee_code}</p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{row.monthly.get(mobileViewMonth)}h</span>
                    </div>
                  ))
                )
              ) : mobileFilteredEmployees.length === 0 ? (
                <EmptyState title="No mapped employees" description="No employees are mapped to this Service PO." />
              ) : (
                mobileFilteredEmployees.map((emp) => {
                  const err = draftErrors[String(emp.id)];
                  return (
                    <div key={emp.id} className="flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback>{getInitials(emp.full_name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{emp.full_name}</p>
                        <p className="truncate text-xs text-muted-foreground">{emp.employee_code}</p>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        max={MONTHLY_HOURS_CAP}
                        step="0.5"
                        value={draftHours[emp.id] ?? ''}
                        onChange={(e) => handleDraftChange(emp.id, e.target.value)}
                        disabled={bulkSaveMutation.isPending}
                        placeholder="0"
                        title={err || undefined}
                        className={`h-10 w-20 shrink-0 text-sm ${err ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                      />
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t pt-3">
              {mobileViewMonth ? (
                <Button size="lg" className="flex-1" onClick={cancelAdding}>
                  Back
                </Button>
              ) : (
                <>
                  <Button variant="outline" size="lg" className="flex-1" disabled={bulkSaveMutation.isPending} onClick={handleMobileReset}>
                    Reset
                  </Button>
                  <Button size="lg" className="flex-1" disabled={!canSaveDraft} onClick={handleMobileSave}>
                    {bulkSaveMutation.isPending ? 'Saving…' : 'Save Budget'}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={mobileShowSuccess} onOpenChange={setMobileShowSuccess}>
        <DialogContent className="text-center md:hidden">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <p className="mt-4 text-base font-semibold">Budget Saved</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Resource budget for {mobilePeriod ? formatMonthYear(mobilePeriod.month, mobilePeriod.year) : ''} has been saved for {mappedEmployees.length} employees.
          </p>
          <Button size="lg" className="mt-5 w-full" onClick={() => setMobileShowSuccess(false)}>
            OK
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ResourceBudgetPage;
