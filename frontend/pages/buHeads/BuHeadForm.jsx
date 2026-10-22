import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, UserPlus, Copy, Check } from 'lucide-react';
import { useCreateBuHead } from '@/hooks/useBuHeads';
import { useCompanies } from '@/hooks/useCompanies';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { employeeBaseFields, employeePasswordField, todayIsoDate, refineEmploymentDates } from '@/constants/employeeFormSchema';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MultiSelect } from '@/components/ui/multi-select';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';

// Reuses the exact same Employee field/validation schema Employee Master and Company creation's
// bundled Employee both already share (constants/employeeFormSchema.js) — no role picker (§4:
// BU Head + Employee are backend-auto-assigned, never a free selector) and no Reporting/Manager
// section (a senior tier like BU Head doesn't report to anyone in this model, same as BU Admin's
// bundled Employee creation in CompanyForm.jsx).
//
// Password is optional (real contract, confirmed 2026-08-20) — omit it and the backend
// generates one, returned once as `temporaryPassword` (never retrievable again, so it must be
// shown to the admin before the sheet closes). `company_ids` is required (min 1) — the backend
// creates the initial BU mapping in this same call, so the BU picker lives here rather than
// only in the separate Map BU action.
// refineEmploymentDates carries the cross-field Date of Leaving rule. This form has no leaving
// date input today (the field is always ''), so it's a no-op here -- applied anyway so the two
// employee-creating schemas can't drift apart, which is the whole point of the shared module.
const buHeadSchema = refineEmploymentDates(
  z
    .object({
      ...employeeBaseFields,
      company_ids: z.array(z.coerce.number()).min(1, 'Select at least one business unit'),
      password: z.union([z.literal(''), employeePasswordField]),
      confirmPassword: z.string(),
    })
    .refine((d) => !d.password || d.password === d.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    })
);

