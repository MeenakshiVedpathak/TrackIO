import { useAuth } from '@/hooks/useAuth';
import { useCompany } from '@/hooks/useCompanies';

// Resolves the logged-in Employee's effective `saturday_off_rule` — the single BU-level setting
// isOffDay() needs to tell a working Saturday from an off one (Sunday is always off regardless).
// GET /companies/:id (useCompany) is the BU Master endpoint — an Employee-only login isn't
// guaranteed access to it, so its `saturday_off_rule` is a best-effort enrichment, never the sole
// source. `activeBu`/`employee.business_units`, both already scoped to what this login can see
// (populated at login via GET /employees/:id/business-units), take priority; without those this
// used to silently fall through to 'ALL' whenever the Master call 403'd, gating every Saturday for
// an employee whose BU is actually only 1st/3rd (or 2nd/4th, or none). Shared by every screen that
// needs to gate hours-logging on an off-day (My Work Log, Time Entry, Monthly Summary) so they can
// never disagree about which days are off for this employee.
export const useSaturdayOffRule = () => {
  const { businessUnits, activeBuId, employee } = useAuth();
  const effectiveBuId = activeBuId || businessUnits?.[0]?.id || employee?.business_units?.[0]?.id || employee?.business_unit_ids?.[0];
  // Overrides the app-wide 5-minute staleTime/no-refocus-refetch default (src/lib/queryClient.js)
  // for this one query specifically — confirmed live: an Admin flipping a BU's Saturday-off policy
  // never reached an already-logged-in Employee's My Work Log calendar without a full logout,
  // because the global default only refetches once the cached copy turns 5 minutes stale, and
  // never on tab-switch/refocus at all. This value gates whether an employee can even log hours on
  // a given day, so it needs to be near-live, unlike the list/report pages the global default was
  // tuned for.
  const { data: currentCompany } = useCompany(effectiveBuId, { staleTime: 0, refetchOnWindowFocus: true });
  const activeBu = businessUnits?.find((b) => b.id === effectiveBuId) || businessUnits?.[0];
  const employeeBu = employee?.business_units?.find((b) => b.id === effectiveBuId) || employee?.business_units?.[0];
  // `currentCompany` (GET /companies/:id, a live React Query fetch) now wins first — it's the only
  // one of these three that's ever refreshed after login. `activeBu`/`employeeBu` come from
  // `businessUnits`/`employee.business_units`, a snapshot fetched ONCE at login (or role-switch)
  // and never refetched for the rest of the session (see this file's own header comment). Putting
  // that stale snapshot first meant a BU's Saturday-off policy edited by an Admin/BU Admin while
  // this Employee was already logged in never took effect until they logged out and back in —
  // confirmed live: the calendar kept showing the OLD policy on every screen that calls this hook,
  // even after navigating away and back, because the snapshot's own (stale) value always won the
  // `||` chain before the live fetch was ever consulted. The snapshot is still the fallback for
  // whenever `currentCompany` hasn't resolved yet or 403s for this login (unchanged from before).
  return currentCompany?.saturday_off_rule || activeBu?.saturday_off_rule || employeeBu?.saturday_off_rule || 'ALL';
};

export default useSaturdayOffRule;
