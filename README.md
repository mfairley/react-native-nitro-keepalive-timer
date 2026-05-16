# ⏰ react-native-nitro-keepalive-timer

**🔒 Keep your call alive when the phone locks.**

Drop-in `setTimeout` / `setInterval` for React Native that keep firing when the screen is off — built for LiveKit calls, WebRTC, audio sessions, and any long-lived connection that needs a heartbeat. Powered by [Nitro Modules](https://github.com/mrousavy/nitro).

<p>
  <a href="https://www.npmjs.com/package/react-native-nitro-keepalive-timer"><img alt="npm version" src="https://img.shields.io/npm/v/react-native-nitro-keepalive-timer.svg"></a>
  <a href="https://www.npmjs.com/package/react-native-nitro-keepalive-timer"><img alt="npm downloads" src="https://img.shields.io/npm/dm/react-native-nitro-keepalive-timer.svg"></a>
  <img alt="platform" src="https://img.shields.io/badge/platform-iOS%20%7C%20Android-blue">
  <img alt="license" src="https://img.shields.io/npm/l/react-native-nitro-keepalive-timer">
</p>

---

## 🐛 The problem

When a React Native user locks the screen during a call, JavaScript timers stop firing. LiveKit's `CriticalTimers` — used internally for keepalive pings, reconnect backoff, and ICE stats — silently freezes. Within seconds the connection drops, the call ends, and the user is staring at a dead app when they unlock.

This library replaces those timers with native ones. Schedules sit on `DispatchSourceTimer` (iOS) and a single-thread priority queue (Android), held alive by a short-lived background task so the OS lets them keep ticking through screen lock.

## 🎯 When you need this

- 📞 **LiveKit / WebRTC calls** — keep keepalives, reconnect timers, and stats polling alive while the phone is locked.
- 🎧 **Audio sessions** — drive playback heartbeats and resync ticks that JS timers can't deliver in the background.
- 🔌 **Long-lived WebSockets** — heartbeat your own protocol without dropping the connection.
- 📤 **Periodic flushes** — analytics, telemetry, queue drains that need to run through brief backgrounding.

## 📦 Install

```sh
bun install react-native-nitro-keepalive-timer react-native-nitro-modules
```

## 🚀 Quick start

```ts
import {
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
} from 'react-native-nitro-keepalive-timer'

// Drop-in for the global setTimeout / setInterval
const id = setTimeout(() => console.log('fired'), 1000)
clearTimeout(id)

const tick = setInterval(() => console.log('tick'), 500)
clearInterval(tick)
```

That's it. The signatures match `globalThis.setTimeout` / `setInterval` exactly — no namespace, no scheduler object, no migration.

---

## 📞 Keeping a LiveKit call alive on a locked phone

This is the primary use case. LiveKit's client library schedules every keepalive, reconnect, and stats poll against `CriticalTimers`, which defaults to the JS globals. On React Native that means: **as soon as the screen locks, the connection starts dying.**

Point `CriticalTimers` at the Nitro timers during startup and the call keeps running:

```ts
import { CriticalTimers } from 'livekit-client'
import {
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
} from 'react-native-nitro-keepalive-timer'

// Nitro returns numeric ids; LiveKit's types expect Node's `Timeout`.
// The runtime contract (pass the id back to clear*) is identical, so cast.
CriticalTimers.setTimeout = setTimeout as any
CriticalTimers.clearTimeout = clearTimeout as any
CriticalTimers.setInterval = setInterval as any
CriticalTimers.clearInterval = clearInterval as any
```

Do this **once, at startup, before any `Room` is connected** — typically alongside `registerGlobals` from `@livekit/react-native`.

## 🌐 Replacing the globals everywhere

If you want every `setTimeout` / `setInterval` in your app to be background-safe (not just LiveKit's), install the module's exports at startup:

```ts
import {
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
} from 'react-native-nitro-keepalive-timer'

// @ts-expect-error overriding the JS globals
globalThis.setTimeout = setTimeout
// @ts-expect-error
globalThis.clearTimeout = clearTimeout
// @ts-expect-error
globalThis.setInterval = setInterval
// @ts-expect-error
globalThis.clearInterval = clearInterval
```

## 🔋 Leeway — trading precision for battery

Pass a `TimerOptions` object as the last argument to tune timing precision:

```ts
import {
  setInterval,
  AUTO_LEEWAY,
  PRECISE_LEEWAY,
} from 'react-native-nitro-keepalive-timer'

// Precise — higher power cost. Use for animations or A/V sync.
setInterval(updateFrame, 16, { leeway: PRECISE_LEEWAY })

// Custom — 500ms slop for relaxed background sync.
setInterval(syncData, 30_000, { leeway: 500 })

// Default — automatic, scales with interval and app state.
setInterval(poll, 5_000, { leeway: AUTO_LEEWAY })
```

**Auto leeway** picks a base value from the cadence (1ms for sub-100ms timers up to 100ms for 30s+ timers), doubles it while backgrounded, and caps at 10% of the interval. For keepalives this is almost always what you want.

## 📚 API

| Function | Description |
| --- | --- |
| `setTimeout(handler, delayMs?, ...args)` | One-shot timer. Returns a numeric id. Final arg may be `{ leeway }`. |
| `clearTimeout(id)` | Cancel a scheduled timeout. Safe to call with `undefined`. |
| `setInterval(handler, intervalMs?, ...args)` | Repeating timer. Returns a numeric id. Final arg may be `{ leeway }`. |
| `clearInterval(id)` | Cancel a running interval. Safe to call with `undefined`. |
| `AUTO_LEEWAY` (`-1`) | Sentinel for automatic leeway (the default). |
| `PRECISE_LEEWAY` (`0`) | Sentinel for zero leeway. |

## ⚙️ How it works

### 🍎 iOS

- Each timer is a `DispatchSourceTimer` on a serial `userInitiated` queue — no thread per timer, no JS-bridge work in the hot path.
- While any timer is live, a `UIApplication.beginBackgroundTask` is held
- Callbacks hop to the main thread before invoking JS.

### 🤖 Android

- A single daemon `NitroKeepaliveTimerScheduler` thread services a priority queue keyed by absolute deadline (drift-safe for intervals).
- Near-deadline timers are coalesced within the computed leeway window — multiple sub-second timers fire together rather than waking the CPU repeatedly.
- Foreground / background state is tracked via `ActivityLifecycleCallbacks`, feeding the leeway policy automatically.
