import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { setDirty, clearDirty } from '@/store/slices/navigationGuardSlice';

// Registers this page's unsaved-changes state globally so any in-app navigation
// trigger (Sidebar links, etc.) can prompt before discarding it. Always clears
// on unmount so a page that leaves cleanly never leaves a stale guard behind.
export function useUnsavedChangesGuard(isDirty, message) {
  const dispatch = useDispatch();

  useEffect(() => {
    if (isDirty) dispatch(setDirty(message));
    else dispatch(clearDirty());

    return () => dispatch(clearDirty());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, message]);
}

export default useUnsavedChangesGuard;
