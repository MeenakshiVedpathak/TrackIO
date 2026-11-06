import * as React from "react"
import { useIsFetching } from "@tanstack/react-query"

// Rows rendered per batch — a dropdown with hundreds/thousands of options (Service POs, employees)
// only mounts this many up front and appends the next batch as the list scrolls near its bottom,
// instead of mounting every row the moment the popover opens.
export const OPTIONS_PAGE_SIZE = 50

// Only a query's FIRST load (no data yet) counts — a background refetch of data already on screen
// (e.g. the 30s notifications poll) must not flash a spinner on every empty dropdown in the app.
const isInitialLoad = (query) => query.state.data === undefined

// `loading` is the caller's explicit flag. Left undefined (the ~250 existing call sites), it falls
// back to "this dropdown has no options yet while some query is still on its first load" — which is
// exactly the window where its options are still being fetched — so every dropdown gets a loader
// without each caller having to thread its own `isLoading` through.
export function useOptionsLoading(loading, optionCount) {
  const pendingInitialLoads = useIsFetching({ predicate: isInitialLoad })
  if (loading !== undefined) return !!loading
  return optionCount === 0 && pendingInitialLoads > 0
}

// Case-insensitive substring filter + incremental rendering. `getText` returns an option's
// searchable text. The visible window resets whenever the search, the options, or the open state
// change, so reopening a dropdown never starts mid-list with thousands of rows mounted.
export function useLazyOptions(options, { search, open, getText }) {
  const [limit, setLimit] = React.useState(OPTIONS_PAGE_SIZE)

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? options.filter((opt) => getText(opt).toLowerCase().includes(q)) : options
    // getText is an inline callback at the call sites — intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, search])

  React.useEffect(() => {
    setLimit(OPTIONS_PAGE_SIZE)
  }, [search, options, open])

  const visible = React.useMemo(() => filtered.slice(0, limit), [filtered, limit])
  const hasMore = filtered.length > limit

  const onScroll = React.useCallback(
    (e) => {
      const el = e.currentTarget
      if (hasMore && el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
        setLimit((n) => n + OPTIONS_PAGE_SIZE)
      }
    },
    [hasMore]
  )

  return { filtered, visible, hasMore, onScroll }
}
