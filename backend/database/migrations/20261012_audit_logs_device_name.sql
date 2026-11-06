-- =============================================================================
-- audit_logs — a readable name for the device an action came from (next to device_id).
--
-- device_name is what the app sends in X-Device-Name, or, when the app does not send one, a name the
-- server builds from the browser User-Agent ("Chrome 130 · Windows"). A browser cannot read the
-- computer's real hostname, so this is a label for humans, not a hardware identifier.
-- Safe to re-run.
-- =============================================================================

BEGIN;

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS device_name VARCHAR(120);

COMMIT;
