BEGIN;

ALTER TABLE employee_work_logs DROP CONSTRAINT IF EXISTS chk_employee_work_logs_hours_by_log_type;

ALTER TABLE employee_work_logs
  ADD CONSTRAINT chk_employee_work_logs_hours_by_log_type CHECK (
    hours > 0 AND (
      (log_type = 'daily' AND hours <= 24) OR
      (log_type = 'monthly' AND hours <= 744)
    )
  );

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key   VARCHAR(100) PRIMARY KEY,
  setting_value TEXT         NOT NULL,
  description   TEXT,
  updated_by    INTEGER,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (setting_key, setting_value, description)
VALUES (
  'monthly_cap_hours',
  '176',
  'Monthly cap hours: an employee''s monthly timesheet hours are scaled down to this total at sync/import time, and reports use it as monthly capacity.'
)
ON CONFLICT (setting_key) DO NOTHING;

ALTER TABLE timesheet_import_history
  ADD COLUMN IF NOT EXISTS cap_hours NUMERIC(6,2) NOT NULL DEFAULT 176;

ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS original_hours NUMERIC(5,2);

UPDATE timesheets t
   SET original_hours = s.original_hours
  FROM (
    SELECT w.timesheet_import_id, w.employee_id, w.service_po_id, w.work_date,
           SUM(w.hours) AS original_hours
      FROM employee_work_logs w
     WHERE w.timesheet_import_id IS NOT NULL
       AND w.status = 'synced'
     GROUP BY w.timesheet_import_id, w.employee_id, w.service_po_id, w.work_date
  ) s
 WHERE t.original_hours IS NULL
   AND t.timesheet_import_id = s.timesheet_import_id
   AND t.employee_id         = s.employee_id
   AND t.service_po_id       = s.service_po_id
   AND t.timesheet_date      = s.work_date
   AND s.original_hours BETWEEN 0 AND 999.99;

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS company_id INTEGER;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_role VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created ON audit_logs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs (user_id, created_at DESC);

UPDATE audit_logs a
   SET company_id = COALESCE(
         CASE WHEN a.new_values->>'company_id' ~ '^[0-9]+$' THEN (a.new_values->>'company_id')::int END,
         CASE WHEN a.old_values->>'company_id' ~ '^[0-9]+$' THEN (a.old_values->>'company_id')::int END)
 WHERE a.company_id IS NULL
   AND (a.new_values ? 'company_id' OR a.old_values ? 'company_id');

UPDATE audit_logs a
   SET company_id = a.entity_id
  FROM companies c
 WHERE a.company_id IS NULL AND a.entity_type = 'companies' AND c.id = a.entity_id;

UPDATE audit_logs a SET company_id = t.company_id FROM service_pos t
 WHERE a.company_id IS NULL AND a.entity_type = 'service_pos' AND t.id = a.entity_id AND t.company_id IS NOT NULL;
UPDATE audit_logs a SET company_id = t.company_id FROM clients t
 WHERE a.company_id IS NULL AND a.entity_type = 'clients' AND t.id = a.entity_id AND t.company_id IS NOT NULL;
UPDATE audit_logs a SET company_id = t.company_id FROM projects t
 WHERE a.company_id IS NULL AND a.entity_type = 'projects' AND t.id = a.entity_id AND t.company_id IS NOT NULL;
UPDATE audit_logs a SET company_id = t.company_id FROM employee_work_logs t
 WHERE a.company_id IS NULL AND a.entity_type = 'employee_work_logs' AND t.id = a.entity_id AND t.company_id IS NOT NULL;
UPDATE audit_logs a SET company_id = t.company_id FROM cost_budget_master t
 WHERE a.company_id IS NULL AND a.entity_type = 'cost_budget_master' AND t.id = a.entity_id AND t.company_id IS NOT NULL;
UPDATE audit_logs a SET company_id = t.company_id FROM resource_budget_master t
 WHERE a.company_id IS NULL AND a.entity_type = 'resource_budget_master' AND t.id = a.entity_id AND t.company_id IS NOT NULL;
UPDATE audit_logs a SET company_id = h.company_id FROM service_po_hierarchy n JOIN service_pos h ON h.id = n.service_po_id
 WHERE a.company_id IS NULL AND a.entity_type = 'service_po_hierarchy' AND n.id = a.entity_id AND h.company_id IS NOT NULL;

UPDATE audit_logs a
   SET company_id = (SELECT MIN(m.business_unit_id) FROM employee_business_units m
                      WHERE m.employee_id = a.entity_id AND m.status = 'active')
 WHERE a.company_id IS NULL AND a.entity_type = 'employees';

