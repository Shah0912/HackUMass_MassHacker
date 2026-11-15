// Provider-neutral contract for one structured-output model call.
// Endpoints (extract, rescue) depend only on this file and ./index.ts, never on an SDK.

export type ProviderName = 'claude' | 'gemini' | 'grok';

export type LlmErrorCode =
  | 'MODEL_REFUSED'
  | 'MODEL_INVALID_OUTPUT'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'TIMEOUT'
  | 'AI_NOT_CONFIGURED';

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly retryable: boolean;

  constructor(code: LlmErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
    this.retryable = retryable;
  }
}

export interface JsonCallRequest {
  /** Fixed instructions. Never put pasted user text here. */
  system: string;
  /** Variable input; wrap untrusted text in tags such as <project_text>. */
  user: string;
  /** Plain JSON Schema, already made provider-safe by toProviderSchema. */
  schema: Record<string, unknown>;
  maxOutputTokens: number;
  /** Claude and Grok (reasoning effort); ignored by Gemini. */
  effort?: 'low' | 'medium' | 'high';
  signal: AbortSignal;
}

export interface JsonCallResult {
  /** Raw JSON text from the model; parsed and validated by generateJson. */
  text: string;
  provider: ProviderName;
  model: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

export interface LlmProvider {
  name: ProviderName;
  model: string;
  callJson(req: JsonCallRequest): Promise<JsonCallResult>;
}
