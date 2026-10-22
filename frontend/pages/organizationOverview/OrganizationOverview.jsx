import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { useOrganizationOverview } from '@/hooks/useOrganizationOverview';
import { useDebounce } from '@/hooks/useDebounce';
import PageHeader from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/utils/cn';
import SummaryCards from './components/SummaryCards';
import ErrorState from './components/ErrorState';
import OverviewTab from './OverviewTab';
import BusinessUnitsTab from './BusinessUnitsTab';
import ProjectsServicePOsTab from './ProjectsServicePOsTab';
import UsersTab from './UsersTab';
import {
  normalizeBusinessUnit, normalizeProject, normalizeUser,
  buildOrganizationTree, computeSummaryCounts, matchesBusinessUnit, matchesUser, matchesServicePONode,
} from '@/utils/organizationOverview';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'business-units', label: 'Business Units' },
  { value: 'projects', label: 'Projects / Service POs' },
  { value: 'users', label: 'Users' },
];

// The single Organization Overview form (Platform Admin only) — one API call on mount backs all
// four tabs below; switching tabs only ever re-derives from the already-cached response (see
// useOrganizationOverview), it never refetches. Refresh re-runs that same one call.
const OrganizationOverview = () => {
  const { data, isPending, isFetching, isError, error, refetch } = useOrganizationOverview();

  const [activeTab, setActiveTab] = useState('overview');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

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
  const counts = useMemo(
    () => computeSummaryCounts(businessUnits, projects, users),
    [businessUnits, projects, users]
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
        title="Organization Overview"
        description="Complete organization structure and system overview"
        actions={
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            Refresh
          </Button>
        }
      >
        <div className="relative mt-3 w-full max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search Entity, BU, Project, Client, Service PO or User…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </PageHeader>

      <SummaryCards counts={counts} isLoading={isPending} />

      {isError ? (
        <ErrorState status={status} onRetry={() => refetch()} />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 min-h-0 flex-col">
          <TabsList className="shrink-0">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>

          <div className="mt-3 flex flex-1 min-h-0 flex-col">
            {activeTab === 'overview' && (
              <OverviewTab tree={tree} search={debouncedSearch} isLoading={isPending} />
            )}
            {activeTab === 'business-units' && (
              <BusinessUnitsTab businessUnits={businessUnits} search={debouncedSearch} isLoading={isPending} />
            )}
            {activeTab === 'projects' && (
              <ProjectsServicePOsTab servicePOs={servicePOs} search={debouncedSearch} isLoading={isPending} />
            )}
            {activeTab === 'users' && (
              <UsersTab users={users} search={debouncedSearch} isLoading={isPending} />
            )}
          </div>
        </Tabs>
      )}
    </div>
  );
};

export default OrganizationOverview;
