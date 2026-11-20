import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateNarration } from '@/lib/narration/providers';
import { NarrationError } from '@/lib/narration/types';

const slides = [
  { index: 1, title: 'Growth', paragraphs: ['Users up 32%'], notes: 'Driven by onboarding.', imageAlts: [], imageBase64: 'QUJD' },
  { index: 2, title: 'Links', paragraphs: [], notes: '', imageAlts: [] },
];

const geminiBody = (text: string) => ({
  steps: [
    { type: 'thought', content: [] },
    { type: 'model_output', content: [{ type: 'text', text }] },
  ],
});

const jsonResponse = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

beforeEach(() => {
  vi.stubEnv('LLM_PROVIDER', 'gemini');
  vi.stubEnv('GOOGLE_API_KEY', 'test-key-value');
  vi.stubEnv('LLM_MODEL', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('gemini provider', () => {
  it('calls the Interactions endpoint with the key header, the image and a JSON schema, and parses the reply', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        jsonResponse(geminiBody('{"slides":[{"index":1,"narration":"Growth was strong."},{"index":2,"narration":""}]}')),
      );

    const out = await generateNarration(slides);

    expect(out.narrations).toEqual([
      { index: 1, narration: 'Growth was strong.' },
      { index: 2, narration: '' },
    ]);
    expect(out.provider).toBe('gemini');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/interactions');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('test-key-value');
    expect(headers['Api-Revision']).toBe('2026-05-20');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.model).toBe('gemini-4-hydrogen');
    expect(body.response_format.mime_type).toBe('application/json');
    expect(body.input.some((p: { type: string; data?: string }) => p.type === 'image' && p.data === 'QUJD')).toBe(true);
    // The key must never be placed in the body or the URL.
    expect(JSON.stringify(body)).not.toContain('test-key-value');
    expect(String(url)).not.toContain('test-key-value');
  });

  it('retries once without the schema option when the first call is rejected with 400', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(() => jsonResponse({ error: 'bad response_format' }, 400))
      .mockImplementationOnce(() => jsonResponse(geminiBody('{"slides":[{"index":1,"narration":"Hi."}]}')));
    await generateNarration([slides[0]]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body)).response_format).toBeUndefined();
  });

  it('explains a missing key by variable name only', async () => {
    vi.stubEnv('GOOGLE_API_KEY', '');
    await expect(generateNarration(slides)).rejects.toThrow(/GOOGLE_API_KEY is not set/);
  });

  it('maps 429 and 403 to readable errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => jsonResponse({}, 429));
    await expect(generateNarration(slides)).rejects.toMatchObject({ status: 429 });
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => jsonResponse({}, 403));
    await expect(generateNarration(slides)).rejects.toThrow(/Check GOOGLE_API_KEY/);
  });
});

describe('mock provider and unknown providers', () => {
  it('builds narration from slide text with no network call', async () => {
    vi.stubEnv('LLM_PROVIDER', 'mock');
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const out = await generateNarration(slides);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.narrations[0].narration).toMatch(/^Growth\. /);
    expect(out.provider).toBe('mock');
  });

  it('rejects an unknown provider', async () => {
    vi.stubEnv('LLM_PROVIDER', 'nope');
    await expect(generateNarration(slides)).rejects.toBeInstanceOf(NarrationError);
  });
});
