import { useSelectableEntities } from '@/hooks/useSelectableEntities';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';

export const ALL_ENTITIES = 'all';

// The shared Entity filter — sits directly above BusinessUnitFilter in every Filters panel that
// has one, so picking an Entity first narrows which BUs that filter then offers (pass this
// filter's value through as BusinessUnitFilter's `entityId` prop). Mirrors BusinessUnitFilter's
// own shape and defaults so the two read as one coordinated control, not two different widgets.
//
// Starts on ALL_ENTITIES, same reasoning as BusinessUnitFilter: the widest scope the login can
// actually be served, narrowed here explicitly rather than inherited from anywhere global.
//
// Options and availability both come from hooks/useSelectableEntities. Renders nothing when
// there are fewer than two Entities to choose between — a login mapped to (or scoped to) a single
// Entity has nothing to narrow, so the BU filter beneath it just shows that Entity's BUs directly.
const EntityFilter = ({
  value,
  onChange,
  label = 'Entity',
  className = 'h-9 w-full text-sm bg-white',
  // Mirrors BusinessUnitFilter's own labelClassName escape hatch, for pages that restyle their
  // filter labels — kept in sync so Entity never reads as the odd one out next to Business Unit.
  labelClassName = 'text-xs',
}) => {
  const { entities, canFilter } = useSelectableEntities();

  if (!canFilter) return null;

  const options = [
    { label: 'All Entities', value: ALL_ENTITIES },
    ...entities.map((e) => ({ label: e.name, value: String(e.id) })),
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <Label className={labelClassName}>{label}</Label>
      <SearchableSelect
        options={options}
        value={value}
        onValueChange={(v) => v && onChange(v)}
        placeholder="All Entities"
        searchPlaceholder="Search entity..."
        showSearch={entities.length > 6}
        className={className}
      />
    </div>
  );
};

export default EntityFilter;
