-- =============================================================================
-- audit_logs — record the DEVICE an action came from (instead of the IP address).
--
-- device_id is a random id the app generates once per browser/device and sends on every request
-- (X-Device-Id header). It identifies "which device", not a person's network location. New rows no
-- longer store the IP address; the old ip_address column and its history are left untouched.
-- Safe to re-run.
-- =============================================================================

BEGIN;

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS device_id VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_audit_logs_device ON audit_logs (device_id) WHERE device_id IS NOT NULL;

COMMIT;
