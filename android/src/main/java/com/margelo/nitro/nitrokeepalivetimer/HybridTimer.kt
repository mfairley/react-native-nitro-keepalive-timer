package com.margelo.nitro.nitrokeepalivetimer

import android.app.ActivityManager
import android.app.Application
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.os.SystemClock
import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.NitroModules
import java.util.PriorityQueue
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock
import kotlin.math.max
import kotlin.math.min

/**
 * High-performance timer engine for Android.
 *
 * Design goals:
 * - Single scheduler thread (no thread-per-timer overhead)
 * - O(log n) scheduling/cancellation via priority queue + id map
 * - Drift-safe interval scheduling using absolute deadlines
 * - Smart leeway policy aligned with iOS implementation
 */
@DoNotStrip
@Keep
class HybridTimer : HybridTimerSpec() {
    private class TimerEntry(
        val id: Double,
        var deadlineNs: Long,
        val intervalNs: Long,
        val cadenceMs: Double,
        val userLeewayMs: Double,
        val callback: (Double) -> Unit,
        var cancelled: Boolean = false,
    ) {
        val isRepeating: Boolean
            get() = intervalNs > 0L
    }

    private val schedulerLock = ReentrantLock()
    private val schedulerSignal = schedulerLock.newCondition()
    private val timersById = HashMap<Double, TimerEntry>()
    private val timerQueue = PriorityQueue<TimerEntry>(compareBy { it.deadlineNs })
    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile
    private var lifecycleCallbacks: Application.ActivityLifecycleCallbacks? = null

    @Volatile
    private var isBackground = false

    @Volatile
    private var isRunning = true

    private val schedulerThread =
        Thread(::runSchedulerLoop, "NitroKeepaliveTimerScheduler").apply {
            isDaemon = true
            start()
        }

    init {
        installLifecycleTracking()
    }

    override val memorySize: Long
        get() = timersById.size * 128L + 64L

    override fun setTimeout(
        id: Double,
        delayMs: Double,
        callback: (id: Double) -> Unit,
        leewayMs: Double,
    ) {
        val normalizedDelayMs = if (delayMs.isFinite()) max(0.0, delayMs) else 0.0
        scheduleTimer(
            id = id,
            delayMs = normalizedDelayMs,
            intervalMs = 0.0,
            callback = callback,
            leewayMs = leewayMs,
        )
    }

    override fun clearTimeout(id: Double) =
        schedulerLock.withLock {
            cancelTimerLocked(id)
            schedulerSignal.signal()
        }

    override fun setInterval(
        id: Double,
        intervalMs: Double,
        callback: (id: Double) -> Unit,
        leewayMs: Double,
    ) {
        val normalizedIntervalMs =
            when {
                !intervalMs.isFinite() -> MIN_INTERVAL_MS
                intervalMs <= 0.0 -> MIN_INTERVAL_MS
                else -> intervalMs
            }

        scheduleTimer(
            id = id,
            delayMs = normalizedIntervalMs,
            intervalMs = normalizedIntervalMs,
            callback = callback,
            leewayMs = leewayMs,
        )
    }

    override fun clearInterval(id: Double) {
        clearTimeout(id)
    }

    override fun dispose() {
        uninstallLifecycleTracking()

        schedulerLock.lock()
        try {
            if (!isRunning) return
            isRunning = false
            timersById.values.forEach { it.cancelled = true }
            timersById.clear()
            timerQueue.clear()
            schedulerSignal.signalAll()
        } finally {
            schedulerLock.unlock()
        }

        schedulerThread.interrupt()
        try {
            schedulerThread.join(100)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        }

        super.dispose()
    }

    @Suppress("deprecation")
    @Throws(Throwable::class)
    protected fun finalize() {
        dispose()
    }

