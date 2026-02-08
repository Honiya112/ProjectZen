/**
 * Project Zen - Dwell signal
 * Tracks time spent per paragraph/section; re-reading/regressions; mouse/keyboard pauses.
 */

(function () {
  const DWELL_TICK_MS = 250;
  const PAUSE_THRESHOLD_MS = 4000;
  const REGRESSION_INDEX_THRESHOLD = 2;

  window.projectZenSignals = window.projectZenSignals || {};
  const S = window.projectZenSignals;

  let tickTimerId = null;
  S.dwellByElementId = {};
  const seenIndices = new Set();
  let furthestReadIndex = -1;
  S.regressionCount = 0;
  let wasInRegression = false;
  S.lastActivityTs = Date.now();
  S.pauseDurationMs = 0;

  S.recordActivity = function () {
    S.lastActivityTs = Date.now();
    S.pauseDurationMs = 0;
  };

  function getExtractUI() {
    return typeof window !== 'undefined' ? window.projectZenExtractUI : null;
  }

  function getCenterFocusElementId() {
    const api = getExtractUI();
    if (!api || !api.getIdsInViewport || !api.getElementRect) return null;
    const ids = api.getIdsInViewport();
    if (ids.length === 0) return null;
    const vh = document.documentElement.clientHeight;
    const centerY = vh / 2;
    let bestId = null, bestDist = Infinity;
    for (const id of ids) {
      const r = api.getElementRect(id);
      if (!r) continue;
      const dist = Math.abs((r.top + r.height / 2) - centerY);
      if (dist < bestDist) { bestDist = dist; bestId = id; }
    }
    return bestId;
  }

  function getIndexById(id) {
    const api = getExtractUI();
    if (!api) return -1;
    const el = document.querySelector(`[${api.DATA_ATTR}="${id}"]`);
    if (!el) return -1;
    const all = document.querySelectorAll(`[${api.DATA_ATTR}]`);
    for (let i = 0; i < all.length; i++) if (all[i] === el) return i;
    return -1;
  }

  function tick() {
    const api = getExtractUI();
    if (!api || !api.getIdsInViewport) return;
    const ids = api.getIdsInViewport();
    const focusId = getCenterFocusElementId();
    const increment = DWELL_TICK_MS / 1000;
    for (const id of ids) S.dwellByElementId[id] = (S.dwellByElementId[id] || 0) + increment;
    if (focusId) S.dwellByElementId[focusId] = (S.dwellByElementId[focusId] || 0) + increment * 0.5;
    for (const id of ids) {
      const idx = getIndexById(id);
      if (idx >= 0) seenIndices.add(idx);
    }
    const currentIndices = ids.map(getIndexById).filter(function (i) { return i >= 0; });
    const maxSeen = currentIndices.length ? Math.max.apply(null, currentIndices) : -1;
    if (maxSeen > furthestReadIndex) furthestReadIndex = maxSeen;
    const topIndex = focusId !== null ? getIndexById(focusId) : -1;
    const inRegression = topIndex >= 0 && furthestReadIndex >= 0 && topIndex <= furthestReadIndex - REGRESSION_INDEX_THRESHOLD;
    if (inRegression && !wasInRegression) S.regressionCount += 1;
    wasInRegression = inRegression;
    const now = Date.now();
    if (now - S.lastActivityTs >= PAUSE_THRESHOLD_MS) S.pauseDurationMs = now - S.lastActivityTs;
  }

  function onKeyDown() {
    S.recordActivity();
  }

  S.startDwell = function () {
    if (tickTimerId !== null) return;
    S.lastActivityTs = Date.now();
    window.addEventListener('keydown', onKeyDown, true);
    tickTimerId = setInterval(tick, DWELL_TICK_MS);
  };

  S.stopDwell = function () {
    window.removeEventListener('keydown', onKeyDown);
    if (tickTimerId !== null) {
      clearInterval(tickTimerId);
      tickTimerId = null;
    }
  };

  S.getState = function () {
    const api = getExtractUI();
    const idsInViewport = api && api.getIdsInViewport ? api.getIdsInViewport() : [];
    return {
      dwellByElementId: Object.assign({}, S.dwellByElementId),
      scrollEntropy: S.scrollEntropy || 0,
      lastInteractionLatencyMs: S.lastInteractionLatencyMs,
      lastClickedElementId: S.lastClickedElementId,
      regressionCount: S.regressionCount,
      pauseDurationMs: S.pauseDurationMs,
      focusedElementId: getCenterFocusElementId(),
      idsInViewport,
    };
  };

  S.resetSignals = function () {
    S.dwellByElementId = {};
    if (S.scrollDeltas) S.scrollDeltas.length = 0;
    S.scrollEntropy = 0;
    S.lastInteractionLatencyMs = null;
    S.lastClickedElementId = null;
    seenIndices.clear();
    furthestReadIndex = -1;
    S.regressionCount = 0;
    wasInRegression = false;
    S.pauseDurationMs = 0;
  };
})();
