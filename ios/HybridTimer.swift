//
//  HybridTimer.swift
//  NitroKeepaliveTimer
//
//  High-performance background timer implementation using DispatchSourceTimer.
//
//  Features smart power management:
//  - Automatically adjusts timer leeway based on app state (foreground/background)
//  - Scales leeway with interval duration for optimal power efficiency
//  - Allows manual leeway override for precise control
//

import Foundation
import NitroModules
import UIKit

/// Sentinel value indicating automatic leeway calculation
private let AUTO_LEEWAY: Double = -1

/// Encapsulates a DispatchSourceTimer with its callback
private final class TimerEntry {
  let timer: DispatchSourceTimer
  let callback: (Double) -> Void
  let isRepeating: Bool
  /// Wall-clock fire time, used to detect missed one-shot timers after the
  /// app resumes from suspension. Only meaningful for `isRepeating == false`.
  let fireAt: Date
  /// Set true the first time the callback runs to make resume-time replay
  /// safe against the DispatchSource also delivering the missed event.
  /// Accessed only on the timerQueue.
  var hasFired: Bool = false

  init(
    timer: DispatchSourceTimer,
    callback: @escaping (Double) -> Void,
    isRepeating: Bool,
    fireAt: Date
  ) {
    self.timer = timer
    self.callback = callback
    self.isRepeating = isRepeating
    self.fireAt = fireAt
  }

  deinit {
    timer.cancel()
  }
}

/// A highly efficient background timer implementation using DispatchSourceTimer.
class HybridTimer: HybridTimerSpec {

  // MARK: - Properties

  /// Serial queue for all timer operations - ensures thread safety without explicit locks
  private let timerQueue = DispatchQueue(label: "com.nitro.timer", qos: .userInitiated)

  /// Active timers indexed by ID
  private var timers: [Double: TimerEntry] = [:]

  /// Shared background task identifier
  private var backgroundTaskId: UIBackgroundTaskIdentifier = .invalid

  /// Count of active timers (used for background task management)
  private var activeTimerCount: Int = 0

  /// Tracks whether the app is currently in the background
  private var isInBackground: Bool = false

  /// Notification observers for app state changes
  private var backgroundObserver: NSObjectProtocol?
  private var foregroundObserver: NSObjectProtocol?

  // MARK: - Initialization

  override init() {
    super.init()
    setupAppStateObservers()
  }

  deinit {
    if let observer = backgroundObserver {
      NotificationCenter.default.removeObserver(observer)
    }
    if let observer = foregroundObserver {
      NotificationCenter.default.removeObserver(observer)
    }
  }

  /// Sets up observers for app state changes to adjust leeway dynamically
  private func setupAppStateObservers() {
    backgroundObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.didEnterBackgroundNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.timerQueue.async {
        self?.isInBackground = true
      }
    }

    foregroundObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.willEnterForegroundNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.timerQueue.async {
        self?.isInBackground = false
        // Realign one-shot timers against wall-clock. DispatchSourceTimer
        // uses the monotonic clock, which pauses while the device sleeps,
        // so a 60s timer started before a 30s lock would otherwise still
        // wait 60s of awake-time. Past-deadline timers fire immediately;
        // future-deadline timers get rescheduled for the wall-clock
        // remainder. `hasFired` guards against double-firing if the
        // DispatchSource also delivers the missed event on resume.
        self?.realignOneShotTimersAfterResume()
      }
    }

    // Check initial state
    DispatchQueue.main.async { [weak self] in
      let initialState = UIApplication.shared.applicationState == .background
      self?.timerQueue.async {
        self?.isInBackground = initialState
      }
    }
  }

  // MARK: - Smart Leeway Calculation

  /// Calculates the optimal leeway for a timer based on multiple factors.
  ///
  /// Strategy:
  /// 1. If user specified a leeway (>= 0), use that exactly
  /// 2. Otherwise, calculate based on:
  ///    - Interval duration (shorter = tighter, longer = more relaxed)
  ///    - App state (background = more relaxed for power savings)
  ///
  /// - Parameters:
  ///   - intervalMs: The timer interval in milliseconds
  ///   - userLeeway: User-specified leeway, or AUTO_LEEWAY (-1) for automatic
  /// - Returns: The leeway as a DispatchTimeInterval
  private func calculateLeeway(intervalMs: Double, userLeeway: Double) -> DispatchTimeInterval {
    // If user specified a leeway, use it directly
    if userLeeway >= 0 {
      return .milliseconds(Int(userLeeway))
    }

    // Calculate base leeway based on interval duration
    // Shorter intervals need tighter timing, longer intervals can be more relaxed
    let baseLeeway: Double
    switch intervalMs {
    case ..<100:
      // Animation-like timers: very tight (1ms)
      baseLeeway = 1
    case ..<500:
      // Fast UI updates: tight (5ms)
      baseLeeway = 5
    case ..<1000:
      // Standard UI timers: moderate (10ms)
      baseLeeway = 10
    case ..<5000:
      // Short delays: relaxed (25ms)
      baseLeeway = 25
    case ..<30000:
      // Medium delays: more relaxed (50ms)
      baseLeeway = 50
    default:
      // Long delays (30s+): very relaxed (100ms)
      baseLeeway = 100
    }

    // Apply background multiplier for power savings
    // In background, we can be more relaxed since the user isn't watching
    let multiplier: Double = isInBackground ? 2.0 : 1.0

    // Calculate final leeway, capped at 10% of interval for sanity
    let maxLeeway = intervalMs * 0.1
    let finalLeeway = min(baseLeeway * multiplier, maxLeeway)

    return .milliseconds(Int(max(1, finalLeeway)))
  }

  // MARK: - HybridObject

  var memorySize: Int {
    // Approximate memory: dictionary overhead + timer entries
    return timers.count * MemoryLayout<TimerEntry>.size + 64
  }

  // MARK: - setTimeout / clearTimeout

  func setTimeout(
    id: Double, delayMs: Double, callback: @escaping (Double) -> Void, leewayMs: Double
  ) throws {
    let delayNanoseconds = UInt64(delayMs * 1_000_000)

    timerQueue.async { [weak self] in
      guard let self = self else { return }

      // Cancel any existing timer with this ID
      self.cancelTimer(id: id)

      // Create a new DispatchSourceTimer
      let timer = DispatchSource.makeTimerSource(queue: self.timerQueue)

      // Calculate leeway
      let leeway = self.calculateLeeway(intervalMs: delayMs, userLeeway: leewayMs)

      // Schedule as one-shot with leeway
      let fireAt = Date().addingTimeInterval(delayMs / 1000.0)
      timer.schedule(
        deadline: .now() + .nanoseconds(Int(delayNanoseconds)),
        leeway: leeway
      )

      // Store the entry
      let entry = TimerEntry(
        timer: timer, callback: callback, isRepeating: false, fireAt: fireAt)
      self.timers[id] = entry

      // Set up event handler
      timer.setEventHandler { [weak self, weak entry] in
        guard let self = self, let entry = entry else { return }
        // Guard against the foreground-resume sweep having already fired
        // this timer.
        guard !entry.hasFired else { return }
        entry.hasFired = true

        // Remove from active timers
        self.timers.removeValue(forKey: id)
        self.decrementTimerCount()

        // Dispatch callback to main thread
        DispatchQueue.main.async {
          entry.callback(id)
        }
      }

      // Increment counter and start
      self.incrementTimerCount()
      timer.resume()
    }
  }

  func clearTimeout(id: Double) throws {
    timerQueue.async { [weak self] in
      self?.cancelTimer(id: id)
    }
  }

  // MARK: - setInterval / clearInterval

  func setInterval(
    id: Double, intervalMs: Double, callback: @escaping (Double) -> Void, leewayMs: Double
  ) throws {
    let intervalNanoseconds = UInt64(intervalMs * 1_000_000)

    timerQueue.async { [weak self] in
      guard let self = self else { return }

      // Cancel any existing timer with this ID
      self.cancelTimer(id: id)

      // Create a new DispatchSourceTimer
      let timer = DispatchSource.makeTimerSource(queue: self.timerQueue)

      // Calculate leeway
      let leeway = self.calculateLeeway(intervalMs: intervalMs, userLeeway: leewayMs)

      // Schedule as repeating with calculated leeway
      timer.schedule(
        deadline: .now() + .nanoseconds(Int(intervalNanoseconds)),
        repeating: .nanoseconds(Int(intervalNanoseconds)),
        leeway: leeway
      )

      // Store the entry. `fireAt` is unused for repeating timers — the
      // DispatchSource handles re-arming and resume-time delivery on its own.
      let entry = TimerEntry(
        timer: timer, callback: callback, isRepeating: true, fireAt: Date.distantFuture)
      self.timers[id] = entry

      // Set up event handler
      timer.setEventHandler { [weak entry] in
        guard let entry = entry else { return }

        // Dispatch callback to main thread
        DispatchQueue.main.async {
          entry.callback(id)
        }
      }

      // Increment counter and start
      self.incrementTimerCount()
      timer.resume()
    }
  }

  func clearInterval(id: Double) throws {
    timerQueue.async { [weak self] in
      self?.cancelTimer(id: id)
    }
  }

  // MARK: - Private Helpers

  /// Cancels a timer by ID. Must be called on timerQueue.
  private func cancelTimer(id: Double) {
    guard let entry = timers.removeValue(forKey: id) else { return }
    entry.timer.cancel()
    decrementTimerCount()
  }

  /// Reconciles one-shot timers against wall-clock time after the app
  /// resumes from a background suspension. For each pending entry:
  ///   - if its deadline elapsed during suspension, fire and remove it,
  ///   - if its deadline is still in the future, cancel the old
  ///     DispatchSource and reschedule a fresh one for the wall-clock
  ///     remainder (DispatchSource deadlines run on the monotonic clock
  ///     and would otherwise wait out the full awake-time interval).
  /// Must be called on timerQueue.
  private func realignOneShotTimersAfterResume() {
    let now = Date()
    // Snapshot so we can mutate the map while iterating.
    let snapshot = Array(timers)
    for (id, entry) in snapshot {
      guard !entry.isRepeating, !entry.hasFired else { continue }
      let remainingSeconds = entry.fireAt.timeIntervalSince(now)
      if remainingSeconds <= 0 {
        entry.hasFired = true
        timers.removeValue(forKey: id)
        entry.timer.cancel()
        decrementTimerCount()
        DispatchQueue.main.async {
          entry.callback(id)
        }
      } else {
        rescheduleOneShot(id: id, entry: entry, remainingSeconds: remainingSeconds)
      }
    }
  }

  /// Cancels `entry`'s underlying DispatchSource and replaces the map slot
  /// with a fresh entry scheduled for `remainingSeconds` from now (wall
  /// clock). Preserves the original `fireAt` so a second resume cycle
  /// still computes the correct remainder. Must be called on timerQueue.
  private func rescheduleOneShot(id: Double, entry: TimerEntry, remainingSeconds: Double) {
    entry.timer.cancel()

    let remainingMs = remainingSeconds * 1000
    let remainingNanoseconds = UInt64(remainingMs * 1_000_000)
    let newTimer = DispatchSource.makeTimerSource(queue: timerQueue)
    newTimer.schedule(
      deadline: .now() + .nanoseconds(Int(remainingNanoseconds)),
      leeway: calculateLeeway(intervalMs: remainingMs, userLeeway: AUTO_LEEWAY)
    )

    let newEntry = TimerEntry(
      timer: newTimer, callback: entry.callback, isRepeating: false, fireAt: entry.fireAt)
    timers[id] = newEntry

    newTimer.setEventHandler { [weak self, weak newEntry] in
      guard let self = self, let newEntry = newEntry else { return }
      guard !newEntry.hasFired else { return }
      newEntry.hasFired = true

      self.timers.removeValue(forKey: id)
      self.decrementTimerCount()
      DispatchQueue.main.async {
        newEntry.callback(id)
      }
    }
    newTimer.resume()
  }

  /// Cancels all active timers. Must be called on timerQueue.
  private func cancelAllTimers() {
    for (_, entry) in timers {
      entry.timer.cancel()
    }
    timers.removeAll()
    activeTimerCount = 0
    endBackgroundTaskIfNeeded()
  }

  /// Increments the active timer count and starts background task if needed.
  /// Must be called on timerQueue.
  private func incrementTimerCount() {
    activeTimerCount += 1
    beginBackgroundTaskIfNeeded()
  }

  /// Decrements the active timer count and ends background task if no timers remain.
  /// Must be called on timerQueue.
  private func decrementTimerCount() {
    activeTimerCount -= 1
    if activeTimerCount <= 0 {
      activeTimerCount = 0
      endBackgroundTaskIfNeeded()
    }
  }

  /// Begins a background task if one is not already active.
  /// Must be called on timerQueue.
  private func beginBackgroundTaskIfNeeded() {
    guard backgroundTaskId == .invalid else { return }

    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }

      self.backgroundTaskId = UIApplication.shared.beginBackgroundTask(withName: "NitroKeepaliveTimer") {
        [weak self] in
        // Background runtime is about to expire. End the background task
        // (otherwise the OS terminates us) but leave timers scheduled —
        // they'll be paused while the process is suspended and fire when
        // the app resumes. The alternative (cancelling here) silently
        // loses work whenever a bare app crosses the ~30s bg-task budget.
        self?.timerQueue.async {
          self?.endBackgroundTaskIfNeeded()
        }
      }
    }
  }

  /// Ends the background task if one is active.
  /// Must be called on timerQueue.
  private func endBackgroundTaskIfNeeded() {
    guard backgroundTaskId != .invalid else { return }

    let taskId = backgroundTaskId
    backgroundTaskId = .invalid

    DispatchQueue.main.async {
      UIApplication.shared.endBackgroundTask(taskId)
    }
  }
}
