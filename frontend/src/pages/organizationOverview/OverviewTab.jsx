import { useMemo } from 'react';
import OrgHierarchyTree from './components/OrgHierarchyTree';
import TreeSkeleton from './components/TreeSkeleton';
import { filterOrganizationTree } from '@/utils/organizationOverview';

// Tab 1 — the whole tree already lives in memory (built once in OrganizationOverview.jsx from
// the single API response); this just prunes it down to whatever the shared search term matches.
const OverviewTab = ({ tree, search, isLoading }) => {
  const filtered = useMemo(() => filterOrganizationTree(tree, search), [tree, search]);

  if (isLoading) return <TreeSkeleton />;
  return <OrgHierarchyTree tree={filtered} expandAll={!!search} />;
};

export default OverviewTab;
