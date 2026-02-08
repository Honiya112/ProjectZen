/**
 * Project Zen - Apply UI
 * Maps Semantic JSON from Gemini to actual glass components (zen reader, focus, etc.).
 */

(function () {
  function setZenMode(enabled) {
    const root = document.documentElement;
    if (enabled) {
      root.classList.add('zen-mode-active');
      if (document.body) document.body.classList.add('zen-mode-active');
    } else {
      root.classList.remove('zen-mode-active');
      if (document.body) document.body.classList.remove('zen-mode-active');
    }
  }

  function showZenPrompt() {
    if (document.getElementById('zen-prompt-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'zen-prompt-overlay';
    overlay.innerHTML =
      '<div class="zen-card">' +
      '<div class="zen-icon">🧘‍♂️</div>' +
      '<h3>Need a Focus Boost?</h3>' +
      '<p>You look a bit overwhelmed. Want to switch to Zen Mode?</p>' +
      '<div class="zen-actions">' +
      '<button id="zen-yes">Yes, please</button>' +
      '<button id="zen-no">Not now</button>' +
      '</div></div>';
    document.body.appendChild(overlay);
    document.getElementById('zen-yes').onclick = function () {
      setZenMode(true);
      overlay.remove();
    };
    document.getElementById('zen-no').onclick = function () {
      overlay.remove();
    };
  }

  /** Build zen reader overlay with magnifying focus (from semantic/context). */
  function applyZenReader(semantic) {
    let primaryColor = window.getComputedStyle(document.body).backgroundColor;
    if (!primaryColor || primaryColor === 'rgba(0, 0, 0, 0)' || primaryColor === 'rgb(255, 255, 255)') {
      const header = document.querySelector('header, nav, .navbar');
      if (header) primaryColor = window.getComputedStyle(header).backgroundColor;
    }
    if (!primaryColor || primaryColor === 'rgb(255, 255, 255)') {
      primaryColor = 'rgba(226, 232, 240, 0.6)';
    }

    const articleRoot =
      document.querySelector('#mw-content-text .mw-parser-output') ||
      document.querySelector('article') ||
      document.querySelector('main') ||
      document.querySelector('#content') ||
      document.body;

    const overlay = document.createElement('div');
    overlay.id = 'zen-reader-view';
    overlay.style.setProperty('--zen-bg-1', primaryColor);
    overlay.style.setProperty('--zen-bg-2', primaryColor.replace('rgb', 'rgba').replace(')', ', 0.5)'));

    const column = document.createElement('div');
    column.className = 'zen-reader-column';
    column.innerHTML =
      '<div class="summary-card"><p class="summary-content">✨ <b>AI Briefing:</b> Environment adapted to page context. Focus magnifier active.</p></div>' +
      '<h1>' + document.title.split('-')[0].trim() + '</h1>';

    Array.from(articleRoot.children).forEach(function (node) {
      if (['NAV', 'HEADER', 'FOOTER', 'ASIDE', 'FORM', 'SCRIPT', 'STYLE'].indexOf(node.tagName) >= 0) return;
      if (node.classList && (node.classList.contains('mw-editsection') || node.classList.contains('toc'))) return;
      if (['UL', 'OL'].indexOf(node.tagName) >= 0 && node.querySelectorAll('a').length > 5 && node.innerText.length < 200) return;
      var isContent = ['H1','H2','H3','H4'].indexOf(node.tagName) >= 0 ||
        (['P','BLOCKQUOTE','FIGURE','UL','OL'].indexOf(node.tagName) >= 0 && node.innerText.trim().length > 20) ||
        (node.tagName === 'P' && node.querySelector('img'));
      if (!isContent) return;
      var clone = node.cloneNode(true);
      function cleaner(el) {
        el.removeAttribute('class');
        el.removeAttribute('id');
        el.removeAttribute('style');
        if (el.tagName !== 'IMG') { el.removeAttribute('width'); el.removeAttribute('height'); }
        if (el.tagName === 'A') el.target = '_blank';
      }
      cleaner(clone);
      var allChild = clone.querySelectorAll('*');
      for (var j = 0; j < allChild.length; j++) cleaner(allChild[j]);
      var imgs = clone.querySelectorAll('img');
      for (var k = 0; k < imgs.length; k++) { if (!imgs[k].src.startsWith('http')) imgs[k].src = imgs[k].src; }
      column.appendChild(clone);
    });

    overlay.appendChild(column);
    document.body.appendChild(overlay);

    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) entry.target.classList.add('focus-paragraph');
        else entry.target.classList.remove('focus-paragraph');
      });
    }, { root: overlay, rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    column.querySelectorAll('p, h2, h3, li, blockquote').forEach(function (el) { obs.observe(el); });
  }

  if (typeof window !== 'undefined') {
    window.projectZenApplyUI = {
      setZenMode,
      showZenPrompt,
      applyZenReader,
    };
  }
})();
