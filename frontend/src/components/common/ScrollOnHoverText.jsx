import { useEffect, useRef, useState } from 'react';
import { cn } from '@/utils/cn';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const PX_PER_SECOND = 45;
const MIN_DURATION = 0.5;
const RESET_DURATION = 0.2;

// Renders text clipped to its container; while `hovered` is true and the text
// overflows, slides it left just far enough to reveal the clipped tail, then
// snaps back once hover ends. No-ops (no motion) when the text already fits.
//
// Touch devices have no real cursor, so `hovered` here (set by the parent's
// `onMouseEnter`) can go true on tap without a matching `onMouseLeave` ever
// following it — nothing on a touchscreen "leaves" the way a mouse does. That
// left the text scrolled all the way over to reveal its tail and stuck there
// permanently (a long label reading as just its last character or two). Gating
// on `(hover: hover) and (pointer: fine)` — true only for an actual mouse —
// keeps this a mouse-only affordance; touch just gets the static clipped text,
// same as before any hover.
const ScrollOnHoverText = ({ text, hovered, className }) => {
  const containerRef = useRef(null);
  const innerRef = useRef(null);
  const [transform, setTransform] = useState('translateX(0)');
  const [duration, setDuration] = useState(RESET_DURATION);
  const supportsHover = useMediaQuery('(hover: hover) and (pointer: fine)');
  const effectiveHovered = hovered && supportsHover;

  useEffect(() => {
    const container = containerRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;

    const overflow = effectiveHovered ? inner.scrollWidth - container.clientWidth : 0;
    if (overflow > 0) {
      setTransform(`translateX(-${overflow}px)`);
      setDuration(Math.max(overflow / PX_PER_SECOND, MIN_DURATION));
    } else {
      setTransform('translateX(0)');
      setDuration(RESET_DURATION);
    }
  }, [effectiveHovered, text]);

  return (
    <span ref={containerRef} className={cn('block w-full min-w-0 overflow-hidden whitespace-nowrap', className)}>
      <span
        ref={innerRef}
        className="inline-block whitespace-nowrap will-change-transform"
        style={{ transform, transition: `transform ${duration}s linear` }}
      >
        {text}
      </span>
    </span>
  );
};

export default ScrollOnHoverText;
