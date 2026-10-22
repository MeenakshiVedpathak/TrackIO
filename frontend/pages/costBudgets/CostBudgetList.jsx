import { useEffect, useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, Building2, Check, X, ChevronRight } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import EmptyState from '@/components/common/EmptyState';
import DataTable from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MonthYearPicker } from '@/components/ui/month-year-picker';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useSelectableEntities } from '@/hooks/useSelectableEntities';
import { useSelectableBusinessUnits } from '@/hooks/useSelectableBusinessUnits';
import { useCostBudgetsByServicePo, useCreateCostBudget } from '@/hooks/useCostBudgets';
import { useCanWrite } from '@/hooks/usePermissions';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { formatCurrency, formatMonthYear, formatDate } from '@/utils/formatters';
import { fromApiMonth, toApiMonth } from '@/utils/monthApi';

const columnHelper = createColumnHelper();
const DESCRIPTION_MAX_LEN = 200;

// Desktop-only single row (see the mobile `Sheet` version below for the phone equivalent) —
// column widths mirror the DataTable `size`s below so this inline row lines up with the real rows.
const InlineAddRow = ({ servicePoId, nextPeriod, onDone }) => {
  const [period, setPeriod] = useState(nextPeriod);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const { success, error: showError } = useNotification();
  const createMutation = useCreateCostBudget();

  const canSave = !!period && amount !== '' && !Number.isNaN(Number(amount)) && Number(amount) >= 0;

  const handleSave = () => {
    if (!canSave) return;
    createMutation.mutate(
      {
        service_po_id: servicePoId,
        month: toApiMonth(period),
        invoice_amount: Number(amount),
        description: description || '',
      },
      {
        onSuccess: () => {
          success('Cost budget created successfully.');
          onDone();
        },
        onError: (err) => showError(extractApiError(err)),
      }
    );
  };

  return (
    <div className="flex items-stretch rounded-lg border border-primary/40 bg-primary/5">
      <div className="flex w-[150px] shrink-0 items-center px-3 py-2">
        {nextPeriod ? (
          <span className="text-sm font-medium whitespace-nowrap">{formatMonthYear(period?.month, period?.year)}</span>
        ) : (
          <MonthYearPicker
            value={period}
            onChange={setPeriod}
            placeholder="Select month"
            clearable={false}
            className="h-8 w-full bg-white"
          />
        )}
      </div>
      <div className="flex w-[160px] shrink-0 items-center px-3 py-2">
        <div className="relative w-full">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-sm text-muted-foreground">₹</span>
          <Input
            type="number"
            min="0"
            step="0.01"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="5,00,000"
            className="h-8 pl-6"
          />
        </div>
      </div>
      <div className="flex w-[240px] shrink-0 items-center px-3 py-2">
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="h-8"
        />
      </div>
      <div className="flex shrink-0 items-center gap-1 px-3 py-2">
        <Button
          size="sm"
          title="Save"
          disabled={!canSave || createMutation.isPending}
          onClick={handleSave}
          className="h-6 w-6 p-0 bg-emerald-500 hover:bg-emerald-600 text-white rounded transition-colors"
        >
          <Check className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          title="Cancel"
          disabled={createMutation.isPending}
          onClick={onDone}
          className="h-6 w-6 p-0 rounded"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <div className="flex-1" aria-hidden="true" />
    </div>
  );
};

