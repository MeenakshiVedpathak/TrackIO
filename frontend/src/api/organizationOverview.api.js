import apiClient from '@/services/apiClient';

// Platform Admin only — ONE endpoint backs all four Organization Overview tabs (Overview,
// Business Units, Projects & POs, Users). No per-tab/per-filter API calls; everything past this
// one fetch is client-side derivation over the same cached response (see
// hooks/useOrganizationOverview.js and pages/organizationOverview/OrganizationOverview.jsx).
export const organizationOverviewApi = {
  get: () => apiClient.get('/platform-admin/organization-overview').then((r) => r.data?.data ?? {}),
};
