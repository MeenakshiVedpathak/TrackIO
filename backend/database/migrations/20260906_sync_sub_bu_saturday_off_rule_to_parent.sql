-- One-time data fix: a Sub-BU's Week Off Policy (saturday_off_rule) always
-- follows its Parent BU (decided 2026-09-30 — see companyService.update(),
-- which now cascades a Parent's change to its Sub-BUs and keeps a Sub-BU's
-- own value read-only).
--
-- Before this, companyService.create() copied the Parent's rule onto a new
-- Sub-BU once, but a later change to the Parent never reached its Sub-BUs,
-- so they drifted (e.g. Parent "DATA + AI" = NONE while its Sub-BUs "DAS" /
-- "IBM" still had ALL, so their employees kept seeing every Saturday off).
--
-- Idempotent: only rows that still differ from their Parent are touched.
-- Data-only; no schema change.

BEGIN;

UPDATE companies c
SET saturday_off_rule = p.saturday_off_rule,
    updated_at = NOW()
FROM companies p
WHERE c.parent_business_unit_id = p.id
  AND c.is_deleted = false
  AND p.is_deleted = false
  AND c.saturday_off_rule IS DISTINCT FROM p.saturday_off_rule;

COMMIT;
