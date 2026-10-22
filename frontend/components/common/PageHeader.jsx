import { createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

// A layout (e.g. ReportsLayout) can register a "back" destination here so every PageHeader
// rendered beneath it shows an inline back arrow next to its title, without each individual
// page having to pass the prop down. A `backTo` prop on PageHeader overrides it.
const PageHeaderBackContext = createContext(null);

export const PageHeaderBackProvider = PageHeaderBackContext.Provider;

const PageHeader = ({ title, description, actions, backTo, backLabel, className, children }) => {
  const navigate = useNavigate();
  const inherited = useContext(PageHeaderBackContext);
  const backTarget = backTo ?? inherited?.to ?? null;
  const label = backLabel ?? inherited?.label ?? 'Back';

  return (
    <div className={cn('mb-3 flex shrink-0 flex-wrap items-start justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {backTarget && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="-ml-1 shrink-0"
              onClick={() => navigate(backTarget)}
              aria-label={label}
              title={label}
            >
              <ArrowLeft />
            </Button>
          )}
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        </div>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
        {children}
      </div>
      {actions && (
        // No `shrink-0` here: once this block wraps onto its own line under the title on a
        // narrow screen, it must be able to shrink down to that line's available width — every
        // page's own `actions` content is itself a `flex flex-wrap` toolbar, and that inner
        // wrap only ever kicks in once ITS container (this div) is actually constrained to the
        // viewport instead of sitting at its full unwrapped content width. `min-w-0` removes
        // the flex-item's default content-based width floor that would otherwise block it.
        <div className="flex min-w-0 items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
};

export default PageHeader;
