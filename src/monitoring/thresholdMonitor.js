/**
 * Project Zen - Threshold Detection & Persistence Monitor
 * Continuously calculates stress score every 2s and tracks persistence.
 * Triggers when score exceeds threshold for prolonged period (>10s).
 * Implements cooldown to prevent spam after breach detection.
 * Tracks stress trends (increasing/steady/fluctuating) for better decision-making.
 */

(function () {
  const CHECK_INTERVAL_MS = 2000; // Every 2 seconds
  const STRESS_THRESHOLD = 0.6; // Normalized stress score (0–1)
  const PERSISTENCE_CHECKS_REQUIRED = 6; // 6 checks × 2s = ~12 seconds minimum
  const COOLDOWN_MS = 300000; // 5 minutes cooldown between analyses
  const STRESS_HISTORY_SIZE = 20; // Track last 40 seconds of scores

  let monitorTimerId = null;
  let breachCount = 0;
  let isMonitoring = false;
  let onThresholdBreached = null;

  // Persistence tracking
  let breachStartTime = null; // When breach first detected
  let lastBreachTriggerTime = null; // Last time we triggered callback

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
      console.warn('Project Zen Monitor: Signals or estimation API not ready');
      return null;
    }

    const state = signalsAPI.getState();
    const loadResult = estimateAPI.estimateLoad(state);
    const score = loadResult.score || 0;

    console.log(
      `📊 Stress check: ${(score * 100).toFixed(1)}% (threshold: ${(STRESS_THRESHOLD * 100).toFixed(0)}%, persistence: ${breachCount}/${PERSISTENCE_CHECKS_REQUIRED})`
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
    if (!result) return;

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
      // First time breaching? Record the start
      if (breachCount === 0) {
        breachStartTime = Date.now();
      }

      breachCount += 1;
      const persistenceSec = getPersistenceDuration();
      const trend = analyzeStressTrend();
      console.log(
        `⚠️ Breach detected. Count: ${breachCount}/${PERSISTENCE_CHECKS_REQUIRED}, Duration: ${persistenceSec}s, Trend: ${trend}`
      );

      // Threshold confirmed breached → trigger callback (if not in cooldown)
      // REQUIRES: persistent high stress (6+ checks = ~12+ seconds)
      if (breachCount >= PERSISTENCE_CHECKS_REQUIRED && !isInCooldown()) {
        console.log('🚨 PERSISTENT STRESS CONFIRMED (>12s). Triggering Gemini analysis.');
        if (onThresholdBreached) {
          onThresholdBreached({
            score: result.score,
            factors: result.factors,
            perElementStress: result.perElementStress, // NEW: per-element breakdown
            state: result.state,
            persistenceSec,
            trend, // Send trend info to Gemini
            averageStress: getAverageStress(),
          });
        }
        // Record trigger time for cooldown
        lastBreachTriggerTime = Date.now();
        // Reset after callback so we don't spam
        breachCount = 0;
        breachStartTime = null;
        stressHistory = []; // Clear history after trigger
      } else if (breachCount >= PERSISTENCE_CHECKS_REQUIRED && isInCooldown()) {
        const timeSinceLastTrigger = Math.floor((Date.now() - lastBreachTriggerTime) / 1000);
        const cooldownRemaining = Math.floor((COOLDOWN_MS - (Date.now() - lastBreachTriggerTime)) / 1000);
        console.log(`⏳ In cooldown. Last trigger ${timeSinceLastTrigger}s ago. Cooldown remaining: ${cooldownRemaining}s`);
      }
    } else {
      // Score dropped below threshold; reset counter
      if (breachCount > 0) {
        console.log('✅ Score dropped below threshold. Resetting breach counter.');
        breachCount = 0;
        breachStartTime = null;
      }
    }
  }

  /**
   * Start continuous monitoring
   * @param {function} callback - Called when threshold breach is confirmed
   */
  function startMonitoring(callback) {
    if (isMonitoring) {
      console.warn('Project Zen Monitor: Already monitoring.');
      return;
    }
    isMonitoring = true;
    onThresholdBreached = callback;
    breachCount = 0;
    breachStartTime = null;
    lastBreachTriggerTime = null;
    stressHistory = []; // Clear history on start

    console.log('🟢 Threshold monitor started. Persistence window: ~12 seconds.');
    monitorTimerId = setInterval(monitoringTick, CHECK_INTERVAL_MS);
  }

  /**
   * Stop monitoring
   */
  function stopMonitoring() {
    if (!isMonitoring) return;
    isMonitoring = false;

    if (monitorTimerId !== null) {
      clearInterval(monitorTimerId);
      monitorTimerId = null;
    }
    breachCount = 0;
    breachStartTime = null;
    stressHistory = [];
    onThresholdBreached = null;

    console.log('🔴 Threshold monitor stopped.');
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
