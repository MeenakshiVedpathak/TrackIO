import { useMemo } from 'react';
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

// One page per scroll-to-bottom in Service PO → Map Employees' left panel — kept small so
// scrolling through a large scope pulls the server for only as many employees as are actually
// viewed, instead of one large batch up front.
const MAPPING_PANEL_PAGE_SIZE = 10;

// Backs that screen's LEFT panel. One call per page returns both the employees eligible for this PO
// — scoped by the backend to the caller's entire authorized Admin/company scope, not their team and
// not their selected BU — and the ids already mapped. `search` goes to the server, so it finds
// employees on pages that were never loaded. `businessUnitIds` is the panel's own Entity → BU filter
// pair (now multi-select), an explicit opt-in narrowing sent to the server the same way `search` is
// — never the caller's ambient selected BU (see employeeServicePOMapping.api.js's getServicePOOptions
// doc).
//
// The backend's `business_unit_id` query param only ever accepts ONE id (Joi rejects an array or a
// comma-joined string, see getServicePOEmployeeOptionsQuerySchema server-side) — there is no
// `business_unit_ids` alternative. So picking several BUs here fans out into one paginated fetch per
// BU rather than a single multi-BU server call: `pageParam` is `{ buIndex, page }`, walking BU 0's
// pages to exhaustion before moving on to BU 1, etc., which lets the existing "one page per
// scroll-to-bottom" plumbing keep working unchanged for however many BUs are selected.
//
// Flattened to { employees, total } — `total` is just the flattened count (no single server total
// spans every BU). Employees are de-duplicated by id since the same person can belong to more than
// one selected BU. `mapped_employee_ids` is deliberately NOT surfaced: it exists to pre-check a
// single-list checkbox UI, but this screen is a two-panel transfer list that already loads the PO's
// mapping records for the right panel's toggles. Those records are the documented source of truth
// and cover deactivated mappings too, so consulting both could only ever hide an employee the right
// panel says is unmapped.
export const useServicePOEmployeeOptions = (servicePOId, search, businessUnitIds = []) => {
  // Sorted once per distinct set of ids so `buIds[buIndex]` stays stable across renders even if the
  // caller's own array is reordered (e.g. a MultiSelect returning selections in click order) — the
  // query key below is built from this same sorted list, so a reorder that doesn't change the set
  // must not change which BU a cached page's buIndex points at.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const buIds = useMemo(
    () => [...new Set(businessUnitIds.map(Number))].sort((a, b) => a - b),
    [businessUnitIds.map(String).sort().join(',')]
  );

  return useInfiniteQuery({
    queryKey: QUERY_KEYS.EMPLOYEE_SERVICEPO_MAPPING_SERVICE_PO_OPTIONS(servicePOId, search, buIds.join(',')),
    queryFn: ({ pageParam }) =>
      employeeServicePOMappingApi
        .getServicePOOptions(servicePOId, {
          page: pageParam.page,
          limit: MAPPING_PANEL_PAGE_SIZE,
          search,
          businessUnitId: buIds[pageParam.buIndex],
        })
        .then((page) => ({ ...page, __buIndex: pageParam.buIndex })),
    initialPageParam: { buIndex: 0, page: 1 },
    getNextPageParam: (lastPage, allPages) => {
      const { __buIndex: buIndex } = lastPage;
      const lastCount = lastPage?.eligible_employees?.length ?? 0;
      const pagesForThisBu = allPages.filter((p) => p.__buIndex === buIndex).length;

      // Same "did this BU's list end" logic as the single-BU case used to run inline — just scoped
      // to one BU's own pages instead of the whole set.
      let hasMoreInThisBu = false;
      if (lastCount > 0) {
        const meta = lastPage?.meta;
        const total = Number(meta?.total);
        const loadedForThisBu = allPages
          .filter((p) => p.__buIndex === buIndex)
          .reduce((n, p) => n + (p?.eligible_employees?.length ?? 0), 0);

        if (Number.isFinite(total) && total > 0) {
          hasMoreInThisBu = loadedForThisBu < total;
        } else if (meta?.hasNext != null) {
          hasMoreInThisBu = meta.hasNext;
        } else {
          const serverLimit = Number(meta?.limit) || MAPPING_PANEL_PAGE_SIZE;
          hasMoreInThisBu = lastCount >= serverLimit;
        }
      }

      if (hasMoreInThisBu) return { buIndex, page: pagesForThisBu + 1 };
      const nextBuIndex = buIndex + 1;
      return nextBuIndex < buIds.length ? { buIndex: nextBuIndex, page: 1 } : undefined;
    },
    enabled: !!servicePOId && buIds.length > 0,
    // Typing in the panel's search box (or changing the BU selection) changes the key (both are
    // server-side), which would otherwise drop back to isPending and collapse the whole panel —
    // including the input being typed into — behind its skeleton. Holding the previous pages keeps
    // it mounted.
    placeholderData: (prev) => prev,
    select: (data) => {
      const seen = new Set();
      const employees = [];
      data.pages.forEach((p) => {
        (p?.eligible_employees ?? []).forEach((e) => {
          const key = Number(e.id);
          if (seen.has(key)) return;
          seen.add(key);
          employees.push(e);
        });
      });
      return { employees, total: employees.length };
    },
  });
};

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

// Service PO → Map Employees' mapped panel: flips one mapping row's PM flag without touching
// its active/inactive status or recreating the mapping.
export const useSetProjectManager = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isProjectManager }) => employeeServicePOMappingApi.setProjectManager(id, isProjectManager),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-servicepo-mapping'] }),
  });
};