const BuHeadForm = ({ open, onOpenChange }) => {
  const { success, error: showError } = useNotification();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState(null);
  const [copied, setCopied] = useState(false);

  const createMutation = useCreateBuHead();
  const { data: companiesData, isLoading: isLoadingCompanies } = useCompanies({ limit: 200 });
  const companyOptions = (companiesData?.data ?? []).map((c) => ({ label: c.company_name, value: String(c.id) }));

  const form = useForm({
    resolver: zodResolver(buHeadSchema),
    defaultValues: {
      employee_code: '',
      full_name: '',
      email: '',
      designation: '',
      total_experience: null,
      company_experience: null,
      resource_description: '',
      date_of_joining: '',
      date_of_leaving: '',
      status: 'active',
      is_timesheet_approval_required: false,
      company_ids: [],
      password: '',
      confirmPassword: '',
    },
  });

  const dateOfJoining = useWatch({ control: form.control, name: 'date_of_joining' });

  // Mirrors Employee Master's auto-calc (EmployeeForm.jsx) — Company Experience is derived from
  // Date of Joining, not manually entered, so it stays in sync here too.
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

  const handleClose = () => {
    form.reset();
    setTemporaryPassword(null);
    setCopied(false);
    onOpenChange(false);
  };

  const onSubmit = (values) => {
    const { confirmPassword, password, company_ids: companyIds, date_of_leaving: dateOfLeaving, ...rest } = values;
    const payload = {
      ...rest,
      company_ids: companyIds.map(Number),
      ...(password ? { password } : {}),
      // Omit entirely rather than sending "" — the backend's date field rejects an empty
      // string (confirmed against the real API), so a never-set "date of leaving" simply isn't
      // part of the payload at all.
      ...(dateOfLeaving ? { date_of_leaving: dateOfLeaving } : {}),
    };
    createMutation.mutate(payload, {
      onSuccess: (res) => {
        success('BU Head created successfully.');
        const generated = res?.data?.temporaryPassword;
        if (generated) {
          // Shown once — the backend never returns it again — so the sheet stays open behind
          // this reveal dialog until the admin explicitly acknowledges it.
          setTemporaryPassword(generated);
        } else {
          handleClose();
        }
      },
      onError: (err) => showError(extractApiError(err)),
    });
  };

  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
    } catch {
      // Clipboard API unavailable — the password is still visible to select/copy manually.
    }
  };

  return (
    <>
    <Sheet open={open} onOpenChange={(next) => !next && handleClose()}>
      <SheetContent side="right" className="w-full sm:max-w-3xl p-0 flex flex-col bg-white overflow-hidden">
        <SheetHeader className="px-5 py-3 border-b">
          <SheetTitle className="text-base font-medium text-left">Add New BU Head</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <Form {...form}>
            <form id="bu-head-form" onSubmit={form.handleSubmit(onSubmit)} className="p-5 flex flex-col gap-4">

              {/* Identity Group */}
              <div className="rounded-lg border border-gray-200 bg-slate-50/60 p-4 space-y-3">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide border-b border-gray-200 pb-2">Identity</h3>
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
                          <Input placeholder="e.g. Business Unit Head" {...field} className="h-8 text-sm border-gray-200" />
                        </FormControl>
                        <FormMessage className="text-[10px]" />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Business Units Group — required at creation time (backend maps these in the
                  same transactional call, §16); further map/unmap happens via the list's Map
                  action afterward. */}
              <div className="rounded-lg border border-gray-200 bg-slate-50/60 p-4 space-y-3">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide border-b border-gray-200 pb-2">Business Units</h3>
                <FormField
                  control={form.control}
                  name="company_ids"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <FormLabel className="text-[11px] text-muted-foreground font-medium"><span className="text-destructive mr-0.5">*</span> Map BUs</FormLabel>
                      <MultiSelect
                        options={companyOptions}
                        value={(field.value ?? []).map(String)}
                        onValueChange={(vals) => field.onChange(vals.map(Number))}
                        disabled={isLoadingCompanies}
                        placeholder={isLoadingCompanies ? 'Loading…' : 'Select BUs…'}
                        searchPlaceholder="Search BU…"
                        className="h-8 text-sm border-gray-200"
                      />
                      <FormMessage className="text-[10px]" />
                    </FormItem>
                  )}
                />
              </div>

              {/* Account & Role Group — role is backend-auto-assigned (§4), never a selector */}
              <div className="rounded-lg border border-gray-200 bg-slate-50/60 p-4 space-y-3">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide border-b border-gray-200 pb-2">Account &amp; Role</h3>
                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground font-medium">Roles automatically assigned</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="info">BU Head</Badge>
                    <Badge variant="muted">Employee</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[11px] text-muted-foreground font-medium">Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? 'text' : 'password'}
                              placeholder="Leave blank to auto-generate"
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
                        <FormLabel className="text-[11px] text-muted-foreground font-medium">Confirm Password</FormLabel>
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

              {/* Experience & Employment Group */}
              <div className="rounded-lg border border-gray-200 bg-slate-50/60 p-4 space-y-3">
                <h3 className="text-xs font-semibold text-foreground uppercase tracking-wide border-b border-gray-200 pb-2">Experience &amp; Employment</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                    name="total_experience"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-[11px] text-muted-foreground font-medium">Total Experience (yrs)</FormLabel>
                        <FormControl>
                          <Input
                            type="number" step="0.1" min="0" max="60" placeholder="e.g. 7.5"
                            {...field}
                            value={field.value ?? ''}
                            className="h-8 text-sm border-gray-200"
                          />
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
                        <FormLabel className="text-[11px] text-muted-foreground font-medium">Company Experience (yrs)</FormLabel>
                        <FormControl>
                          <Input
                            type="number" step="0.1"
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
            </form>
          </Form>
        </div>

        <SheetFooter className="px-5 py-4 border-t bg-gray-50/80 mt-auto flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleClose} className="h-8 text-xs">
            Close
          </Button>
          <Button type="submit" form="bu-head-form" disabled={createMutation.isPending} size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white">
            <UserPlus className="mr-2 h-3.5 w-3.5" />
            {createMutation.isPending ? 'Creating...' : 'Create BU Head'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>

    {/* Auto-generated password reveal — shown once, per the backend contract; closing this is
        what actually finishes the create flow (resets the form, closes the sheet behind it). */}
    <Dialog open={!!temporaryPassword} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Temporary Password</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          No password was set, so one was generated automatically. Copy it now — it cannot be retrieved again.
        </p>
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <code className="flex-1 text-sm font-mono select-all">{temporaryPassword}</code>
          <Button type="button" size="sm" variant="outline" onClick={handleCopyPassword} className="h-7 text-xs">
            {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" size="sm" onClick={handleClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default BuHeadForm;
