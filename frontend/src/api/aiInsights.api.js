import apiClient, { crossBuScopeForAdmin } from '@/services/apiClient';

// Admin is cross-BU: the reads below drop the global X-Company-Id (crossBuScopeForAdmin) so the navbar
// BU switcher never narrows an Admin's insights — this page's own BU filter (company_id) does that.
// Every call here is BU-scoped by the backend from the caller's reach. The request interceptor adds
// X-Company-Id from the global BU selector; `params.company_id` (when passed) wins over it and only
// NARROWS the result (a parent BU includes its Sub-BUs). No BU selected = the caller's whole reach.
export const aiInsightsApi = {
  // Response: { success, message, data: [...insights], meta: { total, page, limit, totalPages, hasNext, hasPrev } }
  // Params: job_key, severity, is_read, include_dismissed, page, limit (max 100), company_id,
  // month=YYYY-MM (the month the report is ABOUT, i.e. period_month — not generated_at).
  // Monthly insights also carry: scope_type ('bu'|'tenant'|null), period_month ('YYYY-MM-01'),
  // report_state ('complete'|'partial'|'pending_sync'), sync_status {synced_count,total_count,synced[],pending[]}|null.
  // Tenant reports have company_id = null and bu_name = null.
  getInsights: (params) => apiClient.get('/ai-insights', { params, ...crossBuScopeForAdmin() }).then((r) => r.data),
  getMyRole: (params) => apiClient.get('/ai-insights/my-role', { params, ...crossBuScopeForAdmin() }).then((r) => r.data),
  getUnread: (params) => apiClient.get('/ai-insights/unread', { params, ...crossBuScopeForAdmin() }).then((r) => r.data),
  // 404 when the insight is outside the caller's reach — treat as "not found".
  getById: (id) => apiClient.get(`/ai-insights/${id}`, { ...crossBuScopeForAdmin() }).then((r) => r.data),
  markRead: (id) => apiClient.put(`/ai-insights/${id}/read`).then((r) => r.data),
  dismiss: (id) => apiClient.put(`/ai-insights/${id}/dismiss`).then((r) => r.data),

  // Manual runs are for exactly ONE BU / Sub-BU — `companyId` must resolve to a single unit
  // (400 "Select one Business Unit / Sub-BU ..." otherwise). 201 = insight created; 200 with
  // data:null = ran but produced no insight.
  run: (jobKey, { companyId, referenceId } = {}) =>
    apiClient
      .post(
        `/ai-insights/run/${jobKey}`,
        referenceId != null ? { reference_id: referenceId } : {},
        { params: companyId != null ? { company_id: companyId } : undefined },
      )
      .then((r) => r.data),
  // 200 { results: [{ job_key, status: success|failed|skipped, error? }] }
  runAll: ({ companyId } = {}) =>
    apiClient
      .post('/ai-insights/run-all', {}, { params: companyId != null ? { company_id: companyId } : undefined })
      .then((r) => r.data),
};
