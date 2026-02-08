/**
 * Project Zen - Gemini client (AI orchestration)
 * Sends signals + UI JSON to Gemini; receives semantic/adaptation response.
 * Used by background service worker (via copy of this logic; extension has no build).
 */

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com';
const GEMINI_MODEL = 'gemini-2.0-flash-exp';

/**
 * Call Gemini with image (and optional signals/UI JSON) for cognitive load or UI adaptation.
 * @param {string} dataUrl - data:image/jpeg;base64,...
 * @param {object} options - { apiKey, signals, uiSnapshot }
 * @returns {Promise<{ stressed?: boolean, text?: string, semantic?: object }>}
 */
async function sendToGemini(dataUrl, options) {
  const apiKey = (options && options.apiKey) || '';
  if (!apiKey) return { stressed: false, text: '' };

  const commaIdx = dataUrl.indexOf(',');
  const base64Data = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;

  const prompt =
    'You are monitoring a person using their webcam. ' +
    'From this single image, decide if they appear to be under high cognitive load, stressed, or overwhelmed. ' +
    'Answer EXACTLY one word: YES if they appear significantly stressed or overloaded, otherwise NO.';

  const parts = [{ text: prompt }];
  if (base64Data) {
    parts.push({
      inline_data: { mime_type: 'image/jpeg', data: base64Data },
    });
  }

  const url = `${GEMINI_ENDPOINT}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 8 },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(function () { return ''; });
    throw new Error('Gemini API error: ' + res.status + ' ' + res.statusText + ' – ' + text);
  }

  const data = await res.json();
  const answer =
    (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) ||
    '';

  const normalized = String(answer).trim().toUpperCase();
  const stressed = normalized.startsWith('Y');

  return {
    stressed,
    text: answer,
    semantic: data,
  };
}

if (typeof window !== 'undefined') {
  window.projectZenGeminiClient = {
    sendToGemini,
    GEMINI_ENDPOINT,
    GEMINI_MODEL,
  };
}
