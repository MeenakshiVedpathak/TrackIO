import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import dayjs from 'dayjs';
import { Save, Building2, Clock, Lock } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  useServicePoMonthlyBudgetServicePOs,
  useServicePoMonthlyBudgetRecord,
  useSaveServicePoMonthlyBudget,
} from '@/hooks/useServicePoMonthlyBudget';
import { useCostBudgetsByServicePo } from '@/hooks/useCostBudgets';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { formatMonthYear, formatDateTime, getStatusColor } from '@/utils/formatters';
import { toApiMonth } from '@/utils/monthApi';
import {
  isInvoiceMasterPeriodWritable, getInvoiceMasterCountdown,
  INVOICE_MASTER_LOCK_MESSAGE, INVOICE_MASTER_WINDOW_MESSAGE,
} from '@/utils/invoiceMasterWindow';

const FORM_ID = 'service-po-budget-entry-form';

const requiredAmount = (label) =>
  z.preprocess(
    (v) => (v === '' || v == null ? undefined : Number(v)),
    z
      .number({ required_error: `${label} is required.`, invalid_type_error: `${label} must be a number.` })
      .min(0, 'Amount cannot be negative')
  );

const formSchema = z.object({
  invoice_amount: requiredAmount('Invoice Amount'),
  invoice_description: z.string().optional(),
  billed_amount: requiredAmount('Billable Amount'),
  billed_remark: z.string().optional(),
});

const EMPTY_VALUES = { invoice_amount: '', invoice_description: '', billed_amount: '', billed_remark: '' };

// Invoice Amount mirrors the Cost Budget for this PO+month when one exists (see
// `costBudgetAmount` below); everything else comes from the saved Monthly PO record.
// `invoiceAmountOverride != null` — not truthiness — so a legitimate ₹0 budget still seeds.
const toFormValues = (record, invoiceAmountOverride) => {
  const base = record
    ? {
        invoice_amount: record.invoice_amount ?? '',
        invoice_description: record.invoice_description ?? '',
        billed_amount: record.billed_amount ?? '',
        billed_remark: record.billed_remark ?? '',
      }
    : EMPTY_VALUES;
  return invoiceAmountOverride != null
    ? { ...base, invoice_amount: invoiceAmountOverride }
    : base;
};

const CurrencyInput = ({ disabled, ...props }) => (
  <div className="relative">
    <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm text-muted-foreground">₹</span>
    <Input type="number" min="0" step="0.01" disabled={disabled} className="pl-7" {...props} />
  </div>
);

