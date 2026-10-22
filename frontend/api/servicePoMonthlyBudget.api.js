import apiClient, { explicitBuScope } from '@/services/apiClient';

export const servicePoMonthlyBudgetApi = {
  // Active Service POs the logged-in user is allowed to save budgets for — role-scoped on the
  // backend (Manager: only mapped POs; everyone else: full company). No budget data here.
  // Internal-no-invoice POs are never billed, so they carry no monthly budget — excluded here so
  // no consumer of this list (picker, lookup maps) has to filter them out itself.
  // `buId` (Monthly PO Reporting's Business Unit filter) scopes this the same way it scopes
  // getMonthList below — it has to, since this list is what decides which PO cards the grid
  // renders: scoping only the saved records would leave every other BU's POs on screen as
  // permanently-empty cards, which reads as the filter not working at all.
  getServicePOs: (buId) =>
    apiClient
      .get('/service-po-monthly-budgets/service-pos', { ...explicitBuScope(buId) })
      .then((r) => (r.data?.data ?? []).filter((po) => po.invoice_frequency !== 'internal-no-invoice')),

  // No service_po_id → every saved budget record for that month, across every PO the caller
  // can see. Only rows that were actually saved come back — not a full PO grid.
  // `buId` is the page's own Business Unit filter, applied as the request's BU scope
  // (X-Company-Id) rather than a query param — same convention as the Masters and the Reports
  // suite. `undefined` (a single-BU login, which has no filter) leaves the interceptor's global
  // BU header untouched, exactly as before this filter existed.
  getMonthList: (month, year, buId) =>
    apiClient
      .get('/service-po-monthly-budgets', { params: { month, year }, ...explicitBuScope(buId) })
      .then((r) => r.data?.data?.records ?? []),

  // 404 means nothing has been saved yet for this PO+month+year (same response as "not yours"/
  // "doesn't exist") — not an error state, so it resolves to null instead of throwing.
  // `buId` must match whatever scoped the PO into the picker/grid in the first place (the page's
  // own BU filter, same as getServicePOs/getMonthList above) — without it this falls back to the
  // global navbar BU, which 404s as "Service PO not found" the moment the two diverge (a
  // multi-BU login, or the page filter set to a BU other than the active one).
  getRecord: async (servicePoId, month, year, buId) => {
    try {
      const res = await apiClient.get('/service-po-monthly-budgets', {
        params: { service_po_id: servicePoId, month, year },
        ...explicitBuScope(buId),
      });
      return res.data?.data ?? null;
    } catch (err) {
      if (err?.response?.status === 404) return null;
      throw err;
    }
  },

  // Upserts on service_po_id + month + year. Response includes the saved record plus a
  // `deadline` block ({ deadline, days_remaining, deadline_passed }) for an overdue warning.
  // `buId` — see getRecord above: must be the same BU the sheet resolved the Service PO under, or
  // the save silently lands under the navbar's active BU instead of the intended one.
  saveBudget: (payload, buId) =>
    apiClient.post('/service-po-monthly-budgets', payload, { ...explicitBuScope(buId) }).then((r) => r.data?.data),
};
