import { describe, it, expect } from 'vitest';
import {
  isBlankDescription, validateDayEntries, LOG_DESC_REQUIRED_MESSAGE,
} from './employeeMonthlySummary';

const CAP = 24;

describe('isBlankDescription', () => {
  it('treats empty, whitespace-only and missing values as blank', () => {
    expect(isBlankDescription('')).toBe(true);
    expect(isBlankDescription('   ')).toBe(true);
    expect(isBlankDescription(undefined)).toBe(true);
  });

  it('treats any text as filled', () => {
    expect(isBlankDescription('x')).toBe(false);
  });
});

describe('validateDayEntries — requireDescription', () => {
  const withBlank = [
    { service_po_id: 1, hierarchy_node_id: null, hours: 2, description: 'Did the thing' },
    { service_po_id: 1, hierarchy_node_id: 5, hours: 2, description: '   ' },
  ];
  const allFilled = [
    { service_po_id: 1, hierarchy_node_id: null, hours: 2, description: 'Did the thing' },
    { service_po_id: 1, hierarchy_node_id: 5, hours: 2, description: 'And another' },
  ];

  it('rejects a blank description when required', () => {
    expect(validateDayEntries(withBlank, '2026-11-17', CAP, 0, { requireDescription: true }))
      .toBe(LOG_DESC_REQUIRED_MESSAGE);
  });

  it('allows a blank description when the option is omitted or false', () => {
    expect(validateDayEntries(withBlank, '2026-11-17', CAP, 0)).toBeNull();
    expect(validateDayEntries(withBlank, '2026-11-17', CAP, 0, { requireDescription: false })).toBeNull();
  });

  it('passes when every entry has a description', () => {
    expect(validateDayEntries(allFilled, '2026-11-17', CAP, 0, { requireDescription: true })).toBeNull();
  });
});
