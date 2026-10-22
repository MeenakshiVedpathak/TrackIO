import { z } from 'zod';
import { passwordSchema } from '@/utils/validators';

// Shared Zod field schemas for "this is an Employee" data — single source of truth so
// EmployeeForm.jsx and the BU Admin creation flow (CompanyForm.jsx, which also creates an
// Employee record for the new BU Admin) can never drift apart on validation rules.
// Local-timezone "today" as yyyy-MM-dd — used both as the DatePicker's `max` (so the calendar
// greys out future days) and by the schema below (so a date that arrives some other way is
// rejected too). Deliberately not `toISOString()`, which shifts to UTC and can hand back
// tomorrow's date for users east of UTC.
export const todayIsoDate = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

// One calendar day after `iso` (yyyy-MM-dd), or '' when there is nothing to advance. Backs the
// Date of Leaving picker's lower bound: leaving must fall AFTER joining, so the earliest
// selectable day is joining + 1. Built from local date parts and handed to the Date constructor
// as (y, m-1, d+1) so month/year rollover is handled for us, without the UTC shift toISOString()
// would introduce -- same reasoning as todayIsoDate above.
export const nextDayIsoDate = (iso) => {
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return '';
  const next = new Date(year, month - 1, day + 1);
  const nextMonth = String(next.getMonth() + 1).padStart(2, '0');
  const nextDay = String(next.getDate()).padStart(2, '0');
  return `${next.getFullYear()}-${nextMonth}-${nextDay}`;
};

export const employeeBaseFields = {
  employee_code: z.string().min(2, 'Must be at least 2 characters').max(20).regex(/^[A-Z0-9_-]+$/).transform((v) => v.toUpperCase()),
  full_name: z.string().min(2, 'Must be at least 2 characters').max(100)
    .regex(/^[A-Za-z\s]+$/, 'Only alphabetic characters are allowed'),
  email: z.string().min(1, 'Email is required').email('Invalid email address'),
  designation: z.string().max(100).optional().or(z.literal('')),
  total_experience: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(0).max(60).nullable().optional()),
  company_experience: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(0).max(60).nullable().optional()),
  resource_description: z.string().max(2000).optional().or(z.literal('')),
  payroll_entity: z.string().max(64).optional().or(z.literal('')),
  location: z.string().max(256).optional().or(z.literal('')),
  sub_location: z.string().max(256).optional().or(z.literal('')),
  date_of_joining: z.string().min(1, 'Date of joining is required')
    .refine((v) => v <= todayIsoDate(), 'Date of joining cannot be in the future'),
  // Optional, but when present it must be a real past-or-today date. The "after joining" half of
  // the rule reads a second field, so it can't live here -- see refineEmploymentDates below.
  date_of_leaving: z.string().optional().or(z.literal(''))
    .refine((v) => !v || v <= todayIsoDate(), 'Date of leaving cannot be in the future'),
  status: z.enum(['active', 'inactive']).default('active'),
  secondary_manager_employee_id: z.coerce.number().positive().optional().nullable(),
  is_timesheet_approval_required: z.boolean(),
};

// Employee Identity Migration: every employee now carries its own Business Units directly
// (flat many-to-many, replacing the old single `company_id`/BU-Head-only mapping) — required,
// same as `role_ids`, since an employee with zero BUs would be unable to be scoped by any
// BU-dependent screen.
export const employeeBusinessUnitIdsField = z.array(z.coerce.number()).min(1, 'Select at least one business unit');

export const employeePasswordField = passwordSchema
  .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Must contain at least one digit')
  .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character');

// Cross-field employment-date rule, applied at the object level because it reads both dates:
// Date of Leaving must fall strictly AFTER Date of Joining. Same-day is rejected on purpose --
// joining and leaving on one date is not an employment span, so the earliest valid value is
// joining + 1 day (the same bound nextDayIsoDate gives the picker).
//
// Every schema that spreads employeeBaseFields must pipe through this to get the rule, since a
// field-level schema cannot see its siblings. Takes and returns a schema so it composes after a
// .refine() chain (e.g. the password-match rule) rather than having to come first.
export const refineEmploymentDates = (schema) =>
  schema.superRefine((data, ctx) => {
    if (!data.date_of_leaving || !data.date_of_joining) return;
    if (data.date_of_leaving <= data.date_of_joining) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['date_of_leaving'],
        message: 'Date of leaving must be after date of joining',
      });
    }
  });
