import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save } from 'lucide-react';
import { useMonthlyCost, useCreateMonthlyCost, useUpdateMonthlyCost } from '@/hooks/useMonthlyCosts';
import { useActiveEmployees } from '@/hooks/useEmployees';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { ROUTES, buildPath } from '@/constants/routes';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";

const MONTH_OPTIONS = [
  { value: '1',  label: 'January' },
  { value: '2',  label: 'February' },
  { value: '3',  label: 'March' },
  { value: '4',  label: 'April' },
  { value: '5',  label: 'May' },
  { value: '6',  label: 'June' },
  { value: '7',  label: 'July' },
  { value: '8',  label: 'August' },
  { value: '9',  label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

const monthlyCostSchema = z.object({
  employee_id: z.string().min(1, 'Employee is required'),
  month: z.string().min(1, 'Month is required'),
  year: z.preprocess(
    (v) => (v === '' || v == null ? null : Number(v)),
    z.number().min(2000, 'Year must be 2000 or later').max(2100, 'Year cannot exceed 2100')
  ),
  salary_cost: z.preprocess(
    (v) => (v === '' || v == null ? null : Number(v)),
    z.number().min(0, 'Must be 0 or more')
  ),
  ops_cost: z.preprocess(
    (v) => (v === '' || v == null ? null : Number(v)),
    z.number().min(0, 'Must be 0 or more').nullable().optional()
  ),
  billable_cost: z.preprocess(
    (v) => (v === '' || v == null ? null : Number(v)),
    z.number().min(0, 'Must be 0 or more').nullable().optional()
  ),
});

const FormSkeleton = () => (
  <div className="space-y-4 p-4">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="space-y-2 h-14 bg-muted animate-pulse rounded-md" />
    ))}
  </div>
);

// Rendered only after record + employees are both ready — useForm initialises from correct data immediately
const MonthlyCostFormContent = ({ id, isEdit, record, activeEmployees, month, year }) => {
  const navigate = useNavigate();
  const { success, error: showError } = useNotification();
  const createMutation = useCreateMonthlyCost();
  const updateMutation = useUpdateMonthlyCost(id);
  const backToDetail = () => navigate(buildPath(ROUTES.MONTHLY_COST_DETAIL, { month, year }));

  const form = useForm({
    resolver: zodResolver(monthlyCostSchema),
    defaultValues: {
      employee_id: record?.employee_id ? String(record.employee_id) : '',
      month:       record?.month       ? String(record.month)       : month,
      year:        record?.year        ?? Number(year),
      salary_cost: record?.salary_cost ?? '',
      ops_cost:    record?.ops_cost    ?? '',
      billable_cost: record?.billable_cost ?? '',
    },
  });

  const onSubmit = (values) => {
    const payload = {
      employee_id: Number(values.employee_id),
      month:       Number(values.month),
      year:        Number(values.year),
      salary_cost: Number(values.salary_cost),
      ...(values.ops_cost != null && values.ops_cost !== ''
        ? { ops_cost: Number(values.ops_cost) }
        : {}),
      ...(values.billable_cost != null && values.billable_cost !== ''
        ? { billable_cost: Number(values.billable_cost) }
        : {}),
    };

    const mutation = isEdit ? updateMutation : createMutation;
    mutation.mutate(payload, {
      onSuccess: () => {
        success(isEdit ? 'Monthly cost record updated.' : 'Monthly cost record created.');
        backToDetail();
      },
      onError: (err) => showError(extractApiError(err)),
    });
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const handleClose = () => backToDetail();

  return (
    <Sheet open={true} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent 
        side="right" 
        className="w-full sm:max-w-3xl p-0 flex flex-col bg-white overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SheetHeader className="px-5 py-3 border-b">
          <SheetTitle className="text-base font-medium text-left">
            {isEdit ? 'Edit Monthly Cost' : 'Add Monthly Cost'}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <Form {...form}>
            <form id="monthly-cost-form" onSubmit={form.handleSubmit(onSubmit)} className="p-5 flex flex-col gap-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">

              {/* Employee */}
              <FormField
                control={form.control}
                name="employee_id"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2 lg:col-span-3">
                    <FormLabel>Employee <span className="text-destructive">*</span></FormLabel>
                    <SearchableSelect
                      options={activeEmployees.map(e => ({
                        value: String(e.id),
                        label: `${e.full_name}${e.employee_code ? ` (${e.employee_code})` : ''}`
                      }))}
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isEdit}
                      placeholder="Select an employee"
                      searchPlaceholder="Search employee..."
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Month */}
              <FormField
                control={form.control}
                name="month"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Month <span className="text-destructive">*</span></FormLabel>
                    <SearchableSelect showSearch={false}
                      options={MONTH_OPTIONS}
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Select month"
                      searchPlaceholder="Search month..."
                      className="w-full"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Year */}
              <FormField
                control={form.control}
                name="year"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Year <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input type="number" min="2000" max="2100" placeholder="e.g. 2026" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Salary Cost */}
              <FormField
                control={form.control}
                name="salary_cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salary Cost <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" placeholder="e.g. 50000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Ops Cost */}
              <FormField
                control={form.control}
                name="ops_cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ops Cost</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" placeholder="e.g. 5000" {...field} />
                    </FormControl>
                    <FormDescription>Leave blank to use the system default</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Billable Cost */}
              <FormField
                control={form.control}
                name="billable_cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Billable Cost</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" step="0.01" placeholder="e.g. 45000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              </div>
            </form>
          </Form>
        </div>

        <SheetFooter className="px-5 py-3 border-t flex items-center justify-end gap-3 sm:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isSubmitting} form="monthly-cost-form">
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Record'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

// Outer shell — waits for all data before mounting the form
const MonthlyCostForm = () => {
  const { id, month, year } = useParams();
  const isEdit = !!id;
  const { data: record, isPending: isLoadingRecord } = useMonthlyCost(id);
  const { data: activeEmployees = [], isSuccess: employeesReady } = useActiveEmployees();

  if (isEdit && (isLoadingRecord || !employeesReady)) return <FormSkeleton />;

  return (
    <MonthlyCostFormContent
      id={id}
      isEdit={isEdit}
      record={record}
      activeEmployees={activeEmployees}
      month={month}
      year={year}
    />
  );
};

export default MonthlyCostForm;