    private fun scheduleTimer(
        id: Double,
        delayMs: Double,
        intervalMs: Double,
        callback: (Double) -> Unit,
        leewayMs: Double,
    ) {
        val delayNs = millisToNanos(delayMs)
        val intervalNs = if (intervalMs <= 0.0) 0L else millisToNanos(intervalMs)
        val deadlineNs = saturatingAdd(nowNanos(), delayNs)
        val entry =
            TimerEntry(
                id = id,
                deadlineNs = deadlineNs,
                intervalNs = intervalNs,
                cadenceMs = if (intervalMs > 0.0) intervalMs else delayMs,
                userLeewayMs = leewayMs,
                callback = callback,
            )

        schedulerLock.withLock {
            cancelTimerLocked(id)
            timersById[id] = entry
            timerQueue.offer(entry)
            schedulerSignal.signal()
        }
    }

    private fun cancelTimerLocked(id: Double) {
        val existing = timersById.remove(id) ?: return
        existing.cancelled = true
    }

    private fun runSchedulerLoop() {
        try {
            Process.setThreadPriority(Process.THREAD_PRIORITY_DISPLAY)
        } catch (_: Throwable) {
            // Some Android versions may reject this priority; keep default in that case.
        }

        while (true) {
            val callbacksToDispatch = ArrayList<Pair<(Double) -> Unit, Double>>()

            schedulerLock.lock()
            try {
                while (isRunning && peekActiveTimerLocked() == null) {
                    schedulerSignal.await()
                }
                if (!isRunning) return

                val next = peekActiveTimerLocked() ?: continue
                val nowNs = nowNanos()
                val waitNs = next.deadlineNs - nowNs

                if (waitNs > 0L) {
                    schedulerSignal.awaitNanos(waitNs)
                    continue
                }

                maybeCoalesceLocked(next)
                val fireTimeNs = nowNanos()

                while (true) {
                    val head = peekActiveTimerLocked() ?: break
                    if (head.deadlineNs > fireTimeNs) break

                    timerQueue.poll()
                    if (head.cancelled || timersById[head.id] !== head) {
                        continue
                    }

                    if (head.isRepeating) {
                        head.deadlineNs = computeNextIntervalDeadlineNs(head, fireTimeNs)
                        timerQueue.offer(head)
                    } else {
                        timersById.remove(head.id)
                    }

                    callbacksToDispatch.add(head.callback to head.id)
                }
            } catch (_: InterruptedException) {
                if (!isRunning) return
            } finally {
                schedulerLock.unlock()
            }

            for ((callback, id) in callbacksToDispatch) {
                mainHandler.post {
                    try {
                        callback(id)
                    } catch (_: Throwable) {
                        // Keep scheduling alive even if a single callback fails.
                    }
                }
            }
        }
    }

    private fun peekActiveTimerLocked(): TimerEntry? {
        while (true) {
            val head = timerQueue.peek() ?: return null
            if (head.cancelled || timersById[head.id] !== head) {
                timerQueue.poll()
                continue
            }
            return head
        }
    }

    private fun maybeCoalesceLocked(firstDue: TimerEntry) {
        if (timerQueue.size <= 1) return

        val leewayMs = calculateLeewayMs(firstDue.cadenceMs, firstDue.userLeewayMs)
        if (leewayMs <= 0.0) return

        val background = isInBackground()
        val coalesceCapMs = if (background) BACKGROUND_COALESCE_CAP_MS else FOREGROUND_COALESCE_CAP_MS
        val coalesceNs = millisToNanos(min(leewayMs, coalesceCapMs))
        if (coalesceNs <= 0L) return

        // awaitNanos releases the lock, allowing new timers to be scheduled
        // during the coalesce window. A signal from scheduleTimer wakes us early.
        schedulerSignal.awaitNanos(coalesceNs)
    }

    private fun computeNextIntervalDeadlineNs(
        entry: TimerEntry,
        nowNs: Long,
    ): Long {
        val intervalNs = entry.intervalNs
        if (intervalNs <= 0L) return nowNs

        if (nowNs <= entry.deadlineNs) {
            return saturatingAdd(entry.deadlineNs, intervalNs)
        }

        val behindNs = nowNs - entry.deadlineNs
        val missed = (behindNs / intervalNs) + 1L
        return saturatingAdd(entry.deadlineNs, saturatingMultiply(intervalNs, missed))
    }

