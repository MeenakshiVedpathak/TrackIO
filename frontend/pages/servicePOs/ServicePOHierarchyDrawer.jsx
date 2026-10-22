import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { servicePOHierarchyApi } from '@/api/servicePOHierarchy.api';
import { useServicePOHierarchyTree } from '@/hooks/useServicePOHierarchy';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import ServicePOHierarchyEditor from './ServicePOHierarchyEditor';

const toEditorTree = (nodes = []) =>
  nodes.map((p) => ({
    id: p.id,
    name: p.node_name ?? p.name ?? '',
    isNew: false,
    children: (p.children ?? []).map((c) => ({ id: c.id, name: c.node_name ?? c.name ?? '', isNew: false })),
  }));

// Right-side drawer, independent of the Service PO create/edit form. Fetches the node tree via
// GET /service-pos/:id/hierarchy when opened, holds edits locally, and only calls the hierarchy
// endpoints (never POST/PUT /service-pos) on Save.
const ServicePOHierarchyDrawer = ({ servicePO, open, onOpenChange }) => {
  const servicePOId = servicePO?.id;
  const { success, error: showError } = useNotification();
  const queryClient = useQueryClient();

  const { data: tree, isPending, isError } = useServicePOHierarchyTree(servicePOId, { enabled: open });

  const [parents, setParents] = useState([]);
  const originalNodeIdsRef = useRef(new Set());
  const originalParentIdsRef = useRef(new Set());
  const hydratedRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      hydratedRef.current = false;
      return;
    }
    if (hydratedRef.current || !tree) return;
    hydratedRef.current = true;

    const editorTree = toEditorTree(tree);
    setParents(editorTree);
    originalParentIdsRef.current = new Set(editorTree.map((p) => p.id));
    originalNodeIdsRef.current = new Set(editorTree.flatMap((p) => [p.id, ...p.children.map((c) => c.id)]));
  }, [open, tree]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const currentParentIds = new Set(parents.filter((p) => !p.isNew).map((p) => p.id));
      const currentChildIds = new Set(parents.flatMap((p) => p.children.filter((c) => !c.isNew).map((c) => c.id)));
      const currentIds = new Set([...currentParentIds, ...currentChildIds]);
      const removed = [...originalNodeIdsRef.current].filter((oid) => !currentIds.has(oid));
      // A deleted Parent's children vanish from currentIds alongside it, so both land in `removed`
      // together — delete children first so the backend's own cascade isn't the only thing standing
      // between "delete Parent" and stray orphaned children.
      const removedChildren = removed.filter((rid) => !originalParentIdsRef.current.has(rid));
      const removedParents = removed.filter((rid) => originalParentIdsRef.current.has(rid));
      for (const nodeId of [...removedChildren, ...removedParents]) {
        await servicePOHierarchyApi.deleteNode(nodeId);
      }

      for (const parent of parents) {
        const name = parent.name.trim();
        if (!name) continue; // an unnamed Parent row is skipped, along with any children under it

        let parentRealId = parent.id;
        if (parent.isNew) {
          const created = await servicePOHierarchyApi.createParent(servicePOId, { name });
          parentRealId = created?.id;
        } else {
          await servicePOHierarchyApi.renameNode(parent.id, { name });
        }

        for (const child of parent.children) {
          const childName = child.name.trim();
          if (!childName) continue;
          if (child.isNew) {
            await servicePOHierarchyApi.createChild(servicePOId, parentRealId, { name: childName });
          } else {
            await servicePOHierarchyApi.renameNode(child.id, { name: childName });
          }
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['service-pos', servicePOId, 'hierarchy'] });
      success('Hierarchy saved successfully.');
      onOpenChange(false);
    } catch (err) {
      showError(extractApiError(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !isSaving && onOpenChange(next)}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col bg-white overflow-hidden">
        <SheetHeader className="px-5 py-3 border-b">
          <SheetTitle className="text-base font-medium text-left">Activity/task</SheetTitle>
          {servicePO?.service_po_name && (
            <p className="text-sm text-muted-foreground">{servicePO.service_po_name}</p>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5">
          {isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted animate-pulse rounded-md" />
              ))}
            </div>
          ) : isError ? (
            <p className="text-sm text-destructive">Failed to load hierarchy.</p>
          ) : (
            <ServicePOHierarchyEditor parents={parents} onChange={setParents} />
          )}
        </div>

        <SheetFooter className="px-5 py-3 border-t flex items-center justify-end gap-3 sm:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={isSaving || isPending}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default ServicePOHierarchyDrawer;
