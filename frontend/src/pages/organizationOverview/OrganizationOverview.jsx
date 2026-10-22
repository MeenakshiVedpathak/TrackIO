import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, FileBarChart, FolderKanban, Info, LayoutDashboard, RefreshCw, Search, UserPlus, Users } from 'lucide-react';
import { useOrganizationOverview } from '@/hooks/useOrganizationOverview';
import { useTotalAdmins } from '@/hooks/usePlatformAdminReports';
import { useDebounce } from '@/hooks/useDebounce';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/utils/cn';
import SummaryCards from './components/SummaryCards';
import ErrorState from './components/ErrorState';
import OverviewTab from './OverviewTab';
import BusinessUnitsTab from './BusinessUnitsTab';
import ProjectsServicePOsTab from './ProjectsServicePOsTab';
import UsersTab from './UsersTab';
import TotalAdminsTab from './TotalAdminsTab';
import EmployeeWorkLogSyncedTab from './EmployeeWorkLogSyncedTab';
import {
  normalizeBusinessUnit, normalizeProject, normalizeUser,
  buildOrganizationTree, computeSummaryCounts, matchesBusinessUnit, matchesUser, matchesServicePONode,
} from '@/utils/organizationOverview';

const TABS = [
  { value: 'overview', label: 'Overview', icon: LayoutDashboard },
  { value: 'business-units', label: 'Business Units', icon: Building2 },
  { value: 'projects', label: 'Projects / Service POs', icon: FolderKanban },
  { value: 'users', label: 'Users', icon: Users },
  // Unlike the four tabs above (all derived from the one shared API call below), these two own
  // their own independent server fetch — GET /platform-admin/total-admins and
  // .../employee-work-log-synced respectively (see TotalAdminsTab.jsx / EmployeeWorkLogSyncedTab.jsx).
  { value: 'total-admins', label: 'Total Admins', icon: UserPlus },
  { value: 'employee-work-log', label: 'Employee Work Log', icon: FileBarChart },
];

