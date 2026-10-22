import { useEffect, useRef, useState } from 'react';

// Fires once, the first time the returned ref's element enters the viewport, then disconnects —
// used to defer a below-the-fold section's data fetch (e.g. PmDashboard's Project Overview
// table) until it's actually about to be seen, so it never competes with above-the-fold
// queries (KPI row / Action Required) for the first paint. Once `true`, stays `true` — a table
// that's been loaded shouldn't unmount/refetch just because the user scrolled back up past it.
export const useInViewOnce = (rootMargin = '200px') => {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (inView || !ref.current) return undefined;
    const el = ref.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);

  return [ref, inView];
};

export default useInViewOnce;