// Mobile — the same "add a month" action as `InlineAddRow` above (same fields, same strict-
// sequence month rule, same `useCreateCostBudget` mutation), presented as a bottom sheet instead
// of an inline row, per the mobile design. A separate component (rather than branching
// `InlineAddRow` on viewport) since the two don't share a layout at all, only the underlying save.
const MobileAddCostBudgetSheet = ({ open, servicePoId, nextPeriod, onOpenChange, onSaved }) => {
  // Only ever holds the user's OWN pick, for the one case that needs it — a PO's very first
  // month, when there's no `nextPeriod` to fall back on. Whenever `nextPeriod` is set, it wins
  // outright (`effectivePeriod` below) instead of being copied into this state: copying it once
  // and only re-syncing on the Sheet's own `onOpenChange` was the bug here — Radix's
  // `onOpenChange` fires for USER-driven open/close (Escape, overlay click, the X), not for a
  // parent flipping the `open` prop from a plain button click, so opening via "Add Cost Budget"
  // never re-ran that sync. The result: the sheet correctly *displayed* the current `nextPeriod`
  // (read directly, live) while `canSave`/`handleSave` kept using a stale, no-longer-matching
  // `period` from whenever this component had last mounted or last been closed via the X —
  // occasionally submitting an already-used month while the screen showed the right one.
  const [period, setPeriod] = useState(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const { success, error: showError } = useNotification();
  const createMutation = useCreateCostBudget();

  // Reset the draft every time the sheet opens (covers both the externally-triggered open from
  // the "Add Cost Budget" button and any future user-driven reopen alike, unlike the old
  // onOpenChange-only reset).
  useEffect(() => {
    if (open) {
      setPeriod(null);
      setAmount('');
      setDescription('');
    }
  }, [open]);

  const effectivePeriod = nextPeriod ?? period;
  const canSave = !!effectivePeriod && amount !== '' && !Number.isNaN(Number(amount)) && Number(amount) >= 0;

  const handleSave = () => {
    if (!canSave) return;
    createMutation.mutate(
      {
        service_po_id: servicePoId,
        month: toApiMonth(effectivePeriod),
        invoice_amount: Number(amount),
        description: description || '',
      },
      {
        onSuccess: () => {
          success('Cost budget created successfully.');
          onSaved();
        },
        onError: (err) => showError(extractApiError(err)),
      }
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl md:hidden">
        <SheetHeader className="text-left">
          <SheetTitle>Add Cost Budget</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">
              Month <span className="text-destructive">*</span>
            </Label>
            {/* Same strict-sequence rule as desktop: fixed once a month already exists for this
                PO, editable only for the very first one. */}
            {nextPeriod ? (
              <div className="flex h-11 items-center rounded-md border bg-muted/30 px-3 text-sm font-medium">
                {formatMonthYear(nextPeriod.month, nextPeriod.year)}
              </div>
            ) : (
              <MonthYearPicker
                value={period}
                onChange={setPeriod}
                placeholder="Select month"
                clearable={false}
                className="h-11 w-full bg-white"
              />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">
              Invoice Amount <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-muted-foreground">₹</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                className="h-11 pl-7"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Description (Optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX_LEN))}
              placeholder="Enter description"
              maxLength={DESCRIPTION_MAX_LEN}
              rows={3}
            />
            <p className="text-right text-[11px] text-muted-foreground">{description.length}/{DESCRIPTION_MAX_LEN}</p>
          </div>
        </div>
        <SheetFooter className="flex-row gap-2">
          <Button type="button" variant="outline" className="h-11 flex-1" disabled={createMutation.isPending} onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="h-11 flex-1" disabled={!canSave || createMutation.isPending} onClick={handleSave}>
            {createMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

const CostBudgetList = () => {
  const [servicePoId, setServicePoId] = useState('');
  const [addingInline, setAddingInline] = useState(false);
  // Mobile-only — see the dedicated `md:hidden` section near the bottom of the JSX. Desktop's
  // "add a month" affordance is `addingInline` (an inline row); mobile's is this sheet.
  const [mobileAddOpen, setMobileAddOpen] = useState(false);

  const canManage = useCanWrite();

  // Entity → Business Unit → Service PO, in that order. Entity is a pure narrowing step (defaults
  // to "All Entities", same convention as components/common/EntityFilter) that just shrinks the BU
  // dropdown's own options — it never itself rides in a request. A login with a single Entity (or
  // none to choose from) never sees the step at all, same "nothing to narrow" rule as the BU step.
  const { entities, canFilter: showEntityStep } = useSelectableEntities();
  const [entityId, setEntityId] = useState('all');
  const entityOptions = [{ label: 'All Entities', value: 'all' }, ...entities.map((e) => ({ label: e.name, value: String(e.id) }))];

  // Business Unit → Service PO, in that order. A login with more than one selectable BU picks the
  // BU first and the PO list is then scoped to it, so they never have to find one PO among every
  // BU's. A login with a single BU (or none to choose from) skips the step entirely and goes
  // straight to the PO picker, exactly as before — see hooks/useSelectableBusinessUnits.
  const { units: businessUnits, canFilter: showBuStep } = useSelectableBusinessUnits(entityId);
  const [buId, setBuId] = useState('');

  // Gate: with the BU step on, there is no meaningful PO list until a BU is chosen, so don't
  // fetch one. Without it, the PO list loads immediately as it always did.
  const buChosen = !showBuStep || !!buId;

  const { data: servicePos = [] } = useActiveServicePOs(buChosen, showBuStep ? buId : undefined);
  const selectedPo = servicePos.find((po) => String(po.id) === servicePoId);

  const buOptions = businessUnits.map((bu) => ({ label: bu.name, value: String(bu.id) }));

  // Switching Entity invalidates whatever BU/PO was already picked — a BU under the previous
  // Entity may not even be in the new, narrower BU list.
  const handleEntityChange = (v) => {
    if (!v) return;
    setEntityId(v);
    setBuId('');
    setServicePoId('');
    setAddingInline(false);
  };

  // Switching BU invalidates the current PO selection — that PO belongs to the previous BU and
  // would otherwise keep its budget rows on screen under the new BU's heading.
  const handleBuChange = (v) => {
    if (!v) return;
    setBuId(v);
    setServicePoId('');
    setAddingInline(false);
  };

  // Every month ever saved for this PO (active + inactive) — the whole point of this screen is
  // to show all added months at once, not force picking one month at a time.
  const { data: records = [], isPending } = useCostBudgetsByServicePo(servicePoId);

  // "YYYY-MM" sorts correctly as a plain string — most recent month first.
  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => (a.month < b.month ? 1 : a.month > b.month ? -1 : 0)),
    [records]
  );

  // Months must be added in strict sequence — the next entry is always latest existing month + 1,
  // never a gap or a jump. `null` (no records yet) means the very first month is still free to pick.
  const nextPeriod = useMemo(() => {
    if (sortedRecords.length === 0) return null;
    const latest = fromApiMonth(sortedRecords[0].month);
    const month = latest.month === 12 ? 1 : latest.month + 1;
    const year = latest.month === 12 ? latest.year + 1 : latest.year;
    return { month, year };
  }, [sortedRecords]);

  const servicePoOptions = servicePos.map((po) => ({
    value: String(po.id),
    label: `${po.service_po_name}${po.service_po_code ? ` (${po.service_po_code})` : ''}`,
    searchValue: `${po.service_po_name} ${po.service_po_code ?? ''} ${po.client?.client_name ?? ''}`,
  }));

  const columns = [
    columnHelper.accessor((row) => fromApiMonth(row.month), {
      id: 'month',
      header: 'Month',
      size: 150,
      cell: (info) => {
        const p = info.getValue();
        return <span className="text-sm font-medium whitespace-nowrap">{formatMonthYear(p?.month, p?.year)}</span>;
      },
    }),
    columnHelper.accessor('invoice_amount', {
      header: 'Invoice Amount',
      size: 160,
      cell: (info) => <span className="tabular-nums text-sm font-medium whitespace-nowrap">{formatCurrency(info.getValue())}</span>,
    }),
    columnHelper.accessor('description', {
      header: 'Description',
      size: 240,
      cell: (info) => (
        <div className="truncate text-sm text-muted-foreground" title={info.getValue() || ''}>
          {info.getValue() || '—'}
        </div>
      ),
    }),
    // columnHelper.accessor('updated_at', {
    //   header: 'Updated',
    //   size: 140,
    //   cell: (info) => <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(info.getValue())}</span>,
    // }),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Cost Budget"
        actions={
          // Both selects share one width so the pair looks even, and stay on a single line
          // (flex-nowrap) instead of the BU select stacking above the PO one. justify-end pins
          // them to the header's right edge; if the header is too narrow, the parent PageHeader
          // wraps the whole pair below the title as a unit rather than splitting the two.
          // `hidden md:flex` — mobile has its own dedicated step-1 form for these same fields
          // (see the `md:hidden` section below) instead of squeezing fixed-width selects into
          // the header toolbar.
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
                setAddingInline(false);
              }}
              disabled={!buChosen}
              placeholder="Select a Service PO"
              searchPlaceholder="Search Service PO…"
              emptyMessage="No Service POs available."
              className="w-64 bg-white"
            />
          </div>
        }
      >
        {selectedPo?.client?.client_name && (
          <p className="mt-1 hidden items-center gap-1.5 text-sm text-muted-foreground md:flex">
            <Building2 className="h-3.5 w-3.5" /> {selectedPo.client.client_name}
          </p>
        )}
      </PageHeader>

      {/* Desktop — completely unchanged. `md:contents` (rather than e.g. `md:flex`) so this
          wrapper doesn't itself become a flex box that DataTable would need to fill: its
          EmptyState/DataTable child becomes a direct child of the page's own flex column at
          `md:` and up, exactly as before this wrapper was added. */}
      <div className="hidden md:contents">
        {!servicePoId ? (
          <EmptyState
            title={buChosen ? 'Select a Service PO' : 'Select a Business Unit'}
            description={
              buChosen
                ? 'Choose a Service PO above to see every month a cost budget has been added for it.'
                : 'Choose a Business Unit above, then pick one of its Service POs.'
            }
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              data={sortedRecords}
              isLoading={isPending}
              toolbar={null}
              rowClassName={(r) => (r.status !== 'active' ? 'opacity-50' : '')}
              emptyState={
                addingInline ? (
                  <InlineAddRow
                    servicePoId={servicePoId}
                    nextPeriod={nextPeriod}
                    onDone={() => setAddingInline(false)}
                  />
                ) : (
                  <EmptyState
                    title="No cost budgets yet"
                    description="No months have been added for this Service PO yet."
                    action={canManage ? { label: 'Add Cost Budget', icon: Plus, onClick: () => setAddingInline(true) } : undefined}
                  />
                )
              }
            />
            {canManage && sortedRecords.length > 0 && (
              addingInline ? (
                <InlineAddRow
                  servicePoId={servicePoId}
                  nextPeriod={nextPeriod}
                  onDone={() => setAddingInline(false)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingInline(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  <Plus className="h-4 w-4" /> Add Cost Budget
                  {nextPeriod && (
                    <span className="text-xs">({formatMonthYear(nextPeriod.month, nextPeriod.year)})</span>
                  )}
                </button>
              )
            )}
          </>
        )}
      </div>

      {/* Mobile — Entity/BU/PO as a dedicated stacked form (instead of the header toolbar),
          then either the empty prompt, an empty-with-action state, or a card per month with a
          bottom sheet for adding a new one. Reuses every piece of state/logic above. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 md:hidden">
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
            <Label className="text-xs">Service PO</Label>
            <SearchableSelect
              options={servicePoOptions}
              value={servicePoId}
              onValueChange={(v) => {
                if (!v) return;
                setServicePoId(v);
                setAddingInline(false);
              }}
              disabled={!buChosen}
              placeholder="Select a Service PO"
              searchPlaceholder="Search Service PO…"
              emptyMessage="No Service POs available."
              className="h-11 w-full bg-white"
            />
          </div>
          {selectedPo?.client?.client_name && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" /> {selectedPo.client.client_name}
            </p>
          )}
        </div>

        {!servicePoId ? (
          <EmptyState
            title={buChosen ? 'Select a Service PO' : 'Select a Business Unit'}
            description={
              buChosen
                ? 'Choose a Service PO above to see every month a cost budget has been added for it.'
                : 'Choose a Business Unit above, then pick one of its Service POs.'
            }
          />
        ) : isPending ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 w-full animate-pulse rounded-xl border bg-muted/40" />
            ))}
          </div>
        ) : sortedRecords.length === 0 ? (
          <EmptyState
            title="No cost budgets yet"
            description="No months have been added for this Service PO yet."
            action={canManage ? { label: 'Add Cost Budget', icon: Plus, onClick: () => setMobileAddOpen(true) } : undefined}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">{sortedRecords.length} record{sortedRecords.length !== 1 ? 's' : ''}</p>
              {canManage && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setMobileAddOpen(true)}>
                  <Plus className="h-4 w-4" /> Add Cost Budget
                </Button>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              {sortedRecords.map((r) => {
                const p = fromApiMonth(r.month);
                return (
                  <div key={r.id ?? r.month} className={`rounded-xl border bg-white p-3.5 shadow-sm ${r.status !== 'active' ? 'opacity-50' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{formatMonthYear(p?.month, p?.year)}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <div className="mt-2 space-y-1 text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="shrink-0 text-xs text-muted-foreground">Invoice Amount</span>
                        <span className="min-w-0 text-right tabular-nums">{formatCurrency(r.invoice_amount)}</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="shrink-0 text-xs text-muted-foreground">Description</span>
                        <span className="min-w-0 truncate text-right text-muted-foreground" title={r.description || ''}>
                          {r.description || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {canManage && servicePoId && (
        <MobileAddCostBudgetSheet
          open={mobileAddOpen}
          servicePoId={servicePoId}
          nextPeriod={nextPeriod}
          onOpenChange={setMobileAddOpen}
          onSaved={() => setMobileAddOpen(false)}
        />
      )}
    </div>
  );
};

export default CostBudgetList;
