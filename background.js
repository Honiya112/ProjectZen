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
    // Send enriched context to Gemini for adaptation decision
    const result = await analyzeWithEnrichedContext(
      breachData.cameraFrame,
      breachData
    );

    if (result && result.decision === 'ADAPT') {
      console.log('✅ Adaptation warranted. Mode:', result.mode, 'Targets:', result.targets);
      chrome.tabs.sendMessage(
        tabId,
        {
          type: 'SHOW_ZEN_PROMPT',
          adaptationStrategy: {
            mode: result.mode,
            targets: result.targets || [],
            duration: result.duration_sec || 60,
            cooldown: result.cooldown_sec || 300,
            rationale: result.rationale,
            confidence: result.confidence,
          },
        },
        () => {
          void chrome.runtime.lastError;
        }
      );
    } else {
      console.log('ℹ️ No UI adaptation needed at this time.');
    }
  } catch (error) {
    console.error('Error analyzing threshold breach:', error);
  }
}

/**
 * Format behavioral factors into human-readable text for Gemini prompt.
 */
function formatBehavioralFactors(factors) {
  const descriptions = [];
  if (factors.pause) descriptions.push(`Pause: ${(factors.pause * 100).toFixed(0)}%`);
  if (factors.scrollEntropy) descriptions.push(`Scroll Entropy: ${(factors.scrollEntropy * 100).toFixed(0)}%`);
  if (factors.regressions) descriptions.push(`Regressions: ${(factors.regressions * 100).toFixed(0)}%`);
  if (factors.interactionLatency) descriptions.push(`Interaction Latency: ${(factors.interactionLatency * 100).toFixed(0)}%`);
  if (factors.dwellStuck) descriptions.push(`Dwell Stuck: ${(factors.dwellStuck * 100).toFixed(0)}%`);
  return descriptions.length > 0 ? descriptions.join('; ') : 'No behavioral signals';
}

/**
 * Format UI snapshot into human-readable structure for Gemini prompt.
 */
function formatUISnapshot(snapshot) {
  if (!snapshot || !snapshot.elements || snapshot.elements.length === 0) {
    return 'No UI elements tracked.';
  }
  
  // Group elements by role for readability
  const byRole = {};
  snapshot.elements.forEach((el) => {
    if (!byRole[el.role]) byRole[el.role] = [];
    byRole[el.role].push(el);
  });
  
  // Format grouped structure
  const lines = [];
  Object.keys(byRole).forEach((role) => {
    const elements = byRole[role];
    lines.push(`  [${role}] ${elements.length} element(s)`);
    elements.slice(0, 2).forEach((el) => {
      const preview = el.textPreview ? ` - "${el.textPreview}"` : '';
      lines.push(`    - ${el.id}${preview}`);
    });
    if (elements.length > 2) {
      lines.push(`    - ... and ${elements.length - 2} more`);
    }
  });
  
  return lines.join('\n');
}

/**
 * Call Gemini with enriched context: camera frame + behavioral signals + UI snapshot.
 * Gemini decides whether UI adaptation is warranted and what strategy to use.
 * Returns adaptation decision and strategy (no emotion diagnosis).
 */
async function analyzeWithEnrichedContext(base64Image, breachData) {
  const commaIdx = base64Image.indexOf(',');
  const base64Data = commaIdx !== -1 ? base64Image.slice(commaIdx + 1) : base64Image;

  // Format UI snapshot for readability
  const uiStructure = breachData.uiSnapshot ? 
    `${formatUISnapshot(breachData.uiSnapshot)}` : 
    'No UI elements tracked.';

  // Prepare comprehensive prompt for Gemini to decide on adaptations
  const prompt = `You are an AI assistant helping decide whether a user interface should adapt to reduce interaction friction and visual complexity.

IMPORTANT CONSTRAINTS:
- Do NOT diagnose emotions, stress, or mental health states.
- Do NOT generate UI code (HTML/CSS).
- Reason only about interaction difficulty and visual load.
- The camera image is confirmatory, not primary evidence.

INPUT CONTEXT:

BEHAVIORAL SIGNALS (primary evidence):
- Cognitive Load Score: ${(breachData.score * 100).toFixed(0)}%
- Signal Contributors: ${formatBehavioralFactors(breachData.factors || {})}
- Persistence Duration: ${breachData.persistenceSec || 'unknown'} seconds

FOCUSED UI CONTEXT:
- Focused Element ID: ${breachData.focusedElementId || 'unknown'}
- Elements in Viewport: ${(breachData.idsInViewport || []).length}

UI STRUCTURE SNAPSHOT:
${uiStructure}

CAMERA FRAME (confirmation):
- Low-resolution frame provided only to verify physical attention strain (e.g., prolonged stillness, gaze fixation).
- Do NOT infer emotions.

TASK:
1. Decide whether UI adaptation is warranted to reduce interaction friction.
2. If yes, choose an adaptation STRATEGY (not implementation).
3. Specify targets abstractly (by element role or ID).
4. Provide a short rationale grounded in the behavioral signals.

OUTPUT FORMAT (STRICT JSON ONLY):
{
  "decision": "ADAPT" | "NO_ACTION",
  "confidence": 0.0-1.0,
  "mode": "FOCUS_SIMPLIFICATION" | "VISUAL_REDUCTION" | "CONTENT_PRIORITIZATION" | "NONE",
  "targets": [
    { "element_id": "...", "intent": "highlight | deprioritize | collapse" }
  ],
  "duration_sec": number,
  "cooldown_sec": number,
  "rationale": "One concise sentence explaining the decision"
}`;

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
      temperature: 0.3,
      maxOutputTokens: 256,
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
  const answerText =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ??
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ') ??
    '';

  if (!answerText) {
    console.warn('Gemini returned no text response.');
    return { decision: 'NO_ACTION', confidence: 0, mode: 'NONE' };
  }

  // Parse JSON response from Gemini
  let parsedResponse;
  try {
    // Try to extract JSON from response (in case Gemini adds extra text)
    const jsonMatch = answerText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsedResponse = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('No JSON found in response');
    }
  } catch (parseErr) {
    console.warn('Failed to parse Gemini response as JSON:', answerText, parseErr);
    return { decision: 'NO_ACTION', confidence: 0, mode: 'NONE' };
  }

  console.log('✅ Gemini adaptation decision:', parsedResponse);

  return parsedResponse;
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