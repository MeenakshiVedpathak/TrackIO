// The newer /reports/* endpoints (PM-wise/Project-wise Utilization, Month-wise/Resource-wise
// Bench) don't share one consistent response envelope — confirmed against real responses, not
// assumed: PM-wise/Project-wise Utilization nest rows at `data.data.records` and lift `meta` to
// the top level (a sibling of `data`), while Month-wise Bench nests rows at `data.data.data` (a
// second, literal "data" key) with no `meta` at all. Guessing one shape per report risked exactly
// what happened here — a real, non-empty response silently reading as zero rows because the
// array lived one key over from where that report's code looked. This tries every shape actually
// seen across these endpoints instead of assuming a single one.
export const extractReportRows = (payload) => {
  const inner = payload?.data;
  if (Array.isArray(inner)) return inner;
  if (Array.isArray(inner?.records)) return inner.records;
  if (Array.isArray(inner?.data)) return inner.data;
  return [];
};
