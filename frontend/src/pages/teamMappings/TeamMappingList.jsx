import { useMemo, useState } from 'react';
import { Plus, Trash2, UserCog, Briefcase } from 'lucide-react';
import {
  useTeamMappings, useAvailableTeamLeads, useAddTeamLead, useRemoveTeamLead,
  useTeamServicePoGrants, useGrantTeamServicePo, useRevokeTeamServicePo,
} from '@/hooks/useTeamMappings';
import { useActiveServicePOs } from '@/hooks/useServicePOs';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

// Service PO Admin's own team self-service (§7) — replaces the old BU-Admin-assigns-on-
// someone's-behalf Manager Mapping. Every call here uses the caller's own identity.
const ServicePoPanel = ({ teamLead, onOpenChange }) => {
  const { success, error: showError } = useNotification();
  const [selectedPoId, setSelectedPoId] = useState('');

  const { data: activePOs = [] } = useActiveServicePOs();
  const { data: grants = [], isPending } = useTeamServicePoGrants();
  const grantMutation = useGrantTeamServicePo();
  const revokeMutation = useRevokeTeamServicePo();

  const teamLeadGrants = grants.filter((g) => g.manager_user_id === teamLead?.manager_user_id);
  const grantedPoIds = new Set(teamLeadGrants.map((g) => g.service_po_id));
  const poOptions = activePOs
    .filter((po) => !grantedPoIds.has(po.id))
    .map((po) => ({ value: String(po.id), label: po.service_po_name ?? po.service_po_code }));
  const poName = (id) => activePOs.find((po) => po.id === id)?.service_po_name
    ?? activePOs.find((po) => po.id === id)?.service_po_code ?? `PO #${id}`;

  const handleGrant = () => {
    if (!selectedPoId) return;
    grantMutation.mutate(
      { teamLeadUserId: teamLead.manager_user_id, servicePOId: Number(selectedPoId) },
      {
        onSuccess: () => { success('Service PO granted.'); setSelectedPoId(''); },
        onError: (err) => showError(extractApiError(err)),
      }
    );
  };

  const handleRevoke = (servicePOId) => {
    revokeMutation.mutate(
      { teamLeadUserId: teamLead.manager_user_id, servicePOId },
      { onError: (err) => showError(extractApiError(err)) }
    );
  };

  return (
    <Dialog open={!!teamLead} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Briefcase className="h-4 w-4" /> Service POs</DialogTitle>
          <DialogDescription>Service POs granted to {teamLead?.manager_email}.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <SearchableSelect
            options={poOptions}
            value={selectedPoId}
            onValueChange={setSelectedPoId}
            placeholder="Select Service PO"
            searchPlaceholder="Search…"
            className="flex-1"
          />
          <Button size="sm" onClick={handleGrant} disabled={!selectedPoId || grantMutation.isPending}>
            {grantMutation.isPending ? 'Granting…' : 'Grant'}
          </Button>
        </div>

        <div className="max-h-64 overflow-y-auto rounded-md border">
          {isPending ? (
            <div className="p-3"><Skeleton className="h-5 w-full" /></div>
          ) : teamLeadGrants.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No Service POs granted yet.</p>
          ) : (
            <ul className="divide-y">
              {teamLeadGrants.map((g) => (
                <li key={g.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  {poName(g.service_po_id)}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                    onClick={() => handleRevoke(g.service_po_id)}
                    disabled={revokeMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const TeamMappingList = () => {
  const { success, error: showError } = useNotification();

  const [addOpen, setAddOpen] = useState(false);
  const [selectedTeamLeadId, setSelectedTeamLeadId] = useState('');
  const [removeTarget, setRemoveTarget] = useState(null);
  const [servicePoTarget, setServicePoTarget] = useState(null);

  const { data: mappings = [], isPending } = useTeamMappings();
  const { data: availableTeamLeads = [], isPending: isLoadingTeamLeads } = useAvailableTeamLeads();
  const addMutation = useAddTeamLead();
  const removeMutation = useRemoveTeamLead();

  const onMyTeamIds = useMemo(() => new Set(mappings.map((m) => m.manager_user_id)), [mappings]);

  const teamLeadOptions = useMemo(
    () =>
      availableTeamLeads
        .filter((m) => !onMyTeamIds.has(m.id) && !m.current_owner)
        .map((m) => ({ value: String(m.id), label: m.email })),
    [availableTeamLeads, onMyTeamIds]
  );

  const handleAdd = () => {
    if (!selectedTeamLeadId) return;
    addMutation.mutate(Number(selectedTeamLeadId), {
      onSuccess: () => {
        success('Team Lead added to your team successfully.');
        setAddOpen(false);
        setSelectedTeamLeadId('');
      },
      onError: (err) => showError(extractApiError(err)),
    });
  };

  const handleRemove = () => {
    removeMutation.mutate(removeTarget.manager_user_id, {
      onSuccess: () => {
        success('Team Lead removed from your team.');
        setRemoveTarget(null);
      },
      onError: (err) => {
        showError(extractApiError(err));
        setRemoveTarget(null);
      },
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Team Mapping"
        description="Team Leads on your team, and the Service POs granted to them"
        actions={
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Add Team Lead
          </Button>
        }
      />

      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Team Lead</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={3}><Skeleton className="h-5 w-full" /></TableCell>
                </TableRow>
              ))
            ) : mappings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                  <UserCog className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                  No Team Leads on your team yet.
                </TableCell>
              </TableRow>
            ) : (
              mappings.map((mapping) => (
                <TableRow key={mapping.id}>
                  <TableCell className="text-sm font-medium">{mapping.manager_email}</TableCell>
                  <TableCell><StatusBadge status={mapping.status} /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        title="Service POs"
                        className="h-6 w-6 p-0 bg-indigo-500 hover:bg-indigo-600 text-white rounded transition-colors"
                        onClick={() => setServicePoTarget(mapping)}
                      >
                        <Briefcase className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        title="Remove"
                        className="h-6 w-6 p-0 bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
                        onClick={() => setRemoveTarget(mapping)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setSelectedTeamLeadId(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Add a Team Lead to your team</DialogTitle>
          </DialogHeader>
          <SearchableSelect
            options={teamLeadOptions}
            value={selectedTeamLeadId}
            onValueChange={setSelectedTeamLeadId}
            disabled={isLoadingTeamLeads}
            placeholder="Select Team Lead"
            searchPlaceholder="Search Team Leads…"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)} disabled={addMutation.isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={!selectedTeamLeadId || addMutation.isPending}>
              {addMutation.isPending ? 'Adding…' : 'Add Team Lead'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="Remove Team Lead?"
        description={`${removeTarget?.manager_email} will be removed from your team.`}
        confirmLabel="Remove"
        onConfirm={handleRemove}
        isLoading={removeMutation.isPending}
      />

      <ServicePoPanel teamLead={servicePoTarget} onOpenChange={(open) => !open && setServicePoTarget(null)} />
    </div>
  );
};

export default TeamMappingList;
