import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { systemSettingsApi } from '@/api/systemSettings.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

// Placeholder used only before the monthly-cap setting has been fetched (or if no cap could be
// obtained at all) so screens have a sane number to render on first paint. The real value always comes from
// GET /system-settings/monthly-cap — never hard-code the cap anywhere else in the frontend.
export const DEFAULT_MONTHLY_CAP_HOURS = 176;

const hasPeriod = (period) => !!(period?.month && period?.year);

// Raw setting: { monthly_cap_hours, cap_for_month, min, max, updated_by, updated_at }.
// `period` = { month, year } (optional) — scopes `cap_for_month` to that month.
export const useMonthlyCapSetting = (period, options = {}) => {
  const month = hasPeriod(period) ? Number(period.month) : undefined;
  const year = hasPeriod(period) ? Number(period.year) : undefined;
  return useQuery({
    queryKey: QUERY_KEYS.MONTHLY_CAP(month, year),
    queryFn: () => systemSettingsApi.getMonthlyCap({ month, year }),
    staleTime: 60_000,
    ...options,
  });
};

const toCap = (value) => {
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
};

// The cap as a plain number: the month's own synced cap when a period is given, otherwise the
// latest cap set by Admin. If the month-scoped request fails or returns no cap, falls back to the
// latest cap from the unscoped request (never a guessed literal). DEFAULT_MONTHLY_CAP_HOURS is
// returned only while the API has not answered yet and no cap has ever been fetched this session —
// a true GET failure (e.g. backend down on first load) does NOT silently report 176 if any other
// monthly-cap query in the cache has a real value; only a total, cache-empty failure does.
//
// NOTE: `cap_for_month` is a historical snapshot the backend locks in once a month starts and does
// NOT re-sync when Admin later changes the cap (confirmed live: Admin set 168 on 2026-10-08, but
// `cap_for_month` for the already-in-progress Oct 2026 and the earlier Sept 2026 still reported the
// old 176; only the untouched Nov 2026 reflected 168). That's fine for budget/report screens that
// want a period's as-set-at-the-time target, but an employee-facing screen showing a LIVE monthly
// target should use useEmployeeMonthlyCap below instead, which tracks Admin's current value always.
export const useMonthlyCap = (period) => {
  const qc = useQueryClient();
  const scoped = hasPeriod(period);
  const primary = useMonthlyCapSetting(period);
  const primaryCap = toCap(scoped ? primary.data?.cap_for_month : primary.data?.monthly_cap_hours);

  // Only needed when a month-scoped lookup failed or came back without cap_for_month.
  const needLatest = scoped && primaryCap == null && !primary.isPending;
  const latest = useMonthlyCapSetting(undefined, { enabled: needLatest });

  if (primaryCap != null) return primaryCap;
  if (scoped) {
    const latestCap = toCap(primary.data?.monthly_cap_hours) ?? toCap(latest.data?.monthly_cap_hours);
    if (latestCap != null) return latestCap;
  }

  // Both lookups are either still pending or have genuinely failed with nothing cached. Before
  // guessing the default, check whether any other monthly-cap query already has a real value
  // cached (e.g. another screen fetched it successfully) rather than silently reporting 176 as if
  // it were the real, Admin-set cap.
  const cached = qc
    .getQueriesData({ queryKey: ['system-settings', 'monthly-cap'] })
    .map(([, data]) => toCap(scoped ? data?.cap_for_month ?? data?.monthly_cap_hours : data?.monthly_cap_hours))
    .find((v) => v != null);
  if (cached != null) return cached;

  return DEFAULT_MONTHLY_CAP_HOURS;
};

// The cap for THIS logged-in employee's own month: the cap their synced timesheet used for that
// month, or — if nothing has synced for them yet — the latest Admin-set cap (what the backend
// itself falls back to in `cap_for_employee_month`). Use this everywhere an employee-facing screen
// shows a monthly target/expected hours; use `useMonthlyCap` only for admin/budget/report screens.
export const useEmployeeMonthlyCap = (period) => {
  const qc = useQueryClient();
  const { data, isPending } = useMonthlyCapSetting(period);
  const cap = toCap(data?.cap_for_employee_month) ?? toCap(data?.monthly_cap_hours);
  if (cap != null) return cap;
  if (!isPending) {
    // The request genuinely failed with nothing usable in its response — check whether any other
    // monthly-cap query already has a real value cached before guessing the literal default.
    const cached = qc
      .getQueriesData({ queryKey: ['system-settings', 'monthly-cap'] })
      .map(([, d]) => toCap(d?.cap_for_employee_month) ?? toCap(d?.monthly_cap_hours))
      .find((v) => v != null);
    if (cached != null) return cached;
  }
  return DEFAULT_MONTHLY_CAP_HOURS;
};

export const useUpdateMonthlyCap = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (value) => systemSettingsApi.updateMonthlyCap(value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['system-settings'] }),
  });
};
