-- =============================================================================
-- Make audit activity traceable to a LOGIN SESSION and to the DEVICES a person uses.
--
--   audit_logs.session_id : the login session (employee_login_sessions.family_id) an action was done
--                           in. The session already holds the login time, IP address and browser, so
--                           every audit row can be traced to them without storing the IP on each row.
--   user_devices          : one row per (person, device id) — first/last seen, how many logins, the
--                           last login IP. Lets the audit screen list a person's devices, and flag a
--                           login from a device that person has never used before (a new browser
--                           profile or an incognito window always looks new).
--
-- Safe to re-run.
-- =============================================================================

BEGIN;

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS session_id VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_audit_logs_session ON audit_logs (session_id) WHERE session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_devices (
  id            BIGSERIAL PRIMARY KEY,
  employee_id   INTEGER      NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  device_id     VARCHAR(64)  NOT NULL,
  device_name   VARCHAR(120),
  user_agent    VARCHAR(400),
  first_seen_at TIMESTAMP    NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMP    NOT NULL DEFAULT now(),
  last_ip       VARCHAR(45),
  login_count   INTEGER      NOT NULL DEFAULT 1,
  CONSTRAINT uq_user_devices_employee_device UNIQUE (employee_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_devices_employee ON user_devices (employee_id, last_seen_at DESC);

COMMIT;
