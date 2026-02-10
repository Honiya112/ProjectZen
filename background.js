/**
 * Project Zen - Background Service Worker
 * Handles AI logic, state persistence, and messaging between popup and content.
 */

// --- Gemini configuration (loaded at runtime from config.json) ---
import { GEMINI_API_KEY } from './src/config.js';
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com';
const GEMINI_MODEL = 'gemini-flash-latest';

// Extension install/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[ProjectZen] ✅ Extension installed. Please set your Gemini API key in the popup.');
    chrome.storage.local.set({
      zenEnabled: false,
      isTracking: false,
      aiModel: 'gemini',
      lastSession: Date.now(),
    });
  } else if (details.reason === 'update') {
    console.log('[ProjectZen] ✅ Extension updated. API key will be retained if previously set.');
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
    console.log('[ProjectZen] 🚨 Threshold breach received from tab:', sender.tab?.id);
    handleThresholdBreach(payload, sender.tab?.id);
    sendResponse({ received: true });
    return true;
  }
});

/**
 * Format behavioral factors into a readable summary for Gemini prompt
 */
function formatBehavioralFactors(factors) {
  if (!factors || Object.keys(factors).length === 0) {
    return 'No signal data available';
  }
  
  const parts = [];
  
  if (factors.scrollEntropy !== undefined) {
    parts.push(`Scroll Erraticism: ${(factors.scrollEntropy * 100).toFixed(0)}%`);
  }
  if (factors.regressions !== undefined) {
    parts.push(`Backward Scrolls: ${(factors.regressions * 100).toFixed(0)}%`);
  }
  if (factors.pause !== undefined) {
    parts.push(`Attention Pause: ${(factors.pause * 100).toFixed(0)}%`);
  }
  if (factors.interactionLatency !== undefined) {
    parts.push(`Interaction Lag: ${(factors.interactionLatency * 100).toFixed(0)}%`);
  }
  if (factors.dwellStuck !== undefined) {
    parts.push(`Element Focus Stall: ${(factors.dwellStuck * 100).toFixed(0)}%`);
  }
  
  return parts.length > 0 ? parts.join(', ') : 'No signal data available';
}

/**
 * THRESHOLD BREACH HANDLER
 * Receives enriched context (behavioral state + UI snapshot + camera frame) from content script.
 * Sends everything to Gemini for smart adaptation decision.
 */
let pendingThresholdBreach = null;

async function handleThresholdBreach(breachData, tabId) {
  console.log('[ProjectZen] 🚨 THRESHOLD BREACH HANDLER triggered for tab:', tabId);
  console.log('[ProjectZen] 📊 Breach data:', {
    'Stress Score': (breachData.score * 100).toFixed(1) + '%',
    'Persistence Duration': breachData.persistenceSec + 's',
    'Stress Trend': breachData.trend,
    'Average Stress': breachData.averageStress ? (breachData.averageStress * 100).toFixed(1) + '%' : 'N/A',
    'Camera Frame': breachData.cameraFrame ? 'YES (' + breachData.cameraFrame.length + ' chars)' : 'NO',
    'UI Snapshot Elements': breachData.uiSnapshot?.elements?.length || 'N/A',
  });

  if (!breachData.cameraFrame) {
    console.warn('[ProjectZen] ⚠️ No camera frame captured. Skipping Gemini analysis.');
    return;
  }

  if (!GEMINI_API_KEY) {
    console.warn(
      '[ProjectZen:Error] ⚠️ Gemini API key not available. Ensure config.json is present and contains VITE_GEMINI_API_KEY. Skipping analysis.'
    );
    return;
  }

  try {
    console.log('[ProjectZen] 🔄 Calling Gemini API for adaptation decision...');
    // Send enriched context to Gemini for adaptation decision
    const result = await analyzeWithEnrichedContext(
      breachData.cameraFrame,
      breachData
    );

    console.log('[ProjectZen] 📋 Gemini result received:', result);

    if (result && result.decision === 'ADAPT') {
      console.log('[ProjectZen] ✅ Adaptation warranted. Mode:', result.mode, 'Targets:', result.targets);
      console.log('[ProjectZen] 📤 Sending adaptation strategy to content script...');
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
            payload: result.payload,
          },
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error('[ProjectZen:Error] Failed to send adaptation to content script:', chrome.runtime.lastError);
          } else {
            console.log('[ProjectZen] ✅ Adaptation strategy sent to content script');
          }
        }
      );
    } else {
      console.log('[ProjectZen] ℹ️ No UI adaptation needed at this time (decision:', (result?.decision || 'UNKNOWN') + ')');
    }
  } catch (error) {
    console.error('[ProjectZen:Error] Error analyzing threshold breach:', error.message || error);
  }
}

