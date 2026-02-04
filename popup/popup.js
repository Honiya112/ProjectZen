/**
 * Project Zen - Popup script
 * Syncs toggle with storage and notifies content/background.
 */

const zenSwitch = document.getElementById('zen-switch');
const zenStatus = document.getElementById('zen-status');

function setUI(zenEnabled) {
  zenSwitch.checked = zenEnabled;
  zenStatus.textContent = zenEnabled ? 'On' : 'Off';
  zenStatus.classList.toggle('on', zenEnabled);
}

// Load saved state on open
chrome.storage.local.get(['zenEnabled'], (result) => {
  const enabled = result.zenEnabled ?? false;
  setUI(enabled);
});

// Toggle on switch change
zenSwitch.addEventListener('change', () => {
  chrome.runtime.sendMessage({ type: 'TOGGLE_ZEN' }, (response) => {
    if (chrome.runtime.lastError) return;
    const enabled = response?.zenEnabled ?? zenSwitch.checked;
    setUI(enabled);
    chrome.runtime.sendMessage({ type: 'BROADCAST_STATE', zenEnabled: enabled });
  });
});