// The single Organization Overview form (Platform Admin only) — one API call on mount backs the
// first four tabs below; switching between THOSE only ever re-derives from the already-cached
// response (see useOrganizationOverview), it never refetches. Refresh re-runs that same one call.
// Total Admins and Employee Work Log are the exception: each owns its own real, independent
// server-paginated fetch (see TotalAdminsTab.jsx / EmployeeWorkLogSyncedTab.jsx) — Admins were
// never part of this endpoint's response, so there was no shared data to derive them from.
const OrganizationOverview = () => {
  const { data, isPending, isFetching, isError, error, refetch } = useOrganizationOverview();

  const [activeTab, setActiveTab] = useState('overview');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  // Each tab keeps owning its own Filters (and, for Projects/Service POs, Export) button state —
  // this DOM node just gives the currently-active tab somewhere to portal those buttons INTO, so
  // they render on the same row as the tab switcher (above its divider) instead of taking up a
  // separate row of vertical space inside each tab's own content.
  const [toolbarSlot, setToolbarSlot] = useState(null);

  const businessUnits = useMemo(() => (data?.business_units ?? []).map(normalizeBusinessUnit), [data]);
  // Each project already carries its own nested, tree-built Service PO hierarchy (see
  // normalizeProject) — `servicePOs` below just flattens that for Tab 3's one-row-per-PO table.
  const projects = useMemo(() => (data?.projects_service_pos ?? []).map(normalizeProject), [data]);
  const servicePOs = useMemo(() => projects.flatMap((p) => p.servicePOs), [projects]);
  const users = useMemo(() => (data?.users ?? []).map(normalizeUser), [data]);

  const tree = useMemo(
    () => buildOrganizationTree(businessUnits, projects, users),
    [businessUnits, projects, users]
  );

  // Total Admins summary tile — a separate, minimal fetch (limit:1, only `meta.total` is read)
  // since Admins were never part of the shared org-overview payload above. Independent cache
  // entry from the Total Admins tab's own (fully paginated) query, so switching to that tab
  // never refetches this, and vice versa.
  const { data: adminsSummary, isPending: isAdminsCountPending } = useTotalAdmins({ page: 1, limit: 1 });

  const counts = useMemo(
    () => ({ ...computeSummaryCounts(businessUnits, projects, users), totalAdmins: adminsSummary?.meta?.total ?? 0 }),
    [businessUnits, projects, users, adminsSummary]
  );

  // Global search: switches to whichever tab actually has a match, most-specific first (a
  // person's name is a much more targeted query than a BU name) — only re-evaluated when the
  // debounced term itself changes, so it never fights a manual tab click after that.
  const lastSwitchedTerm = useRef('');
  useEffect(() => {
    if (!debouncedSearch) {
      lastSwitchedTerm.current = '';
      return;
    }
    if (debouncedSearch === lastSwitchedTerm.current) return;
    lastSwitchedTerm.current = debouncedSearch;

    const term = debouncedSearch.toLowerCase();
    if (users.some((u) => matchesUser(u, term))) {
      setActiveTab('users');
    } else if (servicePOs.some((spo) => matchesServicePONode(spo, term))) {
      setActiveTab('projects');
    } else if (businessUnits.some((bu) => matchesBusinessUnit(bu, term))) {
      setActiveTab('business-units');
    }
    // No match in any tab-specific list: leave the current tab as-is (likely an Entity-only
    // match, which only the Overview hierarchy shows).
  }, [debouncedSearch, users, servicePOs, businessUnits]);

  const status = error?.response?.status;

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            Organization Overview
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="About this page"
                >
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                Complete organization structure and system overview
              </TooltipContent>
            </Tooltip>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[clamp(0.875rem,1vw,1rem)] w-[clamp(0.875rem,1vw,1rem)] text-muted-foreground" />
              <Input
                placeholder="Search Entity, BU, Project, Client, Service PO or User…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button size="sm" variant="outline" className="shrink-0" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        }
      />

      <SummaryCards counts={counts} isLoading={isPending || isAdminsCountPending} />

      {isError ? (
        <ErrorState status={status} onRetry={() => refetch()} />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 min-h-0 flex-col">
          {/* Modern underline-style switcher (GitHub/Linear-style tab bar) — a deliberate,
              page-local override of the shared Tabs pill styling via className, not a change to
              the shared component itself (which every other screen still uses unchanged). The
              active tab's own Filters/Export buttons portal into the slot on the right of this
              same row when there's room for both — one shared `flex-wrap` container (not two
              always-separate blocks) lets the toolbar share the tab switcher's line whenever it
              fits, and only drops to its own line below (via wrap, `ml-auto` keeping it
              right-aligned there too) once a tab has enough filters that it genuinely doesn't —
              the original cramped/cut-off case this was written to avoid. */}
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b">
            <TabsList className="h-auto w-auto justify-start gap-1 rounded-none bg-transparent p-0">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="gap-1.5 rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-none"
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
            <div ref={setToolbarSlot} className="ml-auto flex shrink-0 flex-wrap items-center gap-2 py-2 empty:hidden" />
          </div>

          <div className="mt-3 flex flex-1 min-h-0 flex-col">
            {activeTab === 'overview' && (
              <OverviewTab tree={tree} search={debouncedSearch} isLoading={isPending} />
            )}
            {activeTab === 'business-units' && (
              <BusinessUnitsTab businessUnits={businessUnits} search={debouncedSearch} isLoading={isPending} toolbarSlot={toolbarSlot} />
            )}
            {activeTab === 'projects' && (
              <ProjectsServicePOsTab servicePOs={servicePOs} search={debouncedSearch} isLoading={isPending} toolbarSlot={toolbarSlot} />
            )}
            {activeTab === 'users' && (
              <UsersTab users={users} search={debouncedSearch} isLoading={isPending} toolbarSlot={toolbarSlot} />
            )}
            {/* No `search` prop — these two run their own independent server fetch with their
                own search/filter state, not a derivation of `data` above, so the page's global
                search box (which only ever matches users/servicePOs/businessUnits) doesn't reach
                into them. `toolbarSlot` still applies: each portals its own search/filter/export
                controls into the same right-aligned slot its sibling tabs use. */}
            {activeTab === 'total-admins' && <TotalAdminsTab toolbarSlot={toolbarSlot} />}
            {activeTab === 'employee-work-log' && <EmployeeWorkLogSyncedTab toolbarSlot={toolbarSlot} />}
          </div>
        </Tabs>
      )}
    </div>
  );
};

export default OrganizationOverview;
