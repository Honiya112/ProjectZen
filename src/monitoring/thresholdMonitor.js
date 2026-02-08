/**
 * Project Zen - Threshold Detection & Persistence Monitor
 * Continuously calculates stress score every 2s and tracks persistence.
 * Triggers when score exceeds threshold for prolonged period (>10s).
 * Implements cooldown to prevent spam after breach detection.
 * Tracks stress trends (increasing/steady/fluctuating) for better decision-making.
 */

(function () {
  const CHECK_INTERVAL_MS = 2000; // Every 2 seconds
  const STRESS_THRESHOLD = 0.3; // Normalized stress score (0–1) — lowered to 30%
  const PERSISTENCE_CHECKS_REQUIRED = 4; // 4 checks × 2s = ~8 seconds of sustained high stress
  const COOLDOWN_MS = 300000; // 5 minutes cooldown between analyses
  const STRESS_HISTORY_SIZE = 20; // Track last 40 seconds of scores

  let monitorTimerId = null;
  let breachCount = 0;
  let isMonitoring = false;
  let onThresholdBreached = null;

  // Persistence tracking
  let breachStartTime = null; // When breach first detected
  let lastBreachTriggerTime = null; // Last time we triggered callback
  
  // Hysteresis: track consecutive below-threshold checks to avoid resetting on temporary dips
  let consecutiveLowChecks = 0; // Increments when score stays below threshold
  const CONSECUTIVE_LOW_REQUIRED = 2; // Need 2 consecutive low checks to reset breach counter

  // Stress history for trend analysis
  let stressHistory = []; // Array of {timestamp, score}

  /**
   * Analyze stress trend from history
   */
  function analyzeStressTrend() {
    if (stressHistory.length < 2) return 'insufficient_data';
    
    const recent = stressHistory.slice(-6); // Last 6 checks (~12 seconds)
    if (recent.length < 2) return 'insufficient_data';
    
    const firstHalf = recent.slice(0, Math.ceil(recent.length / 2));
    const secondHalf = recent.slice(Math.ceil(recent.length / 2));
    
    const avgFirst = firstHalf.reduce((a, b) => a + b.score, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b.score, 0) / secondHalf.length;
    
    const diff = avgSecond - avgFirst;
    const threshold = 0.05; // 5% change threshold
    
    if (diff > threshold) return 'increasing';
    if (diff < -threshold) return 'decreasing';
    return 'steady';
  }

  /**
   * Get average stress from entire history
   */
  function getAverageStress() {
    if (stressHistory.length === 0) return 0;
    const sum = stressHistory.reduce((a, b) => a + b.score, 0);
    return sum / stressHistory.length;
  }

  /**
   * Run a single check: get signals → estimate load → compare to threshold
   */
  function checkStressLevel() {
    const signalsAPI = window.projectZenSignals;
    const estimateAPI = window.projectZenEstimateLoad;

    if (!signalsAPI || !signalsAPI.getState || !estimateAPI || !estimateAPI.estimateLoad) {
      console.warn('[ProjectZen:Monitor] Signals or estimation API not ready');
      console.warn('[ProjectZen:Monitor] Signals:', signalsAPI ? 'yes' : 'no', 'getState:', signalsAPI?.getState ? 'yes' : 'no');
      console.warn('[ProjectZen:Monitor] EstimateLoad:', estimateAPI ? 'yes' : 'no', 'estimateLoad:', estimateAPI?.estimateLoad ? 'yes' : 'no');
      return null;
    }

    const state = signalsAPI.getState();
    const loadResult = estimateAPI.estimateLoad(state);
    const score = loadResult.score || 0;

    console.log(
      `[ProjectZen:Monitor] 📊 Stress check: ${(score * 100).toFixed(1)}% (threshold: ${(STRESS_THRESHOLD * 100).toFixed(0)}%, persistence: ${breachCount}/${PERSISTENCE_CHECKS_REQUIRED})`
    );

    return {
      score,
      factors: loadResult.factors,
      perElementStress: loadResult.perElementStress, // NEW: per-element stress breakdown
      state,
      exceeds: score >= STRESS_THRESHOLD,
    };
  }

  /**
   * Calculate how long user has been in breach state (in seconds)
   */
  function getPersistenceDuration() {
    if (!breachStartTime) return 0;
    return Math.floor((Date.now() - breachStartTime) / 1000);
  }

  /**
   * Check if we're in cooldown period after last breach trigger
   */
  function isInCooldown() {
    if (!lastBreachTriggerTime) return false;
    const timeSinceLastTrigger = Date.now() - lastBreachTriggerTime;
    return timeSinceLastTrigger < COOLDOWN_MS;
  }

  /**
   * Main monitoring loop
   */
  function monitoringTick() {
    const result = checkStressLevel();
    if (!result) {
      console.log('[ProjectZen:Monitor] Warning: checkStressLevel returned null');
      return;
    }

    // Record score in history for trend analysis
    stressHistory.push({
      timestamp: Date.now(),
      score: result.score,
    });
    
    // Keep history bounded
    if (stressHistory.length > STRESS_HISTORY_SIZE) {
      stressHistory.shift();
    }

    if (result.exceeds) {
      // Score is HIGH - increment breach counter, reset low counter
      consecutiveLowChecks = 0;
      
      // Don't increment if we're already in cooldown (counter should stay at 0 during cooldown)
      if (!isInCooldown()) {
        // First time breaching? Record the start
        if (breachCount === 0) {
          breachStartTime = Date.now();
        }

        breachCount += 1;
      }
      
      const persistenceSec = getPersistenceDuration();
      const trend = analyzeStressTrend();
      console.log(
        `[ProjectZen:Monitor] ⚠️ Breach detected. Count: ${breachCount}/${PERSISTENCE_CHECKS_REQUIRED}, Duration: ${persistenceSec}s, Trend: ${trend}`
      );

      // Threshold confirmed breached → trigger callback (if not in cooldown)
      // REQUIRES: persistent high stress (4+ checks = ~8+ seconds)
      if (breachCount >= PERSISTENCE_CHECKS_REQUIRED && !isInCooldown()) {
        console.log('[ProjectZen:Monitor] 🚨 PERSISTENT STRESS CONFIRMED (>8s). Triggering Gemini analysis.');
        if (onThresholdBreached) {
          onThresholdBreached({
            score: result.score,
            factors: result.factors,
            perElementStress: result.perElementStress,
            state: result.state,
            persistenceSec,
            trend,
            averageStress: getAverageStress(),
          });
        }
        // Record trigger time for cooldown
        lastBreachTriggerTime = Date.now();
        // Reset after callback so we don't spam
        breachCount = 0;
        breachStartTime = null;
        consecutiveLowChecks = 0;
        stressHistory = [];
      } else if (breachCount >= PERSISTENCE_CHECKS_REQUIRED && isInCooldown()) {
        const timeSinceLastTrigger = Math.floor((Date.now() - lastBreachTriggerTime) / 1000);
        const cooldownRemaining = Math.floor((COOLDOWN_MS - (Date.now() - lastBreachTriggerTime)) / 1000);
        console.log(`[ProjectZen:Monitor] ⏳ In cooldown. Last trigger ${timeSinceLastTrigger}s ago. Cooldown remaining: ${cooldownRemaining}s`);
      }
    } else {
      // Score is LOW - increment consecutive low checks
      consecutiveLowChecks += 1;
      
      // Only reset after multiple consecutive low checks (hysteresis to avoid resetting on temporary dips)
      if (breachCount > 0 && consecutiveLowChecks >= CONSECUTIVE_LOW_REQUIRED) {
        console.log(`[ProjectZen:Monitor] ✅ Score below threshold for ${CONSECUTIVE_LOW_REQUIRED} checks. Resetting breach counter (was at ${breachCount}/${PERSISTENCE_CHECKS_REQUIRED}).`);
        breachCount = 0;
        breachStartTime = null;
        consecutiveLowChecks = 0;
      } else if (breachCount > 0 && consecutiveLowChecks < CONSECUTIVE_LOW_REQUIRED) {
        console.log(`[ProjectZen:Monitor] ℹ️ Score dipped below threshold (low count: ${consecutiveLowChecks}/${CONSECUTIVE_LOW_REQUIRED}). Breach counter holding at ${breachCount}/${PERSISTENCE_CHECKS_REQUIRED}.`);
      }
    }
  }

  /**
   * Start continuous monitoring
   * @param {function} callback - Called when threshold breach is confirmed
   */
  function startMonitoring(callback) {
    if (isMonitoring) {
      console.warn('[ProjectZen:Monitor] Already monitoring.');
      return;
    }
    isMonitoring = true;
    onThresholdBreached = callback;
    breachCount = 0;
    breachStartTime = null;
    lastBreachTriggerTime = null;
    consecutiveLowChecks = 0;
    stressHistory = [];

    console.log('[ProjectZen:Monitor] 🟢 Threshold monitor started. Will trigger after 4 consecutive high-stress checks (~8 seconds).');
    monitorTimerId = setInterval(monitoringTick, CHECK_INTERVAL_MS);
  }

  function stopMonitoring() {
    if (!isMonitoring) return;
    isMonitoring = false;

    if (monitorTimerId !== null) {
      clearInterval(monitorTimerId);
      monitorTimerId = null;
    }
    breachCount = 0;
    breachStartTime = null;
    consecutiveLowChecks = 0;
    stressHistory = [];
    onThresholdBreached = null;

    console.log('[ProjectZen:Monitor] 🔴 Threshold monitor stopped.');
  }

  /**
   * Get current monitoring state
   */
  function getMonitoringState() {
    return {
      isMonitoring,
      breachCount,
      persistenceChecksRequired: PERSISTENCE_CHECKS_REQUIRED,
      persistenceWindowSec: PERSISTENCE_CHECKS_REQUIRED * (CHECK_INTERVAL_MS / 1000),
      threshold: STRESS_THRESHOLD,
      checkIntervalMs: CHECK_INTERVAL_MS,
      cooldownMs: COOLDOWN_MS,
      persistenceSec: getPersistenceDuration(),
      inCooldown: isInCooldown(),
      stressTrend: analyzeStressTrend(),
      averageStress: getAverageStress(),
      stressHistoryLength: stressHistory.length,
    };
  }

  /**
   * Set configuration (optional)
   */
  function configure(options) {
    if (options.threshold !== undefined) {
      Object.defineProperty(arguments.callee, '_threshold', {
        value: options.threshold,
        writable: true,
      });
    }
    if (options.persistenceWindow !== undefined) {
      Object.defineProperty(arguments.callee, '_persistenceWindow', {
        value: options.persistenceWindow,
        writable: true,
      });
    }
  }

  if (typeof window !== 'undefined') {
    window.projectZenThresholdMonitor = {
      startMonitoring,
      stopMonitoring,
      getMonitoringState,
      checkStressLevel,
      configure,
    };
  }
})();
