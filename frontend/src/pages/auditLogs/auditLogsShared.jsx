import { cn } from '@/utils/cn';

export const formatYMD = (d) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getDefaultDateRange = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return {
    startDate: formatYMD(start),
    endDate: formatYMD(end),
  };
};

// filter-options returns raw action codes, not friendly labels — overridden here for the two
// access-reporting actions so the Action filter reads "Failed login"/"Access denied" instead of
// the literal enum value. Per-row table cells already get their nice label straight from the
// record's own `action_label` field, so this only affects the filter dropdown.
export const ACTION_LABEL_OVERRIDES = {
  LOGIN_FAILED: 'Failed login',
  ACCESS_DENIED: 'Access denied',
};

export const toOptions = (arr, labelOverrides) => {
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => {
    if (typeof item === 'object' && item !== null) {
      const value = String(item.value ?? item.id ?? item.name ?? '');
      return { label: labelOverrides?.[value] ?? item.label ?? item.name ?? value, value };
    }
    const value = String(item);
    return { label: labelOverrides?.[value] ?? value, value };
  });
};

// Colored-pill summary chips — same style the Monthly Utilization / Cross-BU reports use for
// their own stat rows: a tinted rounded pill per metric, label in the tone color, value bold.
export const STAT_TONES = {
  blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  violet: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
  slate: 'bg-slate-500/10 text-slate-700 dark:text-slate-400',
};

export const StatPill = ({ label, value, tone }) => (
  <div className={cn(
    'rounded-md border px-[clamp(0.5rem,0.7vw,0.75rem)] py-[clamp(0.25rem,0.4vw,0.375rem)] text-[clamp(0.6875rem,0.75vw,0.75rem)] whitespace-nowrap',
    STAT_TONES[tone]
  )}>
    {label}&nbsp;
    <span className="font-semibold tabular-nums">{value}</span>
  </div>
);

// Short 8-char form of a UUID-ish session/device id, used identically across the Activity,
// Sessions and Devices tabs — full value is always still available via the `title` attribute.
export const shortId = (id) => (id ? String(id).slice(0, 8) : '—');

export const NewDeviceBadge = ({ text = 'New device' }) => (
  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800 whitespace-nowrap">
    {text}
  </span>
);

// Partitions a BusinessUnitFilter's combined value array back into parent-BU / sub-BU ids, the
// two separate params every one of these endpoints expects (actor_bu_ids / actor_sub_bu_ids).
export const splitBuValues = (values, units) => {
  const parent = [];
  const sub = [];
  values.forEach((id) => {
    const unit = units.find((u) => String(u.id) === String(id));
    if (unit && unit.parentId != null) sub.push(id);
    else parent.push(id);
  });
  return { parentIds: parent, subIds: sub };
};
