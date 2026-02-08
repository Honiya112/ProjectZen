/**
 * Project Zen - Behavioral Signals
 * Maps user behavior to UI snapshot element IDs for engagement / cognitive friction inference.
 * Signals: dwell time, scroll entropy, interaction latency, re-reading/regressions, pauses.
 */

(function () {
  const DWELL_TICK_MS = 250;
  const SCROLL_HISTORY_SIZE = 12;
  const PAUSE_THRESHOLD_MS = 4000;
  const REGRESSION_INDEX_THRESHOLD = 2;

  let tickTimerId = null;
  let lastScrollTop = null;
  const scrollDeltas = [];
  const dwellByElementId = {};
  let lastHoverTs = 0;
  let lastScrollTs = 0;
  let lastKeyTs = 0;
  let lastInteractionLatencyMs = null;
  let lastClickedElementId = null;
  const seenIndices = new Set();
  let furthestReadIndex = -1;
  let regressionCount = 0;
  let wasInRegression = false;
  let lastActivityTs = Date.now();
  let pauseDurationMs = 0;
  let scrollEntropy = 0;

  function getExtractUI() {
    return typeof window !== 'undefined' ? window.projectZenExtractUI : null;
  }

  /** Element id whose vertical center is closest to viewport center (primary focus). */
  function getCenterFocusElementId() {
    const api = getExtractUI();
    if (!api || !api.getIdsInViewport || !api.getElementRect) return null;
    const ids = api.getIdsInViewport();
    if (ids.length === 0) return null;
    const vh = document.documentElement.clientHeight;
    const centerY = vh / 2;
    let bestId = null;
    let bestDist = Infinity;
    for (const id of ids) {
      const r = api.getElementRect(id);
      if (!r) continue;
      const elCenterY = r.top + r.height / 2;
      const dist = Math.abs(elCenterY - centerY);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }
    return bestId;
  }

  /** Resolve element id under point (for click latency target). */
  function getElementIdAtPoint(x, y) {
    const api = getExtractUI();
    if (!api || !api.DATA_ATTR) return null;
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const tracked = el.closest(`[${api.DATA_ATTR}]`);
    return tracked ? tracked.getAttribute(api.DATA_ATTR) : null;
  }

  /** Get snapshot element index by id (for regression detection). */
  function getIndexById(id) {
    const api = getExtractUI();
    if (!api) return -1;
    const el = document.querySelector(`[${api.DATA_ATTR}="${id}"]`);
    if (!el) return -1;
    const all = document.querySelectorAll(`[${api.DATA_ATTR}]`);
    for (let i = 0; i < all.length; i++) {
      if (all[i] === el) return i;
    }
    return -1;
  }

  function recordActivity() {
    lastActivityTs = Date.now();
    pauseDurationMs = 0;
  }

  function tick() {
    const api = getExtractUI();
    if (!api || !api.getIdsInViewport) return;

    const ids = api.getIdsInViewport();
    const focusId = getCenterFocusElementId();

    // Dwell: add tick to all in-view elements, extra for center-focused
    const increment = DWELL_TICK_MS / 1000;
    for (const id of ids) {
      dwellByElementId[id] = (dwellByElementId[id] || 0) + increment;
    }
    if (focusId) {
      dwellByElementId[focusId] = (dwellByElementId[focusId] || 0) + increment * 0.5;
    }

    // Re-reading: update furthest read and detect regression
    for (const id of ids) {
      const idx = getIndexById(id);
      if (idx >= 0) seenIndices.add(idx);
    }
    const currentIndices = ids.map(getIndexById).filter((i) => i >= 0);
    const maxSeen = currentIndices.length ? Math.max(...currentIndices) : -1;
    if (maxSeen > furthestReadIndex) furthestReadIndex = maxSeen;
    const topIndex = focusId !== null ? getIndexById(focusId) : -1;
    const inRegression = topIndex >= 0 && furthestReadIndex >= 0 && topIndex <= furthestReadIndex - REGRESSION_INDEX_THRESHOLD;
    if (inRegression && !wasInRegression) regressionCount += 1;
    wasInRegression = inRegression;

    // Pause: time since last activity
    const now = Date.now();
    const inactiveMs = now - lastActivityTs;
    if (inactiveMs >= PAUSE_THRESHOLD_MS) {
      pauseDurationMs = inactiveMs;
    }
  }

  function onScroll() {
    const st = document.documentElement.scrollTop ?? document.body?.scrollTop ?? 0;
    if (lastScrollTop !== null) {
      const delta = st - lastScrollTop;
      scrollDeltas.push(delta);
      if (scrollDeltas.length > SCROLL_HISTORY_SIZE) scrollDeltas.shift();
      let reversals = 0;
      for (let i = 1; i < scrollDeltas.length; i++) {
        if ((scrollDeltas[i - 1] > 0 && scrollDeltas[i] < 0) || (scrollDeltas[i - 1] < 0 && scrollDeltas[i] > 0)) {
          reversals += 1;
        }
      }
      scrollEntropy = reversals;
    }
    lastScrollTop = st;
    lastScrollTs = Date.now();
    recordActivity();
  }

  function onMouseMove() {
    lastHoverTs = Date.now();
    recordActivity();
  }

  function onClick(e) {
    const now = Date.now();
    const latency = now - Math.max(lastHoverTs, lastScrollTs);
    lastInteractionLatencyMs = latency;
    lastClickedElementId = getElementIdAtPoint(e.clientX, e.clientY);
    recordActivity();
  }

  function onKeyDown() {
    lastKeyTs = Date.now();
    recordActivity();
  }

  function start() {
    if (tickTimerId !== null) return;
    lastScrollTop = document.documentElement.scrollTop ?? document.body?.scrollTop ?? 0;
    scrollDeltas.length = 0;
    lastActivityTs = Date.now();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKeyDown, true);
    tickTimerId = setInterval(tick, DWELL_TICK_MS);
  }

  function stop() {
    if (tickTimerId !== null) {
      clearInterval(tickTimerId);
      tickTimerId = null;
    }
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('click', onClick);
    window.removeEventListener('keydown', onKeyDown);
  }

  /**
   * Get current behavioral state for AI / cognitive-load logic.
   * @returns {{
   *   dwellByElementId: Record<string, number>,
   *   scrollEntropy: number,
   *   lastInteractionLatencyMs: number | null,
   *   lastClickedElementId: string | null,
   *   regressionCount: number,
   *   pauseDurationMs: number,
   *   focusedElementId: string | null,
   *   idsInViewport: string[]
   * }}
   */
  function getState() {
    const api = getExtractUI();
    const idsInViewport = api && api.getIdsInViewport ? api.getIdsInViewport() : [];
    return {
      dwellByElementId: { ...dwellByElementId },
      scrollEntropy,
      lastInteractionLatencyMs,
      lastClickedElementId,
      regressionCount,
      pauseDurationMs,
      focusedElementId: getCenterFocusElementId(),
      idsInViewport,
    };
  }

  /**
   * Reset counters (e.g. when snapshot is refreshed or session resets).
   */
  function reset() {
    Object.keys(dwellByElementId).forEach((k) => delete dwellByElementId[k]);
    scrollDeltas.length = 0;
    scrollEntropy = 0;
    lastInteractionLatencyMs = null;
    lastClickedElementId = null;
    seenIndices.clear();
    furthestReadIndex = -1;
    regressionCount = 0;
    wasInRegression = false;
    pauseDurationMs = 0;
  }

  if (typeof window !== 'undefined') {
    window.projectZenBehavioralSignals = {
      start,
      stop,
      getState,
      reset,
    };
  }
})();
