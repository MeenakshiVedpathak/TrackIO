import { useEffect, useState } from 'react';

// Used only where CSS alone can't do the job — e.g. gating whether a Radix Sheet/Dialog mounts
// at all, since its portal (overlay, body-scroll lock, focus trap) has real side effects that a
// `md:hidden` class can't suppress even though it hides the content visually. Everywhere else
// (desktop table vs. mobile card markup) stays pure Tailwind breakpoint classes, no hook needed.
export const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
};

// Tailwind's stock `md` breakpoint (768px) — matches the split already used by ReportsLayout's
// mobile tab strip (`md:hidden`), kept consistent across the Reports module's responsive work.
export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
