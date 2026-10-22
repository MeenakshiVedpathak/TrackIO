import '@testing-library/jest-dom/vitest';

// jsdom implements neither of these, and Radix's Popover (used by DatePicker/DateRangePicker/
// WeekPicker) relies on both for its floating-ui positioning and pointer-capture based dismiss
// handling — without them, opening a popover in a test hangs until the surrounding `it()` times
// out rather than throwing a clear error.
if (typeof window !== 'undefined') {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  // jsdom has no native requestAnimationFrame — Radix's floating-ui positioning falls back to
  // scheduling itself some other way without it, which manifests as a multi-second-to-minute hang
  // (not a clean error) the first time a Popover/Select/Tooltip actually opens in a test.
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    window.cancelAnimationFrame = (id) => clearTimeout(id);
  }
}
