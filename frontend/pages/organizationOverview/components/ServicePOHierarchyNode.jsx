import { FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// Renders both shapes this tree mixes: the root Service PO itself (servicePOName/poCode/status,
// from normalizeProject) and its nested Parent/Child hierarchy entries (name/nodeType only — the
// backend's flat `hierarchy` array has no code/status on those, just id/name/node_type/parent_id).
const ServicePOHierarchyNode = ({ node }) => {
  const label = node.servicePOName ?? node.name;
  const code = node.poCode;
  const badgeText = node.status ?? node.nodeType?.toLowerCase();
  const badgeVariant = node.status ? (node.status === 'active' ? 'success' : 'muted') : 'outline';

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 py-1">
        <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium truncate">{label}</span>
        {code && code !== '—' && (
          <Badge variant="outline" className="text-[10px] font-normal">{code}</Badge>
        )}
        {badgeText && (
          <Badge variant={badgeVariant} className="text-[10px] capitalize">{badgeText}</Badge>
        )}
      </div>
      {node.children?.length > 0 && (
        <div className="ml-2 space-y-1 border-l-2 border-border pl-4">
          {node.children.map((child) => (
            <ServicePOHierarchyNode key={child.id} node={child} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ServicePOHierarchyNode;
