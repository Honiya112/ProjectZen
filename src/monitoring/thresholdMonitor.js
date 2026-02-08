/**
 * Project Zen - Threshold Detection & Persistence Monitor
 * Continuously calculates stress score every 2s and tracks persistence.
 * Triggers when score exceeds threshold for N consecutive intervals.
 * Implements cooldown to prevent spam after breach detection.
 */

(function () {
  const CHECK_INTERVAL_MS = 2000; // Every 2 seconds
  const STRESS_THRESHOLD = 0.6; // Normalized stress score (0–1)
  const PERSISTENCE_WINDOW = 2; // Must exceed threshold N consecutive times
  const COOLDOWN_MS = 300000; // 5 minutes cooldown between analyses

  let monitorTimerId = null;
  let breachCount = 0;
  let isMonitoring = false;
  let onThresholdBreached = null;

  // Persistence tracking
  let breachStartTime = null; // When breach first detected
  let lastBreachTriggerTime = null; // Last time we triggered callback

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
      `📊 Stress check: ${(score * 100).toFixed(1)}% (threshold: ${(STRESS_THRESHOLD * 100).toFixed(0)}%, persistence: ${breachCount}/${PERSISTENCE_WINDOW})`
    );

    return {
      score,
      factors: loadResult.factors,
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

    if (result.exceeds) {
      // First time breaching? Record the start
      if (breachCount === 0) {
        breachStartTime = Date.now();
      }

      breachCount += 1;
      const persistenceSec = getPersistenceDuration();
      console.log(
        `⚠️ Breach detected. Count: ${breachCount}/${PERSISTENCE_WINDOW}, Duration: ${persistenceSec}s`
      );

      // Threshold confirmed breached → trigger callback (if not in cooldown)
      if (breachCount >= PERSISTENCE_WINDOW && !isInCooldown()) {
        console.log('🚨 THRESHOLD CONFIRMED BREACHED. Triggering Gemini analysis.');
        if (onThresholdBreached) {
          onThresholdBreached({
            score: result.score,
            factors: result.factors,
            state: result.state,
            persistenceSec,
          });
        }
        // Record trigger time for cooldown
        lastBreachTriggerTime = Date.now();
        // Reset after callback so we don't spam
        breachCount = 0;
        breachStartTime = null;
      } else if (breachCount >= PERSISTENCE_WINDOW && isInCooldown()) {
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

    console.log('🟢 Threshold monitor started.');
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
      persistenceWindow: PERSISTENCE_WINDOW,
      threshold: STRESS_THRESHOLD,
      checkIntervalMs: CHECK_INTERVAL_MS,
      cooldownMs: COOLDOWN_MS,
      persistenceSec: getPersistenceDuration(),
      inCooldown: isInCooldown(),
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
