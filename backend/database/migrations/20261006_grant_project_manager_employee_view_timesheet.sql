-- =============================================================================
-- Project Manager — grant employee.view_timesheet.
--
-- GET /employee-timesheets/projects (the caller's own mapped-projects list) is
-- gated by employee.view_timesheet, which only the 'Employee' role held. A user
-- who logs in with the Project Manager role therefore got
-- "Unauthorized access attempt ... requiredCapabilities: employee.view_timesheet".
--
-- Looked up by role_name (role ids differ between local and prod). Read-only
-- capability; no other employee.* capability is granted. Safe to re-run.
-- =============================================================================

BEGIN;

INSERT INTO role_capabilities (role_id, capability_key)
SELECT r.id, 'employee.view_timesheet'
FROM roles r
WHERE r.role_name = 'Project Manager'
ON CONFLICT (role_id, capability_key) DO NOTHING;

COMMIT;
