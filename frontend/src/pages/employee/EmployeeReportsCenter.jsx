import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Folder, ChevronRight, ChevronDown } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useForms } from '@/hooks/useForms';
import { useFormCategories } from '@/hooks/useFormCategories';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { resolveFormRoute, FORM_NAMES } from '@/constants/rbacForms';
import PageHeader from '@/components/common/PageHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
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
  const isMobile = useIsMobile();
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  // Draft selection inside the mobile category sheet — only committed to `selectedCategoryId` on
  // "Apply", same select-then-Apply flow as the admin ReportsCenter this hub mirrors.
  const [draftCategoryId, setDraftCategoryId] = useState(selectedCategoryId);

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
          description: cfg.description ?? null,
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

  const openCategorySheet = () => {
    setDraftCategoryId(selectedCategoryId);
    setCategorySheetOpen(true);
  };

  return (
    // Fills the bounded box the shell hands down (EmployeeLayout <main> -> EmployeeReportsLayout)
    // rather than re-deriving it from the viewport — see the same change in the admin peer,
    // pages/reports/ReportsCenter.jsx.
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Reports Center" description="Browse reports by category" />

      {/* Mobile: flat searchable report list + a category bottom sheet, instead of the desktop
          two-pane folder browser — mirrors the admin ReportsCenter's mobile treatment exactly.
          Same reportRows/categoryFolders/visibleRows data and search/setSelectedCategoryId
          handlers as the desktop pane below, just different markup. */}
      <div className="flex flex-1 min-h-0 flex-col gap-3 md:hidden">
        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[clamp(0.875rem,1vw,1rem)] w-[clamp(0.875rem,1vw,1rem)] text-muted-foreground" />
          <Input
            placeholder="Search reports..."
            className="h-[clamp(2.25rem,3vw,2.75rem)] pl-9 text-[clamp(0.8125rem,1vw,0.9375rem)]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button
          type="button"
          onClick={openCategorySheet}
          className="flex h-11 shrink-0 items-center justify-between rounded-lg border bg-white px-3.5 text-sm font-medium"
        >
          <span className="truncate">
            {activeLabel} ({selectedCategoryId == null ? reportRows.length : categoryFolders.find((c) => c.id === selectedCategoryId)?.items.length ?? 0})
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>

        <p className="shrink-0 text-sm font-semibold text-foreground">
          {visibleRows.length} Report{visibleRows.length !== 1 ? 's' : ''}
        </p>

        <div className="flex-1 space-y-2 overflow-y-auto pb-2">
          {visibleRows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center text-sm text-muted-foreground">
              <Search className="h-6 w-6 text-muted-foreground/50" />
              <p className="font-medium text-foreground">No reports found</p>
              <p className="text-xs">Try a different keyword or category.</p>
            </div>
          ) : (
            visibleRows.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => navigate(r.to)}
                className="flex w-full items-start gap-3 rounded-lg border bg-white p-3.5 text-left active:bg-muted/40"
              >
                <r.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{r.name}</p>
                  {r.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.description}</p>
                  )}
                </div>
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))
          )}
        </div>
      </div>

      {isMobile && (
        <Sheet open={categorySheetOpen} onOpenChange={setCategorySheetOpen}>
          <SheetContent side="bottom" className="flex max-h-[80vh] flex-col gap-0 rounded-t-2xl p-0">
            <SheetHeader className="shrink-0 border-b px-4 py-3 text-left">
              <SheetTitle>Select Category</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-2">
              <button
                type="button"
                onClick={() => setDraftCategoryId(null)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-muted/50"
              >
                <span className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                  draftCategoryId == null ? 'border-primary' : 'border-muted-foreground/40'
                )}>
                  {draftCategoryId == null && <span className="h-2 w-2 rounded-full bg-primary" />}
                </span>
                <span className="flex-1 font-medium">All Reports</span>
                <span className="text-xs text-muted-foreground">{reportRows.length}</span>
              </button>
              {categoryFolders.map((cat) => (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => setDraftCategoryId(cat.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-muted/50"
                >
                  <span className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                    draftCategoryId === cat.id ? 'border-primary' : 'border-muted-foreground/40'
                  )}>
                    {draftCategoryId === cat.id && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </span>
                  <span className="flex-1 truncate font-medium">{cat.name}</span>
                  <span className="text-xs text-muted-foreground">{cat.items.length}</span>
                </button>
              ))}
            </div>
            <SheetFooter className="shrink-0 border-t p-3">
              <Button
                type="button"
                className="h-11 w-full"
                onClick={() => {
                  setSelectedCategoryId(draftCategoryId);
                  setCategorySheetOpen(false);
                }}
              >
                Apply
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      )}

      {/* Desktop / tablet: unchanged two-pane folder browser */}
      <div className="hidden flex-1 gap-4 overflow-hidden md:flex">
        {/* Left panel — category folder list */}
        <div className="w-64 shrink-0 flex flex-col rounded-lg border bg-white overflow-hidden">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-[clamp(0.875rem,1vw,1rem)] w-[clamp(0.875rem,1vw,1rem)] text-muted-foreground" />
              <Input
                placeholder="Search reports"
                className="pl-9 h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)]"
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
