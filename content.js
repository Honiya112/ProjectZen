/**
 * Project Zen - Content Script
 * DOM manipulation and zen-mode UI injection.
 */

let zenActive = false;
const ZEN_ATTR = 'data-project-zen';

function init() {
  chrome.runtime.sendMessage({ type: 'GET_ZEN_STATE' }, (response) => {
    if (chrome.runtime.lastError) return;
    setZenMode(response?.zenEnabled ?? false);
  });
}

function setZenMode(enabled) {
  zenActive = enabled;
  document.documentElement.setAttribute(ZEN_ATTR, enabled ? 'on' : 'off');
  document.body?.classList.toggle('zen-mode', enabled);
}

function toggleZenMode() {
  zenActive = !zenActive;
  document.documentElement.setAttribute(ZEN_ATTR, zenActive ? 'on' : 'off');
  document.body?.classList.toggle('zen-mode', zenActive);
  return zenActive;
}

// Listen for state changes from popup/background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'ZEN_STATE_CHANGED' && typeof message.zenEnabled === 'boolean') {
    setZenMode(message.zenEnabled);
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
