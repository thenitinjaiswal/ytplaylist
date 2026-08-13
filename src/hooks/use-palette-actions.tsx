import { useEffect, useSyncExternalStore } from "react";
import type { PaletteAction } from "@/components/command-palette";

let current: PaletteAction[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => current;

/** Actions contributed by the current screen, read by the command palette. */
export function usePaletteActions(): PaletteAction[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Registers screen-scoped palette actions. Pass a memoized array. */
export function useRegisterPaletteActions(actions: PaletteAction[]) {
  useEffect(() => {
    current = actions;
    emit();
    return () => {
      current = [];
      emit();
    };
  }, [actions]);
}
