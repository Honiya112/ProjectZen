/**
 * Project Zen - Background Service Worker
 * Handles AI logic, state persistence, and messaging between popup and content.
 */

// --- Gemini configuration (API key comes from .env via Vite build) ---
const GEMINI_API_KEY =
  (typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_GEMINI_API_KEY) ||
  '';

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com';
const GEMINI_MODEL = 'gemini-2.0-flash-exp';

// Throttle how often we call Gemini (camera sends a frame every 3s)
const ANALYSIS_INTERVAL_MS = 12000; // 12s between calls per extension
let lastAnalysisTs = 0;

// Extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      zenEnabled: false,
      isTracking: false,
      aiModel: 'gemini',
      lastSession: Date.now(),
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
          chrome.tabs
            .sendMessage(tab.id, {
              type: 'ZEN_STATE_CHANGED',
              zenEnabled: message.zenEnabled,
            })
            .catch(() => {});
        }
      });
    });
    sendResponse({ ok: true });
    return true;
  }

  // 5. THRESHOLD BREACH DETECTED (Enriched context from content script)
  if (message.type === 'THRESHOLD_BREACH') {
    const { payload } = message;
    console.log('🚨 Threshold breach received from tab:', sender.tab?.id);
    handleThresholdBreach(payload, sender.tab?.id);
    sendResponse({ received: true });
    return true;
  }

  // 6. RECEIVE CAMERA FRAMES (The Bridge to AI)
  if (message.type === 'CAMERA_FRAME') {
    const { frame } = message;
    if (typeof frame === 'string' && frame.startsWith('data:image/jpeg')) {
      handleCameraFrame(frame, sender.tab?.id ?? null);
    }
    sendResponse({ received: true });
    return false; // No async response needed for frame stream
  }
});

/**
 * THRESHOLD BREACH HANDLER
 * Stores breach context from content script. Will be paired with next camera frame for Gemini.
 */
let pendingThresholdBreach = null;

async function handleThresholdBreach(breachData, tabId) {
  console.log('📊 Storing threshold breach context:', {
    score: breachData.score,
    focusedElement: breachData.focusedElementId,
    timestamp: breachData.timestamp,
  });

  // Store the breach context — will be sent with next camera frame
  pendingThresholdBreach = {
    ...breachData,
    tabId,
    timestamp: breachData.timestamp || Date.now(),
  };
}

/**
 * THE AI PROCESSING HUB
 * Send frames to Gemini to check for cognitive load.
 */
async function handleCameraFrame(base64Image, tabId) {
  if (!tabId) return;

  // Throttle calls so we don't spam the API
  const now = Date.now();
  if (now - lastAnalysisTs < ANALYSIS_INTERVAL_MS) {
    return;
  }
  lastAnalysisTs = now;

  console.log(
    `📸 Frame received from Tab ${tabId}. Size: ${base64Image.length} chars`
  );

  if (!GEMINI_API_KEY) {
    console.warn(
      'Project Zen: Missing GEMINI API key (VITE_GEMINI_API_KEY). Skipping analysis.'
    );
    return;
  }

  try {
    const stressed = await analyzeCognitiveLoadWithGemini(base64Image);

    if (stressed) {
      console.log('⚠️ Cognitive load detected. Prompting Zen Mode UI.');
      chrome.tabs.sendMessage(tabId, { type: 'SHOW_ZEN_PROMPT' }, () => {
        // Ignore errors when tab is gone or content script not ready
        void chrome.runtime.lastError;
      });
    } else {
      console.log('🙂 No cognitive overload detected for this frame.');
    }
  } catch (error) {
    console.error('AI Error while analyzing frame:', error);
  }
}

/**
 * Call Gemini 2.0 Flash with an image and get a simple YES/NO answer
 * on whether the person appears cognitively overloaded / stressed.
 * @param {string} dataUrl - data:image/jpeg;base64,...
 * @returns {Promise<boolean>} true if stressed / overloaded
 */
async function analyzeCognitiveLoadWithGemini(dataUrl) {
  // Strip `data:image/jpeg;base64,`
  const commaIdx = dataUrl.indexOf(',');
  const base64Data = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;

  const url = `${GEMINI_ENDPOINT}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const prompt =
    'You are monitoring a person using their webcam. ' +
    'From this single image, decide if they appear to be under high cognitive load, stressed, or overwhelmed. ' +
    'Answer EXACTLY one word: YES if they appear significantly stressed or overloaded, otherwise NO.';

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: base64Data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Gemini API error: ${res.status} ${res.statusText} – ${text}`
    );
  }

  const data = await res.json();
  const answer =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ??
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ') ??
    '';

  if (!answer) {
    console.warn('Gemini returned no text response for cognitive load check.');
    return false;
  }

  const normalized = String(answer).trim().toUpperCase();
  return normalized.startsWith('Y'); // treat YES / Yes / yes as stressed
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
      return { status: 'received', action, data };
  }
}