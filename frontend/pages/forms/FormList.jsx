import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import { Pencil, Plus, GripVertical, GripHorizontal, ChevronDown, ChevronRight, FolderTree, FolderCog, ArrowRightLeft } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useForms, useToggleFormStatus, useReorderModules, useReorderForms } from '@/hooks/useForms';
import { useFormCategories } from '@/hooks/useFormCategories';
import { useCanWrite } from '@/hooks/usePermissions';
import { useNotification } from '@/hooks/useNotification';
import { useDebounce } from '@/hooks/useDebounce';
import { extractApiError } from '@/services/apiClient';
import { buildPath, ROUTES } from '@/constants/routes';
import PageHeader from '@/components/common/PageHeader';
import FilterToggleButton from '@/components/common/FilterToggleButton';
import FilterPanel from '@/components/common/FilterPanel';
import SearchInput from '@/components/common/SearchInput';
import MoveFormDialog from './MoveFormDialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/utils/cn';

const ROW_GRID = 'grid grid-cols-[40px_1fr_90px_110px_120px] items-center gap-2';

// Groups the flat module+form rows returned by GET /forms into a module -> forms tree, ordered
// by each level's own `seq`. A form whose module_name doesn't match any module row currently in
// the list (e.g. hidden by the active status filter) is still shown, under a non-reorderable
// "orphan" group, rather than silently dropped.
const buildTree = (rows) => {
  const modules = rows
    .filter((r) => r.module_name == null)
    .slice()
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));

  const childrenByModule = {};
  rows.forEach((r) => {
    if (r.module_name != null) {
      (childrenByModule[r.module_name] ??= []).push(r);
    }
  });
  Object.values(childrenByModule).forEach((list) => list.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)));

  const knownModuleNames = new Set(modules.map((m) => m.form_name));
  const orphanGroups = Object.keys(childrenByModule)
    .filter((name) => !knownModuleNames.has(name))
    .map((name) => ({
      id: `orphan-${name}`,
      form_name: name,
      module_name: null,
      status: 'active',
      seq: null,
      forms: childrenByModule[name],
      isOrphan: true,
    }));

  return [...modules.map((m) => ({ ...m, forms: childrenByModule[m.form_name] ?? [] })), ...orphanGroups];
};

const FormStatusToggle = ({ id, status, disabled }) => {
  const { mutate, isPending } = useToggleFormStatus();
  const isActive = status === 'active';
  return (
    <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
      <Switch
        checked={isActive}
        disabled={isPending || disabled}
        onCheckedChange={(checked) => mutate({ id, status: checked ? 'active' : 'inactive' })}
      />
    </div>
  );
};

