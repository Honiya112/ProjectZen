/**
 * Project Zen - Clicks signal
 * Tracks rage-clicking or hover patterns; interaction latency (hover/scroll → click).
 */

(function () {
  window.projectZenSignals = window.projectZenSignals || {};
  const S = window.projectZenSignals;

  S.lastHoverTs = 0;
  S.lastInteractionLatencyMs = null;
  S.lastClickedElementId = null;

  function getElementIdAtPoint(x, y) {
    const api = typeof window !== 'undefined' ? window.projectZenExtractUI : null;
    if (!api || !api.DATA_ATTR) return null;
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const tracked = el.closest(`[${api.DATA_ATTR}]`);
    return tracked ? tracked.getAttribute(api.DATA_ATTR) : null;
  }

  function onMouseMove() {
    S.lastHoverTs = Date.now();
    if (S.recordActivity) S.recordActivity();
  }

  function onClick(e) {
    const now = Date.now();
    S.lastInteractionLatencyMs = now - Math.max(S.lastHoverTs, S.lastScrollTs || 0);
    S.lastClickedElementId = getElementIdAtPoint(e.clientX, e.clientY);
    if (S.recordActivity) S.recordActivity();
  }

  S.startClicks = function () {
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('click', onClick, true);
  };

  S.stopClicks = function () {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('click', onClick);
  };
})();
