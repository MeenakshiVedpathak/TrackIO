BEGIN;

DELETE FROM role_capabilities
WHERE capability_key = 'employee.view_timesheet'
  AND role_id IN (SELECT id FROM roles WHERE role_name = 'Project Manager');

COMMIT;
