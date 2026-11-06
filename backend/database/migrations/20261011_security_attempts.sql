-- =============================================================================
-- security_attempts — short-lived counter of suspicious attempts, so the audit log only records a
-- pattern (e.g. "3 wrong passwords", "opened a form they have no access to twice") and not every
-- single mistake. Held in the database, not in memory, so the count is right across servers.
--
--   kind     : LOGIN_FAILED | ACCESS_DENIED
--   subject  : who — the typed email (login) or the employee id (access)
--   detail   : what — for ACCESS_DENIED, the form / page they tried to open
--
-- Rows are throw-away (pruned after a day); the audit trail itself lives in audit_logs. Safe to re-run.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS security_attempts (
  id         BIGSERIAL PRIMARY KEY,
  kind       VARCHAR(40)  NOT NULL,
  subject    VARCHAR(255) NOT NULL,
  detail     VARCHAR(255),
  device_id  VARCHAR(64),
  created_at TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_attempts_lookup ON security_attempts (kind, subject, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_attempts_created ON security_attempts (created_at);

COMMIT;