// A slide-in panel, not an always-visible block — entering/editing a budget is an occasional
// action, so it shouldn't permanently occupy space above the list that's the actual point of
// this screen. `initialServicePoId` truthy means "edit" (PO locked); '' means "new" (PO pickable).
const ServicePoBudgetEntrySheet = ({ open, onOpenChange, month, year, initialServicePoId, buId }) => {
  const [servicePoId, setServicePoId] = useState('');
  const [lockError, setLockError] = useState('');
  const isEdit = !!initialServicePoId;
  const isWindowOpen = isInvoiceMasterPeriodWritable(month, year);
  // Recomputed each time the sheet opens rather than memoized, so the countdown reflects "now"
  // instead of whatever moment the page first rendered.
  const countdown = open ? getInvoiceMasterCountdown(month, year) : null;
  const { success, error: showError } = useNotification();

  const { data: servicePos = [], isPending: isServicePosLoading } = useServicePoMonthlyBudgetServicePOs(buId);
  const selectedPo = servicePos.find((po) => String(po.service_po_id) === String(servicePoId));
  // The record-fetch/save need one concrete Business Unit, unlike the dropdown above (which may
  // legitimately span every BU the caller reaches, e.g. while the page filter sits on "All
  // Business Units"). Once a PO is picked, its own company_id IS that Business Unit — no need to
  // also make the caller line up the page filter with it — so prefer that over the page's `buId`,
  // which is only a fallback for the moment before `servicePos` has loaded.
  const effectiveBuId = selectedPo?.company_id ?? buId;
  const { data: record, isFetching: isRecordLoading } = useServicePoMonthlyBudgetRecord(servicePoId, month, year, effectiveBuId);
  // The Cost Budget for the same PO — shares its cache with the Cost Budget screen. Its amount
  // for this month seeds the Invoice Amount field below, always overriding any saved report value.
  const { data: costBudgets = [], isLoading: isCostBudgetLoading } = useCostBudgetsByServicePo(servicePoId);
  const saveMutation = useSaveServicePoMonthlyBudget();

  // Derived as a primitive so it only changes when the budgeted amount actually changes — a
  // background refetch returning the same value won't retrigger the re-seed effect. Only an
  // active row seeds; a deactivated Cost Budget is treated as absent. `?? null` keeps a real ₹0.
  const costBudgetAmount = useMemo(() => {
    const key = toApiMonth({ month, year });
    const match = costBudgets.find((c) => c.month === key && c.status === 'active');
    return match?.invoice_amount ?? null;
  }, [costBudgets, month, year]);

  // Fields re-seed until both the saved record and the Cost Budget have settled; disabling the
  // whole form during that window keeps `form.reset` from clobbering an in-flight edit.
  const isSeeding = isRecordLoading || isCostBudgetLoading;

  const form = useForm({ resolver: zodResolver(formSchema), defaultValues: EMPTY_VALUES });

  // Re-seed only at the moment the sheet opens (or the PO it's opened for changes) — not on every
  // background refetch while it's already open, which would silently overwrite an in-flight edit.
  useEffect(() => {
    if (open) {
      setServicePoId(initialServicePoId ?? '');
      setLockError('');
    }
  }, [open, initialServicePoId]);

  useEffect(() => {
    if (!open || !servicePoId) return;
    form.reset(toFormValues(record, costBudgetAmount));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record, servicePoId, costBudgetAmount]);

  const options = servicePos.map((po) => ({
    value: String(po.service_po_id),
    label: `${po.service_po_name}${po.service_po_code ? ` (${po.service_po_code})` : ''}`,
    searchValue: `${po.service_po_name} ${po.service_po_code ?? ''} ${po.client?.client_name ?? ''}`,
  }));

  const onSubmit = (values) => {
    // Save button is already disabled while the window is closed — this is a backstop against a
    // stale sheet left open across a date rollover (e.g. left open past midnight on the 7th).
    if (!isWindowOpen) {
      setLockError(INVOICE_MASTER_WINDOW_MESSAGE);
      return;
    }

    const payload = {
      service_po_id: Number(servicePoId),
      month,
      year,
      invoice_amount: values.invoice_amount,
      invoice_description: values.invoice_description || '',
      billed_amount: values.billed_amount,
      billed_remark: values.billed_remark || '',
    };

    setLockError('');
    saveMutation.mutate({ ...payload, buId: effectiveBuId }, {
      onSuccess: (result) => {
        const deadline = result?.deadline;
        if (deadline?.deadline_passed) {
          const deadlineLabel = dayjs(deadline.deadline).format('MMM D');
          const daysOverdue = Math.abs(deadline.days_remaining ?? 0);
          success(`Saved. Deadline was ${deadlineLabel}, ${daysOverdue} ${daysOverdue === 1 ? 'day' : 'days'} overdue.`);
        } else {
          success('Service PO monthly budget saved successfully.');
        }
        onOpenChange(false);
      },
      onError: (err) => {
        const message = extractApiError(err);
        // The backend's date-lock 400 gets a persistent form-level banner instead of a toast that
        // vanishes before the user reads why their save was rejected.
        if (message === INVOICE_MASTER_LOCK_MESSAGE) {
          setLockError(message);
        } else {
          showError(message);
        }
      },
    });
  };

  const isSaving = saveMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={(next) => !isSaving && onOpenChange(next)}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        onInteractOutside={(e) => isSaving && e.preventDefault()}
      >
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Monthly PO Reporting</SheetTitle>
          <SheetDescription>{formatMonthYear(month, year)}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {(!isWindowOpen || lockError) && (
            <Alert variant="warning">
              <Lock className="h-4 w-4" />
              <AlertDescription>{lockError || INVOICE_MASTER_WINDOW_MESSAGE}</AlertDescription>
            </Alert>
          )}

          {isWindowOpen && !lockError && countdown?.writable && (
            <Alert
              variant={
                countdown.severity === 'critical' ? 'destructive'
                  : countdown.severity === 'warning' ? 'warning'
                  : 'info'
              }
            >
              <Clock className="h-4 w-4" />
              <AlertDescription>
                {countdown.label} to fill or edit {formatMonthYear(month, year)}'s Invoice Details.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Service PO</Label>
            <SearchableSelect
              options={options}
              value={servicePoId}
              onValueChange={(v) => v && setServicePoId(v)}
              disabled={isEdit || isServicePosLoading}
              placeholder={isServicePosLoading ? 'Loading…' : 'Select a Service PO'}
              searchPlaceholder="Search Service PO…"
              emptyMessage="No Service POs available for your role."
            />
          </div>

          {selectedPo && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="muted" className="gap-1.5 font-normal">
                <Building2 className="h-3 w-3" /> {selectedPo.client?.client_name ?? 'No client'}
              </Badge>
              {selectedPo.status && (
                <Badge variant={getStatusColor(selectedPo.status)}>{selectedPo.status}</Badge>
              )}
              <Badge variant={selectedPo.is_billable ? 'success' : 'secondary'}>
                {selectedPo.is_billable ? 'Billable' : 'Non-billable'}
              </Badge>
            </div>
          )}

          {!servicePoId ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Select a Service PO to enter its {formatMonthYear(month, year)} budget.
            </p>
          ) : (
            <>
              <Separator />
              <Form {...form}>
                <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className={isSeeding ? 'animate-pulse space-y-4 opacity-60' : 'space-y-4'}>
                    <FormField
                      control={form.control}
                      name="invoice_amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Invoice Amount <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <CurrencyInput placeholder="1,00,000" disabled={isSeeding || !isWindowOpen} {...field} />
                          </FormControl>
                          {costBudgetAmount != null && (
                            <p className="text-xs text-muted-foreground">Prefilled from Cost Budget — edit if needed.</p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <FormField
                      control={form.control}
                      name="invoice_description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Invoice Description</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. August milestone invoice" disabled={isSeeding || !isWindowOpen} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="billed_amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Billable Amount <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <CurrencyInput placeholder="95,000" disabled={isSeeding || !isWindowOpen} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                   
                    <FormField
                      control={form.control}
                      name="billed_remark"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Billable Remark</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Partial payment received" disabled={isSeeding || !isWindowOpen} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {record?.updated_at ? `Last saved ${formatDateTime(record.updated_at)}` : 'No budget saved yet for this month.'}
                  </p>
                </form>
              </Form>
            </>
          )}
        </div>

        <SheetFooter className="border-t px-5 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} disabled={isSaving || isSeeding || !servicePoId || !isWindowOpen}>
            <Save className="mr-1.5 h-4 w-4" />
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default ServicePoBudgetEntrySheet;
