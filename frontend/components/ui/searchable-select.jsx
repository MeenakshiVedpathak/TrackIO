import * as React from "react"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { cn } from "@/utils/cn"
import { Button } from "@/components/ui/button"
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

export function SearchableSelect({
  options = [],
  value,
  onValueChange,
  placeholder = "Select an option",
  searchPlaceholder = "Search...",
  emptyMessage = "No option found.",
  disabled = false,
  showSearch,
  className,
  // Opt-in: shows an inline "X" that resets to `clearValue` instead of an "All ..."/"Any ..."
  // row baked into `options` — a caller that already treats one of its own option values as the
  // "no filter" sentinel (e.g. 'all') passes that as `clearValue` so the button round-trips to it.
  clearable = false,
  clearValue = "",
}) {
  const [open, setOpen] = React.useState(false)

  const shouldShowSearch = showSearch !== undefined ? showSearch : true;

  const selectedOption = React.useMemo(
    () => options.find((opt) => String(opt.value) === String(value)),
    [options, value]
  )

  const showClear = clearable && !disabled && value != null && String(value) !== String(clearValue)

  return (
    // `relative` wrapper so the clear button can sit visually inside the trigger without being a
    // second <button> nested inside the trigger's own <button> (invalid HTML / broken click
    // handling) — it's a sibling, absolutely positioned over the trigger's right edge instead.
    <div className="relative w-full">
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full min-w-0 justify-between h-9 text-sm font-normal",
              !value && "text-muted-foreground",
              showClear && "pr-8",
              className
            )}
          >
            <span className="truncate min-w-0">{selectedOption ? selectedOption.label : placeholder}</span>
            {/* The clear "X" (rendered below, absolutely positioned) takes over this slot once a
                value is selected — showing both at once crowded them into an unreadable overlap. */}
            {!showClear && <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            {shouldShowSearch && <CommandInput placeholder={searchPlaceholder} />}
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandList>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.searchValue ?? String(option.label)}
                    onSelect={() => {
                      onValueChange(String(option.value))
                      setOpen(false)
                    }}
                  >
                    {option.label}
                    <Check
                      className={cn(
                        "ml-auto mr-2 h-4 w-4",
                        String(value) === String(option.value) ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {showClear && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onValueChange(clearValue)
          }}
          aria-label="Clear selection"
          title="Clear selection"
          className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
