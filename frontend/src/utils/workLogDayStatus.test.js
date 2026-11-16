import { describe, it, expect } from 'vitest';
import {
  approvalStateOf, countsByDate, statusByServicePo, statusByRow, summarizeDay, describeCounts,
} from './workLogDayStatus';

const entry = (date, status, extra = {}) => ({ timesheet_date: date, service_po_id: 1, status, ...extra });

describe('workLogDayStatus', () => {
  it('counts synced as approved and pending+revert_reason as reverted', () => {
    const counts = countsByDate([
      entry('2026-11-03', 'synced'),
      entry('2026-11-03', 'approved'),
      entry('2026-11-03', 'pending', { revert_reason: 'wrong PO' }),
      entry('2026-11-03', 'pending'),
      entry('2026-11-04', 'rejected'),
    ]);
    expect(counts['2026-11-03']).toEqual({ approved: 2, pending: 1, rejected: 0, reverted: 1, deleted: 0 });
    expect(counts['2026-11-04'].rejected).toBe(1);
  });

  it('picks the most urgent state', () => {
    const base = { approved: 0, pending: 0, rejected: 0, reverted: 0, deleted: 0 };
    expect(approvalStateOf({ ...base, rejected: 1, approved: 3 })).toBe('rejected');
    expect(approvalStateOf({ ...base, reverted: 1 })).toBe('reverted');
    expect(approvalStateOf({ ...base, reverted: 1, approved: 2 })).toBe('partiallyReverted');
    expect(approvalStateOf({ ...base, pending: 2, approved: 1 })).toBe('pending');
    expect(approvalStateOf({ ...base, approved: 2 })).toBe('approved');
    expect(approvalStateOf({ ...base, deleted: 1 })).toBe('deleted');
    expect(approvalStateOf(base)).toBeNull();
  });

  it('prefers the calendar endpoint statusCounts when present', () => {
    const derived = { approved: 1, pending: 0, rejected: 0, reverted: 0, deleted: 0 };
    expect(summarizeDay({ statusCounts: { deleted: 2 } }, derived)).toEqual({
      approved: 0, pending: 0, rejected: 0, reverted: 0, deleted: 2,
    });
    expect(summarizeDay({}, derived)).toBe(derived);
  });

  it('groups per Service PO with the first remark / reason', () => {
    const map = statusByServicePo([
      entry('2026-11-03', 'rejected', { service_po_id: 7, rejection_remark: 'Add details' }),
      entry('2026-11-03', 'pending', { service_po_id: 9, revert_reason: 'Re-check hours' }),
    ]);
    expect(map['7'].counts.rejected).toBe(1);
    expect(map['7'].rejectionRemark).toBe('Add details');
    expect(map['9'].counts.reverted).toBe(1);
    expect(map['9'].revertReason).toBe('Re-check hours');
  });

  it('groups per entry-list row (hierarchy node, else the PO itself)', () => {
    const map = statusByRow([
      entry('2026-11-03', 'pending', { service_po_id: 7, hierarchy_node_id: 42, revert_reason: 'Wrong task' }),
      entry('2026-11-03', 'approved', { service_po_id: 7, hierarchy_node_id: 43 }),
      entry('2026-11-03', 'rejected', { service_po_id: 7, hierarchy_node_id: null }),
    ]);
    expect(map['h:42'].counts.reverted).toBe(1);
    expect(map['h:42'].revertReason).toBe('Wrong task');
    expect(map['h:43'].counts.approved).toBe(1);
    expect(map['po:7'].counts.rejected).toBe(1);
  });

  it('counts lines deleted by someone else as deleted', () => {
    const byApprover = { employee_id: 268, deleted_by: 267 };
    const map = statusByRow([
      entry('2026-11-03', 'approved', { hierarchy_node_id: 5, deleted_at: '2026-11-04T10:00:00Z', ...byApprover }),
      entry('2026-11-03', 'deleted', { hierarchy_node_id: 6, ...byApprover }),
      entry('2026-11-03', 'pending', { hierarchy_node_id: 7, is_deleted: true, ...byApprover }),
    ]);
    expect(map['h:5'].counts).toMatchObject({ deleted: 1, approved: 0 });
    expect(map['h:6'].counts.deleted).toBe(1);
    expect(map['h:7'].counts).toMatchObject({ deleted: 1, pending: 0 });
  });

  it('ignores self-deleted, unknown-deleter and re-save-replaced lines', () => {
    const at = '2026-11-04T10:00:00Z';
    const map = statusByRow([
      entry('2026-11-03', 'pending', { hierarchy_node_id: 8, deleted_at: at, employee_id: 268, deleted_by: 268 }),
      entry('2026-11-03', 'pending', { hierarchy_node_id: 9, deleted_at: at, employee_id: 268, deleted_by: null }),
      entry('2026-11-03', 'pending', { hierarchy_node_id: 10, deleted_at: at, employee_id: 268, deleted_by: 267, deleted_via: 'replace' }),
    ]);
    ['h:8', 'h:9', 'h:10'].forEach((k) => expect(map[k].counts).toMatchObject({ deleted: 0, pending: 0 }));
  });

  it('describes counts for tooltips', () => {
    expect(describeCounts({ approved: 2, pending: 1, rejected: 0, reverted: 0, deleted: 1 }))
      .toBe('2 approved · 1 pending · 1 deleted');
  });
});
