import { NitroModules } from "react-native-nitro-modules";

import type { Timer as NitroKeepaliveTimerSpec } from "./specs/Timer.nitro";

/**
 * Timer callback handler type - matches standard TimerHandler
 */
export type TimerHandler = (...args: any[]) => void;

/**
 * Leeway constant for automatic power-efficient timing.
 * When used, the native side will automatically adjust leeway based on:
 * - App state (foreground vs background)
 * - Timer interval duration
 */
export const AUTO_LEEWAY = -1;

/**
 * Leeway constant for precise timing (no leeway).
 * Use sparingly as it increases power consumption.
 */
export const PRECISE_LEEWAY = 0;

// Lazy-load the native module
let timer: NitroKeepaliveTimerSpec | null = null;

function getTimer(): NitroKeepaliveTimerSpec {
  if (timer == null) {
    timer = NitroModules.createHybridObject<NitroKeepaliveTimerSpec>("Timer");
  }
  return timer;
}

// ID counter - simple incrementing number
let nextId = 1;

// Callback maps for active timers
const timeoutCallbacks = new Map<number, TimerHandler>();
const intervalCallbacks = new Map<number, TimerHandler>();

/**
 * Options for setTimeout/setInterval
 */
export interface TimerOptions {
  /**
   * Leeway in milliseconds for power efficiency.
   * - Use AUTO_LEEWAY (-1) for automatic leeway based on app state and duration (default)
   * - Use PRECISE_LEEWAY (0) for exact timing (higher power consumption)
   * - Use any positive number for custom leeway in milliseconds
   */
  leeway?: number;
}

/**
 * Schedules a one-shot callback to run after the specified delay.
 * Works in the background unlike standard setTimeout.
 *
 * @param handler - Function to call when the timer fires
 * @param timeout - Delay in milliseconds before the callback is executed (default: 0)
 * @param args - Additional arguments to pass to the handler, or TimerOptions as last arg
 * @returns Timer ID that can be used to cancel the timeout
 *
 * @example
 * // Basic usage (automatic leeway)
 * setTimeout(() => console.log('fired'), 1000)
 *
 * @example
 * // With precise timing
 * setTimeout(() => console.log('fired'), 1000, { leeway: PRECISE_LEEWAY })
 *
 * @example
 * // With custom leeway
 * setTimeout(() => console.log('fired'), 1000, { leeway: 50 })
 */
export function setTimeout(
  handler: TimerHandler,
  timeout?: number,
  ...args: any[]
): number {
  const id = nextId++;

  // Check if last argument is TimerOptions
  let leeway = AUTO_LEEWAY;
  let handlerArgs = args;

  if (args.length > 0) {
    const lastArg = args[args.length - 1];
    if (
      lastArg !== null &&
      typeof lastArg === "object" &&
      "leeway" in lastArg
    ) {
      leeway = (lastArg as TimerOptions).leeway ?? AUTO_LEEWAY;
      handlerArgs = args.slice(0, -1);
    }
  }

  const wrappedCallback: TimerHandler = () => handler(...handlerArgs);
  timeoutCallbacks.set(id, wrappedCallback);

  getTimer().setTimeout(
    id,
    timeout ?? 0,
    (firedId: number) => {
      const cb = timeoutCallbacks.get(firedId);
      timeoutCallbacks.delete(firedId);
      cb?.();
    },
    leeway,
  );

  return id;
}

/**
 * Cancels a previously scheduled timeout.
 * Safe to call with undefined or an invalid ID.
 *
 * @param id - The timer ID returned by setTimeout
 */
export function clearTimeout(id: number | undefined): void {
  if (id === undefined) return;
  timeoutCallbacks.delete(id);
  getTimer().clearTimeout(id);
}

/**
 * Schedules a repeating callback to run at the specified interval.
 * Works in the background unlike standard setInterval.
 *
 * @param handler - Function to call on each interval tick
 * @param interval - Interval in milliseconds between callback invocations (default: 0)
 * @param args - Additional arguments to pass to the handler, or TimerOptions as last arg
 * @returns Interval ID that can be used to cancel the interval
 *
 * @example
 * // Basic usage (automatic leeway)
 * setInterval(() => console.log('tick'), 1000)
 *
 * @example
 * // With precise timing for animations
 * setInterval(() => updateAnimation(), 16, { leeway: PRECISE_LEEWAY })
 *
 * @example
 * // With relaxed timing for background sync
 * setInterval(() => syncData(), 30000, { leeway: 500 })
 */
export function setInterval(
  handler: TimerHandler,
  interval?: number,
  ...args: any[]
): number {
  const id = nextId++;

  // Check if last argument is TimerOptions
  let leeway = AUTO_LEEWAY;
  let handlerArgs = args;

  if (args.length > 0) {
    const lastArg = args[args.length - 1];
    if (
      lastArg !== null &&
      typeof lastArg === "object" &&
      "leeway" in lastArg
    ) {
      leeway = (lastArg as TimerOptions).leeway ?? AUTO_LEEWAY;
      handlerArgs = args.slice(0, -1);
    }
  }

  const wrappedCallback: TimerHandler = () => handler(...handlerArgs);
  intervalCallbacks.set(id, wrappedCallback);

  getTimer().setInterval(
    id,
    interval ?? 0,
    (firedId: number) => {
      const cb = intervalCallbacks.get(firedId);
      cb?.();
    },
    leeway,
  );

  return id;
}

/**
 * Cancels a previously scheduled interval.
 * Safe to call with undefined or an invalid ID.
 *
 * @param id - The interval ID returned by setInterval
 */
export function clearInterval(id: number | undefined): void {
  if (id === undefined) return;
  intervalCallbacks.delete(id);
  getTimer().clearInterval(id);
}

// Re-export types
export type { Timer as NitroKeepaliveTimerSpec } from "./specs/Timer.nitro";
