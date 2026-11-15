// POST /api/extract — pasted notes → Project (tasks, members, open questions).
// Provider (Gemini/Claude) is chosen by env inside generateJson; this file never names one.
import { ExtractModelOutputSchema, ExtractRequestSchema, MAX_CHARS, type ExtractModelOutput } from '../src/ai/contracts';
import { buildExtractUserMessage, buildRepairMessage, buildSplitMessage, EXTRACT_SYSTEM_PROMPT, oversizedKeys, postProcessExtract } from './_lib/extract';
import { fail, failFromError, ok, readJson } from './_lib/http';
import { generateJson, LlmError } from './_lib/llm';
import { mockExtractOutput } from './_lib/mocks';

export async function POST(req: Request): Promise<Response> {
  const body = await readJson(req);
  if (body && typeof body === 'object' && typeof (body as { text?: unknown }).text === 'string' && (body as { text: string }).text.length > MAX_CHARS) {
    return fail('INPUT_TOO_LONG', `The text is over ${MAX_CHARS.toLocaleString('en-US')} characters. Shorten it and try again.`, false);
  }
  const parsed = ExtractRequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail('INPUT_INVALID', `The request was not valid: ${parsed.error.issues[0]?.message ?? 'unknown'}.`, false);
  }
  const input = parsed.data;
  const now = new Date();

  try {
    let output: ExtractModelOutput;
    if (process.env.MOCK_AI === '1') {
      await new Promise((r) => setTimeout(r, 1500));
      output = mockExtractOutput();
    } else {
      const user = buildExtractUserMessage(input, now);
      try {
        output = (await generateJson(ExtractModelOutputSchema, { system: EXTRACT_SYSTEM_PROMPT, user, maxOutputTokens: 16000, effort: 'medium' })).data;
      } catch (err) {
        // One repair retry that sends back the validation error; then give up.
        if (!(err instanceof LlmError) || err.code !== 'MODEL_INVALID_OUTPUT') throw err;
        console.warn(JSON.stringify({ endpoint: 'extract', repairRetry: true }));
        output = (
          await generateJson(ExtractModelOutputSchema, {
            system: EXTRACT_SYSTEM_PROMPT,
            user: buildRepairMessage(user, err.message),
            maxOutputTokens: 16000,
            effort: 'medium',
          })
        ).data;
      }
    }
    // Size rule: ask the model once to break down anything over the limit. If that call fails or
    // still leaves big tasks, post-processing splits them into chained parts.
    const big = oversizedKeys(output);
    if (big.length > 0 && process.env.MOCK_AI !== '1') {
      console.info(JSON.stringify({ endpoint: 'extract', splitRetry: big.length }));
      try {
        output = (
          await generateJson(ExtractModelOutputSchema, {
            system: EXTRACT_SYSTEM_PROMPT,
            user: buildSplitMessage(buildExtractUserMessage(input, now), output, big),
            maxOutputTokens: 16000,
            effort: 'medium',
          })
        ).data;
      } catch (err) {
        if (!(err instanceof LlmError) || !err.retryable) throw err;
        console.warn(JSON.stringify({ endpoint: 'extract', splitRetryFailed: err.code }));
      }
    }
    if (output.tasks.length === 0) {
      return fail('MODEL_INVALID_OUTPUT', "We couldn't find any tasks in this text. Add more detail or try the sample.", false);
    }
    const project = postProcessExtract(output, input, { id: crypto.randomUUID(), now });
    console.info(JSON.stringify({ endpoint: 'extract', tasks: project.tasks.length, members: project.members.length }));
    return ok(project);
  } catch (err) {
    return failFromError(err, 'extract');
  }
}
