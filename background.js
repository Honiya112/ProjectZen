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

  // 5. THRESHOLD BREACH DETECTED (Enriched context + camera frame)
  if (message.type === 'THRESHOLD_BREACH') {
    const { payload } = message;
    console.log('🚨 Threshold breach received from tab:', sender.tab?.id);
    handleThresholdBreach(payload, sender.tab?.id);
    sendResponse({ received: true });
    return true;
  }
});

/**
 * THRESHOLD BREACH HANDLER
 * Receives enriched context (behavioral state + UI snapshot + camera frame) from content script.
 * Sends everything to Gemini for smart adaptation decision.
 */
let pendingThresholdBreach = null;

async function handleThresholdBreach(breachData, tabId) {
  console.log('🚨 Threshold breach received from tab:', tabId);
  console.log('📊 Breach context:', {
    score: breachData.score,
    focusedElement: breachData.focusedElementId,
    hasFrame: !!breachData.cameraFrame,
    timestamp: breachData.timestamp,
  });

  if (!breachData.cameraFrame) {
    console.warn('⚠️ No camera frame captured. Skipping Gemini analysis.');
    return;
  }

  if (!GEMINI_API_KEY) {
    console.warn(
      'Project Zen: Missing GEMINI API key (VITE_GEMINI_API_KEY). Skipping analysis.'
    );
    return;
  }

  try {
    // Send enriched context to Gemini
    const result = await analyzeWithEnrichedContext(
      breachData.cameraFrame,
      breachData
    );

    if (result && result.stressed) {
      console.log('⚠️ Cognitive load confirmed by Gemini. Prompting Zen Mode UI.');
      chrome.tabs.sendMessage(
        tabId,
        {
          type: 'SHOW_ZEN_PROMPT',
          adaptations: result.adaptations || [],
        },
        () => {
          void chrome.runtime.lastError;
        }
      );
    } else {
      console.log('🙂 No cognitive overload confirmed by Gemini.');
    }
  } catch (error) {
    console.error('Error analyzing threshold breach:', error);
  }
}

/**
 * Call Gemini with enriched context: camera frame + behavioral signals + UI snapshot.
 * Returns stress decision and suggested adaptations.
 */
async function analyzeWithEnrichedContext(base64Image, breachData) {
  const commaIdx = base64Image.indexOf(',');
  const base64Data = commaIdx !== -1 ? base64Image.slice(commaIdx + 1) : base64Image;

  // Prepare enriched prompt with context
  const prompt =
    `You are an AI analyzing a user's cognitive load. Using this image and contextual data, decide:
1. If the person appears stressed/overloaded
2. What UI adaptations would help

CONTEXT:
- Stress Score: ${(breachData.score * 100).toFixed(0)}%
- Focused Element: ${breachData.focusedElementId || 'unknown'}
- Behavioral Factors: ${JSON.stringify(breachData.factors || {})}

ANSWER with EXACTLY one word: YES if they appear stressed, otherwise NO.`;

  const url = `${GEMINI_ENDPOINT}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

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
      temperature: 0.2,
      maxOutputTokens: 16,
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
    console.warn('Gemini returned no text response.');
    return { stressed: false };
  }

  const normalized = String(answer).trim().toUpperCase();
  const stressed = normalized.startsWith('Y');

  return {
    stressed,
    text: answer,
    adaptations: [], // Can be extended with semantic adaptations from Gemini
  };
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