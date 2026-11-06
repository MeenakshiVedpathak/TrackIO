-- =============================================================================
-- Role-wise Business Unit unmapping.
--
-- Business Units belong to the Employee (employee_business_units), not to a role. An Employee who
-- is BOTH a BU Admin and e.g. a Project Manager can be unmapped from a BU "as Project Manager"
-- only: the employee_business_units row stays (so the BU Admin role keeps the BU), and one row
-- here records that the given role must NOT see that BU.
--
-- The session's active role (token activeRoleId) decides which exclusions apply — see
-- src/middlewares/auth.js. Re-mapping the BU deletes its exclusion rows.
--
-- Safe to re-run.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS employee_business_unit_role_exclusions (
  id SERIAL PRIMARY KEY,
  employee_id INT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  business_unit_id INT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  role_id INT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  created_by INT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ebu_role_exclusions ON employee_business_unit_role_exclusions (employee_id, business_unit_id, role_id);
CREATE INDEX IF NOT EXISTS idx_ebu_role_exclusions_employee ON employee_business_unit_role_exclusions (employee_id);

COMMIT;
