import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { stripThinkBlocks } from '../shared/strip-think.ts';

// Generic JSON extractor — wraps the "build ChatOpenAI → invoke → strip-think →
// JSON.parse → validate" skeleton that was duplicated in six places
// (memory-updater, acquired-extractor, dream, action-picker, proactive,
// inner-thought). Returns null on any failure (network / parse / validate).
//
// Caller supplies:
//   - `system`: the SystemMessage prompt content
//   - `user`: the HumanMessage prompt content (defaults to a stub)
//   - `validate`: structural check that returns T or null
//
// The helper handles:
//   - LLM construction (apiKey / baseURL / model / maxTokens)
//   - Single invoke
//   - <think> block stripping (reasoning-model output)
//   - JSON.parse with try/catch
//   - validate() narrowing
//   - Optional timeout via AbortSignal-style race

export interface JsonExtractorDeps {
  apiKey: string;
  baseURL?: string;
  model?: string;
  /** Token budget for the LLM response. Default 320. */
  maxTokens?: number;
}

export interface JsonExtractorOptions<T> {
  system: string;
  /** Default: '请输出'. The user message is mostly a no-op trigger. */
  user?: string;
  /** Validate parsed JSON; return T or null. Failure (return null) → null. */
  validate: (parsed: unknown) => T | null;
  /** Hard timeout in ms. Default 8000. */
  timeoutMs?: number;
  /** Per-call token budget override (else falls back to deps.maxTokens). */
  maxTokens?: number;
}

const DEFAULT_TIMEOUT_MS = 8000;

export async function runJsonExtractor<T>(
  deps: JsonExtractorDeps,
  opts: JsonExtractorOptions<T>,
): Promise<T | null> {
  const llm = new ChatOpenAI({
    apiKey: deps.apiKey,
    model: deps.model ?? 'gpt-4o-mini',
    streaming: false,
    maxTokens: opts.maxTokens ?? deps.maxTokens ?? 320,
    configuration: deps.baseURL ? { baseURL: deps.baseURL } : undefined,
  });

  const sys = new SystemMessage(opts.system);
  const usr = new HumanMessage(opts.user ?? '请输出');

  const work = (async (): Promise<T | null> => {
    try {
      const res = await llm.invoke([sys, usr]);
      const raw = stripThinkBlocks(((res?.content as string | undefined) ?? '').trim());
      const parsed = JSON.parse(raw) as unknown;
      return opts.validate(parsed);
    } catch {
      return null;
    }
  })();

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = new Promise<T | null>((r) => setTimeout(() => r(null), timeoutMs));
  return Promise.race([work, timeout]);
}

/**
 * Variant for one-line text outputs (no JSON parsing). Used by inner-thought
 * and contextual-phrase generators.
 */
export async function runTextExtractor(
  deps: JsonExtractorDeps,
  opts: { system: string; user?: string; maxLen?: number; timeoutMs?: number },
): Promise<string | null> {
  const llm = new ChatOpenAI({
    apiKey: deps.apiKey,
    model: deps.model ?? 'gpt-4o-mini',
    streaming: false,
    maxTokens: deps.maxTokens ?? 80,
    configuration: deps.baseURL ? { baseURL: deps.baseURL } : undefined,
  });

  const sys = new SystemMessage(opts.system);
  const usr = new HumanMessage(opts.user ?? '请输出');

  const work = (async (): Promise<string | null> => {
    try {
      const res = await llm.invoke([sys, usr]);
      const raw = stripThinkBlocks(((res?.content as string | undefined) ?? '').trim());
      const cleaned = raw.replace(/^["'「『]+|["'」』]+$/g, '').trim();
      if (!cleaned) return null;
      return opts.maxLen ? cleaned.slice(0, opts.maxLen) : cleaned;
    } catch {
      return null;
    }
  })();

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = new Promise<string | null>((r) => setTimeout(() => r(null), timeoutMs));
  return Promise.race([work, timeout]);
}
