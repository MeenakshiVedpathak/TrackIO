import { useMemo } from 'react';
import { Lock } from 'lucide-react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useEmployeeMappedProjects } from '@/hooks/useEmployeeProjects';
import { getAncestors, servicePOSearchValue, sortServicePOsHierarchically } from '@/utils/servicePOHierarchy';
import { APPROVED_LOCK_TOOLTIP } from '@/utils/approvedWorkLog';

const INDENT_PER_LEVEL_PX = 18;

// Every node (root, parent, or child) stays selectable — hierarchy here is purely a display
// concern; whichever id is picked is still sent as the flat `service_po_id`.
const toHierarchyOption = (p, lockedIds) => {
  const ancestors = getAncestors(p);
  const depth = ancestors.length; // 0 = root, 1 = parent, 2 = child
  const isLocked = lockedIds?.has(String(p.id));

  return {
    value: String(p.id),
    disabled: isLocked,
    searchValue: servicePOSearchValue(p, p.name, p.code),
    label: (
      <span className="flex flex-col" style={{ paddingLeft: `${depth * INDENT_PER_LEVEL_PX}px` }}>
        {depth > 0 && (
          <span className="text-[10px] leading-tight text-muted-foreground">
            {ancestors.map((a) => a.name).join(' › ')}
          </span>
        )}
        <span className="flex items-baseline gap-1.5">
          {depth > 0 && <span className="text-muted-foreground">{'└'}</span>}
          <span>{p.name}</span>
          {p.code && <span className="text-muted-foreground font-mono text-xs">({p.code})</span>}
          {isLocked && (
            <span
              className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
              title={APPROVED_LOCK_TOOLTIP}
            >
              <Lock className="h-2.5 w-2.5" />
              Approved
            </span>
          )}
        </span>
      </span>
    ),
  };
};

// Only the Service POs/projects mapped to the logged-in employee (never the full list) —
// see api/employeeProjects.api.js.
// `lockedIds` (Set of string ids): POs that already have an approved log on the date being edited.
// They stay visible but can't be picked — an approved log is read-only, and the backend 409s a new
// line against that PO for that date.
const ProjectSelect = ({ value, onChange, disabled, lockedIds }) => {
  const { data: projects = [], isLoading } = useEmployeeMappedProjects();

  const options = useMemo(
    () => sortServicePOsHierarchically(projects).map((p) => toHierarchyOption(p, lockedIds)),
    [projects, lockedIds]
  );

  return (
    <SearchableSelect
      options={options}
      value={value}
      onValueChange={(v) => v && onChange(v)}
      disabled={disabled || isLoading}
      loading={isLoading}
      placeholder={isLoading ? 'Loading projects…' : 'Select a project'}
      searchPlaceholder="Search projects…"
      emptyMessage="No projects assigned to you."
    />
  );
};

export default ProjectSelect;
