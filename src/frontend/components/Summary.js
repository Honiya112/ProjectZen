/**
 * Project Zen - Summary component
 * The "AI Briefing" chip shown in Zen reader view.
 */

(function () {
  function render(text) {
    var el = document.createElement('div');
    el.className = 'summary-card';
    el.innerHTML = '<p class="summary-content">' + (text || '✨ <b>AI Briefing:</b> Environment adapted to page context.') + '</p>';
    return el;
  }

  if (typeof window !== 'undefined') {
    window.projectZenComponents = window.projectZenComponents || {};
    window.projectZenComponents.Summary = { render };
  }
})();
