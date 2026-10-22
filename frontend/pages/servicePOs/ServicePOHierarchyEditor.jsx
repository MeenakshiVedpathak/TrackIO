import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/cn';

let tempIdSeq = 0;
export const newTempNodeId = () => `new-${++tempIdSeq}`;

export const emptyChildNode = () => ({ id: newTempNodeId(), name: '', isNew: true });
export const emptyParentNode = () => ({ id: newTempNodeId(), name: '', isNew: true, children: [] });

// showAdd/onAdd render an inline "+ " button on this row — used only for the last Task row so
// "Add Task" always sits right after the most recently added task instead of in a fixed spot.
const ChildRow = ({ child, onChangeName, onDelete, showAdd, onAdd }) => (
  <div className="relative flex items-center gap-2 pl-5">
    {/* horizontal tick connecting to the vertical tree line on the wrapper */}
    <span className="absolute left-0 top-1/2 h-px w-3.5 -translate-y-1/2 bg-border" />
    <Input
      value={child.name}
      onChange={(e) => onChangeName(e.target.value)}
      placeholder="Task name"
      className="h-8 flex-1 text-sm bg-white"
    />
    {showAdd && (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 shrink-0 text-primary hover:text-primary"
        title="Add task"
        onClick={onAdd}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    )}
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 w-7 p-0 shrink-0 text-destructive hover:text-destructive"
      title="Delete task"
      onClick={onDelete}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  </div>
);

// Flat list of Task rows — used when the Service PO being edited is itself a Module, so it can
// only manage its own (leaf) tasks. "+ Add Task" sits inline on the last row; with no tasks yet
// there's no row to attach it to, so it falls back to a standalone button.
export const ServicePOChildrenOnlyEditor = ({ nodes, onChange }) => {
  const addChild = () => onChange([...nodes, emptyChildNode()]);
  const changeName = (id, name) => onChange(nodes.map((c) => (c.id === id ? { ...c, name } : c)));
  const deleteChild = (id) => onChange(nodes.filter((c) => c.id !== id));

  return (
    <div className="space-y-2">
      {nodes.length > 0 ? (
        <div className="space-y-2 border-l-2 border-border pl-4">
          {nodes.map((child, idx) => (
            <ChildRow
              key={child.id}
              child={child}
              onChangeName={(name) => changeName(child.id, name)}
              onDelete={() => deleteChild(child.id)}
              showAdd={idx === nodes.length - 1}
              onAdd={addChild}
            />
          ))}
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={addChild}>
          <Plus className="h-3 w-3" /> Add Task
        </Button>
      )}
    </div>
  );
};

const ParentRow = ({
  parent, isCollapsed, onToggleCollapse, onChangeName, onDelete, onAddChild,
  onChangeChildName, onDeleteChild,
}) => (
  <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 shrink-0"
        title={isCollapsed ? 'Expand module' : 'Collapse module'}
        onClick={onToggleCollapse}
      >
        {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </Button>
      <Input
        value={parent.name}
        onChange={(e) => onChangeName(e.target.value)}
        placeholder="Module name"
        className="h-9 flex-1 text-sm font-medium bg-white"
      />
      {isCollapsed && parent.children.length > 0 && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {parent.children.length} task{parent.children.length === 1 ? '' : 's'}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 shrink-0 text-destructive hover:text-destructive"
        title="Delete Module (removes its tasks too)"
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
    {!isCollapsed && (
      parent.children.length > 0 ? (
        <div className="ml-10 space-y-2 border-l-2 border-border pl-4">
          {parent.children.map((child, idx) => (
            <ChildRow
              key={child.id}
              child={child}
              onChangeName={(name) => onChangeChildName(child.id, name)}
              onDelete={() => onDeleteChild(child.id)}
              showAdd={idx === parent.children.length - 1}
              onAdd={onAddChild}
            />
          ))}
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" className="ml-10 h-7 gap-1.5 text-xs" onClick={onAddChild}>
          <Plus className="h-3 w-3" /> Add Task
        </Button>
      )
    )}
  </div>
);

// Full "root" editor: a single "+ Add Module" button (beside the Service PO name, rendered by the
// caller) plus each Module's own "+ Add Task", which sits inline on that Module's last Task row.
// Deleting a Module drops its whole task array with it (client-side cascade); deleting a Task only
// removes that one row.
const ServicePOHierarchyEditor = ({ parents, onChange }) => {
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());

  const toggleCollapse = (id) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addParent = () => onChange([...parents, emptyParentNode()]);

  const changeParentName = (id, name) => onChange(parents.map((p) => (p.id === id ? { ...p, name } : p)));

  const deleteParent = (id) => onChange(parents.filter((p) => p.id !== id));

  const addChild = (parentId) =>
    onChange(parents.map((p) => (p.id === parentId ? { ...p, children: [...p.children, emptyChildNode()] } : p)));

  const changeChildName = (parentId, childId, name) =>
    onChange(
      parents.map((p) =>
        p.id === parentId
          ? { ...p, children: p.children.map((c) => (c.id === childId ? { ...c, name } : c)) }
          : p
      )
    );

  const deleteChild = (parentId, childId) =>
    onChange(parents.map((p) => (p.id === parentId ? { ...p, children: p.children.filter((c) => c.id !== childId) } : p)));

  return (
    <div className={cn('space-y-3', parents.length > 0 && 'mb-1')}>
      {parents.map((parent) => (
        <ParentRow
          key={parent.id}
          parent={parent}
          isCollapsed={collapsedIds.has(parent.id)}
          onToggleCollapse={() => toggleCollapse(parent.id)}
          onChangeName={(name) => changeParentName(parent.id, name)}
          onDelete={() => deleteParent(parent.id)}
          onAddChild={() => addChild(parent.id)}
          onChangeChildName={(childId, name) => changeChildName(parent.id, childId, name)}
          onDeleteChild={(childId) => deleteChild(parent.id, childId)}
        />
      ))}
      <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={addParent}>
        <Plus className="h-3.5 w-3.5" /> Add Module
      </Button>
    </div>
  );
};

export default ServicePOHierarchyEditor;
