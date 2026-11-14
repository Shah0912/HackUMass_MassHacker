// Deploy smoke test for serverless functions. Real endpoints: extract (T06), rescue (T16).
export default function handler(_req: Request): Response {
  return Response.json({ ok: true, data: { mockAi: process.env.MOCK_AI === '1' } });
}
