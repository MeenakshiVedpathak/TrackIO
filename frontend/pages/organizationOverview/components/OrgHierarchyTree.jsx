import { useEffect, useState } from 'react';
import { ChevronRight, ChevronDown, Building2, Landmark, FolderKanban, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import EmptyState from '@/components/common/EmptyState';
import ServicePOHierarchyNode from './ServicePOHierarchyNode';

// `forceOpen` re-opens a row once a search term produces a match under it, even though the row
// already mounted collapsed — it never forces a row closed again once the term is cleared, since
// snapping shut whatever the user just expanded would be more surprising than leaving it open.
const CollapsibleRow = ({ icon: Icon, label, meta, defaultOpen, forceOpen, children }) => {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{label}</span>
        {meta && <span className="ml-auto shrink-0">{meta}</span>}
      </button>
      {open && <div className="ml-3 space-y-1 border-l-2 border-border pl-4 pt-1">{children}</div>}
    </div>
  );
};

const CountBadge = ({ count }) => (
  <Badge variant="muted" className="text-[10px] font-normal">{count}</Badge>
);

// Tab 1 — the primary Entity -> BU -> Projects (Client + Service PO tree) / Users hierarchy,
// built once from the single API response (see utils/organizationOverview.js) and re-derived
// client-side on every render; no fetching happens here.
const OrgHierarchyTree = ({ tree, expandAll }) => {
  if (tree.length === 0) {
    return <EmptyState title="No organization data found" description="Nothing matched the current search." />;
  }

  return (
    <div className="space-y-1 rounded-lg border bg-card p-3">
      {tree.map((entity) => (
        <CollapsibleRow
          key={entity.id}
          icon={Building2}
          label={entity.name}
          defaultOpen
          meta={<CountBadge count={`${entity.businessUnits.length} BU${entity.businessUnits.length === 1 ? '' : 's'}`} />}
        >
          {entity.businessUnits.map((bu) => (
            <CollapsibleRow key={bu.id ?? bu.name} icon={Landmark} label={bu.name} defaultOpen>
              {bu.projects.length > 0 && (
                <CollapsibleRow
                  icon={FolderKanban}
                  label="Projects"
                  defaultOpen={expandAll}
                  forceOpen={expandAll}
                  meta={<CountBadge count={bu.projects.length} />}
                >
                  {bu.projects.map((project) => (
                    <div key={project.id} className="space-y-1">
                      <div className="flex flex-wrap items-baseline gap-2 py-1">
                        <span className="text-sm font-medium">{project.name}</span>
                        <span className="text-xs text-muted-foreground">Client: {project.clientName}</span>
                      </div>
                      {project.servicePOs.length > 0 && (
                        <div className="ml-2 space-y-1 border-l-2 border-border pl-4">
                          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Service POs
                          </p>
                          {project.servicePOs.map((po) => (
                            <ServicePOHierarchyNode key={po.id} node={po} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </CollapsibleRow>
              )}

              {bu.users.length > 0 && (
                <CollapsibleRow
                  icon={Users}
                  label="Users"
                  defaultOpen={expandAll}
                  forceOpen={expandAll}
                  meta={<CountBadge count={bu.users.length} />}
                >
                  <ul className="space-y-1">
                    {bu.users.map((user) => (
                      <li key={user.id} className="flex flex-wrap items-center gap-1.5 py-0.5 text-sm">
                        <span className="font-medium">{user.name}</span>
                        <span className="text-muted-foreground">—</span>
                        {user.roles.length > 0 ? (
                          user.roles.map((role) => (
                            <Badge key={role} variant="secondary" className="text-[10px]">{role}</Badge>
                          ))
                        ) : (
                          <Badge variant="muted" className="text-[10px]">No role</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </CollapsibleRow>
              )}
            </CollapsibleRow>
          ))}
        </CollapsibleRow>
      ))}
    </div>
  );
};

export default OrgHierarchyTree;