const FormRow = ({ form, canWrite, onEdit, onMove, sortable = true, indent = false }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: form.id,
    disabled: !canWrite || !sortable,
  });
  const style = sortable ? { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 } : undefined;

  return (
    <div ref={sortable ? setNodeRef : undefined} style={style} className={cn(ROW_GRID, 'px-3 py-2 border-t border-dashed bg-white')}>
      {sortable ? (
        <button
          type="button"
          title={canWrite ? 'Drag to reorder within this module' : undefined}
          className={cn('flex items-center justify-center pl-4 text-muted-foreground', canWrite ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-30')}
          {...(canWrite ? { ...attributes, ...listeners } : {})}
        >
          <GripHorizontal className="h-3.5 w-3.5" />
        </button>
      ) : (
        <span />
      )}
      <span className={cn('truncate text-sm', indent ? 'pl-8' : 'pl-2')}>{form.form_name}</span>
      <span className="text-sm text-muted-foreground">{form.seq ?? '—'}</span>
      <FormStatusToggle id={form.id} status={form.status} disabled={!canWrite} />
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {canWrite && (
          <>
            <Button size="sm" title="Edit" onClick={onEdit} className="h-6 w-6 p-0 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors">
              <Pencil className="h-3 w-3" />
            </Button>
            <Button size="sm" title="Move Form" onClick={() => onMove(form)} className="h-6 w-6 p-0 bg-slate-500 hover:bg-slate-600 text-white rounded transition-colors">
              <ArrowRightLeft className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

const ModuleBlock = ({ module, canWrite, expanded, onToggleExpand, onEditModule, onEditForm, onFormsReorder, onMoveForm, onAddCategory, categoryLookup, collapsedCategories, onToggleCategory }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: module.id,
    disabled: module.isOrphan || !canWrite,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const formSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Forms with a category_id are grouped under their category and shown in seq order only — the
  // API has no reorder-within-category endpoint (only module-scoped PATCH /forms/reorder), so
  // only the uncategorized subset below is drag-sortable.
  const uncategorizedForms = module.forms.filter((f) => f.category_id == null);
  const categorizedGroups = useMemo(() => {
    const byCategory = new Map();
    module.forms.forEach((f) => {
      if (f.category_id == null) return;
      if (!byCategory.has(f.category_id)) byCategory.set(f.category_id, []);
      byCategory.get(f.category_id).push(f);
    });
    return Array.from(byCategory.entries())
      .map(([categoryId, forms]) => ({
        id: categoryId,
        name: categoryLookup.get(categoryId)?.name ?? `Category #${categoryId}`,
        seq: categoryLookup.get(categoryId)?.seq ?? 0,
        forms: forms.slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0)),
      }))
      .sort((a, b) => a.seq - b.seq);
  }, [module.forms, categoryLookup]);

  const handleFormsDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = uncategorizedForms.findIndex((f) => f.id === active.id);
    const newIndex = uncategorizedForms.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onFormsReorder(module.form_name, arrayMove(uncategorizedForms, oldIndex, newIndex));
  };

  return (
    <div ref={setNodeRef} style={style} className="border-b last:border-b-0">
      <div className={cn(ROW_GRID, 'px-3 py-2.5 bg-slate-50/70')}>
        <button
          type="button"
          title={module.isOrphan ? undefined : canWrite ? 'Drag to reorder modules' : undefined}
          className={cn('flex items-center justify-center text-muted-foreground', (module.isOrphan || !canWrite) ? 'cursor-not-allowed opacity-30' : 'cursor-grab active:cursor-grabbing')}
          {...(module.isOrphan || !canWrite ? {} : { ...attributes, ...listeners })}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button type="button" onClick={onToggleExpand} className="flex min-w-0 items-center gap-1.5 text-left text-sm font-semibold">
          {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate">{module.form_name}</span>
        </button>
        <span className="text-sm text-muted-foreground">{module.seq ?? '—'}</span>
        <FormStatusToggle id={module.id} status={module.status} disabled={!canWrite || module.isOrphan} />
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {canWrite && !module.isOrphan && (
            <>
              <Button size="sm" title="Edit module" onClick={onEditModule} className="h-6 w-6 p-0 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors">
                <Pencil className="h-3 w-3" />
              </Button>
              <Button size="sm" title="Add Category" onClick={() => onAddCategory(module.id)} className="h-6 w-6 p-0 bg-slate-500 hover:bg-slate-600 text-white rounded transition-colors">
                <FolderCog className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>

      {expanded && (
        module.forms.length === 0 ? (
          <div className="pl-12 pr-3 py-2 text-xs text-muted-foreground bg-white">No forms in this module yet.</div>
        ) : (
          <>
            {categorizedGroups.map((group) => {
              const categoryKey = `${module.id}-${group.id}`;
              const categoryExpanded = !collapsedCategories.has(categoryKey);
              return (
                <div key={group.id}>
                  <button
                    type="button"
                    onClick={() => onToggleCategory(categoryKey)}
                    className="w-full pl-9 pr-3 py-1.5 border-t bg-slate-50/40 text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5 text-left"
                  >
                    {categoryExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                    <FolderCog className="h-3 w-3 shrink-0" /> {group.name}
                  </button>
                  {categoryExpanded && group.forms.map((form) => (
                    <FormRow
                      key={form.id}
                      form={form}
                      canWrite={canWrite}
                      sortable={false}
                      indent
                      onEdit={() => onEditForm(form)}
                      onMove={onMoveForm}
                    />
                  ))}
                </div>
              );
            })}

            {uncategorizedForms.length > 0 && (
              <DndContext sensors={formSensors} collisionDetection={closestCenter} onDragEnd={handleFormsDragEnd}>
                <SortableContext items={uncategorizedForms.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                  {uncategorizedForms.map((form) => (
                    <FormRow
                      key={form.id}
                      form={form}
                      canWrite={canWrite}
                      onEdit={() => onEditForm(form)}
                      onMove={onMoveForm}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </>
        )
      )}
    </div>
  );
};

const FormList = () => {
  const navigate = useNavigate();
  const { error: showError } = useNotification();
  const canWrite = useCanWrite();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [collapsedCategories, setCollapsedCategories] = useState(() => new Set());
  const [tree, setTree] = useState(null);
  const [moveDialogForm, setMoveDialogForm] = useState(null);
  const collapsedInitialized = useRef(false);

  const debouncedSearch = useDebounce(search, 400);
  const params = {
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(debouncedSearch && { search: debouncedSearch }),
  };

  const { data, isPending } = useForms(params);
  const reorderModulesMutation = useReorderModules();
  const reorderFormsMutation = useReorderForms();
  // Unscoped fetch across all modules — used only to label categorized forms in this tree, not
  // as a dropdown source (those are always fetched module-scoped via useFormCategories elsewhere).
  const { data: allCategories = [] } = useFormCategories({});
  const categoryLookup = useMemo(() => new Map(allCategories.map((c) => [c.id, c])), [allCategories]);

  useEffect(() => {
    const nextTree = buildTree(data?.data ?? []);
    setTree(nextTree);
    if (!collapsedInitialized.current && nextTree.length > 0) {
      collapsedInitialized.current = true;
      setCollapsed(new Set(nextTree.map((m) => m.id)));
    }
  }, [data]);

  const activeFilterCount = statusFilter !== 'all' ? 1 : 0;

  const clearFilters = () => {
    setStatusFilter('all');
  };

  const moduleSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const toggleExpand = (id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleCategoryExpand = (categoryKey) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryKey)) next.delete(categoryKey);
      else next.add(categoryKey);
      return next;
    });
  };

  const handleModulesDragEnd = (event) => {
    const { active, over } = event;
    if (!tree || !over || active.id === over.id) return;
    if (typeof active.id === 'string' && active.id.startsWith('orphan-')) return;
    const oldIndex = tree.findIndex((m) => m.id === active.id);
    const newIndex = tree.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(tree, oldIndex, newIndex);
    // Stamp the seq we're about to send onto the local rows immediately, so the "Sequence"
    // column always shows the value that's actually current/in-flight rather than the stale
    // pre-drag number until the refetch lands.
    let nextSeq = 1;
    const withSeq = reordered.map((m) => (m.isOrphan ? m : { ...m, seq: nextSeq++ }));
    setTree(withSeq);
    const items = withSeq.filter((m) => !m.isOrphan).map((m) => ({ id: m.id, seq: m.seq }));
    reorderModulesMutation.mutate(items, {
      onError: (err) => showError(extractApiError(err)),
    });
  };

  const handleFormsReorder = (moduleName, reorderedForms) => {
    // reorderedForms is only the uncategorized subset of this module — merge the new seq values
    // back into the module's full forms list so categorized forms are left untouched.
    const withSeq = reorderedForms.map((f, i) => ({ ...f, seq: i + 1 }));
    const withSeqById = new Map(withSeq.map((f) => [f.id, f]));
    setTree((prev) => (prev ?? []).map((m) => (
      m.form_name === moduleName && !m.isOrphan
        ? { ...m, forms: m.forms.map((f) => withSeqById.get(f.id) ?? f) }
        : m
    )));
    const items = withSeq.map((f) => ({ id: f.id, seq: f.seq }));
    reorderFormsMutation.mutate({ moduleName, items }, {
      onError: (err) => showError(extractApiError(err)),
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col space-y-4">
      <PageHeader
        title="Forms"
        description="Manage modules and forms available for role-based access control"
        actions={
          <div className="flex items-center gap-3">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search forms…"
              className="w-[220px]"
            />
            <FilterToggleButton
              isOpen={filtersOpen}
              onToggle={() => setFiltersOpen((prev) => !prev)}
              activeCount={activeFilterCount}
            />
            <Button size="toolbar" variant="outline" onClick={() => navigate(ROUTES.FORM_CATEGORIES)}>
              <FolderCog className="h-4 w-4" /> Manage Categories
            </Button>
            {canWrite && (
              <>
                <Button size="toolbar" variant="outline" onClick={() => navigate(`${ROUTES.FORM_NEW}?type=module`)}>
                  <FolderTree className="h-4 w-4" /> Add Module
                </Button>
                <Button size="toolbar" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => navigate(`${ROUTES.FORM_NEW}?type=form`)}>
                  <Plus className="h-4 w-4" /> Add Form
                </Button>
              </>
            )}
          </div>
        }
      />

      <FilterPanel isOpen={filtersOpen} maxHeightClass="max-h-[200px]" onClear={clearFilters} showClear={activeFilterCount > 0}>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Status</Label>
          <div className="flex items-center rounded-md border overflow-hidden h-9 text-sm bg-white">
            {[
              { label: 'All', value: 'all' },
              { label: 'Active', value: 'active' },
              { label: 'Inactive', value: 'inactive' },
            ].map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={cn(
                  'flex-1 px-3 h-full font-medium text-center transition-colors border-r last:border-r-0',
                  statusFilter === value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </FilterPanel>

      {canWrite && (
        <div className="flex items-center gap-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          <span className="flex items-center gap-1.5">
            <GripVertical className="h-3.5 w-3.5 shrink-0" /> Drag to reorder modules
          </span>
          <span className="flex items-center gap-1.5">
            <GripHorizontal className="h-3.5 w-3.5 shrink-0" /> Drag to reorder forms within a module
          </span>
          <span className="text-blue-700/70">— sequence updates automatically.</span>
        </div>
      )}

      <div className="rounded-lg border bg-white overflow-hidden">
        <div className={cn(ROW_GRID, 'border-b bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground')}>
          <span />
          <span>Module / Form</span>
          <span>Sequence</span>
          <span>Status</span>
          <span>Actions</span>
        </div>

        {isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded-md" />
            ))}
          </div>
        ) : !tree || tree.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No modules or forms found.</div>
        ) : (
          <DndContext sensors={moduleSensors} collisionDetection={closestCenter} onDragEnd={handleModulesDragEnd}>
            <SortableContext items={tree.map((m) => m.id)} strategy={verticalListSortingStrategy}>
              {tree.map((module) => (
                <ModuleBlock
                  key={module.id}
                  module={module}
                  canWrite={canWrite}
                  expanded={!collapsed.has(module.id)}
                  onToggleExpand={() => toggleExpand(module.id)}
                  onEditModule={() => navigate(buildPath(ROUTES.FORMS + '/' + module.id + '/edit'))}
                  onEditForm={(form) => navigate(buildPath(ROUTES.FORMS + '/' + form.id + '/edit'))}
                  onFormsReorder={handleFormsReorder}
                  onMoveForm={setMoveDialogForm}
                  onAddCategory={(moduleId) => navigate(`${ROUTES.FORM_CATEGORY_NEW}?module_id=${moduleId}`)}
                  categoryLookup={categoryLookup}
                  collapsedCategories={collapsedCategories}
                  onToggleCategory={toggleCategoryExpand}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      <MoveFormDialog
        form={moveDialogForm}
        open={!!moveDialogForm}
        onOpenChange={(open) => !open && setMoveDialogForm(null)}
      />

      <Outlet />
    </div>
  );
};

export default FormList;
