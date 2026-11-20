import 'server-only';
import { buildPrompt } from './prompt';
import { parseNarration } from './parse';
import { NarrationError, type Narration, type SlideInput } from './types';
import { wordBudget } from './timing';

// Server side only: keys are read from the environment and never sent to the browser or logged.

export interface NarrationResult {
  narrations: Narration[];
  provider: string;
  model: string;
}

const TIMEOUT_MS = 55_000;
const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';

function slideInfo(slides: SlideInput[]) {
  const withoutImages = slides.map(({ imageBase64: _drop, ...rest }) => rest);
  return { prompt: buildPrompt(withoutImages, wordBudget(slides.length)), indexes: slides.map((s) => s.index) };
}

function httpError(provider: string, keyName: string, status: number): NarrationError {
  if (status === 401 || status === 403) return new NarrationError(`${provider} rejected the key. Check ${keyName} in your environment.`, 502);
  if (status === 429) return new NarrationError(`${provider} rate limit reached. Wait a minute and try again.`, 429);
  return new NarrationError(`${provider} returned an error (HTTP ${status}).`, 502);
}

const NARRATION_SCHEMA = {
  type: 'object',
  properties: {
    slides: {
      type: 'array',
      items: {
        type: 'object',
        properties: { index: { type: 'integer' }, narration: { type: 'string' } },
        required: ['index', 'narration'],
      },
    },
  },
  required: ['slides'],
};

/** Gemini "Interactions" API, as documented at aistudio.google.com/docs (Api-Revision 2026-05-20). */
async function gemini(slides: SlideInput[]): Promise<NarrationResult> {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new NarrationError('GOOGLE_API_KEY is not set. Add it to your environment, or set LLM_PROVIDER=mock to try the app without a model.', 503);
  const model = process.env.LLM_MODEL || DEFAULT_GEMINI_MODEL;
  const { prompt, indexes } = slideInfo(slides);

  const input: unknown[] = [{ type: 'text', text: prompt }];
  for (const s of slides) {
    if (!s.imageBase64) continue;
    input.push({ type: 'text', text: `Image of slide ${s.index}:` });
    input.push({ type: 'image', data: s.imageBase64, mime_type: 'image/jpeg' });
  }

  const call = (withSchema: boolean) =>
    fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Api-Revision': '2026-05-20', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input,
        ...(withSchema ? { response_format: { type: 'text', mime_type: 'application/json', schema: NARRATION_SCHEMA } } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  let res = await call(true);
  // If this API revision rejects the schema option, the prompt alone still asks for JSON.
  if (res.status === 400) res = await call(false);
  if (!res.ok) throw httpError('Gemini', 'GOOGLE_API_KEY', res.status);

  const body = (await res.json()) as { steps?: { type?: string; content?: { type?: string; text?: string }[] }[] };
  const text = (body.steps ?? [])
    .filter((s) => s.type === 'model_output')
    .flatMap((s) => s.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('');
  if (!text) throw new NarrationError('Gemini returned no text. Try again.');
  return { narrations: parseNarration(text, indexes), provider: 'gemini', model };
}

/** Groq, via its OpenAI-compatible endpoint. Text only: slide images are not sent. */
async function groq(slides: SlideInput[]): Promise<NarrationResult> {
  const key = process.env.GROQ_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!key) throw new NarrationError('GROQ_API_KEY is not set.', 503);
  if (!model) throw new NarrationError('Set LLM_MODEL to a Groq model id when LLM_PROVIDER=groq.', 503);
  const { prompt, indexes } = slideInfo(slides);

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw httpError('Groq', 'GROQ_API_KEY', res.status);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw new NarrationError('Groq returned no text. Try again.');
  return { narrations: parseNarration(text, indexes), provider: 'groq', model };
}

/** No model at all: stitches a line from each slide's own text. For trying the app and for tests. */
async function mock(slides: SlideInput[]): Promise<NarrationResult> {
  const max = wordBudget(slides.length);
  const narrations = slides.map((s) => {
    const body = s.notes || s.paragraphs.join('. ');
    const words = `${s.title ?? 'This slide'}. ${body}`.split(/\s+/).filter(Boolean).slice(0, max);
    return { index: s.index, narration: body || s.title ? `${words.join(' ').replace(/[.,;:]*$/, '')}.` : '' };
  });
  return { narrations, provider: 'mock', model: 'none' };
}

export async function generateNarration(slides: SlideInput[]): Promise<NarrationResult> {
  const provider = (process.env.LLM_PROVIDER || 'gemini').toLowerCase();
  if (provider === 'gemini') return gemini(slides);
  if (provider === 'groq') return groq(slides);
  if (provider === 'mock') return mock(slides);
  throw new NarrationError(`Unknown LLM_PROVIDER "${provider}". Use gemini, groq or mock.`, 503);
}
