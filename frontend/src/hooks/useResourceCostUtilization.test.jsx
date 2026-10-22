import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/api/reports.api', () => ({
  reportsApi: {
    getResourceCostUtilization: vi.fn(async (params) => ({
      data: { records: [], period: { startMonth: 7, startYear: 2026, endMonth: 9, endYear: 2026 } },
      meta: { total: params.businessUnitIds ? 103 : 9999, page: 1, totalPages: 1, hasPrev: false, hasNext: false, limit: 20 },
    })),
  },
}));

import { reportsApi } from '@/api/reports.api';
import { useResourceCostUtilization } from '@/hooks/useReports';

const range = {
  startMonth: 7,
  startYear: 2026,
  endMonth: 9,
  endYear: 2026,
  page: 1,
  limit: 20,
  sortBy: 'employee_name',
  sortOrder: 'ASC',
  isBillable: 'all',
  buId: 'all',
};

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => (
    <QueryClientProvider client={qc}>
      {children}
    </QueryClientProvider>
  );
};

describe('useResourceCostUtilization filter triggering (regression: BU filter not narrowing)', () => {
  beforeEach(() => {
    reportsApi.getResourceCostUtilization.mockClear();
  });

  it('refetches when businessUnitIds is added, sending the exact param name + value', async () => {
    const wrapper = makeWrapper();
    const { result, rerender } = renderHook(({ params }) => useResourceCostUtilization(params), {
      wrapper,
      initialProps: { params: { ...range } },
    });

    await waitFor(() => expect(reportsApi.getResourceCostUtilization).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.data?.meta?.total).toBe(9999)); // unfiltered cached response

    // Select a BU (e.g. Software Solutions / UV Tech = id 40) — the page calls setBuIds(['40']),
    // which rebuilds params with businessUnitIds: '40'.
    rerender({ params: { ...range, businessUnitIds: '40' } });

    await waitFor(() => expect(result.current.data?.meta?.total).toBe(103));

    const calls = reportsApi.getResourceCostUtilization.mock.calls;
    expect(calls).toHaveLength(2);
    // The SECOND outgoing request must carry the exact param the backend reads:
    expect(calls[1][0].businessUnitIds).toBe('40');
    // And the first must NOT carry it at all:
    expect(calls[0][0].businessUnitIds).toBeUndefined();
  });
});