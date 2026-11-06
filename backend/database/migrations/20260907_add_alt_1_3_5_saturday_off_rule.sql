-- Week Off Policy: add ALT_1_3_5 (1st, 3rd & 5th Saturday off, + every
-- Sunday) to companies.saturday_off_rule's accepted values. A month with
-- only 4 Saturdays simply has no 5th, so no special handling is needed —
-- see src/utils/weekOffPolicy.js.
--
-- Replaces the CHECK constraint created in
-- 20260901_add_off_day_work_approval.sql. The column is VARCHAR(10), so the
-- 9-character value fits without a type change. No data changes.
-- Safe to re-run.

BEGIN;

ALTER TABLE companies DROP CONSTRAINT IF EXISTS chk_companies_saturday_off_rule;
ALTER TABLE companies
  ADD CONSTRAINT chk_companies_saturday_off_rule
  CHECK (saturday_off_rule IN ('ALL', 'ALT_1_3', 'ALT_2_4', 'ALT_1_3_5', 'NONE'));

COMMIT;
