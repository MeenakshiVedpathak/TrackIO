import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, IdCard, Lock, Users, Briefcase, ClipboardList, Building2 } from 'lucide-react';
import { useEmployee, useCreateEmployee, useUpdateEmployee, useAssignableManagers } from '@/hooks/useEmployees';
import { useRoles } from '@/hooks/useRoles';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { employeeBaseFields, employeePasswordField, todayIsoDate, nextDayIsoDate, refineEmploymentDates } from '@/constants/employeeFormSchema';
import { ROUTES } from '@/constants/routes';
import { ROLE_NAMES } from '@/constants/roleHierarchy';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import { cn } from '@/utils/cn';

const baseFields = employeeBaseFields;

const passwordField = employeePasswordField;

// Create requires a Password (Employee Master IS the login now — there's no more separate User
// Master) — Primary Manager stays optional. Roles/Business Units are no longer picked here at
// all — every new employee is sent to the backend with the plain "Employee" role by default
// (see onSubmit), and both Roles and Business Units are managed afterwards via the "Map Roles &
// Business Units" table action on Employee List.
const createSchema = refineEmploymentDates(
  z
    .object({
      ...baseFields,
      primary_manager_employee_id: z.coerce.number().positive().optional().nullable(),
      password: passwordField,
      confirmPassword: z.string(),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    })
);

// Manager reassignment is optional on update — password is never editable here (use the
// Employee List's Reset Password action instead). Roles/Business Units are edited exclusively
// via Employee List's mapping table, not this form, so they're neither shown nor submitted here.
const editSchema = refineEmploymentDates(
  z.object({
    ...baseFields,
    primary_manager_employee_id: z.coerce.number().positive().optional().nullable(),
  })
);

const FormSkeleton = () => (
  <div className="space-y-4 p-4">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="space-y-2 h-14 bg-muted animate-pulse rounded-md" />
    ))}
  </div>
);

const EmployeeForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { success, error: showError } = useNotification();

  const { data: employee, isPending: isLoadingEmployee } = useEmployee(id);
  const { data: managers = [], isPending: isLoadingManagers } = useAssignableManagers();
  // Only fetched to resolve the plain "Employee" role's id — every new employee is sent to the
  // backend with that role by default, since Roles are no longer selectable on this form (see
  // onSubmit and [[project_employee_identity_migration]] for why the mapping moved to the list).
  const { data: rolesData } = useRoles({ status: 'active', limit: 100 });
  const createMutation = useCreateEmployee();
  const updateMutation = useUpdateEmployee(id);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const allRoles = rolesData?.data ?? [];
  // Every row in Employee Master IS an employee, so plain Employee is the mandatory baseline
  // role sent on create (see onSubmit) — not user-selectable here.
  const employeeRoleId = allRoles.find((r) => r.role_name === ROLE_NAMES.EMPLOYEE)?.id;

  const form = useForm({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    defaultValues: {
      employee_code: '',
      full_name: '',
      email: '',
      designation: '',
      total_experience: '',
      company_experience: '',
      resource_description: '',
      payroll_entity: '',
      location: '',
      sub_location: '',
      date_of_joining: '',
      date_of_leaving: '',
      status: 'active',
      password: 'Gtt@1234',
      confirmPassword: 'Gtt@1234',
      primary_manager_employee_id: null,
      secondary_manager_employee_id: null,
      // No backend value exists yet for a brand-new employee, so this just seeds the toggle in
      // its recommended starting position — every other case (loading an existing employee)
      // always uses the value the API actually returned, never this default.
      is_timesheet_approval_required: true,
    },
  });

  const dateOfJoining = useWatch({ control: form.control, name: 'date_of_joining' });
  const formStatus = useWatch({ control: form.control, name: 'status' });
  const primaryManagerId = useWatch({ control: form.control, name: 'primary_manager_employee_id' });
  const timesheetApprovalRequired = useWatch({ control: form.control, name: 'is_timesheet_approval_required' });

  // Nobody can report to themselves, so the employee being edited is never a valid manager for
  // their own record — drop them from the list rather than relying on the user not picking it.
  const managerOptions = managers
    .filter((m) => !isEdit || String(m.id) !== String(id))
    .map((m) => ({
      label: m.full_name ?? m.email,
      value: String(m.id),
    }));
  const secondaryManagerOptions = [
    { label: 'None', value: 'none' },
    ...managerOptions.filter((o) => o.value !== String(primaryManagerId)),
  ];

  useEffect(() => {
    if (!dateOfJoining) {
      form.setValue('company_experience', '');
      return;
    }
    const start = new Date(dateOfJoining);
    if (isNaN(start.getTime())) return;
    const diffMs = Date.now() - start.getTime();
    const years = diffMs / (1000 * 60 * 60 * 24 * 365.25);
    form.setValue('company_experience', Math.max(0, parseFloat(years.toFixed(1))));
  }, [dateOfJoining, form]);

  useEffect(() => {
    if (employee && isEdit) {
      form.reset({
        employee_code: employee.employee_code ?? '',
        full_name: employee.full_name ?? '',
        email: employee.email ?? '',
        designation: employee.designation ?? '',
        total_experience: employee.total_experience ?? '',
        company_experience: employee.company_experience ?? '',
        resource_description: employee.resource_description ?? '',
        payroll_entity: employee.payroll_entity ?? '',
        location: employee.location ?? '',
        sub_location: employee.sub_location ?? '',
        date_of_joining: employee.date_of_joining?.split('T')[0] ?? '',
        date_of_leaving: employee.date_of_leaving?.split('T')[0] ?? '',
        status: employee.status ?? 'active',
        primary_manager_employee_id: employee.primary_manager_employee_id ?? null,
        secondary_manager_employee_id: employee.secondary_manager_employee_id ?? null,
        // Straight from the API response — never assumed. `?? true` only covers an employee
        // record that predates this field entirely (backend returns null/undefined for it),
        // not a real ON/OFF answer.
        is_timesheet_approval_required: employee.is_timesheet_approval_required ?? true,
      });
    }
  }, [employee, isEdit, form]);

  const onSubmit = async (values) => {
    const {
      password, confirmPassword, secondary_manager_employee_id, primary_manager_employee_id,
      email, ...rest
    } = values;

    const clean = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== '' && v != null)
    );

    clean.email = email;
    if (!isEdit) {
      clean.password = password;
      // Every new employee is sent to the backend with the plain "Employee" role by default —
      // Roles/Business Units are no longer picked on this form at all, and are mapped afterwards
      // from Employee List's "Map Roles & Business Units" table action.
      if (employeeRoleId != null) clean.role_ids = [employeeRoleId];
    }
    if (primary_manager_employee_id) {
      clean.primary_manager_employee_id = primary_manager_employee_id;
    }
    // Always sent explicitly (even null) so clearing the Secondary Manager on update actually
    // reaches the backend/mock — the blanket filter above would otherwise drop a `null`.
    clean.secondary_manager_employee_id = secondary_manager_employee_id ?? null;

    const mutation = isEdit ? updateMutation : createMutation;
    mutation.mutate(clean, {
      onSuccess: () => {
        success(isEdit ? 'Employee updated successfully.' : 'Employee created successfully.');
        handleClose();
      },
      onError: (err) => showError(extractApiError(err)),
    });
  };

  const handleClose = () => {
    navigate(ROUTES.EMPLOYEES);
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Sheet open={true} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-4xl p-0 flex flex-col bg-white overflow-hidden">
        <SheetHeader className="px-5 py-3 border-b">
          <SheetTitle className="text-base font-medium text-left">{isEdit ? 'Edit Employee' : 'Add New Employee'}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isEdit && isLoadingEmployee ? (
            <FormSkeleton />
          ) : (
            <Form {...form}>
              <form id="employee-form" onSubmit={form.handleSubmit(onSubmit)} className="p-5 flex flex-col gap-4">

                {/* Identity Group */}
                <div className="rounded-lg border border-gray-200 bg-slate-50/60 p-4 space-y-3">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wide border-b border-gray-200 pb-2">
                    <IdCard className="h-3.5 w-3.5 text-muted-foreground" /> Identity
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <FormField
                      control={form.control}
                      name="employee_code"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium"><span className="text-destructive mr-0.5">*</span> Employee ID</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. EMP-001"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                              disabled={isEdit}
                              className="h-8 text-sm border-gray-200"
                            />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="full_name"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium"><span className="text-destructive mr-0.5">*</span> Full Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. John Smith"
                              {...field}
                              onChange={(e) => field.onChange(e.target.value.replace(/[^A-Za-z\s]/g, ''))}
                              className="h-8 text-sm border-gray-200"
                            />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium"><span className="text-destructive mr-0.5">*</span> Email</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. john@example.com" type="email" {...field} className="h-8 text-sm border-gray-200" />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="designation"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium">Designation</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Senior Engineer" {...field} className="h-8 text-sm border-gray-200" />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                  </div>
                </div>

                {/* Organisational Details Group */}
                <div className="rounded-lg border border-gray-200 bg-slate-50/60 p-4 space-y-3">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wide border-b border-gray-200 pb-2">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> Organisational Details
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="payroll_entity"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium">Payroll Entity</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. GTT India Pvt Ltd" maxLength={64} {...field} className="h-8 text-sm border-gray-200" />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium">Location</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Pune" maxLength={256} {...field} className="h-8 text-sm border-gray-200" />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="sub_location"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium">Sub Location</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Hinjewadi" maxLength={256} {...field} className="h-8 text-sm border-gray-200" />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                  </div>
                </div>

                {/* Account Group — every Employee IS the login account now. Roles/Business Units
                    are no longer picked here; every new employee is created with the plain
                    "Employee" role by default and mapped afterwards from Employee List's "Map
                    Roles & Business Units" table action. */}
                {!isEdit && (
                  <div className="rounded-lg border border-gray-200 bg-slate-50/60 p-4 space-y-3">
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wide border-b border-gray-200 pb-2">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" /> Account
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[11px] text-muted-foreground font-medium"><span className="text-destructive mr-0.5">*</span> Password</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type={showPassword ? 'text' : 'password'}
                                  placeholder="Min 8 chars, upper, lower, digit, special"
                                  autoComplete="new-password"
                                  className="h-8 text-sm border-gray-200 pr-9"
                                  {...field}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowPassword((v) => !v)}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                  tabIndex={-1}
                                >
                                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                            </FormControl>
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem className="space-y-1">
                            <FormLabel className="text-[11px] text-muted-foreground font-medium"><span className="text-destructive mr-0.5">*</span> Confirm Password</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type={showConfirmPassword ? 'text' : 'password'}
                                  placeholder="Repeat password"
                                  autoComplete="new-password"
                                  className="h-8 text-sm border-gray-200 pr-9"
                                  {...field}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowConfirmPassword((v) => !v)}
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                  tabIndex={-1}
                                >
                                  {showConfirmPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                            </FormControl>
                            <FormMessage className="text-[10px]" />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                )}

                {/* Reporting Group */}
                <div className="rounded-lg border border-gray-200 bg-slate-50/60 p-4 space-y-3">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wide border-b border-gray-200 pb-2">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" /> Reporting
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="primary_manager_employee_id"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium">Primary Manager</FormLabel>
                          <SearchableSelect
                            options={managerOptions}
                            value={field.value != null ? String(field.value) : ''}
                            onValueChange={(v) => field.onChange(v ? Number(v) : null)}
                            disabled={isLoadingManagers}
                            placeholder="Select manager"
                            searchPlaceholder="Search managers…"
                            className="h-8 text-sm border-gray-200"
                          />
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="secondary_manager_employee_id"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium">Secondary Manager</FormLabel>
                          <SearchableSelect
                            options={secondaryManagerOptions}
                            value={field.value != null ? String(field.value) : 'none'}
                            onValueChange={(v) => field.onChange(v === 'none' ? null : Number(v))}
                            disabled={isLoadingManagers}
                            placeholder="Select manager"
                            searchPlaceholder="Search managers…"
                            className="h-8 text-sm border-gray-200"
                          />
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Experience Group */}
                <div className="rounded-lg border border-gray-200 bg-slate-50/60 p-4 space-y-3">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wide border-b border-gray-200 pb-2">
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground" /> Experience &amp; Employment
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <FormField
                      control={form.control}
                      name="date_of_joining"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium"><span className="text-destructive mr-0.5">*</span> Date of Joining</FormLabel>
                          <FormControl>
                            <DatePicker
                              value={field.value || ''}
                              onChange={field.onChange}
                              max={todayIsoDate()}
                              className="h-8 text-sm border-gray-200"
                            />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="date_of_leaving"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium">Date of Leaving</FormLabel>
                          <FormControl>
                            <DatePicker
                              value={field.value || ''}
                              onChange={field.onChange}
                              // Selectable range is joining + 1 day through today: leaving on or
                              // before the joining date isn't an employment span, and a future
                              // leaving date isn't a fact yet. Both bounds are re-checked in the
                              // schema so a value that predates a later edit of Date of Joining
                              // is still caught. Disabled until joining is set, since without it
                              // there is no valid range to pick from.
                              min={nextDayIsoDate(dateOfJoining)}
                              max={todayIsoDate()}
                              disabled={!dateOfJoining}
                              placeholder={dateOfJoining ? 'Not applicable' : 'Set joining date first'}
                              clearable
                              className="h-8 text-sm border-gray-200"
                            />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="total_experience"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium">Total Experience (yrs)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" min="0" max="60" placeholder="e.g. 7.5" {...field} className="h-8 text-sm border-gray-200" />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="company_experience"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium">Company Exp. (yrs)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              placeholder="Auto-calculated"
                              readOnly
                              tabIndex={-1}
                              className="h-8 text-sm bg-muted cursor-not-allowed border-gray-200"
                              {...field}
                              value={field.value ?? ''}
                            />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Additional Group */}
                <div className="rounded-lg border border-gray-200 bg-slate-50/60 p-4 space-y-3">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wide border-b border-gray-200 pb-2">
                    <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" /> Additional Details
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-4 items-start">
                    <FormField
                      control={form.control}
                      name="resource_description"
                      render={({ field }) => (
                        <FormItem className="space-y-1">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium">Resource Description</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Skills, certifications, and project experience…"
                              className="h-12 min-h-0 text-sm resize-none border-gray-200"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-[10px]" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="is_timesheet_approval_required"
                      render={({ field }) => (
                        <FormItem className="space-y-1 flex flex-col justify-center h-full pt-4 max-w-[220px]">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium mb-1">Timesheet Approval Required</FormLabel>
                          <FormControl>
                            <div className="flex items-center gap-2">
                              <Switch checked={field.value} onCheckedChange={field.onChange} />
                              <span className="text-[11px] font-medium">{timesheetApprovalRequired ? 'ON' : 'OFF'}</span>
                            </div>
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem className="space-y-1 flex flex-col justify-center h-full pt-4">
                          <FormLabel className="text-[11px] text-muted-foreground font-medium mb-1">Status</FormLabel>
                          <FormControl>
                            <button
                              type="button"
                              onClick={() => field.onChange(formStatus === 'active' ? 'inactive' : 'active')}
                              className={cn(
                                "flex items-center justify-between gap-1.5 rounded-full px-2 py-1 w-[72px] transition-all duration-300 focus:outline-none",
                                formStatus === 'active' ? "bg-blue-500 text-white flex-row" : "bg-slate-300 text-slate-700 flex-row-reverse"
                              )}
                            >
                              <span className="text-[11px] font-medium leading-none px-0.5">{formStatus === 'active' ? 'Active' : 'Inactive'}</span>
                              <div className="h-3 w-3 shrink-0 rounded-full bg-white shadow-sm" />
                            </button>
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

              </form>
            </Form>
          )}
        </div>

        <SheetFooter className="px-5 py-3 border-t mt-auto flex-row justify-end gap-3 items-center bg-white">
          <Button type="button" variant="outline" className="border-gray-200 h-8 text-sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" form="employee-form" className="bg-blue-600 hover:bg-blue-700 h-8 text-sm" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save & Close'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default EmployeeForm;