/**
 * Format per-element stress contributions into readable summary for Gemini.
 */
function formatPerElementStress(perElementStress, uiSnapshot) {
  if (!perElementStress || Object.keys(perElementStress).length === 0) {
    return 'No per-element stress data available.';
  }
  
  // Get top stress contributors
  const entries = Object.entries(perElementStress)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5); // Top 5 elements
  
  const descriptions = entries.map(([elementId, stress]) => {
    const element = uiSnapshot?.elements?.find(el => el.id === elementId);
    const preview = element?.textPreview ? ` "${element.textPreview}"` : '';
    return `${elementId}${preview}: ${(stress * 100).toFixed(0)}%`;
  });
  
  return descriptions.length > 0 ? descriptions.join('; ') : 'No high-stress elements';
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

  const pageContent = breachData.pageText 
    ? breachData.pageText 
    : "No text content available.";

  // Format per-element stress contributions
  const elementStressInfo = breachData.perElementStress ? 
    `Elements contributing most to stress:\n${formatPerElementStress(breachData.perElementStress, breachData.uiSnapshot)}` :
    'No per-element stress data available.';

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
- Stress Trend: ${breachData.trend || 'unknown'} (increasing/steady/decreasing)
- Average Stress Level: ${breachData.averageStress ? (breachData.averageStress * 100).toFixed(0) + '%' : 'unknown'}
- Persistence Duration: ${breachData.persistenceSec || 'unknown'} seconds

HIGH-STRESS ELEMENTS:
${elementStressInfo}

FOCUSED UI CONTEXT:
- Focused Element ID: ${breachData.focusedElementId || 'unknown'}
- Elements in Viewport: ${(breachData.idsInViewport || []).length}
- Page Text: "${(breachData.pageText || '').substring(0, 5000)}..."

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
5. IF mode is CONTENT_PRIORITIZATION, generate a 'payload' with 3 key takeaways and 2 definitions from the text.
6. Create a "summary" of exactly 5 sentences covering the main points.

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
  "rationale": "One concise sentence explaining the decision",
  "payload": {
    "title": "Topic Summary",
    "summary": "Write 5 sentences summarizing the content here.",
    "takeaways": ["Point 1", "Point 2", "Point 3"], 
    "concepts": [{"term": "Word", "definition": "Def"}] 
  }
}`;

  const url = `${GEMINI_ENDPOINT}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  
  console.log('[ProjectZen] 📡 Sending request to Gemini API:', url.split('?')[0]);
  console.log('[ProjectZen] 📄 Prompt preview (first 400 chars):', prompt.substring(0, 400) + '...');

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
      maxOutputTokens: 8192,
      responseMimeType: "application/json"
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[ProjectZen:Error] Gemini API error:', res.status, res.statusText);
    console.error('[ProjectZen:Error] Response:', text.substring(0, 500));
    throw new Error(
      `Gemini API error: ${res.status} ${res.statusText} – ${text}`
    );
  }

  const data = await res.json();
  console.log('[ProjectZen] 📥 Gemini response received (status 200)');
  console.log('[ProjectZen] 📊 Full response object:', JSON.stringify(data).substring(0, 800) + '...');
  
  const answerText =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ??
    data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ') ??
    '';

  console.log('[ProjectZen] 📝 Extracted Gemini text:', answerText.substring(0, 600));

  if (!answerText) {
    console.warn('[ProjectZen] Gemini returned no text response.');
    return { decision: 'NO_ACTION', confidence: 0, mode: 'NONE' };
  }

  // Parse JSON response from Gemini
  let parsedResponse;
  try {
    // Try to extract JSON from response (in case Gemini adds extra text)
    const jsonMatch = answerText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      console.log('[ProjectZen] 🔍 Found JSON in response, parsing...');
      parsedResponse = JSON.parse(jsonMatch[0]);
      console.log('[ProjectZen] ✅ Successfully parsed JSON response');
    } else {
      throw new Error('No JSON found in response');
    }
  } catch (parseErr) {
    console.warn('[ProjectZen] Failed to parse Gemini response as JSON:', answerText, parseErr);
    return { decision: 'NO_ACTION', confidence: 0, mode: 'NONE' };
  }

  console.log('[ProjectZen] ✅ FINAL ADAPTATION DECISION:', JSON.stringify(parsedResponse, null, 2));

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