UPDATE audit_logs a SET company_id = NULL
 WHERE a.company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = a.company_id);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS device_id VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_audit_logs_device ON audit_logs (device_id) WHERE device_id IS NOT NULL;

ALTER TABLE companies ALTER COLUMN company_code TYPE VARCHAR(30);

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

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS device_name VARCHAR(120);

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

INSERT INTO form_master (module_name, form_name, status, seq, category_id)
SELECT 'Reports', 'Cross-BU Employee & PO Hours', 'active',
       (SELECT COALESCE(MAX(seq), 0) + 1 FROM form_master),
       (SELECT category_id FROM form_master
         WHERE module_name = 'Reports' AND form_name = 'Project-Wise Timesheet Report')
ON CONFLICT (module_name, form_name) DO NOTHING;

INSERT INTO role_form_mapping (role_id, form_id, status)
SELECT r.id, f.id, true
FROM roles r
JOIN form_master f ON f.module_name = 'Reports' AND f.form_name = 'Cross-BU Employee & PO Hours'
WHERE r.role_name IN ('Admin', 'BU Admin')
ON CONFLICT (role_id, form_id) DO UPDATE SET status = true, updated_at = now();

INSERT INTO form_master (module_name, form_name, status, seq)
SELECT 'Administration', 'Audit Logs', 'active', (SELECT COALESCE(MAX(seq), 0) + 1 FROM form_master)
ON CONFLICT (module_name, form_name) DO NOTHING;

INSERT INTO role_form_mapping (role_id, form_id, status)
SELECT r.id, f.id, true
FROM roles r
JOIN form_master f ON f.module_name = 'Administration' AND f.form_name = 'Audit Logs'
WHERE r.role_name IN ('Platform Admin', 'Admin', 'Entity Admin', 'BU Admin')
ON CONFLICT (role_id, form_id) DO UPDATE SET status = true, updated_at = now();

DO $$
DECLARE
  t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uvtechsoft') THEN
    FOREACH t IN ARRAY ARRAY['system_settings', 'security_attempts', 'user_devices']
    LOOP
      IF to_regclass('public.' || t) IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.%I OWNER TO uvtechsoft', t);
      END IF;
    END LOOP;

    IF to_regclass('public.security_attempts_id_seq') IS NOT NULL THEN
      EXECUTE 'ALTER SEQUENCE public.security_attempts_id_seq OWNER TO uvtechsoft';
    END IF;
    IF to_regclass('public.user_devices_id_seq') IS NOT NULL THEN
      EXECUTE 'ALTER SEQUENCE public.user_devices_id_seq OWNER TO uvtechsoft';
    END IF;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    INSERT INTO schema_migrations (name) VALUES
      ('20261007_raise_work_log_hours_caps.sql'),
      ('20261008_monthly_cap_hours_setting.sql'),
      ('20261009_add_timesheets_original_hours.sql'),
      ('20261009_audit_logs_bu_context.sql'),
      ('20261010_audit_logs_device_id.sql'),
      ('20261011_companies_code_length_30.sql'),
      ('20261011_security_attempts.sql'),
      ('20261012_audit_logs_device_name.sql'),
      ('20261013_audit_session_and_devices.sql')
    ON CONFLICT DO NOTHING;
  END IF;
END
$$;

COMMIT;

SELECT 'audit_logs.' || column_name AS present
  FROM information_schema.columns
 WHERE table_name = 'audit_logs'
   AND column_name IN ('company_id', 'actor_role', 'device_id', 'device_name', 'session_id')
UNION ALL SELECT 'timesheets.original_hours' FROM information_schema.columns WHERE table_name = 'timesheets' AND column_name = 'original_hours'
UNION ALL SELECT 'timesheet_import_history.cap_hours' FROM information_schema.columns WHERE table_name = 'timesheet_import_history' AND column_name = 'cap_hours'
UNION ALL SELECT 'table.' || table_name FROM information_schema.tables WHERE table_name IN ('system_settings', 'security_attempts', 'user_devices')
ORDER BY 1;

SELECT f.module_name, f.form_name, r.role_name, m.status
  FROM form_master f
  JOIN role_form_mapping m ON m.form_id = f.id
  JOIN roles r ON r.id = m.role_id
 WHERE f.form_name IN ('Cross-BU Employee & PO Hours', 'Audit Logs')
 ORDER BY f.form_name, r.role_name;

SELECT tablename, tableowner FROM pg_tables WHERE tablename IN ('system_settings', 'security_attempts', 'user_devices');
