import { useEffect, useSyncExternalStore } from "react";
let current = [];
const listeners = new Set();
function emit() {
  for (const listener of listeners) listener();
}
function subscribe(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const snapshot = () => current;
/** Actions contributed by the current screen, read by the command palette. */
export function usePaletteActions() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
/** Registers screen-scoped palette actions. Pass a memoized array. */
export function useRegisterPaletteActions(actions) {
  useEffect(() => {
    current = actions;
    emit();
    return () => {
      current = [];
      emit();
    };
  }, [actions]);
}
