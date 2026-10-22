import { X } from 'lucide-react';

// Shared "N selected · Clear" bar shown between the filter row and the table whenever a page
// tracks row selection (bulk reminders, bulk actions, etc.) — previously re-implemented per page.
const SelectionBar = ({ count, noun = 'item', onClear }) => (
  <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2 text-sm">
    <span className="font-medium text-primary">
      {count} {noun}{count !== 1 ? 's' : ''} selected
    </span>
    <button
      type="button"
      onClick={onClear}
      className="ml-auto flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
    >
      <X className="h-3.5 w-3.5" />Clear selection
    </button>
  </div>
);

export default SelectionBar;
