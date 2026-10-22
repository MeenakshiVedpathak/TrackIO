import * as React from "react"
import { ChevronDown, X } from "lucide-react"
import { cn } from "@/utils/cn"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

// options: [{ label, value, depth? }] — `depth` (e.g. 1 for a Sub-BU) indents the row under its
// parent. value: array of selected values (as strings).
// lockedValues: values that are always selected and can't be toggled off or cleared — the
// checkbox renders checked-but-disabled for these (e.g. a role every record must carry).
export function MultiSelect({
  options = [],
  value = [],
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search...",
  emptyMessage = "No option found.",
  disabled = false,
  lockedValues = [],
  className,
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  // Parents (depth 0 followed by depth > 0 rows) start collapsed; this tracks the expanded ones.
  const [expanded, setExpanded] = React.useState(() => new Set())

  // Each row's parent value (the nearest preceding depth-0 option), and which parents have children.
  const { parentOf, parentsWithChildren } = React.useMemo(() => {
    const parentOf = new Map()
    const parentsWithChildren = new Set()
    let currentParent = null
    options.forEach((opt) => {
      if (!opt.depth) {
        currentParent = String(opt.value)
      } else if (currentParent != null) {
        parentOf.set(String(opt.value), currentParent)
        parentsWithChildren.add(currentParent)
      }
    })
    return { parentOf, parentsWithChildren }
  }, [options])

  const toggleExpanded = (key) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  // While searching, show every row so a match inside a collapsed parent is still findable.
  const visibleOptions = React.useMemo(
    () => (search.trim()
      ? options
      : options.filter((opt) => !opt.depth || expanded.has(parentOf.get(String(opt.value))))),
    [options, expanded, parentOf, search]
  )

  const locked = React.useMemo(() => new Set(lockedValues.map(String)), [lockedValues])
  const selected = React.useMemo(() => new Set(value.map(String)), [value])

  const selectedLabels = React.useMemo(
    () => options.filter((opt) => selected.has(String(opt.value))).map((opt) => opt.label),
    [options, selected]
  )

  // Options that match the current search string — used by Select all / Clear all so they
  // only act on what's currently visible rather than the full unfiltered list.
  const filteredForActions = React.useMemo(
    () => search.trim()
      ? options.filter((opt) => opt.label.toLowerCase().includes(search.trim().toLowerCase()))
      : options,
    [options, search]
  )

  const allSelected = filteredForActions.length > 0 && filteredForActions.every((opt) => selected.has(String(opt.value)))
  const clearableCount = [...selected].filter((v) => !locked.has(v)).length

  const toggle = (optValue) => {
    const key = String(optValue)
    if (locked.has(key)) return
    const next = selected.has(key)
      ? value.filter((v) => String(v) !== key)
      : [...value, key]
    onValueChange(next)
  }

  const selectAll = () => {
    if (search.trim()) {
      // Merge matching items into the existing selection (don't wipe unrelated selections).
      const toAdd = filteredForActions.map((opt) => String(opt.value))
      const merged = Array.from(new Set([...value.map(String), ...toAdd]))
      onValueChange(merged)
    } else {
      onValueChange(options.map((opt) => String(opt.value)))
    }
  }

  const clearAll = () => {
    if (search.trim()) {
      // Only deselect matching items; keep everything outside the current search.
      const filteredValues = new Set(filteredForActions.map((opt) => String(opt.value)))
      onValueChange(value.filter((v) => !filteredValues.has(String(v)) || locked.has(String(v))))
    } else {
      onValueChange([...locked])
    }
  }

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              // Fluid clamp() sizing (see button.jsx's own comment) instead of a fixed h-9/text-sm.
              "w-full justify-between h-[clamp(1.875rem,2vw,2.25rem)] text-[clamp(0.75rem,0.85vw,0.875rem)] font-normal",
              selectedLabels.length === 0 && "text-muted-foreground",
              selectedLabels.length > 0 && "pr-8",
              className
            )}
          >
            <span className="flex-1 truncate text-left">
              {selectedLabels.length === 0
                ? placeholder
                : selectedLabels.length === 1
                ? selectedLabels[0]
                : `${selectedLabels.length} selected`}
            </span>
            <ChevronDown className="h-[1em] w-[1em] shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="min-w-[var(--radix-popover-trigger-width)] w-max max-w-xs p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
            <div className="flex items-center justify-between border-b px-2 py-1.5">
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
                disabled={allSelected}
                onClick={selectAll}
              >
                Select all
              </button>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
                disabled={clearableCount === 0}
                onClick={clearAll}
              >
                Clear all
              </button>
            </div>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandList>
              <CommandGroup>
                {visibleOptions.map((option) => {
                  const isSelected = selected.has(String(option.value))
                  const hasChildren = parentsWithChildren.has(String(option.value))
                  const isLocked = locked.has(String(option.value))
                  return (
                    <CommandItem
                      key={option.value}
                      value={String(option.label)}
                      onSelect={() => toggle(option.value)}
                      disabled={isLocked}
                      className="gap-2"
                    >
                      {/* Fixed-width slot on every row (when the list has any hierarchy) so all
                          checkboxes stay in one vertical line; only parents render a chevron. */}
                      {parentsWithChildren.size > 0 && (
                        <span className="-ml-1 flex h-5 w-5 shrink-0 items-center justify-center">
                          {hasChildren && (
                            <button
                              type="button"
                              aria-label={expanded.has(String(option.value)) ? "Collapse" : "Expand"}
                              className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleExpanded(String(option.value)) }}
                            >
                              <ChevronDown
                                className={cn("h-3.5 w-3.5 transition-transform", !expanded.has(String(option.value)) && "-rotate-90")}
                              />
                            </button>
                          )}
                        </span>
                      )}
                      <Checkbox checked={isSelected} disabled={isLocked} className="pointer-events-none" />
                      <span className="truncate" title={option.label}>
                        {option.depth ? <span className="mr-1 text-muted-foreground">↳</span> : null}
                        {option.label}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Rendered as a sibling (not nested in the trigger button) so its click
          never bubbles into the Popover trigger and re-toggles/eats the event. */}
      {clearableCount > 0 && !disabled && (
        <button
          type="button"
          aria-label="Clear selection"
          className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground opacity-60 hover:opacity-100 hover:bg-muted"
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); clearAll() }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
