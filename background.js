/**
 * Project Zen - Background Service Worker
 * Handles AI logic, state persistence, and messaging between popup and content.
 */

// Extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      zenEnabled: false,
      isTracking: false,
      aiModel: 'gemini',
      lastSession: Date.now()
    });
  } else if (details.reason === 'update') {
    console.log('Project Zen updated');
  }
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOGGLE_ZEN') {
    chrome.storage.local.get(['zenEnabled'], (result) => {
      const newState = !result.zenEnabled;
      chrome.storage.local.set({ zenEnabled: newState });
      sendResponse({ zenEnabled: newState });
    });
    return true; // async response
  }

  if (message.type === 'GET_ZEN_STATE') {
    chrome.storage.local.get(['zenEnabled'], (result) => {
      sendResponse({ zenEnabled: result.zenEnabled ?? false });
    });
    return true;
  }

  if (message.type === 'AI_REQUEST') {
    handleAIRequest(message.payload)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'BROADCAST_STATE') {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
          chrome.tabs.sendMessage(tab.id, { type: 'ZEN_STATE_CHANGED', zenEnabled: message.zenEnabled }).catch(() => {});
        }
      });
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'CAMERA_FRAME') {
    const { frame } = message;
    if (typeof frame === 'string' && frame.startsWith('data:image/jpeg')) {
      // Handle frame (e.g. forward to AI, store, or analyze)
      handleCameraFrame(frame, sender.tab?.id);
    }
    sendResponse({ received: true });
    return false;
  }
});

/**
 * Handle a Base64 JPEG frame from content script (when isTracking is on).
 */
function handleCameraFrame(base64DataUrl, tabId) {
  // Placeholder: log length only; wire to AI/analysis as needed
  if (base64DataUrl && base64DataUrl.length) {
    console.log('Project Zen: camera frame received', base64DataUrl.length, 'chars', tabId != null ? `(tab ${tabId})` : '');
  }
}

/**
 * AI request handler - integrate with Gemini Live or other AI backend
 */
async function handleAIRequest(payload) {
  // Placeholder for AI logic; wire to lib/gemini-live.js via import in real implementation
  const { action, data } = payload || {};
  switch (action) {
    case 'analyze':
      return { status: 'ready', message: 'AI analysis pipeline ready' };
    case 'suggest':
      return { status: 'ready', suggestions: [] };
    default:
      return { status: 'received', action };
  }
}
