import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/utils/cn';

// Shared toolbar search box — same icon size/position, height and radius everywhere it's used
// (PageHeader `actions`, or DataTable's `toolbar` slot). `className` sizes the wrapper, e.g.
// `w-64` or `flex-1` for a page that wants it to grow; the input itself always fills it.
const SearchInput = ({ value, onChange, placeholder = 'Search…', className, inputClassName }) => (
  <div className={cn('relative w-full sm:w-64', className)}>
    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
    <Input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={cn('w-full pl-9 text-sm', inputClassName)}
    />
  </div>
);

export default SearchInput;
