/**
 * Project Zen - Magnify component
 * The 3D focus card for specific text (focus-paragraph effect).
 * Styling is in zen-mode.css (.focus-paragraph); this module can create standalone magnify cards if needed.
 */

(function () {
  function wrapInMagnify(el) {
    if (!el || !el.classList) return el;
    el.classList.add('focus-paragraph');
    return el;
  }

  if (typeof window !== 'undefined') {
    window.projectZenComponents = window.projectZenComponents || {};
    window.projectZenComponents.Magnify = { wrapInMagnify };
  }
})();
