import { useEffect, useState } from 'react';

// Derives remaining seconds from an absolute epoch-ms timestamp (rather than counting down a
// relative duration) — stays correct across re-renders since it's recomputed from `now` each
// tick, not from whatever value it started at.
export const useCountdownTo = (expiresAt) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const secondsLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
  return { secondsLeft, isExpired: !expiresAt || secondsLeft <= 0 };
};
