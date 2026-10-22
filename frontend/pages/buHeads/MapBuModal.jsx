import { useEffect, useMemo, useState } from 'react';
import { useCompanies } from '@/hooks/useCompanies';
import { useBuHeadMappedCompanies, useSyncBuHeadCompanies } from '@/hooks/useBuHeads';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { MultiSelect } from '@/components/ui/multi-select';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

// Map BU Head <-> BUs (§6/§21). BUs are Companies in this app's data model (see companies.api.js/
// buAdmins.api.js) — reuses the existing MultiSelect (search box + checkboxes + Select all/Clear
// all, components/ui/multi-select.jsx) already wired into EmployeeForm.jsx's Roles picker, rather
// than building a new checkbox-list component. The backend has no bulk-replace mapping endpoint
// (confirmed 2026-08-20) — only incremental POST (add) / DELETE (remove one) — so Save diffs the
// final selection against what was originally mapped and fires exactly the calls needed
// (useSyncBuHeadCompanies), while still reading as one atomic action to the user.
const MapBuModal = ({ buHead, open, onOpenChange }) => {
  const { success, error: showError } = useNotification();
  const [selected, setSelected] = useState([]);

  // Bounded "all options" fetch — same workaround pattern already used elsewhere in this app for
  // picker dropdowns (e.g. useAssignableManagers) since there's no dedicated "active companies"
  // endpoint here.
  const { data: companiesData, isLoading: isLoadingCompanies } = useCompanies({ limit: 200 });
  const { data: mappedCompanies, isLoading: isLoadingMapped } = useBuHeadMappedCompanies(buHead?.id);
  const syncMutation = useSyncBuHeadCompanies();

  const companies = companiesData?.data ?? [];
  const companyOptions = useMemo(
    () => companies.map((c) => ({ label: c.company_name, value: String(c.id) })),
    [companies]
  );
  const originalIds = useMemo(() => (mappedCompanies?.data ?? []).map((bu) => bu.id), [mappedCompanies]);

  useEffect(() => {
    if (open) setSelected(originalIds.map(String));
    else setSelected([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mappedCompanies]);

  const handleSave = () => {
    const selectedIds = selected.map(Number);
    const added = selectedIds.filter((id) => !originalIds.includes(id));
    const removed = originalIds.filter((id) => !selectedIds.includes(id));

    if (added.length === 0 && removed.length === 0) {
      onOpenChange(false);
      return;
    }

    syncMutation.mutate({ buHeadId: buHead.id, added, removed }, {
      onSuccess: () => {
        success('BU mapping updated successfully.');
        onOpenChange(false);
      },
      onError: (err) => showError(extractApiError(err)),
    });
  };

  const isLoading = isLoadingCompanies || isLoadingMapped;

  return (
    <Dialog open={open} onOpenChange={(next) => !syncMutation.isPending && onOpenChange(next)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Map Business Units</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            BU Head: <span className="font-medium text-foreground">{buHead?.full_name}</span>
          </p>

          <div className="space-y-1">
            <span className="text-[11px] text-muted-foreground font-medium">Business Units</span>
            <MultiSelect
              options={companyOptions}
              value={selected}
              onValueChange={setSelected}
              disabled={isLoading}
              placeholder={isLoading ? 'Loading…' : 'Select BUs…'}
              searchPlaceholder="Search BU…"
              className="h-8 text-sm border-gray-200"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={syncMutation.isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isLoading || syncMutation.isPending}>
            {syncMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MapBuModal;
