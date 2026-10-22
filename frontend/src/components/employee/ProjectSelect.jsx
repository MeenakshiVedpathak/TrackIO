import { useMemo } from 'react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useEmployeeMappedProjects } from '@/hooks/useEmployeeProjects';
import { getAncestors, servicePOSearchValue, sortServicePOsHierarchically } from '@/utils/servicePOHierarchy';

const INDENT_PER_LEVEL_PX = 18;

// Every node (root, parent, or child) stays selectable — hierarchy here is purely a display
// concern; whichever id is picked is still sent as the flat `service_po_id`.
const toHierarchyOption = (p) => {
  const ancestors = getAncestors(p);
  const depth = ancestors.length; // 0 = root, 1 = parent, 2 = child

  return {
    value: String(p.id),
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
        </span>
      </span>
    ),
  };
};

// Only the Service POs/projects mapped to the logged-in employee (never the full list) —
// see api/employeeProjects.api.js.
const ProjectSelect = ({ value, onChange, disabled }) => {
  const { data: projects = [], isLoading } = useEmployeeMappedProjects();

  const options = useMemo(
    () => sortServicePOsHierarchically(projects).map(toHierarchyOption),
    [projects]
  );

  return (
    <SearchableSelect
      options={options}
      value={value}
      onValueChange={(v) => v && onChange(v)}
      disabled={disabled || isLoading}
      placeholder={isLoading ? 'Loading projects…' : 'Select a project'}
      searchPlaceholder="Search projects…"
      emptyMessage="No projects assigned to you."
    />
  );
};

export default ProjectSelect;
