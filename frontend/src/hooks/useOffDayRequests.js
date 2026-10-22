import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { offDayRequestsApi } from '@/api/offDayRequests.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

// Fan-out limit per BU when merging across several Business Units client-side (see
// useMyTeamOffDayRequestsAcrossBus below). The backend rejects `limit > 100` (400 "limit must be
// less than or equal to 100"), so this is the highest value each per-BU call can safely request —
// a BU with more than 100 weekend requests outstanding at once would need real server-side
// cross-BU support to avoid truncation, but no team has hit that in practice.
const FAN_OUT_LIMIT = 100;

export const useMyOffDayRequests = (params = {}, options = {}) =>
  useQuery({
    queryKey: QUERY_KEYS.OFF_DAY_REQUESTS_MINE(params),
    queryFn: () => offDayRequestsApi.listMine(params),
    ...options,
  });

export const useCreateOffDayRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: offDayRequestsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-timesheets', 'off-day-requests'] });
    },
  });
};

export const useResubmitOffDayRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => offDayRequestsApi.resubmit(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-timesheets', 'off-day-requests'] });
    },
  });
};

export const useMyTeamOffDayRequests = (params = {}, options = {}) =>
  useQuery({
    queryKey: QUERY_KEYS.OFF_DAY_REQUESTS_QUEUE(params),
    queryFn: () => offDayRequestsApi.listQueue(params),
    placeholderData: (prev) => prev,
    ...options,
  });

// `GET /my-team/off-day-requests` scopes by the single `X-Company-Id` header a `buId` resolves to
// (see explicitBuScope in apiClient.js) — there's no "every BU under this Entity" header, so
// picking an Entity in the Weekend Requests filter while Business Unit stays "All Business Units"
// otherwise has NO effect on the results: a header-less call falls back to the caller's own role
// reach, not to "just this Entity's BUs". Mirrors useMyTeamEmployeesAcrossBus's fix for the exact
// same gap on /my-team/employees — fans out one call per BU (`units`, already narrowed to the
// selected Entity by useSelectableBusinessUnits(entityId) at the call site) and merges the pages
// client-side, deduped by id. Only status/search/date-range are forwarded per-BU call; pagination
// is then applied to the merged set by the caller (WeekendRequestsTable), since the server can
// only paginate one BU at a time.
export const useMyTeamOffDayRequestsAcrossBus = (units, params = {}, { enabled = true } = {}) => {
  const queries = useQueries({
    queries: units.map((bu) => ({
      queryKey: QUERY_KEYS.OFF_DAY_REQUESTS_QUEUE({ ...params, buId: bu.id, limit: FAN_OUT_LIMIT, page: 1 }),
      queryFn: () => offDayRequestsApi.listQueue({ ...params, buId: bu.id, limit: FAN_OUT_LIMIT, page: 1 }),
      enabled: enabled && !!bu.id,
      placeholderData: (prev) => prev,
    })),
  });

  const seen = new Map();
  queries.forEach((q) => (q.data?.data ?? []).forEach((req) => {
    if (!seen.has(req.id)) seen.set(req.id, req);
  }));

  const sortedData = Array.from(seen.values()).sort((a, b) => {
    const dateA = new Date(a.created_at || a.work_date || 0).getTime();
    const dateB = new Date(b.created_at || b.work_date || 0).getTime();
    return dateB - dateA;
  });

  return {
    data: sortedData,
    isLoading: queries.some((q) => q.isLoading),
    isError: queries.length > 0 && queries.every((q) => q.isError),
    error: queries.find((q) => q.isError)?.error,
  };
};

export const useApproveOffDayRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => offDayRequestsApi.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-team', 'off-day-requests'] });
    },
  });
};

// Backend route doesn't exist yet — see api/offDayRequests.api.js's `bulkApprove` comment and
// BACKEND_BULK_APPROVE_PROMPT.md. WeekendRequestsTable catches a 404 from this and falls back to
// N single approve calls, so this hook is safe to wire up now and ship transparently once the
// backend route lands.
export const useBulkApproveOffDayRequests = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids) => offDayRequestsApi.bulkApprove(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-team', 'off-day-requests'] });
    },
  });
};

export const useRejectOffDayRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => offDayRequestsApi.reject(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-team', 'off-day-requests'] });
    },
  });
};
