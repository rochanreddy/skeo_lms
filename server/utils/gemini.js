// A small client for Google's Gemini API (generativelanguage.googleapis.com),
// used by the AI grader. Plain fetch, no SDK.
//
// GEMINI_API_KEY   required; AI grading is off without it
// GEMINI_MODEL     optional; defaults to gemini-3.5-flash
//
// Models are retired on Google's schedule, not ours (2.0 and 2.5 Flash already
// were for new keys), and a new one can be slow or overloaded for a while after
// launch. So a call walks a short list: the configured model first, then
// Google's rolling "latest" aliases, and only gives up when all have failed.
const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3.5-flash';
const FALLBACKS = ['gemini-flash-latest', 'gemini-3.5-flash-lite'];

export const geminiConfigured = () => Boolean(process.env.GEMINI_API_KEY);

const modelList = () => [...new Set([process.env.GEMINI_MODEL || DEFAULT_MODEL, ...FALLBACKS])];

/**
 * generateJson({ system, parts, schema }) -> { data, model }
 * Sends one user turn (text and inline files) and returns the parsed JSON the
 * model wrote against `schema` (Gemini's OpenAPI-subset response schema).
 */
export async function generateJson({ system, parts, schema, temperature = 0.2, timeoutMs = 120_000 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set.');
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema },
  });

  let lastError = null;
  for (const model of modelList()) {
    try {
      const res = await fetch(`${API}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        lastError = new Error(`${model}: HTTP ${res.status}${json?.error?.message ? ` ${json.error.message}` : ''}`);
        // A bad key fails the same way on every model.
        if (res.status === 401 || res.status === 403) break;
        continue;
      }
      const candidate = json?.candidates?.[0];
      const text = (candidate?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
      if (!text) {
        lastError = new Error(`${model}: no answer (${candidate?.finishReason || json?.promptFeedback?.blockReason || 'empty response'})`);
        continue;
      }
      try {
        return { data: JSON.parse(text), model };
      } catch {
        lastError = new Error(`${model}: answer was not valid JSON`);
      }
    } catch (err) {
      lastError = new Error(`${model}: ${err.name === 'TimeoutError' ? 'timed out' : err.message}`);
    }
  }
  throw lastError || new Error('No Gemini model answered.');
}
