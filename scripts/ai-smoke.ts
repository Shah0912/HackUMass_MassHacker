// Live check that a provider works:  npm run ai:smoke            (uses AI_PROVIDER / whichever key is set)
//                                    npm run ai:smoke -- claude
//                                    npm run ai:smoke -- gemini
//                                    npm run ai:smoke -- grok
// Reads keys from .env.local. Costs one tiny API call. Prints no keys.
import { z } from 'zod';
import { generateJson, getProvider, LlmError } from '../api/_lib/llm';

const which = process.argv[2];
const env = { ...process.env, ...(which ? { AI_PROVIDER: which } : {}) };

const Tasks = z.object({
  tasks: z.array(
    z.object({ title: z.string(), ownerName: z.string().nullable(), dependsOn: z.array(z.string()) }),
  ),
});

try {
  const provider = getProvider(env);
  console.log(`Calling ${provider.name} (${provider.model})...`);
  const r = await generateJson(Tasks, {
    provider,
    system: 'Extract tasks from the project text. Set ownerName only if the text names one; otherwise null.',
    user: '<project_text>Sam will design the DB schema. After that Priya builds the API. Someone needs to do the UI once the API is ready.</project_text>',
    maxOutputTokens: 2000,
    effort: 'low',
  });
  console.log(`OK in ${r.latencyMs} ms:\n${JSON.stringify(r.data, null, 2)}`);
} catch (err) {
  if (err instanceof LlmError) console.error(`FAILED ${err.code}: ${err.message}`);
  else console.error('FAILED', err);
  process.exit(1);
}
