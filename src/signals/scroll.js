/**
 * Project Zen - Scroll signal
 * Tracks speed/direction to detect "lost" users (scroll entropy: reversals, non-linear patterns).
 */

(function () {
  const SCROLL_HISTORY_SIZE = 12;

  window.projectZenSignals = window.projectZenSignals || {};
  const S = window.projectZenSignals;

  let lastScrollTop = null;
  S.scrollDeltas = [];
  S.scrollEntropy = 0;
  S.lastScrollTs = 0;

  function onScroll() {
    const st = document.documentElement.scrollTop ?? document.body?.scrollTop ?? 0;
    if (lastScrollTop !== null) {
      const delta = st - lastScrollTop;
      S.scrollDeltas.push(delta);
      if (S.scrollDeltas.length > SCROLL_HISTORY_SIZE) S.scrollDeltas.shift();
      let reversals = 0;
      for (let i = 1; i < S.scrollDeltas.length; i++) {
        const a = S.scrollDeltas[i - 1], b = S.scrollDeltas[i];
        if ((a > 0 && b < 0) || (a < 0 && b > 0)) reversals += 1;
      }
      S.scrollEntropy = reversals;
    }
    lastScrollTop = st;
    S.lastScrollTs = Date.now();
    if (S.recordActivity) S.recordActivity();
  }

  S.startScroll = function () {
    lastScrollTop = document.documentElement.scrollTop ?? document.body?.scrollTop ?? 0;
    S.scrollDeltas = [];
    window.addEventListener('scroll', onScroll, { passive: true });
  };

  S.stopScroll = function () {
    window.removeEventListener('scroll', onScroll);
  };
})();
