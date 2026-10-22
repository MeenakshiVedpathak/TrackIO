import { useEffect, useState } from 'react';
import { Save, Gauge } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMonthlyCapSetting, useUpdateMonthlyCap } from '@/hooks/useSystemSettings';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { formatDateTime } from '@/utils/formatters';

// `updated_by` may arrive as a plain name/email string or as an employee object — render whichever
// readable label it carries, or nothing.
const describeUpdatedBy = (updatedBy) => {
  if (!updatedBy) return null;
  if (typeof updatedBy === 'string' || typeof updatedBy === 'number') return String(updatedBy);
  return updatedBy.name ?? updatedBy.full_name ?? updatedBy.employee_name ?? updatedBy.email ?? null;
};

// Admin / Platform Admin screen for the system-wide monthly cap hours. The value is read from and
// written to GET/PUT /system-settings/monthly-cap — the backend owns the default and the bounds.
const MonthlyCapSettings = () => {
  const { success, error: showError } = useNotification();
  const { data: setting, isPending, isError, error: loadError } = useMonthlyCapSetting();
  const updateMutation = useUpdateMonthlyCap();

  const currentCap = setting?.monthly_cap_hours;
  const min = setting?.min;
  const max = setting?.max;

  const [value, setValue] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (currentCap != null) setValue(String(currentCap));
  }, [currentCap]);

  const trimmed = value.trim();
  const numericValue = trimmed === '' ? NaN : Number(trimmed);
  const isNumber = Number.isFinite(numericValue);
  const inRange = isNumber
    && (min == null || numericValue >= Number(min))
    && (max == null || numericValue <= Number(max));
  const isChanged = isNumber && currentCap != null && numericValue !== Number(currentCap);
  const canSave = !isPending && currentCap != null && inRange && isChanged && !updateMutation.isPending;

  const rangeHint = min != null && max != null ? `Allowed range: ${min} – ${max} hours.` : null;
  const showRangeError = trimmed !== '' && (!isNumber || !inRange);

  const handleConfirm = () => {
    updateMutation.mutate(numericValue, {
      onSuccess: (data) => {
        success(`Monthly cap updated to ${data?.monthly_cap_hours ?? numericValue} hours.`);
        setConfirmOpen(false);
      },
      onError: (err) => {
        showError(extractApiError(err));
        setConfirmOpen(false);
      },
    });
  };

  const updatedByLabel = describeUpdatedBy(setting?.updated_by);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Monthly Cap Hours"
        description="The maximum billable hours per employee per month, used by syncs, imports, budgets and dashboards."
      />

      <Card className="max-w-xl">
        <CardContent className="p-5 space-y-5">
          {isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-4 w-56" />
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive">{extractApiError(loadError)}</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Gauge className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Current cap</p>
                  <p className="text-xl font-semibold">{currentCap} hours / month</p>
                </div>
              </div>

              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (canSave) setConfirmOpen(true);
                }}
              >
                <Label htmlFor="monthly-cap-hours" className="text-[13px]">
                  <span className="text-destructive">*</span> New monthly cap (hours)
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="monthly-cap-hours"
                    type="number"
                    inputMode="decimal"
                    min={min ?? undefined}
                    max={max ?? undefined}
                    step="any"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="h-9 w-40 text-sm"
                    disabled={updateMutation.isPending}
                  />
                  <Button type="submit" size="sm" disabled={!canSave}>
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    {updateMutation.isPending ? 'Saving…' : 'Save'}
                  </Button>
                </div>
                {showRangeError ? (
                  <p className="text-xs text-destructive">
                    {rangeHint ? `Enter a number between ${min} and ${max}.` : 'Enter a valid number.'}
                  </p>
                ) : (
                  rangeHint && <p className="text-xs text-muted-foreground">{rangeHint}</p>
                )}
              </form>

              <p className="text-xs text-muted-foreground border-t pt-3">
                Last changed: {setting?.updated_at ? formatDateTime(setting.updated_at) : '—'}
                {updatedByLabel && <> by <span className="font-medium text-foreground/80">{updatedByLabel}</span></>}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => !updateMutation.isPending && setConfirmOpen(open)}
        title="Change monthly cap?"
        description={`Cap will change from ${currentCap} to ${numericValue}. Applies to syncs/imports run from now on; already-synced months keep their cap until re-synced.`}
        confirmLabel="Save"
        variant="default"
        onConfirm={handleConfirm}
        isLoading={updateMutation.isPending}
      />
    </div>
  );
};

export default MonthlyCapSettings;
