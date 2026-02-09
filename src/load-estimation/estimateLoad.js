/**
 * Project Zen - Load estimation
 * Combines behavioral signals into a "Stress Score" for cognitive load.
 * Used to decide when to trigger camera + Gemini analysis or Zen prompt.
 */

(function () {
  const SCROLL_ENTROPY_WEIGHT = 0.35; // Erratic scrolling: Searching for missed info or loss of spatial context
  const REGRESSION_WEIGHT = 0.3; // Returning to previously viewed content: Comprehension difficulty or memory overload
  const PAUSE_WEIGHT = 0.15; // Time since last interaction of any kind: Thinking, reading, or AFK
  const LATENCY_WEIGHT = 0.1; // Delay between hover and click: Decision uncertainty / micro-friction
  const DWELL_STUCK_WEIGHT = 0.1; // One element dominates attention relative to others: Possible "stuck"

  const MIN_DWELL_SECONDS = 15; // Below this is just reading
  const STRONG_DWELL_SECONDS = 30; // In “stuck” territory
  const DOMINANCE_THRESHOLD = 0.6; // Element owns 60% of dwell


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
  function getQualifiedDwellScore(state) {
    const dwell = state.dwellByElementId || {};
    const focusedId = state.focusedElementId;
    if (!focusedId || !dwell[focusedId]) return 0;

    const focusedDwell = dwell[focusedId];
    const totalDwell = Object.values(dwell).reduce((a, b) => a + b, 0);

    if (focusedDwell < MIN_DWELL_SECONDS) return 0;
    if (totalDwell === 0) return 0;

    // Absolute time score
    const timeScore = Math.min(
      1,
      (focusedDwell - MIN_DWELL_SECONDS) /
        (STRONG_DWELL_SECONDS - MIN_DWELL_SECONDS)
    );

    // Dominance score
    const dominance = focusedDwell / totalDwell;
    const dominanceScore =
      dominance >= DOMINANCE_THRESHOLD
        ? Math.min(1, (dominance - DOMINANCE_THRESHOLD) / 0.4)
        : 0;

    // Stagnation / hesitation signals
    const hasInstability =
      state.regressionCount > 0 ||
      state.scrollEntropy > 1 ||
      (state.lastInteractionLatencyMs || 0) > 1500;

    if (!hasInstability) return 0;

    // Final qualified dwell score
    return Math.min(1, timeScore * 0.6 + dominanceScore * 0.4);
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
    const dwellStuck = getQualifiedDwellScore(state);
    
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
        qualifiedDwell: dwellStuck,
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
