import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/cn';

// Shared toolbar search box — same icon size/position, height and radius everywhere it's used
// (PageHeader `actions`, or DataTable's `toolbar` slot). `className` sizes the wrapper, e.g.
// `w-64` or `flex-1` for a page that wants it to grow; the input itself always fills it.
// Fluid clamp() sizing (see ui/button.jsx's own comment) instead of a fixed h-4/text-sm, so this
// shrinks smoothly with the viewport like every other filter/toolbar control now does.
const SearchInput = ({ value, onChange, placeholder = 'Search…', className, inputClassName }) => (
  <div className={cn('relative w-full sm:w-64', className)}>
    <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-[clamp(0.875rem,1vw,1rem)] w-[clamp(0.875rem,1vw,1rem)] text-muted-foreground" />
    <Input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={cn('w-full pl-9', inputClassName)}
    />
  </div>
);

export default SearchInput;
