import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { servicePoMonthlyBudgetApi } from '@/api/servicePoMonthlyBudget.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

export const useServicePoMonthlyBudgetServicePOs = (buId) =>
  useQuery({
    queryKey: QUERY_KEYS.SERVICE_PO_MONTHLY_BUDGET_SERVICE_POS(buId),
    queryFn: () => servicePoMonthlyBudgetApi.getServicePOs(buId),
    staleTime: 1000 * 60 * 10,
  });

// `buId` is Monthly PO Reporting's own Business Unit filter — undefined for a single-BU login
// (no filter shown), which keeps the request following the global BU header as before.
export const useServicePoMonthlyBudgetList = (month, year, buId) =>
  useQuery({
    queryKey: QUERY_KEYS.SERVICE_PO_MONTHLY_BUDGET_LIST(month, year, buId),
    queryFn: () => servicePoMonthlyBudgetApi.getMonthList(month, year, buId),
    enabled: !!month && !!year,
  });

// Backs the month-summary strip — fans out one getMonthList call per calendar month (the same
// confirmed endpoint/query key the card grid below already uses) rather than a year-only param,
// which isn't in the documented contract. Each month's cache entry is shared with
// useServicePoMonthlyBudgetList when that exact month is selected, so picking a month never
// re-fetches data this hook already has.
export const useServicePoMonthlyBudgetYearSummary = (year, buId) => {
  const queries = useQueries({
    queries: Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      return {
        queryKey: QUERY_KEYS.SERVICE_PO_MONTHLY_BUDGET_LIST(month, year, buId),
        queryFn: () => servicePoMonthlyBudgetApi.getMonthList(month, year, buId),
        enabled: !!year,
        select: (records) => ({
          invoiceTotal: records.reduce((sum, r) => sum + Number(r.invoice_amount ?? 0), 0),
          billedTotal: records.reduce((sum, r) => sum + Number(r.billed_amount ?? 0), 0),
          filledCount: records.length,
        }),
      };
    }),
  });

  return queries.map((q, i) => ({
    month: i + 1,
    invoiceTotal: q.data?.invoiceTotal ?? 0,
    billedTotal: q.data?.billedTotal ?? 0,
    filledCount: q.data?.filledCount ?? 0,
    isLoading: q.isPending,
  }));
};

// Prefills the entry form once a Service PO + month + year are all chosen; a null result (no
// prior save for this combination) just means the form stays empty rather than an error.
// `buId` must be the same BU the sheet's own Service PO dropdown was scoped to (see
// useServicePoMonthlyBudgetServicePOs above) — otherwise this looks the PO up under the navbar's
// global BU instead, which 404s the moment the two diverge. Included in the key so a BU switch
// never serves a stale/wrong-BU record from cache.
export const useServicePoMonthlyBudgetRecord = (servicePoId, month, year, buId) =>
  useQuery({
    queryKey: QUERY_KEYS.SERVICE_PO_MONTHLY_BUDGET_RECORD(servicePoId, month, year, buId),
    queryFn: () => servicePoMonthlyBudgetApi.getRecord(servicePoId, month, year, buId),
    enabled: !!servicePoId && !!month && !!year,
  });

export const useSaveServicePoMonthlyBudget = () => {
  const qc = useQueryClient();
  return useMutation({
    // `buId` rides along with the payload (see ServicePoBudgetEntrySheet's onSubmit) rather than
    // as a second mutate() arg — useMutation only ever forwards mutationFn's single variables arg.
    mutationFn: ({ buId, ...payload }) => servicePoMonthlyBudgetApi.saveBudget(payload, buId),
    // Broad prefix match — a save affects both this month's list and this PO's own record
    // query, so invalidate everything under this feature rather than tracking which key applies.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-po-monthly-budget'] }),
  });
};
