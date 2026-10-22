import { describe, it, expect } from 'vitest';

// Pure extraction of the summary-building reduce logic from MonthlyResourceUtilization.jsx.
// Kept here (not imported from the component) so it can be unit-tested without the full
// React/Redux/TanStack context.
//
// The critical invariant: every numeric field in the initial accumulator must be 0 or null —
// never seeded from the API summary — because the reducer then ADDS each row's value on top.
// A non-null seed would count the API-summary value twice (seed + row = 2×).
function buildSummary(rows, hasOriginal = false) {
  const sumCustomerNonBillable = (r) =>
    (Number(r.customer_non_billable_total) || 0) +
    (Number(r.additional_non_billable_total) || 0);

  const sumCustomerNonBillableOriginal = (r) =>
    (Number(r.original_customer_non_billable_total) || 0) +
    (Number(r.original_additional_non_billable_total) || 0);

  return rows.reduce(
    (acc, r) => {
      acc.billable_total              += Number(r.billable_total)     || 0;
      acc.non_billable_total          += Number(r.non_billable_total) || 0;
      acc.leaves_hours                += Number(r.leaves_hours)       || 0;
      acc.total_utilization           += Number(r.total_utilization)  || 0;
      acc.customer_non_billable_total += sumCustomerNonBillable(r);

      if (r.total_hours != null) {
        acc.total_hours = (acc.total_hours ?? 0) + (Number(r.total_hours) || 0);
      }
      if (r.original_billable_total != null) {
        acc.original_billable_total = (acc.original_billable_total ?? 0) + (Number(r.original_billable_total) || 0);
      }
      if (r.original_non_billable_total != null) {
        acc.original_non_billable_total = (acc.original_non_billable_total ?? 0) + (Number(r.original_non_billable_total) || 0);
      }
      if (r.original_leaves_hours != null) {
        acc.original_leaves_hours = (acc.original_leaves_hours ?? 0) + (Number(r.original_leaves_hours) || 0);
      }
      if (r.original_total_utilization != null) {
        acc.original_total_utilization = (acc.original_total_utilization ?? 0) + (Number(r.original_total_utilization) || 0);
      }
      if (r.original_total_hours != null || r.original_total_logged_hours != null) {
        acc.original_total_hours = (acc.original_total_hours ?? 0) + (Number(r.original_total_hours ?? r.original_total_logged_hours) || 0);
      }
      if (hasOriginal) {
        acc.original_customer_non_billable_total =
          (acc.original_customer_non_billable_total ?? 0) + sumCustomerNonBillableOriginal(r);
      }
      return acc;
    },
    {
      billable_total: 0,
      non_billable_total: 0,
      leaves_hours: 0,
      total_utilization: 0,
      customer_non_billable_total: 0,
      total_hours: null,
      original_billable_total: null,
      original_non_billable_total: null,
      original_leaves_hours: null,
      original_total_utilization: null,
      original_total_hours: null,
      original_customer_non_billable_total: null,
    },
  );
}

describe('MonthlyResourceUtilization — summary buildSummary()', () => {
  it('sums a single row correctly — no double-counting', () => {
    const row = {
      billable_total: 100,
      non_billable_total: 30,
      leaves_hours: 8,
      total_utilization: 80,
      customer_non_billable_total: 10,
      total_hours: 168,
      original_billable_total: 120,
      original_non_billable_total: 40,
      original_leaves_hours: 12,
      original_total_utilization: 90,
      original_total_hours: 310,
    };

    const result = buildSummary([row], false);

    expect(result.total_hours).toBe(168);
    expect(result.original_total_hours).toBe(310);
    expect(result.billable_total).toBe(100);
    expect(result.original_billable_total).toBe(120);
    expect(result.non_billable_total).toBe(30);
    expect(result.original_non_billable_total).toBe(40);
    expect(result.leaves_hours).toBe(8);
    expect(result.original_leaves_hours).toBe(12);
    expect(result.total_utilization).toBe(80);
    expect(result.original_total_utilization).toBe(90);
  });

  it('does NOT double-count when API summary matches the single row (regression test)', () => {
    // This replicates the exact scenario from the bug report:
    // apiSummary = { total_hours: 168, original_total_hours: 310 }
    // One row also contributes those exact values.
    // Old (buggy) code seeded initial accumulator from apiSummary and then ALSO added the row
    // → result was 168 + 168 = 336 and 310 + 310 = 620.
    const apiSummary = { total_hours: 168, original_total_hours: 310 };
    const row = { total_hours: apiSummary.total_hours, original_total_hours: apiSummary.original_total_hours };

    const result = buildSummary([row], false);

    expect(result.total_hours).toBe(168);          // NOT 336
    expect(result.original_total_hours).toBe(310); // NOT 620
  });

  it('sums two rows additively', () => {
    const rows = [
      { billable_total: 60, total_hours: 100, original_total_hours: 120 },
      { billable_total: 40, total_hours: 80,  original_total_hours: 90  },
    ];

    const result = buildSummary(rows, false);

    expect(result.billable_total).toBe(100);
    expect(result.total_hours).toBe(180);
    expect(result.original_total_hours).toBe(210);
  });

  it('leaves original_* fields null when no row carries them', () => {
    const row = { billable_total: 50, total_hours: 100 };
    const result = buildSummary([row], false);

    expect(result.original_total_hours).toBeNull();
    expect(result.original_billable_total).toBeNull();
    expect(result.original_non_billable_total).toBeNull();
    expect(result.original_leaves_hours).toBeNull();
    expect(result.original_total_utilization).toBeNull();
  });

  it('accumulates original_customer_non_billable_total only when hasOriginal=true', () => {
    const row = {
      original_customer_non_billable_total: 15,
      original_additional_non_billable_total: 5,
    };

    const withOriginal    = buildSummary([row], true);
    const withoutOriginal = buildSummary([row], false);

    expect(withOriginal.original_customer_non_billable_total).toBe(20);
    expect(withoutOriginal.original_customer_non_billable_total).toBeNull();
  });

  it('handles an empty row array', () => {
    const result = buildSummary([]);
    expect(result.billable_total).toBe(0);
    expect(result.total_hours).toBeNull();
    expect(result.original_total_hours).toBeNull();
  });
});
