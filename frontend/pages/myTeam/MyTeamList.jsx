import { useMemo, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { useMyTeamEmployees, useMapMyTeamEmployee } from '@/hooks/useMyTeam';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

const MyTeamList = () => {
  const { success, error: showError } = useNotification();

  const [addOpen, setAddOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');

  const { data: myEmployees = [], isPending } = useMyTeamEmployees();
  const { data: activeEmployees = [], isPending: isLoadingEmployees } = useActiveEmployees();
  const mapMutation = useMapMyTeamEmployee();

  const onMyTeamIds = useMemo(() => new Set(myEmployees.map((e) => e.id)), [myEmployees]);

  const employeeOptions = useMemo(
    () =>
      activeEmployees
        .filter((e) => !onMyTeamIds.has(e.id))
        .map((e) => ({ value: String(e.id), label: e.full_name })),
    [activeEmployees, onMyTeamIds]
  );

  const handleMap = () => {
    if (!selectedEmployeeId) return;
    mapMutation.mutate(Number(selectedEmployeeId), {
      onSuccess: () => {
        success('Employee mapped successfully.');
        setAddOpen(false);
        setSelectedEmployeeId('');
      },
      onError: (err) => showError(extractApiError(err)),
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="My Team"
        description="Employees reporting to you"
        actions={
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Map Employee
          </Button>
        }
      />

      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPending ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={3}><Skeleton className="h-5 w-full" /></TableCell>
                </TableRow>
              ))
            ) : myEmployees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                  <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                  No Employees reporting to you yet.
                </TableCell>
              </TableRow>
            ) : (
              myEmployees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="text-sm font-medium">{employee.full_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{employee.designation ?? '—'}</TableCell>
                  <TableCell><StatusBadge status={employee.status} /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setSelectedEmployeeId(''); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Map an Employee</DialogTitle>
          </DialogHeader>
          <SearchableSelect
            options={employeeOptions}
            value={selectedEmployeeId}
            onValueChange={setSelectedEmployeeId}
            disabled={isLoadingEmployees}
            placeholder="Select Employee"
            searchPlaceholder="Search employees…"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(false)} disabled={mapMutation.isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleMap} disabled={!selectedEmployeeId || mapMutation.isPending}>
              {mapMutation.isPending ? 'Mapping…' : 'Map Employee'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MyTeamList;
