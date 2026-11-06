import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

// App-wide "Export data?" confirmation, shown as a small popover right next to the button that
// was clicked (not a centred modal). Every Export / Download button calls
//   const confirmExport = useExportConfirm();
//   onClick={() => confirmExport(handleExport)}
// and the action only runs once the user confirms. One popover instance is shared by the whole
// app (mounted in App.jsx), so pages don't each carry their own open/close state for it.

const ExportConfirmContext = createContext(null);

const DEFAULT_OPTIONS = {
  title: 'Export data?',
  description: 'Current filters will be downloaded',
  confirmLabel: 'Export',
};

// What counts as "the control that was clicked" when locating the popover.
const CONTROL_SELECTOR = 'button, [role="menuitem"], a, [role="button"]';
// A pointer press older than this isn't the one that triggered the current export.
const POINTER_FRESH_MS = 1500;

const rectOf = (el) => {
  if (!el?.getBoundingClientRect) return null;
  const { top, left, width, height } = el.getBoundingClientRect();
  return width || height ? { top, left, width, height } : null;
};

export const ExportConfirmProvider = ({ children }) => {
  const [options, setOptions] = useState(null);
  const [anchorRect, setAnchorRect] = useState(null);
  const actionRef = useRef(null);
  const confirmButtonRef = useRef(null);
  const lastPointerRef = useRef({ rect: null, at: 0 });

  // The hook is called from inside onClick handlers, which don't pass the event through — so the
  // clicked control's position is captured here instead, on pointerdown (capture phase, before any
  // dropdown menu closes and unmounts the item that was pressed).
  useEffect(() => {
    const onPointerDown = (e) => {
      const el = e.target?.closest?.(CONTROL_SELECTOR);
      lastPointerRef.current = { rect: rectOf(el), at: Date.now() };
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  const confirmExport = useCallback((action, opts) => {
    actionRef.current = action;
    const { rect, at } = lastPointerRef.current;
    // Mouse/touch: the pressed control. Keyboard (Enter/Space): the focused control.
    const anchor = (Date.now() - at < POINTER_FRESH_MS && rect)
      || rectOf(document.activeElement?.closest?.(CONTROL_SELECTOR))
      || null;
    // Deferred a tick: many exports are DropdownMenu items, and opening another Radix layer in the
    // same click that closes a DropdownMenu can leave `pointer-events: none` stuck on <body>.
    setTimeout(() => {
      setAnchorRect(anchor);
      setOptions({ ...DEFAULT_OPTIONS, ...opts });
    }, 0);
  }, []);

  const close = () => {
    actionRef.current = null;
    setOptions(null);
  };

  const handleConfirm = () => {
    const action = actionRef.current;
    close();
    action?.();
  };

  // No usable position (e.g. the control was hidden) → fall back to the top-right of the
  // viewport, where page-header Export buttons live anyway.
  const anchorStyle = anchorRect
    ? { top: anchorRect.top, left: anchorRect.left, width: anchorRect.width, height: anchorRect.height }
    : { top: 72, right: 24, width: 1, height: 1 };

  return (
    <ExportConfirmContext.Provider value={confirmExport}>
      {children}
      <Popover open={!!options} onOpenChange={(open) => !open && close()}>
        {/* Invisible box sitting exactly over the clicked control — Radix positions the popover
            against it and flips/shifts it to stay on screen. */}
        <PopoverAnchor asChild>
          <div aria-hidden="true" className="pointer-events-none fixed" style={anchorStyle} />
        </PopoverAnchor>
        <PopoverContent
          side="bottom"
          align="end"
          sideOffset={6}
          role="alertdialog"
          aria-label={options?.title}
          // Radix would focus the first control (Cancel); land on Export so Enter confirms.
          onOpenAutoFocus={(e) => { e.preventDefault(); confirmButtonRef.current?.focus(); }}
          // One compact row (icon · text · buttons) — wide and short, so it sits under a toolbar
          // button without pushing a tall card over the content below.
          className="flex w-auto max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-lg px-2.5 py-2"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Download className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="whitespace-nowrap text-[clamp(0.75rem,0.85vw,0.8125rem)] font-semibold leading-tight">{options?.title}</p>
            <p className="whitespace-nowrap text-[clamp(0.625rem,0.7vw,0.6875rem)] leading-tight text-muted-foreground">{options?.description}</p>
          </div>
          <div className="ml-1 flex shrink-0 items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 px-2.5" onClick={close}>Cancel</Button>
            <Button ref={confirmButtonRef} size="sm" className="h-7 px-2.5" onClick={handleConfirm}>
              {options?.confirmLabel}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </ExportConfirmContext.Provider>
  );
};

// Returns `confirmExport(action, options?)`. `options` may override title / description /
// confirmLabel. Outside the provider (e.g. an isolated test render) it just runs the action.
export const useExportConfirm = () => {
  const confirmExport = useContext(ExportConfirmContext);
  return confirmExport ?? ((action) => action?.());
};
