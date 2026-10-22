import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

// Standard "Filters" button used on every master/report toolbar (see PageHeader `actions`) —
// toggles a sibling FilterPanel's open/closed state and shows a count badge when any filter is
// non-default, so uniformity only needs `activeCount` computed per-page, not the button itself.
// size="toolbar" (h-9) matches the search Input it always sits next to; variant="default" reuses
// the theme's --primary token instead of hardcoding a color, so it stays correct under dark mode.
const FilterToggleButton = ({ isOpen, onToggle, activeCount = 0, label = 'Filters', className }) => (
  <Button
    size="toolbar"
    variant="default"
    className={className}
    onClick={onToggle}
    aria-expanded={isOpen}
  >
    <Filter />
    {label}
    {activeCount > 0 && (
      <span className="flex h-[1.15em] w-[1.15em] items-center justify-center rounded-full bg-primary text-[0.7em] font-semibold text-primary-foreground">
        {activeCount}
      </span>
    )}
  </Button>
);

export default FilterToggleButton;
