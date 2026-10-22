import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeeServicePOMappingApi } from '@/api/employeeServicePOMapping.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

// Backs Service PO → Map Employees' RIGHT panel: the PO's actual mapping records, each carrying the
// mapping id and status the "Is Mapped?" toggle needs (which mapped_employee_ids alone can't give).
export const useServicePOEmployeeMappings = (servicePOId) =>
  useQuery({
    queryKey: QUERY_KEYS.EMPLOYEE_SERVICEPO_MAPPING_BY_SERVICE_PO(servicePOId),
    queryFn: () => employeeServicePOMappingApi.getByServicePO(servicePOId),
    enabled: !!servicePOId,
  });

// One page per scroll-to-bottom in Service PO → Map Employees' left panel.
const MAPPING_PANEL_PAGE_SIZE = 50;

// Backs that screen's LEFT panel. One call per page returns both the employees eligible for this PO
// — scoped by the backend to the caller's entire authorized Admin/company scope, not their team and
// not their selected BU — and the ids already mapped. `search` goes to the server, so it finds
// employees on pages that were never loaded. `businessUnitId` is the panel's own Entity → BU filter
// pair, an explicit opt-in narrowing sent to the server the same way `search` is — never the
// caller's ambient selected BU (see employeeServicePOMapping.api.js's getServicePOOptions doc).
//
// Flattened to { employees, total } — `total` is the server's count for the whole filtered set.
// `mapped_employee_ids` is deliberately NOT surfaced: it exists to pre-check a single-list checkbox
// UI, but this screen is a two-panel transfer list that already loads the PO's mapping records for
// the right panel's toggles. Those records are the documented source of truth and cover deactivated
// mappings too, so consulting both could only ever hide an employee the right panel says is
// unmapped.
export const useServicePOEmployeeOptions = (servicePOId, search, businessUnitId) =>
  useInfiniteQuery({
    queryKey: QUERY_KEYS.EMPLOYEE_SERVICEPO_MAPPING_SERVICE_PO_OPTIONS(servicePOId, search, businessUnitId),
    queryFn: ({ pageParam }) =>
      employeeServicePOMappingApi.getServicePOOptions(servicePOId, {
        page: pageParam,
        limit: MAPPING_PANEL_PAGE_SIZE,
        search,
        businessUnitId,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const nextPage = allPages.length + 1;
      const lastCount = lastPage?.eligible_employees?.length ?? 0;
      // An empty page always ends it. Without this, a `total` the rows can never reach (a
      // server-side row cap, a count that includes records the page query excludes) would page
      // forever.
      if (lastCount === 0) return undefined;

      const meta = lastPage?.meta;
      const total = Number(meta?.total);
      const loaded = allPages.reduce((n, p) => n + (p?.eligible_employees?.length ?? 0), 0);

      // `total` compared against rows ACTUALLY received, checked first and deliberately not via
      // Math.ceil(total / MAPPING_PANEL_PAGE_SIZE): that arithmetic assumed the server honoured the
      // limit we asked for. A server that caps `limit` at its own default of 10 makes
      // ceil(18 / 50) === 1 page, so the panel stopped at 10 rows of 18 and reported itself
      // complete. Counting received rows is immune to whatever limit the server actually applied.
      if (Number.isFinite(total) && total > 0) return loaded < total ? nextPage : undefined;

      if (meta?.hasNext != null) return meta.hasNext ? nextPage : undefined;
      // Last resort: keep going while pages come back full, measured against the limit the SERVER
      // reports applying, not the one we requested.
      const serverLimit = Number(meta?.limit) || MAPPING_PANEL_PAGE_SIZE;
      return lastCount >= serverLimit ? nextPage : undefined;
    },
    enabled: !!servicePOId,
    // Typing in the panel's search box changes the key (search is server-side), which would
    // otherwise drop back to isPending and collapse the whole panel — including the input being
    // typed into — behind its skeleton. Holding the previous pages keeps it mounted.
    placeholderData: (prev) => prev,
    select: (data) => {
      const employees = data.pages.flatMap((p) => p?.eligible_employees ?? []);
      return { employees, total: Number(data.pages[0]?.meta?.total ?? employees.length) };
    },
  });

// Map Employees' Entity → BU filter bar (EntityBuFilterBar). One call returns every Entity/Business
// Unit within the caller's authorized scope — the Entity dropdown and the BU dropdown (narrowed to
// the selected Entity) both filter this single result client-side; picking a BU is the only choice
// that re-queries the server (via useServicePOEmployeeOptions' businessUnitId).
export const useEmployeeServicePOMappingFilterOptions = (enabled = true) =>
  useQuery({
    queryKey: QUERY_KEYS.EMPLOYEE_SERVICEPO_MAPPING_FILTER_OPTIONS,
    queryFn: () => employeeServicePOMappingApi.getMappingFilterOptions(),
    enabled,
    staleTime: 1000 * 60 * 5,
  });

export const useCreateEmployeeServicePOMapping = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ employeeId, servicePOId }) => employeeServicePOMappingApi.create(employeeId, servicePOId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-servicepo-mapping'] }),
  });
};

export const useDeleteEmployeeServicePOMapping = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => employeeServicePOMappingApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-servicepo-mapping'] }),
  });
};

export const useSetEmployeeServicePOMappingStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }) =>
      active ? employeeServicePOMappingApi.activate(id) : employeeServicePOMappingApi.deactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-servicepo-mapping'] }),
  });
};

// Employee Master's "Manage Service PO Mapping" dialog.
export const useEmployeeServicePOMappingOptions = (employeeId) =>
  useQuery({
    queryKey: QUERY_KEYS.EMPLOYEE_SERVICEPO_MAPPING_OPTIONS(employeeId),
    queryFn: () => employeeServicePOMappingApi.getOptions(employeeId),
    enabled: !!employeeId,
  });

export const useSaveEmployeeServicePOMapping = (employeeId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (servicePoIds) => employeeServicePOMappingApi.saveMapping(employeeId, servicePoIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-servicepo-mapping'] }),
  });
};
