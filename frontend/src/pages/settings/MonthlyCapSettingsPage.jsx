import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import PageHeader from '@/components/common/PageHeader';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMonthlyCapSetting, useUpdateMonthlyCap } from '@/hooks/useSystemSettings';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { formatDateTime } from '@/utils/formatters';

// Admin-only screen (route-guarded in routes/index.jsx; the API enforces it too). One field:
// the Monthly Cap Hours. A change applies to syncs/imports run afterwards — months already
// synced keep the cap they were synced with until they are re-synced.
const MonthlyCapSettingsPage = () => {
  const { data, isLoading } = useMonthlyCapSetting();
  const updateMutation = useUpdateMonthlyCap();
  const { success, error: showError } = useNotification();

  const [value, setValue] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const current = data?.monthly_cap_hours;
  const min = data?.min ?? 1;
  const max = data?.max ?? 744;

  useEffect(() => {
    if (current !== undefined) setValue(String(current));
  }, [current]);

  const parsed = Number(value);
  const isValid = value !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max;
  const isChanged = isValid && parsed !== Number(current);

  const handleConfirm = () => {
    updateMutation.mutate(parsed, {
      onSuccess: () => {
        setConfirmOpen(false);
        success(`Monthly cap hours updated to ${parsed}.`);
      },
      onError: (err) => {
        setConfirmOpen(false);
        showError(extractApiError(err));
      },
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Monthly Cap Hours"
        description="The monthly total each employee's hours are scaled down to when timesheets are synced or imported."
      />

      <div className="max-w-xl rounded-xl border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Current cap</p>
            <p className="text-2xl font-bold leading-tight">{isLoading ? '…' : `${current}h`}</p>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <Label htmlFor="monthly-cap-hours">New cap (hours per month)</Label>
          <Input
            id="monthly-cap-hours"
            type="number"
            min={min}
            max={max}
            step="0.5"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={isLoading || updateMutation.isPending}
            className="max-w-[200px]"
          />
          {value !== '' && !isValid && (
            <p className="text-xs text-destructive">Enter a number between {min} and {max}.</p>
          )}
        </div>

        <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Applies to every sync/import you run from now on, for all employees.</li>
          <li>Months already synced keep the cap they were synced with, and their reports do not change.</li>
          <li>Re-syncing a month uses the latest cap and updates that month&apos;s reports.</li>
        </ul>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {data?.updated_at ? `Last changed ${formatDateTime(data.updated_at)}` : 'Never changed (default).'}
          </p>
          <Button onClick={() => setConfirmOpen(true)} disabled={!isChanged || updateMutation.isPending}>
            Save
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        variant="default"
        title="Change monthly cap hours?"
        description={`The cap will change from ${current}h to ${parsed}h. It applies to syncs/imports run from now on; already-synced months keep their current cap until they are re-synced.`}
        confirmLabel="Change cap"
        onConfirm={handleConfirm}
        isLoading={updateMutation.isPending}
      />
    </div>
  );
};

export default MonthlyCapSettingsPage;
