import { runExtract } from '../src/ai/runExtract';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json(
      { ok: false, error: { code: 'INPUT_INVALID', message: 'POST only.', retryable: false } },
      { status: 405 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json(
      {
        ok: false,
        error: { code: 'INPUT_INVALID', message: 'Body must be JSON.', retryable: false },
      },
      { status: 400 },
    );
  }

  const { status, body } = await runExtract(rawBody, {
    mockAi: process.env.MOCK_AI === '1',
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  return Response.json(body, { status });
}
