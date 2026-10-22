import * as React from "react"
import { ChevronsUpDown, X } from "lucide-react"
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

// options: [{ label, value }]. value: array of selected values (as strings).
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

  const locked = React.useMemo(() => new Set(lockedValues.map(String)), [lockedValues])
  const selected = React.useMemo(() => new Set(value.map(String)), [value])

  const selectedLabels = React.useMemo(
    () => options.filter((opt) => selected.has(String(opt.value))).map((opt) => opt.label),
    [options, selected]
  )

  const allSelected = options.length > 0 && selected.size === options.length
  const clearableCount = [...selected].filter((v) => !locked.has(v)).length

  const toggle = (optValue) => {
    const key = String(optValue)
    if (locked.has(key)) return
    const next = selected.has(key)
      ? value.filter((v) => String(v) !== key)
      : [...value, key]
    onValueChange(next)
  }

  const selectAll = () => onValueChange(options.map((opt) => String(opt.value)))
  const clearAll = () => onValueChange([...locked])

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
              "w-full justify-between h-9 text-sm font-normal",
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
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
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
                {options.map((option) => {
                  const isSelected = selected.has(String(option.value))
                  const isLocked = locked.has(String(option.value))
                  return (
                    <CommandItem
                      key={option.value}
                      value={String(option.label)}
                      onSelect={() => toggle(option.value)}
                      disabled={isLocked}
                      className="gap-2"
                    >
                      <Checkbox checked={isSelected} disabled={isLocked} className="pointer-events-none" />
                      <span className="truncate">{option.label}</span>
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
