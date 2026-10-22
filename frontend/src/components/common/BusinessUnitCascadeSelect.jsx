import { useMemo } from 'react';
import { SearchableSelect } from '@/components/ui/searchable-select';

// Groups a flat BU list (each `{ id, name, parentId }`, e.g. from useSelectableBusinessUnits) into
// top-level roots plus a parent-id -> children[] map — shared by every single-select BU picker
// (Service PO/Client/Project creation) so the Parent BU -> Sub-BU grouping isn't reimplemented at
// each call site.
export const useBuHierarchy = (units = []) => {
  const roots = useMemo(() => units.filter((u) => u.parentId == null), [units]);
  const childrenByParent = useMemo(() => {
    const map = new Map();
    units.forEach((u) => {
      if (u.parentId == null) return;
      const key = String(u.parentId);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(u);
    });
    return map;
  }, [units]);
  const childrenOf = (rootId) => (rootId != null && rootId !== '' ? childrenByParent.get(String(rootId)) ?? [] : []);
  return { roots, childrenOf };
};

// Root-level BU picker for a record-creation form (Client/Project/Service PO — anywhere a record
// is scoped to exactly ONE Business Unit). Deliberately lists ONLY top-level (parentId == null)
// BUs — never a Sub-BU flattened in alongside them, which was the reported bug: a freshly created
// Sub-BU showed up as just another indistinguishable row in this same list the moment it existed.
//
// Sub-BU selection is a SEPARATE field/component (SubBusinessUnitSelect below), rendered by the
// caller as its own sibling form field — in its own grid cell, not nested inside this one — once
// the picked root turns out to have children. Kept out of THIS component (rather than merged into
// one compound control) for two reasons: (1) Client/Project loading keys off this field's value
// alone and must never wait on a Sub-BU pick that's still pending — picking a root fires
// `onValueChange` immediately with the root's own id; (2) a merged control that grows a second
// dropdown inside one grid cell breaks a 2-column form grid's row layout, since the cell holding
// it becomes taller than its row sibling instead of the extra field taking its own grid slot.
//
// `extraOptions` are non-hierarchical rows prepended as-is (e.g. Service PO Form's "My Clients
// (No Business Unit)" sentinel) — always terminal, never expandable into a Sub-BU dropdown.
export const BusinessUnitCascadeSelect = ({
  units = [],
  extraOptions = [],
  value,
  onValueChange,
  disabled = false,
  placeholder = 'Select business unit',
  searchPlaceholder = 'Search business unit...',
  className,
}) => {
  const { roots } = useBuHierarchy(units);
  const options = useMemo(
    () => [...extraOptions, ...roots.map((u) => ({ value: String(u.id), label: u.name }))],
    [extraOptions, roots]
  );
  return (
    <SearchableSelect
      options={options}
      value={value ?? ''}
      onValueChange={onValueChange}
      disabled={disabled}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      className={className}
    />
  );
};

// The second, mandatory-when-applicable step of the cascade — the caller renders this only once
// `useBuHierarchy(units).childrenOf(selectedRootId)` comes back non-empty, as its own sibling
// FormField right after the root BusinessUnitCascadeSelect above (see ServicePOForm/ClientForm/
// ProjectForm), so it lands in its own grid cell instead of being crammed under the root field.
export const SubBusinessUnitSelect = ({
  options,
  value,
  onValueChange,
  disabled = false,
  placeholder = 'Select sub business unit',
  searchPlaceholder = 'Search sub business unit...',
  className,
}) => (
  <SearchableSelect
    options={options}
    value={value ?? ''}
    onValueChange={onValueChange}
    disabled={disabled}
    placeholder={placeholder}
    searchPlaceholder={searchPlaceholder}
    className={className}
  />
);

export default BusinessUnitCascadeSelect;