    private fun calculateLeewayMs(
        cadenceMs: Double,
        userLeewayMs: Double,
    ): Double {
        if (userLeewayMs >= 0.0) return userLeewayMs

        val baseLeewayMs =
            when {
                cadenceMs < 100.0 -> 1.0
                cadenceMs < 500.0 -> 5.0
                cadenceMs < 1000.0 -> 10.0
                cadenceMs < 5000.0 -> 25.0
                cadenceMs < 30000.0 -> 50.0
                else -> 100.0
            }

        val multiplier = if (isInBackground()) 2.0 else 1.0
        val maxLeewayMs = cadenceMs * 0.1
        val finalLeewayMs = min(baseLeewayMs * multiplier, maxLeewayMs)
        return max(1.0, finalLeewayMs)
    }

    private fun isInBackground(): Boolean {
        if (lifecycleCallbacks != null) {
            return isBackground
        }

        val processState = ActivityManager.RunningAppProcessInfo()
        ActivityManager.getMyMemoryState(processState)
        return processState.importance > ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE
    }

    private fun installLifecycleTracking() {
        val application =
            NitroModules.applicationContext?.applicationContext as? Application
                ?: run {
                    isBackground = isProcessInBackground()
                    return
                }

        // Safe without synchronization: lifecycle callbacks are always dispatched on the main thread.
        var startedCount = 0
        val callbacks =
            object : Application.ActivityLifecycleCallbacks {
                override fun onActivityCreated(
                    activity: android.app.Activity,
                    savedInstanceState: android.os.Bundle?,
                ) = Unit

                override fun onActivityStarted(activity: android.app.Activity) {
                    startedCount += 1
                    isBackground = startedCount <= 0
                }

                override fun onActivityResumed(activity: android.app.Activity) = Unit

                override fun onActivityPaused(activity: android.app.Activity) = Unit

                override fun onActivityStopped(activity: android.app.Activity) {
                    startedCount -= 1
                    isBackground = startedCount <= 0
                }

                override fun onActivitySaveInstanceState(
                    activity: android.app.Activity,
                    outState: android.os.Bundle,
                ) = Unit

                override fun onActivityDestroyed(activity: android.app.Activity) = Unit
            }

        isBackground = isProcessInBackground()
        lifecycleCallbacks = callbacks
        application.registerActivityLifecycleCallbacks(callbacks)
    }

    private fun uninstallLifecycleTracking() {
        val callbacks = lifecycleCallbacks ?: return
        val application = NitroModules.applicationContext?.applicationContext as? Application
        application?.unregisterActivityLifecycleCallbacks(callbacks)
        lifecycleCallbacks = null
    }

    private fun isProcessInBackground(): Boolean {
        val processState = ActivityManager.RunningAppProcessInfo()
        ActivityManager.getMyMemoryState(processState)
        return processState.importance > ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE
    }

    private fun millisToNanos(ms: Double): Long {
        if (!ms.isFinite() || ms <= 0.0) return 0L
        val nanos = ms * NANOS_PER_MILLI
        return if (nanos >= Long.MAX_VALUE.toDouble()) Long.MAX_VALUE else nanos.toLong()
    }

    private fun nowNanos(): Long = SystemClock.elapsedRealtimeNanos()

    private fun saturatingAdd(
        a: Long,
        b: Long,
    ): Long {
        if (b > 0L && a > Long.MAX_VALUE - b) return Long.MAX_VALUE
        return a + b
    }

    private fun saturatingMultiply(
        a: Long,
        b: Long,
    ): Long {
        if (a <= 0L || b <= 0L) return 0L
        if (a > Long.MAX_VALUE / b) return Long.MAX_VALUE
        return a * b
    }

    private companion object {
        private const val NANOS_PER_MILLI = 1_000_000.0
        private const val MIN_INTERVAL_MS = 1.0
        private const val FOREGROUND_COALESCE_CAP_MS = 2.0
        private const val BACKGROUND_COALESCE_CAP_MS = 10.0
    }
}
