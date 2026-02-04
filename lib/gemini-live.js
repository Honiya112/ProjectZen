/**
 * Project Zen - Gemini Live integration
 * Client for AI / live API; use from background or popup via messaging.
 */

const GEMINI_LIVE = {
  defaultEndpoint: 'https://generativelanguage.googleapis.com',
  defaultModel: 'gemini-2.0-flash-exp',

  /**
   * Create a session config for live/streaming use.
   * @param {Object} options - { apiKey, model, systemInstruction }
   * @returns {Object} config for fetch/WebSocket
   */
  getConfig(options = {}) {
    const { apiKey, model = this.defaultModel, systemInstruction } = options;
    return {
      endpoint: this.defaultEndpoint,
      model,
      apiKey: apiKey || '',
      systemInstruction: systemInstruction || 'You are a calm, focused assistant for Project Zen.',
    };
  },

  /**
   * Placeholder for async AI request (implement with your API key and endpoint).
   * @param {string} prompt
   * @param {Object} config
   * @returns {Promise<Object>}
   */
  async sendPrompt(prompt, config = {}) {
    const { endpoint, model, apiKey } = this.getConfig(config);
    if (!apiKey) {
      return { error: 'Missing API key', response: null };
    }
    const url = `${endpoint}/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    };
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
      return { response: text, raw: data };
    } catch (err) {
      return { error: err.message, response: null };
    }
  },
};

// Export for use in extension context (e.g. background via importScripts if needed)
if (typeof globalThis !== 'undefined') {
  globalThis.GeminiLive = GEMINI_LIVE;
}
