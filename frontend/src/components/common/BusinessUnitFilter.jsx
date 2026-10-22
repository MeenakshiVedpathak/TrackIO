import { useMemo } from 'react';
import { useSelectableBusinessUnits } from '@/hooks/useSelectableBusinessUnits';
import { useSelectableEntities } from '@/hooks/useSelectableEntities';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { MultiSelect } from '@/components/ui/multi-select';

export const ALL_BUS = 'all';

// The shared Business Unit filter — one self-contained FilterPanel cell (or, once a Sub-BU exists
// under what's selected, TWO cells: "Business Unit" then a "Sub BU" that appears next to it) so
// every report and master wires it in with a single line, and they all narrow by BU/Sub-BU
// identically.
//
// Screens using this deliberately do NOT follow the navbar's globally-active BU. That switcher
// silently narrowed everything to one BU via the X-Company-Id header, which read as "no data"
// rather than "wrong BU" (a Client Service PO Hours Report showing nothing for a month that
// clearly had hours, because the hours belonged to a different BU). They start on ALL_BUS — the
// widest scope the login can actually be served — and the user narrows here instead. See
// services/apiClient's explicitBuScope, which turns the chosen value into the request's BU scope.
//
// Options and availability both come from hooks/useSelectableBusinessUnits: the BU master for a
// cross-BU login (Admin/Entity Admin/Platform Admin, who have no BU mapping of their own), the
// login's own mapped BUs otherwise. It renders nothing when there are fewer than two BUs to
// choose between — a login with one BU has nothing to narrow, and 'all' already resolves to that
// BU for them.
//
// Cascade behavior (§ BU + Sub BU support): only top-level (Parent) BUs are offered in the
// "Business Unit" control itself. The moment the current selection includes a Parent BU that
// actually HAS Sub-BUs, a second "Sub BU" control appears right beside it, populated with ONLY
// that Parent's (or, in multi-select, the UNION of every selected Parent's) Sub-BUs — never every
// Sub-BU in the tenant. Changing the Business Unit selection recomputes the Sub BU options and
// drops any previously-picked Sub-BU that no longer belongs to a still-selected Parent, so the
// two controls can never end up out of sync. The combined ids (Parent + Sub-BU) are sent back
// through the SAME `value`/`onChange` this component always had — the backend's own
// businessUnitIds contract already narrows to "this BU + its Sub-BUs" or "just these specific
// Sub-BU ids" transparently, so no param-shape change was needed to support this.
const BusinessUnitFilter = ({
  value,
  onChange,
  // Optional — the value of an EntityFilter rendered above this one in the same Filters panel.
  // Narrows the options to that Entity's BUs; leave unset on a page with no EntityFilter.
  entityId,
  label = 'Business Unit',
  // Fluid clamp() sizing (see button.jsx's own comment) instead of a fixed h-9/text-sm.
  className = 'h-[clamp(1.875rem,2vw,2.25rem)] w-full text-[clamp(0.75rem,0.85vw,0.875rem)] bg-white',
  // Pages that restyle their filter labels (e.g. the uppercase micro-labels on Client Wise
  // Analytics) pass the same class here, so this cell's label doesn't read as the odd one out in
  // a row it shares. Omitted everywhere else, which keeps the plain text-xs label.
  labelClassName = 'text-xs',
  // Opt-in, same contract as EntityFilter's own `multiple` — see its comment. Callers that turn
  // this on must resolve the resulting array into per-BU request scoping themselves (this
  // component has no opinion on client-side fan-out vs. a future multi-BU backend param); the
  // existing precedent for that is ServicePOMapping.jsx's `buIds` filter.
  multiple = false,
}) => {
  const { units, canFilter } = useSelectableBusinessUnits(entityId);
  // Different Companies (Entities) can legitimately reuse the same BU name — e.g. two clients
  // each with their own "Software Solutions" team. Disambiguated by appending the owning Entity's
  // name whenever a top-level BU name isn't unique in this list — the underlying `value` was
  // always the real BU id either way. Only top-level (Parent) BUs are counted/disambiguated: a
  // Sub-BU only ever appears in the Sub BU control, already scoped to one Parent at a time, so it
  // needs no extra "(Entity)" suffix of its own.
  const { entities } = useSelectableEntities();
  const entityNameById = useMemo(() => new Map(entities.map((e) => [String(e.id), e.name])), [entities]);
  const roots = useMemo(() => units.filter((u) => u.parentId == null), [units]);
  const buLabel = useMemo(() => {
    const nameCounts = new Map();
    roots.forEach((bu) => nameCounts.set(bu.name, (nameCounts.get(bu.name) ?? 0) + 1));
    return (bu) => {
      if ((nameCounts.get(bu.name) ?? 0) <= 1) return bu.name;
      const entityName = entityNameById.get(String(bu.entityId));
      return entityName ? `${bu.name} (${entityName})` : `${bu.name} (#${bu.id})`;
    };
  }, [roots, entityNameById]);

  const rootIds = useMemo(() => new Set(roots.map((r) => String(r.id))), [roots]);
  const currentIds = (multiple ? (value ?? []) : (value && value !== ALL_BUS ? [value] : [])).map(String);
  const selectedParentIds = currentIds.filter((id) => rootIds.has(id));
  const selectedChildIds = currentIds.filter((id) => !rootIds.has(id));

  // `emit` below deliberately drops a Parent's own id from `value` once one of its Sub-BUs is
  // specifically selected (see its own comment) — otherwise both together would silently re-widen
  // back to the whole Parent server-side. But `value` is the ONLY thing this component gets back,
  // so once that id is gone, deriving "which Parent is selected" from `value` alone would make the
  // Business Unit control visually reset to "All Business Units" and — since subBuOptions was keyed
  // off that same now-empty selectedParentIds — the Sub BU control would vanish entirely, even
  // though a Sub-BU is still actively narrowing (confirmed live: after picking a Sub-BU, "Business
  // Unit" showed unselected and the Sub BU row disappeared, with the filter panel's own count still
  // showing it as one of the active filters). `effectiveParentIds` re-adds each selected child's own
  // Parent back in, purely for what these two controls DISPLAY/OFFER — never sent to `onChange`
  // itself, so the backend still only ever sees the narrower, de-duplicated ids from `emit`.
  const childParentIds = new Set(
    selectedChildIds
      .map((cid) => units.find((u) => String(u.id) === cid)?.parentId)
      .filter((pid) => pid != null)
      .map(String)
  );
  const effectiveParentIds = Array.from(new Set([...selectedParentIds, ...childParentIds]));

  // Union of every currently-selected (or Sub-BU-implied) Parent's own Sub-BUs — never any other
  // Parent's, and never shown at all once no selected Parent has any.
  const subBuOptions = useMemo(
    () => effectiveParentIds.flatMap((pid) => units.filter((u) => String(u.parentId) === pid)),
    // effectiveParentIds is a derived array (new identity every render) — join() gives useMemo a
    // stable primitive to compare so this doesn't recompute (and re-render the Sub BU control)
    // on every keystroke elsewhere in the panel.
    [units, effectiveParentIds.join(',')]
  );
  const showSubBuFilter = subBuOptions.length > 0;

  if (!canFilter) return null;

  const emit = (parentIds, childIds) => {
    if (multiple) {
      // A Parent whose own Sub-BU is now specifically selected must NOT also send its own (wider)
      // id — the backend's businessUnitIds already resolves a Parent id to "itself + every
      // child", so sending both together silently re-widens right back to the whole Parent and
      // the Sub BU filter would look like a no-op (confirmed live: businessUnitIds=23,43 returned
      // the same rows as businessUnitIds=23 alone). Only Parents with NO child currently selected
      // still send their own id, for "all of this Parent, unnarrowed".
      const parentIdsWithChildSelected = new Set(
        childIds
          .map((cid) => units.find((u) => String(u.id) === cid)?.parentId)
          .filter((pid) => pid != null)
          .map(String)
      );
      const scopedParentIds = parentIds.filter((pid) => !parentIdsWithChildSelected.has(pid));
      onChange([...scopedParentIds, ...childIds]);
    } else {
      // Single-select: a specific Sub-BU pick takes precedence over its Parent (the Parent alone
      // is only what gets sent when no Sub-BU has been narrowed to yet).
      onChange(childIds[0] ?? parentIds[0] ?? ALL_BUS);
    }
  };

  const handleParentChange = (nextParentIdsRaw) => {
    const nextParentIds = multiple ? nextParentIdsRaw : (nextParentIdsRaw ? [nextParentIdsRaw] : []);
    // Cascade: drop any Sub-BU selection whose own Parent just got deselected, so the two
    // controls can never disagree about what's actually still narrowed.
    const stillValidChildIds = selectedChildIds.filter((cid) => {
      const child = units.find((u) => String(u.id) === cid);
      return child && nextParentIds.includes(String(child.parentId));
    });
    emit(nextParentIds, stillValidChildIds);
  };

  const handleChildChange = (nextChildIdsRaw) => {
    const nextChildIds = multiple ? nextChildIdsRaw : (nextChildIdsRaw ? [nextChildIdsRaw] : []);
    // `effectiveParentIds`, not the raw (already-deduplicated) `selectedParentIds` — a Parent whose
    // chip is still shown selected (because a child under it was narrowing things) must fall back
    // to "itself, unnarrowed" the moment its last Sub-BU gets cleared, instead of vanishing along
    // with it.
    emit(effectiveParentIds, nextChildIds);
  };

  if (multiple) {
    const parentOptions = roots.map((bu) => ({ label: buLabel(bu), value: String(bu.id) }));
    const childOptions = subBuOptions.map((bu) => ({ label: bu.name, value: String(bu.id) }));
    return (
      <>
        <div className="flex flex-col gap-1.5">
          <Label className={labelClassName}>{label}</Label>
          <MultiSelect
            options={parentOptions}
            value={effectiveParentIds}
            onValueChange={handleParentChange}
            placeholder="All Business Units"
            searchPlaceholder="Search business unit..."
            className={className}
          />
        </div>
        {showSubBuFilter && (
          <div className="flex flex-col gap-1.5">
            <Label className={labelClassName}>Sub BU</Label>
            <MultiSelect
              options={childOptions}
              value={selectedChildIds}
              onValueChange={handleChildChange}
              placeholder="All Sub BUs"
              searchPlaceholder="Search sub BU..."
              className={className}
            />
          </div>
        )}
      </>
    );
  }

  const parentOptions = [{ label: 'All Business Units', value: ALL_BUS }, ...roots.map((bu) => ({ label: buLabel(bu), value: String(bu.id) }))];
  const childOptions = [{ label: 'All Sub BUs', value: ALL_BUS }, ...subBuOptions.map((bu) => ({ label: bu.name, value: String(bu.id) }))];

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label className={labelClassName}>{label}</Label>
        <SearchableSelect
          options={parentOptions}
          value={effectiveParentIds[0] ?? ALL_BUS}
          onValueChange={(v) => v && handleParentChange(v === ALL_BUS ? undefined : v)}
          placeholder="All Business Units"
          searchPlaceholder="Search business unit..."
          showSearch={roots.length > 6}
          className={className}
        />
      </div>
      {showSubBuFilter && (
        <div className="flex flex-col gap-1.5">
          <Label className={labelClassName}>Sub BU</Label>
          <SearchableSelect
            options={childOptions}
            value={selectedChildIds[0] ?? ALL_BUS}
            onValueChange={(v) => v && handleChildChange(v === ALL_BUS ? undefined : v)}
            placeholder="All Sub BUs"
            searchPlaceholder="Search sub BU..."
            showSearch={subBuOptions.length > 6}
            className={className}
          />
        </div>
      )}
    </>
  );
};

export default BusinessUnitFilter;
