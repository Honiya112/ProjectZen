/**
 * Project Zen - Load estimation
 * Combines behavioral signals into a "Stress Score" for cognitive load.
 * Used to decide when to trigger camera + Gemini analysis or Zen prompt.
 */

(function () {
  const SCROLL_ENTROPY_WEIGHT = 0.35; // Increased: erratic scrolling is primary indicator of confusion
  const REGRESSION_WEIGHT = 0.3; // Increased: re-reading indicates struggling to comprehend
  const PAUSE_WEIGHT = 0.15; // Reduced: pauses don't always indicate stress
  const LATENCY_WEIGHT = 0.1; // Reduced: less reliable signal
  const DWELL_STUCK_WEIGHT = 0.1; // Reduced: focus time isn't always bad

  /** Normalize pause duration (e.g. 0–10s) to 0–1 */
  function normPause(ms) {
    if (ms <= 0) return 0;
    return Math.min(1, ms / 10000);
  }

  /** Normalize scroll entropy (e.g. 0–6 reversals) to 0–1 */
  function normEntropy(n) {
    return Math.min(1, (n || 0) / 6);
  }

  /** Normalize regression count to 0–1 */
  function normRegressions(n) {
    return Math.min(1, (n || 0) / 4);
  }

  /** High hover→click latency (e.g. >2s) suggests hesitation; normalize to 0–1 */
  function normLatency(ms) {
    if (ms == null || ms < 0) return 0;
    return Math.min(1, ms / 3000);
  }

  /** Long dwell on a single element with little scroll = possible "stuck" */
  function getDwellStuckScore(state) {
    const dwell = state.dwellByElementId || {};
    const ids = Object.keys(dwell);
    if (ids.length === 0) return 0;
    const values = ids.map(function (id) { return dwell[id]; });
    const maxDwell = Math.max.apply(null, values);
    const total = values.reduce(function (a, b) { return a + b; }, 0);
    if (total < 2) return 0;
    return Math.min(1, (maxDwell / total) * 2);
  }

  /**
   * Calculate per-element stress contributions
   * Distributes global stress metrics across elements based on dwell time and interaction patterns
   * @param {object} state - From projectZenSignals.getState()
   * @param {number} globalStressFactors - Combined global stress (0-1)
   * @returns {object} elementId -> stress contribution score (0-1)
   */
  function calculatePerElementStress(state, globalStressFactors) {
    if (!state) return {};
    
    const perElementStress = {};
    const dwell = state.dwellByElementId || {};
    const elementIds = Object.keys(dwell);
    
    if (elementIds.length === 0) return {};
    
    // Calculate total dwell time
    const totalDwell = elementIds.reduce(function (sum, id) {
      return sum + (dwell[id] || 0);
    }, 0);
    
    if (totalDwell === 0) return {};
    
    // Distribute stress proportionally to dwell time
    // Elements with high dwell contribute more to stress
    elementIds.forEach(function (elementId) {
      const dwellTime = dwell[elementId] || 0;
      const dwellProportion = dwellTime / totalDwell;
      
      // Element stress = global stress * proportion of dwell time
      // Also boost if user is stuck on this element (dwellStuck factor)
      const baseContribution = globalStressFactors * dwellProportion;
      
      // Check if this element is the "stuck" target (highest dwell)
      const maxDwell = Math.max.apply(null, elementIds.map(function (id) { return dwell[id]; }));
      const isStuckTarget = (dwellTime === maxDwell);
      
      // Amplify contribution if stuck on this element
      const stressScore = isStuckTarget ? 
        Math.min(1, baseContribution * 1.5) : 
        baseContribution;
      
      perElementStress[elementId] = stressScore;
    });
    
    return perElementStress;
  }

  /**
   * Compute stress score 0–1 from current behavioral state.
   * Include per-element stress breakdown.
   * @param {object} state - From projectZenSignals.getState()
   * @returns {{ score: number, factors: object, perElementStress: object }}
   */
  function estimateLoad(state) {
    if (!state) return { score: 0, factors: {}, perElementStress: {} };
    const pause = normPause(state.pauseDurationMs || 0);
    const entropy = normEntropy(state.scrollEntropy);
    const regressions = normRegressions(state.regressionCount || 0);
    const latency = normLatency(state.lastInteractionLatencyMs);
    const dwellStuck = getDwellStuckScore(state);
    
    const score =
      pause * PAUSE_WEIGHT +
      entropy * SCROLL_ENTROPY_WEIGHT +
      regressions * REGRESSION_WEIGHT +
      latency * LATENCY_WEIGHT +
      dwellStuck * DWELL_STUCK_WEIGHT;
    
    const normalizedScore = Math.min(1, score);
    
    // Calculate per-element stress contribution
    const perElementStress = calculatePerElementStress(state, normalizedScore);
    
    return {
      score: normalizedScore,
      factors: {
        pause,
        scrollEntropy: entropy,
        regressions,
        interactionLatency: latency,
        dwellStuck,
      },
      perElementStress: perElementStress, // NEW: element-level stress breakdown
    };
  }

  if (typeof window !== 'undefined') {
    window.projectZenEstimateLoad = {
      estimateLoad,
    };
  }
})();
