/**
 * Project Zen - Load estimation
 * Combines behavioral signals into a "Stress Score" for cognitive load.
 * Used to decide when to trigger camera + Gemini analysis or Zen prompt.
 */

(function () {
  const SCROLL_ENTROPY_WEIGHT = 0.2;
  const REGRESSION_WEIGHT = 0.25;
  const PAUSE_WEIGHT = 0.2;
  const LATENCY_WEIGHT = 0.15;
  const DWELL_STUCK_WEIGHT = 0.2;

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
   * Compute stress score 0–1 from current behavioral state.
   * @param {object} state - From projectZenSignals.getState()
   * @returns {{ score: number, factors: object }}
   */
  function estimateLoad(state) {
    if (!state) return { score: 0, factors: {} };
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
    return {
      score: Math.min(1, score),
      factors: {
        pause,
        scrollEntropy: entropy,
        regressions,
        interactionLatency: latency,
        dwellStuck,
      },
    };
  }

  if (typeof window !== 'undefined') {
    window.projectZenEstimateLoad = {
      estimateLoad,
    };
  }
})();
