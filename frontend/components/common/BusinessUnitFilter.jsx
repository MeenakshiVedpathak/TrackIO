import { useSelectableBusinessUnits } from '@/hooks/useSelectableBusinessUnits';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';

export const ALL_BUS = 'all';

// The shared Business Unit filter — one self-contained FilterPanel cell (label + select) so
// every report and master wires it in with a single line, and they all narrow by BU identically.
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
const BusinessUnitFilter = ({
  value,
  onChange,
  // Optional — the value of an EntityFilter rendered above this one in the same Filters panel.
  // Narrows the options to that Entity's BUs; leave unset on a page with no EntityFilter.
  entityId,
  label = 'Business Unit',
  className = 'h-9 w-full text-sm bg-white',
  // Pages that restyle their filter labels (e.g. the uppercase micro-labels on Client Wise
  // Analytics) pass the same class here, so this cell's label doesn't read as the odd one out in
  // a row it shares. Omitted everywhere else, which keeps the plain text-xs label.
  labelClassName = 'text-xs',
}) => {
  const { units, canFilter } = useSelectableBusinessUnits(entityId);

  if (!canFilter) return null;

  const options = [
    { label: 'All Business Units', value: ALL_BUS },
    ...units.map((bu) => ({ label: bu.name, value: String(bu.id) })),
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <Label className={labelClassName}>{label}</Label>
      <SearchableSelect
        options={options}
        value={value}
        onValueChange={(v) => v && onChange(v)}
        placeholder="All Business Units"
        searchPlaceholder="Search business unit..."
        showSearch={units.length > 6}
        className={className}
      />
    </div>
  );
};

export default BusinessUnitFilter;
