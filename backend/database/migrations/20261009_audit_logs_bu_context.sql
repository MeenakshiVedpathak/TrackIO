-- =============================================================================
-- audit_logs — record WHICH Business Unit an action belongs to and in WHICH
-- role the actor performed it, so the Audit Log screen can filter by BU / Sub-BU
-- and show "who did what, as what, for which BU".
--
--   company_id  : the BU the action/record belongs to (the Service PO's / client's /
--                 work log's BU; for a Business Unit itself, that BU; otherwise the BU
--                 the actor was acting under). NULL = not BU-specific (platform level).
--   actor_role  : the role the actor was logged in as when they did it.
--
-- Existing rows are back-filled best-effort from their own old/new snapshot and from
-- the affected record. Rows that cannot be resolved stay NULL. Safe to re-run.
-- =============================================================================

BEGIN;

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS company_id INTEGER;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_role VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created ON audit_logs (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON audit_logs (user_id, created_at DESC);

-- 1) company_id carried in the row's own snapshot (service_pos, clients, projects, ...)
UPDATE audit_logs a
   SET company_id = COALESCE(
         CASE WHEN a.new_values->>'company_id' ~ '^[0-9]+$' THEN (a.new_values->>'company_id')::int END,
         CASE WHEN a.old_values->>'company_id' ~ '^[0-9]+$' THEN (a.old_values->>'company_id')::int END)
 WHERE a.company_id IS NULL
   AND (a.new_values ? 'company_id' OR a.old_values ? 'company_id');

-- 2) a Business Unit's own changes belong to that BU
UPDATE audit_logs a
   SET company_id = a.entity_id
  FROM companies c
 WHERE a.company_id IS NULL AND a.entity_type = 'companies' AND c.id = a.entity_id;

-- 3) look the BU up on the affected record (rows that still exist)
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

-- an Employee's own record: their (lowest-id) active Business Unit
UPDATE audit_logs a
   SET company_id = (SELECT MIN(m.business_unit_id) FROM employee_business_units m
                      WHERE m.employee_id = a.entity_id AND m.status = 'active')
 WHERE a.company_id IS NULL AND a.entity_type = 'employees';

-- 4) never keep an id that is not a real BU
UPDATE audit_logs a SET company_id = NULL
 WHERE a.company_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = a.company_id);

COMMIT;
