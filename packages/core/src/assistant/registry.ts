import { StubAssistant } from './stub.js';
import { AnthropicAssistant } from './anthropic.js';
import type { AssistantProvider } from './types.js';

/**
 * Selects the assistant provider: Claude when ANTHROPIC_API_KEY is set, else a
 * deterministic stub so the feature works without live LLM access.
 */
export function getAssistant(): AssistantProvider {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      return new AnthropicAssistant(key);
    } catch {
      // Fall back to the stub if the SDK can't initialize.
    }
  }
  return new StubAssistant();
}
