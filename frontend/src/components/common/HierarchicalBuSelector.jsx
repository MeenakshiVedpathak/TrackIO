import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/utils/cn';

// A 2-level tree-style multi-select — built for the Parent BU -> Sub-BU hierarchy, but generic
// enough to reuse for any 2-level parent/child list. Options come in FLAT: `{ id, label,
// parentId }`, `parentId: null` means a root (Parent BU) node; everything else is grouped under
// the root whose id matches. Same options/value/onValueChange contract as `MultiSelect` (values
// are always strings), so it's a drop-in swap wherever that shape was already wired.
//
// Deliberately NOT built on `MultiSelect` (composition would have meant threading indentation and
// a second click target — the chevron — through props that component was never designed for) —
// same underlying Popover/Command/Checkbox primitives, just its own render logic.
export function HierarchicalBuSelector({
  options = [],
  value = [],
  onValueChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No option found.',
  disabled = false,
  className,
  // The trigger button already shows "N selected" once more than one is picked — this chip row
  // is only worth the extra vertical space in a stacked label+field cell (see
  // components/common/BusinessUnitFilter's own layout). Callers that place this inline in a
  // single-line header row (e.g. Dashboard's page header) pass false to avoid the row growing a
  // second line under the trigger.
  showChips = true,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  // Manually expanded roots. A root with a search match among its children is ALSO shown
  // expanded (see `isExpanded` below) without this set needing to track that — clearing the
  // search collapses it right back to whatever the user had actually chosen to expand.
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const selected = useMemo(() => new Set(value.map(String)), [value]);

  const { roots, childrenByParent, labelById } = useMemo(() => {
    const byParent = new Map();
    const byId = new Map();
    options.forEach((opt) => {
      byId.set(String(opt.id), opt.label);
      const key = opt.parentId == null ? null : String(opt.parentId);
      if (key == null) return;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(opt);
    });
    const rootList = options.filter((opt) => opt.parentId == null);
    return { roots: rootList, childrenByParent: byParent, labelById: byId };
  }, [options]);

  // Deliberately literal — checking a Parent BU does NOT visually tick its Sub-BUs, and checking
  // one Sub-BU never implies anything about its siblings or Parent. Each checkbox is its own,
  // independent choice (an earlier version implied a Sub-BU as "checked" whenever its Parent was,
  // which read as the tree silently auto-selecting Sub-BUs the user never actually picked). The
  // "sending a checked Parent's id together with one of its own checked Sub-BU's id would be
  // redundant server-side" concern this used to also handle here is resolved at the network-request
  // boundary instead (see dedupeBusinessUnitIds, exported below) — this component only ever cares
  // about what's genuinely, literally checked.
  const isChecked = (id) => selected.has(String(id));

  const query = search.trim().toLowerCase();
  const matches = (label) => label.toLowerCase().includes(query);

  // Filters to what the search should actually show: a root is kept if it matches OR any of its
  // children match; a kept root's children are narrowed to just the matches (or all of them, when
  // the root itself is what matched and no query is typed at all).
  const visibleTree = useMemo(() => {
    return roots
      .map((root) => {
        const children = childrenByParent.get(String(root.id)) ?? [];
        if (!query) return { root, children, hasMatch: true, childMatched: false };
        const rootMatches = matches(root.label);
        const matchedChildren = children.filter((c) => matches(c.label));
        if (!rootMatches && matchedChildren.length === 0) return null;
        return {
          root,
          children: rootMatches ? children : matchedChildren,
          hasMatch: true,
          childMatched: !rootMatches && matchedChildren.length > 0,
        };
      })
      .filter(Boolean);
  }, [roots, childrenByParent, query]);

  const isExpanded = (rootId, childMatched) => expandedIds.has(String(rootId)) || (query.length > 0 && childMatched);

  const toggleExpanded = (rootId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      const key = String(rootId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggle = (id) => {
    const key = String(id);
    const next = selected.has(key) ? value.filter((v) => String(v) !== key) : [...value, key];
    onValueChange(next);
  };

  const allVisibleIds = useMemo(
    () => visibleTree.flatMap(({ root, children }) => [String(root.id), ...children.map((c) => String(c.id))]),
    [visibleTree]
  );
  const allVisibleSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => isChecked(id));
  const someVisibleSelected = allVisibleIds.some((id) => isChecked(id));

  const selectAllVisible = () => {
    onValueChange(Array.from(new Set([...value, ...allVisibleIds])));
  };
  const clearAll = () => onValueChange([]);

  const selectedLabels = value.map((v) => labelById.get(String(v))).filter(Boolean);

  return (
    <div className="flex flex-col gap-1.5">
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              // Fluid clamp() sizing (see button.jsx's own comment) instead of a fixed h-9/text-sm.
              'w-full justify-between h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)] font-normal',
              selectedLabels.length === 0 && 'text-muted-foreground',
              className
            )}
          >
            <span className="flex-1 truncate text-left">
              {selectedLabels.length === 0
                ? placeholder
                : selectedLabels.length === 1
                ? selectedLabels[0]
                : `${selectedLabels.length} selected`}
            </span>
            <ChevronDown className="h-[1em] w-[1em] shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="min-w-[var(--radix-popover-trigger-width)] w-max max-w-xs p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
            <div className="flex items-center justify-between border-b px-2 py-1.5">
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
                disabled={allVisibleSelected || allVisibleIds.length === 0}
                onClick={selectAllVisible}
              >
                Select all
              </button>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
                disabled={value.length === 0}
                onClick={clearAll}
              >
                Clear all
              </button>
            </div>
            <CommandList className="max-h-64">
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {visibleTree.map(({ root, children, childMatched }) => {
                  const hasChildren = children.length > 0 || (childrenByParent.get(String(root.id))?.length ?? 0) > 0;
                  const expanded = isExpanded(root.id, childMatched);
                  return (
                    <div key={root.id}>
                      <CommandItem
                        value={`root-${root.id}-${root.label}`}
                        onSelect={() => toggle(root.id)}
                        className="gap-1.5"
                      >
                        {hasChildren ? (
                          <button
                            type="button"
                            tabIndex={-1}
                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleExpanded(root.id); }}
                            className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-muted"
                            aria-label={expanded ? 'Collapse' : 'Expand'}
                          >
                            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                        ) : (
                          <span className="w-4 shrink-0" />
                        )}
                        <Checkbox checked={isChecked(root.id)} className="pointer-events-none" />
                        <span className="truncate font-medium" title={root.label}>{root.label}</span>
                      </CommandItem>
                      {hasChildren && expanded && children.map((child) => (
                        <CommandItem
                          key={child.id}
                          value={`child-${child.id}-${child.label}`}
                          onSelect={() => toggle(child.id)}
                          className="gap-1.5 pl-9"
                        >
                          <Checkbox checked={isChecked(child.id)} className="pointer-events-none" />
                          <span className="truncate" title={child.label}>{child.label}</span>
                        </CommandItem>
                      ))}
                    </div>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Compact chip display of the current selection, outside the dropdown — a full tree
          re-render inside the trigger button would be unreadable past 2-3 selections. */}
      {showChips && selectedLabels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((v) => {
            const label = labelById.get(String(v));
            if (!label) return null;
            return (
              <Badge key={v} variant="secondary" className="gap-1 pr-1 font-normal">
                {label}
                <button
                  type="button"
                  onClick={() => toggle(v)}
                  className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                  aria-label={`Remove ${label}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
}

// The tree above keeps checkbox state purely literal (see `isChecked`) — a user can freely check a
// Parent BU and one of its own Sub-BUs together without either one silently vanishing or the other
// auto-ticking. But sending BOTH ids to the backend as-is is wrong two different ways: it's
// redundant (businessUnitIds already resolves a Parent id to "itself + every child"), and — the
// one that actually matters here — checking a specific Sub-BU alongside its already-checked Parent
// is a deliberate narrowing gesture ("actually, just THIS Sub-BU"), not a request to widen back out
// to the whole Parent. So the PARENT is what gets dropped whenever any of its own children are also
// selected, never the other way around (confirmed live: DATA + AI [84 employees] + its Sub-BU DAS
// [5 employees] checked together kept showing 84 — the Parent silently winning — until this was
// fixed to drop 23 and keep 42 instead). Matches the same "a selected child always supersedes its
// Parent" rule BusinessUnitFilter's own multi-select and the Service PO Mapping screen's BU cascade
// already use. Call this on `value` at the point a caller turns it into a request param — never
// inside the component itself, which has no opinion on what's sent, only on what's checked.
export const dedupeBusinessUnitIds = (ids, options = []) => {
  const parentIdById = new Map();
  options.forEach((opt) => {
    if (opt.parentId != null) parentIdById.set(String(opt.id), String(opt.parentId));
  });
  const parentIdsWithChildSelected = new Set(
    ids.map((id) => parentIdById.get(String(id))).filter(Boolean)
  );
  return ids.filter((id) => !parentIdsWithChildSelected.has(String(id)));
};

export default HierarchicalBuSelector;
