-- Rollback for 20260907_add_alt_1_3_5_saturday_off_rule.sql
--
-- Restores the 4-value CHECK constraint. Any BU already using ALT_1_3_5 is
-- first moved to ALT_1_3 (the closest older pattern: it only loses the rare
-- 5th Saturday) — otherwise re-adding the old constraint would fail.

BEGIN;

UPDATE companies SET saturday_off_rule = 'ALT_1_3', updated_at = NOW()
WHERE saturday_off_rule = 'ALT_1_3_5';

ALTER TABLE companies DROP CONSTRAINT IF EXISTS chk_companies_saturday_off_rule;
ALTER TABLE companies
  ADD CONSTRAINT chk_companies_saturday_off_rule
  CHECK (saturday_off_rule IN ('ALL', 'ALT_1_3', 'ALT_2_4', 'NONE'));

COMMIT;
