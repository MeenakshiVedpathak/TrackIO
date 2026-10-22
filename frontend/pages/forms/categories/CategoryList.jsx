import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Outlet } from 'react-router-dom';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, GripVertical, ArrowRightLeft, ArrowLeft, FolderCog } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useFormModules, useFormHierarchy } from '@/hooks/useForms';
import {
  useToggleFormCategoryStatus, useDeleteFormCategory, useReorderFormCategories,
} from '@/hooks/useFormCategories';
import { useCanWrite } from '@/hooks/usePermissions';
import { useNotification } from '@/hooks/useNotification';
import { extractApiError } from '@/services/apiClient';
import { buildPath, ROUTES } from '@/constants/routes';
import PageHeader from '@/components/common/PageHeader';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import MoveFormDialog from '../MoveFormDialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { cn } from '@/utils/cn';

const CATEGORY_GRID = 'grid grid-cols-[40px_1fr_1fr_90px_100px] items-center gap-2';
const FORM_GRID = 'grid grid-cols-[1fr_90px_90px_80px] items-center gap-2';

const ReadonlyFormRow = ({ form, canWrite, onMove }) => (
  <div className={cn(FORM_GRID, 'px-3 py-2 pl-12 border-t border-dashed bg-white')}>
    <span className="truncate text-sm">{form.form_name}</span>
    <span className="text-sm text-muted-foreground">{form.seq ?? '—'}</span>
    <span className={cn('text-xs font-medium', form.status === 'active' ? 'text-green-600' : 'text-slate-400')}>
      {form.status === 'active' ? 'Active' : 'Inactive'}
    </span>
    <div className="flex items-center">
      {canWrite && (
        <Button size="sm" title="Move Form" onClick={() => onMove(form)} className="h-6 w-6 p-0 bg-slate-500 hover:bg-slate-600 text-white rounded transition-colors">
          <ArrowRightLeft className="h-3 w-3" />
        </Button>
      )}
    </div>
  </div>
);

