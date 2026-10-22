import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeeWorkLogApi } from '@/api/employeeWorkLog.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

// One row per day in the month: { date, totalHours, hasEntries, futureDisabled }. totalHours
// here is pending+synced combined — the calendar aggregate doesn't expose a per-day
// pending/synced breakdown, so this view intentionally doesn't distinguish them (see plan).
// `options` is a plain useQuery passthrough — Employee Dashboard's "Last 7 Days" strip uses it
// to pull the PREVIOUS month only on the days where that window actually reaches back into it
// (see EmployeeDashboard.jsx), rather than firing a second request every day of the month.
export const useEmployeeCalendar = (month, year, options = {}) =>
  useQuery({
    queryKey: QUERY_KEYS.EMPLOYEE_WORKLOG_CALENDAR(month, year),
    queryFn: () => employeeWorkLogApi.getCalendar({ month, year }),
    placeholderData: (prev) => prev,
    ...options,
  });

// Fetched on demand for whichever date is selected.
export const useEmployeeDailyWorkLog = (date) =>
  useQuery({
    queryKey: QUERY_KEYS.EMPLOYEE_WORKLOG_DAILY(date),
    queryFn: () => employeeWorkLogApi.getDaily(date),
    enabled: !!date,
    placeholderData: (prev) => prev,
  });

// viewType 'day' (default) keeps the untouched per-day/hierarchy shape; 'month' returns the same
// Service PO -> Parent -> Child hierarchy aggregated for the whole month instead. Each viewType
// gets its own query key so toggling re-fetches fresh (no placeholderData carryover) and never
// renders the other view's stale data. The `signal` React Query hands `queryFn` is forwarded to
// axios so a fast double-toggle aborts the superseded request instead of letting it race.
export const useEmployeeMonthlySummary = (month, year, viewType = 'day') =>
  useQuery({
    queryKey: QUERY_KEYS.EMPLOYEE_WORKLOG_MONTHLY_SUMMARY(month, year, viewType),
    queryFn: ({ signal }) => employeeWorkLogApi.getMonthlySummary({ month, year, viewType, signal }),
  });

// Whole-day replace — one call saves every row for a single date at once. See
// employeeWorkLog.api.js for the "omitted row = deleted server-side" contract.
export const useSaveWorkLogDay = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: employeeWorkLogApi.saveDay,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-worklog'] }),
  });
};

export const useUpdateWorkLogEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }) => employeeWorkLogApi.update(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-worklog'] }),
  });
};

export const useDeleteWorkLogEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: employeeWorkLogApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-worklog'] }),
  });
};

// Work Log Rejection Workflow (2026-08-23) — flat, filterable list (status=rejected), separate
// from the aggregated /daily and /monthly trees above.
export const useEmployeeEntries = (params, enabled = true) =>
  useQuery({
    queryKey: QUERY_KEYS.EMPLOYEE_WORKLOG_ENTRIES(params),
    queryFn: () => employeeWorkLogApi.getEntries(params),
    placeholderData: (prev) => prev,
    enabled,
  });

// The only way a 'rejected' entry goes back to 'pending' — a distinct, deliberate action from
// editing (see useUpdateWorkLogEntry above, which leaves status as 'rejected').
export const useResubmitWorkLogEntry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: employeeWorkLogApi.resubmit,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-worklog'] }),
  });
};

// Monthly mode — one month's Service PO -> hierarchy tree, total hours per node instead of
// per-day. `eligible` comes straight from the backend and is never recomputed here. `enabled`
// lets a caller that only sometimes needs this (e.g. a tab that isn't always active) skip the
// fetch entirely rather than firing it and discarding the result.
export const useEmployeeMonthlyWorkLog = (month, year, enabled = true) =>
  useQuery({
    queryKey: QUERY_KEYS.EMPLOYEE_WORKLOG_MONTHLY(month, year),
    queryFn: () => employeeWorkLogApi.getMonthly({ month, year }),
    enabled: enabled && !!month && !!year,
    placeholderData: (prev) => prev,
  });

// Fetches all 12 months of a year in parallel so the Month Selector strip can show every
// month's total hours at once. Individual months already cached here are reused (not
// refetched) when useEmployeeMonthlyWorkLog is later called for the same month/year.
// `enabled` gates the actual network fetch (not the hook call itself, which always runs per
// Rules of Hooks) — the caller passes `mode === 'monthly'` so these 12 requests only fire once
// Monthly mode is actually opened, not on every Daily-mode page load.
export const useEmployeeMonthlyYearOverview = (year, enabled = true) =>
  useQueries({
    queries: Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      return {
        queryKey: QUERY_KEYS.EMPLOYEE_WORKLOG_MONTHLY(month, year),
        queryFn: () => employeeWorkLogApi.getMonthly({ month, year }),
        enabled: enabled && !!year,
        placeholderData: (prev) => prev,
      };
    }),
  });

export const useSaveWorkLogMonth = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: employeeWorkLogApi.saveMonthly,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-worklog'] }),
  });
};

export const useDeleteWorkLogMonth = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: employeeWorkLogApi.deleteMonthly,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-worklog'] }),
  });
};
