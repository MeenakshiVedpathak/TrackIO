import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Folder, ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useForms } from '@/hooks/useForms';
import { useFormCategories } from '@/hooks/useFormCategories';
import { resolveFormRoute, FORM_NAMES } from '@/constants/rbacForms';
import PageHeader from '@/components/common/PageHeader';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/cn';

// The set of form names that belong to the employee self-service reports section.
// Used to filter the full GET /forms list down to just the reports this hub should show,
// regardless of which module_name the Form Master admin assigns them to. Add new employee
// report form names here as they are seeded in the Form Master.
const EMPLOYEE_REPORT_FORM_NAMES = new Set([
  FORM_NAMES.EMPLOYEE_REPORTS,
  FORM_NAMES.EMPLOYEE_PROJECT_HOURS_REPORT,
  FORM_NAMES.EMPLOYEE_TIMESHEET_APPROVAL_STATUS_REPORT,
  FORM_NAMES.EMPLOYEE_WORK_LOG_TIME_REPORT,
]);

// Landing page for employee-side reports — a category-browser hub (folder list on the left,
// that category's reports on the right) identical in layout to the admin ReportsCenter.
// Driven by the same RBAC accessible-forms data + GET /forms category/seq metadata, so an
// employee only ever sees reports their role is actually mapped to, in the order an admin
// arranged them via the Form Master seq.
const EmployeeReportsCenter = () => {
  const navigate = useNavigate();
  const { accessibleForms } = useAuth();
  const { data: formsList } = useForms({ status: 'active' });
  const { data: categories = [] } = useFormCategories({});
  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState(null); // null = "All Reports"

  // The granted form IDs, not their names. Matching on name looks equivalent but isn't: a
  // form_name is not unique across the Form Master, so two rows in different modules can share
  // one (a real case: "Timesheet Approval Status Report" exists as id 61 under Reports AND id 96
  // under Employee Self-Service). Name matching then rendered BOTH rows for the one report — the
  // categorised one under its category, the other under a null category — so a hub with 3 granted
  // reports listed 4. Ids are unique, so one granted report can only ever produce one row.
  //
  // `status !== false` honours the flag POST /roles/forms returns per row; the old name-based set
  // never looked at it, so a disabled mapping still contributed its name and kept the row visible.
  // EMPLOYEE_REPORT_FORM_NAMES still decides WHICH granted forms count as employee reports (the
  // module name is deliberately not used for that — see the note on the constant).
  const accessibleEmployeeReportIds = useMemo(() => {
    const allForms = Object.values(accessibleForms ?? {}).flat();
    return new Set(
      allForms
        .filter((f) => f?.status !== false && EMPLOYEE_REPORT_FORM_NAMES.has(f?.name))
        .map((f) => f.id)
    );
  }, [accessibleForms]);

  const categoryLookup = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  // Filter GET /forms down to just employee report rows the current user can access,
  // resolve each to its frontend route, and sort by the Form Master seq.
  const reportRows = useMemo(() =>
    (formsList?.data ?? [])
      .filter((f) => accessibleEmployeeReportIds.has(f.id))
      .map((f) => {
        const cfg = resolveFormRoute(f.form_name);
        if (!cfg) return null;
        return {
          id: f.id,
          name: f.form_name,
          to: cfg.to,
          icon: cfg.icon,
          categoryId: f.category_id ?? null,
          seq: f.seq ?? 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.seq - b.seq),
    [formsList, accessibleEmployeeReportIds]
  );

  // Group report rows by category, enriching each bucket with the category's name and seq.
  // Only real Form Master categories get a folder. A report with a null category_id is skipped
  // here rather than collected into an invented "Other Reports" bucket — it stays reachable under
  // "All Reports", which is the unfiltered list, not a category. The folder list therefore mirrors
  // GET /forms/categories exactly, with nothing in it the API didn't return.
  const categoryFolders = useMemo(() => {
    const byCategory = new Map();
    reportRows.forEach((r) => {
      if (r.categoryId == null) return;
      if (!byCategory.has(r.categoryId)) byCategory.set(r.categoryId, []);
      byCategory.get(r.categoryId).push(r);
    });
    return Array.from(byCategory.entries())
      .map(([key, items]) => ({
        id: key,
        name: categoryLookup.get(key)?.name ?? `Category #${key}`,
        seq: categoryLookup.get(key)?.seq ?? 0,
        items,
      }))
      .sort((a, b) => a.seq - b.seq);
  }, [reportRows, categoryLookup]);

  const visibleRows = useMemo(() => {
    const base =
      selectedCategoryId == null
        ? reportRows
        : categoryFolders.find((c) => c.id === selectedCategoryId)?.items ?? [];
    const q = search.trim().toLowerCase();
    return q ? base.filter((r) => r.name.toLowerCase().includes(q)) : base;
  }, [selectedCategoryId, categoryFolders, reportRows, search]);

  const activeLabel =
    selectedCategoryId == null
      ? 'All Reports'
      : categoryFolders.find((c) => c.id === selectedCategoryId)?.name ?? 'Reports';

  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)]">
      <PageHeader title="Reports Center" description="Browse reports by category" />

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Left panel — category folder list */}
        <div className="w-64 shrink-0 flex flex-col rounded-lg border bg-white overflow-hidden">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search reports"
                className="pl-9 h-9 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {/* "All Reports" bucket — always shown at the top */}
            <button
              type="button"
              onClick={() => setSelectedCategoryId(null)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                selectedCategoryId == null
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-foreground hover:bg-muted'
              )}
            >
              <Folder className="h-4 w-4 shrink-0" />
              <span className="truncate">All Reports</span>
              <span className="ml-auto text-xs text-muted-foreground">{reportRows.length}</span>
            </button>

            {categoryFolders.length > 0 && (
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Report Category
              </p>
            )}

            {categoryFolders.map((cat) => (
              <button
                type="button"
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                  selectedCategoryId === cat.id
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground hover:bg-muted'
                )}
              >
                <Folder className="h-4 w-4 shrink-0" />
                <span className="truncate">{cat.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{cat.items.length}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right panel — report list for the selected category */}
        <div className="flex-1 flex flex-col rounded-lg border bg-white overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b">
            <h2 className="text-lg font-semibold">{activeLabel}</h2>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-medium text-primary">
              {visibleRows.length}
            </span>
          </div>

          <div className="px-5 py-2 border-b bg-muted/30 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Report Name
          </div>

          <div className="flex-1 overflow-y-auto">
            {visibleRows.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">No reports found.</div>
            ) : (
              visibleRows.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => navigate(r.to)}
                  className="flex w-full items-center gap-3 border-b px-5 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40"
                >
                  <r.icon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm font-medium text-primary">{r.name}</span>
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployeeReportsCenter;
