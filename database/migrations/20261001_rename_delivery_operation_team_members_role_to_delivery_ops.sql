-- =============================================================================
-- Rename the "Delivery Operation Team Members" role to "Delivery Ops".
--
-- Pure rename of an EXISTING role row — role_id is unchanged, so every
-- FK-based table (employee_roles, role_capabilities/role_form_mapping if
-- any are ever granted to it, etc.) keeps working untouched; only the
-- display name itself changes.
--
-- Also clears is_system (true -> false) on this one row. This role was
-- NOT one of the 9 fixed RBAC-redesign roles seeded by
-- 20260836_seed_target_roles_and_capabilities.sql (it was added later,
-- 2026-09-09, with created_by NULL — outside that migration and outside
-- the dynamic Role CRUD's own create path, which defaults is_system to
-- false) — its is_system=true appears to be a data-entry mistake, not an
-- intentional lock. Left uncorrected, roleService.js's updateRole()/
-- deleteRole() guards (is_system roles "cannot be renamed"/"cannot be
-- deleted") would keep blocking any future edit to this role through the
-- Role Management screen, exactly as they blocked this rename before this
-- migration.
--
-- Frontend dependency (fix alongside this migration, not covered here):
-- src/constants/roleHierarchy.js's DELIVERY_OPERATION_TEAM_MEMBERS_ROLE_NAME
-- constant hardcodes the OLD string and feeds ADDITIONAL_ROLE_NAMES,
-- checked by literal match in EmployeeList.jsx's isRoleAssignableByActor().
-- Must be updated to 'Delivery Ops' or that role silently stops being
-- assignable in the Employee Master Roles picker — same failure mode as
-- the SERVICE_PO_ADMIN rename this file's sibling migrations document.
--
-- Safe to re-run.
-- =============================================================================

BEGIN;

UPDATE roles
SET role_name = 'Delivery Ops',
    is_system = false,
    updated_at = NOW()
WHERE role_name = 'Delivery Operation Team Members';

COMMIT;
