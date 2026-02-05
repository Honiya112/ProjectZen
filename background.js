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
  // 1. Toggle Zen Mode from Popup
  if (message.type === 'TOGGLE_ZEN') {
    chrome.storage.local.get(['zenEnabled'], (result) => {
      const newState = !result.zenEnabled;
      chrome.storage.local.set({ zenEnabled: newState });
      sendResponse({ zenEnabled: newState });
    });
    return true; // async response
  }

  // 2. Get Current State
  if (message.type === 'GET_ZEN_STATE') {
    chrome.storage.local.get(['zenEnabled'], (result) => {
      sendResponse({ zenEnabled: result.zenEnabled ?? false });
    });
    return true;
  }

  // 3. Handle Generic AI Requests
  if (message.type === 'AI_REQUEST') {
    handleAIRequest(message.payload)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  // 4. Broadcast State Changes
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

  // 5. RECEIVE CAMERA FRAMES (The Bridge to AI)
  if (message.type === 'CAMERA_FRAME') {
    const { frame } = message;
    if (typeof frame === 'string' && frame.startsWith('data:image/jpeg')) {
      handleCameraFrame(frame, sender.tab?.id);
    }
    sendResponse({ received: true });
    return false; // No async response needed for frame stream
  }
});

/**
 * 🧠 THE AI PROCESSING HUB
 * This is where your partner hooks up Gemini.
 */
async function handleCameraFrame(base64Image, tabId) {
  // Debug: Log that we got a frame (remove this later to reduce noise)
  console.log(`📸 Frame received from Tab ${tabId}. Size: ${base64Image.length} chars`);

  try {
    // =================================================================
    // 🧠 PARTNER'S AI TODO LIST:
    // 1. Send 'base64Image' to Gemini Flash 1.5 API
    // 2. Ask: "Is this person stressed? Answer YES or NO."
    // 3. If YES, trigger the Zen Mode prompt:
    //    chrome.tabs.sendMessage(tabId, { type: 'SHOW_ZEN_PROMPT' });
    // =================================================================
    
    // 👇 UNCOMMENT THIS BLOCK TO TEST THE POPUP WITHOUT AI:
    /*
    const randomStressTrigger = Math.random() > 0.95; // 5% chance per frame
    if (randomStressTrigger) {
      console.log("⚠️ Mock Stress Detected! Sending prompt to tab...");
      chrome.tabs.sendMessage(tabId, { action: "showZenPrompt" });
    }
    */

  } catch (error) {
    console.error("AI Error:", error);
  }
}

/**
 * AI request handler - integrate with Gemini Live or other AI backend
 */
async function handleAIRequest(payload) {
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