const CategoryRow = ({ category, canWrite, expanded, onToggleExpand, onEdit, onDelete, onMoveForm }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
    disabled: !canWrite,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const toggleMutation = useToggleFormCategoryStatus();

  return (
    <div ref={setNodeRef} style={style} className="border-b last:border-b-0">
      <div className={cn(CATEGORY_GRID, 'px-3 py-2.5 bg-slate-50/70')}>
        <button
          type="button"
          title={canWrite ? 'Drag to reorder categories' : undefined}
          className={cn('flex items-center justify-center text-muted-foreground', canWrite ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-30')}
          {...(canWrite ? { ...attributes, ...listeners } : {})}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button type="button" onClick={onToggleExpand} className="flex min-w-0 items-center gap-1.5 text-left text-sm font-semibold">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate">{category.name}</span>
          <span className="text-xs font-normal text-muted-foreground">({category.forms?.length ?? 0})</span>
        </button>
        <span className="truncate text-xs text-muted-foreground" title={category.description || ''}>{category.description || '—'}</span>
        <div onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={category.status === 'active'}
            disabled={toggleMutation.isPending || !canWrite}
            onCheckedChange={(checked) => toggleMutation.mutate({ id: category.id, status: checked ? 'active' : 'inactive' })}
          />
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {canWrite && (
            <>
              <Button size="sm" title="Edit" onClick={onEdit} className="h-6 w-6 p-0 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors">
                <Pencil className="h-3 w-3" />
              </Button>
              <Button size="sm" title="Delete" onClick={onDelete} className="h-6 w-6 p-0 bg-red-500 hover:bg-red-600 text-white rounded transition-colors">
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>

      {expanded && (
        (category.forms?.length ?? 0) === 0 ? (
          <div className="pl-12 pr-3 py-2 text-xs text-muted-foreground bg-white">No forms in this category yet.</div>
        ) : (
          category.forms.map((form) => (
            <ReadonlyFormRow key={form.id} form={form} canWrite={canWrite} onMove={onMoveForm} />
          ))
        )
      )}
    </div>
  );
};

const CategoryList = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { error: showError, success } = useNotification();
  const canWrite = useCanWrite();

  const [selectedModuleId, setSelectedModuleId] = useState(() => {
    const fromUrl = searchParams.get('module');
    return fromUrl ? Number(fromUrl) : undefined;
  });
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [categories, setCategories] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [moveFormTarget, setMoveFormTarget] = useState(null);

  const { data: moduleOptions = [], isPending: isLoadingModules } = useFormModules({ status: 'active' });
  const { data: hierarchy = [], isPending: isLoadingHierarchy } = useFormHierarchy();
  const reorderMutation = useReorderFormCategories();
  const deleteMutation = useDeleteFormCategory();

  useEffect(() => {
    if (selectedModuleId == null && moduleOptions.length > 0) {
      setSelectedModuleId(moduleOptions[0].id);
    }
  }, [moduleOptions, selectedModuleId]);

  const selectedModule = hierarchy.find((m) => m.id === selectedModuleId);

  useEffect(() => {
    setCategories(selectedModule?.categories ?? []);
  }, [selectedModule]);

  const handleModuleChange = (v) => {
    if (!v) return;
    const nextId = Number(v);
    setSelectedModuleId(nextId);
    setSearchParams({ module: String(nextId) });
  };

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const categorySensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleCategoriesDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(categories, oldIndex, newIndex);
    const withSeq = reordered.map((c, i) => ({ ...c, seq: i + 1 }));
    setCategories(withSeq);
    const items = withSeq.map((c) => ({ id: c.id, seq: c.seq }));
    reorderMutation.mutate({ moduleId: selectedModuleId, items }, {
      onError: (err) => showError(extractApiError(err)),
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        success('Category deleted.');
        setDeleteTarget(null);
      },
      onError: (err) => {
        showError(extractApiError(err));
        setDeleteTarget(null);
      },
    });
  };

  const uncategorizedForms = selectedModule?.forms ?? [];

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate(ROUTES.FORMS)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Forms
      </button>

      <PageHeader
        title="Manage Categories"
        description="Categories are an optional way to group related forms within a module — forms left without one simply stay directly under the module, exactly as before."
        actions={
          canWrite && selectedModuleId != null && (
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => navigate(`${ROUTES.FORM_CATEGORY_NEW}?module_id=${selectedModuleId}`)}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Add Category
            </Button>
          )
        }
      />

      <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2.5">
        <Label className="text-xs shrink-0">1. Choose a module</Label>
        <Select value={selectedModuleId != null ? String(selectedModuleId) : undefined} onValueChange={handleModuleChange} disabled={isLoadingModules}>
          <SelectTrigger className="h-9 text-sm bg-white w-[240px]">
            <SelectValue placeholder="Select a module" />
          </SelectTrigger>
          <SelectContent>
            {moduleOptions.map((m) => (
              <SelectItem key={m.id} value={String(m.id)}>{m.form_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedModule && (
          <span className="text-xs text-muted-foreground">
            Showing categories in <span className="font-medium text-foreground">{selectedModule.form_name}</span>
          </span>
        )}
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <div className="flex items-center gap-1.5 border-b bg-slate-50 px-3 py-2 text-sm font-medium">
          <FolderCog className="h-4 w-4 text-muted-foreground" /> 2. Categories in this module
        </div>
        <div className={cn(CATEGORY_GRID, 'border-b bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground')}>
          <span />
          <span>Category</span>
          <span>Description</span>
          <span>Status</span>
          <span>Actions</span>
        </div>

        {isLoadingHierarchy ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded-md" />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground space-y-3">
            <p>No categories in this module yet — forms here just stay directly under the module.</p>
            {canWrite && selectedModuleId != null && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`${ROUTES.FORM_CATEGORY_NEW}?module_id=${selectedModuleId}`)}
              >
                <Plus className="mr-1.5 h-4 w-4" /> Add your first category
              </Button>
            )}
          </div>
        ) : (
          <DndContext sensors={categorySensors} collisionDetection={closestCenter} onDragEnd={handleCategoriesDragEnd}>
            <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {categories.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  canWrite={canWrite}
                  expanded={expandedIds.has(category.id)}
                  onToggleExpand={() => toggleExpand(category.id)}
                  onEdit={() => navigate(`${buildPath(ROUTES.FORM_CATEGORY_EDIT, { id: category.id })}?module_id=${selectedModuleId}`)}
                  onDelete={() => setDeleteTarget(category)}
                  onMoveForm={setMoveFormTarget}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <div className="rounded-lg border bg-white overflow-hidden">
        <div className="px-3 py-2 text-sm font-medium bg-slate-50 border-b">
          3. Forms without a category
          <span className="ml-1.5 font-normal text-xs text-muted-foreground">— these stay directly under the module</span>
        </div>
        {uncategorizedForms.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No uncategorized forms in this module.</div>
        ) : (
          uncategorizedForms.map((form) => (
            <ReadonlyFormRow key={form.id} form={form} canWrite={canWrite} onMove={setMoveFormTarget} />
          ))
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete category?"
        description={`This will deactivate "${deleteTarget?.name}". If it still has forms assigned, the server will reject this — move those forms out first.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        isLoading={deleteMutation.isPending}
      />

      <MoveFormDialog
        form={moveFormTarget}
        open={!!moveFormTarget}
        onOpenChange={(open) => !open && setMoveFormTarget(null)}
      />

      <Outlet />
    </div>
  );
};

export default CategoryList;
