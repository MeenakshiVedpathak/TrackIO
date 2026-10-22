import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Users, CalendarPlus } from 'lucide-react';
import { useMyTeamEmployees, useMapMyTeamEmployee } from '@/hooks/useMyTeam';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useNotification } from '@/hooks/useNotification';
import { useHasForm } from '@/hooks/usePermissions';
import { useDebounce } from '@/hooks/useDebounce';
import { extractApiError } from '@/services/apiClient';
import { ROUTES } from '@/constants/routes';
import { FORM_NAMES } from '@/constants/rbacForms';
import PageHeader from '@/components/common/PageHeader';
import StatusBadge from '@/components/common/StatusBadge';
import SearchInput from '@/components/common/SearchInput';
import EmptyState from '@/components/common/EmptyState';
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
import ListPagination from '@/components/pmDashboard/ListPagination';

const DEFAULT_PAGE_SIZE = 10;

const MyTeamList = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useNotification();
  // Separately grantable capability — a Team Lead can have "My Team" (this list) without also
  // having "Log Work for My Team" (filling hours on an Employee's behalf).
  const canFillWorkLog = useHasForm(FORM_NAMES.TEAM_LEAD_FILL_WORKLOG);

  const [addOpen, setAddOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);

  const { data: myEmployees = [], isPending } = useMyTeamEmployees();
  const { data: activeEmployees = [], isPending: isLoadingEmployees } = useActiveEmployees();
  const mapMutation = useMapMyTeamEmployee();

  const onMyTeamIds = useMemo(() => new Set(myEmployees.map((e) => e.id)), [myEmployees]);

  // GET /my-team/employees already returns this Team Lead's whole mapped team in one unpaginated
  // call (no `page`/`limit`/`search` param on it at all — the list below is already sliced from
  // the full array client-side), so search needs no backend support: it's just another filter over
  // the same in-memory array before that same pagination slice runs.
  const filteredEmployees = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return myEmployees;
    return myEmployees.filter((e) => [e.full_name, e.employee_code, e.designation]
      .some((v) => (v ?? '').toLowerCase().includes(q)));
  }, [myEmployees, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / limit));
  const safePage = Math.min(page, totalPages);
  const pageEmployees = filteredEmployees.slice((safePage - 1) * limit, safePage * limit);

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
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name, code, designation…"
              className="w-full sm:w-64"
            />
            {/* Visually distinct (emerald, not blue) from Map Employee — this creates
                already-approved work log records for an Employee, not a team-membership change. */}
            {canFillWorkLog && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => navigate(ROUTES.TEAM_LEAD_FILL_WORKLOG)}
              >
                <CalendarPlus className="mr-1.5 h-4 w-4" /> Log Work for Team
              </Button>
            )}
            {/* Map Employee button hidden for now (kept commented so it can be restored):
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Map Employee
            </Button>
            */}
          </div>
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
            ) : filteredEmployees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="p-0">
                  <EmptyState title="No employees match your search." />
                </TableCell>
              </TableRow>
            ) : (
              pageEmployees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell className="text-sm font-medium">{employee.full_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{employee.designation ?? '—'}</TableCell>
                  <TableCell><StatusBadge status={employee.status} /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {!isPending && filteredEmployees.length > 0 && (
          <div className="px-3">
            <ListPagination
              page={safePage}
              limit={limit}
              total={filteredEmployees.length}
              onPageChange={(p) => setPage(Math.max(1, Math.min(totalPages, p)))}
              onPageSizeChange={(l) => { setLimit(l); setPage(1); }}
            />
          </div>
        )}
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
