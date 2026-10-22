import apiClient from '@/services/apiClient';

// System-wide settings owned by Admin / Platform Admin. Both calls unwrap to the inner `data`
// object: { monthly_cap_hours, cap_for_month, min, max, updated_by, updated_at }.
// `month`/`year` are optional on the read — when given, `cap_for_month` is the cap that month was
// last synced with (the latest cap if it never was); without them it simply mirrors the latest cap.
export const systemSettingsApi = {
  getMonthlyCap: ({ month, year } = {}) => {
    const params = month && year ? { month, year } : undefined;
    return apiClient.get('/system-settings/monthly-cap', { params }).then((r) => r.data?.data);
  },
  updateMonthlyCap: (value) =>
    apiClient.put('/system-settings/monthly-cap', { monthly_cap_hours: value }).then((r) => r.data?.data),
};

export const { getMonthlyCap, updateMonthlyCap } = systemSettingsApi;
