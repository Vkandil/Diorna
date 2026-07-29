import { useSyncExternalStore } from "react";

let currentTime = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function tick() {
  currentTime = Date.now();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    tick();
    timer = setInterval(tick, 1_000);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

function subscribeWhileStopped() {
  return () => undefined;
}

function snapshot() {
  return currentTime;
}

/**
 * A single clock shared by every Focus surface. This prevents the main timer,
 * sidebar mini-player and future widgets from drifting by one refresh interval.
 */
export function useFocusClock(running: boolean): number {
  return useSyncExternalStore(running ? subscribe : subscribeWhileStopped, snapshot, snapshot);
}
