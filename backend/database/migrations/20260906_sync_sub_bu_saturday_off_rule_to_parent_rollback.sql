-- Rollback for 20260906_sync_sub_bu_saturday_off_rule_to_parent.sql
--
-- Intentionally a no-op. The forward migration overwrote drifted Sub-BU
-- saturday_off_rule values with their Parent's; the previous (drifted)
-- values were not recorded, and restoring them would re-introduce the bug
-- (Sub-BU employees seeing a different Saturday policy than their Parent BU).
-- Each company's previous value is still visible in the audit log only if it
-- was changed through the application.

SELECT 1;
